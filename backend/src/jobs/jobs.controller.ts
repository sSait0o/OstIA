import {
  Controller,
  Get,
  Logger,
  Patch,
  Query,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { JobsService } from './jobs.service';
import { UsersService } from '@users/users.service';

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(
    private readonly jobsService: JobsService,
    private readonly usersService: UsersService,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'Rechercher des offres avec score de matching CV' })
  @ApiQuery({ name: 'keywords', required: false })
  @ApiQuery({ name: 'location', required: false })
  @ApiQuery({
    name: 'contractTypes',
    required: false,
    description: 'Codes séparés par virgule: CDI,CDD,MIS,APP',
  })
  @ApiQuery({
    name: 'experience',
    required: false,
    description: '1 = <1an, 2 = 1-3ans, 3 = +3ans',
  })
  @ApiQuery({ name: 'distance', required: false, type: Number })
  @ApiQuery({
    name: 'fullTime',
    required: false,
    description: 'true = temps plein, false = temps partiel',
  })
  @ApiQuery({
    name: 'remote',
    required: false,
    description: 'TELETRAVAIL_COMPLET | TELETRAVAIL_PARTIEL | PRESENTIEL',
  })
  @ApiQuery({ name: 'salaryMin', required: false, type: Number })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'date | pertinence',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async search(
    @Request() req: { user: { id: string } },
    @Query('keywords') keywords?: string,
    @Query('location') location?: string,
    @Query('contractTypes') contractTypes?: string,
    @Query('experience') experience?: string,
    @Query('distance') distance?: string,
    @Query('fullTime') fullTime?: string,
    @Query('remote') remote?: string,
    @Query('salaryMin') salaryMin?: string,
    @Query('sortBy') sortBy?: string,
    @Query('page') page?: string,
  ) {
    const user = await this.usersService.findById(req.user.id);
    return this.jobsService.searchAndScore(
      req.user.id,
      {
        keywords,
        location,
        contractTypes: contractTypes
          ? contractTypes.split(',').filter(Boolean)
          : undefined,
        experience,
        distance: distance ? +distance : undefined,
        fullTime:
          fullTime === 'true' ? true : fullTime === 'false' ? false : undefined,
        remote,
        salaryMin: salaryMin ? +salaryMin : undefined,
        sortBy: (sortBy as 'date' | 'pertinence') || undefined,
        page: page ? +page : undefined,
      },
      (user?.cvData as Record<string, unknown>) || {},
    );
  }

  @Get('feed')
  @ApiOperation({
    summary: "Fil d'offres personnalisé basé sur le CV (auto-synchronisé)",
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'minScore', required: false, type: Number })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'matchScore | date',
  })
  async feed(
    @Request() req: { user: { id: string } },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('minScore') minScore?: string,
    @Query('sortBy') sortBy?: string,
  ) {
    const user = await this.usersService.findById(req.user.id);
    const cvData = (user?.cvData as Record<string, unknown>) || {};

    let syncing = false;
    if (this.jobsService.isJobsSyncStale(user?.jobsLastSyncedAt)) {
      syncing = true;
      this.jobsService.syncJobsForUser(req.user.id, cvData).catch((err) => {
        this.logger.error(
          `Background jobs sync failed for user ${req.user.id}: ${err}`,
        );
      });
    }

    const result = await this.jobsService.getFeed(req.user.id, {
      page: page ? +page : undefined,
      pageSize: pageSize ? +pageSize : undefined,
      minScore: minScore ? +minScore : undefined,
      sortBy: (sortBy as 'matchScore' | 'date') || undefined,
    });

    return { ...result, syncing };
  }

  @Get('saved')
  @ApiOperation({ summary: 'Offres sauvegardées' })
  getSaved(@Request() req: { user: { id: string } }) {
    return this.jobsService.getSavedJobs(req.user.id);
  }

  @Patch(':id/save')
  @ApiOperation({ summary: 'Sauvegarder/désauvegarder une offre' })
  toggleSave(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.jobsService.toggleSave(req.user.id, id);
  }
}
