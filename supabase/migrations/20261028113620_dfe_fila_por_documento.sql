-- NOTAS-RECEITA-BLOQUEIO-01 (Gabriel 27/11) — UMA FILA POR CPF/CNPJ no portão da Distribuição DF-e. A Receita conta o consumo (e o bloqueio 656
-- de 1 h) pelo CPF/CNPJ do interessado, não pelo nosso titular: dois titulares com o mesmo documento (o mesmo produtor em dois clientes, ou
-- cadastrado duas vezes) eram duas filas para a Receita. Hoje cada um dos 9 titulares tem documento próprio; a regra passa a valer sempre.
-- `fn_fiscal_dfe_pedido_abrir` (o portão por onde passam a agenda, a consulta por chave e o botão) muda em UMA coisa: além da espera e do
-- "em andamento" do PRÓPRIO titular, respeita os de qualquer outro titular com o MESMO documento (dígitos). O resto é byte a byte o de antes
-- (o ultNSU salvo segue sendo o devolvido). Nenhum dado de cliente muda. Permissão igual (só postgres/service_role).
-- DESFAZER: recriar a função sem o bloco "o MESMO documento" (o texto anterior está no ledger, 20261028113330 e seguintes).

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.fn_fiscal_dfe_pedido_abrir(p_titular_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  t public.fiscal_titulares;
  c public.fiscal_dfe_controle;
  v_doc text;
  o record;
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null then
    raise exception using errcode = 'P0001', message = 'Produtor não encontrado.';
  end if;
  insert into public.fiscal_dfe_controle (titular_id, cliente_id) values (t.id, t.cliente_id) on conflict (titular_id) do nothing;
  select * into c from public.fiscal_dfe_controle where titular_id = t.id for update;
  if c.nao_antes_de is not null and c.nao_antes_de > now() then
    return jsonb_build_object('pode', false, 'motivo', 'espera', 'ate', c.nao_antes_de, 'ultimo_cstat', c.ultimo_cstat);
  end if;
  if c.em_andamento_desde is not null and c.em_andamento_desde > now() - interval '5 minutes' then
    return jsonb_build_object('pode', false, 'motivo', 'em_andamento', 'desde', c.em_andamento_desde);
  end if;
  -- BLOQUEIO-01: o MESMO documento em outro titular segura este também (a Receita conta pelo CPF/CNPJ)
  v_doc := nullif(regexp_replace(coalesce(t.documento, ''), '\D', '', 'g'), '');
  if v_doc is not null then
    select x.nao_antes_de, x.em_andamento_desde, x.ultimo_cstat into o
      from public.fiscal_dfe_controle x join public.fiscal_titulares t2 on t2.id = x.titular_id
     where t2.id <> t.id and regexp_replace(coalesce(t2.documento, ''), '\D', '', 'g') = v_doc
       and ((x.nao_antes_de is not null and x.nao_antes_de > now())
            or (x.em_andamento_desde is not null and x.em_andamento_desde > now() - interval '5 minutes'))
     order by x.nao_antes_de desc nulls last
     limit 1;
    if found then
      if o.em_andamento_desde is not null and o.em_andamento_desde > now() - interval '5 minutes' then
        return jsonb_build_object('pode', false, 'motivo', 'em_andamento', 'desde', o.em_andamento_desde);
      end if;
      return jsonb_build_object('pode', false, 'motivo', 'espera', 'ate', o.nao_antes_de, 'ultimo_cstat', o.ultimo_cstat);
    end if;
  end if;
  update public.fiscal_dfe_controle set em_andamento_desde = now() where titular_id = t.id;
  return jsonb_build_object('pode', true, 'ult_nsu', c.ult_nsu, 'max_nsu', c.max_nsu, 'documento', t.documento);
end
$function$;
