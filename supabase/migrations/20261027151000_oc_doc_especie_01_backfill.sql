-- OC-DOC-ESPECIE-01 — devolver a especie que o anexo sobrescreveu, em 13 documentos do financeiro
--
-- POR QUE
-- Na aba Documentos do lancamento (Financeiro V2), criar um documento JA com arquivo gravava a especie
-- certa e, no mesmo clique, o anexo a trocava por 'outro': `useLancamentoDocumentos.anexar` mandava
-- `especie: doc?.especie ?? 'outro'`, procurando o documento numa lista que, naquele clique, ainda era a
-- do render anterior e nao o conhecia. Defeito presente desde 4ccaadd2 (05/09/2026). O front foi
-- consertado no mesmo PR: o anexo nao fala mais de especie.
--
-- ⚠ E' REGISTRO DO SISTEMA, NAO PALPITE (decisao do Gabriel): a propria `fin_documento_registrar` monta
--   o nome como `especie || ' ' || numero` quando o nome vem vazio — e o formulario nunca manda nome. O
--   prefixo do nome e' a especie escolhida NA CRIACAO. Medido: TODOS os documentos criados com arquivo
--   num gesto so' (versao 2) estao em 'outro', e o nome de cada um diz outra coisa.
--
-- ⚠ SO' OS 13 DA FASE 0, POR ID. Os documentos com especie diferente do nome mas que NAO estao em
--   'outro' (ex.: nome "nf", especie comprovante) foram escolhidos a mao depois e NAO se tocam.
--   Documentos da OC nao se tocam.
-- ⚠ UM 14o APARECEU DEPOIS DA FASE 0 e NAO entra aqui: 3be1da9a ("nf 119306", Vera, 25/09 18:52) — o
--   mesmo defeito, criado enquanto o conserto nao subia. Fica para decisao do Gabriel.
--
-- TRILHA: uma linha em `audit_log` por documento (a tabela de documentos nao tem gatilho de auditoria),
--   de 'outro' para a especie, com o motivo. A versao do documento sobe (trava otimista de quem o tiver
--   aberto).
-- GUARDA: cada linha tem de estar em 'outro', viva, com o nome que a FASE 0 mediu; senao ABORTA.
--   Reexecutar ABORTA na primeira linha (ela ja' nao esta' em 'outro') — provado em rollback.
-- ⚠ REGISTRADA como `20260925220111` pelo apply_migration (timestamp do dia), nao com o do nome.

do $mig$
declare
  r record;
  n int := 0;
  v_motivo constant text := 'OC-DOC-ESPECIE-01: especie sobrescrita no anexo';
begin
  for r in
    select * from (values
      ('ad15f0ca-f5b9-440b-bc6d-71b28e6d8544'::uuid, 'nf 000.059.956', 'nf'),
      ('59907433-31c7-4ba8-97cb-4344a6e8683b'::uuid, 'nf 00.006.713', 'nf'),
      ('b4de455b-8654-428c-b7b5-4a074621812a'::uuid, 'nf 00.006.713', 'nf'),
      ('716395bb-bd0e-4b5f-aa41-0e7aafa80bf0'::uuid, 'nf 00.006.713', 'nf'),
      ('d66c902e-5a83-46c7-a951-2a3c680bacc7'::uuid, 'nf 00.006.713', 'nf'),
      ('71cd6b92-7faf-42da-8788-72644723a225'::uuid, 'nf 000.007.977', 'nf'),
      ('1ef94dcb-66f9-4c63-831b-b40f3e650567'::uuid, 'nf 000.007.981', 'nf'),
      ('94db870c-0786-47c4-a6f0-b3acb15ba29d'::uuid, 'nf 000.008.017', 'nf'),
      ('a748b6fa-c535-4517-a810-d2902ba57963'::uuid, 'nf 000.007.980', 'nf'),
      ('cf23eb3e-388b-452c-a9fd-148c70f942eb'::uuid, 'nf 000.003.344', 'nf'),
      ('a9b85b79-0227-41c0-ba78-c6809019fd1d'::uuid, 'comprovante', 'comprovante'),
      ('5290edd7-54c3-4eb2-934f-9c1d9a44b46a'::uuid, 'recibo Pedido Whats', 'recibo'),
      ('fdceeddc-0f0a-47d5-bf43-ee8387b08838'::uuid, 'nf 000.014.835', 'nf')
    ) as t(id, nome_esperado, especie_nova)
  loop
    if not exists (select 1 from public.financeiro_lancamento_documentos d
                    where d.id = r.id and d.especie = 'outro' and d.cancelado is not true and d.nome = r.nome_esperado) then
      raise exception 'Documento % nao esta como medido (outro, vivo, nome "%"). Migration abortada.', r.id, r.nome_esperado;
    end if;

    insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    select d.cliente_id, null, 'financeiro', 'editou', 'financeiro_lancamento_documentos', d.id, v_motivo,
           jsonb_build_object('especie', d.especie, 'versao', d.versao),
           jsonb_build_object('especie', r.especie_nova, 'versao', d.versao + 1, 'motivo', v_motivo)
      from public.financeiro_lancamento_documentos d where d.id = r.id;

    update public.financeiro_lancamento_documentos
       set especie = r.especie_nova, versao = versao + 1, updated_at = now()
     where id = r.id;
    n := n + 1;
  end loop;

  if n <> 13 then
    raise exception 'backfill tocou % documentos, esperado 13. Migration abortada.', n;
  end if;
end $mig$;
