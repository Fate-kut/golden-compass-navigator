
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('investor', 'admin', 'compliance', 'auditor');

-- Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT UNIQUE,
  kyc_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (kyc_status IN ('not_started','pending','approved','rejected')),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Investment pools
CREATE TABLE public.investment_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  pool_type TEXT,
  current_nav DECIMAL(12,4) DEFAULT 100.0000,
  total_value DECIMAL(18,2) DEFAULT 0,
  total_units DECIMAL(18,4) DEFAULT 0,
  min_investment DECIMAL(12,2) DEFAULT 1000,
  exit_fee_percent DECIMAL(5,2) DEFAULT 0,
  holding_period_days INT DEFAULT 30,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.investment_pools ENABLE ROW LEVEL SECURITY;

-- User investments
CREATE TABLE public.user_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pool_id UUID NOT NULL REFERENCES public.investment_pools(id),
  units_owned DECIMAL(18,4) DEFAULT 0,
  invested_amount DECIMAL(18,2) DEFAULT 0,
  current_value DECIMAL(18,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, pool_id)
);
ALTER TABLE public.user_investments ENABLE ROW LEVEL SECURITY;

-- Transactions
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pool_id UUID REFERENCES public.investment_pools(id),
  type TEXT CHECK (type IN ('deposit','withdrawal')),
  amount DECIMAL(18,2) NOT NULL,
  mpesa_reference TEXT,
  mpesa_checkout_id TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- KYC records
CREATE TABLE public.kyc_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  national_id TEXT,
  date_of_birth DATE,
  address TEXT,
  employment_status TEXT,
  source_of_funds TEXT,
  annual_income_range TEXT,
  risk_disclosure_accepted BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.kyc_records ENABLE ROW LEVEL SECURITY;

-- Pool NAV history
CREATE TABLE public.pool_nav_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES public.investment_pools(id),
  nav_value DECIMAL(12,4) NOT NULL,
  admin_notes TEXT,
  recorded_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.pool_nav_history ENABLE ROW LEVEL SECURITY;

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- AML flags
CREATE TABLE public.aml_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES public.transactions(id),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_reason TEXT,
  amount DECIMAL(18,2),
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.aml_flags ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_investments_updated_at
  BEFORE UPDATE ON public.user_investments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  -- Default role: investor
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'investor');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- Profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- User roles: users can view own roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Investment pools: all authenticated users can view active pools
CREATE POLICY "Anyone can view active pools"
  ON public.investment_pools FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admins can manage pools
CREATE POLICY "Admins can manage pools"
  ON public.investment_pools FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- User investments
CREATE POLICY "Users can view own investments"
  ON public.user_investments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own investments"
  ON public.user_investments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own investments"
  ON public.user_investments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Transactions
CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- KYC records
CREATE POLICY "Users can view own kyc"
  ON public.kyc_records FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can submit kyc"
  ON public.kyc_records FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admins can view and update all KYC
CREATE POLICY "Admins can manage kyc"
  ON public.kyc_records FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Pool NAV history: all authenticated users can view
CREATE POLICY "Anyone can view nav history"
  ON public.pool_nav_history FOR SELECT
  TO authenticated
  USING (true);

-- Admins can insert nav history
CREATE POLICY "Admins can insert nav history"
  ON public.pool_nav_history FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Audit logs: admins only
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- AML flags: admins only
CREATE POLICY "Admins can view aml flags"
  ON public.aml_flags FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert aml flags"
  ON public.aml_flags FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed investment pools
INSERT INTO public.investment_pools (slug, name, pool_type, current_nav, total_value, total_units, min_investment, exit_fee_percent, holding_period_days)
VALUES
  ('bahari', 'Bahari Growth', 'Growth', 101.28, 2400000, 23698, 1000, 2.0, 30),
  ('stable-harbour', 'Stable Harbour', 'Stable', 100.42, 5100000, 50798, 500, 0.0, 7),
  ('alpha-ventures', 'Alpha Ventures', 'High Risk', 124.10, 890000, 7171, 5000, 3.0, 60);
