import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import {
  Application,
  ApplicationSource,
  ApplicationStatus,
} from '../applications/entities/application.entity';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  [ApplicationStatus.APPLIED]: 'Envoyée',
  [ApplicationStatus.ACKNOWLEDGED]: 'Reçue',
  [ApplicationStatus.TECHNICAL]: 'Test technique',
  [ApplicationStatus.INTERVIEW]: 'Entretien',
  [ApplicationStatus.OFFER]: 'Offre',
  [ApplicationStatus.REJECTED]: 'Refusé',
};

const SOURCE_LABELS: Record<ApplicationSource, string> = {
  [ApplicationSource.EMAIL]: 'Email',
  [ApplicationSource.MANUAL]: 'Manuel',
  [ApplicationSource.JOB_BOARD]: "Offre d'emploi",
};

function formatDate(date: Date | null | undefined): string {
  return date ? new Date(date).toISOString().slice(0, 10) : '';
}

function csvEscape(value: string | number): string {
  const str = String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const user = this.userRepo.create(dto);
    return this.userRepo.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { emailVerificationToken: token } });
  }

  async setVerificationToken(
    userId: string,
    token: string,
    expires: Date,
  ): Promise<void> {
    await this.userRepo.update(userId, {
      emailVerificationToken: token,
      emailVerificationExpires: expires,
    });
  }

  async markEmailAsVerified(userId: string): Promise<User> {
    await this.userRepo.update(userId, {
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    });
    return (await this.findById(userId))!;
  }

  async findByPasswordResetToken(token: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { passwordResetToken: token } });
  }

  async setPasswordResetToken(
    userId: string,
    token: string,
    expires: Date,
  ): Promise<void> {
    await this.userRepo.update(userId, {
      passwordResetToken: token,
      passwordResetExpires: expires,
    });
  }

  async resetPassword(userId: string, hashedPassword: string): Promise<void> {
    await this.userRepo.update(userId, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
    });
  }

  async updateCv(userId: string, cvData: Record<string, any>): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    user.cvData = cvData;
    return this.userRepo.save(user);
  }

  async updateJobsLastSyncedAt(userId: string): Promise<void> {
    await this.userRepo.update(userId, { jobsLastSyncedAt: new Date() });
  }

  async remove(userId: string): Promise<void> {
    await this.userRepo.delete(userId);
  }

  async exportApplicationsCsv(userId: string): Promise<string> {
    const applications = await this.applicationRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });

    const headers = [
      'Entreprise',
      'Poste',
      'Statut',
      'Source',
      'Lieu',
      'Salaire',
      'Date de candidature',
      'Dernier contact',
      'Notes',
      'Créée le',
    ];

    const rows = applications.map((a) => [
      a.company,
      a.jobTitle,
      STATUS_LABELS[a.status] ?? a.status,
      SOURCE_LABELS[a.source] ?? a.source,
      a.location ?? '',
      a.salary ?? '',
      formatDate(a.appliedAt),
      formatDate(a.lastContactAt),
      a.notes ?? '',
      formatDate(a.createdAt),
    ]);

    const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(','));

    const BOM = String.fromCharCode(0xfeff);
    return BOM + lines.join('\r\n');
  }
}
