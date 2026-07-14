import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Application,
  ApplicationSource,
  ApplicationStatus,
} from './entities/application.entity';
import { ApplicationEmail } from './entities/application-email.entity';
import { ApplicationEmailsService } from './application-emails.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { User } from '@users/entities/user.entity';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly appRepo: Repository<Application>,
    private readonly applicationEmailsService: ApplicationEmailsService,
  ) {}

  async create(user: User, dto: CreateApplicationDto): Promise<Application> {
    const app = this.appRepo.create({ ...dto, user });
    if (dto.appliedAt) app.appliedAt = new Date(dto.appliedAt);
    return this.appRepo.save(app);
  }

  async findAllByUser(userId: string): Promise<Application[]> {
    return this.appRepo.find({
      where: { user: { id: userId } },
      order: { updatedAt: 'DESC' },
    });
  }

  async findPaginated(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    data: Application[];
    total: number;
    page: number;
    limit: number;
  }> {
    const [data, total] = await this.appRepo.findAndCount({
      where: { user: { id: userId } },
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async findByStatus(
    userId: string,
  ): Promise<Record<ApplicationStatus, Application[]>> {
    const apps = await this.findAllByUser(userId);
    return apps.reduce(
      (acc, app) => {
        if (!acc[app.status]) acc[app.status] = [];
        acc[app.status].push(app);
        return acc;
      },
      {} as Record<ApplicationStatus, Application[]>,
    );
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateApplicationDto,
  ): Promise<Application> {
    const app = await this.appRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!app) throw new NotFoundException('Candidature non trouvée');
    if (app.user.id !== userId) throw new ForbiddenException();
    Object.assign(app, dto);
    if (dto.appliedAt) app.appliedAt = new Date(dto.appliedAt);
    return this.appRepo.save(app);
  }

  async remove(userId: string, id: string): Promise<void> {
    const app = await this.appRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!app) throw new NotFoundException('Candidature non trouvée');
    if (app.user.id !== userId) throw new ForbiddenException();
    await this.appRepo.remove(app);
  }

  async findEmailsForApplication(
    userId: string,
    id: string,
  ): Promise<ApplicationEmail[]> {
    const app = await this.appRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!app) throw new NotFoundException('Candidature non trouvée');
    if (app.user.id !== userId) throw new ForbiddenException();
    return this.applicationEmailsService.findForApplication(userId, id);
  }

  async findForMap(userId: string) {
    const apps = await this.findAllByUser(userId);
    return apps.map((a) => ({
      id: a.id,
      company: a.company,
      jobTitle: a.jobTitle,
      status: a.status,
      location: a.location,
      resolvedLocation: a.resolvedLocation,
      lat: a.lat ?? null,
      lon: a.lon ?? null,
      source: a.source ?? null,
      emailSubject: a.emailSubject ?? null,
      emailBody: a.emailBody ?? null,
      emailId: a.emailId ?? null,
      salary: a.salary ?? null,
      notes: a.notes ?? null,
      jobUrl: a.jobUrl ?? null,
      appliedAt: a.appliedAt ?? null,
      createdAt: a.createdAt,
    }));
  }

  async deduplicateApplications(userId: string): Promise<{ removed: number }> {
    const apps = await this.findAllByUser(userId);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const groups = new Map<string, typeof apps>();

    for (const app of apps) {
      const key = `${norm(app.company)}__${norm(app.jobTitle)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(app);
    }

    let removed = 0;
    for (const group of groups.values()) {
      if (group.length <= 1) continue;
      group.sort((a, b) => {
        const score = (x: typeof a) =>
          (x.emailBody ? 4 : 0) +
          (x.emailId ? 2 : 0) +
          (x.resolvedLocation ? 1 : 0);
        return (
          score(b) - score(a) || b.updatedAt.getTime() - a.updatedAt.getTime()
        );
      });
      const [, ...toDelete] = group;
      await Promise.all(toDelete.map((a) => this.appRepo.remove(a)));
      removed += toDelete.length;
    }
    return { removed };
  }

  async removeAllEmailSourced(userId: string): Promise<number> {
    const result = await this.appRepo.delete({
      user: { id: userId },
      source: ApplicationSource.EMAIL,
    });
    return result.affected ?? 0;
  }

  async resetAllCoordinates(userId: string): Promise<{ reset: number }> {
    const apps = await this.findAllByUser(userId);
    await Promise.all(
      apps.map((a) => {
        Object.assign(a, { lat: null, lon: null, resolvedLocation: null });
        return this.appRepo.save(a);
      }),
    );
    return { reset: apps.length };
  }

  private static readonly TERMINAL_STATUSES = new Set<ApplicationStatus>([
    ApplicationStatus.OFFER,
    ApplicationStatus.REJECTED,
  ]);

  async findByEmailId(
    userId: string,
    emailId: string,
  ): Promise<Application | null> {
    return this.appRepo.findOne({ where: { user: { id: userId }, emailId } });
  }

  async findDossierForEmail(
    userId: string,
    params: { threadId?: string; text: string },
  ): Promise<Application | null> {
    const { threadId, text } = params;

    if (threadId) {
      const byThread = await this.appRepo.findOne({
        where: { user: { id: userId }, threadId },
      });
      if (byThread) return byThread;
    }

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nText = norm(text);
    const existing = await this.findAllByUser(userId);

    return (
      existing.find((a) => {
        if (ApplicationsService.TERMINAL_STATUSES.has(a.status)) return false;
        const nc = norm(a.company);
        const nj = norm(a.jobTitle);
        return (
          nc.length > 0 &&
          nj.length > 0 &&
          nText.includes(nc) &&
          nText.includes(nj)
        );
      }) ?? null
    );
  }

  async getStats(userId: string) {
    const apps = await this.findAllByUser(userId);
    const total = apps.length;

    const byStatus = Object.values(ApplicationStatus).reduce(
      (acc, s) => ({ ...acc, [s]: apps.filter((a) => a.status === s).length }),
      {} as Record<ApplicationStatus, number>,
    );

    const responded = apps.filter((a) =>
      [
        ApplicationStatus.INTERVIEW,
        ApplicationStatus.TECHNICAL,
        ApplicationStatus.OFFER,
        ApplicationStatus.REJECTED,
      ].includes(a.status),
    ).length;
    const responseRate =
      apps.length > 0 ? Math.round((responded / apps.length) * 100) : 0;

    const now = new Date();
    const byMonth = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const label = d.toLocaleString('fr-FR', {
        month: 'short',
        year: '2-digit',
      });
      const count = apps.filter((a) => {
        const date = new Date(a.appliedAt ?? a.createdAt);
        return (
          date.getFullYear() === d.getFullYear() &&
          date.getMonth() === d.getMonth()
        );
      }).length;
      return { month: label, count };
    });

    return { total, byStatus, responseRate, byMonth };
  }
}
