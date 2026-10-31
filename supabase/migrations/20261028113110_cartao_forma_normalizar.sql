-- CARTAO-LANCAMENTO-01 (Gabriel 30/10/2026, decisão 1) — a forma de pagamento do cartão passa a UM valor: "Cartão de crédito"
-- (rótulo = valor gravado). As 4 grafias de hoje se juntam nele: 'Cartão', 'Cartão de Crédito', 'Credito', 'Cartão de Credito'.
-- 'Débito' e 'Cartão de Débito' ficam como estão. Só a forma muda: valor, datas, status, conciliação e classificação ficam iguais.
-- Antes (proto, 30/10 18:0x; vivos + cancelados): Agnaldo — Cartão 88, Cartão de Credito 260, Credito 84 · NJ — Cartão 223,
-- Cartão de Crédito 150 · Santa Rita — Cartão 171. Total 976 linhas (736 vivas). Todas saídas; 13 vivas em conta corrente.
-- Ensaio no proto (30/10, RAISE no fim): 976 linhas; depois só "Cartão de crédito" 976 e "Cartão de Débito" 9; nenhum gatilho recusou.
SET LOCAL statement_timeout = '120s';
SELECT set_config('app.via', 'CARTAO-LANCAMENTO-01: forma do cartão em um valor', true);

UPDATE public.financeiro_lancamentos_v2
   SET forma_pagamento = 'Cartão de crédito'
 WHERE forma_pagamento IN ('Cartão', 'Cartão de Crédito', 'Credito', 'Cartão de Credito');

-- As recorrências geram os lançamentos com a forma delas (OK do Gabriel 30/10 18:12: as 5 com 'Cartão' entram aqui)
UPDATE public.financeiro_recorrencias
   SET forma_pagamento = 'Cartão de crédito'
 WHERE forma_pagamento IN ('Cartão', 'Cartão de Crédito', 'Credito', 'Cartão de Credito');
