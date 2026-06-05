// health.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';


@Controller('health')
export class HealthController {
  @Get()
  ok() {
    return { ok: true, ts: new Date().toISOString() };
  }

  
}
