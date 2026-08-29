-- PR-FIN-FIX-TRIGGERS-NORMALIZACAO-01
--
-- `financeiro_fornecedores.nome_normalizado` alimenta a busca do FornecedorSelect, a Mesa
-- de Revisao, o motor de sugestao da importacao por Excel e os pre-checks de duplicata.
-- Nove pontos do codigo leem essa coluna. Ela esta errada em 1.026 dos 6.779 registros.
--
-- DUAS FUNCOES, AS DUAS QUEBRADAS
--
--   normalize_fornecedor_nome  (trigger BEFORE INSERT)
--     Nao trata acento: manda `[^a-zA-Z0-9 ]` para espaco, e 'ç' vira espaco.
--     'Manutenção' -> 'MANUTEN O'.  Defeito VISIVEL.
--
--   fn_normalizar_nome_fornecedor  (trigger BEFORE INSERT OR UPDATE OF nome)
--     Faz TRANSLATE antes de limpar — o que parece certo. Mas as duas listas do
--     TRANSLATE tem comprimentos DIFERENTES: 48 acentos contra 50 substitutos (ha SEIS
--     'o' onde deveriam existir cinco, em cada bloco). O excedente desloca o mapeamento
--     de 'ú' em diante e de TODOS os maiusculos.
--     Medido no banco:  'Manutenção' -> 'Manutenuao'  ·  'Água' -> 'ngua'
--     Defeito ESCONDIDO, e por isso pior: 'MANUTENUAO' parece palavra.
--
-- Os dois triggers rodam em ordem alfabetica e o de INSERT-only vem depois, entao no
-- INSERT ele sobrescreve o outro. No UPDATE do nome so' o segundo roda — e' por isso que
-- registros ja' editados alguma vez tem valor diferente dos que nunca foram tocados.
--
-- A REFERENCIA PASSA A SER `unaccent`, ja instalada no schema public. Ela e' tabela de
-- transliteracao mantida pelo Postgres — nao ha lista escrita a mao para desalinhar, que
-- foi exatamente a falha das duas versoes anteriores.
--
--   upper(btrim(regexp_replace(regexp_replace(
--     unaccent(nome), '[^A-Za-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')))
--
--   ⚠ O `btrim` NAO E' ENFEITE. Sem ele '[META] Planejamento' viraria ' META PLANEJAMENTO'
--   com espaco a esquerda — o colchete inicial vira espaco. O sentinel criado em
--   PR-ZOO-META-FORNECEDOR-SENTINEL-01 esta hoje sem esse espaco porque a funcao que
--   trimava foi a ultima a rodar no INSERT. Sem `btrim` aqui, este PR o corromperia.
--
-- ORDEM DOS TRES PASSOS, e ela importa:
--   1. corrigir a funcao que fica
--   2. dropar o trigger errado
--   3. backfill
-- Entre 1 e 2 o INSERT ainda produz o defeito ANTIGO, que e' conhecido e visivel. A
-- ordem inversa produziria o defeito NOVO e escondido durante a janela.

BEGIN;

-- ── PASSO 1 — a funcao que fica passa a usar unaccent ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_normalizar_nome_fornecedor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.nome_normalizado := upper(btrim(
    regexp_replace(
      regexp_replace(public.unaccent(NEW.nome), '[^A-Za-z0-9 ]', ' ', 'g'),
      '\s+', ' ', 'g')));
  RETURN NEW;
END;
$function$;

-- ── PASSO 2 — o trigger que nao trata acento sai ───────────────────────────────
-- A funcao `normalize_fornecedor_nome` fica no banco: e' o unico consumidor dela, mas
-- remover funcao e' irreversivel sem migration nova, e o trigger dropado ja basta para
-- o defeito parar. Se ninguem a chamar em 30 dias, some numa limpeza propria.
DROP TRIGGER IF EXISTS trg_normalize_fornecedor_nome ON public.financeiro_fornecedores;

-- ── PASSO 3 — backup e backfill ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bkp_fin_normalizacao_01_20260829 (
  fornecedor_id        uuid PRIMARY KEY,
  cliente_id           uuid,
  nome                 text,
  nome_normalizado_ant text,
  gravado_em           timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.bkp_fin_normalizacao_01_20260829
  (fornecedor_id, cliente_id, nome, nome_normalizado_ant)
SELECT f.id, f.cliente_id, f.nome, f.nome_normalizado
  FROM public.financeiro_fornecedores f
 WHERE f.nome_normalizado IS DISTINCT FROM
       upper(btrim(regexp_replace(regexp_replace(
         public.unaccent(f.nome), '[^A-Za-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')))
ON CONFLICT (fornecedor_id) DO NOTHING;

-- ⚠ O UPDATE TOCA SO' `nome_normalizado`, e nao `nome`. O trigger corrigido dispara em
-- `UPDATE OF nome` — nao neste. O valor gravado e' o desta expressao, que e' a MESMA da
-- funcao: as duas formas chegam ao mesmo resultado, e escrever a coluna diretamente
-- evita reescrever `nome` (que mudaria `updated_at` de 1.026 linhas sem necessidade).
UPDATE public.financeiro_fornecedores f
   SET nome_normalizado = upper(btrim(regexp_replace(regexp_replace(
         public.unaccent(f.nome), '[^A-Za-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')))
 WHERE f.nome_normalizado IS DISTINCT FROM
       upper(btrim(regexp_replace(regexp_replace(
         public.unaccent(f.nome), '[^A-Za-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')));

COMMIT;
