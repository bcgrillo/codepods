import { SetMetadata } from '@nestjs/common';

export const IS_AGENT_ALLOWED_KEY = 'isAgentAllowed';

/** Marks a route as accessible by authenticated agents (request.agentId set). */
export const AgentAllowed = () => SetMetadata(IS_AGENT_ALLOWED_KEY, true);