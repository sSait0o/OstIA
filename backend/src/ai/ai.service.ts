import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ApplicationStatus, ApplicationSource } from '../applications/entities/application.entity';

export interface ParsedApplication {
  company: string;
  jobTitle: string;
  status: ApplicationStatus;
  source: ApplicationSource;
  emailId?: string;
  appliedAt?: string;
  notes?: string;
}

export interface CvMatchResult {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
}

@Injectable()
export class AiService {
  private readonly client: Anthropic;

  constructor(private readonly configService: ConfigService) {
    this.client = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  async parseEmailForApplication(
    emailSubject: string,
    emailBody: string,
    emailId: string,
  ): Promise<ParsedApplication | null> {
    const prompt = `Tu es un assistant qui analyse des emails de recrutement en français et en anglais.
Analyse cet email et extrais les informations de candidature.

Sujet: ${emailSubject}
Corps: ${emailBody.substring(0, 3000)}

Retourne UNIQUEMENT un objet JSON valide avec ces champs (null si l'email n'est pas lié à une candidature):
{
  "company": "nom de l'entreprise",
  "jobTitle": "intitulé du poste",
  "status": "APPLIED|ACKNOWLEDGED|INTERVIEW|TECHNICAL|OFFER|REJECTED",
  "appliedAt": "date ISO 8601 ou null",
  "notes": "résumé en 1 phrase"
}

Règles pour le statut:
- APPLIED: confirmation d'envoi de candidature
- ACKNOWLEDGED: accusé de réception
- INTERVIEW: invitation à un entretien
- TECHNICAL: test technique
- OFFER: offre d'emploi
- REJECTED: refus`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.company || !parsed.jobTitle) return null;

      return {
        ...parsed,
        source: ApplicationSource.EMAIL,
        emailId,
      };
    } catch {
      return null;
    }
  }

  async matchCvToJob(
    cvData: Record<string, any>,
    jobTitle: string,
    jobDescription: string,
  ): Promise<CvMatchResult> {
    const cvSummary = JSON.stringify(cvData, null, 2).substring(0, 2000);

    const prompt = `Tu es un expert en recrutement tech. Évalue la compatibilité entre ce CV et cette offre d'emploi.

CV:
${cvSummary}

Offre: ${jobTitle}
Description: ${jobDescription.substring(0, 2000)}

Retourne UNIQUEMENT un objet JSON valide:
{
  "score": 0-100,
  "matchedSkills": ["compétence1", "compétence2"],
  "missingSkills": ["compétence manquante1"],
  "summary": "résumé de la compatibilité en 1-2 phrases"
}`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { score: 0, matchedSkills: [], missingSkills: [], summary: '' };

      return JSON.parse(jsonMatch[0]);
    } catch {
      return { score: 0, matchedSkills: [], missingSkills: [], summary: 'Erreur d\'analyse' };
    }
  }

  async extractCvData(text: string): Promise<Record<string, any>> {
    const prompt = `Analyse ce CV et extrais les informations structurées.

CV:
${text.substring(0, 4000)}

Retourne UNIQUEMENT un objet JSON valide:
{
  "firstName": "",
  "lastName": "",
  "email": "",
  "skills": ["compétence1", "compétence2"],
  "languages": ["langue1"],
  "experience": [{"title": "", "company": "", "duration": "", "description": ""}],
  "education": [{"degree": "", "school": "", "year": ""}],
  "summary": "résumé du profil"
}`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const text2 = response.content[0].type === 'text' ? response.content[0].text : '{}';
      const jsonMatch = text2.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      return {};
    }
  }
}
