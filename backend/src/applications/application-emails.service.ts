import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationEmail } from './entities/application-email.entity';
import { ApplicationStatus } from './entities/application.entity';
import { EmailProvider } from '@email/entities/email-connection.entity';
import { User } from '@users/entities/user.entity';
import { Application } from './entities/application.entity';

@Injectable()
export class ApplicationEmailsService {
  constructor(
    @InjectRepository(ApplicationEmail)
    private readonly repo: Repository<ApplicationEmail>,
  ) {}

  async record(
    userId: string,
    applicationId: string,
    provider: EmailProvider,
    externalMessageId: string,
    data: {
      subject: string | null;
      body: string | null;
      statusDetected: ApplicationStatus | null;
      receivedAt: Date | null;
    },
  ): Promise<void> {
    const existing = await this.repo.findOne({
      where: {
        application: { id: applicationId },
        provider,
        externalMessageId,
      },
    });
    if (existing) return;

    await this.repo.save(
      this.repo.create({
        user: { id: userId } as User,
        application: { id: applicationId } as Application,
        provider,
        externalMessageId,
        subject: data.subject,
        body: data.body,
        statusDetected: data.statusDetected,
        receivedAt: data.receivedAt,
      }),
    );
  }

  async findForApplication(
    userId: string,
    applicationId: string,
  ): Promise<ApplicationEmail[]> {
    return this.repo.find({
      where: { application: { id: applicationId }, user: { id: userId } },
      order: { receivedAt: 'ASC', createdAt: 'ASC' },
    });
  }
}
