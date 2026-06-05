import { Param, Get, Post, Patch, Delete, Body, Query } from '@nestjs/common';
import { page } from '../http/api-response';
import { clampPagination } from '../query/query-utils';
import { PageQueryDto } from '../query/page-query.dto';

export abstract class BaseCrudController<T> {
  protected abstract svc: {
    list?: (q: any) => Promise<{ items: T[]; total: number }>;
    create?: (dto: any, req?: any) => Promise<any>;
    update?: (id: string, dto: any, req?: any) => Promise<any>;
    remove?: (id: string, req?: any) => Promise<any>;
  };

  // Este patrón asume que cada módulo decide si usa list() o no.
  @Get()
  async list(@Query() q: PageQueryDto) {
    if (!this.svc.list) throw new Error('list() not implemented');
    const { page: p, limit, skip } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.list({ ...q, page: p, limit, skip });
    return page(r.items, p, limit, r.total);
  }

  @Post()
  async create(@Body() dto: any) {
    if (!this.svc.create) throw new Error('create() not implemented');
    const r = await this.svc.create(dto);
    return { ok: true, data: r };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: any) {
    if (!this.svc.update) throw new Error('update() not implemented');
    const r = await this.svc.update(id, dto);
    return { ok: true, data: r };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    if (!this.svc.remove) throw new Error('remove() not implemented');
    const r = await this.svc.remove(id);
    return { ok: true, data: r };
  }
}
