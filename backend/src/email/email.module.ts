import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { EmailController, EmailCallbackController } from './email.controller';
import { EmailConnection } from './entities/email-connection.entity';
import { AiModule } from '../ai/ai.module';
import { ApplicationsModule } from '../applications/applications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailConnection]),
    AiModule,
    ApplicationsModule,
  ],
  providers: [EmailService],
  controllers: [EmailController, EmailCallbackController],
  exports: [EmailService],
})
export class EmailModule {}
