import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { IS_PUBLIC_KEY } from './public.decorator';
import { IS_AGENT_ALLOWED_KEY } from './agent-allowed.decorator';
import { AuthService } from './auth.service';
import { AUTH_COOKIE } from './auth.controller';
import { ConfigService } from '../config/config.service';
import { InternalTokenService } from './internal-token.service';

/**
 * Global auth guard. Protects every route unless:
 *   - the route is marked @Public() (e.g. auth login), or
 *   - it is a CORS preflight (OPTIONS) request, or
 *   - it arrives from 127.0.0.1 with valid X-Agent-Id + X-Agent-Sig (egress
 *     proxy — agent identity injected based on container source IP, ADR-036), or
 *   - it carries a valid admin bearer token or auth cookie, or
 *   - it is a Swagger UI path AND swaggerEnabled is true (default off).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly internalTokenService: InternalTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    if (request.method === 'OPTIONS') return true;

    // Swagger UI + its JSON/assets are public so the docs can be opened to
    // log in and obtain a token. The actual API endpoints remain protected.
    // Only bypassed when Swagger is enabled (configurable, default off).
    if (
      this.configService.get('swaggerEnabled') &&
      request.url?.startsWith('/api/docs')
    ) {
      return true;
    }

    // Try bearer token first. Even on the local port bypass below, we want
    // req.user to be set so authenticated endpoints (e.g. /auth/devices) work.
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length).trim();
      const user = await this.authService.validateToken(token);
      if (user) {
        request.user = user;
        return true;
      }
    }

    // Fallback: the admin auth cookie (HttpOnly). Needed for requests that
    // cannot attach a Bearer header, e.g. the agent-service proxy iframe.
    const cookieToken = getCookieToken(request);
    if (cookieToken) {
      const user = await this.authService.validateToken(cookieToken);
      if (user) {
        request.user = user;
        return true;
      }
    }

    // Egress proxy: requests from 127.0.0.1 carrying X-Agent-Id + X-Agent-Sig
    // are trusted as agent identity. The proxy injects these headers based on
    // the container's source IP (non-falsifiable without CAP_NET_RAW — ADR-036).
    // HMAC on X-Agent-Id is defense in depth against source IP check bugs.
    const sourceIp = request.socket?.remoteAddress?.replace(/^::ffff:/, '') ?? '';
    const agentId = request.headers['x-agent-id'];
    const agentSig = request.headers['x-agent-sig'];
    if (sourceIp === '127.0.0.1' && agentId && agentSig) {
      const agentIdStr = Array.isArray(agentId) ? agentId[0] : agentId;
      const agentSigStr = Array.isArray(agentSig) ? agentSig[0] : agentSig;
      const expectedSig = crypto
        .createHmac('sha256', this.internalTokenService.getToken())
        .update(agentIdStr)
        .digest('hex');
      const a = Buffer.from(agentSigStr);
      const b = Buffer.from(expectedSig);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        request.agentId = agentIdStr;
        // Agent is authenticated — now check route authorization.
        // Only routes explicitly marked with @AgentAllowed() are accessible
        // to agent requests; all others return 403 Forbidden.
        const isAgentAllowed = this.reflector.getAllAndOverride<boolean>(
          IS_AGENT_ALLOWED_KEY,
          [context.getHandler(), context.getClass()],
        );
        if (!isAgentAllowed) {
          throw new ForbiddenException(
            'Agent is not authorized to access this endpoint.',
          );
        }
        return true;
      }
    }

    throw new UnauthorizedException(
      'Authentication required. Provide a valid admin token or an internal trust header.',
    );
  }
}

/** Extracts the admin auth cookie value from a request, if present. */
function getCookieToken(request: {
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const header = request.headers.cookie;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === AUTH_COOKIE) {
      const value = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}
