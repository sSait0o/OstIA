import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const user = this.userRepo.create(dto);
    return this.userRepo.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { emailVerificationToken: token } });
  }

  async setVerificationToken(
    userId: string,
    token: string,
    expires: Date,
  ): Promise<void> {
    await this.userRepo.update(userId, {
      emailVerificationToken: token,
      emailVerificationExpires: expires,
    });
  }

  async markEmailAsVerified(userId: string): Promise<User> {
    await this.userRepo.update(userId, {
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    });
    return (await this.findById(userId))!;
  }

  async updateCv(userId: string, cvData: Record<string, any>): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    user.cvData = cvData;
    return this.userRepo.save(user);
  }
}
