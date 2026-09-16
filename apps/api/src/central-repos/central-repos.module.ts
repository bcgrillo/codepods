import { Module } from '@nestjs/common';
import { CentralReposController } from './central-repos.controller';
import { CentralReposService } from './central-repos.service';

@Module({
  controllers: [CentralReposController],
  providers: [CentralReposService],
  exports: [CentralReposService],
})
export class CentralReposModule {}
