/* EVOLUCAO-CATEGORIA-01 (Gabriel 04/11/2026) — Produção › Evolução por Categoria sem rolagem: a tabela na largura toda (o donut saiu do lado),
   a Composição numa faixa de cima, "Conferir pesos" botão no cabeçalho, separador entre os grupos e o peso que cai > 25% no mês em vermelho. */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import { QUEDA_DO_PESO, quedaDoPeso } from '@/lib/producao/evolucaoMes';

const CATS = [['bois', 'Bois'], ['mamotes_m', 'Mamotes M'], ['vacas', 'Vacas']].map(([codigo, nome], i) => ({ codigo, nome, ordem_exibicao: i + 1 }));
const row = (codigo: string, cab: number, kgIni: number, kgFim: number): ZootCategoriaMensal => ({
  fazenda_id: 'f1', cliente_id: 'c', ano: 2026, mes: 7, cenario: 'realizado', ano_mes: '2026-07', categoria_id: codigo, categoria_codigo: codigo,
  categoria_nome: codigo, ordem_exibicao: 1, saldo_inicial: cab, entradas_externas: 0, saidas_externas: 0, evol_cat_entrada: 0, evol_cat_saida: 0,
  saldo_final: cab, saldo_sistema: cab, saldo_p1: cab, peso_total_inicial: cab * kgIni, peso_total_final: cab * kgFim, peso_medio_inicial: kgIni,
  peso_medio_final: kgFim, peso_entradas_externas: 0, peso_saidas_externas: 0, peso_evol_cat_entrada: 0, peso_evol_cat_saida: 0, dias_mes: 31, gmd: null,
  producao_biologica: 0, cab_morte: 1, peso_morte: 170, fonte_oficial_mes: 'fechamento',
});
vi.mock('@/hooks/useEvolucaoDoMes', () => ({
  useEvolucaoDoMes: () => ({
    rowsDoMes: [row('bois', 100, 480, 490), row('mamotes_m', 300, 212.1, 30), row('vacas', 100, 440, 340)], rowsDoMesAnterior: [], categorias: CATS,
    fechado: true, ultimoFechado: 7, isGlobal: false,
    lancamentos: [{ id: 'L1', data: '2026-07-18', tipo: 'morte', categoria: 'bois', categoria_destino: null, quantidade: 1, peso_medio_kg: 170 }],
    erroLancamentos: null, carregando: false,
  }),
}));
const { EvolucaoMesTab } = await import('./EvolucaoMesTab');
const linha = (id: string) => document.querySelector(`tr[data-linha="${id}"]`);

describe('quedaDoPeso (item 4)', () => {
  it('avisa só acima de 25% de queda no mês; subir ou cair pouco não avisa; sem peso, nada', () => {
    expect(QUEDA_DO_PESO).toBe(0.25);
    expect(quedaDoPeso(212.1, 30)).toBeCloseTo(0.8586, 3);
    expect(quedaDoPeso(400, 300)).toBeNull(); // exatamente 25%: não passa
    expect(quedaDoPeso(400, 299)).toBeCloseTo(0.2525, 4);
    expect(quedaDoPeso(300, 400)).toBeNull();
    expect(quedaDoPeso(null, 30)).toBeNull();
    expect(quedaDoPeso(0, 30)).toBeNull();
  });
});

describe('a tela sem rolagem', () => {
  it('itens 1 e 2: a tabela ocupa a largura toda (sem a coluna do painel, sem largura fixa); a Composição é a faixa de cima, 100% empilhada', () => {
    render(<EvolucaoMesTab anoInicial={2026} mesInicial={7} />);
    const tabela = screen.getByTestId('evolucao-mes-tabela');
    expect(document.querySelector('[class*="grid-cols-[minmax(0,1fr)_368px]"]')).toBeNull();
    expect(tabela.querySelector('table')?.getAttribute('style')).toBeNull();
    expect(tabela.querySelector('colgroup')).toBeNull();
    const faixa = screen.getByTestId('evolucao-mes-composicao');
    expect(faixa.compareDocumentPosition(tabela) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const pedacos = [...faixa.querySelectorAll('[data-categoria]')];
    expect(pedacos.map((p) => p.getAttribute('data-categoria'))).toEqual(['bois', 'mamotes_m', 'vacas']);
    expect(pedacos.map((p) => p.getAttribute('style'))).toEqual([expect.stringContaining('width: 20%'), expect.stringContaining('width: 60%'), expect.stringContaining('width: 20%')]);
    expect(pedacos[0].textContent).toBe('Bois 20%');
    expect(pedacos[0].getAttribute('title')).toBe('Bois: 100 cab (20,0%) · 490,0 kg/cab');
    expect(faixa.querySelector('svg')).toBeNull();
  });
  it('item 2: "Conferir pesos · N" é botão no cabeçalho; abre o painel por cima e fecha pelo ✕ ou pelo botão', () => {
    render(<EvolucaoMesTab anoInicial={2026} mesInicial={7} />);
    const botao = screen.getByTestId('evolucao-mes-botao-pesos');
    expect(botao.textContent).toBe('Conferir pesos · 1');
    expect(screen.queryByTestId('evolucao-mes-painel-pesos')).toBeNull();
    fireEvent.click(botao);
    expect(screen.getByTestId('evolucao-mes-painel-pesos').hasAttribute('data-painel-por-cima')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar o Conferir pesos' }));
    expect(screen.queryByTestId('evolucao-mes-painel-pesos')).toBeNull();
    fireEvent.click(botao); fireEvent.click(botao);
    expect(screen.queryByTestId('evolucao-mes-painel-pesos')).toBeNull();
  });
  it('item 3: um separador no começo de cada grupo (Início, Morte, Entrou, Saiu, Final, Produção) e só nele', () => {
    render(<EvolucaoMesTab anoInicial={2026} mesInicial={7} />);
    const grupos = [...document.querySelectorAll('thead tr:first-child th')];
    expect(grupos.filter((t) => t.className.includes('border-l')).map((t) => t.textContent)).toEqual(['Início', 'Morte', 'Entrou', 'Saiu', 'Final', 'Produção']);
    const tds = [...(linha('bois')?.querySelectorAll('td') ?? [])];
    expect(tds.map((t) => t.className.includes('border-l'))).toEqual([false, true, false, true, false, true, false, true, false, true, false, true, false]);
  });
  it('item 4: Mamotes M 212,1 → 30,0 e Vacas 440 → 340 (−23%): só o Mamotes fica vermelho, com o aviso no title; o número não muda', () => {
    render(<EvolucaoMesTab anoInicial={2026} mesInicial={7} />);
    const mam = linha('mamotes_m')?.querySelector('td[data-queda]');
    expect(mam?.textContent).toBe('30,0');
    expect(mam?.className).toContain('bg-[#fde1e1]');
    expect(mam?.getAttribute('title')).toBe('O peso caiu de 212,1 para 30,0 kg/cab no mês (−86%). Conferir o Fechamento.');
    expect(linha('vacas')?.querySelector('td[data-queda]')).toBeNull();
    expect(linha('bois')?.querySelector('td[data-queda]')).toBeNull();
    /* o subtotal Machos também cai (279 → 145 kg/cab), mas o aviso é da CATEGORIA */
    expect(linha('machos')?.querySelector('td[data-queda]')).toBeNull();
    expect(linha('total')?.querySelector('td[data-queda]')).toBeNull();
  });
});
