INSERT INTO public.app_config (key, value)
VALUES ('broker_mode', '"live"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;