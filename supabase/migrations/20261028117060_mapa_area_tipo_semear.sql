-- MAPA-AREA-TIPO-01 Q2 · 117060 (renumerada: 117040 e 117050 são do Code 4, MAPA-PIQUETES-01) — SEMEAR a memória da classificação (`fazenda_geometria_classificacoes`, 117030) com o que já está
-- classificado hoje (Gabriel 01/11: "sim, como migration à parte, com ensaio e o meu GO"), para o "Atualizar mapa" também não apagar as
-- classificações que já existiam antes da 117030.
-- Regra: todo polígono com tipo ≠ 'outra' vira uma lembrança (fazenda + nome normalizado → tipo/pasto). Nome repetido na mesma fazenda com
-- classificações DIFERENTES é ambíguo e fica de fora (não se chuta). Lembrança que já existe (gravada pelo escritor depois da 117030) vence.
-- NENHUM polígono muda; só a tabela nova recebe linhas. Autor nulo (`por`), o carimbo é o da migration.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

insert into public.fazenda_geometria_classificacoes (fazenda_id, cliente_id, chave, nome_original, tipo, pasto_id, por)
select s.fazenda_id, s.cliente_id, s.chave, s.nome_original, s.tipo, s.pasto_id, null
  from (
    select g.fazenda_id, g.cliente_id, public._fn_normalizar_texto(g.nome_original) as chave,
           min(g.nome_original) as nome_original, (array_agg(g.tipo))[1] as tipo, (array_agg(g.pasto_id))[1] as pasto_id
      from public.fazenda_geometrias g
     where g.tipo <> 'outra'
     group by g.fazenda_id, g.cliente_id, public._fn_normalizar_texto(g.nome_original)
    having count(distinct (g.tipo, g.pasto_id)) = 1
  ) s
on conflict (fazenda_id, chave) do nothing;
