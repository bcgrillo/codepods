import {
  All,
  Controller,
  Next,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { ProxyService } from './proxy.service';

@ApiExcludeController()
@Controller('proxy')
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @All(':agentName/:serviceName*')
  async proxy(
    @Param('agentName') _agentName: string,
    @Param('serviceName') _serviceName: string,
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    await this.proxyService.proxyRequest(req, res, next);
  }
}
