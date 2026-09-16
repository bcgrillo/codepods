import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './user.entity';
import { DeviceEntity } from './device.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DeviceService } from './device.service';
import { InternalTokenService } from './internal-token.service';
import { AuthGuard } from './auth.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, DeviceEntity])],
  controllers: [AuthController],
  providers: [AuthService, DeviceService, InternalTokenService, AuthGuard],
  exports: [AuthService, DeviceService, InternalTokenService, AuthGuard],
})
export class AuthModule {}
