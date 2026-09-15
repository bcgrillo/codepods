import { Module } from '@nestjs/common';
import { HomesService } from './homes.service';

@Module({
  providers: [HomesService],
  exports: [HomesService],
})
export class HomesModule {}