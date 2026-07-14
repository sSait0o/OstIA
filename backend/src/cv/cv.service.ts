import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import pdfParse from 'pdf-parse';
import { AiService } from '@ai/ai.service';
import { UsersService } from '@users/users.service';
import { User } from '@users/entities/user.entity';

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly usersService: UsersService,
  ) {}

  async processAndSave(user: User, file: Express.Multer.File) {
    let pdfText: string;
    try {
      const pdfData = await pdfParse(file.buffer);
      pdfText = pdfData.text;
    } catch (error) {
      this.logger.error(
        `Échec de la lecture du PDF pour l'utilisateur ${user.id}: ${error instanceof Error ? error.message : error}`,
      );
      throw new BadRequestException(
        "Impossible de lire ce fichier PDF. Vérifiez qu'il n'est pas corrompu ou protégé.",
      );
    }

    if (!pdfText.trim()) {
      throw new BadRequestException(
        'Aucun texte détecté dans ce PDF. Les CV scannés en image ne sont pas supportés pour le moment.',
      );
    }

    let cvData: Record<string, unknown>;
    try {
      cvData = await this.aiService.extractCvData(pdfText);
    } catch (error) {
      this.logger.error(
        `Échec de l'extraction IA du CV pour l'utilisateur ${user.id}: ${error instanceof Error ? error.message : error}`,
      );
      throw new BadRequestException(
        "Impossible d'analyser le contenu de ce CV. Réessayez avec un autre fichier.",
      );
    }

    await this.usersService.updateCv(user.id, cvData);

    return { message: 'CV analysé avec succès', cvData };
  }

  async getCvData(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return { cvData: user.cvData };
  }
}
