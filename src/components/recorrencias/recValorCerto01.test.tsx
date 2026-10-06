/**
 * REC-VALOR-CERTO-01 — o CADASTRO (o valor é Certo | A confirmar, e a caixa da Folha) e a TELA de Recorrências (lida da FONTE).
 *
 * ⚠ O jsdom NÃO MEDE: aqui se prova o CONTRATO (o slot existe nos dois estados com a mesma altura declarada, o payload leva
 *   os dois atributos, trocar só eles não chama o Propagar). As medidas renderizadas estão no CLAUDE.md.
 * ⚠ VOCABULÁRIO: as duas palavras do DRE não podem aparecer nos arquivos tocados — o detector se auto-testa antes de varrer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ClassificacaoItem, Safra } from '@/hooks/useFinanceiroV2';
import type { Recorrencia } from '@/hooks/useRecorrencias';

const GRAVADO = vi.hoisted(() => ({ payloads: [] as Record<string, unknown>[], propagar: 0 }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: async (p: Record<string, unknown>) => { GRAVADO.payloads.push(p); return { error: null }; },
      update: (p: Record<string, unknown>) => { GRAVADO.payloads.push(p); return { eq: async () => ({ error: null }) }; },
    }),
  },
}));
const CLASSIF = vi.hoisted((): ClassificacaoItem[] => [
  { id: 'pl-sal', subcentro: 'Salários e Encargos Pecuária', centro_custo: 'Mão de Obra', grupo_custo: 'Pessoal', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' } as unknown as ClassificacaoItem,
]);
const FIN = vi.hoisted(() => {
  const noop = async () => undefined;
  return { classificacoes: [] as ClassificacaoItem[], fornecedores: [], contasBancarias: [], safras: [] as Safra[],
    loadClassificacoes: noop, loadFornecedores: noop, loadContas: noop, loadSafras: noop, criarFornecedor: async () => null };
});
vi.mock('@/hooks/useFinanceiroV2', () => ({ useFinanceiroV2: () => FIN }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [{ id: 'f-pur', nome: 'Faz. Pureza' }] }) }));
vi.mock('@/hooks/useRecorrencias', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useRecorrencias')>()),
  /* a regra TEM lançamentos gerados: se o Propagar for perguntado, o diálogo da propagação abriria */
  propagarRecorrencia: async () => { GRAVADO.propagar += 1; return { ok: true, dados: { futuros: 4, passados: 0 } }; },
}));
vi.mock('./PropagarRecorrenciaDialog', () => ({ PropagarRecorrenciaDialog: () => <div data-testid="dialogo-propagar" /> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RecorrenciaDialog } from './RecorrenciaDialog';
import { mudouOQueSePropaga, lerOcorrencia, type PayloadDaRegra } from '@/hooks/useRecorrencias';
import { EXPLICACAO_A_CONFIRMAR } from '@/lib/financeiro/recorrenciasDoMes';

beforeEach(() => {
  GRAVADO.payloads = []; GRAVADO.propagar = 0;
  FIN.classificacoes = CLASSIF;
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

const ED: Recorrencia = {
  id: 'rec-1', descricao: 'Energia da sede', favorecidoId: null, favorecidoNome: null, contaBancariaId: 'bb',
  subcentro: 'Salários e Encargos Pecuária', safraId: null, formaPagamento: 'Boleto', observacao: null,
  valorBase: -3085.5, tipoOperacao: '2-Saídas', diaVencimento: 5, dataInicio: '2026-10-01', primeiroVencimento: '2026-11-05',
  dataFim: '2027-09-30', ativo: true, ultimoLancamentoGerado: '2026-12-01', fazendaId: 'f-pur', proximaCompetencia: '2027-01-01',
  situacao: 'ativa', gerados: 4, valorAConfirmar: false, folha: false,
};
const abrir = (r: Recorrencia | null = ED) =>
  render(<RecorrenciaDialog recorrencia={r} clienteId="nj" aoFechar={() => {}} aoSalvar={() => {}} />);
const segmento = (nome: string) => within(screen.getByTestId('rec-tipo-do-valor')).getByRole('button', { name: nome });
const salvar = async () => {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pecuária' }).getAttribute('aria-pressed')).toBe('true'));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
  await waitFor(() => expect(GRAVADO.payloads).toHaveLength(1));
  return GRAVADO.payloads[0];
};

describe('o cadastro: "O valor é" e a folha', () => {
  it('recorrência NOVA nasce em "Certo", sem folha, com o slot presente e vazio', () => {
    abrir(null);
    expect(segmento('Certo').className).toContain('bg-primary');
    expect(segmento('A confirmar').className).not.toContain('bg-primary text-primary-foreground');
    expect(screen.getByTestId('rec-folha').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('rec-explicacao-a-confirmar').textContent).toBe('');
  });
  it('o SLOT tem a mesma altura declarada nos dois estados, e a frase só aparece em "A confirmar"', () => {
    abrir(null);
    const slot = screen.getByTestId('rec-slot-do-valor');
    const antes = slot.className;
    expect(antes).toContain('h-[28px]');
    fireEvent.click(segmento('A confirmar'));
    expect(screen.getByTestId('rec-slot-do-valor').className).toBe(antes);
    expect(screen.getByTestId('rec-explicacao-a-confirmar').textContent).toBe(EXPLICACAO_A_CONFIRMAR);
    expect(EXPLICACAO_A_CONFIRMAR).toBe('A confirmar: o valor base é uma estimativa. A conta de cada mês fica estimada até você informar o valor do mês.');
    fireEvent.click(segmento('Certo'));
    expect(screen.getByTestId('rec-explicacao-a-confirmar').textContent).toBe('');
  });
  it('na edição, o cadastro abre com o que a regra tem', () => {
    abrir({ ...ED, valorAConfirmar: true, folha: true });
    expect(segmento('A confirmar').className).toContain('bg-primary');
    expect(screen.getByTestId('rec-folha').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('rec-explicacao-a-confirmar').textContent).toBe(EXPLICACAO_A_CONFIRMAR);
  });
  it('o payload leva `tipo_valor` e `folha` — e NUNCA uma segunda coluna para a mesma verdade', async () => {
    abrir();
    fireEvent.click(segmento('A confirmar'));
    fireEvent.click(screen.getByTestId('rec-folha'));
    const p = await salvar();
    expect(p).toMatchObject({ tipo_valor: 'estimado', folha: true, valor_base: -3085.5, descricao: 'Energia da sede' });
    expect(p).not.toHaveProperty('valor_a_confirmar');
  });
  it('salvar sem mexer grava `exato` / false', async () => {
    abrir();
    expect(await salvar()).toMatchObject({ tipo_valor: 'exato', folha: false });
  });
});

describe('trocar o tipo ou a folha NÃO dispara o Propagar', () => {
  it('só o tipo e a folha mudaram: o Propagar nem é perguntado, e o diálogo dele não abre', async () => {
    abrir();
    fireEvent.click(segmento('A confirmar'));
    fireEvent.click(screen.getByTestId('rec-folha'));
    await salvar();
    await waitFor(() => expect(GRAVADO.propagar).toBe(0));
    expect(screen.queryByTestId('dialogo-propagar')).toBeNull();
  });
  it('a busca sabe achar: mudou a DESCRIÇÃO junto, o Propagar é perguntado e o diálogo abre', async () => {
    abrir();
    fireEvent.change(screen.getByPlaceholderText('Telefone, internet, mão de obra…'), { target: { value: 'Energia da sede nova' } });
    fireEvent.click(segmento('A confirmar'));
    await salvar();
    await waitFor(() => expect(GRAVADO.propagar).toBe(1));
    expect(await screen.findByTestId('dialogo-propagar')).toBeTruthy();
  });
  it('`mudouOQueSePropaga`: cada campo que o Propagar leva conta; o tipo e a folha, não', () => {
    const igual: PayloadDaRegra = {
      cliente_id: 'nj', fazenda_id: 'f-pur', descricao: 'Energia da sede', favorecido_id: null, conta_bancaria_id: 'bb',
      subcentro: 'Salários e Encargos Pecuária', safra_id: null, forma_pagamento: 'Boleto', observacao: null, valor_base: -3085.5,
      dia_vencimento: 5, data_inicio: '2026-10-01', primeiro_vencimento: '2026-11-05', data_fim: '2027-09-30', tipo_valor: 'exato', folha: false,
    };
    expect(mudouOQueSePropaga(ED, igual)).toBe(false);
    expect(mudouOQueSePropaga(ED, { ...igual, tipo_valor: 'estimado', folha: true })).toBe(false);
    const trocas: Partial<PayloadDaRegra>[] = [
      { fazenda_id: 'outra' }, { descricao: 'x' }, { favorecido_id: 'f1' }, { conta_bancaria_id: 'itau' }, { subcentro: 'y' },
      { safra_id: 's1' }, { forma_pagamento: 'PIX' }, { observacao: 'obs' }, { valor_base: -3085.51 }, { dia_vencimento: 6 },
      { data_inicio: '2026-11-01' }, { primeiro_vencimento: '2026-11-06' }, { data_fim: '2027-10-31' },
    ];
    expect(trocas).toHaveLength(13);
    for (const t of trocas) expect(`${Object.keys(t)[0]}:${mudouOQueSePropaga(ED, { ...igual, ...t })}`).toBe(`${Object.keys(t)[0]}:true`);
  });
});

describe('a leitura das ocorrências do mês', () => {
  it('`lerOcorrencia` lê campo a campo, e o que não tiver a forma esperada vira nulo — nunca uma marca inventada', () => {
    expect(lerOcorrencia({ recorrencia_id: 'r1', valor: '1234.56', data_vencimento: '2026-10-10', status_transacao: 'programado', valor_do_mes_em: '2026-10-05T10:00:00Z' }))
      .toEqual({ recorrenciaId: 'r1', valor: 1234.56, dataVencimento: '2026-10-10', status: 'programado', valorDoMesEm: '2026-10-05T10:00:00Z' });
    expect(lerOcorrencia({ recorrencia_id: 'r1', valor: 10, valor_do_mes_em: null }))
      .toEqual({ recorrenciaId: 'r1', valor: 10, dataVencimento: null, status: null, valorDoMesEm: null });
  });
});

/* ═══ A TELA, LIDA DA FONTE ═══════════════════════════════════════════════════════════════════════════════════════════ */
const cru = (arq: string) => readFileSync(arq, 'utf8');
const fonte = (arq: string) => cru(arq).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

describe('a tela de Recorrências (V2Recorrencias, lida da FONTE): a tela não soma', () => {
  const f = fonte('src/v2/pages/V2Recorrencias.tsx');
  it('cartões, barra, lista e rodapé leem o dono', () => {
    expect(f).toContain('const linhas = useMemo(() => linhasDoMes(recorrencias, ocorrencias, mes), [recorrencias, ocorrencias, mes]);');
    expect(f).toContain('const resumo = useMemo(() => resumoDoMes(linhas), [linhas]);');
    expect(f).toContain('const proporcoes = useMemo(() => proporcoesDoMes(resumo), [resumo]);');
    expect(f).toContain('filtrarLinhas(linhas, filtroTipo, filtroSituacao)');
    expect(f).toContain('return totalDaLista(linhasNaLista);');
    for (const fatia of ['resumo.total', 'resumo.certo', 'resumo.confirmado', 'resumo.estimado', 'resumo.folha']) expect(f).toContain(`fatia: ${fatia}`);
  });
  it('nenhuma soma na tela: sem `reduce`, sem `+=` e sem somar `valorBase`', () => {
    /* a busca sabe achar: o dono soma */
    expect(fonte('src/lib/financeiro/recorrenciasDoMes.ts')).toMatch(/\+=/);
    expect(f).not.toMatch(/\.reduce\(/);
    expect(f).not.toMatch(/\+=/);
    expect(f).not.toMatch(/\+ r\.valorBase|valorBase \+/);
  });
  it('a régua do mês é a da casa, um mês só, nascendo no mês corrente, com os meses neutros', () => {
    expect(f).toContain('const [periodo, setPeriodo] = useState<Periodo>(() => mesCorrente());');
    expect(f).toContain('<SeletorPeriodo modo="ano-mes" modoUnico periodo={periodo} onPeriodoChange={setPeriodo} />');
    expect(f).not.toContain('tomPorMes');
  });
  it('valor de cartão e de linha nunca corta: o componente do valor é `whitespace-nowrap` e não leva `truncate`', () => {
    expect(f).toContain("<span className={cn('whitespace-nowrap tabular-nums', estimado ? AMBAR : entrada ? COR_SINAL.pos : COR_SINAL.neg, className)}>");
    expect(f).toContain("const TD_NUM = cn(TD, 'text-right tabular-nums whitespace-nowrap');");
    expect(f).not.toMatch(/TD_NUM[^;]{0,40}truncate/);
  });
  it('layout sem movimento: `table-fixed` com a MESMA régua de colunas na tabela e no rodapé, e a linha de filtros com altura declarada', () => {
    expect(f.match(/<Colunas \/>/g)).toHaveLength(2);
    expect(f).toContain('<Table density="dense" className="table-fixed" data-testid="rec-tabela"');
    expect(f).toContain('<table className="w-full table-fixed border-collapse">');
    expect(f).toContain('<div className="flex h-[22px] items-center gap-1.5" data-testid="rec-filtros">');
    expect(f).toContain('<div className="flex h-[8px] w-full overflow-hidden rounded-sm bg-muted" data-testid="rec-barra"');
  });
  it('ao abrir, ordena por Dia crescente; o primeiro clique numa coluna vai do maior para o menor', () => {
    expect(f).toContain("useState<{ campo: Coluna; direcao: Direcao }>({ campo: 'dia', direcao: 'asc' });");
    expect(f).toContain("o.campo === campo ? { campo, direcao: o.direcao === 'asc' ? 'desc' : 'asc' } : { campo, direcao: 'desc' });");
  });
});

describe('o vocabulário: as duas palavras do DRE não aparecem nos arquivos tocados', () => {
  /* montadas em pedaços para este arquivo não as conter por extenso */
  const PROIBIDAS = new RegExp(`(^|[^\\p{L}])(${'fi' + 'xo'}s?|${'vari'}[aá]${'vel'}|${'vari'}[aá]${'veis'})($|[^\\p{L}])`, 'iu');
  it('auto-teste: o detector acha as duas, em qualquer caixa, e não confunde com palavra vizinha', () => {
    expect(PROIBIDAS.test('custo ' + 'FI' + 'XO')).toBe(true);
    expect(PROIBIDAS.test('valor ' + 'vari' + 'ável')).toBe(true);
    expect(PROIBIDAS.test('valor ' + 'vari' + 'avel')).toBe(true);
    expect(PROIBIDAS.test('altura fixa, prefixo, afixou')).toBe(false);
  });
  it('nenhum dos arquivos tocados as contém — em código, rótulo ou comentário', () => {
    for (const a of [
      'src/lib/financeiro/recorrenciasDoMes.ts', 'src/lib/financeiro/recorrenciasDoMes.test.ts', 'src/hooks/useRecorrencias.ts',
      'src/v2/pages/V2Recorrencias.tsx', 'src/components/recorrencias/RecorrenciaDialog.tsx', 'src/components/recorrencias/recValorCerto01.test.tsx',
    ]) {
      const achou = cru(a).split('\n').findIndex((l) => PROIBIDAS.test(l));
      expect(`${a}:${achou === -1 ? 'limpo' : `linha ${achou + 1}`}`).toBe(`${a}:limpo`);
    }
  });
});
