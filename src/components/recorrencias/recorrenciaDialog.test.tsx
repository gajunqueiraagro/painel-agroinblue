/**
 * PR-FIN-RECORRENCIA-MODAL-01 — o modal da recorrência classifica como o lançamento (atividade → subcentro, safra
 * sugerida), esconde Cultura/Fase (a regra não as grava) e escolhe o dia numa grade de 7 colunas.
 *
 * ⚠ MEDIDO NA TELA (NJ, janela de 1.130, 30/09): Pecuária → "Safra 26/27 Pecuária" sugerida; Lavoura → "Safra 26/27
 *   Lavoura"; nenhum campo Cultura/Fase; grade 7×24px com o 10 em navy; Conta 207 · Favorecido 229 · Fazenda 150 ·
 *   Dia 64 · Início/Fim 118, todos com 32px e nada cortado. jsdom não faz layout: aqui se provam as regras.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ClassificacaoItem, Safra } from '@/hooks/useFinanceiroV2';
import type { Recorrencia } from '@/hooks/useRecorrencias';

const GRAVADO = vi.hoisted(() => ({ payloads: [] as Record<string, unknown>[] }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: async (p: Record<string, unknown>) => { GRAVADO.payloads.push(p); return { error: null }; },
      update: (p: Record<string, unknown>) => { GRAVADO.payloads.push(p); return { eq: async () => ({ error: null }) }; },
    }),
  },
}));
const CLASSIF = vi.hoisted((): ClassificacaoItem[] => [
  { id: 'pl-sal', subcentro: 'Salários e Encargos Pecuária', centro_custo: 'Mão de Obra', grupo_custo: 'Pessoal', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
  { id: 'pl-col', subcentro: 'Colheita Mandioca', centro_custo: 'Lavoura', grupo_custo: 'Custeio Lavoura', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'agricultura' },
]);
const SAFRAS = vi.hoisted(() => [
  { id: 'sf-pec-2627', nome: 'Safra 26/27 Pecuária', codigo: '26/27-Pec', ativa: true, escopo_negocio: 'pecuaria', data_inicio: '2026-07-01', data_fim: '2027-06-30' },
  { id: 'sf-pec-2526', nome: 'Safra 25/26 Pecuária', codigo: '25/26-Pec', ativa: true, escopo_negocio: 'pecuaria', data_inicio: '2025-07-01', data_fim: '2026-06-30' },
] as unknown as Safra[]);
const FIN = vi.hoisted(() => {
  const noop = async () => undefined;
  return { classificacoes: [] as ClassificacaoItem[], fornecedores: [], contasBancarias: [], safras: [] as Safra[],
    loadClassificacoes: noop, loadFornecedores: noop, loadContas: noop, loadSafras: noop, criarFornecedor: async () => null };
});
vi.mock('@/hooks/useFinanceiroV2', () => ({ useFinanceiroV2: () => FIN }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [{ id: 'f-pur', nome: 'Faz. Pureza' }] }) }));
vi.mock('@/hooks/useRecorrencias', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useRecorrencias')>()),
  propagarRecorrencia: async () => ({ ok: true, dados: { futuros: 0, passados: 0 } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RecorrenciaDialog } from './RecorrenciaDialog';
import { DiaVencimentoGrade } from './DiaVencimentoGrade';
import { ClassificacaoLancamento, type ClassificacaoValor } from '@/components/shared/ClassificacaoLancamento';

beforeEach(() => {
  GRAVADO.payloads = [];
  FIN.classificacoes = CLASSIF;
  FIN.safras = SAFRAS;
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

const VAZIO: ClassificacaoValor = { atividade: null, safra_id: '', cultura: '', fase: '', subcentro: '', macro_custo: '',
  grupo_custo: '', centro_custo: '', escopo_negocio: '', plano_conta_id: null };

describe('ClassificacaoLancamento — a prop `ocultarCulturaFase`', () => {
  const montar = (atividade: 'agricultura' | 'pecuaria', ocultar?: boolean) => render(
    <ClassificacaoLancamento value={{ ...VAZIO, atividade }} onChange={() => {}} classificacoes={CLASSIF} safras={SAFRAS}
      dataCompetencia="2026-10-10" tipoOperacao="2-Saídas" ocultarCulturaFase={ocultar} />);
  it('sem a prop (o lançamento, a obrigação): Cultura na lavoura e Fase na pecuária continuam', () => {
    const a = montar('agricultura');
    expect(screen.getByText('Cultura')).toBeInTheDocument();
    a.unmount();
    montar('pecuaria');
    expect(screen.getByText('Fase')).toBeInTheDocument();
  });
  it('com a prop (a recorrência): nenhum dos dois', () => {
    const a = montar('agricultura', true);
    expect(screen.queryByText('Cultura')).toBeNull();
    a.unmount();
    montar('pecuaria', true);
    expect(screen.queryByText('Fase')).toBeNull();
  });
});

describe('DiaVencimentoGrade', () => {
  it('abre uma grade de 7 colunas com 31 dias; o atual em navy; clicar escolhe e fecha', async () => {
    const onChange = vi.fn();
    render(<DiaVencimentoGrade value={10} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dia de vencimento' }));
    const grade = await screen.findByTestId('grade-dia-vencimento');
    expect(grade.firstElementChild!.className).toContain('grid-cols-7');
    const dias = within(grade).getAllByRole('button');
    expect(dias).toHaveLength(31);
    const dez = within(grade).getByRole('button', { name: '10' });
    expect(dez.getAttribute('aria-pressed')).toBe('true');
    expect(dez.className).toContain('bg-primary');
    expect(dias[0].className).toContain('h-6 w-6');
    fireEvent.click(within(grade).getByRole('button', { name: '28' }));
    expect(onChange).toHaveBeenCalledWith(28);
    await waitFor(() => expect(screen.queryByTestId('grade-dia-vencimento')).toBeNull());
  });
});

describe('RecorrenciaDialog — a classificação do lançamento', () => {
  const ED: Recorrencia = {
    id: 'rec-1', descricao: 'Folha de Pagamento', favorecidoId: null, favorecidoNome: null, contaBancariaId: 'bb',
    subcentro: 'Salários e Encargos Pecuária', safraId: 'sf-pec-2526', formaPagamento: null, observacao: null,
    valorBase: -3085, tipoOperacao: '2-Saídas', diaVencimento: 5, dataInicio: '2026-10-01', primeiroVencimento: '2026-11-05',
    dataFim: '2027-09-30', ativo: true, ultimoLancamentoGerado: null, fazendaId: 'f-pur', proximaCompetencia: null,
    situacao: 'ativa', gerados: 0,
  } as Recorrencia;

  it('na edição: a atividade sai do subcentro; a safra escolhida não é trocada pela sugestão; grava só subcentro e safra', async () => {
    render(<RecorrenciaDialog recorrencia={ED} clienteId="nj" aoFechar={() => {}} aoSalvar={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pecuária' }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.queryByText('Fase')).toBeNull();
    /* a safra gravada (25/26) fica: a sugestão pela data seria a 26/27 */
    expect(screen.getAllByRole('combobox').some((c) => c.textContent?.includes('Safra 25/26 Pecuária'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(GRAVADO.payloads).toHaveLength(1));
    const p = GRAVADO.payloads[0];
    expect(p).toMatchObject({ subcentro: 'Salários e Encargos Pecuária', safra_id: 'sf-pec-2526', dia_vencimento: 5 });
    for (const k of ['cultura', 'fase', 'escopo_negocio', 'plano_conta_id', 'atividade']) expect(p).not.toHaveProperty(k);
  });

  it('nova: escolher a atividade filtra o subcentro (Pecuária não oferece a conta da lavoura)', async () => {
    render(<RecorrenciaDialog clienteId="nj" aoFechar={() => {}} aoSalvar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pecuária' }));
    fireEvent.click(screen.getByText('Selecione o subcentro...'));
    expect(await screen.findByText('Salários e Encargos Pecuária')).toBeInTheDocument();
    expect(screen.queryByText('Colheita Mandioca')).toBeNull();
  });

  it('nova: escolher Pecuária sugere a safra pela data do vencimento', async () => {
    render(<RecorrenciaDialog clienteId="nj" aoFechar={() => {}} aoSalvar={() => {}} />);
    const inicio = screen.getAllByPlaceholderText('dd/mm/aaaa')[0];
    fireEvent.change(inicio, { target: { value: '01/10/2026' } });
    fireEvent.blur(inicio);
    fireEvent.click(screen.getByRole('button', { name: 'Pecuária' }));
    await waitFor(() => expect(screen.getByText('sugerida')).toBeInTheDocument());
    expect(screen.getAllByRole('combobox').some((c) => c.textContent?.includes('Safra 26/27 Pecuária'))).toBe(true);
  });
});
