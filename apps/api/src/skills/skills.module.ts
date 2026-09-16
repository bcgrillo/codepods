import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillSourceEntity } from './skill-source.entity';
import { SkillEntity } from './skill.entity';
import { AgentSkillEntity } from './agent-skill.entity';
import { SkillsService } from './skills.service';
import { SkillsController } from './skills.controller';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SkillSourceEntity, SkillEntity, AgentSkillEntity]),
    ConfigModule,
  ],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}