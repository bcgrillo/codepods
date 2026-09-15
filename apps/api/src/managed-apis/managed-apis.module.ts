import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagedApiEntity } from './managed-api.entity';
import { ManagedApisService } from './managed-apis.service';
import { ManagedApisController } from './managed-apis.controller';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [TypeOrmModule.forFeature([ManagedApiEntity]), CredentialsModule],
  providers: [ManagedApisService],
  controllers: [ManagedApisController],
  exports: [ManagedApisService],
})
export class ManagedApisModule {}