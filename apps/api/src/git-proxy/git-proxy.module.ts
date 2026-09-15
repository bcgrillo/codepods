import { Module } from '@nestjs/common';
import { GitProxyController } from './git-proxy.controller';
import { GitProxyService } from './git-proxy.service';
import { AgentsModule } from '../agents/agents.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [AgentsModule, WorkspacesModule],
  controllers: [GitProxyController],
  providers: [GitProxyService],
})
export class GitProxyModule {}