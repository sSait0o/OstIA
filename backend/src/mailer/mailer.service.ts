import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    this.fromAddress = this.configService.get<string>(
      'SMTP_FROM',
      'no-reply@ostia.app',
    );
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      secure: this.configService.get('SMTP_SECURE') === 'true',
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });
  }

  async sendVerificationEmail(to: string, verificationUrl: string) {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: 'Vérifiez votre adresse email',
        html: `<p>Bienvenue sur OstIA !</p><p>Cliquez sur le lien ci-dessous pour vérifier votre adresse email :</p><p><a href="${verificationUrl}">${verificationUrl}</a></p><p>Ce lien expire dans 24 heures.</p>`,
      });
    } catch (error) {
      this.logger.error('Failed to send verification email', error);
      throw error;
    }
  }
}
