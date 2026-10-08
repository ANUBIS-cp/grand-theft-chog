/** One JSON line per log entry. Never pass RPC URLs or error objects that may contain them. */
export function log(msg: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...fields }));
}

/** A short, safe description of an error: its code/name and viem's short message with any URL removed. */
export function errCode(e: unknown): string {
  const x = e as { code?: unknown; name?: unknown; shortMessage?: unknown; message?: unknown };
  const msg = String(x?.shortMessage ?? x?.message ?? '')
    .replace(/https?:\/\/\S+/g, '<url>')
    .slice(0, 160);
  return `${String(x?.code ?? x?.name ?? 'error')}${msg ? `: ${msg}` : ''}`;
}
