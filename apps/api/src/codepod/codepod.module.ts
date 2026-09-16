import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodepodEntity } from './codepod.entity';
import { CodepodService } from './codepod.service';

@Module({
  imports: [TypeOrmModule.forFeature([CodepodEntity])],
  providers: [CodepodService],
  exports: [CodepodService],
})
export class CodepodModule {}
