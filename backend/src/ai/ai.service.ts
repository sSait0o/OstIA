import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ApplicationSource } from '@applications/entities/application.entity';

export type StatusConfidence = 'high' | 'medium' | 'low';

export interface ParsedApplication {
  company: string;
  jobTitle: string;
  status: string;
  statusConfidence: StatusConfidence;
  source: ApplicationSource;
  emailId?: string;
  appliedAt?: string;
  notes?: string;
  location?: string;
}

export interface StatusUpdateResult {
  status: string | null;
  confidence: StatusConfidence;
}

export type EmailParseResult =
  | { kind: 'ok'; data: ParsedApplication }
  | { kind: 'not-relevant'; reason?: string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'failed'; reason: string };

export interface CvMatchResult {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
}

export const AI_MATCH_ERROR_SUMMARY = "Erreur d'analyse";

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
  ): Promise<EmailParseResult> {
    try {
      const { data } = await axios.post<Omit<ParsedApplication, 'source'>>(
        `${this.coreUrl}/cv/parse-email`,
        { subject: emailSubject, body: emailBody, emailId },
      );
      return {
        kind: 'ok',
        data: { ...data, source: ApplicationSource.EMAIL },
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 503) {
          return {
            kind: 'unavailable',
            reason:
              'AI service unavailable (rate limit/connection) after retries',
          };
        }
        if (err.response?.status === 400) {
          return {
            kind: 'not-relevant',
            reason: (err.response?.data as { detail?: string } | undefined)
              ?.detail,
          };
        }
      }
      return {
        kind: 'failed',
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async detectStatusUpdate(
    emailSubject: string,
    emailBody: string,
    company: string,
    jobTitle: string,
    currentStatus: string,
  ): Promise<StatusUpdateResult> {
    try {
      const { data } = await axios.post<StatusUpdateResult>(
        `${this.coreUrl}/cv/detect-status`,
        {
          subject: emailSubject,
          body: emailBody,
          company,
          jobTitle,
          currentStatus,
        },
      );
      return { status: data.status ?? null, confidence: data.confidence };
    } catch {
      return { status: null, confidence: 'low' };
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
        summary: AI_MATCH_ERROR_SUMMARY,
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
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 503) {
        throw new ServiceUnavailableException(
          "Service d'analyse IA temporairement indisponible, réessayez plus tard",
        );
      }
      throw err;
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
