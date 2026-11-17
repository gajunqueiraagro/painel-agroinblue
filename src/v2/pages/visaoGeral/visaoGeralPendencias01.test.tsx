/**
 * VISAO-GERAL-PENDENCIAS-01 (mock v2 aprovado pelo Gabriel 17/11 06:53) — "Pendências do mês" e "Rebanho no mês" da Visão Geral.
 * Os números do NJ de out/26 (lidos no proto em 17/11) entram aqui só como FORMA (contas e totais), sem nome de cliente.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import type { LinhaResumo } from '@/lib/conciliacao/resumoDoDono';
import { contasSemCasarDoResumo } from './conciliacaoSemCasar';
import { avisoSemFechamento, mesesDoRecorte, rebanhoNoMes, variacaoDoRebanho } from './rebanhoNoMes';
import { PrecisaDeAtencao } from './AtencaoEAtalhos';

const V2HOME = readFileSync(resolve(__dirname, '../V2Home.tsx'), 'utf8');

type LinhaDoTeste = Pick<LinhaResumo, 'nivel' | 'conta_id' | 'conta_nome' | 'tem_extrato' | 'extratos_sem_par' | 'lancamentos_sem_par'>;
const conta = (id: string, tem: boolean, ext: number, lanc: number, nivel: LinhaResumo['nivel'] = 'conta'): LinhaDoTeste => ({
  nivel, conta_id: nivel === 'conta' ? id : null, conta_nome: id, tem_extrato: tem,
  extratos_sem_par: { qtde: ext, valor: 0 }, lancamentos_sem_par: { qtde: lanc, valor: 0 },
});

describe('D1 — conciliação: uma linha por conta COM extrato', () => {
  it('a forma do NJ em out/26: o 86 da linha total vira só a conta com extrato (23); cartão e conta virtual ficam fora', () => {
    const linhas = [
      conta('Banco A', true, 23, 0), conta('Cartão A', false, 0, 47), conta('Cartão B', false, 0, 12), conta('Cartão C', false, 0, 2),
      conta('Conta virtual', false, 0, 2), conta('Banco B', true, 0, 0), conta('Total', true, 23, 63, 'total'),
    ];
    expect(contasSemCasarDoResumo(linhas)).toEqual([{ contaId: 'Banco A', nome: 'Banco A', qtd: 23 }]);
  });
  it('soma os dois lados da conta (extrato sem par + lançamento sem par); sem resumo = nada', () => {
    expect(contasSemCasarDoResumo([conta('Banco A', true, 3, 2)])[0].qtd).toBe(5);
    expect(contasSemCasarDoResumo(undefined)).toEqual([]);
  });
});

const row = (ano_mes: string, o: Partial<ZootCategoriaMensal> = {}): ZootCategoriaMensal => ({
  fazenda_id: 'f1', cliente_id: 'c', ano: Number(ano_mes.slice(0, 4)), mes: Number(ano_mes.slice(5)), cenario: 'realizado', ano_mes,
  categoria_id: 'bois', categoria_codigo: 'bois', categoria_nome: 'Bois', ordem_exibicao: 1, saldo_inicial: 0, entradas_externas: 0,
  saidas_externas: 0, evol_cat_entrada: 0, evol_cat_saida: 0, saldo_final: 0, saldo_sistema: 0, saldo_p1: null, peso_total_inicial: 0,
  peso_total_final: 0, peso_medio_inicial: 0, peso_medio_final: 0, peso_entradas_externas: 0, peso_saidas_externas: 0, peso_evol_cat_entrada: 0,
  peso_evol_cat_saida: 0, dias_mes: 31, gmd: null, producao_biologica: 0, fonte_oficial_mes: 'fechamento', ...o,
});

describe('D8 = A — Rebanho no mês pela conta da Evolução do rebanho', () => {
  /* a forma do NJ em out/26: 2 fazendas, 7.259 + 299 − 99 − 1 − 8 = 7.450 */
  const OUT = [
    row('2026-10', { fazenda_id: 'f1', saldo_inicial: 1387, cab_nascimento: 66, cab_abate: 27, cab_morte: 1, saldo_final: 1425, saldo_sistema: 1425 }),
    row('2026-10', { fazenda_id: 'f2', saldo_inicial: 5872, cab_nascimento: 233, cab_abate: 72, cab_consumo: 1, cab_morte: 7, saldo_final: 6025, saldo_sistema: 6025 }),
  ];
  it('no Global as fazendas somam (D10): início, cada movimento, o final e a variação', () => {
    const r = rebanhoNoMes(OUT, ['2026-10']);
    expect(r).toEqual({ inicio: 7259, nascimentos: 299, compras: 0, transfEntrada: 0, vendasEAbates: 99, consumo: 1, mortes: 8, transfSaida: 0,
      final: 7450, variacao: 191, pct: 191 / 7259 });
  });
  it('vendas e abates somam; movimento sem cabeça é 0 (D9), nunca some', () => {
    const r = rebanhoNoMes([row('2026-10', { saldo_inicial: 100, cab_venda: 5, cab_abate: 3, saldo_final: 92, saldo_sistema: 92 })], ['2026-10']);
    expect(r?.vendasEAbates).toBe(8);
    expect(r?.compras).toBe(0);
  });
  it('período: o início do 1º mês, o final do último, os movimentos somam', () => {
    const rows = [row('2026-09', { saldo_inicial: 100, cab_nascimento: 10, saldo_final: 110, saldo_sistema: 110 }),
      row('2026-10', { saldo_inicial: 110, cab_morte: 2, saldo_final: 108, saldo_sistema: 108 })];
    const r = rebanhoNoMes(rows, ['2026-09', '2026-10']);
    expect([r?.inicio, r?.nascimentos, r?.mortes, r?.final]).toEqual([100, 10, 2, 108]);
  });
  it('mês do recorte sem linha no cache = null ("—"), nunca zero', () => {
    expect(rebanhoNoMes(OUT, ['2026-11'])).toBeNull();
    expect(rebanhoNoMes(OUT, [])).toBeNull();
  });
  it('os meses do recorte: o mês, ou jan → mês no período', () => {
    expect(mesesDoRecorte(2026, 10, false)).toEqual(['2026-10']);
    expect(mesesDoRecorte(2026, 3, true)).toEqual(['2026-01', '2026-02', '2026-03']);
  });
  it('a variação ao lado do saldo final', () => {
    expect(variacaoDoRebanho(191, 191 / 7259)).toBe('+191 · +2,6%');
    expect(variacaoDoRebanho(-18, -18 / 1218)).toBe('−18 · −1,5%');
    expect(variacaoDoRebanho(5, null)).toBe('+5');
  });
  it('mês sem fechamento: até 3 fazendas pelo código, mais = o número (os códigos no title); nada pendente = sem aviso', () => {
    expect(avisoSemFechamento(['FZB'], 'nov')?.texto).toBe('nov sem fechamento em FZB: números dos lançamentos');
    const muitas = avisoSemFechamento(['A', 'B', 'C', 'D'], 'nov');
    expect(muitas?.texto).toContain('4 fazendas');
    expect(muitas?.title).toContain('A, B, C, D');
    expect(avisoSemFechamento([], 'nov')).toBeNull();
  });
});

describe('o quadro "Pendências do mês"', () => {
  it('o número numa célula PRÓPRIA à direita; a linha sem contagem deixa a célula vazia', () => {
    render(<PrecisaDeAtencao itens={[
      { id: 'c', texto: 'Conciliação · Banco A · sem casar', numero: 1234, acao: 'Conciliar', onIr: vi.fn() },
      { id: 'f', texto: 'Fechamento de out faltando · AA', acao: 'Fechar', onIr: vi.fn() },
    ]} />);
    const num = screen.getByTestId('vg-atencao-c-numero');
    expect(num.textContent).toBe('1.234');
    expect(num.className).toContain('text-right');
    expect(screen.getByTestId('vg-atencao-f-numero').textContent).toBe('');
  });
  it('régua fixa: texto · número 64px · ação 78px', () => {
    render(<PrecisaDeAtencao itens={[]} />);
    const cols = Array.from(screen.getByTestId('vg-atencao-tabela').querySelectorAll('col')).map((c) => c.getAttribute('style'));
    expect(cols).toEqual([null, 'width: 64px;', 'width: 78px;']);
  });
  it('a ordem (D3): Conciliação · Receita · Boletos · Fechamento · Revalidar; o "N sem casar" da linha total saiu', () => {
    const lista = V2HOME.slice(V2HOME.indexOf('const atencaoVG: ItemAtencao[] = ['));
    const pos = ['...contasSemCasar.map', "id: 'receita'", "id: 'boletos'", '...gradeAno', '...revalidarDoMes.map'].map((t) => lista.indexOf(t));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    expect(V2HOME).not.toContain('sem casar`, acao');
  });
  it('o rebanho vem da conta da Evolução sobre as linhas que a tela já lê (fonte única)', () => {
    expect(V2HOME).toContain('rebanhoNoMes(categoriasVG ?? [], mesesDoRecorte(anoNum, mesNum, isPeriodo))');
  });
});
