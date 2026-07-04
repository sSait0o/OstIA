export function extractErrorMessage(err: unknown, fallback: string): string {
  return (
    (err as { error?: { message?: string } })?.error?.message || fallback
  );
}
