const hits = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, maxRequests = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) { hits.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}
