import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { JobOffer, JobSearchParams } from '../job-search.types';

interface AdzunaResult {
  id: string;
  title: string;
  company: { display_name: string };
  description: string;
  location: { display_name: string };
  salary_min?: number;
  salary_max?: number;
  contract_type?: string;
  redirect_url: string;
  created: string;
}

interface AdzunaResponse {
  results: AdzunaResult[];
  count: number;
}

const ADZUNA_UNSUPPORTED_CONTRACT_TYPES = new Set(['APP', 'PRO', 'SAI']);

export async function searchAdzunaJobs(
  params: JobSearchParams,
  configService: ConfigService,
): Promise<{ offers: JobOffer[]; total: number }> {
  const appId = configService.get<string>('ADZUNA_APP_ID');
  const appKey = configService.get<string>('ADZUNA_APP_KEY');

  if (!appId || !appKey) return { offers: [], total: 0 };

  const page = params.page || 1;
  const queryParams: Record<string, string | number> = {
    app_id: appId,
    app_key: appKey,
    results_per_page: 3,
    max_days_old: 30,
  };

  if (params.keywords) queryParams['what'] = params.keywords;
  if (params.location) queryParams['where'] = params.location;
  if (params.distance) queryParams['distance'] = params.distance;
  if (params.salaryMin) queryParams['salary_min'] = params.salaryMin;
  if (params.fullTime === true) queryParams['full_time'] = 1;
  if (params.fullTime === false) queryParams['part_time'] = 1;
  if (params.sortBy === 'date') queryParams['sort_by'] = 'date';
  else if (params.sortBy === 'pertinence')
    queryParams['sort_by'] = 'relevance';

  if (params.contractTypes?.length) {
    const isExpressible = params.contractTypes.some(
      (c) => !ADZUNA_UNSUPPORTED_CONTRACT_TYPES.has(c),
    );
    if (!isExpressible) return { offers: [], total: 0 };

    const hasPermanent = params.contractTypes.includes('CDI');
    const hasContract = params.contractTypes.some((c) =>
      ['CDD', 'MIS'].includes(c),
    );
    if (hasPermanent && !hasContract) queryParams['contract_type'] = 'permanent';
    else if (hasContract && !hasPermanent)
      queryParams['contract_type'] = 'contract';
  }

  const response = await axios.get<AdzunaResponse>(
    `https://api.adzuna.com/v1/api/jobs/fr/search/${page}`,
    { params: queryParams, timeout: 5000 },
  );

  const { results, count } = response.data;

  const offers: JobOffer[] = results.map((r) => {
    const salaryMin = r.salary_min ? Math.round(r.salary_min / 1000) : null;
    const salaryMax = r.salary_max ? Math.round(r.salary_max / 1000) : null;
    const salary =
      salaryMin && salaryMax
        ? `${salaryMin}k - ${salaryMax}k €/an`
        : salaryMin
          ? `${salaryMin}k+ €/an`
          : undefined;

    const contractType =
      r.contract_type === 'permanent'
        ? 'CDI'
        : r.contract_type === 'contract'
          ? 'CDD'
          : r.contract_type;

    return {
      title: r.title,
      company: r.company?.display_name || 'Non précisé',
      description: r.description,
      location: r.location?.display_name,
      salary,
      contractType,
      url: r.redirect_url,
      source: 'adzuna',
      externalId: `adzuna_${r.id}`,
      publishedAt: r.created,
    };
  });

  return { offers, total: count };
}
