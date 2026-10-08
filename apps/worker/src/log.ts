/** One JSON line per log entry. Never pass RPC URLs or error objects that may contain them. */
export function log(msg: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...fields }));
}

export function errCode(e: unknown): string {
  const x = e as { code?: unknown; name?: unknown; shortMessage?: unknown };
  return String(x?.code ?? x?.name ?? 'error');
}
