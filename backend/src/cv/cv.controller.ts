import {
  Controller,
  Post,
  Get,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CvService } from './cv.service';
import { User } from '../users/entities/user.entity';

@ApiTags('CV')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cv')
export class CvController {
  constructor(private readonly cvService: CvService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Uploader et analyser un CV PDF' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async upload(
    @Request() req: { user: User },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier fourni');
    if (file.mimetype !== 'application/pdf')
      throw new BadRequestException('Le fichier doit être un PDF');
    return this.cvService.processAndSave(req.user, file);
  }

  @Get()
  @ApiOperation({ summary: 'Récupérer les données du CV analysé' })
  async getCv(@Request() req: { user: User }) {
    return this.cvService.getCvData(req.user.id);
  }
}
