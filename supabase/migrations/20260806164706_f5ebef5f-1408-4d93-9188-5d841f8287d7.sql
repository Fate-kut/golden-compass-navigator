CREATE TABLE public.watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  exchange text NOT NULL DEFAULT 'NSE',
  company text,
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX watchlists_user_symbol_idx ON public.watchlists (user_id, symbol, exchange);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlists TO authenticated;
GRANT ALL ON public.watchlists TO service_role;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own watchlist" ON public.watchlists FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());