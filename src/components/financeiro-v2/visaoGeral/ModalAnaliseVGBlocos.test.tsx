/**
 * VG-CUSTEIO-FIXO-VARIAVEL-01 (Gabriel 30/10/2026; mock docs/mocks/mock-custeio-fixo-variavel-v1.html) — o card "Centros · <atividade>"
 * da análise com os centros em BLOCOS (o banco é falso: devolve a `fn_vg_analise` pronta). Dados SINTÉTICOS.
 *   B1 os blocos na ordem do banco (variável, fixo): o subtotal "Custo variável · N centros" com os números DO BANCO (a tela não soma —
 *      o subtotal do teste é de propósito diferente da soma das linhas) e os centros do bloco embaixo, recuados, na ordem de hoje
 *   B2 sem `blocos` (o nível das atividades, o Administrativo): a lista corrida de hoje, sem subtotal nem recuo
 *   B3 o centro de um bloco continua clicável (vira o foco); o subtotal não é linha de navegação
 *   B4 "1 centro" no singular; o bloco "Sem classificação" quando o banco o manda
 *   B5 `linhasEmBlocos`: cada linha guarda o índice de antes (cor e testid) e a ordem de dentro do bloco
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from: () => ({}) } }));

import { ModalAnaliseVG } from './ModalAnaliseVG';
import { linhasEmBlocos, type AnaliseVG, type BlocoAnaliseVG, type LinhaAnaliseVG } from '@/lib/financeiro/visaoGeralAnalise';

const linha = (caminho: (string | null)[], rotulo: string, valor: number, meta: number | null, extra: Partial<LinhaAnaliseVG> = {}): LinhaAnaliseVG => ({
  caminho, rotulo, grupo: caminho[0] ?? null, valor, meta, dif: meta == null ? null : Math.round((valor - meta) * 100) / 100,
  pct: meta ? -10 : null, razao: meta ? 0.9 : null, qtd: 3, unidade_valida: true, faixa: meta ? 'ideal' : null, ...extra,
});
const bloco = (b: BlocoAnaliseVG['bloco'], rotulo: string, centros: number, valor: number, meta: number): BlocoAnaliseVG => ({
  bloco: b, rotulo, centros, valor, meta, dif: Math.round((valor - meta) * 100) / 100, pct: -5, razao: 0.95, qtd: 9, unidade_valida: true,
});
const PEC = ['Custeio', 'pecuaria'];
/* a ordem do banco (a de hoje: maior primeiro) mistura os blocos — a tela os separa sem reordenar dentro de cada um */
const LINHAS = [
  linha([...PEC, 'Nutrição'], 'Nutrição', 500, 600, { bloco: 'variavel' }),
  linha([...PEC, 'Mão de obra'], 'Mão de obra', 400, 300, { bloco: 'fixo' }),
  linha([...PEC, 'Sanidade'], 'Sanidade', 200, 250, { bloco: 'variavel' }),
  linha([...PEC, 'Manutenção'], 'Manutenção', 100, 120, { bloco: 'fixo' }),
];
const BLOCOS = [bloco('variavel', 'Custo variável', 2, 700.01, 850), bloco('fixo', 'Custo fixo', 2, 499.99, 420)];
const base = (tabela: AnaliseVG['tabela']): AnaliseVG => ({
  lado: 'saida', mes: '2026-10', criterio: 'mes', unidade: 'rs', meses_janela: 1, periodo: { de: '2026-01', ate_mes: '2026-10' },
  abas: [{ grupo: 'Custeio', rotulo: 'Custeio' }],
  unidades: [{ id: 'rs', rotulo: 'R$', valida: true }],
  resumo: null, tabela,
  foco: { total: linha(PEC, 'Pecuária', 1200, 1270), linhas: [] },
  grafico: { item: linha(PEC, 'Pecuária', 1200, 1270), caminho: [{ caminho: [], rotulo: 'Saídas' }], irmaos: [], serie: [],
    kpis: { mes: 1200, media: null, vs_meta: null, tendencia: null } },
});
const COM_BLOCOS = base({ total: linha(PEC, 'Pecuária', 1200, 1270), linhas: LINHAS, nivel: PEC, blocos: BLOCOS });
const SEM_BLOCOS = base({ total: linha(PEC, 'Pecuária', 1200, 1270), linhas: LINHAS, nivel: PEC, blocos: null });

const CTX = { clienteId: 'cli', de: '2026-01-01', ate: '2026-12-31', contas: null, fazendas: null, atividade: null, hoje: '2026-10-30', status: null, comVencidos: true };
let resposta: AnaliseVG = COM_BLOCOS;
beforeEach(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} disconnect() {} };
  rpc.mockReset(); resposta = COM_BLOCOS;
  rpc.mockImplementation(async () => ({ data: resposta, error: null }));
});
const abrir = async () => {
  render(<ModalAnaliseVG alvo={{ lado: 'saida', grupo: 'Custeio', am: '2026-10' }} ctx={CTX} rotuloContas="Caixa" onFechar={() => {}} />);
  await act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); });
};
/* as linhas do corpo da tabela da esquerda, em ordem: o testid e o texto da 1a célula */
const corpo = () => [...screen.getByTestId('analise-tabela-lista').querySelectorAll('tbody tr')]
  .map((tr) => `${tr.getAttribute('data-testid')}|${tr.querySelector('td')?.textContent?.trim()}`);

describe('VG-CUSTEIO-FIXO-VARIAVEL-01 — os centros em blocos', () => {
  it('B1 variável e fixo na ordem do banco, com o subtotal DO BANCO e os centros recuados na ordem de hoje', async () => {
    await abrir();
    expect(corpo()).toEqual([
      'analise-tabela-bloco-variavel|Custo variável · 2 centros',
      'analise-tabela-linha-0|Nutrição',
      'analise-tabela-linha-2|Sanidade',
      'analise-tabela-bloco-fixo|Custo fixo · 2 centros',
      'analise-tabela-linha-1|Mão de obra',
      'analise-tabela-linha-3|Manutenção',
    ]);
    /* 700,01 e 499,99 são os do banco (as linhas somam 700 e 500): a tela escreve, não soma */
    const v = screen.getByTestId('analise-tabela-bloco-variavel').querySelectorAll('td');
    expect([...v].slice(1).map((td) => td.textContent)).toEqual(['R$ 700,01', 'R$ 850,00', '−R$ 149,99', '−5,0%']);
    expect(screen.getByTestId('analise-tabela-bloco-fixo').querySelectorAll('td')[1].textContent).toBe('R$ 499,99');
    for (const i of [0, 1, 2, 3]) expect(screen.getByTestId(`analise-tabela-linha-${i}`).querySelector('td')?.hasAttribute('data-recuo')).toBe(true);
    expect(screen.getByTestId('analise-tabela-bloco-fixo').querySelector('td')?.className).toContain('pl-2');
    expect(screen.getByTestId('analise-tabela-titulo').textContent).toBe('Centros · Pecuária');
  });
  it('B2 sem blocos: a lista corrida de hoje, sem subtotal nem recuo', async () => {
    resposta = SEM_BLOCOS;
    await abrir();
    expect(corpo().map((x) => x.split('|')[0])).toEqual(['analise-tabela-linha-0', 'analise-tabela-linha-1', 'analise-tabela-linha-2', 'analise-tabela-linha-3']);
    expect(screen.getByTestId('analise-tabela-linha-0').querySelector('td')?.hasAttribute('data-recuo')).toBe(false);
  });
  it('B3 o centro do bloco vira o foco; o subtotal não pede nada', async () => {
    await abrir();
    const antes = rpc.mock.calls.length;
    fireEvent.click(screen.getByTestId('analise-tabela-bloco-variavel'));
    await act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); });
    expect(rpc.mock.calls.length).toBe(antes);
    fireEvent.click(screen.getByTestId('analise-tabela-linha-2'));
    await act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); });
    expect(rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_foco: [...PEC, 'Sanidade'] });
  });
  it('B4 "1 centro" no singular; o bloco "Sem classificação" quando o banco o manda', async () => {
    resposta = base({ total: linha(PEC, 'Pecuária', 1200, 1270), nivel: PEC,
      linhas: [linha([...PEC, 'Nutrição'], 'Nutrição', 500, 600, { bloco: 'variavel' }), linha([...PEC, 'Outros'], 'Outros', 700, 670, { bloco: 'sem' })],
      blocos: [bloco('variavel', 'Custo variável', 1, 500, 600), bloco('sem', 'Sem classificação', 1, 700, 670)] });
    await abrir();
    expect(corpo()).toEqual([
      'analise-tabela-bloco-variavel|Custo variável · 1 centro', 'analise-tabela-linha-0|Nutrição',
      'analise-tabela-bloco-sem|Sem classificação · 1 centro', 'analise-tabela-linha-1|Outros',
    ]);
  });
  it('B5 linhasEmBlocos: o índice de antes e a ordem de dentro do bloco; sem blocos, nulo', () => {
    const g = linhasEmBlocos(COM_BLOCOS.tabela);
    expect(g?.map((x) => [x.bloco.bloco, x.linhas.map((y) => `${y.i}:${y.l.rotulo}`)])).toEqual([
      ['variavel', ['0:Nutrição', '2:Sanidade']], ['fixo', ['1:Mão de obra', '3:Manutenção']]]);
    expect(linhasEmBlocos(SEM_BLOCOS.tabela)).toBeNull();
    expect(linhasEmBlocos({ ...SEM_BLOCOS.tabela, blocos: [] })).toBeNull();
  });
  it('B6 a Dif. R$ em 7,5px (Gabriel 30/10 16:21) nas linhas, subtotais e total dos Centros e dos Subcentros; as outras colunas não', async () => {
    resposta = { ...COM_BLOCOS, foco: { total: linha(PEC, 'Pecuária', 1200, 1270), linhas: [linha([...PEC, 'Nutrição', 'Sal'], 'Sal', 500, 600, { centro: 'Nutrição' })] } };
    await abrir();
    const ids = ['analise-tabela-total', 'analise-tabela-bloco-variavel', 'analise-tabela-bloco-fixo', 'analise-tabela-linha-0', 'analise-foco-total', 'analise-foco-linha-0'];
    for (const id of ids) {
      const tds = [...screen.getByTestId(id).querySelectorAll('td')];
      const dif = tds.filter((td) => td.getAttribute('data-col') === 'dif');
      expect(dif.length, id).toBe(1);
      expect(dif[0].textContent, id).toMatch(/R\$/);
      expect(dif[0].className, id).toContain('text-[7.5px]');
      const resto = tds.filter((td) => td.getAttribute('data-col') !== 'dif' && /R\$|%/.test(td.textContent ?? ''));
      expect(resto.length, id).toBeGreaterThan(0);
      for (const td of resto) expect(td.className, id).not.toContain('text-[7.5px]');
    }
    /* a Dif. R$ com 80px (era 98); a sobra vai para o nome (a 1a coluna, sem largura) */
    const larguras = (testid: string) => [...(screen.getByTestId(testid).closest('table')?.querySelectorAll('col') ?? [])].map((c) => c.style.width);
    expect(larguras('analise-tabela-total')).toEqual(['', '92px', '92px', '80px', '54px']);
    expect(larguras('analise-foco-total')).toEqual(['', '50px', '92px', '92px', '80px', '54px', '66px']);
  });
});
