/**
 * DRE-VARIACAO-SIMPLES-01 — o modal da variação montado, com 2 abas (Resumo · Por categoria).
 * Fixture SINTÉTICO no formato da `fn_dre_pecuaria_patrimonio` (o mesmo do teste da 1b):
 * 100 desmama M de 200 kg a R$ 14/kg em dez/30 viram garrotes de 300 kg a R$ 12/kg em jun/31.
 * vpb 80.000 · efeito 0 · Valor 280.000 → 360.000.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PecPatrimonioModal } from '@/components/agri/PecPatrimonioModal';
import type { PatrimonioPec, ParcelaMov } from '@/hooks/useDrePecuaria';
import type { InsumosDidaticos } from '@/pages/PecDrePanel';

/* o gráfico (recharts `ResponsiveContainer`) pede ResizeObserver — o jsdom não tem */
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const mov = (arrobas: number): ParcelaMov => ({ cabecas: 0, arrobas, valor: 0 });
const BASE: PatrimonioPec = {
  p0: '2030-12', p1: '2031-06', p0_fonte: 'fechamento', p1_fonte: 'fechamento',
  categorias: [
    /* ⚠ vpb/efeito DA RPC com 0,40 de diferença da conta refeita, de propósito: a tela mostra o da RPC */
    { categoria: 'desmama_m', q0: 100, pm0: 200, pk0: 14, v0: 280000, q1: 0, pm1: null, pk1: null, v1_p0: 0, v1_p1: 0,
      vpb: -280000.4, efeito: 0, agio: 0, agio_sem_preco: false, cab_reclass_entrada: 0, cab_reclass_saida: 100, at_reclass_entrada: 0, at_reclass_saida: 666.67 },
    { categoria: 'garrotes', q0: 0, pm0: null, pk0: null, v0: 0, q1: 100, pm1: 300, pk1: 12, v1_p0: 360000, v1_p1: 360000,
      vpb: 360000.4, efeito: 0, agio: -50000, agio_sem_preco: false, cab_reclass_entrada: 100, cab_reclass_saida: 0, at_reclass_entrada: 666.67, at_reclass_saida: 0 },
  ],
  total: { q0: 100, v0: 280000, q1: 100, v1_p0: 360000, v1_p1: 360000, vpb: 80000, efeito: 0, agio: -50000, agio_sem_preco: false },
  meses: [
    { ano_mes: '2030-12', fonte: 'fechamento', arrobas: 666.67, v_ref: 280000, v_mes: 280000 },
    { ano_mes: '2031-06', fonte: 'fechamento', arrobas: 1000, v_ref: 360000, v_mes: 360000 },
  ],
  movimentos: { inicio: mov(666.67), fim: mov(1000), produzidas: mov(333.33), nascimentos: mov(0), compradas: mov(0), transf_entrada: mov(0),
    vendas_abates: mov(0), mortes: mov(0), transf_saida: mov(0), ajustes: mov(0), desfrute_por_tipo: null },
};
const INSUMOS: InsumosDidaticos = { reposicao: 0, custeio: null, atProduzida: null, vendas: null, receitaLiquida: 50000, vbp: 130000, resultadoComMercado: 90000 };

const abrir = (over: Partial<PatrimonioPec> = {}, ins: Partial<InsumosDidaticos> = {}) =>
  render(<PecPatrimonioModal aberto fazendaNome="Faz" clienteNome="Cli" qual="vpb" patrimonio={{ ...BASE, ...over }}
    carregando={false} periodo={{ de: '2031-01', ate: '2031-06' }} insumos={{ ...INSUMOS, ...ins }} onFechar={() => {}} />);

const visivel = (id: string) => !screen.getByTestId(id).parentElement?.className.includes('invisible');

describe('modal da variação — 2 abas', () => {
  it('abre no Resumo, com os 4 cards e "de onde veio" (mock v4: sem frase) e as datas dd/mm/aaaa', () => {
    abrir();
    expect(visivel('variacao-resumo')).toBe(true);
    expect(visivel('variacao-por-categoria')).toBe(false);
    expect([...document.querySelectorAll('[data-aba]')].map(b => b.textContent)).toEqual(['Resumo', 'Por categoria']);
    expect(screen.queryByTestId('variacao-frase')).toBeNull();
    /* mock v4: os 4 cards grandes em cima */
    expect(screen.getByTestId('variacao-card-producao').querySelector('[data-card="grande"]')?.textContent).toBe('+R$ 80.000');
    expect(screen.getByTestId('variacao-card-mercado').querySelector('[data-card="grande"]')?.textContent).toBe('R$ 0');
    expect(screen.getByTestId('variacao-card-valor').querySelector('[data-card="grande"]')?.textContent).toBe('+R$ 80.000');
    const t = screen.getByTestId('variacao-de-onde');
    expect(t.textContent).toContain('01/01/2031 a 30/06/2031');
    expect([...t.querySelectorAll('[data-degrau]')].map(r => r.getAttribute('data-degrau'))).toEqual(['quantidade', 'tipo', 'mercado', 'total']);
    expect(t.querySelector('[data-degrau="quantidade"]')?.textContent).toContain('667 @');
    expect(t.querySelector('[data-degrau="quantidade"]')?.textContent).toContain('1.000 @');
  });

  it('1 + 2 = o vpb da RPC; 3 = o efeito; a soma = Valor fim − Valor início (preço médio em 3 degraus)', () => {
    abrir();
    const t = screen.getByTestId('variacao-de-onde');
    const vale = (k: string) => t.querySelector(`[data-degrau="${k}"] [data-vale]`)?.textContent;
    /* 1: 333,33 @ × R$ 419,998/@ (o preço médio do início; as @ da casa têm 2 casas) */
    expect(vale('quantidade')).toBe('+R$ 139.998');
    /* 2: o resto do vpb da RPC (−280.000,40 + 360.000,40 = 80.000) − 140.000 */
    expect(vale('tipo')).toBe('−R$ 59.998');
    expect(vale('mercado')).toBe('R$ 0');
    expect(vale('total')).toBe('+R$ 80.000');
    expect(t.querySelector('[data-degrau="tipo"]')?.textContent).toContain('R$ 420,00/@');
    expect(t.querySelector('[data-degrau="tipo"]')?.textContent).toContain('R$ 360,00/@');
    expect(t.textContent).toContain('1 + 2 = Variação por produção (+R$ 80.000)');
  });

  it('P6: a Reposição aparece só quando ≠ 0, e o VBP é o da coluna do DRE', () => {
    const { unmount } = abrir();
    const linhas = () => [...screen.getByTestId('variacao-no-dre').querySelectorAll('[data-dre]')].map(r => r.getAttribute('data-dre'));
    expect(linhas()).not.toContain('reposicao');
    expect(screen.getByTestId('variacao-no-dre').querySelector('[data-dre="vbp"]')?.textContent).toContain('130.000');
    unmount();
    abrir({}, { reposicao: 20000, vbp: 110000 });
    expect(linhas()).toContain('reposicao');
    expect(screen.getByTestId('variacao-no-dre').querySelector('[data-dre="reposicao"]')?.textContent).toContain('−20.000');
  });

  it('P5: o extrato fecha com o ganho de peso', () => {
    abrir();
    const ex = screen.getByTestId('variacao-extrato');
    expect(ex.querySelector('[data-extrato="ganho"]')?.textContent).toContain('+333');
    expect(ex.querySelector('[data-extrato="fim"]')?.textContent).toContain('1.000');
  });

  it('P8: Por categoria com gado jovem × adulto, subtotais e total', () => {
    abrir();
    fireEvent.click(document.querySelector('[data-aba="categoria"]') ?? document.body);
    expect(visivel('variacao-por-categoria')).toBe(true);
    const t = screen.getByTestId('variacao-por-categoria');
    const nomes = [...t.querySelectorAll('tbody tr')].map(r => r.querySelector('td')?.textContent);
    expect(nomes).toEqual(['Gado jovem', 'Desmama M', 'Gado adulto', 'Garrotes', 'Total do rebanho']);
    const total = t.querySelector('[data-linha="total"]');
    expect(total?.textContent).toContain('+80.000');
  });

  it('P7: um gráfico de cada vez; o segmentado troca', () => {
    abrir();
    const g = screen.getByTestId('variacao-grafico');
    /* v4 (Chat 08:35): sem o título repetido; o Valor tem a legenda "valor real · sem mercado", as Arrobas não */
    expect(g.textContent).toContain('valor real');
    expect(g.textContent).not.toContain('Valor do rebanho (R$)');
    fireEvent.click(within(g).getByText('Arrobas'));
    expect(g.textContent).not.toContain('valor real');
  });

  it('v4 (Chat 08:35): títulos curtos — os cards em "dez/30 → jun/31" e "VBP", o DRE com "jan–jun/31" numa linha', () => {
    abrir();
    expect(screen.getByTestId('variacao-card-arrobas').textContent).toContain('dez/30 → jun/31');
    expect(screen.getByTestId('variacao-card-producao').textContent).toContain('VBP');
    expect(screen.getByTestId('variacao-card-producao').textContent).not.toContain('Variação por produção');
    expect(screen.getByTestId('variacao-no-dre').textContent).toContain('jan–jun/31');
  });
});
