import {
  BeforeInsert,
  BeforeUpdate,
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Application } from '../../applications/entities/application.entity';
import { EmailConnection } from '../../email/entities/email-connection.entity';
import { Job } from '../../jobs/entities/job.entity';
import { hmacEmail } from '../../common/crypto.util';
import {
  encryptedStringTransformer,
  encryptedJsonTransformer,
} from '../../common/encrypted.transformer';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', transformer: encryptedStringTransformer })
  email: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  emailHash: string;

  @Column({ type: 'text', transformer: encryptedStringTransformer })
  firstName: string;

  @Column({ type: 'text', transformer: encryptedStringTransformer })
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

  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  passwordResetToken: string | null;

  @Exclude()
  @Column({ nullable: true, type: 'timestamptz' })
  passwordResetExpires: Date | null;

  @Column({
    nullable: true,
    type: 'text',
    transformer: encryptedJsonTransformer,
  })
  cvData: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  jobsLastSyncedAt: Date | null;

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

  @BeforeInsert()
  @BeforeUpdate()
  computeEmailHash(): void {
    this.emailHash = hmacEmail(this.email);
  }
}
