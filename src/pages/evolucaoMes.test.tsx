/**
 * PROD-EVOLUCAO-01b — a tela do mês por categoria: abre no mês que a Evolução no Ano mandou, as setas trocam o mês, a célula de um movimento abre os
 * lançamentos do tipo/categoria/mês, o ✎ abre o lançamento; o shell liga a rota `evolucao-categoria` a ela e a volta de um drill reabre o MESMO mês.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';

const CATS = [['bois', 'Bois'], ['vacas', 'Vacas']].map(([codigo, nome], i) => ({ codigo, nome, ordem_exibicao: i + 1 }));
const row = (codigo: string, o: Partial<ZootCategoriaMensal> = {}): ZootCategoriaMensal => ({
  fazenda_id: 'f1', cliente_id: 'c', ano: 2026, mes: 9, cenario: 'realizado', ano_mes: '2026-09', categoria_id: codigo, categoria_codigo: codigo,
  categoria_nome: codigo, ordem_exibicao: 1, saldo_inicial: 100, entradas_externas: 0, saidas_externas: 10, evol_cat_entrada: 0, evol_cat_saida: 0,
  saldo_final: 90, saldo_sistema: 90, saldo_p1: 90, peso_total_inicial: 30_000, peso_total_final: 27_900, peso_medio_inicial: 300, peso_medio_final: 310,
  peso_entradas_externas: 0, peso_saidas_externas: 0, peso_evol_cat_entrada: 0, peso_evol_cat_saida: 0, dias_mes: 30, gmd: null, producao_biologica: 900,
  cab_abate: 10, peso_abate: 10 * 520, fonte_oficial_mes: 'fechamento', ...o,
});
const pedidos: number[] = [];
vi.mock('@/hooks/useEvolucaoDoMes', () => ({
  useEvolucaoDoMes: (_a: number, mes: number) => {
    pedidos.push(mes);
    return {
      rowsDoMes: [row('bois', { mes })], rowsDoMesAnterior: [], categorias: CATS, fechado: true, ultimoFechado: 9, isGlobal: true,
      lancamentos: [{ id: 'L1', data: '2026-09-18', tipo: 'abate', categoria: 'bois', categoria_destino: null, quantidade: 10, peso_medio_kg: 520 }],
      erroLancamentos: null, carregando: false,
    };
  },
}));
import { EvolucaoMesTab } from './EvolucaoMesTab';

const linha = (id: string) => document.querySelector(`tr[data-linha="${id}"]`) as HTMLElement;

describe('a tela do mês', () => {
  it('abre no mês mandado; as setas trocam o mês (e viram o ano)', () => {
    render(<EvolucaoMesTab anoInicial={2026} mesInicial={1} />);
    expect(screen.getByTestId('evolucao-mes-rotulo').textContent).toBe('Jan/26');
    fireEvent.click(screen.getByLabelText('mês anterior'));
    expect(screen.getByTestId('evolucao-mes-rotulo').textContent).toBe('Dez/25');
  });
  it('sem mês mandado, o último fechado', () => {
    render(<EvolucaoMesTab anoInicial={2026} mesInicial={null} />);
    expect(screen.getByTestId('evolucao-mes-rotulo').textContent).toBe('Set/26');
  });
  it('a célula do abate de Bois abre os lançamentos do abate, de Bois, do mês; o ✎ abre o lançamento', () => {
    const onAbrirLancamentos = vi.fn(); const onEditarLancamento = vi.fn();
    render(<EvolucaoMesTab anoInicial={2026} mesInicial={9} onAbrirLancamentos={onAbrirLancamentos} onEditarLancamento={onEditarLancamento} />);
    const cabAbate = Array.from(linha('bois').querySelectorAll('td')).find((td) => td.textContent === '10' && td.className.includes('cursor-pointer'))!;
    fireEvent.click(cabAbate);
    expect(onAbrirLancamentos).toHaveBeenCalledWith({ ano: 2026, mes: 9, tipo: 'abate', categoria: 'bois', cenario: 'realizado' });
    fireEvent.click(screen.getByRole('button', { name: /Conferir pesos/ }));
    fireEvent.click(screen.getByLabelText('Abrir o lançamento'));
    expect(onEditarLancamento).toHaveBeenCalledWith('L1');
  });
  it('a Categoria fica presa à esquerda (muitos tipos rolam na horizontal; número nunca corta)', () => {
    render(<EvolucaoMesTab anoInicial={2026} mesInicial={9} />);
    expect(linha('bois').querySelector('td')!.className).toContain('sticky left-0');
    expect(linha('total').querySelector('td')!.className).toContain('bg-[#d5dfec]');
  });
});

describe('PROD-EVOLUCAO-01b-fix1 (Gabriel 31/10) — a Evolução por Categoria', () => {
  it('item 1: o kg/cab é secundário (fonte bem menor e mais clara) na tabela e nos cards', () => {
    render(<EvolucaoMesTab anoInicial={2026} mesInicial={9} />);
    const kg = Array.from(linha('bois').querySelectorAll('td')).find((td) => td.textContent === '520,0')!;
    expect(kg.className).toContain('text-[8.5px]');
    expect(screen.getAllByText(/kg\/cab$/).some((e) => e.className.includes('text-[8.5px]'))).toBe(true);
  });
  it('item 2: célula sem movimento em branco (nada de "0" nem "—"); o Confere continua', () => {
    render(<EvolucaoMesTab anoInicial={2026} mesInicial={9} />);
    const tds = Array.from(linha('vacas').querySelectorAll('td')).slice(1);
    expect(tds.every((td) => td.textContent === '')).toBe(true);
    expect(Array.from(linha('bois').querySelectorAll('td')).some((td) => td.textContent === '0' || td.textContent === '—')).toBe(false);
    expect(screen.getByTestId('evolucao-mes-confere').textContent).toContain('Confere: 100');
  });
  it('item 3: zebra leve entre as categorias; os subtotais com o fundo próprio', () => {
    render(<EvolucaoMesTab anoInicial={2026} mesInicial={9} />);
    expect(linha('bois').className).not.toBe(linha('vacas').className.replace('bg-card', 'x'));
    expect([linha('bois').className, linha('vacas').className].some((c) => c.includes('bg-[#f7f8fa]'))).toBe(true);
    expect(linha('total').className).toContain('bg-[#d5dfec]');
  });
  it('item 4: o painel abre em Composição; Conferir pesos com dd/mm e nomes curtos (o inteiro no title)', () => {
    render(<EvolucaoMesTab anoInicial={2026} mesInicial={9} />);
    expect(screen.getByTestId('evolucao-mes-composicao')).toBeInTheDocument();
    const abas = screen.getAllByRole('button').filter((b) => /Composição|Conferir pesos/.test(b.textContent ?? ''));
    expect(abas[0].textContent).toContain('Composição');
    fireEvent.click(screen.getByRole('button', { name: /Conferir pesos/ }));
    const tr = document.querySelector('tr[data-peso="L1"]')!;
    expect(tr.querySelector('td')!.textContent).toBe('18/09');
    const curtos = tr.querySelectorAll('[data-inteiro]');
    expect(curtos[0].textContent).toBe('Abate');
    expect(curtos[1].textContent).toBe('Bois');
    expect(curtos[1].getAttribute('title')).toBe('Bois');
  });
});

describe('o shell (V2Index)', () => {
  const v2 = readFileSync(resolve(__dirname, '../v2/V2Index.tsx'), 'utf8');
  const rota = v2.slice(v2.indexOf("if (section === 'evolucao-categoria')"), v2.indexOf("if (section === 'evolucao-categoria')") + 2500);
  it('a rota evolucao-categoria é a tela do mês, aberta no mês clicado (ou no último fechado)', () => {
    expect(rota).toContain('<EvolucaoMesTab');
    expect(rota).toContain('mesInicial={mesDaEvolucao?.mes ?? null}');
    expect(v2).toContain('setMesDaEvolucao({ ano: a, mes: m }); setSection(\'evolucao-categoria\');');
  });
  it('o drill leva tipo, categoria e mês e volta ao MESMO mês da tela', () => {
    expect(rota).toContain("origem: 'evolucao-categoria'");
    expect(rota).toContain("categoria: o.categoria ?? 'todas'");
    expect(rota).toContain('setMesDaEvolucao({ ano: o.ano, mes: o.mes });');
  });
});
