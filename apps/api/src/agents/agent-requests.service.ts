import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  AgentRequest,
  AgentRequestType,
  AgentRequestStatus,
  AgentRequestPayload,
} from '@codepods/shared-types';
import { AgentRequestEntity } from './agent-request.entity';
import { EgressProxyService } from '../egress-proxy/egress-proxy.service';
import { ConfigService } from '../config/config.service';

/** Resolve an in-flight request. */
interface Waiter {
  resolve: (status: AgentRequestStatus) => void;
  timer: NodeJS.Timeout;
}

@Injectable()
export class AgentRequestsService {
  private readonly logger = new Logger(AgentRequestsService.name);
  private readonly waiters = new Map<number, Waiter>();

  constructor(
    @InjectRepository(AgentRequestEntity)
    private readonly repo: Repository<AgentRequestEntity>,
    private readonly egressProxy: EgressProxyService,
    private readonly configService: ConfigService,
  ) {}

  /** Create a new request from an agent. */
  async create(
    agentId: string,
    type: AgentRequestType,
    payload: AgentRequestPayload,
    reason: string,
  ): Promise<AgentRequest> {
    const entity = this.repo.create({
      agentId,
      type,
      status: 'pending',
      payload,
      reason: reason || '',
    });
    await this.repo.save(entity);
    this.logger.log(`Request #${entity.id} created by agent "${agentId}" (${type})`);
    return this.toDto(entity);
  }

  /** List requests for an agent (pending first, then recent resolved). */
  async list(agentId: string): Promise<AgentRequest[]> {
    const entities = await this.repo.find({
      where: { agentId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    // Expire any temporary approvals that have passed
    const now = new Date();
    for (const e of entities) {
      if (e.status === 'approved' && e.expiresAt && new Date(e.expiresAt) < now) {
        e.status = 'expired';
        await this.repo.save(e);
        // Also clean up the egress temp exception
        if (e.type === 'whitelist') {
          this.egressProxy.removeTempException((e.payload as { host: string }).host);
        }
      }
    }
    return entities.map((e) => this.toDto(e));
  }

  /** Approve a request. If durationMinutes is provided, it's temporary. */
  async approve(
    agentId: string,
    requestId: number,
    durationMinutes?: number,
    resolvedBy?: string,
  ): Promise<AgentRequest> {
    const entity = await this.repo.findOne({ where: { id: requestId, agentId } });
    if (!entity) throw new NotFoundException('Request not found');
    if (entity.status !== 'pending') throw new BadRequestException(`Request is already ${entity.status}`);

    entity.status = 'approved';
    entity.resolvedAt = new Date();
    entity.resolvedBy = resolvedBy ?? 'user';

    if (entity.type === 'whitelist') {
      const payload = entity.payload as { host: string };
      if (durationMinutes && durationMinutes > 0) {
        // Temporary exception
        const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
        entity.expiresAt = expiresAt;
        this.egressProxy.addTempException(payload.host, durationMinutes * 60 * 1000, agentId);
        this.logger.log(`Request #${requestId} approved temporarily (${durationMinutes} min) for host "${payload.host}"`);
      } else {
        // Permanent — add to egress whitelist config
        const netCfg = this.configService.get('networkSecurity');
        if (!netCfg.egressWhitelist.some((h) => h.toLowerCase() === payload.host.toLowerCase())) {
          this.configService.update({
            networkSecurity: {
              ...netCfg,
              egressWhitelist: [...netCfg.egressWhitelist, payload.host],
            },
          });
        }
        this.logger.log(`Request #${requestId} approved permanently for host "${payload.host}"`);
      }
    }

    await this.repo.save(entity);
    this.notifyWaiter(requestId, 'approved');
    return this.toDto(entity);
  }

  /** Reject a request. */
  async reject(
    agentId: string,
    requestId: number,
    resolvedBy?: string,
  ): Promise<AgentRequest> {
    const entity = await this.repo.findOne({ where: { id: requestId, agentId } });
    if (!entity) throw new NotFoundException('Request not found');
    if (entity.status !== 'pending') throw new BadRequestException(`Request is already ${entity.status}`);

    entity.status = 'rejected';
    entity.resolvedAt = new Date();
    entity.resolvedBy = resolvedBy ?? 'user';
    await this.repo.save(entity);
    this.notifyWaiter(requestId, 'rejected');
    this.logger.log(`Request #${requestId} rejected`);
    return this.toDto(entity);
  }

  /** Get a single request's status (for agent polling via MCP). */
  async getStatus(agentId: string, requestId: number): Promise<AgentRequest> {
    const entity = await this.repo.findOne({ where: { id: requestId, agentId } });
    if (!entity) throw new NotFoundException('Request not found');
    // Check expiry
    if (entity.status === 'approved' && entity.expiresAt && new Date(entity.expiresAt) < new Date()) {
      entity.status = 'expired';
      await this.repo.save(entity);
      if (entity.type === 'whitelist') {
        this.egressProxy.removeTempException((entity.payload as { host: string }).host);
      }
    }
    return this.toDto(entity);
  }

  /**
   * Wait for a request to be resolved. Returns the status once resolved,
   * or 'pending' if the timeout is reached.
   */
  async waitForResolution(requestId: number, timeoutMs = 120_000): Promise<AgentRequestStatus> {
    // Check if already resolved
    const existing = await this.repo.findOne({ where: { id: requestId } });
    if (existing && existing.status !== 'pending') return existing.status;

    return new Promise<AgentRequestStatus>((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(requestId);
        resolve('pending');
      }, timeoutMs);
      this.waiters.set(requestId, { resolve, timer });
    });
  }

  private notifyWaiter(requestId: number, status: AgentRequestStatus): void {
    const waiter = this.waiters.get(requestId);
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(status);
      this.waiters.delete(requestId);
    }
  }

  private toDto(e: AgentRequestEntity): AgentRequest {
    return {
      id: e.id,
      agentId: e.agentId,
      type: e.type,
      status: e.status,
      payload: e.payload,
      reason: e.reason,
      createdAt: e.createdAt.toISOString(),
      resolvedAt: e.resolvedAt?.toISOString() ?? null,
      resolvedBy: e.resolvedBy,
      expiresAt: e.expiresAt?.toISOString() ?? null,
    };
  }
}