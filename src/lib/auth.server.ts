import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function authenticateRequest(request: Request): Promise<{ userId: string; token: string } | Response> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "Unauthorized" }, 401);
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  return { userId: claims.claims.sub as string, token };
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
