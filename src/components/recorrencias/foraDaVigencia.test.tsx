/**
 * P154 (Gabriel 28/10/2026) — a recorrência ENCURTADA ou CANCELADA: a tela lê a prévia do BANCO (`fn_recorrencia_fora_da_vigencia` com
 * `p_simular`) e só cancela os previstos que ele lista. Aqui se prova a leitura da resposta, a pergunta "encolheu?", a frase, o diálogo
 * e a ORDEM no salvar (gravar → propagar → gerar → limpar por último). Quais lançamentos caem é do banco
 * (`supabase/tests/p154_recorrencia_fora_da_vigencia_test.sql`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { Recorrencia, ForaDaVigencia } from '@/hooks/useRecorrencias';

const LOG = vi.hoisted(() => ({
  ordem: [] as string[],
  fora: null as unknown,
  aplicar: null as unknown,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: async () => ({ data: null, error: null }), from: () => ({
    insert: async () => { LOG.ordem.push('insert'); return { error: null }; },
    update: () => ({ eq: async () => { LOG.ordem.push('update'); return { error: null }; } }),
  }) },
}));
const CLASSIF = vi.hoisted((): ClassificacaoItem[] => [
  { id: 'pl-sal', subcentro: 'Salários e Encargos Pecuária', centro_custo: 'Mão de Obra', grupo_custo: 'Pessoal', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
]);
vi.mock('@/hooks/useFinanceiroV2', () => {
  const noop = async () => undefined;
  return { useFinanceiroV2: () => ({ classificacoes: CLASSIF, fornecedores: [], contasBancarias: [], safras: [],
    loadClassificacoes: noop, loadFornecedores: noop, loadContas: noop, loadSafras: noop, criarFornecedor: async () => null }) };
});
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [{ id: 'f-pur', nome: 'Faz. Pureza' }] }) }));
vi.mock('@/hooks/useRecorrencias', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useRecorrencias')>()),
  propagarRecorrencia: async (_id: string, _escopo: string, simular: boolean) => {
    LOG.ordem.push(simular ? 'propagar:simular' : 'propagar');
    return { ok: true, dados: { futuros: 0, passados: 0 } };
  },
  foraDaVigencia: async (_id: string, cancelarRegra: boolean, simular: boolean) => {
    LOG.ordem.push(`fora:${cancelarRegra ? 'regra' : 'vigencia'}:${simular ? 'simular' : 'gravar'}`);
    return simular ? LOG.fora : LOG.aplicar;
  },
}));
const TOAST = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: TOAST }));
vi.mock('@/lib/fornecedores/cadastroDaCasaBanco', () => ({
  fonteDoCadastroNoBanco: { lerPorNome: async () => [], lerAtivos: async () => [], reativar: async () => {} },
}));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    <input aria-label="data-de-mentira" value={value} onChange={e => onChange(e.target.value)} />,
}));

import { RecorrenciaDialog } from './RecorrenciaDialog';
import { ForaDaVigenciaDialog, fraseDoFora } from './ForaDaVigenciaDialog';
import { lerForaDaVigencia, vigenciaEncolheu } from '@/hooks/useRecorrencias';

const ED: Recorrencia = {
  id: 'rec-1', descricao: 'Folha Pagamento', favorecidoId: null, favorecidoNome: null, contaBancariaId: 'bb',
  subcentro: 'Salários e Encargos Pecuária', safraId: null, formaPagamento: null, observacao: null,
  valorBase: -3007.44, tipoOperacao: '2-Saídas', diaVencimento: 5, dataInicio: '2026-09-01', primeiroVencimento: '2026-10-05',
  dataFim: '2027-06-30', ativo: true, ultimoLancamentoGerado: '2027-06-01', fazendaId: 'f-pur',
  valorAConfirmar: false, folha: true, proximaCompetencia: null, situacao: 'ativa', gerados: 10,
};
const RESPOSTA = {
  ok: true, simulado: true, modo: 'encurtada', corte: null, qtde: 2, soma: '6014.88', regra_cancelada: false,
  cancela: [
    { id: 'l-11', competencia: '2026-11-01', vencimento: '2026-12-05', valor: '3007.44', status: 'previsto', valor_do_mes: false },
    { id: 'l-12', competencia: '2026-12-01', vencimento: '2027-01-05', valor: '3007.44', status: 'previsto', valor_do_mes: true },
  ],
  nao_mexe: [{ id: 'l-10', competencia: '2026-10-01', vencimento: '2026-11-05', valor: '2877.31', status: 'programado', valor_do_mes: false,
    motivo: 'programado: só à mão' }],
};
const previa = (): ForaDaVigencia => {
  const p = lerForaDaVigencia(RESPOSTA);
  if (!p) throw new Error('fixture torto');
  return p;
};

beforeEach(() => {
  LOG.ordem = []; LOG.fora = { ok: true, dados: previa() }; LOG.aplicar = { ok: true, dados: { ...previa(), regraCancelada: false } };
  TOAST.success.mockClear(); TOAST.error.mockClear();
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

describe('P154 — a leitura da resposta do banco', () => {
  it('lê o modo, o que cancela (com a marca do valor do mês) e o que não mexe (com o porquê)', () => {
    const p = previa();
    expect(p.modo).toBe('encurtada');
    expect(p.qtde).toBe(2);
    expect(p.soma).toBe(6014.88);
    expect(p.cancela.map((l) => [l.id, l.valorDoMes])).toEqual([['l-11', false], ['l-12', true]]);
    expect(p.naoMexe[0]).toMatchObject({ id: 'l-10', status: 'programado', motivo: 'programado: só à mão' });
  });
  it('resposta torta = null (a tela nunca inventa)', () => {
    expect(lerForaDaVigencia({ ...RESPOSTA, ok: false })).toBeNull();
    expect(lerForaDaVigencia({ ...RESPOSTA, modo: 'outro' })).toBeNull();
    expect(lerForaDaVigencia(null)).toBeNull();
  });
});

describe('P154 — a vigência encolheu? (por mês; só regra ativa e já gerada)', () => {
  const antes = { dataInicio: '2026-09-01', dataFim: '2027-06-30', ativo: true, ultimoLancamentoGerado: '2027-06-01' };
  it('fim para trás ou início para a frente: sim; igual, mais larga ou só o dia: não', () => {
    expect(vigenciaEncolheu(antes, { data_inicio: '2026-09-01', data_fim: '2026-10-31' })).toBe(true);
    expect(vigenciaEncolheu(antes, { data_inicio: '2026-11-01', data_fim: '2027-06-30' })).toBe(true);
    expect(vigenciaEncolheu(antes, { data_inicio: '2026-09-01', data_fim: '2027-06-30' })).toBe(false);
    expect(vigenciaEncolheu(antes, { data_inicio: '2026-08-01', data_fim: '2027-08-31' })).toBe(false);
    expect(vigenciaEncolheu(antes, { data_inicio: '2026-09-20', data_fim: '2027-06-01' })).toBe(false);
  });
  it('regra pausada ou que nunca gerou: não pergunta', () => {
    const p = { data_inicio: '2026-09-01', data_fim: '2026-10-31' };
    expect(vigenciaEncolheu({ ...antes, ativo: false }, p)).toBe(false);
    expect(vigenciaEncolheu({ ...antes, ultimoLancamentoGerado: null }, p)).toBe(false);
  });
});

describe('P154 — o diálogo', () => {
  it('a frase diz quantos, quanto, o motivo e que nada se apaga; e o que fica', () => {
    const f = fraseDoFora('encurtada', previa());
    expect(f).toMatch(/^2 previstos depois da vigência nova · R\$\s6\.014,88 — cancelados com o motivo "recorrência encerrada em \d\d\/\d\d\/\d{4}"; nada se apaga\. 1 fica como está \(abaixo\)\.$/);
  });
  it('encurtada: lista os 2, marca o valor do mês, mostra o programado em "Não mexo"; o botão grava; a recusa fica no rodapé', async () => {
    const aoConfirmar = vi.fn(async () => {});
    const { rerender } = render(<ForaDaVigenciaDialog modo="encurtada" descricao="Folha" previa={previa()} carregando={false} erro={null}
      aoConfirmar={aoConfirmar} aoFechar={vi.fn()} />);
    expect(screen.getAllByTestId('fora-cancela')).toHaveLength(2);
    expect(screen.getAllByTestId('fora-cancela')[1]).toHaveTextContent('valor do mês ajustado');
    expect(screen.getByTestId('fora-nao-mexe')).toHaveTextContent('programado: só à mão');
    fireEvent.click(screen.getByTestId('cancelar-previstos'));
    await waitFor(() => expect(aoConfirmar).toHaveBeenCalledWith(true));
    rerender(<ForaDaVigenciaDialog modo="encurtada" descricao="Folha" previa={previa()} carregando={false} erro="sem acesso a este registro"
      aoConfirmar={aoConfirmar} aoFechar={vi.fn()} />);
    expect(screen.getByTestId('rodape-fora')).toHaveTextContent('sem acesso a este registro');
  });
  it('cancelar: "Só a regra" e "Cancelar a regra e os N previstos"; sem previsto, o segundo trava', async () => {
    const aoConfirmar = vi.fn(async () => {});
    const vazia: ForaDaVigencia = { ...previa(), modo: 'cancelada', corte: '2026-10', cancela: [], naoMexe: [], qtde: 0, soma: 0 };
    render(<ForaDaVigenciaDialog modo="cancelar" descricao="Folha" previa={vazia} carregando={false} erro={null}
      aoConfirmar={aoConfirmar} aoFechar={vi.fn()} />);
    expect(screen.getByTestId('cancelar-com-previstos')).toBeDisabled();
    expect(screen.getByTestId('rodape-fora')).toHaveTextContent('Nenhum previsto a partir de 10/2026. A regra para de gerar.');
    fireEvent.click(screen.getByTestId('so-a-regra'));
    await waitFor(() => expect(aoConfirmar).toHaveBeenCalledWith(false));
  });
});

describe('P154 — salvar a edição que ENCURTOU: gravar → propagar → limpar por último, pela prévia do banco', () => {
  const abrir = () => {
    const aoSalvar = vi.fn(async () => { LOG.ordem.push('lista-rele'); });
    const aoFechar = vi.fn();
    render(<RecorrenciaDialog recorrencia={ED} clienteId="teste" aoFechar={aoFechar} aoSalvar={aoSalvar} />);
    const [, fim] = screen.getAllByLabelText('data-de-mentira');
    return { aoSalvar, aoFechar, fim };
  };
  it('fim de 06/2027 para 10/2026: a prévia abre depois do save; "Cancelar os 2 previstos" grava pela mesma porta e fecha', async () => {
    const t = abrir();
    fireEvent.change(t.fim, { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByTestId('modal-fora-da-vigencia');
    expect(LOG.ordem).toEqual(['update', 'propagar:simular', 'lista-rele', 'fora:vigencia:simular']);
    fireEvent.click(screen.getByTestId('cancelar-previstos'));
    await waitFor(() => expect(t.aoFechar).toHaveBeenCalled());
    expect(LOG.ordem.slice(-2)).toEqual(['fora:vigencia:gravar', 'lista-rele']);
  });
  it('nada fora da vigência: fecha como sempre, sem diálogo', async () => {
    LOG.fora = { ok: true, dados: { ...previa(), cancela: [], naoMexe: [], qtde: 0, soma: 0 } };
    const t = abrir();
    fireEvent.change(t.fim, { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(t.aoFechar).toHaveBeenCalled());
    expect(screen.queryByTestId('modal-fora-da-vigencia')).toBeNull();
  });
  it('vigência igual: nem pergunta ao banco', async () => {
    const t = abrir();
    fireEvent.change(t.fim, { target: { value: '2027-06-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(t.aoFechar).toHaveBeenCalled());
    expect(LOG.ordem.some((x) => x.startsWith('fora:'))).toBe(false);
  });
});
