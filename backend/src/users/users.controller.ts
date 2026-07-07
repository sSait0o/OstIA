import {
  Controller,
  Get,
  Delete,
  Header,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Récupérer le profil' })
  getProfile(@Request() req: { user: User }): User {
    return req.user;
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="ostia-candidatures.csv"',
  )
  @ApiOperation({
    summary: 'Exporter mes candidatures en CSV (pour analyse, ex. Power BI)',
  })
  exportData(@Request() req: { user: User }) {
    return this.usersService.exportApplicationsCsv(req.user.id);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Supprimer définitivement mon compte et mes données' })
  deleteMe(@Request() req: { user: User }) {
    return this.usersService.remove(req.user.id);
  }
}
