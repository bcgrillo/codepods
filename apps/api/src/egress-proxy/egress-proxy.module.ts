import { Global, Module } from '@nestjs/common';
import { EgressProxyService } from './egress-proxy.service';
import { EgressProxyController } from './egress-proxy.controller';

// ConfigService is provided globally by ConfigModule (@Global), so we don't
// need to import it here. Making this module @Global lets ConfigController
// inject EgressProxyService to trigger a proxy reload on config changes.
@Global()
@Module({
  providers: [EgressProxyService],
  controllers: [EgressProxyController],
  exports: [EgressProxyService],
})
export class EgressProxyModule {}