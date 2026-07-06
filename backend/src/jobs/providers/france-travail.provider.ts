import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { JobOffer, JobSearchParams } from '../job-search.types';

interface FranceTravailToken {
  access_token: string;
  expires_in: number;
}

interface FranceTravailOffer {
  id: string;
  intitule: string;
  description: string;
  typeContratLibelle?: string;
  dateCreation?: string;
  entreprise?: { nom?: string };
  lieuTravail?: { libelle?: string };
  salaire?: { libelle?: string };
  origineOffre?: { urlOrigine?: string };
}

interface FranceTravailSearchResponse {
  resultats?: FranceTravailOffer[];
}

const FT_NATURE_CONTRAT_MAP: Record<string, string> = {
  APP: 'E2',
  PRO: 'FS',
};

const FT_ARRONDISSEMENT_CITY_DEPARTEMENTS: Record<string, string> = {
  '75056': '75',
  '69123': '69',
  '13055': '13',
};

export class FranceTravailClient {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(private readonly configService: ConfigService) {}

  private async getToken(): Promise<string> {
    if (this.token && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.token;
    }

    const clientId = this.configService.get<string>(
      'FRANCE_TRAVAIL_CLIENT_ID',
    )!;
    const clientSecret = this.configService.get<string>(
      'FRANCE_TRAVAIL_CLIENT_SECRET',
    )!;

    const response = await axios.post<FranceTravailToken>(
      'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'api_offresdemploiv2 o2dsoffre',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    this.token = response.data.access_token;
    this.tokenExpiry = new Date(
      Date.now() + (response.data.expires_in - 60) * 1000,
    );
    return this.token;
  }

  private async resolveToInseeCode(cityName: string): Promise<string | null> {
    try {
      const response = await axios.get<Array<{ code: string }>>(
        'https://geo.api.gouv.fr/communes',
        {
          params: {
            nom: cityName,
            fields: 'code',
            boost: 'population',
            limit: 1,
          },
          timeout: 3000,
        },
      );
      return response.data[0]?.code ?? null;
    } catch {
      return null;
    }
  }

  async search(
    params: JobSearchParams,
    perPage = 9,
  ): Promise<{ offers: JobOffer[]; total: number }> {
    const token = await this.getToken();
    const page = params.page || 1;
    const start = (page - 1) * perPage;

    const toFranceTravailDate = (date: Date) =>
      `${date.toISOString().split('.')[0]}Z`;
    const minCreationDate = toFranceTravailDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    );
    const maxCreationDate = toFranceTravailDate(new Date());

    const queryParams: Record<string, string> = {
      motsCles: params.keywords || '',
      range: `${start}-${start + perPage - 1}`,
      minCreationDate,
      maxCreationDate,
    };

    if (params.location) {
      const isDeptCode = /^\d{1,3}$/.test(params.location.trim());
      if (isDeptCode) {
        queryParams['departement'] = params.location;
      } else {
        const inseeCode = await this.resolveToInseeCode(params.location);
        const fallbackDept = inseeCode
          ? FT_ARRONDISSEMENT_CITY_DEPARTEMENTS[inseeCode]
          : undefined;
        if (fallbackDept) {
          queryParams['departement'] = fallbackDept;
        } else if (inseeCode) {
          queryParams['commune'] = inseeCode;
        }
      }
    }
    if (params.contractTypes?.length) {
      const typeContratValues = params.contractTypes.filter(
        (c) => !FT_NATURE_CONTRAT_MAP[c],
      );
      const natureContratValues = params.contractTypes
        .map((c) => FT_NATURE_CONTRAT_MAP[c])
        .filter((v): v is string => !!v);
      if (typeContratValues.length)
        queryParams['typeContrat'] = typeContratValues.join(',');
      if (natureContratValues.length)
        queryParams['natureContrat'] = natureContratValues.join(',');
    }
    if (params.experience) queryParams['experience'] = params.experience;
    if (params.distance) queryParams['distance'] = String(params.distance);
    if (params.fullTime === true) queryParams['tempsPlein'] = 'true';
    if (params.remote) queryParams['modesTravail'] = params.remote;
    if (params.sortBy === 'date') queryParams['tri'] = '1';

    const response = await axios.get<FranceTravailSearchResponse>(
      'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search',
      { headers: { Authorization: `Bearer ${token}` }, params: queryParams },
    );

    const contentRange =
      (response.headers as Record<string, string>)['content-range'] ?? '';
    const total = parseInt(contentRange.split('/')[1] ?? '0', 10) || 0;

    const resultats = response.data.resultats ?? [];
    const offers: JobOffer[] = resultats.map((offer) => ({
      title: offer.intitule,
      company: offer.entreprise?.nom || 'Non précisé',
      description: offer.description,
      location: offer.lieuTravail?.libelle,
      salary: offer.salaire?.libelle,
      contractType: offer.typeContratLibelle,
      url:
        offer.origineOffre?.urlOrigine ||
        `https://candidat.francetravail.fr/offres/recherche/detail/${offer.id}`,
      source: 'france_travail',
      externalId: offer.id,
      publishedAt: offer.dateCreation,
    }));

    return { offers, total };
  }
}
