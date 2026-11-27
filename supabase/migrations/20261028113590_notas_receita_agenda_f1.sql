-- NOTAS-RECEITA-AGENDA-01 · F1 (banco) · Code 1 · 27/11 — plano aprovado pelo Gabriel (F1–F5; pg_net no proto: SIM).
-- A busca da Receita passa a ser decidida por REGRA, não por lista: todo titular com certificado ATIVO e válido, de TODO cliente, é "devido"
-- quando o banco deixa (nao_antes_de, pedido em andamento, bloqueio 656 do mesmo CPF/CNPJ) e não está pausado.
-- · Esta fatia NÃO liga nada: só a extensão pg_net, a tabela de pausa, a função que diz quem está devido e o gatilho do certificado novo.
--   O job do pg_cron e a borda despachante `fiscal-dfe-agenda` vêm na F2 (lote próprio). Até lá os crons da sessão do Code seguem.
-- · Quem decide QUANDO buscar continua sendo `fiscal_dfe_controle` (o `nao_antes_de` que a borda grava: +1 h depois do 137). A agenda só
--   decide QUEM.
-- · Pausa: só a agenda escreve (service_role). Sem linha = não pausado. `ate` nulo = até subir outro certificado (cadeia/certificado).
-- · Subiu ou reativou o certificado: o gatilho limpa a pausa daquele titular, e ele cai na rodada seguinte da agenda (~5 min).
-- Nenhum dado de cliente muda.
-- DESFAZER: DROP TRIGGER trg_fiscal_certificado_agenda ON fiscal_certificados; DROP FUNCTION _fn_trg_fiscal_certificado_agenda();
--   DROP FUNCTION _fn_fiscal_dfe_devidos(integer); DROP TABLE fiscal_dfe_pausa; (a extensão pg_net pode ficar).

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- 1) pg_net: o banco chama a borda despachante (o job vem na F2)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2) A pausa da agenda (por titular)
CREATE TABLE public.fiscal_dfe_pausa (
  titular_id   uuid PRIMARY KEY REFERENCES public.fiscal_titulares(id),
  cliente_id   uuid NOT NULL REFERENCES public.clientes(id),
  motivo       text NOT NULL CHECK (motivo IN ('lambda_tempo', 'cadeia', 'certificado', 'sem_resposta', 'outro')),
  desde        timestamptz NOT NULL DEFAULT now(),
  ate          timestamptz,
  detalhe      text CHECK (length(detalhe) <= 300)
);
COMMENT ON TABLE public.fiscal_dfe_pausa IS
  'NOTAS-RECEITA-AGENDA-01: titular que a agenda da Receita pausou sozinha (motivo; ate nulo = até subir outro certificado). Só a agenda (service_role) grava.';
ALTER TABLE public.fiscal_dfe_pausa ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_dfe_pausa_ler ON public.fiscal_dfe_pausa FOR SELECT USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.fiscal_dfe_pausa FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fiscal_dfe_pausa TO authenticated;
GRANT ALL ON public.fiscal_dfe_pausa TO service_role;

-- 3) Quem está devido agora (só a agenda chama; fechada a quem usa o app)
CREATE FUNCTION public._fn_fiscal_dfe_devidos(p_limite integer DEFAULT 10)
RETURNS TABLE (titular_id uuid, cliente_id uuid, nunca_buscou boolean, ultima_busca_em timestamptz)
LANGUAGE sql STABLE SET search_path TO 'pg_catalog', 'public' AS $$
  with cert as (
    select c.titular_id, max(c.valido_ate) as valido_ate
      from public.fiscal_certificados c
     where c.situacao = 'ativo' and c.valido_ate > now() and (c.valido_de is null or c.valido_de <= now())
     group by c.titular_id
  ), base as (
    select t.id as titular_id, t.cliente_id, regexp_replace(coalesce(t.documento, ''), '\D', '', 'g') as doc,
           x.ultima_busca_em, x.nao_antes_de, x.em_andamento_desde
      from public.fiscal_titulares t
      join cert on cert.titular_id = t.id
      left join public.fiscal_dfe_controle x on x.titular_id = t.id
     where coalesce(t.ativo, true)
  ), livres as (
    select b.* from base b
     where (b.nao_antes_de is null or b.nao_antes_de <= now())
       and (b.em_andamento_desde is null or b.em_andamento_desde < now() - interval '5 minutes')
       and not exists (select 1 from public.fiscal_dfe_pausa p where p.titular_id = b.titular_id and (p.ate is null or p.ate > now()))
       -- o 656 é da Receita por CPF/CNPJ: outro titular com o mesmo documento ainda na espera do 656 segura este também
       and not exists (select 1 from public.fiscal_dfe_controle x2 join public.fiscal_titulares t2 on t2.id = x2.titular_id
                        where t2.id <> b.titular_id and b.doc <> '' and regexp_replace(coalesce(t2.documento, ''), '\D', '', 'g') = b.doc
                          and x2.ultimo_cstat = '656' and x2.nao_antes_de > now())
  ), um_por_documento as (
    select distinct on (case when doc = '' then titular_id::text else doc end) *
      from livres
     order by case when doc = '' then titular_id::text else doc end, ultima_busca_em asc nulls first
  )
  select u.titular_id, u.cliente_id, u.ultima_busca_em is null, u.ultima_busca_em
    from um_por_documento u
   order by u.ultima_busca_em asc nulls first
   limit greatest(1, least(coalesce(p_limite, 10), 50));
$$;
REVOKE ALL ON FUNCTION public._fn_fiscal_dfe_devidos(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_fiscal_dfe_devidos(integer) TO service_role;

-- 4) Certificado novo ou reativado: tira a pausa daquele titular (cai na rodada seguinte)
CREATE FUNCTION public._fn_trg_fiscal_certificado_agenda()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $$
BEGIN
  IF NEW.situacao = 'ativo' AND (TG_OP = 'INSERT' OR OLD.situacao IS DISTINCT FROM NEW.situacao
                                 OR OLD.impressao_digital IS DISTINCT FROM NEW.impressao_digital) THEN
    DELETE FROM public.fiscal_dfe_pausa WHERE titular_id = NEW.titular_id;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._fn_trg_fiscal_certificado_agenda() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_fiscal_certificado_agenda AFTER INSERT OR UPDATE OF situacao, impressao_digital ON public.fiscal_certificados
  FOR EACH ROW EXECUTE FUNCTION public._fn_trg_fiscal_certificado_agenda();
