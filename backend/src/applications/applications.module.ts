import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationsService } from './applications.service';
import { ApplicationEmailsService } from './application-emails.service';
import { ApplicationsController } from './applications.controller';
import { Application } from './entities/application.entity';
import { ApplicationEmail } from './entities/application-email.entity';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Application, ApplicationEmail]),
    forwardRef(() => EmailModule),
  ],
  providers: [ApplicationsService, ApplicationEmailsService],
  controllers: [ApplicationsController],
  exports: [ApplicationsService, ApplicationEmailsService],
})
export class ApplicationsModule {}
