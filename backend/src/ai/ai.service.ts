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
    this.coreUrl = this.configService.get<string>('CORE_API_URL') ?? 'http://localhost:8001';
  }

  async parseEmailForApplication(
    emailSubject: string,
    emailBody: string,
    emailId: string,
  ): Promise<ParsedApplication | null> {
    try {
      const { data } = await axios.post(`${this.coreUrl}/cv/parse-email`, {
        subject: emailSubject,
        body: emailBody,
        emailId,
      });
      return { ...data, source: ApplicationSource.EMAIL };
    } catch {
      return null;
    }
  }

  async matchCvToJob(
    cvData: Record<string, any>,
    jobTitle: string,
    jobDescription: string,
  ): Promise<CvMatchResult> {
    try {
      const { data } = await axios.post(`${this.coreUrl}/matching/score`, {
        cvData,
        jobTitle,
        jobDescription,
      });
      return data;
    } catch {
      return { score: 0, matchedSkills: [], missingSkills: [], summary: "Erreur d'analyse" };
    }
  }

  async extractCvData(text: string): Promise<Record<string, any>> {
    try {
      const { data } = await axios.post(`${this.coreUrl}/cv/extract`, { text });
      return data;
    } catch {
      return {};
    }
  }

  async computeAnalytics(applications: Record<string, any>[]): Promise<Record<string, any>> {
    try {
      const { data } = await axios.post(`${this.coreUrl}/analytics/stats`, { applications });
      return data;
    } catch {
      return {};
    }
  }
}
