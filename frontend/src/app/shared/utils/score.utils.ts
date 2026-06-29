export function getScoreColor(score: number): string {
  if (score >= 70) return '#52c41a';
  if (score >= 40) return '#ffc53d';
  return '#ff4d4f';
}

export const scoreFormat = (percent: number) => `${percent}%`;
