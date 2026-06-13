import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CvService } from './cv.service';
import { CvController } from './cv.controller';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
    AiModule,
    UsersModule,
  ],
  providers: [CvService],
  controllers: [CvController],
})
export class CvModule {}
