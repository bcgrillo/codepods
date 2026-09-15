import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SkillsService } from './skills.service';
import { SkillSourceEntity } from './skill-source.entity';
import { SkillEntity } from './skill.entity';
import { AgentSkillEntity } from './agent-skill.entity';
import { ConfigService } from '../config/config.service';

/**
 * SkillsService spec. fs-touching methods (scanLocal, upload, rename, delete,
 * streamZip) run against a real per-test temp directory — we avoid jest.mock('fs')
 * because that breaks path-scurry/glob transitively loaded by typeorm.
 */
describe('SkillsService', () => {
  let service: SkillsService;
  let dataDir: string;

  const sourceRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const skillRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    delete: jest.fn(),
  };
  const agentSkillRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const config = { get: jest.fn() };

  const src = (over: Partial<SkillSourceEntity> = {}): SkillSourceEntity =>
    ({
      id: 1,
      codepodId: 1,
      type: 'local',
      name: 'Local',
      gitUrl: null,
      subPath: null,
      branch: null,
      commitSha: null,
      lastSyncedAt: null,
      enabled: true,
      builtIn: true,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      ...over,
    }) as unknown as SkillSourceEntity;

  const skill = (over: Partial<SkillEntity> = {}): SkillEntity =>
    ({
      id: 10,
      codepodId: 1,
      sourceId: 1,
      sourceType: 'local',
      name: 'my-skill',
      description: 'desc',
      path: 'my-skill',
      skillMd: '---\nname: my-skill\n---\nbody',
      uploaded: true,
      lastSeenAt: new Date('2024-01-01T00:00:00Z'),
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      ...over,
    }) as unknown as SkillEntity;

  beforeEach(async () => {
    jest.clearAllMocks();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-skills-'));
    config.get.mockReturnValue(dataDir);
    const module = await Test.createTestingModule({
      providers: [
        SkillsService,
        { provide: getRepositoryToken(SkillSourceEntity), useValue: sourceRepo },
        { provide: getRepositoryToken(SkillEntity), useValue: skillRepo },
        { provide: getRepositoryToken(AgentSkillEntity), useValue: agentSkillRepo },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(SkillsService);
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  /** Write a SKILL.md into <dataDir>/skills/<folder>/SKILL.md. */
  const writeLocalSkill = (folder: string, frontmatter: string, body = 'body') => {
    const dir = path.join(dataDir, 'skills', folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `${frontmatter}\n---\n${body}`);
  };

  describe('findAll', () => {
    it('lists sources ordered builtIn DESC, name ASC, with skill counts', async () => {
      sourceRepo.find.mockResolvedValue([src({ id: 1, builtIn: true }), src({ id: 2, builtIn: false, name: 'Z' })]);
      skillRepo.count.mockResolvedValue(3);
      const result = await service.findAll(1);
      expect(sourceRepo.find).toHaveBeenCalledWith({
        where: { codepodId: 1 },
        order: { builtIn: 'DESC', name: 'ASC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].skillCount).toBe(3);
      expect(result[0].localDir).toBe(path.join(dataDir, 'skills'));
    });

    it('returns null localDir for non-local sources', async () => {
      sourceRepo.find.mockResolvedValue([src({ id: 2, type: 'repo', builtIn: false, name: 'R' })]);
      skillRepo.count.mockResolvedValue(0);
      const [s] = await service.findAll(1);
      expect(s.localDir).toBeNull();
    });
  });

  describe('findSourceEntity / findOneSource', () => {
    it('throws NotFound when source missing', async () => {
      sourceRepo.findOne.mockResolvedValue(null);
      await expect(service.findSourceEntity(99)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the safe source with skill count', async () => {
      sourceRepo.findOne.mockResolvedValue(src());
      skillRepo.count.mockResolvedValue(2);
      const s = await service.findOneSource(1);
      expect(s.id).toBe(1);
      expect(s.skillCount).toBe(2);
    });
  });

  describe('createSource', () => {
    it('rejects local type', async () => {
      await expect(service.createSource({ name: 'x', type: 'local' } as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects empty gitUrl', async () => {
      await expect(
        service.createSource({ name: 'x', type: 'repo', gitUrl: '  ' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a repo source with trimmed fields and default branch', async () => {
      const created = src({ id: 0, type: 'repo', builtIn: false, name: 'R', gitUrl: ' https://x ' });
      sourceRepo.create.mockReturnValue(created);
      sourceRepo.save.mockResolvedValue(src({ id: 5, type: 'repo', builtIn: false, name: 'R', gitUrl: 'https://x' }));
      const s = await service.createSource({ name: 'R', type: 'repo', gitUrl: ' https://x ' } as never);
      const arg = sourceRepo.create.mock.calls[0][0];
      expect(arg.gitUrl).toBe('https://x');
      expect(arg.branch).toBe('main');
      expect(arg.builtIn).toBe(false);
      expect(arg.enabled).toBe(true);
      expect(s.id).toBe(5);
      expect(s.skillCount).toBe(0);
    });
  });

  describe('updateSource', () => {
    it('only toggles enabled for built-in local source', async () => {
      const s = src();
      sourceRepo.findOne.mockResolvedValue(s);
      skillRepo.count.mockResolvedValue(0);
      await service.updateSource(1, { enabled: false, name: 'ignored' } as never);
      expect(s.enabled).toBe(false);
      expect(s.name).toBe('Local');
      expect(sourceRepo.save).toHaveBeenCalledWith(s);
    });

    it('updates fields for non-built-in source', async () => {
      const s = src({ builtIn: false, type: 'repo', name: 'R', gitUrl: 'https://x' });
      sourceRepo.findOne.mockResolvedValue(s);
      skillRepo.count.mockResolvedValue(0);
      await service.updateSource(1, { name: 'R2', gitUrl: ' https://y ', enabled: false } as never);
      expect(s.name).toBe('R2');
      expect(s.gitUrl).toBe('https://y');
      expect(s.enabled).toBe(false);
      expect(sourceRepo.save).toHaveBeenCalledWith(s);
    });
  });

  describe('removeSource', () => {
    it('rejects deleting the built-in local source', async () => {
      sourceRepo.findOne.mockResolvedValue(src());
      await expect(service.removeSource(1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('removes a non-built-in source and cleans its cache dir', async () => {
      const s = src({ id: 7, builtIn: false, type: 'repo' });
      sourceRepo.findOne.mockResolvedValue(s);
      // create a fake cache dir so we can verify cleanup
      const cacheDir = path.join(dataDir, 'skills-cache', '7');
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, 'x'), 'x');
      await service.removeSource(7);
      expect(sourceRepo.remove).toHaveBeenCalledWith(s);
      expect(fs.existsSync(cacheDir)).toBe(false);
    });
  });

  describe('listSkillsBySource / listAllSkills / listLocalSkills', () => {
    it('lists skills by source ordered by name', async () => {
      skillRepo.find.mockResolvedValue([skill({ name: 'b' }), skill({ name: 'a' })]);
      const list = await service.listSkillsBySource(1);
      expect(skillRepo.find).toHaveBeenCalledWith({ where: { sourceId: 1 }, order: { name: 'ASC' } });
      expect(list).toHaveLength(2);
    });

    it('listAllSkills only includes enabled sources', async () => {
      sourceRepo.find.mockResolvedValue([src({ id: 1, enabled: true }), src({ id: 2, enabled: false })]);
      skillRepo.find.mockResolvedValue([skill({ sourceId: 1 })]);
      const list = await service.listAllSkills(1);
      expect(sourceRepo.find).toHaveBeenCalledWith({ where: { codepodId: 1, enabled: true } });
      expect(list).toHaveLength(1);
    });

    it('listAllSkills returns [] when no enabled sources', async () => {
      sourceRepo.find.mockResolvedValue([]);
      const list = await service.listAllSkills(1);
      expect(list).toEqual([]);
    });

    it('listLocalSkills returns [] when no local source exists', async () => {
      sourceRepo.findOne.mockResolvedValue(null);
      const list = await service.listLocalSkills();
      expect(list).toEqual([]);
    });

    it('listLocalSkills returns skills for the local source', async () => {
      sourceRepo.findOne.mockResolvedValue(src());
      skillRepo.find.mockResolvedValue([skill()]);
      const list = await service.listLocalSkills();
      expect(list).toHaveLength(1);
    });
  });

  describe('getSkillEntity / findOneSkill', () => {
    it('throws NotFound when skill missing', async () => {
      skillRepo.findOne.mockResolvedValue(null);
      await expect(service.getSkillEntity(99)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns safe skill', async () => {
      skillRepo.findOne.mockResolvedValue(skill());
      const s = await service.findOneSkill(10);
      expect(s.id).toBe(10);
      expect(s.name).toBe('my-skill');
    });
  });

  describe('assignToAgent / removeFromAgent / listForAgent', () => {
    it('assigns a skill to an agent (no-op if already assigned)', async () => {
      agentSkillRepo.findOne.mockResolvedValue(null);
      agentSkillRepo.create.mockReturnValue({ agentId: 'a1', skillId: 10 });
      await service.assignToAgent('a1', 10);
      expect(agentSkillRepo.save).toHaveBeenCalled();
    });

    it('skips save when already assigned', async () => {
      agentSkillRepo.findOne.mockResolvedValue({ agentId: 'a1', skillId: 10 });
      await service.assignToAgent('a1', 10);
      expect(agentSkillRepo.save).not.toHaveBeenCalled();
    });

    it('removes an assignment', async () => {
      await service.removeFromAgent('a1', 10);
      expect(agentSkillRepo.delete).toHaveBeenCalledWith({ agentId: 'a1', skillId: 10 });
    });

    it('listForAgent returns [] when no assignments', async () => {
      agentSkillRepo.find.mockResolvedValue([]);
      const list = await service.listForAgent('a1');
      expect(list).toEqual([]);
    });

    it('listForAgent maps assigned skill ids to skills', async () => {
      agentSkillRepo.find.mockResolvedValue([{ agentId: 'a1', skillId: 10 }]);
      skillRepo.find.mockResolvedValue([skill()]);
      const list = await service.listForAgent('a1');
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('my-skill');
    });
  });

  describe('syncSource (local)', () => {
    it('scans local and stamps lastSyncedAt', async () => {
      const s = src();
      sourceRepo.findOne.mockResolvedValue(s);
      skillRepo.count.mockResolvedValue(0);
      // scanLocal on an empty real dir returns []
      skillRepo.find.mockResolvedValue([]);
      const result = await service.syncSource(1);
      expect(s.lastSyncedAt).toBeInstanceOf(Date);
      expect(sourceRepo.save).toHaveBeenCalledWith(s);
      expect(result.id).toBe(1);
    });
  });

  describe('scanLocal', () => {
    it('returns [] when no local source exists', async () => {
      sourceRepo.findOne.mockResolvedValue(null);
      const list = await service.scanLocal();
      expect(list).toEqual([]);
    });

    it('upserts skills discovered on disk and removes stale DB rows', async () => {
      const s = src({ id: 1 });
      sourceRepo.findOne.mockResolvedValue(s);
      writeLocalSkill('my-skill', '---\nname: my-skill\ndescription: d');
      // upsert: no existing row → create
      skillRepo.findOne.mockResolvedValue(null);
      skillRepo.create.mockReturnValue(skill());
      skillRepo.save.mockResolvedValue(skill());
      // deleteStaleSkills finds a stale row, then final list returns the upserted skill
      skillRepo.find
        .mockResolvedValueOnce([skill({ id: 11, name: 'stale' })]) // deleteStaleSkills rows
        .mockResolvedValueOnce([skill()]); // final list after scan
      const list = await service.scanLocal();
      expect(skillRepo.save).toHaveBeenCalled();
      expect(skillRepo.remove).toHaveBeenCalledWith([expect.objectContaining({ name: 'stale' })]);
      expect(list).toHaveLength(1);
    });
  });

  describe('deleteLocalSkill', () => {
    it('rejects deleting non-local skills', async () => {
      skillRepo.findOne.mockResolvedValue(skill({ sourceType: 'repo' }));
      await expect(service.deleteLocalSkill(10)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('removes the dir and the DB row', async () => {
      writeLocalSkill('my-skill', '---\nname: my-skill\n---\nbody');
      skillRepo.findOne.mockResolvedValue(skill());
      await service.deleteLocalSkill(10);
      expect(fs.existsSync(path.join(dataDir, 'skills', 'my-skill'))).toBe(false);
      expect(skillRepo.delete).toHaveBeenCalledWith(10);
    });
  });

  describe('renameLocalSkill', () => {
    it('rejects renaming non-local skills', async () => {
      skillRepo.findOne.mockResolvedValue(skill({ sourceType: 'repo' }));
      await expect(service.renameLocalSkill(10, 'new')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('falls back to "skill" for a name with no valid chars', async () => {
      writeLocalSkill('my-skill', '---\nname: my-skill\n---\nbody');
      const s = skill();
      skillRepo.findOne.mockResolvedValue(s);
      skillRepo.find.mockResolvedValue([]);
      // sanitizeName('///') → 'skill' (fallback), so no throw; dir renamed to 'skill'
      await service.renameLocalSkill(10, '///');
      expect(s.name).toBe('skill');
      expect(s.path).toBe('skill');
      expect(fs.existsSync(path.join(dataDir, 'skills', 'skill'))).toBe(true);
    });

    it('renames the dir and the DB row, then re-scans', async () => {
      writeLocalSkill('my-skill', '---\nname: my-skill\n---\nbody');
      const s = skill();
      const refreshed = skill({ name: 'NewName', path: 'NewName' });
      skillRepo.findOne
        .mockResolvedValueOnce(s) // getSkillEntity
        .mockResolvedValueOnce(refreshed) // upsert findOne during scanLocal
        .mockResolvedValueOnce(refreshed); // refreshed lookup after scan
      skillRepo.find.mockResolvedValue([]); // deleteStale + final list
      const result = await service.renameLocalSkill(10, 'New Name!');
      expect(s.name).toBe('NewName');
      expect(s.path).toBe('NewName');
      expect(fs.existsSync(path.join(dataDir, 'skills', 'my-skill'))).toBe(false);
      expect(fs.existsSync(path.join(dataDir, 'skills', 'NewName'))).toBe(true);
      expect(result.name).toBe('NewName');
    });
  });

  describe('skillZipUrl', () => {
    it('builds the host URL for an agent to fetch the zip from', () => {
      expect(service.skillZipUrl(42)).toBe('http://host.docker.internal:3000/api/skills/42/zip');
    });
  });
});