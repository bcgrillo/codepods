import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CodepodEntity } from './codepod.entity';

@Injectable()
export class CodepodService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(CodepodEntity)
    private readonly repo: Repository<CodepodEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const exists = await this.repo.findOne({ where: { id: 1 } });
    if (!exists) {
      await this.repo.save({ id: 1, slug: 'default', name: 'Default' });
    }
  }

  findDefault(): Promise<CodepodEntity | null> {
    return this.repo.findOne({ where: { id: 1 } });
  }
}
