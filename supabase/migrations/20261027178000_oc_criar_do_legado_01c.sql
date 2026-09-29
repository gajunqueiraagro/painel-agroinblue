-- OC-CRIAR-DO-LEGADO-01c — as saidas sugeridas nao travam pela fazenda do lancamento financeiro; a OC fica na fazenda do gado.
--
-- POR QUE (caso real, NJ): lancamento 3c70ad6e "Venda 103 vacas", 28/03/25, R$ 433.980,00, Fernando Cesar Sanches, fazenda do
-- lancamento = Faz. Pureza. As saidas estao na Faz. Sto. Expedito: 020bc4cd (52 vacas, 219.096,60) e 11ccf2bf (51 vacas,
-- 214.883,40), destino "Fernando Cesar Sanches", sem OC — somam 433.980,00. O dialogo so' mostrava 85728552 (1 vaca da Pureza,
-- destino "Rodrigo Funcionario"), porque as sugestoes filtravam a MESMA FAZENDA do lancamento, e o criar recusava saida e
-- recebimento "de outra fazenda".
--
-- O QUE MUDA (decisao do Gabriel, 29/09/2026):
--   oc_criar_do_legado_sugestoes (e10fd157 -> 8fab586d): sai o filtro de fazenda das SAIDAS (as irmas do recebimento seguem na
--     fazenda do lancamento — nao pedido). O JSON de cada saida ganha fazenda_id, fazenda_nome, destino e `semelhanca` (trigram
--     destino x favorecido). DESTINO E' ORDENACAO, NAO FILTRO (a tela poe >= 0,3 primeiro).
--   oc_criar_do_legado (106d61a3 -> 722da435): a fazenda da OC = a das saidas marcadas; saidas de fazendas diferentes = pendencia
--     em portugues; saem as guardas "Recebimento ... e de outra fazenda" e "Saida ... e de outra fazenda". O LANCAMENTO FINANCEIRO
--     NAO E' ALTERADO (`_oc_vincular_recebimento` nao toca fazenda_id; as entregas novas nascem com a fazenda da saida).
--
-- ⚠ POR QUE O DESTINO NAO FILTRA — varredura antes x depois nas 62 saidas escolhidas pelos operadores em 38 OCs ja' criadas do
--   legado: destino = favorecido (normalizado) manteria 16 (sumiriam 46); trigram >= 0,3 manteria 40 (sumiriam 22); 5 tem destino
--   vazio. O destino e' texto livre: nome de fazenda ("Faz. Eldorado II"), apelido ("Valtinho", "Marmita") ou vazio. Sem filtro de
--   fazenda nem de destino, a lista tem media 3,7 saidas (p90 7, max 13) e nenhuma das 62 some.
--
-- METODO: patch guardado por md5 (CLAUDE.md, DRE-DESTAQUE-LAVOURA-01): guarda de origem, cada ancora exatamente 1x, guarda de
-- destino. O md5 de destino foi calculado NO BANCO com a mesma cadeia de replace (e, para as sugestoes, conferido tambem sobre o
-- corpo decodificado localmente). Reexecutar sobre um corpo ja' corrigido falha na guarda de origem — o comportamento certo.
--   oc_criar_do_legado_sugestoes  md5 ANTES e10fd15717a0910d2b5b7f2d25dff993 (3.143)  DEPOIS 8fab586dcf3f272b3910498d8d22a327 (3.918)
--   oc_criar_do_legado            md5 ANTES 106d61a38af1aac6c4425235b7d9623e (12.745) DEPOIS 722da4354d04ff44a45c727cd2a7749a (13.258)
--
-- ACL: CREATE OR REPLACE preserva a ACL, mas ela e' refeita no fim, explicita (REVOKE de PUBLIC/anon, GRANT a authenticated e
-- service_role) — o estado medido antes: {postgres=X, service_role=X, authenticated=X}. oc_criar_do_legado e' SECURITY DEFINER.
--
-- PROVA (BEGIN ... RAISE, 29/09/2026, como o Gabriel — request.jwt.claims + ROLE authenticated; arquivo prova_01c.sql md5
-- 5768ba9a, com esta migration INTEIRA dentro). ⚠ O caso mudou depois do briefing: as 20:55 o Gabriel moveu o 3c70ad6e para a
-- Sto. Expedito (editado_manual) e criou a OC d41cb91c. Dentro da prova o estado do briefing foi RECRIADO (lancamento na Pureza,
-- partes da d41cb91c canceladas, saidas soltas) e desfeito no fim:
--   ANTES   sugestoes: so' 85728552 (1 vaca, Pureza) · criar(020bc4cd + 11ccf2bf) recusado: "Saida 020bc4cd e de outra fazenda",
--           "Saida 11ccf2bf e de outra fazenda"
--   DEPOIS  md5 722da435 / 8fab586d, ACL igual ({postgres, service_role, authenticated})
--           sugestoes: 020bc4cd (52, 219.096,60, Sto. Expedito, "Fernando Cesar Sanches", semelhanca 1,00), 11ccf2bf (51,
--           214.883,40, Sto. Expedito, 1,00), 85728552 (1, 4.302, Pureza, "Rodrigo Funcionario", 0,02)
--           mistas (020bc4cd + 85728552): "As saídas marcadas são de fazendas diferentes (Faz. Pureza e Faz. Sto. Expedito): uma
--           OC por fazenda — desmarque as de uma delas"
--           criar(020bc4cd + 11ccf2bf) com p_dados.fazenda = PUREZA: ok, OC na Faz. Sto. Expedito, conta_corrente/fechada, lotes
--           219.096,60 + 214.883,40, entregas na Sto. Expedito; lancamento 3c70ad6e segue na PUREZA com 433.980,00 (nao alterado)
--   Rollback conferido depois: md5 106d61a3 / e10fd157, OC da prova inexistente, d41cb91c intacta (3 partes vivas, 2 saidas).

do $mig$
declare v_antes text; v_novo text; v_depois text;
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_criar_do_legado_sugestoes' and n.nspname = 'public';
  if md5(v_antes) <> 'e10fd15717a0910d2b5b7f2d25dff993' then
    raise exception 'oc_criar_do_legado_sugestoes nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes); end if;
  if (length(v_antes) - length(replace(v_antes, $a$           'fornecedor_id', s.fornecedor_id) order by s.data, s.id), '[]'::jsonb)
    into v_saidas
    from public.lancamentos s
   where s.cliente_id = v_primeiro.cliente_id and s.fazenda_id is not distinct from v_primeiro.fazenda_id
$a$, ''))) / length($a$           'fornecedor_id', s.fornecedor_id) order by s.data, s.id), '[]'::jsonb)
    into v_saidas
    from public.lancamentos s
   where s.cliente_id = v_primeiro.cliente_id and s.fazenda_id is not distinct from v_primeiro.fazenda_id
$a$) <> 1 then
    raise exception 'oc_criar_do_legado_sugestoes: a ancora 1 nao casa exatamente 1x. Migration abortada.'; end if;
  v_novo := replace(v_antes, $a$           'fornecedor_id', s.fornecedor_id) order by s.data, s.id), '[]'::jsonb)
    into v_saidas
    from public.lancamentos s
   where s.cliente_id = v_primeiro.cliente_id and s.fazenda_id is not distinct from v_primeiro.fazenda_id
$a$, $a$           'fornecedor_id', s.fornecedor_id, 'fazenda_id', s.fazenda_id, 'fazenda_nome', fz.nome, 'destino', s.fazenda_destino,
           -- OC-CRIAR-DO-LEGADO-01c: semelhanca (trigram) entre o destino da saida e o favorecido do recebimento; ORDENA, nao filtra
           'semelhanca', round(public.similarity(lower(public.unaccent(coalesce(s.fazenda_destino, ''))),
                                                 lower(public.unaccent(coalesce(fo.nome, ''))))::numeric, 2))
           order by s.data, s.id), '[]'::jsonb)
    into v_saidas
    from public.lancamentos s
    left join public.fazendas fz on fz.id = s.fazenda_id
    left join public.financeiro_fornecedores fo on fo.id = v_primeiro.favorecido_id
   -- OC-CRIAR-DO-LEGADO-01c: SEM filtro de fazenda — o gado pode ter saido de outra fazenda do cliente (NJ: lancamento na Pureza,
   -- saidas na Sto. Expedito). As 62 saidas ja' escolhidas em 38 OCs seguem todas na lista (varredura de 29/09/2026).
   where s.cliente_id = v_primeiro.cliente_id
$a$);
  execute 'CREATE OR REPLACE FUNCTION public.oc_criar_do_legado_sugestoes(p_recebimentos uuid[]) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO ''public'' AS $fn$' || v_novo || '$fn$';
  select prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_criar_do_legado_sugestoes' and n.nspname = 'public';
  if md5(v_depois) <> '8fab586dcf3f272b3910498d8d22a327' then
    raise exception 'oc_criar_do_legado_sugestoes: corpo resultante inesperado (md5 %). Esperado 8fab586dcf3f272b3910498d8d22a327.', md5(v_depois); end if;
end $mig$;

do $mig$
declare v_antes text; v_novo text; v_depois text;
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_criar_do_legado' and n.nspname = 'public';
  if md5(v_antes) <> '106d61a38af1aac6c4425235b7d9623e' then
    raise exception 'oc_criar_do_legado nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes); end if;
  if (length(v_antes) - length(replace(v_antes, $a$  v_rec uuid;
begin$a$, ''))) / length($a$  v_rec uuid;
begin$a$) <> 1 then
    raise exception 'oc_criar_do_legado: a ancora 1 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$  if v_fazenda is null then v_pend := v_pend || 'Informe a fazenda'::text; end if;$a$, ''))) / length($a$  if v_fazenda is null then v_pend := v_pend || 'Informe a fazenda'::text; end if;$a$) <> 1 then
    raise exception 'oc_criar_do_legado: a ancora 2 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$
    elsif v_fazenda is not null and r.fazenda_id is distinct from v_fazenda then
      v_pend := v_pend || format('Recebimento %s e de outra fazenda', left(r.id::text, 8)); end if;$a$, ''))) / length($a$
    elsif v_fazenda is not null and r.fazenda_id is distinct from v_fazenda then
      v_pend := v_pend || format('Recebimento %s e de outra fazenda', left(r.id::text, 8)); end if;$a$) <> 1 then
    raise exception 'oc_criar_do_legado: a ancora 3 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$      if v_fazenda is not null and r.fazenda_id is distinct from v_fazenda then
        v_pend := v_pend || format('Saida %s e de outra fazenda', left(r.id::text, 8)); end if;
$a$, ''))) / length($a$      if v_fazenda is not null and r.fazenda_id is distinct from v_fazenda then
        v_pend := v_pend || format('Saida %s e de outra fazenda', left(r.id::text, 8)); end if;
$a$) <> 1 then
    raise exception 'oc_criar_do_legado: a ancora 4 nao casa exatamente 1x. Migration abortada.'; end if;
  v_novo := replace(replace(replace(replace(v_antes, $a$  v_rec uuid;
begin$a$, $a$  v_rec uuid; v_fazendas_saidas uuid[];
begin$a$), $a$  if v_fazenda is null then v_pend := v_pend || 'Informe a fazenda'::text; end if;$a$, $a$  -- OC-CRIAR-DO-LEGADO-01c: a fazenda da OC e' a do GADO (das saidas marcadas), nao a do lancamento financeiro — que nao e' alterado.
  select array_agg(distinct s.fazenda_id) into v_fazendas_saidas
    from jsonb_array_elements(coalesce(p_saidas, '[]'::jsonb)) x
    join public.lancamentos s on s.id = nullif(x.value->>'lancamento_id', '')::uuid;
  if coalesce(array_length(v_fazendas_saidas, 1), 0) > 1 then
    v_pend := v_pend || format('As saídas marcadas são de fazendas diferentes (%s): uma OC por fazenda — desmarque as de uma delas',
      (select string_agg(coalesce(fz.nome, 'sem fazenda'), ' e ' order by fz.nome)
         from unnest(v_fazendas_saidas) f(id) left join public.fazendas fz on fz.id = f.id));
  elsif coalesce(array_length(v_fazendas_saidas, 1), 0) = 1 then
    v_fazenda := v_fazendas_saidas[1];
  end if;
  if v_fazenda is null then v_pend := v_pend || 'Informe a fazenda'::text; end if;$a$), $a$
    elsif v_fazenda is not null and r.fazenda_id is distinct from v_fazenda then
      v_pend := v_pend || format('Recebimento %s e de outra fazenda', left(r.id::text, 8)); end if;$a$, $a$ end if;$a$), $a$      if v_fazenda is not null and r.fazenda_id is distinct from v_fazenda then
        v_pend := v_pend || format('Saida %s e de outra fazenda', left(r.id::text, 8)); end if;
$a$, $a$$a$);
  execute 'CREATE OR REPLACE FUNCTION public.oc_criar_do_legado(p_cliente_id uuid, p_dados jsonb, p_criterio_valor text, p_valor_outro numeric, p_recebimentos uuid[], p_saidas jsonb, p_simular boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS $fn$' || v_novo || '$fn$';
  select prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_criar_do_legado' and n.nspname = 'public';
  if md5(v_depois) <> '722da4354d04ff44a45c727cd2a7749a' then
    raise exception 'oc_criar_do_legado: corpo resultante inesperado (md5 %). Esperado 722da4354d04ff44a45c727cd2a7749a.', md5(v_depois); end if;
end $mig$;

REVOKE ALL ON FUNCTION public.oc_criar_do_legado_sugestoes(p_recebimentos uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_criar_do_legado_sugestoes(p_recebimentos uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.oc_criar_do_legado(p_cliente_id uuid, p_dados jsonb, p_criterio_valor text, p_valor_outro numeric, p_recebimentos uuid[], p_saidas jsonb, p_simular boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_criar_do_legado(p_cliente_id uuid, p_dados jsonb, p_criterio_valor text, p_valor_outro numeric, p_recebimentos uuid[], p_saidas jsonb, p_simular boolean) TO authenticated, service_role;
