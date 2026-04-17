UPDATE public.clientes
SET config = COALESCE(config, '{}'::jsonb) || '{"master_user_id": "2290944b-34e3-4b91-871c-81063411b9ee"}'::jsonb
WHERE id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';