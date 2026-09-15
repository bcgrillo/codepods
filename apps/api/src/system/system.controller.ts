import { Controller, Delete, Get, Query } from '@nestjs/common';
import { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('stats')
  getSystemStats() {
    return this.system.getSystemStats();
  }

  @Get('agents-stats')
  getAgentStats(@Query('includeNonCodepods') includeNonCodepods?: string) {
    return this.system.getAgentStats(includeNonCodepods === 'true');
  }

  @Get('non-codepods-containers')
  getNonCodepodsContainers() {
    return this.system.getNonCodepodsContainers();
  }

  @Get('cleanup-check')
  getCleanupCheck() {
    return this.system.getCleanupCheck();
  }

  @Delete('docker-image')
  removeDockerImage(@Query('ref') ref: string) {
    return this.system.removeDockerImage(ref);
  }

  @Delete('orphaned-home')
  removeOrphanedHome(@Query('agentId') agentId: string) {
    return this.system.removeOrphanedHome(agentId);
  }
}