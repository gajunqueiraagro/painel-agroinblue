/**
 * PR-CONC-TRANSFERENCIAS-01 — o modal "Transferências entre contas" e o botão no passo 2.
 *
 * ⚠ OS PARES SÃO OS DO NJ set/26 (a simulação no banco): um limpo (Itaú → Sicredi Lavoura 50k), o nó de 100k que o
 *   mesmo dia resolve, e um ambíguo sintético (a RPC real devolveu zero ambíguos em set/26).
 * ⚠ A RPC É FALSA AQUI: quem prova o banco é o teste em ROLLBACK do PR. Aqui se prova a TELA — o que vai marcado, que a
 *   prévia roda SOZINHA com `simular = true` e não grava, que UM clique grava (fix1: na homologação, o primeiro clique só
 *   rodava a prévia), que o duplo clique não grava duas vezes, e que a recusa não é enviada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import type { LinhaMeiaPonta, LinhaTransferencia, ResultadoTransferencia } from '@/hooks/useTransferenciasSugeridas';
import { TransferenciasEntreContasModal } from './TransferenciasEntreContasModal';

const ponta = (id: string, data: string, valor: number, conta: string, descricao: string) =>
  ({ id, data, valor, conta_id: `c-${conta}`, conta, descricao });

const LIMPO: LinhaTransferencia = {
  saida: ponta('s50', '2026-09-02', -50000, 'Itau BBA', 'PIX ENVIADO NATALINO CAVALLI JUNIOR 214.244.128-97'),
  como: 'limpo',
  entrada: ponta('e50', '2026-09-02', 50000, 'Sicredi Lavoura', 'RECEBIMENTO PIX-PIX_CRED  21424412897 NATALINO CAVALLI JUNIOR'),
  existente_id: null, candidatas: [],
};
const MESMO_DIA: LinhaTransferencia = {
  saida: ponta('s100', '2026-09-02', -100000, 'Itau BBA', 'PIX ENVIADO NATALINO CAVALLI JUNIOR 214.244.128-97'),
  como: 'mesmo_dia',
  entrada: ponta('b38bb790', '2026-09-02', 100000, 'Banco do Brasil', 'Pix - Recebido - 02/09 09:23 21424412897 NATALINO CAVAL'),
  existente_id: 'lanc-existente', candidatas: [],
};
const AMBIGUO: LinhaTransferencia = {
  saida: ponta('s30', '2026-09-10', -30000, 'Itau BBA', 'TED ENVIADA'),
  como: 'ambiguo', entrada: null, existente_id: null,
  candidatas: [
    { ...ponta('eBB', '2026-09-10', 30000, 'Banco do Brasil', 'TED RECEBIDA BB'), existente_id: null },
    { ...ponta('eSL', '2026-09-11', 30000, 'Sicredi Lavoura', 'TED RECEBIDA SICREDI'), existente_id: null },
  ],
};

const M = vi.hoisted(() => ({
  fechar: vi.fn(),
  aoGravar: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: M.toast, error: vi.fn() } }));

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  M.aoGravar.mockReset();
  M.toast.mockReset();
  M.fechar.mockReset().mockImplementation(async (_s: string): Promise<ResultadoTransferencia> =>
    ({ ok: true, acao: _s === 's100' ? 'casar_existente' : 'criar' }));
});

function abrir(linhas: LinhaTransferencia[] = [LIMPO, MESMO_DIA, AMBIGUO]) {
  return render(
    <TransferenciasEntreContasModal open onClose={() => {}} rotuloMes="09/2026" linhas={linhas}
      fechar={M.fechar} aoGravar={M.aoGravar} />,
  );
}
const linhaDe = (valor: string) => screen.getAllByTestId('transferencia').find((tr) => tr.textContent?.includes(valor))!;
const caixa = (valor: string) => within(linhaDe(valor)).getByRole('checkbox');
const confirmar = (n: number) => screen.findByRole('button', { name: `Confirmar transferências (${n})` });
const gravacoes = () => M.fechar.mock.calls.filter((c) => c[2] === false);

describe('a lista', () => {
  it('o resolvido (limpo e mesmo dia) nasce marcado; o ambíguo espera a escolha da entrada', async () => {
    abrir();
    expect(caixa('50.000,00')).toBeChecked();
    expect(caixa('100.000,00')).toBeChecked();
    expect(caixa('30.000,00')).not.toBeChecked();
    expect(caixa('30.000,00')).toBeDisabled();
    expect(await confirmar(2)).toBeEnabled();
  });

  it('uma informação por coluna: Data | Saída | Descrição | Valor | Data | Entrada | Descrição', async () => {
    abrir([LIMPO]);
    const cels = within(linhaDe('50.000,00')).getAllByRole('cell').map((c) => c.textContent);
    expect(cels.slice(1, 8)).toEqual([
      '02/09', 'Itau BBA', 'PIX ENVIADO NATALINO CAVALLI JUNIOR 214.244.128-97', '50.000,00',
      '02/09', 'Sicredi Lavoura', 'RECEBIMENTO PIX-PIX_CRED  21424412897 NATALINO CAVALLI JUNIOR',
    ]);
    await confirmar(1);
  });

  it('"casa na existente" só na linha que tem transferência lançada', async () => {
    abrir();
    expect(within(linhaDe('100.000,00')).getByTestId('selo-existente').textContent).toBe('casa na existente');
    expect(within(linhaDe('50.000,00')).queryByTestId('selo-existente')).toBeNull();
    await confirmar(2);
  });

  it('o ambíguo: escolher a entrada preenche a linha, a marca e a prévia a inclui', async () => {
    abrir();
    await confirmar(2);
    fireEvent.keyDown(within(linhaDe('30.000,00')).getByRole('combobox'), { key: 'Enter' });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '10/09 · Banco do Brasil · TED RECEBIDA BB', '11/09 · Sicredi Lavoura · TED RECEBIDA SICREDI',
    ]);
    fireEvent.click(screen.getByRole('option', { name: '11/09 · Sicredi Lavoura · TED RECEBIDA SICREDI' }));
    await waitFor(() => expect(caixa('30.000,00')).toBeChecked());
    expect(linhaDe('30.000,00').textContent).toContain('TED RECEBIDA SICREDI');
    expect(await confirmar(3)).toBeEnabled();
    expect(M.fechar).toHaveBeenCalledWith('s30', 'eSL', true);
  });

  it('desmarcar tira da seleção e refaz a prévia', async () => {
    abrir();
    await confirmar(2);
    fireEvent.click(caixa('50.000,00'));
    expect(await confirmar(1)).toBeEnabled();
  });
});

describe('a prévia roda sozinha', () => {
  it('ao abrir, SEM clique: a RPC com simular = true para cada par, e o resumo no rodapé — nada grava', async () => {
    abrir();
    await confirmar(2);
    expect(M.fechar.mock.calls).toEqual([['s50', 'e50', true], ['s100', 'b38bb790', true]]);
    expect(screen.getByTestId('previa-transferencias').textContent)
      .toBe('2 transferências: 1 nova · 1 casa na existente · 150.000,00');
    expect(gravacoes()).toEqual([]);
    expect(M.aoGravar).not.toHaveBeenCalled();
  });

  it('enquanto a prévia carrega, o botão fica desligado e diz por quê', async () => {
    let soltar: () => void = () => {};
    M.fechar.mockImplementation(() => new Promise<ResultadoTransferencia>((ok) => { soltar = () => ok({ ok: true, acao: 'criar' }); }));
    abrir([LIMPO]);
    expect(screen.getByTestId('motivo-desligado').textContent).toBe('conferindo a prévia…');
    expect(screen.getByRole('button', { name: 'Confirmar transferências (0)' })).toBeDisabled();
    soltar();
    expect(await confirmar(1)).toBeEnabled();
    expect(screen.queryByTestId('motivo-desligado')).toBeNull();
  });

  it('nada selecionado: desligado com o motivo escrito', async () => {
    abrir([AMBIGUO]);
    await waitFor(() => expect(screen.getByTestId('motivo-desligado').textContent).toBe('nenhuma transferência selecionada'));
    expect(screen.getByRole('button', { name: 'Confirmar transferências (0)' })).toBeDisabled();
    expect(M.fechar).not.toHaveBeenCalled();
  });
});

describe('um clique grava', () => {
  it('um clique: a RPC com simular = false UMA vez por par, toast com o resultado e a lista relê', async () => {
    abrir();
    fireEvent.click(await confirmar(2));
    await waitFor(() => expect(M.aoGravar).toHaveBeenCalledTimes(1));
    expect(gravacoes()).toEqual([['s50', 'e50', false], ['s100', 'b38bb790', false]]);
    expect(M.toast).toHaveBeenCalledWith('2 transferências conciliadas', { closeButton: true });
  });

  it('duplo clique rápido NÃO grava duas vezes', async () => {
    abrir([LIMPO]);
    const botao = await confirmar(1);
    let soltar: () => void = () => {};
    M.fechar.mockImplementation((_s: string, _e: string, simular: boolean) => simular
      ? Promise.resolve({ ok: true, acao: 'criar' })
      : new Promise<ResultadoTransferencia>((ok) => { soltar = () => ok({ ok: true, acao: 'criar' }); }));
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(await screen.findByRole('button', { name: 'Gravando…' })).toBeDisabled();
    soltar();
    await waitFor(() => expect(M.aoGravar).toHaveBeenCalledTimes(1));
    expect(gravacoes()).toEqual([['s50', 'e50', false]]);
  });

  it('dois cliques no MESMO tique, antes de o React re-renderizar: a trava por ref segura o segundo', async () => {
    /* ⚠ O `fireEvent` re-renderiza entre um clique e outro, e aí o `disabled` já basta — a mutação que tirava a trava por
       ref sobrevivia ao teste de cima. Aqui o handler é chamado duas vezes seguidas, sem render no meio. */
    abrir([LIMPO]);
    const botao = await confirmar(1);
    const chave = Object.keys(botao).find((k) => k.startsWith('__reactProps'));
    const props: { onClick: () => void } = Reflect.get(botao, chave ?? '');
    let soltar: () => void = () => {};
    M.fechar.mockImplementation((_s: string, _e: string, simular: boolean) => simular
      ? Promise.resolve({ ok: true, acao: 'criar' })
      : new Promise<ResultadoTransferencia>((ok) => { soltar = () => ok({ ok: true, acao: 'criar' }); }));
    act(() => { props.onClick(); props.onClick(); });
    soltar();
    await waitFor(() => expect(M.aoGravar).toHaveBeenCalledTimes(1));
    expect(gravacoes()).toEqual([['s50', 'e50', false]]);
  });

  it('a recusa da prévia aparece na linha e NÃO é enviada na gravação', async () => {
    M.fechar.mockImplementation(async (s: string): Promise<ResultadoTransferencia> =>
      s === 's50' ? { ok: false, motivo: 'mes_fechado' } : { ok: true, acao: 'criar' });
    abrir();
    const botao = await confirmar(1);
    expect(within(linhaDe('50.000,00')).getByTestId('recusa-transferencia').textContent).toBe('mês fechado');
    fireEvent.click(botao);
    await waitFor(() => expect(M.aoGravar).toHaveBeenCalledTimes(1));
    expect(gravacoes()).toEqual([['s100', 'b38bb790', false]]);
  });

  it('o banco recusa na gravação: a recusa fica no modal, sem toast e sem reler', async () => {
    M.fechar.mockImplementation(async (_s: string, _e: string, simular: boolean): Promise<ResultadoTransferencia> =>
      simular ? { ok: true, acao: 'criar' } : { ok: false, motivo: 'extrato_ja_conciliado' });
    abrir([LIMPO]);
    fireEvent.click(await confirmar(1));
    await waitFor(() => expect(screen.getByTestId('previa-transferencias').textContent)
      .toBe('1 recusada (50.000,00: um dos movimentos já está conciliado)'));
    expect(M.aoGravar).not.toHaveBeenCalled();
    expect(M.toast).not.toHaveBeenCalled();
  });
});

/**
 * CONC-TRANSF-SEGUNDA-PONTA-01 — a meia transferência (uma ponta conciliada, a outra livre) na MESMA tabela.
 * O caso do NJ mai/26: Sicredi Pessoal 14/05 +2.597,00 livre, a transferência b0134032 já ligada ao Sicredi Lavoura.
 */
describe('meia transferência na mesma tabela', () => {
  const MEIA_ENTRADA: LinhaMeiaPonta = {
    extrato: ponta('d5b459d6', '2026-05-14', 2597, 'Sicredi Pessoal', 'RECEBIMENTO PIX SICREDI LAVOURA'),
    transferencia_id: 'b0134032',
    ponta_ligada: { extrato_id: 'ff2f9e47', data: '2026-05-14', valor: -2597, conta_id: 'c-lav', conta: 'Sicredi Lavoura' },
  };
  const MEIA_SAIDA: LinhaMeiaPonta = {
    extrato: ponta('x7', '2026-05-20', -7000, 'Banco do Brasil', 'PIX ENVIADO'),
    transferencia_id: 'lanc-7k',
    ponta_ligada: { extrato_id: 'y7', data: '2026-05-20', valor: 7000, conta_id: 'c-pes', conta: 'Sicredi Pessoal' },
  };
  const fecharMeia = vi.fn();
  beforeEach(() => {
    fecharMeia.mockReset().mockImplementation(async (): Promise<ResultadoTransferencia> => ({ ok: true, acao: 'casar_existente' }));
  });
  const abrirComMeias = (linhas: LinhaTransferencia[], meias: LinhaMeiaPonta[]) => render(
    <TransferenciasEntreContasModal open onClose={() => {}} rotuloMes="05/2026" linhas={linhas} meias={meias}
      fechar={M.fechar} fecharMeia={fecharMeia} aoGravar={M.aoGravar} />,
  );

  it('nasce marcada; a ponta livre na sua coluna e a já conciliada na outra, em muted, com "já conciliada"', async () => {
    abrirComMeias([], [MEIA_ENTRADA, MEIA_SAIDA]);
    expect(caixa('2.597,00')).toBeChecked();
    expect(caixa('7.000,00')).toBeChecked();
    /* livre é ENTRADA: a saída mostra a ponta ligada (Lavoura) em muted */
    const cels = within(linhaDe('2.597,00')).getAllByRole('cell');
    expect(cels.slice(1, 8).map((c) => c.textContent)).toEqual([
      '14/05', 'Sicredi Lavoura', 'já conciliada', '2.597,00', '14/05', 'Sicredi Pessoal', 'RECEBIMENTO PIX SICREDI LAVOURA',
    ]);
    for (const i of [1, 2, 3]) expect(cels[i].className).toContain('text-muted-foreground');
    for (const i of [5, 6, 7]) expect(cels[i].className).not.toContain('text-muted-foreground');
    /* livre é SAÍDA: o espelho */
    const cs = within(linhaDe('7.000,00')).getAllByRole('cell');
    expect(cs[7].textContent).toBe('já conciliada');
    for (const i of [5, 6, 7]) expect(cs[i].className).toContain('text-muted-foreground');
    expect(within(linhaDe('2.597,00')).getByTestId('selo-existente').textContent).toBe('casa na existente');
    expect(await confirmar(2)).toBeEnabled();
  });

  it('"Confirmar (N)" conta as duas espécies; a prévia vai a cada RPC com simular = true', async () => {
    abrirComMeias([LIMPO], [MEIA_ENTRADA]);
    expect(await confirmar(2)).toBeEnabled();
    expect(M.fechar.mock.calls).toEqual([['s50', 'e50', true]]);
    expect(fecharMeia.mock.calls).toEqual([['d5b459d6', 'b0134032', true]]);
    expect(screen.getByTestId('previa-transferencias').textContent)
      .toBe('2 transferências: 1 nova · 1 casa na existente · 52.597,00');
  });

  it('um clique grava as duas espécies juntas, cada uma pela sua RPC, e a lista relê', async () => {
    abrirComMeias([LIMPO], [MEIA_ENTRADA]);
    fireEvent.click(await confirmar(2));
    await waitFor(() => expect(M.aoGravar).toHaveBeenCalledTimes(1));
    expect(gravacoes()).toEqual([['s50', 'e50', false]]);
    expect(fecharMeia.mock.calls.filter((c) => c[2] === false)).toEqual([['d5b459d6', 'b0134032', false]]);
  });

  /* CONC-TRANSF-SEGUNDA-PONTA-02: a meia religa o que existe e o par cria — as meias gravam ANTES dos pares. */
  it('na gravação em lote as meias vão antes dos pares', async () => {
    const ordem: string[] = [];
    M.fechar.mockImplementation(async (s: string, _e: string, simular: boolean): Promise<ResultadoTransferencia> => {
      if (!simular) ordem.push(`par ${s}`); return { ok: true, acao: 'criar' };
    });
    fecharMeia.mockImplementation(async (x: string, _l: string, simular: boolean): Promise<ResultadoTransferencia> => {
      if (!simular) ordem.push(`meia ${x}`); return { ok: true, acao: 'casar_existente' };
    });
    abrirComMeias([LIMPO], [MEIA_ENTRADA, MEIA_SAIDA]);
    fireEvent.click(await confirmar(3));
    await waitFor(() => expect(M.aoGravar).toHaveBeenCalledTimes(1));
    expect(ordem).toEqual(['meia d5b459d6', 'meia x7', 'par s50']);
  });

  it('desmarcar a meia tira da contagem; a recusa dela aparece na linha com o motivo', async () => {
    fecharMeia.mockImplementation(async (): Promise<ResultadoTransferencia> => ({ ok: false, motivo: 'ponta_ja_ligada' }));
    abrirComMeias([LIMPO], [MEIA_ENTRADA]);
    await confirmar(1);
    expect(within(linhaDe('2.597,00')).getByTestId('recusa-transferencia').textContent)
      .toBe('esta ponta da transferência já está conciliada');
    fireEvent.click(caixa('2.597,00'));
    expect(await confirmar(1)).toBeEnabled();
    await waitFor(() => expect(screen.getByTestId('previa-transferencias').textContent).toBe('1 transferência: 1 nova · 50.000,00'));
  });
});
