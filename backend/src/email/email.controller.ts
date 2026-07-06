import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  Redirect,
  Sse,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailService } from './email.service';
import { Observable } from 'rxjs';

@ApiTags('Email')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('email')
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('connections')
  @ApiOperation({ summary: 'Lister les comptes email connectés' })
  getConnections(@Request() req: { user: { id: string } }) {
    return this.emailService.getConnections(req.user.id);
  }

  @Get('sync/status')
  @ApiOperation({ summary: 'Récupérer la progression de synchronisation en cours' })
  getSyncStatus(@Request() req: { user: { id: string } }) {
    return this.emailService.getSyncStatus(req.user.id);
  }

  @Get('google/auth')
  @ApiOperation({ summary: "Démarrer l'authentification Gmail" })
  googleAuth(@Request() req: { user: { id: string } }) {
    return { url: this.emailService.getGoogleAuthUrl(req.user.id) };
  }

  @Get('microsoft/auth')
  @ApiOperation({ summary: "Démarrer l'authentification Outlook" })
  microsoftAuth(@Request() req: { user: { id: string } }) {
    return { url: this.emailService.getMicrosoftAuthUrl(req.user.id) };
  }

  @Delete('gmail/data')
  @ApiOperation({
    summary:
      "Supprimer les candidatures et l'historique de sync Gmail pour resynchroniser proprement",
  })
  resetGmailData(@Request() req: { user: { id: string } }) {
    return this.emailService.resetGmailData(req.user.id);
  }

  @Delete('outlook/data')
  @ApiOperation({
    summary:
      "Supprimer les candidatures et l'historique de sync Outlook pour resynchroniser proprement",
  })
  resetOutlookData(@Request() req: { user: { id: string } }) {
    return this.emailService.resetOutlookData(req.user.id);
  }

  @Delete('connections/:id')
  @ApiOperation({ summary: 'Déconnecter un compte email' })
  disconnect(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.emailService.disconnect(req.user.id, id);
  }
}

@ApiTags('Email')
@Controller('email')
export class EmailSseController {
  constructor(
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
  ) {}

  @Sse('sync/gmail/stream')
  @ApiOperation({ summary: 'Synchroniser Gmail avec progression SSE' })
  syncGmailStream(@Query('token') token: string): Observable<MessageEvent> {
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      return this.emailService.syncGmailStream(payload.sub);
    } catch {
      throw new UnauthorizedException();
    }
  }

  @Sse('sync/outlook/stream')
  @ApiOperation({ summary: 'Synchroniser Outlook avec progression SSE' })
  syncOutlookStream(@Query('token') token: string): Observable<MessageEvent> {
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      return this.emailService.syncOutlookStream(payload.sub);
    } catch {
      throw new UnauthorizedException();
    }
  }
}

@ApiTags('Email Callbacks')
@Controller('email')
export class EmailCallbackController {
  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  @Get('google/callback')
  @Redirect()
  @ApiOperation({ summary: 'Callback OAuth2 Google (public)' })
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    const userId = this.emailService.verifyOAuthState(state);
    if (!userId) throw new BadRequestException('Invalid OAuth state');
    await this.emailService.handleGoogleCallback(code, userId);
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:4200',
    );
    return { url: `${frontendUrl}/dashboard?gmail=connected` };
  }

  @Get('microsoft/callback')
  @Redirect()
  @ApiOperation({ summary: 'Callback OAuth2 Microsoft (public)' })
  async microsoftCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    const userId = this.emailService.verifyOAuthState(state);
    if (!userId) throw new BadRequestException('Invalid OAuth state');
    await this.emailService.handleMicrosoftCallback(code, userId);
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:4200',
    );
    return { url: `${frontendUrl}/dashboard?outlook=connected` };
  }
}
