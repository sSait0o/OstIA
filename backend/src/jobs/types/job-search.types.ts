export interface JobSearchParams {
  keywords?: string;
  location?: string;
  contractTypes?: string[];
  experience?: string;
  distance?: number;
  fullTime?: boolean;
  remote?: string;
  salaryMin?: number;
  sortBy?: 'date' | 'pertinence';
  page?: number;
}

export interface JobOffer {
  title: string;
  company: string;
  description: string;
  location?: string;
  salary?: string;
  contractType?: string;
  url: string;
  source: string;
  externalId: string;
  publishedAt?: string;
}
