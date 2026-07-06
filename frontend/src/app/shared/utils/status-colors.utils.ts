import { ApplicationStatus } from '../models/application.model';

interface StatusMeta {
  tag: string;
  hex: string;
  label: string;
}

const STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  APPLIED: { tag: 'default', hex: '#c8c8c8', label: 'Envoyée' },
  ACKNOWLEDGED: { tag: 'default', hex: '#c8c8c8', label: 'Reçue' },
  TECHNICAL: { tag: 'purple', hex: '#b37feb', label: 'Test technique' },
  INTERVIEW: { tag: 'orange', hex: '#ffc53d', label: 'Entretien' },
  OFFER: { tag: 'green', hex: '#52c41a', label: 'Offre' },
  REJECTED: { tag: 'red', hex: '#ff4d4f', label: 'Refusé' },
};

const DEFAULT_META: StatusMeta = { tag: 'default', hex: '#c8c8c8', label: '' };

export function getStatusTag(status: string): string {
  return (STATUS_META[status as ApplicationStatus] ?? DEFAULT_META).tag;
}

export function getStatusHex(status: string): string {
  return (STATUS_META[status as ApplicationStatus] ?? DEFAULT_META).hex;
}

export function getStatusLabel(status: string): string {
  return STATUS_META[status as ApplicationStatus]?.label ?? status;
}

export function getStatusMarkerColor(status: string, alpha = 0.9): string {
  const hex = getStatusHex(status);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
