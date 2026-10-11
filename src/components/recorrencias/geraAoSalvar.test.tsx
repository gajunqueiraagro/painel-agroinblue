/**
 * RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01, parte 2 (Gabriel, 10/10/2026) — salvar a edição da vigência gera, no mesmo fluxo, os
 * meses que ela passou a cobrir, pela MESMA função do "Gerar lançamentos", e POR ÚLTIMO: gravar a regra → propagar (se houver)
 * → gerar. O resultado fica escrito; sem toast.
 *
 * ⚠ O QUE SE PROVA AQUI É A ORDEM E O QUE A TELA CHAMA/ESCREVE. Quais meses nascem é do banco
 *   (`supabase/tests/recorrencia_gera_ao_salvar_01_test.sql`). As datas entram por um campo de mentira no lugar do DatePicker.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ClassificacaoItem, Safra } from '@/hooks/useFinanceiroV2';
import type { Recorrencia, RespostaDoGerar } from '@/hooks/useRecorrencias';

const LOG = vi.hoisted(() => ({
  ordem: [] as string[],
  previaDoPropagar: { futuros: 0, passados: 0 } as Record<string, unknown>,
  gerar: null as unknown,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({
    insert: async () => { LOG.ordem.push('insert'); return { error: null }; },
    update: () => ({ eq: async () => { LOG.ordem.push('update'); return { error: null }; } }),
  }) },
}));
const CLASSIF = vi.hoisted((): ClassificacaoItem[] => [
  { id: 'pl-sal', subcentro: 'Salários e Encargos Pecuária', centro_custo: 'Mão de Obra', grupo_custo: 'Pessoal', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
]);
const SAFRAS = vi.hoisted(() => [
  { id: 'sf-pec-2627', nome: 'Safra 26/27 Pecuária', codigo: '26/27-Pec', ativa: true, escopo_negocio: 'pecuaria', data_inicio: '2026-07-01', data_fim: '2027-06-30' },
] as unknown as Safra[]);
vi.mock('@/hooks/useFinanceiroV2', () => {
  const noop = async () => undefined;
  return { useFinanceiroV2: () => ({ classificacoes: CLASSIF, fornecedores: [], contasBancarias: [], safras: SAFRAS,
    loadClassificacoes: noop, loadFornecedores: noop, loadContas: noop, loadSafras: noop, criarFornecedor: async () => null }) };
});
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [{ id: 'f-pur', nome: 'Faz. Pureza' }] }) }));
vi.mock('@/hooks/useRecorrencias', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useRecorrencias')>()),
  propagarRecorrencia: async (_id: string, escopo: string, simular: boolean) => {
    LOG.ordem.push(simular ? 'propagar:simular' : `propagar:${escopo}`);
    return { ok: true, dados: LOG.previaDoPropagar };
  },
  gerarRecorrencia: async (_id: string, ate: string | null, simular: boolean) => {
    LOG.ordem.push(`gerar:${ate ?? 'sem-teto'}:${simular ? 'simular' : 'gravar'}`);
    return LOG.gerar;
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
import { PropagarRecorrenciaDialog } from './PropagarRecorrenciaDialog';
import { geraAoSalvarAEdicao, vigenciaPassouACobrir, FRASE_GERA_DEPOIS_DE_PROPAGAR } from '@/hooks/useRecorrencias';

const GEROU_2: RespostaDoGerar = { ok: true, gerados: 2, de: '2026-08-01', ate: '2026-09-01', geradoDe: '2026-08', geradoAte: '2026-09',
  vagas: [{ competencia: '2026-08', vencimento: '2026-09-05' }, { competencia: '2026-09', vencimento: '2026-10-05' }],
  naoGerados: [], erro: null } as RespostaDoGerar;

const ED = {
  id: 'rec-1', descricao: 'Folha de Pagamento', favorecidoId: null, favorecidoNome: null, contaBancariaId: 'bb',
  subcentro: 'Salários e Encargos Pecuária', safraId: 'sf-pec-2627', formaPagamento: null, observacao: null,
  valorBase: -3085, tipoOperacao: '2-Saídas', diaVencimento: 5, dataInicio: '2026-10-01', primeiroVencimento: '2026-11-05',
  dataFim: '2027-03-31', ativo: true, ultimoLancamentoGerado: '2027-03-01', fazendaId: 'f-pur', proximaCompetencia: null,
  situacao: 'gerada_ate_o_fim', gerados: 6, tipoValor: 'exato', folha: false,
} as unknown as Recorrencia;

beforeEach(() => {
  LOG.ordem = []; LOG.previaDoPropagar = { futuros: 0, passados: 0 }; LOG.gerar = GEROU_2;
  TOAST.success.mockClear(); TOAST.error.mockClear();
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

const abrir = (ed: Recorrencia = ED) => {
  const aoSalvar = vi.fn(async () => { LOG.ordem.push('lista-rele'); });
  const aoFechar = vi.fn();
  render(<RecorrenciaDialog recorrencia={ed} clienteId="teste" aoFechar={aoFechar} aoSalvar={aoSalvar} />);
  const [inicio, fim] = screen.getAllByLabelText('data-de-mentira');
  return { aoSalvar, aoFechar, inicio, fim };
};
const salvar = () => fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

describe('a pergunta "a vigência ficou mais larga?" (por mês; quais meses, quem diz é o banco)', () => {
  const antes = { dataInicio: '2026-10-01', dataFim: '2027-03-31' };
  it('início para trás ou fim para a frente: sim; igual, encurtada ou só o dia dentro do mês: não', () => {
    expect(vigenciaPassouACobrir(antes, { data_inicio: '2026-08-01', data_fim: '2027-03-31' })).toBe(true);
    expect(vigenciaPassouACobrir(antes, { data_inicio: '2026-10-01', data_fim: '2027-05-31' })).toBe(true);
    expect(vigenciaPassouACobrir(antes, { data_inicio: '2026-10-01', data_fim: '2027-03-31' })).toBe(false);
    expect(vigenciaPassouACobrir(antes, { data_inicio: '2026-11-01', data_fim: '2027-02-28' })).toBe(false);
    expect(vigenciaPassouACobrir(antes, { data_inicio: '2026-10-15', data_fim: '2027-03-01' })).toBe(false);
    expect(vigenciaPassouACobrir(antes, { data_inicio: null, data_fim: '2027-05-31' })).toBe(false);
  });
  it('só regra ATIVA e JÁ GERADA gera ao salvar — a que nunca gerou e a pausada esperam o "Gerar lançamentos"', () => {
    const p = { data_inicio: '2026-08-01', data_fim: '2027-03-31' };
    expect(geraAoSalvarAEdicao({ ...antes, ativo: true, ultimoLancamentoGerado: '2027-03-01' }, p)).toBe(true);
    expect(geraAoSalvarAEdicao({ ...antes, ativo: true, ultimoLancamentoGerado: null }, p)).toBe(false);
    expect(geraAoSalvarAEdicao({ ...antes, ativo: false, ultimoLancamentoGerado: '2027-03-01' }, p)).toBe(false);
  });
});

describe('salvar a edição: gravar → propagar → gerar por último', () => {
  it('início 2 meses para trás, sem nada a propagar: o gerar roda logo depois do save, sem teto, e o resultado fica escrito', async () => {
    const t = abrir();
    fireEvent.change(t.inicio, { target: { value: '2026-08-01' } });
    salvar();
    const res = await screen.findByTestId('gerado-resultado');
    expect(res.textContent).toBe('gerou 2: 08/26 a 09/26');
    expect(screen.getByTestId('gerado-vagas').textContent).toContain('08/26');
    expect(LOG.ordem).toEqual(['update', 'propagar:simular', 'gerar:sem-teto:gravar', 'lista-rele']);
    /* o diálogo NÃO fecha sozinho; a lista já releu; nenhum toast fala do gerar */
    expect(t.aoFechar).not.toHaveBeenCalled();
    expect(TOAST.error).not.toHaveBeenCalled();
    expect(TOAST.success.mock.calls.flat().join(' ')).not.toMatch(/gerou|gerad/i);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(t.aoFechar).toHaveBeenCalledTimes(1);
  });

  it('fim para a frente: gera também', async () => {
    const t = abrir();
    fireEvent.change(t.fim, { target: { value: '2027-05-31' } });
    salvar();
    await screen.findByTestId('gerado-resultado');
    expect(LOG.ordem.filter(x => x.startsWith('gerar'))).toEqual(['gerar:sem-teto:gravar']);
  });

  it('mês fechado: dito no lugar reservado, com o motivo do banco', async () => {
    LOG.gerar = { ...GEROU_2, gerados: 1, geradoDe: '2026-08', geradoAte: '2026-08', vagas: [{ competencia: '2026-08', vencimento: '2026-09-05' }],
      naoGerados: [{ competencia: '2026-09', vencimento: '2026-10-05', motivo: 'mês fechado' }] };
    const t = abrir();
    fireEvent.change(t.inicio, { target: { value: '2026-08-01' } });
    salvar();
    expect((await screen.findByTestId('gerado-nao-gerados')).textContent).toBe('não gerado: 09/26 (venc 05/10/26) — mês fechado');
    expect(screen.getByTestId('gerado-resultado').textContent).toBe('gerou 1: 08/26');
  });

  it('o banco recusa o gerar: a recusa fica escrita, a regra já está salva e a lista relê', async () => {
    LOG.gerar = { ...GEROU_2, ok: false, gerados: 0, erro: 'Recorrência pausada.' };
    const t = abrir();
    fireEvent.change(t.inicio, { target: { value: '2026-08-01' } });
    salvar();
    expect((await screen.findByTestId('gerado-erro')).textContent).toBe('Recorrência pausada.');
    await waitFor(() => expect(t.aoSalvar).toHaveBeenCalledTimes(1));
    expect(TOAST.error).not.toHaveBeenCalled();
  });

  it('o lugar do resultado tem altura fixa em todo estado', async () => {
    const t = abrir();
    fireEvent.change(t.inicio, { target: { value: '2026-08-01' } });
    salvar();
    await screen.findByTestId('gerado-resultado');
    expect(screen.getByTestId('gerado-lugar').className.split(' ')).toContain('h-[57px]');
  });

  it('regra editada SEM alargar a vigência (fim encurtado): nada é gerado', async () => {
    const t = abrir();
    fireEvent.change(t.fim, { target: { value: '2027-02-28' } });   // encurtada
    salvar();
    await waitFor(() => expect(t.aoFechar).toHaveBeenCalledTimes(1));
    expect(LOG.ordem.some(x => x.startsWith('gerar'))).toBe(false);
    expect(screen.queryByTestId('gerado-lugar')).toBeNull();
  });

  it('regra que nunca gerou: alargar a vigência não gera a série por conta própria', async () => {
    const t = abrir({ ...ED, ultimoLancamentoGerado: null } as Recorrencia);
    fireEvent.change(t.inicio, { target: { value: '2026-08-01' } });
    salvar();
    await waitFor(() => expect(t.aoFechar).toHaveBeenCalledTimes(1));
    expect(LOG.ordem.some(x => x.startsWith('gerar'))).toBe(false);
  });
});

describe('quando o propagar aparece: o gerar espera por ele, em qualquer saída', () => {
  const comPropagar = () => {
    LOG.previaDoPropagar = { futuros: 6, passados: 0, aplicadosFuturos: 0, aplicadosPassados: 0, simulado: true, competencia: null, valorDoMes: { futuros: 0, todos: 0 }, puladasValorDoMes: 0 };
    const t = abrir();
    fireEvent.change(t.inicio, { target: { value: '2026-08-01' } });
    salvar();
    return t;
  };
  it('enquanto o propagar está aberto NADA foi gerado, e a linha fixa diz o que vem depois', async () => {
    comPropagar();
    const linha = await screen.findByTestId('propagar-gera-depois');
    expect(linha.textContent).toBe(FRASE_GERA_DEPOIS_DE_PROPAGAR);
    expect(linha.className).toContain('h-[14px]');
    expect(LOG.ordem).toEqual(['update', 'propagar:simular']);
  });
  it('Propagar: o gerar roda DEPOIS da propagação gravada', async () => {
    comPropagar();
    await screen.findByTestId('propagar-gera-depois');
    fireEvent.click(screen.getByRole('button', { name: /^Propagar/ }));
    await screen.findByTestId('gerado-resultado');
    expect(LOG.ordem).toEqual(['update', 'propagar:simular', 'propagar:futuros', 'gerar:sem-teto:gravar', 'lista-rele']);
  });
  it('Fechar o propagar sem propagar: a regra já está gravada e o gerar roda mesmo assim, com o resultado escrito', async () => {
    const t = comPropagar();
    await screen.findByTestId('propagar-gera-depois');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await screen.findByTestId('gerado-resultado');
    expect(LOG.ordem).toEqual(['update', 'propagar:simular', 'gerar:sem-teto:gravar', 'lista-rele']);
    expect(t.aoFechar).not.toHaveBeenCalled();
  });
});

describe('PropagarRecorrenciaDialog — o lugar da frase existe sempre', () => {
  const previa = { futuros: 6, passados: 0, aplicadosFuturos: 0, aplicadosPassados: 0, simulado: true, competencia: null, valorDoMes: { futuros: 0, todos: 0 }, puladasValorDoMes: 0 };
  it('sem `geraDepois`: o lugar está lá, vazio, com a mesma altura', () => {
    render(<PropagarRecorrenciaDialog recorrenciaId="r" descricao="x" previa={previa} recusa={null} aoFechar={() => {}} />);
    const l = screen.getByTestId('propagar-gera-depois');
    expect(l.textContent).toBe('');
    expect(l.className).toContain('h-[14px]');
  });
});

describe('fonte — uma função de geração só, e o gerar é o último passo', () => {
  const dlg = readFileSync(resolve(__dirname, 'RecorrenciaDialog.tsx'), 'utf8');
  const res = readFileSync(resolve(__dirname, 'GeradoAposSalvarDialog.tsx'), 'utf8');
  it('o salvar gera pela `gerarRecorrencia` do dono, gravando e sem teto; nenhuma RPC de gerar escrita na tela', () => {
    expect(dlg).toContain('gerarRecorrencia(id, null, false)');
    expect(dlg.match(/gerarRecorrencia\(/g)).toHaveLength(1);
    expect(dlg + res).not.toMatch(/fn_recorrencia_gerar'/);
    expect(dlg + res).not.toMatch(/_fn_recorrencia_vagas/);
  });
  it('o diálogo do resultado não tem toast nem conta', () => {
    expect(res).not.toMatch(/sonner|toast\(/);
    expect(res).not.toMatch(/\.reduce\(|\+=/);
  });
});
