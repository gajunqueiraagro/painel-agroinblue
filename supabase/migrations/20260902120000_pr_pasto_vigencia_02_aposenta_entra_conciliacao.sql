-- PR-PASTO-VIGENCIA-02 — entra_conciliacao aposentado.
-- A coluna NÃO é dropada: fn_pastos_aplicaveis_mes ainda a lê, e drop é
-- irreversível. Forçada a true + default true; a vigência passa a ser a única
-- regra. Remoção da coluna, se vier, é PR próprio depois de auditar leitores.

UPDATE public.pastos SET entra_conciliacao = true WHERE entra_conciliacao IS DISTINCT FROM true;
ALTER TABLE public.pastos ALTER COLUMN entra_conciliacao SET DEFAULT true;

-- Correção de dado: Arrendamento (Sta. Maria) foi desativado como forma de
-- "encerrar"; a data_fim=2024-07-31 agora faz esse trabalho sozinha.
UPDATE public.pastos p SET ativo = true
  FROM public.fazendas f
 WHERE f.id = p.fazenda_id AND f.nome ILIKE '%Sta. Maria%' AND p.nome = 'Arrendamento';

COMMENT ON COLUMN public.pastos.entra_conciliacao IS
  'APOSENTADO (PR-PASTO-VIGENCIA-02, 19/08/2026). Forçado true. A vigência (data_inicio/data_fim) + ativo governam a aplicabilidade mensal. Não reintroduzir na UI.';
