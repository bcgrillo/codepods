import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiProviderEntity } from './ai-provider.entity';
import { AiModelEntity } from './ai-model.entity';
import { AiProvidersController } from './ai-providers.controller';
import { AiProvidersService } from './ai-providers.service';
import { AiProxyService } from './ai-proxy.service';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [TypeOrmModule.forFeature([AiProviderEntity, AiModelEntity]), CredentialsModule],
  controllers: [AiProvidersController],
  providers: [AiProvidersService, AiProxyService],
  exports: [AiProvidersService, AiProxyService],
})
export class AiProxyModule {}