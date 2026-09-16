import { Controller, Post, Get, Body, HttpCode, HttpStatus, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GitProxyService, GitExecuteRequest } from './git-proxy.service';
import { AgentAllowed } from '../auth/agent-allowed.decorator';

@ApiTags('Git Proxy')
@Controller('git')
export class GitProxyController {
  constructor(private readonly gitProxyService: GitProxyService) {}

  @Post('execute')
  @AgentAllowed()
  @HttpCode(HttpStatus.OK)
  execute(@Body() req: GitExecuteRequest) {
    return this.gitProxyService.execute(req);
  }

  /**
   * Authenticated via the egress proxy (X-Agent-Id + X-Agent-Sig, ADR-036).
   * Agent containers download the shim through the proxy, which injects
   * identity headers based on the container's source IP.
   */
  @Get('shim')
  @AgentAllowed()
  @Header('Content-Type', 'application/x-sh')
  getShim() {
    return this.gitProxyService.getShimScript();
  }
}