const QUOTE_MARKERS: RegExp[] = [
  /\b(?:From|De)\s*:\s*\S+@\S+/i,
  /-{2,}\s*(?:Original Message|Forwarded message)\s*-{2,}/i,
  /\bLe\s.{0,60}?a écrit\s*:/i,
  /\bOn\s.{0,60}?wrote\s*:/i,
];

export function stripQuotedReply(text: string): string {
  let cutIndex = text.length;
  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(text);
    if (match && match.index < cutIndex) cutIndex = match.index;
  }
  return text.slice(0, cutIndex).trim();
}
