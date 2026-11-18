/**
 * BOLETO D1d — a regra do boleto da PARCELA (sem tela): a prévia não grava; G1 liga o existente; G2 não troca calado; o mesmo título já
 * ligado aqui = nada; a gravação faz só o que a prévia disse; falha nunca diz "ligado".
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { respostaDeEntrar } from './caixaApi';
import { FRASE_OUTRO_BOLETO, gravar, prever, respostaDeLigar, type ParcelaApi } from './boletoDaParcela';

const LEITURA = { linha: '3'.repeat(47), origem: 'pdf', arquivo_nome: 'boleto.pdf' };
const pdf = new File(['%PDF'], 'boleto.pdf', { type: 'application/pdf' });
let existe: null | { id: string; situacao: string } = null;
let ligadoAoLancamento: string | null = null;

let api: { [K in keyof ParcelaApi]: Mock<ParcelaApi[K]> };
beforeEach(() => {
  existe = null; ligadoAoLancamento = null;
  api = {
    entrar: vi.fn<ParcelaApi['entrar']>(async (_c, _l, simular) => ({ ok: true, dados: respostaDeEntrar({
      ok: true, simulado: simular, ja_existe: !!existe, id: existe ? existe.id : simular ? null : 'novo-1',
      storage_path: simular || existe ? null : 'cli/boletos/novo-1.pdf', frase: existe ? 'Este boleto já está no sistema.' : null,
      boleto: { codigo_barras: '3'.repeat(44), situacao: existe ? existe.situacao : 'novo' }, situacao: { lancamentos: [], avisos: [] }, candidatos: [], avisos: [],
    }) })),
    subirArquivo: vi.fn<ParcelaApi['subirArquivo']>(async () => ({ ok: true, dados: true })),
    ligar: vi.fn<ParcelaApi['ligar']>(async () => ({ ok: true, dados: { ok: true } })),
    boletoDoLancamento: vi.fn<ParcelaApi['boletoDoLancamento']>(async () => ({ ok: true, dados: ligadoAoLancamento })),
  };
});

describe('BOLETO D1d — prever', () => {
  it('título novo: entra e liga; a prévia só SIMULA (nada grava)', async () => {
    const p = await prever(api, 'cli', LEITURA, 'lanc-1');
    expect(p.tipo).toBe('entra_e_liga');
    expect(api.entrar).toHaveBeenCalledWith('cli', LEITURA, true);
    expect(api.ligar).not.toHaveBeenCalled();
    expect(api.subirArquivo).not.toHaveBeenCalled();
  });
  it('G1: o título já na caixa sem ligação → liga o EXISTENTE', async () => {
    existe = { id: 'b-1', situacao: 'novo' };
    expect(await prever(api, 'cli', LEITURA, 'lanc-1')).toEqual({ tipo: 'liga_existente', boletoId: 'b-1' });
    existe = { id: 'b-1', situacao: 'sem_par' };
    expect((await prever(api, 'cli', LEITURA, 'lanc-1')).tipo).toBe('liga_existente');
  });
  it('G2: a parcela já tem OUTRO boleto → "Substituir", nunca troca calado', async () => {
    ligadoAoLancamento = 'outro-9';
    expect(await prever(api, 'cli', LEITURA, 'lanc-1')).toEqual({ tipo: 'outro_boleto', outroBoletoId: 'outro-9', frase: FRASE_OUTRO_BOLETO });
  });
  it('o mesmo título já ligado a esta parcela → nada a fazer', async () => {
    existe = { id: 'b-1', situacao: 'ligado' }; ligadoAoLancamento = 'b-1';
    expect(await prever(api, 'cli', LEITURA, 'lanc-1')).toEqual({ tipo: 'ja_ligado_aqui', boletoId: 'b-1' });
  });
  it('o título ligado a OUTRO lançamento, ou descartado → recusa com a frase', async () => {
    existe = { id: 'b-1', situacao: 'ligado' };
    expect(await prever(api, 'cli', LEITURA, 'lanc-1')).toEqual({ tipo: 'recusa', frase: 'Este boleto já está ligado a outro lançamento.' });
    existe = { id: 'b-1', situacao: 'descartado' };
    expect((await prever(api, 'cli', LEITURA, 'lanc-1')).tipo).toBe('recusa');
  });
  it('a linha que o banco recusa → recusa com a frase do banco', async () => {
    api.entrar.mockResolvedValueOnce({ ok: true, dados: respostaDeEntrar({ ok: false, recusa: { motivo: 'linha', frase: 'A linha digitável não confere.' } }) });
    expect(await prever(api, 'cli', LEITURA, 'lanc-1')).toEqual({ tipo: 'recusa', frase: 'A linha digitável não confere.' });
  });
});

describe('BOLETO D1d — gravar', () => {
  it('entra_e_liga: grava, sobe o PDF da caixa e liga à parcela', async () => {
    const d = await gravar(api, 'cli', { tipo: 'entra_e_liga', leitura: LEITURA }, pdf, 'lanc-1');
    expect(d).toEqual({ ok: true, boletoId: 'novo-1', frase: 'Entrou na caixa e foi ligado à parcela.' });
    expect(api.entrar).toHaveBeenCalledWith('cli', LEITURA, false);
    expect(api.subirArquivo).toHaveBeenCalledWith('cli/boletos/novo-1.pdf', pdf);
    expect(api.ligar).toHaveBeenCalledWith('novo-1', ['lanc-1'], false);
  });
  it('liga_existente: não cria outro boleto (não chama entrar nem sobe)', async () => {
    const d = await gravar(api, 'cli', { tipo: 'liga_existente', boletoId: 'b-1' }, pdf, 'lanc-1');
    expect(d.ok).toBe(true);
    expect(api.entrar).not.toHaveBeenCalled();
    expect(api.subirArquivo).not.toHaveBeenCalled();
    expect(api.ligar).toHaveBeenCalledWith('b-1', ['lanc-1'], false);
  });
  it('G2 e recusa: NADA grava, e a frase diz que o documento está anexado', async () => {
    for (const p of [{ tipo: 'outro_boleto' as const, outroBoletoId: 'o', frase: FRASE_OUTRO_BOLETO }, { tipo: 'recusa' as const, frase: 'x' }]) {
      const d = await gravar(api, 'cli', p, pdf, 'lanc-1');
      expect(d.ok).toBe(false);
      expect(d.frase).toMatch(/^O boleto foi anexado à parcela, mas não entrou na caixa/);
    }
    expect(api.entrar).not.toHaveBeenCalled();
    expect(api.ligar).not.toHaveBeenCalled();
  });
  it('o PDF da caixa não subiu → não liga, e diz', async () => {
    api.subirArquivo.mockResolvedValueOnce({ ok: false, erro: 'O arquivo não subiu.' });
    const d = await gravar(api, 'cli', { tipo: 'entra_e_liga', leitura: LEITURA }, pdf, 'lanc-1');
    expect(d.ok).toBe(false);
    expect(api.ligar).not.toHaveBeenCalled();
  });
  it('o ligar recusado na hora (P0001) → nunca diz "ligado"', async () => {
    api.ligar.mockResolvedValueOnce({ ok: false, erro: 'Este lançamento acabou de receber outro boleto. Nada foi gravado.' });
    const d = await gravar(api, 'cli', { tipo: 'liga_existente', boletoId: 'b-1' }, pdf, 'lanc-1');
    expect(d).toEqual({ ok: false, frase: 'O boleto está na caixa, mas não foi ligado à parcela: Este lançamento acabou de receber outro boleto. Nada foi gravado.' });
  });
  it('a resposta do ligar: a recusa leva a frase e o outro boleto', () => {
    expect(respostaDeLigar({ ok: true, simulado: false })).toEqual({ ok: true });
    expect(respostaDeLigar({ ok: false, recusa: { motivo: 'lancamento_ja_tem_boleto', frase: 'F', outro_boleto_id: 'o-1' } }))
      .toEqual({ ok: false, motivo: 'lancamento_ja_tem_boleto', frase: 'F', outroBoletoId: 'o-1' });
  });
});
