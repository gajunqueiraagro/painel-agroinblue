/**
 * P160 (Gabriel 28/10/2026, decisão A) — o Propagar AVISA quando a competência recalculada cai FORA da vigência e, depois de propagar,
 * o salvar roda POR ÚLTIMO a prévia do P154 (`fn_recorrencia_fora_da_vigencia`), mesmo sem a vigência ter encolhido. O caso é o do Santa
 * Rita (11/10): "dia 02 do mês seguinte" → "dia 29 do próprio mês" moveu cada competência +1 mês e a de 02/07/2027 caiu em 07/2027.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { Recorrencia } from '@/hooks/useRecorrencias';

const LOG = vi.hoisted(() => ({ ordem: [] as string[], propagar: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (fn: string, a: Record<string, unknown>) => {
      if (fn === 'fn_recorrencia_propagar') { LOG.ordem.push(`propagar:${a.p_simular ? 'simular' : String(a.p_escopo)}`); return { data: LOG.propagar, error: null }; }
      return { data: null, error: null };
    },
    from: () => ({ update: () => ({ eq: async () => { LOG.ordem.push('update'); return { error: null }; } }), insert: async () => ({ error: null }) }),
  },
}));
const CLASSIF = vi.hoisted((): ClassificacaoItem[] => [
  { id: 'pl-sal', subcentro: 'Salários e Encargos Pecuária', centro_custo: 'Mão de Obra', grupo_custo: 'Pessoal', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
]);
vi.mock('@/hooks/useFinanceiroV2', () => {
  const noop = async () => undefined;
  return { useFinanceiroV2: () => ({ classificacoes: CLASSIF, fornecedores: [], contasBancarias: [], safras: [],
    loadClassificacoes: noop, loadFornecedores: noop, loadContas: noop, loadSafras: noop, criarFornecedor: async () => null }) };
});
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [{ id: 'f-sr', nome: 'Faz. Santa Rita' }] }) }));
vi.mock('@/hooks/useRecorrencias', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useRecorrencias')>()),
  foraDaVigencia: async (_id: string, cancelarRegra: boolean, simular: boolean) => {
    LOG.ordem.push(`fora:${cancelarRegra ? 'regra' : 'vigencia'}:${simular ? 'simular' : 'gravar'}`);
    return { ok: true, dados: { modo: 'encurtada', corte: null, cancela: [], naoMexe: [], qtde: 0, soma: 0, regraCancelada: false } };
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/fornecedores/cadastroDaCasaBanco', () => ({
  fonteDoCadastroNoBanco: { lerPorNome: async () => [], lerAtivos: async () => [], reativar: async () => {} },
}));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    <input aria-label="data-de-mentira" value={value} onChange={e => onChange(e.target.value)} />,
}));

import { RecorrenciaDialog } from './RecorrenciaDialog';
import { PropagarRecorrenciaDialog } from './PropagarRecorrenciaDialog';
import { propagarRecorrencia } from '@/hooks/useRecorrencias';

const PROJ = (fora: unknown[]) => ({ alteradas: 12, marca_depois: '2027-07-01', a_gerar: [], duplicidades: [], vagas: [], aviso: null, fora_da_vigencia: fora });
const FORA = [{ lancamento_id: 'dcac275b', venc: '2027-07-02', comp_antiga: '2027-06-01', comp_nova: '2027-07-01' }];
const SR_SIM = (fora: unknown[]) => ({
  futuros: 12, passados: 0, simulado: true, aplicados_futuros: 0, aplicados_passados: 0,
  competencia: { desloc: 0, marca_antes: '2027-06-01', meses_fechados: [],
    futuros: { alteradas: 12, puladas_mes_fechado: 0, lista: [] }, passados: { alteradas: 0, puladas_mes_fechado: 0, lista: [] },
    projecao: { futuros: PROJ(fora), todos: PROJ(fora) } },
});

const ED: Recorrencia = {
  id: 'rec-sr', descricao: 'Folha Pagamento', favorecidoId: null, favorecidoNome: null, contaBancariaId: 'bb',
  subcentro: 'Salários e Encargos Pecuária', safraId: null, formaPagamento: null, observacao: null,
  valorBase: -5740.23, tipoOperacao: '2-Saídas', diaVencimento: 2, dataInicio: '2026-07-01', primeiroVencimento: '2026-08-02',
  dataFim: '2027-06-30', ativo: true, ultimoLancamentoGerado: '2027-06-01', fazendaId: 'f-sr',
  valorAConfirmar: false, folha: true, proximaCompetencia: null, situacao: 'ativa', gerados: 12,
};

beforeEach(() => {
  LOG.ordem = []; LOG.propagar = SR_SIM(FORA);
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

describe('P160 — o aviso no Propagar', () => {
  it('lê `fora_da_vigencia` e o diálogo diz quantas e quais competências cairiam fora', async () => {
    const r = await propagarRecorrencia('rec-sr', 'futuros', true);
    expect(r.dados?.competencia?.projecao.futuros.foraDaVigencia).toEqual(
      [{ lancamentoId: 'dcac275b', venc: '2027-07-02', compAntiga: '2027-06-01', compNova: '2027-07-01' }]);
    render(<PropagarRecorrenciaDialog recorrenciaId="rec-sr" descricao="Folha Pagamento" previa={r.dados} recusa={null} aoFechar={() => {}} />);
    expect(screen.getByTestId('competencias-fora').textContent).toMatch(/^1 competência cairia fora\s+da vigência \(jul\/27\) — depois de propagar, a prévia mostra o que cancelar$/);
  });
  it('sem nada fora, nenhum aviso (RPC antiga sem a chave, também)', async () => {
    LOG.propagar = SR_SIM([]);
    const r = await propagarRecorrencia('rec-sr', 'futuros', true);
    render(<PropagarRecorrenciaDialog recorrenciaId="rec-sr" descricao="Folha Pagamento" previa={r.dados} recusa={null} aoFechar={() => {}} />);
    expect(screen.queryByTestId('competencias-fora')).toBeNull();
  });
});

describe('P160 — o salvar roda a prévia do P154 por último quando o Propagar avisou "fora"', () => {
  const abrir = () => {
    const aoFechar = vi.fn();
    render(<RecorrenciaDialog recorrencia={ED} clienteId="teste" aoFechar={aoFechar} aoSalvar={async () => { LOG.ordem.push('lista-rele'); }} />);
    return { aoFechar };
  };
  it('mudar só o dia (a vigência NÃO encolhe): depois do Propagar, a prévia do P154 é pedida', async () => {
    const t = abrir();
    fireEvent.click(screen.getByText('Do próprio mês'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByTestId('competencias-fora');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(t.aoFechar).toHaveBeenCalled());
    expect(LOG.ordem).toEqual(['update', 'propagar:simular', 'lista-rele', 'fora:vigencia:simular']);
  });
  it('sem aviso "fora" e sem encolher: não pergunta ao banco', async () => {
    LOG.propagar = SR_SIM([]);
    const t = abrir();
    fireEvent.click(screen.getByText('Do próprio mês'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(t.aoFechar).toHaveBeenCalled());
    expect(LOG.ordem.some((x) => x.startsWith('fora:'))).toBe(false);
  });
});
