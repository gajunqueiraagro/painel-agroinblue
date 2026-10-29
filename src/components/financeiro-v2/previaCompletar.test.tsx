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

const ALVOS: AlvoDaPrevia[] = [{ id: 'l1', programada: false, notaValorCent: 63200, notaVencimento: '2031-06-20' },
  { id: 'l2', programada: true, notaValorCent: 63200, notaVencimento: '2031-07-20' }];
const TODAS: ValoresParaTodas = { descricaoBase: 'Cercas sintetico', favorecidoId: 'f1', fazendaId: null, contaId: 'c1', planoContaId: 'p-sugerido',
  numeroDocumento: 'NF 1', competencia: null, safraId: null };

function abrir(onConfirmar = vi.fn(async (_p: Record<string, unknown>[]): Promise<string | null> => null)) {
  render(<PreviaCompletar open onFechar={() => {}} clienteId="cli" alvos={ALVOS} rotulos={{ l1: '1/2', l2: '2/2' }} todasIniciais={TODAS}
    atualizarNaoPagas={false} juntar={false} chave="k" onConfirmar={onConfirmar} />);
  return onConfirmar;
}
const ultimoPedido = () => banco.completarComANota.mock.calls[banco.completarComANota.mock.calls.length - 1][1];
const linha = (i: number) => screen.getAllByTestId('previa-linha')[i];

beforeEach(() => { banco.completarComANota.mockClear(); });

describe('P128b — a prévia campo a campo', () => {
  it('desenha o que o banco devolve: hoje → fica, igual, o cadeado da conciliada e o DRE; a Conta e o Subcentro começam desmarcados', async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId('previa-gravar')).toBeEnabled());
    expect(screen.getByTestId('previa-gravar').textContent).toBe('Completar as 2 e anexar');
    expect(within(linha(0)).getByTestId('previa-muda').textContent).toBe('Cercas → Cercas sintetico 1/2');
    expect(within(linha(0)).getByTestId('previa-cadeado').textContent).toBe('🔒 Banco sintetico');
    expect(within(linha(1)).queryByTestId('previa-cadeado')).toBeNull();
    expect(within(linha(1)).getAllByTestId('previa-igual').map((x) => x.textContent)).toContain('NF 1 · igual');
    expect(screen.getByTestId('previa-dre').textContent).toBe('O DRE muda: R$ 1.264,00 saem de "Manutenção" (05/2031) e vão para "Investimento" (06/2031).');
    expect(screen.getByTestId('previa-coluna-conta').getAttribute('data-state')).toBe('unchecked');
    expect(ultimoPedido().every((p) => !('conta_bancaria_id' in p))).toBe(true);
    /* P162 — o Subcentro também começa desmarcado: o sugerido (o último do fornecedor) nunca vai por cima do lançamento sem a pessoa marcar */
    expect(screen.getByTestId('previa-coluna-subcentro').getAttribute('data-state')).toBe('unchecked');
    expect(ultimoPedido().every((p) => !('plano_conta_id' in p))).toBe(true);
    expect(banco.completarComANota.mock.calls.every((c) => c[2].simular)).toBe(true);   // nada gravado antes do clique
  });
  it('✎ na célula: "manter o de hoje nesta parcela" — o pedido gravado sai SEM a descrição daquela parcela; a outra segue', async () => {
    const onConfirmar = abrir();
    await waitFor(() => expect(screen.getByTestId('previa-gravar')).toBeEnabled());
    fireEvent.click(within(linha(0)).getByTestId('previa-muda'));
    await waitFor(() => expect(within(linha(0)).queryByTestId('previa-muda')).toBeNull());
    await waitFor(() => expect(screen.getByTestId('previa-gravar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('previa-gravar'));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalled());
    const [pedido] = onConfirmar.mock.calls[0];
    expect(['descricao' in pedido[0], pedido[1].descricao]).toEqual([false, 'Cercas sintetico 2/2']);
  });
  it('coluna desmarcada não vai ao pedido; marcar a Conta leva a conta SÓ à programada', async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId('previa-gravar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('previa-coluna-descricao'));
    fireEvent.click(screen.getByTestId('previa-coluna-conta'));
    await waitFor(() => expect(ultimoPedido().some((p) => 'conta_bancaria_id' in p)).toBe(true));
    expect(ultimoPedido()).toEqual([{ id: 'l1', favorecido_id: 'f1', numero_documento: 'NF 1', tipo_documento: 'Nota Fiscal' },
      { id: 'l2', favorecido_id: 'f1', numero_documento: 'NF 1', tipo_documento: 'Nota Fiscal', conta_bancaria_id: 'c1' }]);
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
    const vazio = within(linha(1)).getByTestId('previa-vazio');
    expect(vazio.textContent).toBe('⚠ vazio');
    expect(vazio.getAttribute('title')).toBe('Este lançamento está sem Conta: marque a coluna Conta para completar.');
    expect(within(linha(0)).queryByTestId('previa-vazio')).toBeNull();
    fireEvent.click(screen.getByTestId('previa-coluna-conta'));
    await waitFor(() => expect(within(linha(1)).queryByTestId('previa-vazio')).toBeNull());
    expect(within(linha(1)).getAllByTestId('previa-muda').map((x) => x.textContent)).toContain('— → Banco da nota');
  });
});
