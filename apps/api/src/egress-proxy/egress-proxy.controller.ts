import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { EgressProxyService } from './egress-proxy.service';
import type { TempException, CreateTempExceptionDto } from '@codepods/shared-types';

@Controller('egress')
export class EgressProxyController {
  constructor(private readonly egressProxy: EgressProxyService) {}

  @Get('temp-exceptions')
  listTempExceptions(): TempException[] {
    return this.egressProxy.listTempExceptions().map((e) => ({
      host: e.host,
      expiresAt: new Date(e.expiresAt).toISOString(),
      agentId: e.agentId,
    }));
  }

  @Post('temp-exception')
  @HttpCode(201)
  createTempException(@Body() body: CreateTempExceptionDto): TempException {
    if (!body.host) throw new Error('Host is required');
    const minutes = body.durationMinutes && body.durationMinutes > 0 ? body.durationMinutes : 5;
    this.egressProxy.addTempException(body.host, minutes * 60 * 1000, 'manual');
    const entries = this.egressProxy.listTempExceptions().filter((e) => e.host === body.host.toLowerCase());
    const entry = entries[0];
    return { host: entry.host, expiresAt: new Date(entry.expiresAt).toISOString(), agentId: entry.agentId };
  }

  @Delete('temp-exception/:host')
  @HttpCode(204)
  revokeTempException(@Param('host') host: string): void {
    this.egressProxy.removeTempException(host);
  }
}