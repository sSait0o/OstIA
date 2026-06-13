import { Controller, Get, Post, Patch, Query, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JobsService } from './jobs.service';
import { UsersService } from '../users/users.service';

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly usersService: UsersService,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'Rechercher des offres avec score de matching CV' })
  @ApiQuery({ name: 'keywords', required: false })
  @ApiQuery({ name: 'location', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async search(
    @Request() req: { user: any },
    @Query('keywords') keywords?: string,
    @Query('location') location?: string,
    @Query('page') page?: number,
  ) {
    const user = await this.usersService.findById(req.user.id);
    return this.jobsService.searchAndScore(
      req.user.id,
      { keywords, location, page },
      user?.cvData || {},
    );
  }

  @Get('saved')
  @ApiOperation({ summary: 'Offres sauvegardées' })
  getSaved(@Request() req: { user: any }) {
    return this.jobsService.getSavedJobs(req.user.id);
  }

  @Patch(':id/save')
  @ApiOperation({ summary: 'Sauvegarder/désauvegarder une offre' })
  toggleSave(@Request() req: { user: any }, @Param('id') id: string) {
    return this.jobsService.toggleSave(req.user.id, id);
  }
}
