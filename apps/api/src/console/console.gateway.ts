import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Namespace, Socket } from 'socket.io';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import { AgentsService } from '../agents/agents.service';
import { AuthService } from '../auth/auth.service';
import { AUTH_COOKIE, getCookieValue } from '../auth/auth.controller';
import { loadConfigSync } from '../config/config.util';

const corsConfig = loadConfigSync();

@WebSocketGateway({
  namespace: '/console',
  cors: { origin: corsConfig.corsOrigin, credentials: true },
})
export class ConsoleGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ConsoleGateway.name);
  private readonly ptys = new Map<string, IPty>();
  private readonly pendingResize = new Map<string, { cols: number; rows: number }>();

  // Exposes the Socket.IO namespace for this gateway. The parent Server
  // (namespace.server) is used by the bootstrap to attach Socket.IO to
  // additional HTTP/HTTPS servers when native TLS is enabled (the NestJS
  // internal server that Socket.IO binds to is never listened on in that case).
  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly agentsService: AgentsService,
    private readonly authService: AuthService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    // Verify admin auth via the codepods_token cookie (HttpOnly, sent
    // automatically by the browser when withCredentials is true).
    const cookieHeader = client.handshake.headers.cookie;
    const cookieToken = getCookieValue(
      { headers: { cookie: cookieHeader } },
      AUTH_COOKIE,
    );
    if (!cookieToken) {
      client.emit('error', 'Authentication required');
      client.disconnect();
      return;
    }
    const user = await this.authService.validateToken(cookieToken);
    if (!user) {
      client.emit('error', 'Invalid or expired session');
      client.disconnect();
      return;
    }

    const agentId = client.handshake.query['agentId'] as string | undefined;

    if (!agentId) {
      client.emit('error', 'agentId query parameter is required');
      client.disconnect();
      return;
    }

    this.logger.log(`Console connect: ${client.id} → agent ${agentId}`);

    try {
      // Resolve the agent's current containerId from the database,
      // since restart creates a new container with a different ID.
      const containerId = await this.agentsService.getContainerId(agentId);
      const execCtx = await this.agentsService.getExecContext(agentId);

      // Use node-pty to spawn `docker exec -it` with a proper PTY on the host.
      // This avoids the raw TCP socket issues of dockerode's hijack mode and
      // gives us clean terminal I/O with correct escape sequence handling.
      const args = [
        'exec', '-it',
        '-e', `HOME=${execCtx.homeMountPath}`,
        '-e', 'TERM=xterm-256color',
      ];
      if (execCtx.user) {
        args.push('--user', execCtx.user);
      }
      args.push(
        containerId,
        '/bin/sh', '-c',
        'command -v bash > /dev/null 2>&1 && exec bash || exec sh',
      );

      const ptyProcess = pty.spawn('docker', args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
      });

      this.ptys.set(client.id, ptyProcess);

      // Apply any pending resize that arrived before the PTY was ready
      const pending = this.pendingResize.get(client.id);
      if (pending) {
        this.pendingResize.delete(client.id);
        ptyProcess.resize(pending.cols, pending.rows);
      }

      let hasOutput = false;

      ptyProcess.onData((data: string) => {
        hasOutput = true;
        client.emit('output', data);
      });

      ptyProcess.onExit(({ exitCode }) => {
        if (!hasOutput) {
          client.emit('error', `Process exited immediately (code ${exitCode}). Container may not be running.`);
        }
        client.emit('disconnect_reason', 'process_exited');
        client.disconnect();
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to open terminal';
      this.logger.error(`Console open failed for agent ${agentId}: ${message}`);
      client.emit('error', message);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    const ptyProcess = this.ptys.get(client.id);
    if (ptyProcess) {
      try { ptyProcess.kill(); } catch { /* already exited */ }
      this.ptys.delete(client.id);
    }
    this.pendingResize.delete(client.id);
    this.logger.log(`Console disconnect: ${client.id}`);
  }

  @SubscribeMessage('input')
  handleInput(@MessageBody() data: string, @ConnectedSocket() client: Socket): void {
    this.ptys.get(client.id)?.write(data);
  }

  @SubscribeMessage('resize')
  handleResize(
    @MessageBody() data: { cols: number; rows: number },
    @ConnectedSocket() client: Socket,
  ): void {
    const ptyProcess = this.ptys.get(client.id);
    if (!ptyProcess) {
      // PTY not ready yet — buffer the resize for when it starts
      this.pendingResize.set(client.id, { cols: data.cols, rows: data.rows });
      return;
    }
    try {
      ptyProcess.resize(data.cols, data.rows);
    } catch {
      // Resize is best-effort; silently ignore errors
    }
  }
}
