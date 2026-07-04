import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';
import * as util from 'util';
import * as nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

function formatSmtpLogArgs(args: unknown[]): string {
  return args
    .map((arg) => (typeof arg === 'string' ? arg : util.inspect(arg)))
    .join(' ');
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
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
    const secure = this.configService.get('SMTP_SECURE', 'false') === 'true';
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    this.logger.log(
      `Config SMTP chargée: host=${host ?? '(vide)'} port=${port} secure=${secure} user=${user ?? '(vide)'} pass=${pass ? '***' + pass.slice(-2) : '(vide)'} from=${this.from}`,
    );
    if (!host || !user || !pass) {
      this.logger.error(
        'Configuration SMTP incomplète (SMTP_HOST/SMTP_USER/SMTP_PASS) : les envois vont échouer.',
      );
    }

    // nodemailer's own DNS resolution (lib/shared/index.js) resolves both
    // A and AAAA records and picks a RANDOM address to connect to, ignoring
    // any `family` option (that field is dead code in nodemailer 9.x). Some
    // networks resolve Gmail's AAAA record but have no working IPv6 route,
    // causing an intermittent ENETUNREACH. `getSocket` bypasses nodemailer's
    // resolver entirely by handing it an already-connected IPv4 socket.
    const transportOptions: SMTPTransport.Options = {
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
      logger: {
        level: () => {},
        trace: (...args: unknown[]) =>
          this.logger.debug(`[SMTP trace] ${formatSmtpLogArgs(args)}`),
        debug: (...args: unknown[]) =>
          this.logger.debug(`[SMTP debug] ${formatSmtpLogArgs(args)}`),
        info: (...args: unknown[]) =>
          this.logger.log(`[SMTP info] ${formatSmtpLogArgs(args)}`),
        warn: (...args: unknown[]) =>
          this.logger.warn(`[SMTP warn] ${formatSmtpLogArgs(args)}`),
        error: (...args: unknown[]) =>
          this.logger.error(`[SMTP error] ${formatSmtpLogArgs(args)}`),
        fatal: (...args: unknown[]) =>
          this.logger.error(`[SMTP fatal] ${formatSmtpLogArgs(args)}`),
      },
      debug: true,
      getSocket: (_options, callback) => {
        this.logger.debug(
          `Ouverture socket SMTP vers ${host}:${port} (IPv4 forcé)`,
        );
        const socket = net.connect({ host, port, family: 4 });
        socket.once('connect', () => {
          this.logger.debug(`Socket SMTP connecté à ${host}:${port}`);
          callback(null, { connection: socket });
        });
        socket.once('error', (err) => {
          this.logger.error(
            `Échec de connexion socket SMTP vers ${host}:${port}: ${err.message}`,
            err.stack,
          );
          callback(err, null);
        });
      },
    };
    this.transporter = nodemailer.createTransport(transportOptions);

    this.transporter.verify((err, success) => {
      if (err) {
        this.logger.error(
          `Vérification SMTP échouée (transporter.verify): ${err.message}`,
          err.stack,
        );
      } else {
        this.logger.log(
          `Vérification SMTP réussie (transporter.verify): ${success}`,
        );
      }
    });
  }

  async sendVerificationEmail(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const link = `${this.frontendUrl}/auth/verify-email?token=${token}`;
    this.logger.log(`Tentative d'envoi de l'email de vérification à ${to}`);
    try {
      const info = await this.transporter.sendMail({
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
      this.logger.log(
        `Email de vérification envoyé à ${to}: messageId=${info.messageId} response=${info.response} accepted=${JSON.stringify(info.accepted)} rejected=${JSON.stringify(info.rejected)}`,
      );
    } catch (err) {
      const smtpErr = err as NodeJS.ErrnoException &
        Partial<SMTPTransport.SentMessageInfo> & {
          code?: string;
          command?: string;
          response?: string;
          responseCode?: number;
        };
      this.logger.error(
        `Échec de l'envoi de l'email de vérification à ${to}: ` +
          `message=${smtpErr.message} code=${smtpErr.code} command=${smtpErr.command} ` +
          `responseCode=${smtpErr.responseCode} response=${smtpErr.response}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}
