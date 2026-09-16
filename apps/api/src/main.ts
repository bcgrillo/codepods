import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import type { Request } from 'express';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as path from 'node:path';
import type { Socket } from 'net';
import { AppModule } from './app.module';
import { ProxyService } from './proxy/proxy.service';
import { ConfigService } from './config/config.service';
import { ConsoleGateway } from './console/console.gateway';

async function bootstrap() {
  // umask 002: files created by the API process (uploads, git ops, AGENTS.md
  // copy) get mode 0664 instead of 0644. This ensures the ACL mask is rw-,
  // preserving the named-user ACL entry (agent UID) write access.
  process.umask(0o002);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: configService.get('corsOrigin'),
    credentials: true,
  });

  // Parse JSON bodies for all routes EXCEPT AI proxy routes — those forward
  // the raw request body untouched (no size limit, no parsing). The proxy
  // service reads the raw stream directly via readBody().
  const jsonParser = express.json({ limit: '10mb' });
  app.use((req: Request, res: express.Response, next: express.NextFunction) => {
    if (req.url?.startsWith('/api/ai-proxy/')) return next();
    return jsonParser(req, res, next);
  });

  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );

  if (configService.get('swaggerEnabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CodePods API')
      .setDescription('REST API documentation for CodePods.')
      .setVersion('0.1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'admin-token',
          description:
            'Admin bearer token obtained from POST /api/auth/setup or POST /api/auth/login.',
        },
        'admin-auth',
      )
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    // Require the admin bearer token globally so the Swagger UI shows the
    // Authorize button and sends it on all calls (matches the global AuthGuard).
    swaggerDocument.security = [{ 'admin-auth': [] }];
    SwaggerModule.setup('api/docs', app, swaggerDocument, {
      customSiteTitle: 'CodePods API Docs',
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  // SPA fallback: serve index.html for any non-API GET request.
  // Registered BEFORE app.listen() so it runs before NestJS's router
  // (otherwise NestJS returns 404 for non-API routes before we can serve the SPA).
  // Only active when the frontend build exists (production / preview).
  const webDist = path.resolve(__dirname, '..', '..', 'web', 'dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    const expressInstance = app.getHttpAdapter().getInstance() as express.Express;
    expressInstance.use((req: Request, res: express.Response, next: express.NextFunction) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/socket.io')) {
        return next();
      }
      const filePath = path.join(webDist, req.url.split('?')[0]);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return res.sendFile(filePath);
      }
      return res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  const port = configService.get('port');
  const bindHost = process.env.CODEPODS_BIND_HOST ?? '0.0.0.0';

  // Wire WebSocket upgrade handler on whatever server(s) we end up using.
  const proxyService = app.get(ProxyService);
  const wireUpgrade = (server: import('net').Server) => {
    server.on('upgrade', (req: Request, socket: Socket, head: Buffer) => {
      if (req.url?.startsWith('/api/proxy/')) {
        proxyService.proxyUpgrade(req, socket, head).catch((err) => {
          console.error('Proxy upgrade error:', err);
          socket.destroy();
        });
      }
    });
  };

  // Native TLS support: when enabled, serve HTTPS on tlsPort (default 3443)
  // in addition to the regular HTTP port. Both servers share the same Nest
  // Express instance. If cert/key files are missing/invalid we log an error
  // and serve only HTTP.
  let tlsStarted = false;
  if (configService.get('tlsEnabled')) {
    const certPath = configService.get('tlsCertPath');
    const keyPath = configService.get('tlsKeyPath');
    if (!certPath || !keyPath) {
      console.error(
        '[TLS] tlsEnabled is true but tlsCertPath/tlsKeyPath are not set. Serving HTTP only.',
      );
    } else if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      console.error(
        `[TLS] Certificate or key file not found (cert: ${certPath}, key: ${keyPath}). Serving HTTP only.`,
      );
    } else {
      try {
        const tlsPort = configService.get('tlsPort');
        const httpsOptions = {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
        };
        const expressInstance = app.getHttpAdapter().getInstance() as express.Express;
        const httpsServer = https.createServer(httpsOptions, expressInstance);
        await app.init();
        // Socket.IO binds to the NestJS internal HTTP server, which is never
        // listened on here. Attach the same Socket.IO server to the HTTPS
        // server so the console works over TLS.
        app.get(ConsoleGateway).server.server.attach(httpsServer);
        await httpsServer.listen(tlsPort, bindHost);
        wireUpgrade(httpsServer);
        tlsStarted = true;
        console.log(`CodePods HTTPS running on https://localhost:${tlsPort}`);
      } catch (err) {
        console.error('[TLS] Failed to start HTTPS server. Serving HTTP only.', err);
      }
    }
  }

  // Always start the HTTP server (for Docker internal traffic, SSH tunnels, etc.)
  if (tlsStarted) {
    // app.init() was already called above; just listen on the HTTP port.
    const httpServer = app.getHttpServer();
    // The HTTP server was not started by app.init() — we need to listen manually.
    const expressInstance = app.getHttpAdapter().getInstance() as express.Express;
    const http = await import('node:http');
    const httpOnlyServer = http.createServer(expressInstance);
    // Attach the same Socket.IO server to the HTTP-only server too.
    app.get(ConsoleGateway).server.server.attach(httpOnlyServer);
    await new Promise<void>((resolve) => httpOnlyServer.listen(port, bindHost, resolve));
    wireUpgrade(httpOnlyServer);
    console.log(`CodePods HTTP running on http://localhost:${port}`);
  } else {
    await app.listen(port, bindHost);
    const httpServer = app.getHttpServer();
    wireUpgrade(httpServer);
    console.log(`CodePods running on http://localhost:${port}`);
  }
}

bootstrap();
