CREATE TABLE public.brokerage_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  label text NOT NULL DEFAULT 'Brokerage account',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brokerage_accounts TO authenticated;
GRANT ALL ON public.brokerage_accounts TO service_role;

ALTER TABLE public.brokerage_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own brokerage accounts"
  ON public.brokerage_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can link their own brokerage accounts"
  ON public.brokerage_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own brokerage accounts"
  ON public.brokerage_accounts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own brokerage accounts"
  ON public.brokerage_accounts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX brokerage_accounts_user_idx ON public.brokerage_accounts (user_id);