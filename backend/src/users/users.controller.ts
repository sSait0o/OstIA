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
  @Header('Content-Type', 'application/json')
  @Header(
    'Content-Disposition',
    'attachment; filename="ostia-mes-donnees.json"',
  )
  @ApiOperation({ summary: 'Exporter toutes mes données' })
  exportData(@Request() req: { user: User }) {
    return this.usersService.exportUserData(req.user.id);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Supprimer définitivement mon compte et mes données' })
  deleteMe(@Request() req: { user: User }) {
    return this.usersService.remove(req.user.id);
  }
}
