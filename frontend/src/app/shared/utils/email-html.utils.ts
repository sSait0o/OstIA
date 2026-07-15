import { SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

export function sanitizeEmailBody(sanitizer: DomSanitizer, body: string | null | undefined): string {
  return sanitizer.sanitize(SecurityContext.HTML, body ?? '') ?? '';
}

export function isEmailHtml(body: string | null | undefined): boolean {
  return !!body && /<[a-z][\s\S]*>/i.test(body);
}

export function emailSnippet(body: string | null | undefined, maxLength = 160): string {
  if (!body) return '';
  const plain = body
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength).trim()}…` : plain;
}
