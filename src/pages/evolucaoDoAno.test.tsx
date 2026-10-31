/**
 * PROD-EVOLUCAO-01a — a tela: todo número leva à origem (Lanç. · OC · Fech.), com o tipo e o mês certos; o shell repassa ano e mês ao drill
 * (antes o `drillFiltro` os levava e ninguém os passava à lista).
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MesDaEvolucao } from '@/lib/producao/evolucaoAno';

const mes = (m: number, fechado = true): MesDaEvolucao => ({
  mes: m, fechado, saldoInicio: 1000, saldoFinal: 990, pesoInicioKg: 300_000, pesoFinalKg: 301_000,
  cab: { abate: 10, nascimento: m === 2 ? 5 : 0, morte: 1 }, kg: { abate: 5000 }, kgCarcacaAbate: 2700, evolEntrou: 0, evolSaiu: 0, kgEvolEntrou: 0, kgEvolSaiu: 0,
  pesoMedioFinal: 304, gmd: 0.2, producaoBio: 6000, cabInicio: 1000, cabFinal: 990, dias: 30, uaMedia: 669, areaPecuaria: 1000,
});
vi.mock('@/hooks/useEvolucaoDoAno', () => ({
  useEvolucaoDoAno: () => ({ mesesReal: [mes(1), mes(2), mes(3, false)], mesesMeta: [], isGlobal: true, metaRascunho: true, carregando: false }),
}));
vi.mock('@/hooks/useAnosDisponiveis', () => ({ useAnosDisponiveis: () => ({ data: ['2026'] }) }));
import { EvolucaoDoAnoTab } from './EvolucaoDoAnoTab';

const montar = () => {
  const onAbrirOrigem = vi.fn(); const onAbrirMes = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><EvolucaoDoAnoTab onAbrirOrigem={onAbrirOrigem} onAbrirMes={onAbrirMes} /></QueryClientProvider>);
  return { onAbrirOrigem, onAbrirMes };
};
const linha = (id: string) => document.querySelector(`tr[data-linha="${id}"]`) as HTMLElement;

describe('todo número leva à origem', () => {
  /* fix1 (item 5): a tela abre no "Ano" = o ano até o último mês fechado (os mesmos números do Acum. de antes) — o selo leva jan..fev */
  const DOZE = [1, 2];
  it('a célula do abate de fev → OC do abate, fev; o selo da linha → o ano até o último fechado', () => {
    const { onAbrirOrigem } = montar();
    fireEvent.click(linha('abate').querySelector('td[data-mes="2"]')!);
    expect(onAbrirOrigem).toHaveBeenLastCalledWith({ destino: 'oc', tipo: 'abate', ano: new Date().getFullYear(), mes: 2, meses: DOZE });
    fireEvent.click(within(linha('abate')).getByRole('button', { name: 'OC' }));
    expect(onAbrirOrigem).toHaveBeenLastCalledWith({ destino: 'oc', tipo: 'abate', ano: new Date().getFullYear(), mes: null, meses: DOZE });
  });
  it('nascimento → Lanç.; saldo final e GMD → Fech. do mês', () => {
    const { onAbrirOrigem } = montar();
    fireEvent.click(linha('nascimento').querySelector('td[data-mes="2"]')!);
    expect(onAbrirOrigem.mock.calls.at(-1)?.[0]).toMatchObject({ destino: 'lanc', tipo: 'nascimento', mes: 2 });
    fireEvent.click(linha('gmd').querySelector('td[data-mes="1"]')!);
    expect(onAbrirOrigem.mock.calls.at(-1)?.[0]).toMatchObject({ destino: 'fech', mes: 1 });
  });
  it('zero e "—" não são clicáveis; o mês no cabeçalho abre o nível 2', () => {
    const { onAbrirOrigem, onAbrirMes } = montar();
    fireEvent.click(linha('nascimento').querySelector('td[data-mes="1"]')!);
    expect(onAbrirOrigem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('columnheader', { name: 'Mar' }));
    expect(onAbrirMes).toHaveBeenCalledWith(new Date().getFullYear(), 3);
  });
  /* fix1 (item 8): VAZIO = VAZIO — o mês sem dado e o zero ficam em branco (antes "—" e "0") */
  it('o mês aberto não mostra indicador e o zero fica em branco; o mês sem dado também', () => {
    montar();
    expect(linha('gmd').querySelector('td[data-mes="3"]')!.textContent).toBe('');
    expect(linha('nascimento').querySelector('td[data-mes="1"]')!.textContent).toBe('');
    expect(linha('nascimento').querySelector('td[data-mes="4"]')!.textContent).toBe('');
    expect(linha('nascimento').querySelector('td[data-mes="2"]')!.textContent).toBe('5');
  });
});

describe('PROD-EVOLUCAO-01b-fix1 (Gabriel 31/10) — a Evolução no Ano', () => {
  it('item 5: o período é só "Mês | Ano" (o Acum. saiu) e abre no Ano', () => {
    montar();
    const barra = screen.getByTestId('evolucao-barra');
    expect(within(barra).queryByRole('button', { name: /Acum/ })).toBeNull();
    /* Gabriel 31/10: o rótulo diz até onde o ano vai (o último mês fechado do fixture é fev) e o title explica */
    const ano = within(barra).getByRole('button', { name: 'Ano · até fev' });
    expect(ano.className).toContain('bg-primary');
    expect(ano.getAttribute('title')).toBe('O ano até fev, o último mês fechado');
  });
  it('item 6: "Internas" e as transferências com nome curto inteiro; a explicação no title', () => {
    montar();
    const internas = linha('internas').querySelector('[data-inteiro]')!;
    expect(internas.textContent).toContain('Internas');
    expect(internas.textContent).not.toContain('não mudam');
    expect(internas.getAttribute('title')).toContain('não mudam o total');
  });
  it('item 7: Meta e Δ % são secundários (fonte bem menor, sem negrito, cor suave)', () => {
    montar();
    for (const col of ['meta', 'delta']) {
      const td = linha('abate').querySelector(`td[data-coluna="${col}"]`)!;
      expect(td.className).toContain('text-[8.5px]');
      expect(td.className).toContain('font-normal');
      expect(td.className).not.toContain('font-semibold');
    }
  });
});

describe('o shell (V2Index)', () => {
  const v2 = readFileSync(resolve(__dirname, '../v2/V2Index.tsx'), 'utf8');
  it('a Evolução no Ano é a tela nova e o drill de lançamentos leva ano e mês à lista, voltando de onde saiu', () => {
    const rota = v2.slice(v2.indexOf("if (section === 'conferencia-mensal')"), v2.indexOf("if (section === 'conferencia-mensal')") + 3000);
    expect(rota).toContain('<EvolucaoDoAnoTab');
    expect(rota).toContain("origem: 'conferencia-mensal'");
    const lista = v2.slice(v2.indexOf("if (section === 'conferencia-lancamentos')"), v2.indexOf("if (section === 'conferencia-lancamentos')") + 2500);
    expect(lista).toContain('filtroAnoInicial={drillFiltro?.ano}');
    expect(lista).toContain('filtroMesInicial={drillFiltro?.mes || undefined}');
    expect(lista).toContain("const volta = drillFiltro.origem ?? 'evolucao-categoria';");
  });
});
