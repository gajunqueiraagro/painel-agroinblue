-- NOTAS-RECEITA · CONSERTO DA CIÊNCIA AUTOMÁTICA (Gabriel 27/11, urgente — Santa Rita: 105 "Pede ciência" e as de novembro presas atrás de
-- 2 recusas 596 de notas antigas). A Receita só aceita a Ciência da Operação (210210) até 10 DIAS depois da nota: depois disso responde
-- cStat 596 ("Evento apresentado após o prazo permitido para o evento: [10 dias]") — medido no proto: aceitas com 0–1 dia, 596 com 60–92.
-- `fn_fiscal_dfe_ciencia_pendentes` (quem a ciência automática manda em cada busca) muda em DUAS coisas, e só nelas:
--   1. a ORDEM: das MAIS NOVAS para as mais antigas (antes: das mais antigas — as velhas, sempre 596, vinham primeiro e paravam a rodada);
--   2. o PRAZO: só as notas emitidas há até 10 dias (a que passou nunca mais recebe ciência: chamar a Receita para levar 596 é chamada jogada
--      fora). A nota fora do prazo aparece na lista como "Fora do prazo" (tela) e o XML completo vem por outro caminho (fornecedor / Caixa).
-- O resto é byte a byte o de antes: o parâmetro do produto, o certificado ativo, só resumo sem XML, sem evento com cStat, menos de 3 falhas,
-- o limite por busca. Nenhum dado de cliente muda.
-- DESFAZER: recriar a função com `order by x.emissao nulls last, x.chave` / `order by r.emissao nulls last, r.chave` e sem o filtro do prazo.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.fn_fiscal_dfe_ciencia_pendentes(p_titular_id uuid, p_ambiente text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_par public.fiscal_dfe_parametros;
  v_cert boolean;
  v_chaves text[];
begin
  select * into v_par from public.fiscal_dfe_parametros where id;
  if not coalesce(v_par.ciencia_automatica, false) then
    return jsonb_build_object('ligada', false, 'limite', 0, 'chaves', '[]'::jsonb, 'motivo', 'desligada');
  end if;
  select exists (select 1 from public.fiscal_certificados c join public.fiscal_titulares t on t.id = c.titular_id
                  where c.titular_id = p_titular_id and c.situacao = 'ativo' and c.valido_ate > now() and t.ativo) into v_cert;
  if not v_cert then
    return jsonb_build_object('ligada', true, 'limite', 0, 'chaves', '[]'::jsonb, 'motivo', 'sem_certificado');
  end if;
  select coalesce(array_agg(x.chave order by x.emissao desc nulls last, x.chave), '{}') into v_chaves
    from (select r.chave, r.emissao
            from public.fiscal_dfe_recebidos r
           where r.titular_id = p_titular_id and r.tipo = 'nfe' and r.situacao = 'resumo' and r.xml is null
             -- o prazo da Receita para a ciência: 10 dias da emissão (depois, cStat 596)
             and r.emissao >= now() - interval '10 days'
             and not exists (select 1 from public.fiscal_dfe_eventos e where e.titular_id = r.titular_id and e.chave = r.chave
                                                                         and e.ambiente = p_ambiente and e.cstat is not null)
             and (select count(*) from public.fiscal_dfe_eventos e where e.titular_id = r.titular_id and e.chave = r.chave
                                                                    and e.ambiente = p_ambiente and e.falha is not null) < 3
           order by r.emissao desc nulls last, r.chave
           limit v_par.ciencia_por_busca) x;
  return jsonb_build_object('ligada', true, 'limite', v_par.ciencia_por_busca, 'chaves', to_jsonb(v_chaves));
end
$function$;
