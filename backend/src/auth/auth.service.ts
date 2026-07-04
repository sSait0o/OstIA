import {
  Injectable,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/entities/user.entity';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
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
      // Unverified and past the verification window: this is an abandoned
      // signup (or a squatted email), not a real account — free it up rather
      // than locking the real owner out of registering forever.
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

  private isReclaimable(user: User): boolean {
    return (
      !user.isEmailVerified &&
      (!user.emailVerificationExpires ||
        user.emailVerificationExpires.getTime() < Date.now())
    );
  }

  private async issueVerificationToken(user: User) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await this.usersService.setVerificationToken(user.id, token, expires);
    // Fire-and-forget: the token is already persisted, so a slow/unreachable
    // mail provider must never block the HTTP response. MailService logs
    // failures itself; the user can request another send via resendVerification.
    void this.mailService
      .sendVerificationEmail(user.email, user.firstName, token)
      .catch(() => {});
  }
}
