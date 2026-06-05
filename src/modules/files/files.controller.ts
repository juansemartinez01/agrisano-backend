import {
  Controller,
  Delete,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  Inject,
  Get,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import type { FilesClient } from './files.provider';

@Controller('files')
export class FilesController {
  constructor(@Inject('FILES') private files: FilesClient) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@Req() req: any, @UploadedFile() file: any) {
    if (!file?.buffer) {
      throw new AppError({
        code: ErrorCodes.BAD_REQUEST,
        message: 'Missing file',
        status: 400,
      });
    }

    const tenantKey = req?.tenantKey ?? null;

    const result = await this.files.upload(
      file.buffer,
      file.mimetype,
      file.originalname,
      undefined,
      tenantKey ?? undefined,
    );

    return { ok: true, data: result };
  }

  @Delete('delete/:publicId')
  async deleteFile(@Req() req: any, @Param('publicId') publicId: string) {
    const tenantKey = req?.tenantKey ?? null;

    const r = await this.files.delete(publicId, tenantKey ?? undefined);
    return { ok: true, data: r };
  }

  @Get('list')
  async listFiles(@Req() req: any) {
    const tenantKey = req?.tenantKey ?? null;

    const rows = await this.files.list(tenantKey ?? undefined);
    return { ok: true, data: rows };
  }
}
