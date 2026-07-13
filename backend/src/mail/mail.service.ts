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
      'OstIA <no-reply@ostia-app.com>',
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
    await this.send(
      to,
      'Confirmez votre adresse email - OstIA',
      `
        <p>Bonjour ${firstName},</p>
        <p>Merci de vous être inscrit sur OstIA. Cliquez sur le lien ci-dessous pour confirmer votre adresse email :</p>
        <p><a href="${link}">${link}</a></p>
        <p>Ce lien expire dans 24 heures.</p>
      `,
      'de vérification',
    );
  }

  async sendPasswordResetEmail(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const link = `${this.frontendUrl}/auth/reset-password?token=${token}`;
    await this.send(
      to,
      'Réinitialisez votre mot de passe - OstIA',
      `
        <p>Bonjour ${firstName},</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous pour en choisir un nouveau :</p>
        <p><a href="${link}">${link}</a></p>
        <p>Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      `,
      'de réinitialisation',
    );
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    logLabel: string,
  ): Promise<void> {
    this.logger.log(`Tentative d'envoi de l'email ${logLabel} à ${to}`);
    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html,
    });
    if (error) {
      this.logger.error(
        `Échec de l'envoi de l'email ${logLabel} à ${to}: name=${error.name} message=${error.message}`,
      );
      throw new Error(`Resend error: ${error.name} - ${error.message}`);
    }
    this.logger.log(
      `Email ${logLabel} envoyé à ${to}: id=${data?.id ?? '(inconnu)'}`,
    );
  }
}
