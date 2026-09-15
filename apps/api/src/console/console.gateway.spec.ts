import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as http from 'node:http';
import { ConsoleGateway } from './console.gateway';
import { AgentsService } from '../agents/agents.service';
import { AuthService } from '../auth/auth.service';

describe('ConsoleGateway socket.io attachment (TLS fix)', () => {
  let app: INestApplication;
  let gateway: ConsoleGateway;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ConsoleGateway,
        { provide: AgentsService, useValue: {} },
        { provide: AuthService, useValue: { validateToken: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    gateway = app.get(ConsoleGateway);
  });

  afterEach(async () => {
    await app.close();
  });

  it('exposes the socket.io namespace after init', () => {
    expect(gateway.server).toBeDefined();
  });

  it('can attach the top-level socket.io server to additional http servers', async () => {
    const s2 = http.createServer();
    // Simulate the TLS branch: attach the same io server to a second server.
    gateway.server.server.attach(s2);
    expect(s2.listeners('request').length).toBeGreaterThan(0);
    s2.close();
  });
});
