import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AgentsMdService } from './agents-md.service';
import type { CreateAgentsMdDto, UpdateAgentsMdDto } from '@codepods/shared-types';

@ApiTags('AgentsMd')
@Controller('agents-md')
export class AgentsMdController {
  constructor(private readonly service: AgentsMdService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('default')
  getDefault() {
    return this.service.getDefault();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(@Body() dto: CreateAgentsMdDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAgentsMdDto) {
    return this.service.update(Number(id), dto);
  }

  @Post(':id/set-default')
  @HttpCode(HttpStatus.NO_CONTENT)
  setDefault(@Param('id') id: string) {
    return this.service.setDefault(Number(id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }
}