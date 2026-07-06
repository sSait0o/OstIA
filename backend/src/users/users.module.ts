import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Application } from '../applications/entities/application.entity';
import { ApplicationEmail } from '../applications/entities/application-email.entity';
import { Job } from '../jobs/entities/job.entity';
import { EmailConnection } from '../email/entities/email-connection.entity';
import { EmailSyncRecord } from '../email/entities/email-sync-record.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Application,
      ApplicationEmail,
      Job,
      EmailConnection,
      EmailSyncRecord,
    ]),
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
