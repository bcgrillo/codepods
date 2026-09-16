import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import * as path from 'path';
import { loadConfigSync } from './config/config.util';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { DockerModule } from './docker/docker.module';
import { CodepodModule } from './codepod/codepod.module';
import { AgentsModule } from './agents/agents.module';
import { ImagesModule } from './images/images.module';
import { SetupModule } from './setup/setup.module';
import { ConsoleModule } from './console/console.module';
import { ProxyModule } from './proxy/proxy.module';
import { AiProxyModule } from './ai-proxy/ai-proxy.module';
import { SecretsModule } from './secrets/secrets.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { GitProxyModule } from './git-proxy/git-proxy.module';
import { McpModule } from './mcp/mcp.module';
import { McpServersModule } from './mcp-servers/mcp-servers.module';
import { AgentsMdModule } from './agents-md/agents-md.module';
import { CentralReposModule } from './central-repos/central-repos.module';
import { EgressProxyModule } from './egress-proxy/egress-proxy.module';
import { CredentialsModule } from './credentials/credentials.module';
import { SkillsModule } from './skills/skills.module';
import { ManagedApisModule } from './managed-apis/managed-apis.module';
import { SystemModule } from './system/system.module';

const config = loadConfigSync();

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: path.join(config.dataDir, 'codepods.db'),
      entities: [__dirname + '/**/*.entity.{ts,js}'],
      synchronize: true,
    }),
    DockerModule,
    CodepodModule,
    AgentsModule,
    ImagesModule,
    SetupModule,
    ConsoleModule,
    ProxyModule,
    AiProxyModule,
    SecretsModule,
    WorkspacesModule,
    GitProxyModule,
    McpModule,
    McpServersModule,
    AgentsMdModule,
    CentralReposModule,
    EgressProxyModule,
    CredentialsModule,
    SkillsModule,
    ManagedApisModule,
    SystemModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
