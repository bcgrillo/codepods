import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentEntity } from './agent.entity';
import { AgentServiceEntity } from './agent-service.entity';
import { AgentNoticeEntity } from './agent-notice.entity';
import { AgentRequestEntity } from './agent-request.entity';
import { ImageTemplateEntity } from '../images/image-template.entity';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentRequestsService } from './agent-requests.service';
import { ImagesModule } from '../images/images.module';
import { AiProxyModule } from '../ai-proxy/ai-proxy.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { HomesModule } from '../homes/homes.module';
import { McpServersModule } from '../mcp-servers/mcp-servers.module';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentEntity, AgentServiceEntity, AgentNoticeEntity, AgentRequestEntity, ImageTemplateEntity]),
    ImagesModule,
    AiProxyModule,
    WorkspacesModule,
    HomesModule,
    McpServersModule,
    SkillsModule,
  ],
  controllers: [AgentsController],
  providers: [AgentsService, AgentRequestsService],
  exports: [AgentsService, AgentRequestsService],
})
export class AgentsModule {}
