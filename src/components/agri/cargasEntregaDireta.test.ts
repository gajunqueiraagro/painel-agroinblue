/**
 * O que este teste trava — UMA LINHA É UMA CARGA, e a chave é o lançamento de venda.
 *
 * ⚠ NASCE DE UM NÚMERO QUE ESTAVA ERRADO NA TELA: o backfill gravou cada carga como DUAS colheitas
 * (uma por metade de talhão), e a lista do 01b mostrava 42 linhas para 21 cargas. O operador
 * conferia o romaneio contra uma lista que tinha o dobro das linhas do papel.
 * ⚠ A CHAVE É O `lancamento_id` DA VENDA, e é isso que o teste protege: agrupar pela NF juntaria
 * cargas diferentes da mesma nota (há notas com várias), e agrupar pelo ticket dependeria de
 * digitação. O lançamento é o que a RPC cria uma vez por carga.
 * ⚠ E O VALOR SE LÊ UMA VEZ, NUNCA SE SOMA: as duas metades apontam para o MESMO lançamento, então
 * somá-las contaria o mesmo dinheiro duas vezes. Este é o caso que mais barato quebra e mais caro
 * custa — o total da tela ficaria exatamente o dobro do extrato.
 */
import { describe, it, expect } from 'vitest';
import { agruparCargas } from '@/components/agri/CargasEntregaDireta';
import type { ColheitaRow, VendaDaCarga } from '@/hooks/useColheita';

const carga = (id: string, area: string, t: number, extra: Partial<ColheitaRow> = {}): ColheitaRow => ({
  id,
  safra_area_id: area,
  data_colheita: '2026-09-12',
  hora_chegada: null,
  peso_fazenda_kg: null,
  peso_bruto_kg: null,
  ticket_balanca: null,
  nf_produtor: '9365000',
  filial: null,
  local_estoque_id: null,
  peso_verde_kg: null,
  peso_seco_kg: null,
  umidade_pct: null,
  aflatoxina_ppb: null,
  sacas_boas: null,
  grao_roca_sacas: null,
  grao_roca_kg: null,
  renda_liquida_pct: null,
  taxa_secagem: null,
  valor_secagem: null,
  observacoes: null,
  toneladas: t,
  desconto_kg: 0,
  rendimento_g: 495,
  preco_g: 1.05,
  industria_id: 'ind-1',
  ...extra,
});

const nomes = new Map([['a1', 'IND.05'], ['a2', 'IND.06']]);
const fazendas = new Map([['a1', 'NJ'], ['a2', 'NJ']]);
const industrias = new Map([['ind-1', 'T Cortez']]);

describe('as colheitas viram cargas', () => {
  it('duas metades do mesmo lançamento são UMA carga', () => {
    const linhas = [carga('c1', 'a1', 10.55), carga('c2', 'a2', 10.55)];
    const venda = new Map<string, VendaDaCarga>([
      ['c1', { lancamento_id: 'L1', valor: 10966.73, status: 'programado' }],
      ['c2', { lancamento_id: 'L1', valor: 10966.73, status: 'programado' }],
    ]);
    const cargas = agruparCargas(linhas, venda, industrias, nomes, fazendas);

    expect(cargas).toHaveLength(1);
    /* ⚠ OS DOIS TALHÕES UNIDOS, em ordem alfabética — é o que a tela mostra na coluna Talhão. */
    expect(cargas[0].talhao).toBe('IND.05 · IND.06');
    /* A fazenda não se repete: as duas metades são do mesmo NJ. */
    expect(cargas[0].faz).toBe('NJ');
    expect(cargas[0].toneladas).toBeCloseTo(21.1, 2);
    /* ⚠ O VALOR NÃO DOBRA — o teste que justifica o arquivo. */
    expect(cargas[0].valor).toBe(10966.73);
    /* As duas colheitas ficam guardadas: editar e excluir agem sobre a carga inteira. */
    expect(cargas[0].ids).toEqual(['c1', 'c2']);
  });

  it('o rendimento é o da carga, nunca uma média das metades', () => {
    const linhas = [
      carga('c1', 'a1', 10.55, { rendimento_g: 495 }),
      carga('c2', 'a2', 10.55, { rendimento_g: 495 }),
    ];
    const venda = new Map<string, VendaDaCarga>([
      ['c1', { lancamento_id: 'L1', valor: 100, status: 'programado' }],
      ['c2', { lancamento_id: 'L1', valor: 100, status: 'programado' }],
    ]);
    expect(agruparCargas(linhas, venda, industrias, nomes, fazendas)[0].rendimento_g).toBe(495);
  });

  it('cargas de lançamentos diferentes não se juntam, mesmo na MESMA nota', () => {
    /* ⚠ O CASO QUE MATA O AGRUPAMENTO POR NF: as 11 notas do NJ cobrem 21 cargas. */
    const linhas = [carga('c1', 'a1', 10), carga('c2', 'a1', 12)];
    const venda = new Map<string, VendaDaCarga>([
      ['c1', { lancamento_id: 'L1', valor: 100, status: 'programado' }],
      ['c2', { lancamento_id: 'L2', valor: 120, status: 'realizado' }],
    ]);
    const cargas = agruparCargas(linhas, venda, industrias, nomes, fazendas);
    expect(cargas).toHaveLength(2);
    expect(cargas.map(c => c.valor).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([100, 120]);
  });

  it('carga sem elo fica sozinha e sem status — nunca "programado"', () => {
    /* ⚠ CARGA ANTERIOR À RPC não tem lançamento. Juntá-la a outra pela NF inventaria um vínculo
       que o banco não tem, e dar-lhe um status afirmaria o que não se sabe. */
    const linhas = [carga('c1', 'a1', 10), carga('c2', 'a2', 12)];
    const cargas = agruparCargas(linhas, new Map(), industrias, nomes, fazendas);
    expect(cargas).toHaveLength(2);
    expect(cargas.every(c => c.valor === null && c.status === null)).toBe(true);
  });

  it('o comprador vem do cadastro, e some quando a carga não tem indústria', () => {
    const linhas = [carga('c1', 'a1', 10), carga('c2', 'a2', 10, { industria_id: null })];
    const cargas = agruparCargas(linhas, new Map(), industrias, nomes, fazendas);
    expect(cargas.find(c => c.ids[0] === 'c1')?.comprador).toBe('T Cortez');
    expect(cargas.find(c => c.ids[0] === 'c2')?.comprador).toBe('');
  });
});
