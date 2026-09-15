import { Controller, Get, Patch, Post, Body } from '@nestjs/common';
import { ConfigService } from './config.service';
import { EgressProxyService } from '../egress-proxy/egress-proxy.service';
import type { CodepodsConfig } from './config.util';

@Controller('config')
export class ConfigController {
  constructor(
    private readonly configService: ConfigService,
    private readonly egressProxy: EgressProxyService,
  ) {}

  @Get()
  getConfig(): CodepodsConfig {
    return this.configService.getAll();
  }

  @Patch()
  updateConfig(@Body() body: Partial<CodepodsConfig>): CodepodsConfig {
    const updated = this.configService.update(body);
    // Restart the egress proxy so port/enable/whitelist changes take effect.
    this.egressProxy.reload();
    return updated;
  }

  @Post('reload')
  reload(): CodepodsConfig {
    const reloaded = this.configService.reload();
    this.egressProxy.reload();
    return reloaded;
  }
}