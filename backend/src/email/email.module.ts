import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import {
  EmailController,
  EmailSseController,
  EmailCallbackController,
} from './email.controller';
import { EmailConnection } from './entities/email-connection.entity';
import { EmailSyncRecord } from './entities/email-sync-record.entity';
import { EmailSyncRecordsService } from './email-sync-records.service';
import { AiModule } from '@ai/ai.module';
import { ApplicationsModule } from '@applications/applications.module';
import { AuthModule } from '@auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailConnection, EmailSyncRecord]),
    AiModule,
    forwardRef(() => ApplicationsModule),
    AuthModule,
  ],
  providers: [EmailService, EmailSyncRecordsService],
  controllers: [EmailController, EmailSseController, EmailCallbackController],
  exports: [EmailService],
})
export class EmailModule {}
