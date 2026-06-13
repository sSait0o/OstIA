import { Injectable, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as pdfParse from 'pdf-parse';
import { AiService } from '../ai/ai.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class CvService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'cv');

  constructor(
    private readonly aiService: AiService,
    private readonly usersService: UsersService,
  ) {}

  async processAndSave(user: User, file: Express.Multer.File) {
    await fs.mkdir(this.uploadDir, { recursive: true });

    const filename = `${user.id}-${Date.now()}.pdf`;
    const filePath = path.join(this.uploadDir, filename);
    await fs.writeFile(filePath, file.buffer);

    const pdfData = await (pdfParse as unknown as (buf: Buffer) => Promise<{ text: string }>)(file.buffer);
    const cvData = await this.aiService.extractCvData(pdfData.text);

    await this.usersService.updateCv(user.id, filename, cvData);

    return { message: 'CV analysé avec succès', cvData };
  }

  async getCvData(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return { cvPath: user.cvPath, cvData: user.cvData };
  }
}
