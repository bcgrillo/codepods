import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsMdEntity } from './agents-md.entity';
import { AgentsMdService } from './agents-md.service';
import { AgentsMdController } from './agents-md.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AgentsMdEntity])],
  providers: [AgentsMdService],
  controllers: [AgentsMdController],
  exports: [AgentsMdService],
})
export class AgentsMdModule implements OnModuleInit {
  constructor(private readonly agentsMdService: AgentsMdService) {}

  async onModuleInit(): Promise<void> {
    await this.agentsMdService.seedIfEmpty();
  }
}