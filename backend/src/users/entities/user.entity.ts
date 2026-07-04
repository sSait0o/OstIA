import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Application } from '../../applications/entities/application.entity';
import { EmailConnection } from '../../email/entities/email-connection.entity';
import { Job } from '../../jobs/entities/job.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Exclude()
  @Column()
  password: string;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  emailVerificationToken: string | null;

  @Exclude()
  @Column({ nullable: true, type: 'timestamptz' })
  emailVerificationExpires: Date | null;

  @Column({ nullable: true, type: 'jsonb' })
  cvData: Record<string, any>;

  @OneToMany(() => Application, (app) => app.user)
  applications: Application[];

  @OneToMany(() => EmailConnection, (conn) => conn.user)
  emailConnections: EmailConnection[];

  @OneToMany(() => Job, (job) => job.user)
  savedJobs: Job[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
