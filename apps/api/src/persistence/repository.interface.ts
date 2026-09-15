export interface IRepository<T, TId = string> {
  findAll(filter?: Partial<T>): Promise<T[]>;
  findById(id: TId): Promise<T | null>;
  create(data: Partial<T>): Promise<T>;
  update(id: TId, data: Partial<T>): Promise<T | null>;
  delete(id: TId): Promise<void>;
}
