import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '../config/config.service';

/**
 * Holds the internal trust token used as the HMAC shared secret between the
 * egress proxy and the auth guard (ADR-036).
 *
 * The token is generated on first use and stored in `dataDir/.internal-token`
 * (outside the database, restrictive permissions). It never leaves the host
 * process — it is not injected into containers. The egress proxy signs
 * `X-Agent-Id` with `HMAC-SHA256(agentId, token)`, and the auth guard
 * verifies the signature.
 */
@Injectable()
export class InternalTokenService {
  private token: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  getToken(): string {
    if (this.token) return this.token;
    const file = path.join(this.configService.get('dataDir'), '.internal-token');
    if (fs.existsSync(file)) {
      this.token = fs.readFileSync(file, 'utf8').trim();
    } else {
      this.token = crypto.randomBytes(32).toString('hex');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, this.token, { mode: 0o600 });
    }
    return this.token;
  }
}
