
-- Notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'compliance')
  );

-- Realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Trigger: notify on transaction status changes
CREATE OR REPLACE FUNCTION public.notify_transaction_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.notifications (user_id, type, title, body, metadata)
    VALUES (
      NEW.user_id,
      'transaction_' || COALESCE(NEW.status, 'update'),
      CASE NEW.status
        WHEN 'pending' THEN '⏳ Transaction pending'
        WHEN 'completed' THEN '✅ Transaction completed'
        WHEN 'failed' THEN '❌ Transaction failed'
        ELSE 'Transaction update'
      END,
      'Your ' || COALESCE(NEW.type, 'transaction') || ' of KES ' || NEW.amount::text || ' is ' || COALESCE(NEW.status, 'updated'),
      jsonb_build_object('transaction_id', NEW.id, 'amount', NEW.amount, 'type', NEW.type)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_transaction
AFTER INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.notify_transaction_change();

-- Trigger: notify on KYC status changes
CREATE OR REPLACE FUNCTION public.notify_kyc_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.notifications (user_id, type, title, body, metadata)
    VALUES (
      NEW.user_id,
      'kyc_' || NEW.status,
      CASE NEW.status
        WHEN 'approved' THEN '🎉 KYC Approved'
        WHEN 'rejected' THEN '⚠️ KYC Rejected'
        WHEN 'pending' THEN '🔍 KYC Under Review'
        ELSE 'KYC Update'
      END,
      COALESCE(NEW.review_notes, 'Your verification status has been updated to ' || NEW.status),
      jsonb_build_object('kyc_id', NEW.id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_kyc
AFTER UPDATE ON public.kyc_records
FOR EACH ROW EXECUTE FUNCTION public.notify_kyc_change();

-- Welcome notification on profile creation
CREATE OR REPLACE FUNCTION public.notify_welcome()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (
    NEW.id,
    'welcome',
    '⚓ Welcome aboard, ' || COALESCE(NULLIF(NEW.full_name, ''), 'Navigator'),
    'Your Golden Compass account is ready. Complete KYC to start investing.'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_welcome
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.notify_welcome();
