import { Module } from '@nestjs/common';
import { GithubAdapter } from './github.adapter';
import { GitProvidersService } from './git-providers.service';

@Module({
  providers: [GithubAdapter, GitProvidersService],
  exports: [GitProvidersService],
})
export class GitProvidersModule {}