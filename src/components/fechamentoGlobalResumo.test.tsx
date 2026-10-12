import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  cabecasPorFazenda, mesCurto, mesDaFazenda, montarResumoGlobal, totalDoRebanho,
  type CardDoResumo, type FazendaDoResumo, type PastoDoResumo,
} from '@/lib/pecuaria/fechamentoGlobal';
import { COLUNAS_DO_RESUMO, FechamentoGlobalResumo, LARGURA_DA_TABELA } from './FechamentoGlobalResumo';

/* Cenário sintético: três fazendas ativas e uma inativa, mês pedido = 2031-03. */
const FAZENDAS: FazendaDoResumo[] = [
  { id: 'fz-b', nome: 'Beta', tem_pecuaria: true, status_operacional: 'ativa' },
  { id: 'fz-a', nome: 'Alfa', tem_pecuaria: true, status_operacional: 'ativa' },
  { id: 'fz-c', nome: 'Céu', tem_pecuaria: false, status_operacional: 'ativa' },
  { id: 'fz-x', nome: 'Inativa', tem_pecuaria: true, status_operacional: 'inativa' },
  { id: '__global__', nome: 'Global' },
];
const pasto = (id: string, fazenda: string, area: number, extra: Partial<PastoDoResumo> = {}): PastoDoResumo =>
  ({ id, fazenda_id: fazenda, ativo: true, tipo_uso: 'cria', area_produtiva_ha: area, data_inicio: null, data_fim: null, ...extra });
const PASTOS: PastoDoResumo[] = [
  pasto('a1', 'fz-a', 100), pasto('a2', 'fz-a', 50.5),
  pasto('b1', 'fz-b', 200), pasto('b2', 'fz-b', 30), pasto('b3', 'fz-b', 10, { data_fim: '2031-01-31' }), // b3 fora de março
  pasto('bd', 'fz-b', 0, { tipo_uso: 'divergencia' }),
  pasto('c1', 'fz-c', 40, { ativo: false }), // Céu não tem pasto ativo
  pasto('x1', 'fz-x', 999),
];
let n = 0;
const card = (fazenda: string, pastoId: string, anoMes: string, status: string): CardDoResumo =>
  ({ id: `k${++n}`, fazenda_id: fazenda, pasto_id: pastoId, ano_mes: anoMes, status });
const CARDS: CardDoResumo[] = [
  // Alfa: março fechado inteiro; fevereiro também
  card('fz-a', 'a1', '2031-03', 'fechado'), card('fz-a', 'a2', '2031-03', 'fechado'),
  card('fz-a', 'a1', '2031-02', 'fechado'), card('fz-a', 'a2', '2031-02', 'fechado'),
  // Beta: março com b1 fechado, b2 rascunho, divergência sem card; fevereiro inteiro fechado (b1, b2, bd)
  card('fz-b', 'b1', '2031-03', 'fechado'), card('fz-b', 'b2', '2031-03', 'rascunho'),
  card('fz-b', 'b1', '2031-02', 'fechado'), card('fz-b', 'b2', '2031-02', 'fechado'), card('fz-b', 'bd', '2031-02', 'fechado'),
  // card de pasto FORA da vigência em fevereiro não conta
  card('fz-b', 'b3', '2031-02', 'rascunho'),
  card('fz-x', 'x1', '2031-03', 'fechado'),
];
const resumo = () => montarResumoGlobal({ fazendas: FAZENDAS, pastos: PASTOS, cards: CARDS, ano: 2031, mes: 3 });
const idDe = (fazenda: string, pastoId: string, anoMes: string) =>
  CARDS.find(c => c.fazenda_id === fazenda && c.pasto_id === pastoId && c.ano_mes === anoMes)?.id ?? '';

describe('FECH-GLOBAL-RESUMO-01 — o dono puro', () => {
  it('inativa e Global fora; abertas no mês primeiro, depois o nome', () => {
    expect(resumo().linhas.map(l => l.nome)).toEqual(['Beta', 'Alfa', 'Céu']);
  });
  it('o mês de cada fazenda pelo critério da tela por fazenda', () => {
    const r = resumo();
    const [beta, alfa, ceu] = r.linhas;
    expect(alfa.mes).toEqual({ situacao: 'fechado', aFechar: 0 });
    /* Beta: b1 fechado; b2 em rascunho e o pasto de divergência sem card = 2 a fechar (o `pendentesCount` de lá) */
    expect(beta.mes).toEqual({ situacao: 'aberto', aFechar: 2 });
    expect(ceu.mes).toEqual({ situacao: 'sem_pastos', aFechar: 0 });
    expect(r.fechamentoDoMes).toEqual({ fechadas: 1, comPastos: 2 });
  });
  it('pastos e área: só pasto ativo e vigente no mês, sem o de divergência; totais = soma das linhas', () => {
    const r = resumo();
    const [beta, alfa, ceu] = r.linhas;
    expect([alfa.pastos, alfa.areaHa]).toEqual([2, 150.5]);
    expect([beta.pastos, beta.areaHa]).toEqual([2, 230]);
    expect([ceu.pastos, ceu.areaHa]).toEqual([0, 0]);
    expect(r.totais).toEqual({ pastos: 4, areaHa: 380.5 });
  });
  it('último fechamento: o mês fechado mais recente da janela, com os cards dos pastos DAQUELE mês', () => {
    const [beta, alfa, ceu] = resumo().linhas;
    expect(alfa.ultimo?.anoMes).toBe('2031-03');
    expect(beta.ultimo?.anoMes).toBe('2031-02');
    expect(beta.ultimo?.cardIds.sort()).toEqual([idDe('fz-b', 'b1', '2031-02'), idDe('fz-b', 'b2', '2031-02'), idDe('fz-b', 'bd', '2031-02')].sort());
    expect(ceu.ultimo).toBeNull();
  });
  it('a fita: verde = todas fechadas; âmbar = alguma aberta com card; neutro sem card', () => {
    const s = resumo().statusPorMes;
    expect(s[2]).toBe('fechado');
    expect(s[3]).toBe('rascunho');
    expect(s[4]).toBe('vazio');
    expect(Object.keys(s)).toHaveLength(12);
  });
  it('cabeças = soma dos itens dos cards contados; total nulo enquanto falta leitura; mês único x meses diferentes', () => {
    const r = resumo();
    const itens = [
      { fechamento_id: idDe('fz-a', 'a1', '2031-03'), quantidade: 100 }, { fechamento_id: idDe('fz-a', 'a2', '2031-03'), quantidade: 20 },
      { fechamento_id: idDe('fz-b', 'b1', '2031-02'), quantidade: 300 }, { fechamento_id: idDe('fz-b', 'bd', '2031-02'), quantidade: 5 },
      { fechamento_id: idDe('fz-b', 'b3', '2031-02'), quantidade: 999 }, // card fora da vigência: não entra
      { fechamento_id: idDe('fz-a', 'a1', '2031-02'), quantidade: 7 },    // outro mês: não entra
    ];
    const cab = cabecasPorFazenda(r.linhas, itens);
    expect(cab.get('fz-a')).toBe(120);
    expect(cab.get('fz-b')).toBe(305);
    expect(cab.has('fz-c')).toBe(false);
    expect(totalDoRebanho(r.linhas, cab)).toEqual({ total: 425, mes: null, fazendas: 2, mesesDiferentes: true });
    expect(totalDoRebanho(r.linhas, new Map([['fz-a', 120]])).total).toBeNull();
    expect(totalDoRebanho([r.linhas[1]], cab)).toMatchObject({ total: 120, mes: '2031-03', mesesDiferentes: false });
  });
  it('fazenda sem pasto no mês nunca é "fechada"; primeiro card do pasto é o que vale; mês curto', () => {
    expect(mesDaFazenda([], [], '2031-03').situacao).toBe('sem_pastos');
    const m = mesDaFazenda([pasto('p', 'f', 1)], [card('f', 'p', '2031-03', 'rascunho'), card('f', 'p', '2031-03', 'fechado')], '2031-03');
    expect(m.situacao).toBe('aberto');
    expect(mesCurto('2031-02')).toBe('fev/31');
  });
});

function montar(over: Partial<React.ComponentProps<typeof FechamentoGlobalResumo>> = {}) {
  const r = resumo();
  const cab = new Map([['fz-a', 120], ['fz-b', 305]]);
  const props = {
    resumo: r, cabecas: cab, lendo: false, lendoCabecas: false, erro: null, anoFiltro: '2031', setAnoFiltro: vi.fn(),
    anosDisp: ['2031', '2030'], mesFiltro: 3, setMesFiltro: vi.fn(), onAbrirFazenda: vi.fn(), ...over,
  };
  render(<FechamentoGlobalResumo {...props} />);
  return props;
}
const linhas = () => screen.getAllByTestId('linha-fazenda');

describe('FECH-GLOBAL-RESUMO-01 — o componente', () => {
  it('uma linha por fazenda ativa, na ordem, com status, último fechamento e o botão certo', () => {
    montar();
    expect(linhas().map(l => within(l).getByTestId('cel-fazenda').textContent)).toEqual(['Beta', 'Alfa', 'Céu']);
    const [beta, alfa, ceu] = linhas();
    expect(within(beta).getByTestId('cel-mes').textContent).toBe('aberto · 2 a fechar');
    expect(within(beta).getByTestId('abrir-fazenda').textContent).toBe('Abrir pastos →');
    expect(within(beta).getByTestId('cel-ultimo').textContent).toBe('fev/31 · 305');
    expect(within(alfa).getByTestId('cel-mes').textContent).toBe('fechado');
    expect(within(alfa).getByTestId('abrir-fazenda').textContent).toBe('Ver pastos →');
    expect(within(alfa).getByTestId('cel-cabecas').textContent).toBe('120');
    expect(within(alfa).getByTestId('cel-area').textContent).toBe('150,5');
    /* sem dono, "—": Céu não tem pasto, nem fechamento, nem a marca de pecuária */
    expect(within(ceu).getByTestId('cel-mes').textContent).toBe('—');
    expect(within(ceu).getByTestId('cel-cabecas').textContent).toBe('—');
    expect(within(ceu).getByTestId('cel-ultimo').textContent).toBe('—');
    expect(ceu.textContent).toContain('—');
  });
  it('rodapé e cartões: os totais do dono (soma das linhas)', () => {
    montar();
    expect(screen.getByTestId('total-cabecas').textContent).toBe('425');
    expect(screen.getByTestId('total-area').textContent).toBe('380,5');
    expect(screen.getByTestId('total-pastos').textContent).toBe('4');
    expect(screen.getByTestId('total-mes').textContent).toBe('1 de 2 fechadas');
    expect(screen.getByTestId('cartao-rebanho').textContent).toContain('425');
    expect(screen.getByTestId('cartao-rebanho').textContent).toContain('meses diferentes');
    expect(screen.getByTestId('cartao-area').textContent).toContain('380,5');
    expect(screen.getByTestId('cartao-pastos').textContent).toContain('4');
    expect(screen.getByTestId('cartao-fechamento').textContent).toContain('1 de 2 fazendas');
  });
  it('cabeças que ainda não chegaram são "…", nunca soma parcial; leitura que falhou é "—"', () => {
    montar({ cabecas: new Map([['fz-a', 120]]), lendoCabecas: true });
    expect(screen.getByTestId('total-cabecas').textContent).toBe('…');
    expect(within(linhas()[0]).getByTestId('cel-cabecas').textContent).toBe('…');
  });
  it('a fita: fevereiro verde, março (selecionado) azul, abril neutro; clicar no mês chama setMesFiltro', () => {
    const p = montar();
    const fev = screen.getByText('Fev').closest('button') as HTMLButtonElement;
    const mar = screen.getByText('Mar').closest('button') as HTMLButtonElement;
    const abr = screen.getByText('Abr').closest('button') as HTMLButtonElement;
    expect(fev.className).toContain('bg-[#EAF3DE]');
    expect(mar.className).toContain('bg-[#185FA5]');
    expect(abr.className).toContain('bg-muted');
    fireEvent.click(fev);
    expect(p.setMesFiltro).toHaveBeenCalledWith(2);
  });
  it('março NÃO selecionado e com fazenda aberta fica âmbar', () => {
    montar({ mesFiltro: 5 });
    expect((screen.getByText('Mar').closest('button') as HTMLButtonElement).className).toContain('bg-[#FAEEDA]');
  });
  it('clicar na linha ou no botão abre AQUELA fazenda', () => {
    const p = montar();
    fireEvent.click(within(linhas()[0]).getByTestId('abrir-fazenda'));
    expect(p.onAbrirFazenda).toHaveBeenCalledTimes(1);
    expect(p.onAbrirFazenda).toHaveBeenLastCalledWith('fz-b');
    fireEvent.click(within(linhas()[1]).getByTestId('cel-fazenda'));
    expect(p.onAbrirFazenda).toHaveBeenLastCalledWith('fz-a');
  });
  it('contrato de layout: colgroup em px somando a largura da tabela (cabe em 1.100), linhas de 22px, cards de 46px', () => {
    montar();
    const soma = COLUNAS_DO_RESUMO.map(c => c.largura).reduce((a, b) => a + b, 0);
    expect(soma).toBe(LARGURA_DA_TABELA);
    expect(LARGURA_DA_TABELA).toBeLessThanOrEqual(1100 - 176 - 64); // janela − barra lateral − respiros
    const tabela = screen.getByTestId('tabela-do-resumo') as HTMLTableElement;
    expect(tabela.className).toContain('table-fixed');
    expect(tabela.style.width).toBe(`${LARGURA_DA_TABELA}px`);
    expect([...tabela.querySelectorAll('col')].map(c => (c as HTMLElement).style.width)).toEqual(COLUNAS_DO_RESUMO.map(c => `${c.largura}px`));
    for (const td of tabela.querySelectorAll('td, th')) {
      expect(td.className).toContain('h-[22px]');
      expect(td.className).toContain('whitespace-nowrap');
      expect(td.className).toContain('text-[10px]');
    }
    for (const id of ['cartao-rebanho', 'cartao-area', 'cartao-pastos', 'cartao-fechamento']) {
      expect(screen.getByTestId(id).className).toContain('h-[46px]');
    }
    expect(tabela.querySelector('thead tr')?.getAttribute('style')).toContain('rgb(238, 242, 247)');
    expect(screen.getByTestId('rodape-do-resumo').getAttribute('style')).toContain('rgb(243, 245, 248)');
    expect(screen.getByTestId('recado-do-resumo').className).toContain('h-[16px]');
  });
  it('erro da leitura fica escrito; sem resumo não há linha nem zero inventado', () => {
    montar({ resumo: null, erro: 'Não foi possível ler os fechamentos. (x)' });
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível ler');
    expect(screen.queryAllByTestId('linha-fazenda')).toHaveLength(0);
    expect(screen.getByTestId('cartao-pastos').textContent).toContain('—');
  });
});

/* O `FechamentoTab` não se monta em teste: a ligação é lida da FONTE. */
describe('FECH-GLOBAL-RESUMO-01 — FechamentoTab em Global (fonte)', () => {
  const f = readFileSync(resolve(process.cwd(), 'src/pages/FechamentoTab.tsx'), 'utf8');
  it('o detector sabe achar', () => {
    expect('if (isGlobal) return <div>Selecione uma fazenda para o fechamento.</div>'.includes('Selecione uma fazenda para o fechamento')).toBe(true);
  });
  it('em Global desenha o resumo, não a frase', () => {
    expect(f).not.toContain('Selecione uma fazenda para o fechamento');
    const i = f.indexOf('if (isGlobal) return (');
    expect(i).toBeGreaterThan(0);
    const ramo = f.slice(i, f.indexOf(');', i));
    expect(ramo).toContain('<FechamentoGlobalResumo');
    expect(ramo).toContain('onAbrirFazenda={abrirFazendaDoResumo}');
    expect(ramo).toContain('mesFiltro={mesFiltro}');
    expect(f).toContain('useFechamentoGlobal({ enabled: isGlobal,');
  });
  it('abrir a fazenda troca a fazenda do contexto; "← Resumo" volta ao Global e só existe para quem veio do resumo, num lugar reservado', () => {
    expect(f).toMatch(/const abrirFazendaDoResumo = [\s\S]{0,220}setVeioDoResumo\(true\);\s*setFazendaAtual\(f\);/);
    expect(f).toContain('const voltarAoResumo = () => { setVeioDoResumo(false); setFazendaAtual(GLOBAL_FAZENDA); };');
    const iLugar = f.indexOf('data-testid="lugar-do-voltar"');
    const iBotao = f.indexOf('data-testid="voltar-ao-resumo"');
    expect(iLugar).toBeGreaterThan(0);
    expect(iBotao).toBeGreaterThan(iLugar);
    expect(f.slice(iLugar - 60, iLugar)).toContain('h-7');
    expect(f.slice(iLugar, iBotao)).toContain('{veioDoResumo && (');
    /* a linha reservada não é condicional */
    expect(f.slice(iLugar - 200, iLugar)).not.toMatch(/&& \(\s*<div className="flex h-7/);
  });
  it('a fita é UMA: a tela por fazenda e o resumo usam o mesmo componente', () => {
    expect(f.match(/<FechamentoFitaMeses\b/g)?.length).toBe(1);
    const g = readFileSync(resolve(process.cwd(), 'src/components/FechamentoGlobalResumo.tsx'), 'utf8');
    expect(g.match(/<FechamentoFitaMeses\b/g)?.length).toBe(1);
    expect(f).not.toContain('grid grid-cols-12 gap-0.5');
    /* o componente do resumo não soma nem filtra */
    expect(g).not.toMatch(/\.reduce\(|\+=|\.filter\(/);
  });
});
