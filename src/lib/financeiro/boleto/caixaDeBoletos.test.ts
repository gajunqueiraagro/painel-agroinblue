/**
 * BOLETO-DDA-API-01 · D1c (a) — a regra da tela da caixa e os leitores das respostas do banco (118100).
 * ⚠ As respostas aqui têm a FORMA que a `fn_boleto_entrar` / `fn_boletos_lista` devolvem (chaves snake_case, números como no jsonb).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { listaDaCaixa, respostaDeEntrar, fraseDoErroDaCaixa, type CandidatoDoBoleto } from './caixaApi';
import {
  achadoDaPrevia, contadorDaPorta, dataBR, fraseDoAviso, seloDoAchado, situacaoAVista, valorBR,
} from './caixaDeBoletos';

const lanc = (m: Record<string, unknown> = {}) => ({
  id: 'l1', descricao: 'NF 880', valor: 1000, status: 'previsto', cancelado: false, vencimento: '2026-12-10', agendado_para: null,
  pagamento: null, favorecido: 'Fornecedor G', favorecido_documento: null, conta: null, conciliado: false, programado_por: null, ...m,
});
const boleto = (m: Record<string, unknown> = {}) => ({
  id: null, codigo_barras: '3'.repeat(44), linha_digitavel: '3'.repeat(47), tipo: 'bancario', valor: 2150, vencimento: '2026-12-13',
  beneficiario_nome: 'Fornecedor G', beneficiario_documento: '11222333000181', pagador_nome: null, pagador_documento: null,
  origem: 'pdf', situacao: 'novo', arquivo_nome: 'g.pdf', storage_path: null, criado_em: '2026-11-15T10:00:00Z', ...m,
});
const novo = (m: Record<string, unknown> = {}) => respostaDeEntrar({
  ok: true, simulado: true, ja_existe: false, id: null, storage_path: null, avisos: [], boleto: boleto(),
  situacao: { lancamentos: [], soma_ligada: null, avisos: [] }, candidatos: [], ...m,
});

describe('leitores das respostas do banco', () => {
  it('a recusa vira { ok:false } com a frase do banco', () => {
    const r = respostaDeEntrar({ ok: false, simulado: true, recusa: { motivo: 'linha_nao_confere', frase: 'A linha digitável não confere.' } });
    expect(r).toEqual({ ok: false, motivo: 'linha_nao_confere', frase: 'A linha digitável não confere.' });
  });
  it('o novo traz boleto, candidatos e avisos tipados; aviso e candidato desconhecidos são ignorados', () => {
    const r = novo({
      avisos: [{ codigo: 'valor_lido_diferente', lido: '2150.10', do_codigo: 2150 }, { codigo: 'inventado' }],
      candidatos: [{ tipo: 'soma', soma: '2150.00', lancamentos: [lanc(), lanc({ id: 'l2', descricao: 'NF 912', valor: '1150' })] }, { tipo: 'x' }],
    });
    if (r.ok === false) throw new Error('recusou');
    expect(r.jaExiste).toBe(false);
    expect(r.boleto.valor).toBe(2150);
    expect(r.avisos).toEqual([{ codigo: 'valor_lido_diferente', lido: 2150.1, doCodigo: 2150 }]);
    expect(r.candidatos).toHaveLength(1);
    expect(r.candidatos[0].lancamentos.map((l) => l.valor)).toEqual([1000, 1150]);
  });
  it('lixo não quebra: vira recusa genérica; a lista vazia tem contadores zero', () => {
    expect(respostaDeEntrar(null).ok).toBe(false);
    expect(listaDaCaixa(undefined)).toEqual({ contadores: { novo: 0, ligado: 0, sem_par: 0, descartado: 0, substituido: 0 }, itens: [] });
  });
  it('a lista lê os itens com a situação atual', () => {
    const l = listaDaCaixa({ contadores: { novo: 2, sem_par: 1, ligado: 3 }, itens: [{ ...boleto({ id: 'b1', situacao: 'sem_par' }), situacao_atual: { lancamentos: [], avisos: [{ codigo: 'pagador_de_fora' }] } }] });
    expect(l.contadores).toMatchObject({ novo: 2, sem_par: 1, ligado: 3, descartado: 0 });
    expect(l.itens[0].boleto.situacao).toBe('sem_par');
    expect(l.itens[0].situacao.avisos).toEqual([{ codigo: 'pagador_de_fora' }]);
  });
  it('o erro P0001 vai ao operador; o resto vira frase genérica', () => {
    expect(fraseDoErroDaCaixa({ code: 'P0001', message: 'Este boleto acabou de entrar por outra porta.' })).toBe('Este boleto acabou de entrar por outra porta.');
    const c = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(fraseDoErroDaCaixa({ code: '57014', message: 'canceling statement' })).toBe('Não consegui falar com o banco. Tente de novo.');
    c.mockRestore();
  });
});

describe('a regra da tela', () => {
  it('o selo do achado: exato · N exatos · soma de N · por nome · sem par', () => {
    const ex: CandidatoDoBoleto = { tipo: 'exato', soma: 1, lancamentos: [] };
    expect(seloDoAchado([])).toEqual({ texto: 'sem par', tom: 'cinza' });
    expect(seloDoAchado([ex])).toEqual({ texto: 'exato', tom: 'ok' });
    expect(seloDoAchado([ex, ex])).toEqual({ texto: '2 exatos · escolha', tom: 'ambar' });
    expect(seloDoAchado([{ tipo: 'soma', soma: 2, lancamentos: [] }]).texto).toBe('soma de 0');
    expect(seloDoAchado([{ tipo: 'por_nome', soma: 1, lancamentos: [] }]).texto).toBe('por nome · confira');
  });
  it('a prévia: o novo entra marcado; o que já está no sistema e a recusa NÃO entram', () => {
    expect(achadoDaPrevia(novo())).toMatchObject({ podeEntrar: true, entraPorPadrao: true });
    const ja = respostaDeEntrar({ ok: true, simulado: true, ja_existe: true, id: 'b1', frase: 'Este boleto já está no sistema desde 02/12/2026.',
      boleto: boleto({ id: 'b1', situacao: 'ligado' }), situacao: { lancamentos: [lanc({ status: 'programado', programado_por: { nome: 'Amanda' } })], avisos: [] }, candidatos: [] });
    const a = achadoDaPrevia(ja);
    expect(a).toMatchObject({ podeEntrar: false, entraPorPadrao: false });
    expect(a.selos[0].texto).toBe('já está no sistema');
    expect(a.texto).toBe('Este boleto já está no sistema desde 02/12/2026. Ligado a NF 880 · programado · por Amanda.');
    expect(achadoDaPrevia(respostaDeEntrar({ ok: false, recusa: { frase: 'não confere' } }))).toMatchObject({ podeEntrar: false });
  });
  it('"parece já pago" é selo vermelho e NÃO bloqueia entrar (a confirmação fica no ligar)', () => {
    const r = novo({ situacao: { lancamentos: [], avisos: [{ codigo: 'parece_ja_pago', lancamentos: [lanc({ status: 'realizado', pagamento: '2026-12-09', conta: 'Sicredi CC' })] }] } });
    const a = achadoDaPrevia(r);
    expect(a.selos.map((s) => [s.texto, s.tom])).toContainEqual(['parece já pago', 'vermelho']);
    expect(a.podeEntrar).toBe(true);
    if (r.ok === false) throw new Error('recusou');
    expect(fraseDoAviso(r.situacao.avisos[0])).toBe('Parece já pago: NF 880 · 1.000,00 · pago · Sicredi CC · pago em 09/12/2026.');
  });
  it('a situação à vista: status · conta · agendado para · pago em · por quem', () => {
    const [l] = listaDaCaixa({ itens: [{ ...boleto(), situacao_atual: { lancamentos: [lanc({ status: 'agendado', conta: 'BB CC', agendado_para: '2026-12-10', programado_por: { nome: 'Amanda', em: '2026-12-03T12:00:00Z' } })] } }] }).itens[0].situacao.lancamentos;
    expect(situacaoAVista(l)).toBe('agendado · BB CC · para 10/12/2026 · por Amanda');
    expect(situacaoAVista({ ...l, cancelado: true })).toBe('cancelado');
  });
  it('a porta conta novo + sem par (as abas da caixa estão em caixaPorEmail.test.ts)', () => {
    const l = listaDaCaixa({ contadores: { novo: 1, sem_par: 1, ligado: 1 }, itens: [boleto({ id: 'a', situacao: 'novo' }), boleto({ id: 'b', situacao: 'sem_par' }), boleto({ id: 'c', situacao: 'ligado' })] });
    expect(contadorDaPorta(l)).toBe(2);
    expect(contadorDaPorta(null)).toBeNull();
  });
  it('data dd/mm/aaaa e valor pt-BR; ausente = "—", nunca zero', () => {
    expect(dataBR('2026-12-10T03:00:00Z')).toBe('10/12/2026');
    expect(dataBR(null)).toBe('—');
    expect(valorBR(0)).toBe('0,00');
    expect(valorBR(null)).toBe('—');
  });
});
