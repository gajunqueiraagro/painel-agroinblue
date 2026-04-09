
CREATE TABLE public.bancos_referencia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_banco TEXT NOT NULL UNIQUE,
  nome_banco TEXT NOT NULL,
  nome_curto TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem_exibicao INTEGER NOT NULL DEFAULT 999,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bancos_referencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bancos"
  ON public.bancos_referencia FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage bancos"
  ON public.bancos_referencia FOR ALL
  TO authenticated USING (public.is_admin_agroinblue(auth.uid()));

INSERT INTO public.bancos_referencia (codigo_banco, nome_banco, nome_curto, ordem_exibicao) VALUES
  ('001', 'Banco do Brasil S.A.', 'Banco do Brasil', 1),
  ('104', 'Caixa Econômica Federal', 'Caixa', 2),
  ('341', 'Itaú Unibanco S.A.', 'Itaú', 3),
  ('237', 'Banco Bradesco S.A.', 'Bradesco', 4),
  ('033', 'Banco Santander (Brasil) S.A.', 'Santander', 5),
  ('756', 'Banco Cooperativo Sicoob S.A.', 'Sicoob', 6),
  ('748', 'Banco Cooperativo Sicredi S.A.', 'Sicredi', 7),
  ('260', 'Nu Pagamentos S.A.', 'Nubank', 8),
  ('077', 'Banco Inter S.A.', 'Inter', 9),
  ('208', 'Banco BTG Pactual S.A.', 'BTG Pactual', 10),
  ('422', 'Banco Safra S.A.', 'Safra', 11),
  ('336', 'Banco C6 S.A.', 'C6 Bank', 12),
  ('070', 'Banco de Brasília S.A.', 'BRB', 13),
  ('041', 'Banco do Estado do Rio Grande do Sul S.A.', 'Banrisul', 14),
  ('004', 'Banco do Nordeste do Brasil S.A.', 'Banco do Nordeste', 15),
  ('003', 'Banco da Amazônia S.A.', 'Banco da Amazônia', 16),
  ('102', 'XP Investimentos S.A.', 'XP', 17),
  ('212', 'Banco Original S.A.', 'Original', 18),
  ('707', 'Banco Daycoval S.A.', 'Daycoval', 19),
  ('389', 'Banco Mercantil do Brasil S.A.', 'Mercantil', 20),
  ('999', 'Outros', 'Outros', 999);
