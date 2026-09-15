import { z } from 'zod';

export const portBindingSchema = z.object({
  containerPort: z.number().int().min(1).max(65535),
  hostPort: z.number().int().min(1).max(65535),
  protocol: z.enum(['tcp', 'udp']).default('tcp'),
});

export const createAgentSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Only alphanumeric characters, dashes and underscores are allowed'),
  image: z.string().min(1),
  codepodId: z.number().int().positive().default(1),
  ports: z.array(portBindingSchema).optional().default([]),
  env: z.record(z.string()).optional().default({}),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type PortBindingInput = z.infer<typeof portBindingSchema>;
