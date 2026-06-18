import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@ApiTags('Applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une candidature' })
  create(@Request() req: { user: any }, @Body() dto: CreateApplicationDto) {
    return this.applicationsService.create(req.user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister toutes les candidatures' })
  findAll(@Request() req: { user: any }) {
    return this.applicationsService.findAllByUser(req.user.id);
  }

  @Get('kanban')
  @ApiOperation({ summary: 'Candidatures groupées par statut (Kanban)' })
  kanban(@Request() req: { user: any }) {
    return this.applicationsService.findByStatus(req.user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques des candidatures' })
  stats(@Request() req: { user: any }) {
    return this.applicationsService.getStats(req.user.id);
  }

  @Get('map')
  @ApiOperation({ summary: 'Candidatures avec coordonnées pour la carte' })
  map(@Request() req: { user: any }) {
    return this.applicationsService.findForMap(req.user.id);
  }

  @Delete('coordinates/reset')
  @ApiOperation({ summary: 'Réinitialiser les coordonnées de toutes les candidatures' })
  resetCoordinates(@Request() req: { user: any }) {
    return this.applicationsService.resetAllCoordinates(req.user.id);
  }

  @Patch(':id/coordinates')
  @ApiOperation({ summary: 'Enregistrer les coordonnées géocodées' })
  saveCoordinates(
    @Request() req: { user: any },
    @Param('id') id: string,
    @Body() body: { lat: number; lon: number; resolvedLocation: string },
  ) {
    return this.applicationsService.update(req.user.id, id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une candidature' })
  update(
    @Request() req: { user: any },
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.applicationsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une candidature' })
  remove(@Request() req: { user: any }, @Param('id') id: string) {
    return this.applicationsService.remove(req.user.id, id);
  }
}
