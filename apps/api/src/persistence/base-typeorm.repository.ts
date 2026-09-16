import { Repository, FindOptionsWhere, DeepPartial } from 'typeorm';
import { IRepository } from './repository.interface';

export abstract class BaseTypeOrmRepository<T extends { id: unknown }>
  implements IRepository<T, T['id']>
{
  constructor(protected readonly repo: Repository<T>) {}

  findAll(filter?: Partial<T>): Promise<T[]> {
    return this.repo.find({
      where: filter as FindOptionsWhere<T>,
    });
  }

  findById(id: T['id']): Promise<T | null> {
    return this.repo.findOne({
      where: { id } as FindOptionsWhere<T>,
    });
  }

  async create(data: Partial<T>): Promise<T> {
    const entity = this.repo.create(data as DeepPartial<T>);
    return this.repo.save(entity);
  }

  async update(id: T['id'], data: Partial<T>): Promise<T | null> {
    await this.repo.update(id as never, data as never);
    return this.findById(id);
  }

  async delete(id: T['id']): Promise<void> {
    await this.repo.delete(id as never);
  }
}
