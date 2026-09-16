import { Module, Global } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { CryptoService } from './crypto.service';

@Global()
@Module({
  providers: [
    {
      provide: CryptoService,
      useFactory: (config: ConfigService) => {
        const dataDir = config.get('dataDir');
        return new CryptoService(`${dataDir}/keys/master.key`);
      },
      inject: [ConfigService],
    },
  ],
  exports: [CryptoService],
})
export class SecretsModule {}