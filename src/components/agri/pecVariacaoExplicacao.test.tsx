/**
 * DRE-VARIACAO-EXPLICA-01 fatia 1b — o modal da variação montado, abrindo na "Explicação".
 *
 * Fixture SINTÉTICO no formato do payload da `fn_dre_pecuaria_patrimonio` com a 115300 (o mesmo do teste SQL T1–T4):
 * 100 desmama M de 200 kg a R$ 14/kg em dez/30 viram garrotes em mar/31 e terminam com 300 kg a R$ 12/kg em jun/31.
 * vpb 80.000 · ágio −50.000 (no destino, garrotes) · Produção = 130.000 · efeito 0.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PecPatrimonioModal } from '@/components/agri/PecPatrimonioModal';
import type { PatrimonioPec, ParcelaMov } from '@/hooks/useDrePecuaria';

/* a aba Gráfico usa o `MiniChart` (recharts `ResponsiveContainer`), que pede ResizeObserver — o jsdom não tem */
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const zero: ParcelaMov = { cabecas: 0, arrobas: 0, valor: 0 };
const BASE: PatrimonioPec = {
  p0: '2030-12', p1: '2031-06', p0_fonte: 'fechamento', p1_fonte: 'fechamento',
  categorias: [
    { categoria: 'desmama_m', q0: 100, pm0: 200, pk0: 14, v0: 280000, q1: 0, pm1: null, pk1: null, v1_p0: 0, v1_p1: 0,
      vpb: -280000, efeito: 0, agio: 0, agio_sem_preco: false, cab_reclass_entrada: 0, cab_reclass_saida: 100, at_reclass_entrada: 0, at_reclass_saida: 833.33 },
    { categoria: 'garrotes', q0: 0, pm0: null, pk0: null, v0: 0, q1: 100, pm1: 300, pk1: 12, v1_p0: 360000, v1_p1: 360000,
      vpb: 360000, efeito: 0, agio: -50000, agio_sem_preco: false, cab_reclass_entrada: 100, cab_reclass_saida: 0, at_reclass_entrada: 833.33, at_reclass_saida: 0 },
    /* só passou por reclassificação (zero nas duas pontas, ágio real — como os bois da BG jan→set/26): a linha FICA */
    { categoria: 'bois', q0: 0, pm0: null, pk0: null, v0: 0, q1: 0, pm1: null, pk1: null, v1_p0: 0, v1_p1: 0,
      vpb: 0, efeito: 0, agio: -300, agio_sem_preco: false, cab_reclass_entrada: 1, cab_reclass_saida: 1, at_reclass_entrada: 15, at_reclass_saida: 15 },
  ],
  total: { q0: 100, v0: 280000, q1: 100, v1_p0: 360000, v1_p1: 360000, vpb: 80000, efeito: 0, agio: -50000, agio_sem_preco: false },
  meses: [
    { ano_mes: '2030-12', fonte: 'fechamento', arrobas: 666.67, v_ref: 280000, v_mes: 280000 },
    { ano_mes: '2031-03', fonte: 'cadastro', arrobas: 866.67, v_ref: 312000, v_mes: null },
    { ano_mes: '2031-06', fonte: 'fechamento', arrobas: 1000, v_ref: 360000, v_mes: 360000 },
  ],
  movimentos: { inicio: zero, fim: zero, produzidas: zero, nascimentos: zero, compradas: zero, transf_entrada: zero,
    vendas_abates: zero, mortes: zero, transf_saida: zero, ajustes: zero, desfrute_por_tipo: null },
};
const INSUMOS = { reposicao: 20000, custeio: null, atProduzida: null, vendas: null };

const abrir = (qual: 'vpb' | 'efeito' | 'ponte', over: Partial<PatrimonioPec> = {}) =>
  render(<PecPatrimonioModal aberto fazendaNome="Faz" clienteNome="Cli" qual={qual} patrimonio={{ ...BASE, ...over }}
    carregando={false} periodo={{ de: '2031-01', ate: '2031-06' }} insumos={INSUMOS} onFechar={() => {}} />);

const passos = () => [...screen.getByTestId('variacao-ponte').querySelectorAll('[data-passo]')].map(g => ({
  chave: g.getAttribute('data-passo'), textos: [...g.querySelectorAll('text')].map(t => t.textContent),
}));

describe('modal da variação — a aba Explicação', () => {
  it('abre na Explicação; a ponte do Detalhado: Início · Produção (vpb − ágio) · Evolução · Mercado · Fim', () => {
    abrir('vpb');
    /* ⚠ AS ABAS FICAM MONTADAS (sobrepostas): a que abriu é a que NÃO está invisível */
    expect(screen.getByTestId('variacao-explicacao').parentElement?.className).not.toContain('invisible');
    const p = passos();
    expect(p.map(x => x.chave)).toEqual(['inicio', 'producao', 'evolucao', 'mercado', 'fim']);
    expect(p[0].textos).toEqual(['R$ 280.000', 'Valia em dez/30']);
    expect(p[1].textos[0]).toBe('+R$ 130.000');
    expect(p[2].textos[0]).toBe('−R$ 50.000');
    expect(p[4].textos).toEqual(['R$ 360.000', 'Vale em jun/31']);
  });

  it('a régua da ponte é a do mock (86% da menor ponta): a Produção é uma barra, não um risco', () => {
    abrir('vpb');
    const alt = (k: string) => Number(screen.getByTestId('variacao-ponte').querySelector(`[data-passo="${k}"] rect`)?.getAttribute('height'));
    /* a régua vai de 240.800 (86% de 280.000) a 422.300 (103% de 410.000): os 130.000 dão ~54px dos 76 úteis; com o chão no zero, ~22px */
    expect(alt('producao')).toBeGreaterThan(40);
    expect(alt('inicio')).toBeLessThan(alt('fim'));
  });

  it('D2: aberta pela linha do Resumido, a ponte termina na linha com a Reposição (sem as pontas)', () => {
    abrir('ponte');
    const p = passos();
    expect(p.map(x => x.chave)).toEqual(['producao', 'evolucao', 'reposicao', 'linha']);
    expect(p[2].textos[0]).toBe('−R$ 20.000');
    expect(p[3].textos).toEqual(['R$ 60.000', 'Variação do estoque']);
  });

  it('D3: fim pelo cadastro = selo + mercado "—" (na ponte e no card)', () => {
    abrir('vpb', { p1_fonte: 'cadastro' });
    expect(screen.getByTestId('selo-fim-cadastro').textContent).toContain('fim pelo cadastro');
    expect(passos()[3].textos[0]).toBe('—');
    expect(within(screen.getByTestId('variacao-card-mercado')).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('V2: Quantidade + Composição = a Produção; V3: a Evolução na categoria de destino, com as cabeças no title', () => {
    abrir('vpb');
    const q = screen.getByTestId('variacao-card-quantidade').textContent ?? '';
    /* (1.000 − 666,67) @ × (280.000 ÷ 666,67 = R$ 419,998/@): as @ da casa saem com 2 casas (`kgToArrobas`) */
    expect(q).toContain('+R$ 139.998');
    expect(screen.getByTestId('variacao-card-composicao').textContent).toContain('−R$ 9.998'); // 130.000 − 139.998
    const linhaGarrote = within(screen.getByTestId('variacao-v3')).getByText('Garrotes').closest('tr');
    expect(linhaGarrote?.textContent).toContain('−50.000');
    expect(linhaGarrote?.querySelector('[title^="entraram 100 cab"]')).toBeTruthy();
    expect(within(screen.getByTestId('variacao-v3')).getByText('Bois').closest('tr')?.textContent).toContain('−300');
  });

  it('aba Gráfico: os 3 gráficos da tela do VR (Valor, Arrobas, R$/@ médio)', () => {
    abrir('vpb');
    const g = screen.getByTestId('variacao-graficos-vr');
    expect([...g.querySelectorAll('p')].map(p => p.textContent)).toEqual(['Valor do rebanho (R$)', 'Arrobas em estoque', 'R$/@ médio']);
  });

  it('V4: o mês do cadastro não tem R$/@ do mês (a linha quebra ali)', () => {
    abrir('vpb');
    const preco = screen.getByTestId('v4-preco');
    expect(preco.querySelectorAll('polyline').length).toBe(1); // a de dez/AA inteira; a do mês só tem pontos soltos
  });
});
