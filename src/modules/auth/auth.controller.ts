import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ✅ más duro (evita bruteforce / spam)
  @Throttle({ default: { ttl: 60, limit: 10 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password);
  }

  // ✅ más duro
  @Throttle({ default: { ttl: 60, limit: 10 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  // ✅ más duro (refresh suele ser target)
  @Throttle({ default: { ttl: 60, limit: 20 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  // logout puede ser más laxo
  @Throttle({ default: { ttl: 60, limit: 60 } })
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refresh_token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me() {
    return { ok: true };
  }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('admin-only')
  adminOnly() {
    return { ok: true };
  }
}
