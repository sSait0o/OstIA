import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import SMTPTransport = require('nodemailer/lib/smtp-transport');

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.from = this.configService.get<string>(
      'MAIL_FROM',
      'OstIA <no-reply@ostia.app>',
    );
    this.frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:4200',
    );
    // `family` isn't in @types/nodemailer but nodemailer forwards it to the
    // underlying socket connect() call; some networks resolve Gmail's AAAA
    // record but have no working IPv6 route, causing ENETUNREACH.
    const transportOptions: SMTPTransport.Options & { family?: number } = {
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      secure: this.configService.get('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
      family: 4,
    };
    this.transporter = nodemailer.createTransport(transportOptions);
  }

  async sendVerificationEmail(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const link = `${this.frontendUrl}/auth/verify-email?token=${token}`;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Confirmez votre adresse email - OstIA',
        html: `
          <p>Bonjour ${firstName},</p>
          <p>Merci de vous être inscrit sur OstIA. Cliquez sur le lien ci-dessous pour confirmer votre adresse email :</p>
          <p><a href="${link}">${link}</a></p>
          <p>Ce lien expire dans 24 heures.</p>
        `,
      });
    } catch (err) {
      this.logger.error(
        `Échec de l'envoi de l'email de vérification à ${to}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}
