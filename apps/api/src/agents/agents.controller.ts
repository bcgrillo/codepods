import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Patch,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AgentsService } from './agents.service';
import { AgentRequestsService } from './agent-requests.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { RenameAgentDto } from './dto/rename-agent.dto';
import { CreateAgentServiceDto, UpdateAgentServiceDto } from './dto/agent-service.dto';
import { UpdateAgentEnvVarsDto, ExecuteAgentCommandDto, UpdateCreationLogDto, ReorderDto } from '@codepods/shared-types';

@ApiTags('Agents')
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly agentRequestsService: AgentRequestsService,
  ) {}

  @Get()
  findAll() {
    return this.agentsService.findAll();
  }

  @Post('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(@Body() dto: ReorderDto) {
    return this.agentsService.reorder(dto.ids as string[]);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.agentsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAgentDto) {
    return this.agentsService.create(dto);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.NO_CONTENT)
  start(@Param('id') id: string) {
    return this.agentsService.start(id);
  }

  @Post(':id/stop')
  @HttpCode(HttpStatus.NO_CONTENT)
  stop(@Param('id') id: string) {
    return this.agentsService.stop(id);
  }

  @Post(':id/restart')
  restart(@Param('id') id: string) {
    return this.agentsService.restart(id);
  }

  @Post(':id/recreate')
  recreate(@Param('id') id: string) {
    return this.agentsService.recreate(id);
  }

  @Patch(':id/rename')
  rename(@Param('id') id: string, @Body() dto: RenameAgentDto) {
    return this.agentsService.rename(id, dto.name);
  }

  @Patch(':id/env-vars')
  updateEnvVars(@Param('id') id: string, @Body() dto: UpdateAgentEnvVarsDto) {
    return this.agentsService.updateEnvVars(id, dto);
  }

  @Post(':id/execute-command')
  executeCommand(@Param('id') id: string, @Body() dto: ExecuteAgentCommandDto) {
    return this.agentsService.executeCommand(id, dto);
  }

  @Get(':id/container-env')
  getContainerEnvVars(@Param('id') id: string) {
    return this.agentsService.getContainerEnvVars(id);
  }

  @Get(':id/container-logs')
  async getContainerLogs(@Param('id') id: string, @Query('tail') tail?: string) {
    const parsed = tail ? parseInt(tail, 10) : 500;
    const logs = await this.agentsService.getContainerLogs(id, Number.isNaN(parsed) ? 500 : parsed);
    return { logs };
  }

  @Patch(':id/creation-log')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateCreationLog(@Param('id') id: string, @Body() dto: UpdateCreationLogDto) {
    return this.agentsService.updateCreationLog(id, dto.creationLog);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Query('deleteWorkspace') deleteWorkspace?: string) {
    return this.agentsService.remove(id, deleteWorkspace === 'true');
  }

  @Get(':id/services')
  listServices(@Param('id') id: string) {
    return this.agentsService.listServices(id);
  }

  @Post(':id/services')
  createService(@Param('id') id: string, @Body() dto: CreateAgentServiceDto) {
    return this.agentsService.createService(id, dto);
  }

  @Patch(':id/services/:serviceId')
  updateService(
    @Param('id') id: string,
    @Param('serviceId', ParseIntPipe) serviceId: number,
    @Body() dto: UpdateAgentServiceDto,
  ) {
    return this.agentsService.updateService(id, serviceId, dto);
  }

  @Delete(':id/services/:serviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeService(
    @Param('id') id: string,
    @Param('serviceId', ParseIntPipe) serviceId: number,
  ) {
    return this.agentsService.removeService(id, serviceId);
  }

  // ---- Per-agent MCP management ----

  @Get(':id/mcps')
  listAgentMcps(@Param('id') id: string) {
    return this.agentsService.listAgentMcps(id);
  }

  @Post(':id/mcps/:mcpServerId')
  connectMcp(
    @Param('id') id: string,
    @Param('mcpServerId', ParseIntPipe) mcpServerId: number,
  ) {
    return this.agentsService.connectMcp(id, mcpServerId);
  }

  @Delete(':id/mcps/:mcpServerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnectMcp(
    @Param('id') id: string,
    @Param('mcpServerId', ParseIntPipe) mcpServerId: number,
  ) {
    return this.agentsService.disconnectMcp(id, mcpServerId);
  }

  @Post(':id/mcps/sync')
  syncAgentMcps(@Param('id') id: string) {
    return this.agentsService.syncAgentMcps(id);
  }

  // ---- Per-agent Skills management ----

  @Get(':id/skills')
  listAgentSkills(@Param('id') id: string) {
    return this.agentsService.listAgentSkills(id);
  }

  @Post(':id/skills/:skillId')
  connectSkill(
    @Param('id') id: string,
    @Param('skillId', ParseIntPipe) skillId: number,
  ) {
    return this.agentsService.connectSkill(id, skillId);
  }

  @Delete(':id/skills/:skillId')
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnectSkill(
    @Param('id') id: string,
    @Param('skillId', ParseIntPipe) skillId: number,
  ) {
    return this.agentsService.disconnectSkill(id, skillId);
  }

  @Post(':id/skills/sync')
  syncAgentSkills(@Param('id') id: string) {
    return this.agentsService.syncAgentSkills(id);
  }

  // ---- Notices ----

  @Get(':id/notices')
  listNotices(@Param('id') id: string) {
    return this.agentsService.listNotices(id);
  }

  @Post(':id/notices/:noticeId/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  dismissNotice(
    @Param('id') id: string,
    @Param('noticeId', ParseIntPipe) noticeId: number,
  ) {
    return this.agentsService.dismissNotice(id, noticeId);
  }

  // ---- Requests (human-in-the-loop approval) ----

  @Get(':id/requests')
  listRequests(@Param('id') id: string) {
    return this.agentRequestsService.list(id);
  }

  @Post(':id/requests/:requestId/approve')
  approveRequest(
    @Param('id') id: string,
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() body?: { durationMinutes?: number },
  ) {
    return this.agentRequestsService.approve(id, requestId, body?.durationMinutes);
  }

  @Post(':id/requests/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  rejectRequest(
    @Param('id') id: string,
    @Param('requestId', ParseIntPipe) requestId: number,
  ) {
    return this.agentRequestsService.reject(id, requestId);
  }
}
