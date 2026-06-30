import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import {
  EmailController,
  EmailSseController,
  EmailCallbackController,
} from './email.controller';
import { EmailConnection } from './entities/email-connection.entity';
import { AiModule } from '../ai/ai.module';
import { ApplicationsModule } from '../applications/applications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailConnection]),
    AiModule,
    forwardRef(() => ApplicationsModule),
    AuthModule,
  ],
  providers: [EmailService],
  controllers: [EmailController, EmailSseController, EmailCallbackController],
  exports: [EmailService],
})
export class EmailModule {}
