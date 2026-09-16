import { Repository } from 'typeorm';
import { BaseTypeOrmRepository } from './base-typeorm.repository';

interface FakeEntity {
  id: number;
  name?: string;
}

describe('BaseTypeOrmRepository', () => {
  let repo: { [K in keyof Repository<FakeEntity>]: jest.Mock };
  let base: BaseTypeOrmRepository<FakeEntity>;

  beforeEach(() => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as { [K in keyof Repository<FakeEntity>]: jest.Mock };
    base = new (class extends BaseTypeOrmRepository<FakeEntity> {})(
      repo as unknown as Repository<FakeEntity>,
    );
  });

  it('findAll forwards the filter to repo.find', async () => {
    repo.find.mockResolvedValue([{ id: 1 }]);
    await expect(base.findAll({ name: 'a' })).resolves.toEqual([{ id: 1 }]);
    expect(repo.find).toHaveBeenCalledWith({ where: { name: 'a' } });
  });

  it('findById forwards id to repo.findOne', async () => {
    repo.findOne.mockResolvedValue({ id: 2 });
    await expect(base.findById(2)).resolves.toEqual({ id: 2 });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 2 } });
  });

  it('create builds and saves the entity', async () => {
    repo.create.mockReturnValue({ id: 1, name: 'x' });
    repo.save.mockResolvedValue({ id: 1, name: 'x' });
    await expect(base.create({ name: 'x' })).resolves.toEqual({ id: 1, name: 'x' });
    expect(repo.create).toHaveBeenCalledWith({ name: 'x' });
    expect(repo.save).toHaveBeenCalledWith({ id: 1, name: 'x' });
  });

  it('update applies repo.update then reloads via findById', async () => {
    repo.update.mockResolvedValue(undefined);
    repo.findOne.mockResolvedValue({ id: 3, name: 'new' });
    await expect(base.update(3, { name: 'new' })).resolves.toEqual({ id: 3, name: 'new' });
    expect(repo.update).toHaveBeenCalledWith(3, { name: 'new' });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 3 } });
  });

  it('delete forwards id to repo.delete', async () => {
    repo.delete.mockResolvedValue(undefined);
    await base.delete(4);
    expect(repo.delete).toHaveBeenCalledWith(4);
  });
});
