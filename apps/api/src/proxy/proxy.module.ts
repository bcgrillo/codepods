import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

@Module({
  imports: [AgentsModule],
  controllers: [ProxyController],
  providers: [ProxyService],
})
export class ProxyModule {}
