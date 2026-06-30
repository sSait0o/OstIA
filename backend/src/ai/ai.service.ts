import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ApplicationSource } from '../applications/entities/application.entity';

export interface ParsedApplication {
  company: string;
  jobTitle: string;
  status: string;
  source: ApplicationSource;
  emailId?: string;
  appliedAt?: string;
  notes?: string;
  location?: string;
}

export interface CvMatchResult {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
}

@Injectable()
export class AiService {
  private readonly coreUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.coreUrl =
      this.configService.get<string>('CORE_API_URL') ?? 'http://localhost:8001';
  }

  async parseEmailForApplication(
    emailSubject: string,
    emailBody: string,
    emailId: string,
  ): Promise<ParsedApplication | null> {
    try {
      const { data } = await axios.post<Omit<ParsedApplication, 'source'>>(
        `${this.coreUrl}/cv/parse-email`,
        { subject: emailSubject, body: emailBody, emailId },
      );
      return { ...data, source: ApplicationSource.EMAIL };
    } catch {
      return null;
    }
  }

  async matchCvToJob(
    cvData: Record<string, unknown>,
    jobTitle: string,
    jobDescription: string,
  ): Promise<CvMatchResult> {
    try {
      const { data } = await axios.post<CvMatchResult>(
        `${this.coreUrl}/matching/score`,
        { cvData, jobTitle, jobDescription },
      );
      return data;
    } catch {
      return {
        score: 0,
        matchedSkills: [],
        missingSkills: [],
        summary: "Erreur d'analyse",
      };
    }
  }

  async extractCvData(text: string): Promise<Record<string, unknown>> {
    try {
      const { data } = await axios.post<Record<string, unknown>>(
        `${this.coreUrl}/cv/extract`,
        { text },
      );
      return data;
    } catch {
      return {};
    }
  }

  async computeAnalytics(
    applications: Record<string, unknown>[],
  ): Promise<Record<string, unknown>> {
    try {
      const { data } = await axios.post<Record<string, unknown>>(
        `${this.coreUrl}/analytics/stats`,
        { applications },
      );
      return data;
    } catch {
      return {};
    }
  }
}
