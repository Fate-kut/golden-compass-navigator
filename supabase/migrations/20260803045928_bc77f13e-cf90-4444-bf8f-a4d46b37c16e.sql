-- ============================================================
-- STAGE 2: additive schema prep. Reversible; no existing column
-- or policy is dropped or altered.
-- ============================================================

-- ---------- PART A1: currency ----------
ALTER TABLE public.profiles          ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'KES';
ALTER TABLE public.transactions      ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'KES';
ALTER TABLE public.user_investments  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'KES';

-- ---------- PART A2: KYC schema ----------
ALTER TABLE public.kyc_records ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'national_id';
ALTER TABLE public.kyc_records ADD COLUMN IF NOT EXISTS country       text NOT NULL DEFAULT 'KE';

-- ---------- PART A4: enabled markets ----------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS enabled_markets jsonb NOT NULL DEFAULT '["NSE"]'::jsonb;

-- ---------- PART A3: legal document versioning ----------
CREATE TABLE IF NOT EXISTS public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  version text NOT NULL,
  title text NOT NULL,
  summary text,
  is_draft boolean NOT NULL DEFAULT true,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);
GRANT SELECT ON public.legal_documents TO anon, authenticated;
GRANT ALL ON public.legal_documents TO service_role;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read published legal documents"
  ON public.legal_documents FOR SELECT
  USING (published_at IS NOT NULL);
CREATE POLICY "Admins manage legal documents"
  ON public.legal_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_legal_documents_updated_at
  BEFORE UPDATE ON public.legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.legal_documents (slug, version, title, summary, is_draft, published_at) VALUES
  ('terms',           '0.1.0-draft', 'Terms of Service',  'Draft terms of service pending Kenyan legal review.', true, now()),
  ('privacy',         '0.1.0-draft', 'Privacy Policy',    'Draft privacy policy pending Kenyan legal review.',   true, now()),
  ('risk-disclosure', '0.1.0-draft', 'Risk Disclosure',   'Draft risk disclosure pending CMA/legal review.',     true, now())
ON CONFLICT (slug, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_slug text NOT NULL,
  version text NOT NULL,
  context text NOT NULL DEFAULT 'kyc',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx ON public.legal_acceptances(user_id, document_slug);
GRANT SELECT, INSERT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own legal acceptances"
  ON public.legal_acceptances FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users record own legal acceptances"
  ON public.legal_acceptances FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ---------- PART C1: transaction limits ----------
CREATE TABLE IF NOT EXISTS public.transaction_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'default',
  currency text NOT NULL DEFAULT 'KES',
  daily_deposit_max numeric NOT NULL DEFAULT 150000,
  monthly_deposit_max numeric NOT NULL DEFAULT 1000000,
  daily_withdrawal_max numeric NOT NULL DEFAULT 150000,
  monthly_withdrawal_max numeric NOT NULL DEFAULT 1000000,
  daily_invest_max numeric NOT NULL DEFAULT 500000,
  single_txn_max numeric NOT NULL DEFAULT 150000,
  is_active boolean NOT NULL DEFAULT true,
  notes text DEFAULT 'TBD — placeholder threshold, pending compliance sign-off.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS transaction_limits_user_uniq ON public.transaction_limits(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transaction_limits_tier_uniq ON public.transaction_limits(tier) WHERE user_id IS NULL;
GRANT SELECT ON public.transaction_limits TO authenticated;
GRANT ALL ON public.transaction_limits TO service_role;
ALTER TABLE public.transaction_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read applicable limits"
  ON public.transaction_limits FOR SELECT TO authenticated
  USING (user_id IS NULL OR auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage limits"
  ON public.transaction_limits FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_transaction_limits_updated_at
  BEFORE UPDATE ON public.transaction_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.transaction_limits (user_id, tier, notes)
VALUES (NULL, 'default', 'TBD — placeholder thresholds for proof of concept. Replace with CMA/AML-approved caps before launch.')
ON CONFLICT DO NOTHING;

-- ---------- PART C1b: aml_flags review workflow ----------
ALTER TABLE public.aml_flags ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.aml_flags ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.aml_flags ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'medium';
ALTER TABLE public.aml_flags ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.aml_flags ADD COLUMN IF NOT EXISTS review_notes text;
GRANT SELECT, UPDATE ON public.aml_flags TO authenticated;
GRANT ALL ON public.aml_flags TO service_role;
ALTER TABLE public.aml_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read aml flags" ON public.aml_flags;
CREATE POLICY "Admins read aml flags"
  ON public.aml_flags FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins update aml flags" ON public.aml_flags;
CREATE POLICY "Admins update aml flags"
  ON public.aml_flags FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- PART D: fees & tax ----------
CREATE TABLE IF NOT EXISTS public.fee_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market text NOT NULL UNIQUE,
  commission_percent numeric NOT NULL DEFAULT 1.78,
  tax_percent numeric NOT NULL DEFAULT 5.0,
  min_commission numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'KES',
  label text NOT NULL DEFAULT 'illustrative rate — TBD pending broker agreement',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fee_config TO anon, authenticated;
GRANT ALL ON public.fee_config TO service_role;
ALTER TABLE public.fee_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active fee config"
  ON public.fee_config FOR SELECT
  USING (is_active);
CREATE POLICY "Admins manage fee config"
  ON public.fee_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_fee_config_updated_at
  BEFORE UPDATE ON public.fee_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.fee_config (market, commission_percent, tax_percent, min_commission, currency) VALUES
  ('NSE',    1.78, 5.0, 100, 'KES'),
  ('NGX',    1.50, 5.0, 0,   'KES'),
  ('JSE',    1.20, 5.0, 0,   'KES'),
  ('GSE',    1.50, 5.0, 0,   'KES'),
  ('GLOBAL', 0.50, 5.0, 0,   'USD')
ON CONFLICT (market) DO NOTHING;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS commission    numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax_withheld  numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS currency      text    NOT NULL DEFAULT 'KES';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS filled_at     timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_simulated  boolean NOT NULL DEFAULT true;

-- ---------- PART E4: config-driven broker mode ----------
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read app config"
  ON public.app_config FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Admins manage app config"
  ON public.app_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_app_config_updated_at
  BEFORE UPDATE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_config (key, value, description) VALUES
  ('broker_mode', '"mock"'::jsonb, 'MOCK: "mock" routes trades to the simulated broker. Set to "live" once a licensed broker integration exists.'),
  ('mock_broker', '{"fill_delay_ms":1200,"failure_rate":0.12,"volatility_pct":0.8}'::jsonb, 'MOCK: simulated broker behaviour tuning.')
ON CONFLICT (key) DO NOTHING;
