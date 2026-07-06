import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { Application } from '../applications/entities/application.entity';
import { ApplicationEmail } from '../applications/entities/application-email.entity';
import { Job } from '../jobs/entities/job.entity';
import { EmailConnection } from '../email/entities/email-connection.entity';
import { EmailSyncRecord } from '../email/entities/email-sync-record.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,
    @InjectRepository(ApplicationEmail)
    private readonly applicationEmailRepo: Repository<ApplicationEmail>,
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    @InjectRepository(EmailConnection)
    private readonly emailConnectionRepo: Repository<EmailConnection>,
    @InjectRepository(EmailSyncRecord)
    private readonly emailSyncRecordRepo: Repository<EmailSyncRecord>,
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

  async exportUserData(userId: string) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    const [
      applications,
      savedJobs,
      emailConnections,
      applicationEmails,
      emailSyncRecords,
    ] = await Promise.all([
      this.applicationRepo.find({
        where: { user: { id: userId } },
        order: { createdAt: 'DESC' },
      }),
      this.jobRepo.find({
        where: { user: { id: userId }, isSaved: true },
        order: { createdAt: 'DESC' },
      }),
      this.emailConnectionRepo.find({ where: { user: { id: userId } } }),
      this.applicationEmailRepo.find({
        where: { user: { id: userId } },
        relations: { application: true },
        order: { receivedAt: 'ASC' },
      }),
      this.emailSyncRecordRepo.find({
        where: { user: { id: userId } },
        relations: { application: true },
        order: { createdAt: 'DESC' },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      cv: user.cvData ?? null,
      applications,
      savedJobs,
      emailConnections: emailConnections.map((c) => ({
        provider: c.provider,
        email: c.email,
        isActive: c.isActive,
        lastSyncedAt: c.lastSyncedAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      applicationEmails: applicationEmails.map((e) => ({
        applicationId: e.application?.id ?? null,
        provider: e.provider,
        subject: e.subject,
        body: e.body,
        statusDetected: e.statusDetected,
        receivedAt: e.receivedAt,
        createdAt: e.createdAt,
      })),
      emailSyncRecords: emailSyncRecords.map((r) => ({
        applicationId: r.application?.id ?? null,
        provider: r.provider,
        status: r.status,
        reason: r.reason,
        attemptCount: r.attemptCount,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  }
}
