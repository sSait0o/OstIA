import {
  Injectable,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/entities/user.entity';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;
    if (!user.isEmailVerified) {
      throw new ForbiddenException(
        'Email non vérifié. Vérifiez votre boîte de réception.',
      );
    }
    return user;
  }

  login(user: User) {
    const payload = { sub: user.id, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      if (!this.isReclaimable(existing)) {
        throw new ConflictException('Email déjà utilisé');
      }
      await this.usersService.remove(existing.id);
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({ ...dto, password: hashed });
    await this.issueVerificationToken(user);

    return {
      message:
        'Compte créé. Vérifiez votre boîte de réception pour confirmer votre email.',
    };
  }

  async verifyEmail(token: string) {
    const user = await this.usersService.findByVerificationToken(token);
    if (
      !user ||
      !user.emailVerificationExpires ||
      user.emailVerificationExpires.getTime() < Date.now()
    ) {
      throw new BadRequestException('Lien de vérification invalide ou expiré');
    }
    await this.usersService.markEmailAsVerified(user.id);
    return { message: 'Email vérifié, vous pouvez maintenant vous connecter.' };
  }

  async resendVerification(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    if (user.isEmailVerified) {
      throw new ConflictException('Email déjà vérifié');
    }
    await this.issueVerificationToken(user);
    return { message: 'Email de vérification renvoyé' };
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (user) {
      await this.issuePasswordResetToken(user);
    }
    return {
      message:
        'Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.usersService.findByPasswordResetToken(token);
    if (
      !user ||
      !user.passwordResetExpires ||
      user.passwordResetExpires.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'Lien de réinitialisation invalide ou expiré',
      );
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await this.usersService.resetPassword(user.id, hashed);
    return { message: 'Mot de passe mis à jour, vous pouvez vous connecter.' };
  }

  private isReclaimable(user: User): boolean {
    return (
      !user.isEmailVerified &&
      (!user.emailVerificationExpires ||
        user.emailVerificationExpires.getTime() < Date.now())
    );
  }

  private issuePasswordResetToken(user: User) {
    return this.issueToken(
      user,
      PASSWORD_RESET_TOKEN_TTL_MS,
      (userId, token, expires) =>
        this.usersService.setPasswordResetToken(userId, token, expires),
      (u, token) =>
        this.mailService.sendPasswordResetEmail(u.email, u.firstName, token),
      "Envoi de l'email de réinitialisation",
    );
  }

  private issueVerificationToken(user: User) {
    return this.issueToken(
      user,
      VERIFICATION_TOKEN_TTL_MS,
      (userId, token, expires) =>
        this.usersService.setVerificationToken(userId, token, expires),
      (u, token) =>
        this.mailService.sendVerificationEmail(u.email, u.firstName, token),
      "Envoi de l'email de vérification",
    );
  }

  private async issueToken(
    user: User,
    ttlMs: number,
    persist: (userId: string, token: string, expires: Date) => Promise<void>,
    send: (user: User, token: string) => Promise<void>,
    actionLabel: string,
  ) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + ttlMs);
    await persist(user.id, token, expires);
    void send(user, token).catch((err) => {
      this.logger.warn(
        `${actionLabel} différé/échoué pour l'utilisateur ${user.id} (${user.email}): ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }
}
