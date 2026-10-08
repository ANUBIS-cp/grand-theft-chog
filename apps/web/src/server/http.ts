/** JSON responses with no caching: game state changes every second. */
export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { 'Cache-Control': 'no-store', ...(init.headers ?? {}) } });
}

export function error(code: string, status = 400): Response {
  return json({ ok: false, error: code }, { status });
}
