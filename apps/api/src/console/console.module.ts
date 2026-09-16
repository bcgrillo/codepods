import { Module } from '@nestjs/common';
import { ConsoleGateway } from './console.gateway';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [AgentsModule],
  providers: [ConsoleGateway],
})
export class ConsoleModule {}
