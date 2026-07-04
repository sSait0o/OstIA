import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';

const mockUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-uuid-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    password: bcrypt.hashSync('password123', 10),
    isEmailVerified: true,
    ...overrides,
  }) as User;

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            setVerificationToken: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-jwt-token') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
  });

  describe('validateUser', () => {
    it('returns user when credentials are valid', async () => {
      const user = mockUser();
      usersService.findByEmail.mockResolvedValue(user);

      const result = await service.validateUser(user.email, 'password123');
      expect(result).toEqual(user);
    });

    it('returns null when user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const result = await service.validateUser(
        'unknown@example.com',
        'password',
      );
      expect(result).toBeNull();
    });

    it('returns null when password is wrong', async () => {
      const user = mockUser();
      usersService.findByEmail.mockResolvedValue(user);
      const result = await service.validateUser(user.email, 'wrongpassword');
      expect(result).toBeNull();
    });

    it('throws ForbiddenException when email is not verified', async () => {
      const user = mockUser({ isEmailVerified: false });
      usersService.findByEmail.mockResolvedValue(user);
      await expect(
        service.validateUser(user.email, 'password123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('login', () => {
    it('returns access token and user data', () => {
      const user = mockUser();
      const result = service.login(user);

      expect(jest.mocked(jwtService.sign)).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
      });
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.id).toBe(user.id);
      expect(result.user.email).toBe(user.email);
    });
  });

  describe('register', () => {
    it('creates user and sends a verification email when email is new', async () => {
      const user = mockUser();
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(user);

      const result = await service.register({
        email: user.email,
        password: 'password123',
        firstName: user.firstName,
        lastName: user.lastName,
      });

      expect(jest.mocked(usersService.create)).toHaveBeenCalled();
      expect(jest.mocked(usersService.setVerificationToken)).toHaveBeenCalled();
      expect(result.message).toBeDefined();
    });

    it('throws ConflictException when email already exists', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser());
      await expect(
        service.register({
          email: 'test@example.com',
          password: 'pass',
          firstName: 'A',
          lastName: 'B',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
