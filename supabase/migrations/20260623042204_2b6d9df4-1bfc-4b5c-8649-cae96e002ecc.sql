CREATE OR REPLACE FUNCTION public.debit_wallet(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_balance NUMERIC;
BEGIN
  UPDATE profiles SET wallet_balance = wallet_balance - p_amount
  WHERE id = p_user_id AND wallet_balance >= p_amount
  RETURNING wallet_balance INTO new_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  RETURN new_balance;
END; $$;

CREATE OR REPLACE FUNCTION public.credit_wallet(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_balance NUMERIC;
BEGIN
  UPDATE profiles SET wallet_balance = wallet_balance + p_amount
  WHERE id = p_user_id RETURNING wallet_balance INTO new_balance;
  RETURN new_balance;
END; $$;