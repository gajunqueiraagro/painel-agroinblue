/**
 * P128b — a PRÉVIA CAMPO A CAMPO desenha o que o banco devolve (hoje → fica, igual, cadeado, DRE) e manda ao banco SÓ o que a pessoa deixou:
 * a coluna desmarcada não vai, a célula mantida (✎) não vai naquela parcela. Banco FALSO, dados SINTÉTICOS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Consulta } from '@/lib/financeiro/nfeConsultas';
import type { AlvoDaPrevia, ResultadoCompletar, ValoresParaTodas } from '@/lib/financeiro/nfe/notaCompletar';

/* o banco falso: a l1 é conciliada (cadeado na conta), a descrição muda em todas, o nº já é o da nota (igual) */
const banco = vi.hoisted(() => ({
  completarComANota: vi.fn(async (_c: string, pedido: readonly Record<string, unknown>[], _o: { juntar: boolean; chave: string | null; simular: boolean })
    : Promise<Consulta<ResultadoCompletar>> => ({ ok: true, valor: { ok: true, recusas: [], operacao: null, financiamentoId: null,
      efeitoDre: [{ mesDe: '2031-05', subcentroDe: 'Manutenção', mesPara: '2031-06', subcentroPara: 'Investimento', valor: 1264, lancamentos: 2 }],
      linhas: pedido.map((p) => ({ id: String(p.id), descricao: 'Cercas', situacao: p.id === 'l1' ? 'conciliada' : 'programada', parcelaN: null, campos: {
        descricao: { hoje: 'Cercas', fica: p.descricao ?? 'Cercas', muda: 'descricao' in p, hojeNome: null, ficaNome: null, cadeado: null },
        numero_documento: { hoje: 'NF 1', fica: 'NF 1', muda: false, hojeNome: null, ficaNome: null, cadeado: null },
        /* a l2 é a "criada sem conta" (o caso da Alta Paulista 4/4): hoje vazia; marcando Conta, ganha a da nota */
        conta_bancaria_id: p.id === 'l1'
          ? { hoje: 'c0', fica: 'c0', muda: false, hojeNome: 'Banco sintetico', ficaNome: 'Banco sintetico', cadeado: 'conciliada: conta, valor e vencimento não mudam' }
          : { hoje: null, fica: p.conta_bancaria_id ?? null, muda: 'conta_bancaria_id' in p, hojeNome: null, ficaNome: 'conta_bancaria_id' in p ? 'Banco da nota' : null, cadeado: null },
      } })) } })),
}));
vi.mock('@/lib/financeiro/nfeConsultas', () => banco);
import { PreviaCompletar } from './PreviaCompletar';

const ALVOS: AlvoDaPrevia[] = [{ id: 'l1', programada: false, notaValorCent: 63200, notaVencimento: '2031-06-20', descricaoHoje: 'Cercas' },
  { id: 'l2', programada: true, notaValorCent: 63200, notaVencimento: '2031-07-20', descricaoHoje: 'Cercas' }];
const TODAS: ValoresParaTodas = { descricaoBase: 'Cercas sintetico', favorecidoId: 'f1', fazendaId: null, contaId: 'c1', planoContaId: 'p-sugerido',
  numeroDocumento: 'NF 1', competencia: null, safraId: null };

function abrir(onConfirmar = vi.fn(async (_p: Record<string, unknown>[]): Promise<string | null> => null)) {
  render(<PreviaCompletar open onFechar={() => {}} clienteId="cli" alvos={ALVOS} rotulos={{ l1: '1/2', l2: '2/2' }} todasIniciais={TODAS}
    atualizarNaoPagas={false} juntar={false} chave="k" onConfirmar={onConfirmar} />);
  return onConfirmar;
}
const ultimoPedido = () => banco.completarComANota.mock.calls[banco.completarComANota.mock.calls.length - 1][1];
/* P163-D3 — a tabela é TRANSPOSTA: uma coluna por parcela; as células de uma parcela levam `data-alvo` */
const celulas = (id: string) => screen.getAllByTestId('previa-celula').filter((c) => c.getAttribute('data-alvo') === id);
const naParcela = (id: string, testid: string): HTMLElement[] => celulas(id).flatMap((c) => [...c.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`)]);

beforeEach(() => { banco.completarComANota.mockClear(); });

describe('P128b — a prévia campo a campo', () => {
  it('desenha o que o banco devolve: hoje → fica, igual, o cadeado da conciliada e o DRE; a Conta e o Subcentro começam desmarcados', async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId('previa-gravar')).toBeEnabled());
    expect(screen.getByTestId('previa-gravar').textContent).toBe('Completar as 2 e anexar');
    /* URGENTE 29/10 — a Descrição DESMARCADA: a de hoje fica e ganha só o "i/N" (nunca a base da nota) */
    expect(naParcela('l1', 'previa-muda').map((x) => x.textContent)).toEqual(['Cercas → Cercas 1/2']);
    expect(naParcela('l1', 'previa-cadeado').map((x) => x.textContent)).toEqual(['🔒 Banco sintetico']);
    expect(naParcela('l2', 'previa-cadeado')).toEqual([]);
    expect(naParcela('l2', 'previa-igual').map((x) => x.textContent)).toContain('NF 1 · igual');
    expect(screen.getByTestId('previa-dre').textContent).toBe('O DRE muda: R$ 1.264,00 saem de "Manutenção" (05/2031) e vão para "Investimento" (06/2031).');
    expect(screen.getByTestId('previa-coluna-conta').getAttribute('data-state')).toBe('unchecked');
    expect(ultimoPedido().every((p) => !('conta_bancaria_id' in p))).toBe(true);
    /* P162 — o Subcentro também começa desmarcado: o sugerido (o último do fornecedor) nunca vai por cima do lançamento sem a pessoa marcar */
    expect(screen.getByTestId('previa-coluna-subcentro').getAttribute('data-state')).toBe('unchecked');
    expect(ultimoPedido().every((p) => !('plano_conta_id' in p))).toBe(true);
    /* P163-D1 — Fornecedor e Fazenda também começam desmarcados: nada do que já está no lançamento muda sem marcar */
    expect(['favorecido', 'fazenda', 'safra'].map((c) => screen.getByTestId(`previa-coluna-${c}`).getAttribute('data-state'))).toEqual(['unchecked', 'unchecked', 'unchecked']);
    expect(['descricao', 'competencia', 'documento'].map((c) => screen.getByTestId(`previa-coluna-${c}`).getAttribute('data-state'))).toEqual(['unchecked', 'checked', 'checked']);
    expect(ultimoPedido().map((p) => p.descricao)).toEqual(['Cercas 1/2', 'Cercas 2/2']);
    expect(ultimoPedido().every((p) => !('favorecido_id' in p) && !('fazenda_id' in p))).toBe(true);
    expect(banco.completarComANota.mock.calls.every((c) => c[2].simular)).toBe(true);   // nada gravado antes do clique
  });
  it('✎ na célula: "manter o de hoje nesta parcela" — o pedido gravado sai SEM a descrição daquela parcela; a outra segue', async () => {
    const onConfirmar = abrir();
    await waitFor(() => expect(screen.getByTestId('previa-gravar')).toBeEnabled());
    fireEvent.click(naParcela('l1', 'previa-muda')[0]);
    await waitFor(() => expect(naParcela('l1', 'previa-muda')).toEqual([]));
    await waitFor(() => expect(screen.getByTestId('previa-gravar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('previa-gravar'));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalled());
    const [pedido] = onConfirmar.mock.calls[0];
    expect(['descricao' in pedido[0], pedido[1].descricao]).toEqual([false, 'Cercas 2/2']);
  });
  it('coluna desmarcada não vai ao pedido; marcar a Conta leva a conta SÓ à programada', async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId('previa-gravar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('previa-coluna-conta'));
    await waitFor(() => expect(ultimoPedido().some((p) => 'conta_bancaria_id' in p)).toBe(true));
    expect(ultimoPedido()).toEqual([{ id: 'l1', descricao: 'Cercas 1/2', numero_documento: 'NF 1', tipo_documento: 'Nota Fiscal' },
      { id: 'l2', descricao: 'Cercas 2/2', numero_documento: 'NF 1', tipo_documento: 'Nota Fiscal', conta_bancaria_id: 'c1' }]);
    /* marcar a Descrição é o ÚNICO jeito de a base da nota ir */
    fireEvent.click(screen.getByTestId('previa-coluna-descricao'));
    await waitFor(() => expect(ultimoPedido()[0].descricao).toBe('Cercas sintetico 1/2'));
  });
  it('a prévia que não se confere (mesmo depois de uma boa) trava o gravar e diz; a recusa da gravação fica na prévia', async () => {
    abrir(vi.fn(async () => 'O mês 06/2031 está fechado. Nada foi gravado.'));
    await waitFor(() => expect(screen.getByTestId('previa-gravar')).toBeEnabled());
    banco.completarComANota.mockResolvedValueOnce({ ok: false, motivo: 'sem conexão' });
    fireEvent.change(screen.getByTestId('previa-numero'), { target: { value: 'NF 9' } });
    expect((await screen.findByTestId('previa-falha')).textContent).toBe('Não consegui conferir a prévia (sem conexão).');
    expect(screen.getByTestId('previa-gravar')).toBeDisabled();
    fireEvent.change(screen.getByTestId('previa-numero'), { target: { value: 'NF 2' } });
    await waitFor(() => expect(screen.getByTestId('previa-gravar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('previa-gravar'));
    expect((await screen.findByTestId('previa-erro')).textContent).toBe('O mês 06/2031 está fechado. Nada foi gravado.');
  });
});

/* P128b (prova da Alta Paulista, 28/10) — o lançamento SEM conta aparece em destaque mesmo com a coluna Conta desmarcada: nada vazio passa calado */
describe('P128b — o vazio em destaque', () => {
  it('a conta vazia da l2 é "⚠ vazio" (âmbar, com a frase no title); marcando Conta vira "— → Banco da nota"', async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId('previa-gravar')).toBeEnabled());
    const [vazio] = naParcela('l2', 'previa-vazio');
    expect(vazio.textContent).toBe('⚠ vazio');
    expect(vazio.getAttribute('title')).toBe('Este lançamento está sem Conta: marque a coluna Conta para completar.');
    expect(naParcela('l1', 'previa-vazio')).toEqual([]);
    fireEvent.click(screen.getByTestId('previa-coluna-conta'));
    await waitFor(() => expect(naParcela('l2', 'previa-vazio')).toEqual([]));
    expect(naParcela('l2', 'previa-muda').map((x) => x.textContent)).toContain('— → Banco da nota');
  });
});

/* P163 (o caso da Vera, NF 31776) — a competência saía "2026-08-18 · i…": o banco devolve o próprio valor como "nome" nos campos que não são
   cadastro, e a tela preferia o nome. A data vem SEMPRE em dd/mm/aaaa. */
describe('P163 — a data em dd/mm/aaaa', () => {
  it('a competência igual aparece "18/08/2026 · igual", nunca o ISO cru', async () => {
    banco.completarComANota.mockImplementationOnce(async (_c, pedido) => ({ ok: true, valor: { ok: true, recusas: [], operacao: null, financiamentoId: null, efeitoDre: [],
      linhas: pedido.map((p) => ({ id: String(p.id), descricao: 'Ferramentas', situacao: 'realizada', parcelaN: null, campos: {
        data_competencia: { hoje: '2026-08-18', fica: '2026-08-18', muda: false, hojeNome: '2026-08-18', ficaNome: '2026-08-18', cadeado: null } } })) } }));
    abrir();
    await waitFor(() => expect(naParcela('l1', 'previa-igual').length).toBeGreaterThan(0));
    expect(naParcela('l1', 'previa-igual').map((x) => x.textContent)).toEqual(['18/08/2026 · igual']);
  });
});
