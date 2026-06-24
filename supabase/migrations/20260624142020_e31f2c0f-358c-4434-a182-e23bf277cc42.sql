
-- 1. user_roles: lock down INSERT/UPDATE/DELETE to admins only
CREATE POLICY "Admins manage roles - insert" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles - update" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles - delete" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. user_investments: remove direct user UPDATE/INSERT - mutations go via service role
DROP POLICY IF EXISTS "Users can update own investments" ON public.user_investments;
DROP POLICY IF EXISTS "Users can insert own investments" ON public.user_investments;

-- 3. notifications: restrict insert policy to authenticated role only
DROP POLICY IF EXISTS "Admins insert notifications" ON public.notifications;
CREATE POLICY "Admins insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'compliance')
  );
-- also scope existing view/update policies to authenticated
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 4. Revoke EXECUTE on SECURITY DEFINER functions from PUBLIC/anon.
-- Trigger functions don't need direct EXECUTE.
REVOKE EXECUTE ON FUNCTION public.notify_welcome() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_kyc_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_transaction_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- has_role is used inside RLS policy expressions; grant only to authenticated.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
-- credit/debit wallet: ensure not callable by clients
REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric) FROM PUBLIC, anon, authenticated;
