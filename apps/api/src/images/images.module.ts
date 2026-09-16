import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageTemplateEntity } from './image-template.entity';
import { ImagesService } from './images.service';
import { ImagesController } from './images.controller';
import { ImageTemplateInspectorService } from './image-template-inspector.service';
import { DockerModule } from '../docker/docker.module';

@Module({
  imports: [TypeOrmModule.forFeature([ImageTemplateEntity]), DockerModule],
  controllers: [ImagesController],
  providers: [ImagesService, ImageTemplateInspectorService],
  exports: [ImagesService],
})
export class ImagesModule {}
