import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';
import * as nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

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
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT', 587);

    // nodemailer's own DNS resolution (lib/shared/index.js) resolves both
    // A and AAAA records and picks a RANDOM address to connect to, ignoring
    // any `family` option (that field is dead code in nodemailer 9.x). Some
    // networks resolve Gmail's AAAA record but have no working IPv6 route,
    // causing an intermittent ENETUNREACH. `getSocket` bypasses nodemailer's
    // resolver entirely by handing it an already-connected IPv4 socket.
    const transportOptions: SMTPTransport.Options = {
      host,
      port,
      secure: this.configService.get('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
      getSocket: (_options, callback) => {
        const socket = net.connect({ host, port, family: 4 });
        socket.once('connect', () => callback(null, { connection: socket }));
        socket.once('error', (err) => callback(err, null));
      },
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
