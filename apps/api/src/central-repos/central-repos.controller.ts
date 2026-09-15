import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CentralReposService } from './central-repos.service';

@ApiTags('Central Repositories')
@Controller('central-repos')
export class CentralReposController {
  constructor(private readonly centralReposService: CentralReposService) {}

  @Get('templates')
  discoverTemplates() {
    return this.centralReposService.discoverTemplates();
  }

  @Get('providers')
  discoverProviders() {
    return this.centralReposService.discoverProviders();
  }

  /**
   * Serves a cached file (e.g. icon) from a discovered repo folder.
   * Authenticated via the HttpOnly codepods_token cookie, which the browser
   * sends automatically with same-origin <img> requests.
   */
  @Get('repo-file/:kind/:repoPath/:file')
  repoFile(
    @Param('kind') kind: string,
    @Param('repoPath') repoPath: string,
    @Param('file') file: string,
    @Res() res: Response,
    @Query('index') index?: string,
  ) {
    return this.centralReposService.repoFile(kind, repoPath, file, index, res);
  }
}
