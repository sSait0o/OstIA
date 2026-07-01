import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EncryptionModule } from './common/encryption.module';
import { MailerModule } from './mailer/mailer.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ApplicationsModule } from './applications/applications.module';
import { EmailModule } from './email/email.module';
import { JobsModule } from './jobs/jobs.module';
import { CvModule } from './cv/cv.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 60000, limit: 100 },
    ]),
    EncryptionModule,
    MailerModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => {
        const isProd = configService.get('NODE_ENV') === 'production';
        const databaseUrl = configService.get<string>('DATABASE_URL');
        const rejectUnauthorized =
          configService.get('DB_SSL_REJECT_UNAUTHORIZED', 'true') !== 'false';
        return {
          type: 'postgres' as const,
          ...(databaseUrl
            ? { url: databaseUrl }
            : {
                host: configService.get<string>('DB_HOST', 'localhost'),
                port: configService.get<number>('DB_PORT', 5432),
                username: configService.get<string>('DB_USER', 'ostia_user'),
                password: configService.get<string>(
                  'DB_PASSWORD',
                  'ostia_secret',
                ),
                database: configService.get<string>('DB_NAME', 'ostia'),
              }),
          ssl: isProd ? { rejectUnauthorized } : false,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: !isProd,
          logging: !isProd,
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    ApplicationsModule,
    EmailModule,
    JobsModule,
    CvModule,
    AiModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
