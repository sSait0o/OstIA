import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
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
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.error(
        'RESEND_API_KEY manquante : les envois d’email vont échouer.',
      );
    }
    this.resend = new Resend(apiKey);
  }

  async sendVerificationEmail(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const link = `${this.frontendUrl}/auth/verify-email?token=${token}`;
    this.logger.log(`Tentative d'envoi de l'email de vérification à ${to}`);
    const { data, error } = await this.resend.emails.send({
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
    if (error) {
      this.logger.error(
        `Échec de l'envoi de l'email de vérification à ${to}: name=${error.name} message=${error.message}`,
      );
      throw new Error(`Resend error: ${error.name} - ${error.message}`);
    }
    this.logger.log(
      `Email de vérification envoyé à ${to}: id=${data?.id ?? '(inconnu)'}`,
    );
  }
}
