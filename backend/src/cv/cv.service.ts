import { Injectable, NotFoundException } from '@nestjs/common';

const pdfParse: (
  buf: Buffer,
) => Promise<{ text: string }> = require('pdf-parse');
import { AiService } from '../ai/ai.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class CvService {
  constructor(
    private readonly aiService: AiService,
    private readonly usersService: UsersService,
  ) {}

  async processAndSave(user: User, file: Express.Multer.File) {
    const pdfData = await pdfParse(file.buffer);
    const cvData = await this.aiService.extractCvData(pdfData.text);

    await this.usersService.updateCv(user.id, cvData);

    return { message: 'CV analysé avec succès', cvData };
  }

  async getCvData(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return { cvData: user.cvData };
  }
}
