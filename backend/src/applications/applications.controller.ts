import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { EmailService } from '@email/email.service';
import { User } from '@users/entities/user.entity';

@ApiTags('Applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    @Optional() private readonly emailService: EmailService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer une candidature' })
  create(@Request() req: { user: User }, @Body() dto: CreateApplicationDto) {
    return this.applicationsService.create(req.user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister toutes les candidatures (paginé)' })
  findAll(
    @Request() req: { user: User },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.applicationsService.findPaginated(
      req.user.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('kanban')
  @ApiOperation({ summary: 'Candidatures groupées par statut (Kanban)' })
  kanban(@Request() req: { user: User }) {
    return this.applicationsService.findByStatus(req.user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques des candidatures' })
  stats(@Request() req: { user: User }) {
    return this.applicationsService.getStats(req.user.id);
  }

  @Get('map')
  @ApiOperation({ summary: 'Candidatures avec coordonnées pour la carte' })
  map(@Request() req: { user: User }) {
    return this.applicationsService.findForMap(req.user.id);
  }

  @Get('case-files')
  @ApiOperation({ summary: 'Tous les dossiers avec leur historique de statuts' })
  listCaseFiles(@Request() req: { user: User }) {
    if (!this.emailService) throw new NotFoundException();
    return this.emailService.listCaseFiles(req.user.id);
  }

  @Get('case-files/stats')
  @ApiOperation({
    summary:
      'Statistiques par statut, dossiers actuels vs événements détectés',
  })
  caseFileStats(@Request() req: { user: User }) {
    if (!this.emailService) throw new NotFoundException();
    return this.emailService.getCaseFileStats(req.user.id);
  }

  @Post(':id/emails/:emailId/split')
  @ApiOperation({
    summary: 'Détacher un email vers un nouveau dossier indépendant',
  })
  splitDossier(
    @Request() req: { user: User },
    @Param('id') id: string,
    @Param('emailId') emailId: string,
  ) {
    if (!this.emailService) throw new NotFoundException();
    return this.emailService.splitEmailIntoNewApplication(
      req.user.id,
      id,
      emailId,
    );
  }

  @Get(':id/emails')
  @ApiOperation({ summary: 'Historique des mails liés à une candidature' })
  findEmails(@Request() req: { user: User }, @Param('id') id: string) {
    return this.applicationsService.findEmailsForApplication(req.user.id, id);
  }

  @Delete('duplicates')
  @ApiOperation({
    summary: 'Supprimer les candidatures en double (même entreprise + poste)',
  })
  deduplicate(@Request() req: { user: User }) {
    return this.applicationsService.deduplicateApplications(req.user.id);
  }

  @Delete('coordinates/reset')
  @ApiOperation({
    summary: 'Réinitialiser les coordonnées de toutes les candidatures',
  })
  resetCoordinates(@Request() req: { user: User }) {
    return this.applicationsService.resetAllCoordinates(req.user.id);
  }

  @Patch(':id/coordinates')
  @ApiOperation({ summary: 'Enregistrer les coordonnées géocodées' })
  saveCoordinates(
    @Request() req: { user: User },
    @Param('id') id: string,
    @Body()
    body: {
      lat: number;
      lon: number;
      resolvedLocation: string;
      jobUrl?: string;
    },
  ) {
    return this.applicationsService.update(req.user.id, id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une candidature' })
  async update(
    @Request() req: { user: User },
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    const app = await this.applicationsService.update(req.user.id, id, dto);
    if (dto.status && app.emailId && this.emailService) {
      this.emailService
        .updateGmailLabelForEmail(req.user.id, app.emailId, app.status)
        .catch(() => {});
    }
    return app;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une candidature' })
  remove(@Request() req: { user: User }, @Param('id') id: string) {
    return this.applicationsService.remove(req.user.id, id);
  }
}
