import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { PrincipioActivo } from './entities/principio-activo.entity';
import { QuimicoPrincipioActivo } from './entities/quimico-principio-activo.entity';
import { CreatePrincipioActivoDto } from './dto/create-principio-activo.dto';
import { UpdatePrincipioActivoDto } from './dto/update-principio-activo.dto';

@Injectable()
export class PrincipiosActivosService {
  constructor(
    @InjectRepository(PrincipioActivo)
    private readonly paRepo: Repository<PrincipioActivo>,
    @InjectRepository(QuimicoPrincipioActivo)
    private readonly qpaRepo: Repository<QuimicoPrincipioActivo>,
  ) {}

  async listAll(): Promise<PrincipioActivo[]> {
    return this.paRepo.find({ order: { nombre: 'ASC' } });
  }

  async create(dto: CreatePrincipioActivoDto): Promise<PrincipioActivo> {
    const conflict = await this.paRepo.findOne({ where: { nombre: dto.nombre } });
    if (conflict) {
      throw new AppError({
        code: ErrorCodes.PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO,
        message: `Ya existe un principio activo con nombre '${dto.nombre}'`,
        status: 409,
      });
    }

    const pa = this.paRepo.create({ nombre: dto.nombre });
    return this.paRepo.save(pa);
  }

  async update(id: string, dto: UpdatePrincipioActivoDto): Promise<PrincipioActivo> {
    const current = await this.paRepo.findOne({ where: { id } });
    if (!current) {
      throw new AppError({
        code: ErrorCodes.PRINCIPIO_ACTIVO_NOT_FOUND,
        message: 'Principio activo no encontrado',
        status: 404,
      });
    }

    if (dto.nombre !== current.nombre) {
      const conflict = await this.paRepo
        .createQueryBuilder('pa')
        .where('pa.nombre = :nombre', { nombre: dto.nombre })
        .andWhere('pa.id != :id', { id })
        .getOne();

      if (conflict) {
        throw new AppError({
          code: ErrorCodes.PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO,
          message: `Ya existe un principio activo con nombre '${dto.nombre}'`,
          status: 409,
        });
      }
    }

    current.nombre = dto.nombre;
    return this.paRepo.save(current);
  }

  async delete(id: string): Promise<void> {
    const pa = await this.paRepo.findOne({ where: { id } });
    if (!pa) {
      throw new AppError({
        code: ErrorCodes.PRINCIPIO_ACTIVO_NOT_FOUND,
        message: 'Principio activo no encontrado',
        status: 404,
      });
    }

    const refCount = await this.qpaRepo.count({ where: { principio_activo_id: id } });
    if (refCount > 0) {
      throw new AppError({
        code: ErrorCodes.PRINCIPIO_ACTIVO_REFERENCIADO,
        message: 'No se puede eliminar: este principio activo está siendo usado por uno o más químicos',
        status: 409,
      });
    }

    await this.paRepo.delete(id);
  }
}
