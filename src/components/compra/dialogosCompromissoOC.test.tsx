/**
 * OC-DESFAZER-PREVISTO-01b — os diálogos "Desfazer compromisso" e "Atualizar compromisso" (mock do Gabriel, 20/10 19h16).
 *   D1 o motivo digitado continua lá ao reabrir o diálogo (guardado por compromisso enquanto a OC estiver aberta)
 *   D2 bloqueio (realizado/conciliado): a faixa vermelha com a linha de QUEM TRAVA; o "Falta: …" da tela não aparece;
 *      "Nada foi alterado." e o botão desligado
 *   D3 "Abrir lançamento" abre pelo id do DETAIL
 *   D4 agendado: o bloco "será cancelado junto", a faixa âmbar; o botão só liga com a confirmação E o motivo; o banco recebe a confirmação
 *   D5 Atualizar: vencimento proposto já passado acende o aviso âmbar (aviso, não bloqueio); data futura não acende
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { DialogoDesfazerCompromisso } from './DialogoDesfazerCompromisso';
import { DialogoAtualizarCompromisso, vencimentoJaPassou } from './DialogoAtualizarCompromisso';
import type { RpcDesfazer } from '@/lib/oc/desfazerCompromisso';
import type { ReprogramarCompromissoApi, SimulacaoReprogramacao } from '@/hooks/useReprogramarCompromissoLote';
import { esquecerMotivo, chaveDoMotivo } from '@/lib/oc/motivoGuardado';

const OP = '1645ba75-2cea-45ee-8316-e0695b7cffe7';
const COMP = '6347b5a1-1e04-4f2d-ac31-874b29071b96';
const LANC = '2448e772-1111-4222-8333-944444444444';
const FRASE = 'O lançamento de R$ 213.150,75 de 13/07/2026 já foi pago ou conciliado. Desfaça o pagamento no lançamento antes.';
const HINT = JSON.stringify({ lancamento_id: LANC, data: '2026-07-13', valor: 213150.75, status: 'realizado', sinal: '1', conciliado: true, sequencia: 1, total: 1 });
const ROL = ['estornar o título de R$ 213.645,23 (venc. 16/10/2026)', 'cancelar a programação', 'cancelar o compromisso'];

const ok = (extra: Record<string, unknown> = {}) => ({
  ok: true, simulado: true, estorno_id: 'e1', compromisso_id: COMP, titulos_estornados: [], agendados: [],
  programacoes_canceladas: 1, operacao_id: OP, operacao_versao: 19, ...extra,
});

function abrirDesfazer(rpc: RpcDesfazer, onAbrirLancamento = vi.fn()) {
  return render(<DialogoDesfazerCompromisso operacaoId={OP} compromissoId={COMP} versao={19} identidade="Abate 036 N · novilhas · 36 cab"
    rol={ROL} tipoOperacao="abate" onFechar={vi.fn()} onDesfeito={vi.fn()} onAbrirLancamento={onAbrirLancamento} rpc={rpc} />);
}

beforeEach(() => { esquecerMotivo(chaveDoMotivo(OP, 'desfazer', COMP)); esquecerMotivo(chaveDoMotivo(null, 'atualizar', 'l1')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Desfazer compromisso', () => {
  it('D1 o motivo continua lá ao reabrir (e a legenda diz isso)', async () => {
    const rpc = vi.fn<RpcDesfazer>(async () => ({ data: ok(), error: null }));
    abrirDesfazer(rpc);
    const campo = await screen.findByTestId('motivo-desfazer');
    fireEvent.change(campo, { target: { value: 'vínculo errado' } });
    cleanup();
    abrirDesfazer(rpc);
    expect((await screen.findByTestId('motivo-desfazer') as HTMLInputElement).value).toBe('vínculo errado');
    expect(screen.getByTestId('legenda-motivo').textContent).toBe('Fica guardado enquanto a OC estiver aberta; não precisa digitar de novo.');
    expect(screen.getByTestId('identidade-oc').textContent).toBe('Abate 036 N · novilhas · 36 cab');
  });

  it('D2 bloqueio: a linha de quem trava, sem "Falta:", "Nada foi alterado." e o botão desligado', async () => {
    const rpc = vi.fn<RpcDesfazer>(async () => ({ data: null, error: { code: 'P0001', message: FRASE, details: LANC, hint: HINT } }));
    abrirDesfazer(rpc);
    const faixa = await screen.findByTestId('faixa-bloqueio');
    expect(faixa.textContent).toContain('Não dá para desfazer: há um recebimento já pago.');
    const linha = screen.getByTestId('linha-que-trava');
    expect(linha.textContent).toContain('13/07/2026');
    expect(linha.textContent).toContain('Receb. 1/1');
    expect(linha.textContent?.replace(/\s/g, ' ')).toContain('R$ 213.150,75');
    expect(screen.getByTestId('linha-que-trava-selo').textContent).toBe('Realizado · conciliado');
    expect(document.body.textContent).not.toContain('Falta:');
    expect(screen.getByTestId('dica-oc').textContent).toBe('Nada foi alterado.');
    expect((screen.getByTestId('confirmar-desfazer') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('motivo-desfazer')).toBeNull();
  });

  it('D3 "Abrir lançamento" abre pelo id do DETAIL', async () => {
    const onAbrir = vi.fn();
    abrirDesfazer(vi.fn<RpcDesfazer>(async () => ({ data: null, error: { code: 'P0001', message: FRASE, details: LANC, hint: HINT } })), onAbrir);
    fireEvent.click(await screen.findByTestId('abrir-lancamento-que-trava'));
    expect(onAbrir).toHaveBeenCalledWith(LANC);
  });

  it('D4 agendado: cancelado junto, faixa âmbar; só liga com a confirmação e o motivo; o banco recebe a confirmação', async () => {
    const rpc = vi.fn<RpcDesfazer>(async (a) => ({ data: ok({ simulado: a.p_simular,
      agendados: [{ lancamento_id: LANC, sequencia: 1, total: 2, valor: 1500, data: '2026-11-10', sinal: '1' }] }), error: null }));
    abrirDesfazer(rpc);
    const linha = await screen.findByTestId('linha-agendada');
    expect(linha.textContent).toContain('10/11/2026');
    expect(linha.textContent).toContain('Receb. 1/2');
    expect(screen.getByTestId('linha-agendada-selo').textContent).toBe('Agendado');
    expect(screen.getByTestId('faixa-agendado').textContent).toContain('Cancelar aqui não cancela o agendamento no banco; confira lá também.');
    const botao = screen.getByTestId('confirmar-desfazer') as HTMLButtonElement;
    fireEvent.change(screen.getByTestId('motivo-desfazer'), { target: { value: 'erro de lançamento' } });
    expect(botao.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('confirmar-agendado'));
    expect(botao.disabled).toBe(false);
    fireEvent.click(botao);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[1][0]).toMatchObject({ p_simular: false, p_confirmar_agendado: true, p_motivo: 'erro de lançamento' });
  });

  it('o "Falta: …" montado pela tela saiu do AbaCompromissosOC (quem diz o que trava é o banco)', () => {
    const fonte = readFileSync('src/components/compra/AbaCompromissosOC.tsx', 'utf8');
    expect(fonte).not.toMatch(/Falta: \{/);
    expect(fonte).toContain('<DialogoDesfazerCompromisso');
  });
});

describe('Atualizar compromisso', () => {
  const api = (sim: Partial<SimulacaoReprogramacao>): ReprogramarCompromissoApi => ({
    simulando: false, reprogramando: false,
    simular: async () => ({ ok: true, rol: [{ tipo: 'parcela_nova', descricao: 'Nova parcela única de R$ 213.645,23 com vencimento em 15/10/2026.', id: null }],
      bloqueios: [], valorAntigo: 228400, valorNovo: 213645.23, vencimentoProposto: '2026-10-15', agendados: [], ...sim }),
    reprogramar: vi.fn(async () => null),
  });

  it('D5 data proposta já passada: aviso âmbar (não bloqueia); futura: sem aviso', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-20T12:00:00') });
    render(<DialogoAtualizarCompromisso api={api({})} loteId="l1" rotulo="Novilhas · 36 cab" versao={18} onFechar={vi.fn()} onAtualizado={vi.fn()} />);
    expect((await screen.findByTestId('aviso-vencimento-passado')).textContent)
      .toBe('Vence em 15/10/2026, que já passou. Confira a data antes de atualizar.');
    expect(screen.getByTestId('valor-antigo').textContent?.replace(/\s/g, ' ')).toBe('R$ 228.400,00');
    expect(screen.getByTestId('valor-novo').textContent?.replace(/\s/g, ' ')).toBe('R$ 213.645,23');
    fireEvent.change(screen.getByTestId('motivo-atualizar'), { target: { value: 'acerto' } });
    expect((screen.getByTestId('confirmar-atualizar') as HTMLButtonElement).disabled).toBe(false);   // aviso, não bloqueio
    cleanup();
    render(<DialogoAtualizarCompromisso api={api({ vencimentoProposto: '2026-11-30' })} loteId="l1" rotulo="x" versao={18} onFechar={vi.fn()} onAtualizado={vi.fn()} />);
    await screen.findByTestId('topo-atualizar');
    expect(screen.queryByTestId('aviso-vencimento-passado')).toBeNull();
  });

  it('a régua da data passada', () => {
    expect(vencimentoJaPassou('2026-10-15', '2026-10-20')).toBe(true);
    expect(vencimentoJaPassou('2026-10-20', '2026-10-20')).toBe(false);
    expect(vencimentoJaPassou(null, '2026-10-20')).toBe(false);
  });
});
