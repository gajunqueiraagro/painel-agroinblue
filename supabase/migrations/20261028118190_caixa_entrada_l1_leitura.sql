-- CAIXA DE ENTRADA L1 — O TEXTO QUE A CAIXA JÁ LÊ (Gabriel 18/11 12:53, "tudo aprovado"; FILA 12:04/12:20).
--   A caixa (D3d) já extrai, no navegador, o texto de cada PDF que chega (pdfjs). Do que ela NÃO reconhece (nem boleto, nem nota, nem
--   documento da folha), o texto lido fica guardado aqui, para medir o que chega e ensinar o leitor (sem baixar arquivo à mão; o terminal
--   nunca lê o storage).
-- ⚠ F3 (Gabriel 13:25, FILA 13:38): TEXTO DE HOLERITE/FOLHA NÃO SE GUARDA AQUI — o documento da folha vai para `folha_documentos`
--   (FOLHA-01, Code 6; o leitor é um só, `lerFolha`). A tela não chama a gravação para o que reconheceu como folha, e o banco RECUSA o
--   texto com as marcas de um documento da folha (recibo de pagamento, holerite, demonstrativo, folha, 13º salário, férias, FGTS, eSocial).
--   1. entrada_leitura — uma linha por arquivo da entrada (o texto por página, a versão do leitor, o md5 do arquivo lido, quem/quando).
--      É DADO DERIVADO do arquivo (que segue intacto no armazenamento): a mesma versão do leitor sobre o mesmo arquivo não regrava; uma
--      versão nova do leitor substitui o texto (o arquivo é a fonte; nada de cliente se perde).
--   2. fn_entrada_leitura_gravar(entrada, leitor, resultado, páginas, simular) — a ÚNICA escrita (SECURITY DEFINER; tenant_ok → 42501;
--      a guarda do só leitura; só PDF; limites de tamanho). Leitura: SELECT pela RLS (tenant_ok), sem RPC.
-- ⚠ Mesmo o não reconhecido pode trazer dado pessoal: fica no cliente, sob a RLS por tenant, nunca em log.
-- NADA AQUI ALTERA entrada_arquivos, boletos nem lançamentos. Nenhuma linha de cliente muda ao aplicar.
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.entrada_leitura') is not null then raise exception 'CAIXA-L1: entrada_leitura já existe: refazer.'; end if;
  if to_regprocedure('public._fn_leitura_nao_grava()') is null then raise exception 'CAIXA-L1: falta a guarda _fn_leitura_nao_grava.'; end if;
end $$;

-- ═══ 1. a tabela ═══
create table public.entrada_leitura (
  entrada_id  uuid primary key references public.entrada_arquivos(id),
  cliente_id  uuid not null references public.clientes(id),
  md5         text not null,
  leitor      text not null check (length(leitor) between 1 and 40),
  resultado   text not null check (resultado in ('nada', 'imagem')),
  paginas     text[] not null check (cardinality(paginas) between 1 and 60),
  caracteres  int not null check (caracteres between 0 and 400000),
  lido_em     timestamptz not null default now(),
  lido_por    uuid
);
create index ix_entrada_leitura_cliente on public.entrada_leitura (cliente_id, lido_em);
alter table public.entrada_leitura enable row level security;
create policy entrada_leitura_select on public.entrada_leitura for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.entrada_leitura from public, anon, authenticated;
grant select on public.entrada_leitura to authenticated;
grant all on public.entrada_leitura to service_role;
create trigger trg_leitura_nao_grava before insert or delete or update on public.entrada_leitura
  for each statement execute function public._fn_leitura_nao_grava();

-- ═══ 2. a escrita ═══
create function public.fn_entrada_leitura_gravar(p_entrada_id uuid, p_leitor text, p_resultado text, p_paginas text[],
                                                 p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v entrada_arquivos; atual entrada_leitura; v_chars int;
begin
  select * into v from entrada_arquivos where id = p_entrada_id;
  if not found then raise exception 'Linha da entrada não encontrada.' using errcode = 'P0002'; end if;
  if not public.tenant_ok(v.cliente_id) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  if v.tipo is distinct from 'pdf' or v.md5 is null then raise exception 'Só o texto de um PDF que chegou se guarda.' using errcode = 'P0001'; end if;
  if nullif(btrim(p_leitor), '') is null or length(p_leitor) > 40 then raise exception 'Leitor inválido.' using errcode = 'P0001'; end if;
  if p_resultado is null or p_resultado not in ('nada', 'imagem') then raise exception 'Resultado inválido.' using errcode = 'P0001'; end if;
  if p_paginas is null or cardinality(p_paginas) not between 1 and 60 then raise exception 'De 1 a 60 páginas.' using errcode = 'P0001'; end if;
  select coalesce(sum(length(coalesce(x, ''))), 0) into v_chars from unnest(p_paginas) x;
  if v_chars > 400000 then raise exception 'Texto grande demais para guardar.' using errcode = 'P0001'; end if;
  /* F3: o documento da folha nunca se guarda aqui (vai para a Folha) */
  if array_to_string(p_paginas, ' ') ~* '(recibo de pagamento|holerite|demonstrativo de pagamento|folha de pagamento|13[ºo°]?\.? ?sal[aáÁ]rio|f[eéÉ]rias|fgts|e-?social)' then
    raise exception 'Documento da folha: vai para a Folha, não se guarda aqui.' using errcode = 'P0001';
  end if;

  select * into atual from entrada_leitura where entrada_id = v.id;
  if found and atual.leitor = btrim(p_leitor) and atual.md5 = v.md5 then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'ja_estava', true);
  end if;
  if not p_simular then
    insert into entrada_leitura (entrada_id, cliente_id, md5, leitor, resultado, paginas, caracteres, lido_em, lido_por)
    values (v.id, v.cliente_id, v.md5, btrim(p_leitor), p_resultado, p_paginas, v_chars, now(), auth.uid())
    on conflict (entrada_id) do update
      set md5 = excluded.md5, leitor = excluded.leitor, resultado = excluded.resultado, paginas = excluded.paginas,
          caracteres = excluded.caracteres, lido_em = excluded.lido_em, lido_por = excluded.lido_por;
  end if;
  return jsonb_build_object('ok', true, 'simulado', p_simular, 'ja_estava', false, 'substitui', found, 'caracteres', v_chars);
end $$;
revoke all on function public.fn_entrada_leitura_gravar(uuid, text, text, text[], boolean) from public, anon;
grant execute on function public.fn_entrada_leitura_gravar(uuid, text, text, text[], boolean) to authenticated;
