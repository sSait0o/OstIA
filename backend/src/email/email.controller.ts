import { Controller, Get, Post, Delete, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailService } from './email.service';

@ApiTags('Email')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get('connections')
  @ApiOperation({ summary: 'Lister les comptes email connectés' })
  getConnections(@Request() req: { user: any }) {
    return this.emailService.getConnections(req.user.id);
  }

  @Get('google/auth')
  @ApiOperation({ summary: "Démarrer l'authentification Gmail" })
  googleAuth(@Request() req: { user: any }) {
    return { url: this.emailService.getGoogleAuthUrl(req.user.id) };
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Callback OAuth2 Google' })
  async googleCallback(@Query('code') code: string, @Query('state') userId: string) {
    await this.emailService.handleGoogleCallback(code, userId);
    return { message: 'Compte Gmail connecté avec succès' };
  }

  @Get('microsoft/auth')
  @ApiOperation({ summary: "Démarrer l'authentification Outlook" })
  microsoftAuth(@Request() req: { user: any }) {
    return { url: this.emailService.getMicrosoftAuthUrl(req.user.id) };
  }

  @Get('microsoft/callback')
  @ApiOperation({ summary: 'Callback OAuth2 Microsoft' })
  async microsoftCallback(@Query('code') code: string, @Query('state') userId: string) {
    await this.emailService.handleMicrosoftCallback(code, userId);
    return { message: 'Compte Outlook connecté avec succès' };
  }

  @Post('sync/gmail')
  @ApiOperation({ summary: 'Synchroniser les emails Gmail (dossier Ostia)' })
  syncGmail(@Request() req: { user: any }) {
    return this.emailService.syncGmailEmails(req.user.id);
  }

  @Post('sync/outlook')
  @ApiOperation({ summary: 'Synchroniser les emails Outlook (dossier Ostia)' })
  syncOutlook(@Request() req: { user: any }) {
    return this.emailService.syncOutlookEmails(req.user.id);
  }

  @Delete('connections/:id')
  @ApiOperation({ summary: 'Déconnecter un compte email' })
  disconnect(@Request() req: { user: any }, @Param('id') id: string) {
    return this.emailService.disconnect(req.user.id, id);
  }
}
