/**
 * CONC-SPLIT-FILHO-CANCELADO-01 passo 2, commit B — o dono do aviso de filho de desmembramento: lê o retorno de
 * `fn_split_do_lancamento`, escreve as frases e pede o desfazer ao dono. Nenhuma conta: os números são os do banco.
 * E o CONTRATO DAS PORTAS, lido da fonte: parcela de parcelamento -> filho de split -> a confirmação de sempre.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const banco = vi.hoisted(() => ({
  rpc: vi.fn(),
  linhasDaView: [] as unknown[],
  erroDaView: null as null | { message: string },
  filtros: [] as [string, unknown][],
}));
vi.mock('@/integrations/supabase/client', () => {
  const consulta = () => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (c: string, v: unknown) => { banco.filtros.push([c, v]); return q; };
    q.in = () => q;
    q.limit = () => Promise.resolve({ data: banco.erroDaView ? null : banco.linhasDaView, error: banco.erroDaView });
    return q;
  };
  return { supabase: { rpc: (...a: unknown[]) => banco.rpc(...a), from: () => consulta() } };
});

import {
  confrontoDoSplit, consultarSplitDoLancamento, dataCurta, desfazerSplit, fraseDaTravaDoSplit, fraseDoLoteDeSplit, lerSplitDoLancamento,
  podeSerFilhoDeSplit, porQueNaoDesfaz, separarFilhosDeSplit, situacaoDoFilho,
  FRASE_DO_SPLIT, NAO_ACHOU_A_LINHA, NAO_DESFAZIVEL_SEM_MOTIVO, TITULO_DO_SPLIT,
} from './cancelarFilhoDeSplit';

/* a forma do retorno de `fn_split_do_lancamento` (valores sintéticos) */
export const RETORNO = {
  split_id: 'split-1',
  extrato: { id: 'ext-1', data: '2026-08-10', valor: -13760.35, descricao: 'Pix - Enviado SINT', conta_nome: 'Banco SINT' },
  importacao: { sessao_id: 'sessao-1', criada_em: '2026-09-01T10:00:00Z' },
  filhos: [
    { lancamento_id: 'f-a', descricao: 'SINT folha', valor: 10219.33, cancelado: false, este: true },
    { lancamento_id: 'f-b', descricao: 'SINT adiantamento', valor: 3291.02, cancelado: false, este: false },
    { lancamento_id: 'f-c', descricao: 'SINT vale', valor: 250, cancelado: true, este: false },
  ],
  total_filhos: 3, soma_vivos: 13510.35, desfazivel: true, motivo_nao_desfazivel: null,
};

beforeEach(() => { vi.clearAllMocks(); banco.linhasDaView = [{ staging_id: 'stg-9' }]; banco.erroDaView = null; banco.filtros = []; });

describe('lerSplitDoLancamento', () => {
  it('lê o retorno do banco sem mudar número nenhum', () => {
    expect(lerSplitDoLancamento(RETORNO)).toEqual({
      splitId: 'split-1',
      extrato: { id: 'ext-1', data: '2026-08-10', valor: -13760.35, descricao: 'Pix - Enviado SINT', contaNome: 'Banco SINT' },
      sessaoId: 'sessao-1',
      filhos: [
        { lancamentoId: 'f-a', descricao: 'SINT folha', valor: 10219.33, cancelado: false, este: true },
        { lancamentoId: 'f-b', descricao: 'SINT adiantamento', valor: 3291.02, cancelado: false, este: false },
        { lancamentoId: 'f-c', descricao: 'SINT vale', valor: 250, cancelado: true, este: false },
      ],
      totalFilhos: 3, somaVivos: 13510.35, desfazivel: true, motivoNaoDesfazivel: null,
    });
  });
  it('null do banco (não é filho de split vivo) e peça torta = null — nunca um split inventado', () => {
    expect(lerSplitDoLancamento(null)).toBeNull();
    expect(lerSplitDoLancamento(undefined)).toBeNull();
    expect(lerSplitDoLancamento('x')).toBeNull();
    expect(lerSplitDoLancamento({ ...RETORNO, split_id: null })).toBeNull();
    expect(lerSplitDoLancamento({ ...RETORNO, extrato: null })).toBeNull();
    expect(lerSplitDoLancamento({ ...RETORNO, filhos: 'x' })).toBeNull();
    expect(lerSplitDoLancamento({ ...RETORNO, filhos: [{ descricao: 'sem id' }] })).toBeNull();
    expect(lerSplitDoLancamento({ ...RETORNO, desfazivel: 'sim' })).toBeNull();
    expect(lerSplitDoLancamento({ ...RETORNO, soma_vivos: null })).toBeNull();
  });
});

describe('o que o aviso escreve', () => {
  const s = lerSplitDoLancamento(RETORNO)!;
  it('frases, data curta, situação e o confronto (os dois números do banco)', () => {
    expect(TITULO_DO_SPLIT).toBe('Este lançamento veio de um desmembramento');
    expect(FRASE_DO_SPLIT).toBe('Um filho não se cancela sozinho: o extrato ficaria parcial e sem saída. Desfaça o desmembramento inteiro e refaça pela Mesa.');
    expect(dataCurta('2026-08-10')).toBe('10/08/26');
    expect(s.filhos.map(situacaoDoFilho)).toEqual(['este lançamento', 'vivo', 'cancelado']);
    expect(confrontoDoSplit(s)).toEqual({ vivos: 'R$ 13.510,35', extrato: 'R$ 13.760,35', confere: false });
    expect(confrontoDoSplit({ ...s, somaVivos: 13760.35 }).confere).toBe(true);
    expect(confrontoDoSplit({ ...s, somaVivos: 13760.34 }).confere).toBe(false);   // um centavo conta
  });
  it('a frase das portas sem diálogo e a do lote', () => {
    expect(fraseDaTravaDoSplit(s)).toBe('Este lançamento é parte do desmembramento do extrato de 10/08/26 (R$ 13.760,35, 3 lançamentos). '
      + 'Não se cancela sozinho: desfaça o desmembramento pela Mesa do Enriquecer.');
    expect(fraseDoLoteDeSplit(1)).toBe('1 parte de desmembramento: desfaça pela Mesa.');
    expect(fraseDoLoteDeSplit(4)).toBe('4 partes de desmembramento: desfaça pela Mesa.');
  });
  it('desfazível = nulo; não desfazível = o motivo do banco (ou a frase de reserva, nunca vazio)', () => {
    expect(porQueNaoDesfaz(s)).toBeNull();
    expect(porQueNaoDesfaz({ ...s, desfazivel: false, motivoNaoDesfazivel: 'Um filho já foi cancelado.' })).toBe('Um filho já foi cancelado.');
    expect(porQueNaoDesfaz({ ...s, desfazivel: false, motivoNaoDesfazivel: null })).toBe(NAO_DESFAZIVEL_SEM_MOTIVO);
    expect(porQueNaoDesfaz({ ...s, desfazivel: false, motivoNaoDesfazivel: '  ' })).toBe(NAO_DESFAZIVEL_SEM_MOTIVO);
  });
  it('prefiltro e lote', () => {
    expect(podeSerFilhoDeSplit({ origem_lancamento: 'mesa_split' })).toBe(true);
    expect(podeSerFilhoDeSplit({ origem_lancamento: 'manual' })).toBe(false);
    expect(podeSerFilhoDeSplit(null)).toBe(false);
    expect(separarFilhosDeSplit(['a', 'b', 'c'], new Set(['b']))).toEqual({ cancelaveis: ['a', 'c'], puladosSplit: ['b'] });
  });
});

describe('as idas ao banco', () => {
  it('consultar: a resposta lida; erro, exceção e null do banco = null (a porta segue o cancelamento de sempre)', async () => {
    banco.rpc.mockResolvedValueOnce({ data: RETORNO, error: null });
    expect((await consultarSplitDoLancamento('f-a'))?.splitId).toBe('split-1');
    expect(banco.rpc).toHaveBeenCalledWith('fn_split_do_lancamento', { p_lancamento_id: 'f-a' });
    banco.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await consultarSplitDoLancamento('x')).toBeNull();
    banco.rpc.mockResolvedValueOnce({ data: null, error: { message: 'sem acesso a este registro' } });
    expect(await consultarSplitDoLancamento('x')).toBeNull();
    banco.rpc.mockRejectedValueOnce(new Error('rede'));
    expect(await consultarSplitDoLancamento('x')).toBeNull();
  });
  it('desfazer: acha a linha pela view da Mesa (split + importação) e chama o dono SEM simular, com o motivo', async () => {
    const s = lerSplitDoLancamento(RETORNO)!;
    banco.rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect(await desfazerSplit(s, 'lançado errado')).toBeNull();
    expect(banco.filtros).toEqual([['split_id', 'split-1'], ['sessao_id', 'sessao-1']]);
    expect(banco.rpc).toHaveBeenCalledWith('fn_classificacao_desfazer_split', { p_staging_id: 'stg-9', p_motivo: 'lançado errado', p_simular: false });
  });
  it('desfazer: a recusa do banco (ok falso, ou erro) volta como FRASE; sem a linha, não chama o dono', async () => {
    const s = lerSplitDoLancamento(RETORNO)!;
    banco.rpc.mockResolvedValueOnce({ data: { ok: false, mensagem: 'O filho 2 foi gravado em outra importação: reverta lá antes.' }, error: null });
    expect(await desfazerSplit(s, 'm')).toBe('O filho 2 foi gravado em outra importação: reverta lá antes.');
    banco.rpc.mockResolvedValueOnce({ data: null, error: { message: 'competência em mês fechado' } });
    expect(await desfazerSplit(s, 'm')).toBe('competência em mês fechado');
    banco.rpc.mockResolvedValueOnce({ data: 'torto', error: null });
    expect(await desfazerSplit(s, 'm')).toBe('O banco devolveu uma resposta que a tela não soube ler.');
    banco.rpc.mockClear();
    banco.linhasDaView = [];
    expect(await desfazerSplit(s, 'm')).toBe(NAO_ACHOU_A_LINHA);
    banco.erroDaView = { message: 'x' };
    expect(await desfazerSplit(s, 'm')).toBe(NAO_ACHOU_A_LINHA);
    expect(banco.rpc).not.toHaveBeenCalled();
  });
});

/* ── o contrato das portas, lido da fonte ───────────────────────────────── */

const ler = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8');
/** a ordem das três saídas dentro do corpo de uma função: parcela -> split -> confirmação de sempre */
function ordemDaPorta(fonte: string, inicio: string, confirmar: string): { ok: boolean; porque: string } {
  const a = fonte.indexOf(inicio);
  if (a < 0) return { ok: false, porque: 'porta não achada' };
  const corpo = fonte.slice(a, fonte.indexOf('\n  };', a));
  const p = corpo.indexOf('await consultarParcelaDoLancamento(');
  const s = corpo.indexOf('await consultarSplitDoLancamento(');
  const ifP = corpo.indexOf('if (previa) setParcelaACancelar(previa);');
  const ifS = corpo.indexOf('else if (split) setSplitACancelar(split);');
  const c = corpo.indexOf(`else ${confirmar}(true);`);
  if (p < 0 || s < 0) return { ok: false, porque: 'falta uma das duas consultas' };
  if (!(p < s)) return { ok: false, porque: 'o split é consultado antes da parcela' };
  if (!/!previa\b[^;]*await consultarSplitDoLancamento\(/.test(corpo)) return { ok: false, porque: 'o split é consultado mesmo sendo parcela' };
  if (ifP < 0 || ifS < 0 || c < 0 || !(ifP < ifS && ifS < c)) return { ok: false, porque: 'a ordem das saídas não é parcela -> split -> padrão' };
  return { ok: true, porque: '' };
}

describe('as portas (fonte): parcela de parcelamento -> filho de split -> a confirmação de sempre', () => {
  it('auto-teste do detector', () => {
    const boa = `  const abrir = async () => {
    const previa = id ? await consultarParcelaDoLancamento(id) : null;
    const split = !previa && id ? await consultarSplitDoLancamento(id) : null;
    if (previa) setParcelaACancelar(previa);
    else if (split) setSplitACancelar(split);
    else setX(true);
  };`;
    expect(ordemDaPorta(boa, 'const abrir = async', 'setX').ok).toBe(true);
    expect(ordemDaPorta(boa.replace('    const split = !previa && id ? await consultarSplitDoLancamento(id) : null;\n', ''), 'const abrir = async', 'setX').ok).toBe(false);
    expect(ordemDaPorta(boa.replace('    else if (split) setSplitACancelar(split);\n', ''), 'const abrir = async', 'setX').ok).toBe(false);
    expect(ordemDaPorta(boa.replace('!previa && id ?', 'id ?'), 'const abrir = async', 'setX').ok).toBe(false);
    expect(ordemDaPorta(boa, 'const outra = async', 'setX').ok).toBe(false);
  });
  it('LancamentoV2Dialog.abrirCancelamento e LancamentoLeituraDialog.pedirCancelamento', () => {
    const v2 = ler('components/financeiro-v2/LancamentoV2Dialog.tsx');
    expect(ordemDaPorta(v2, 'const abrirCancelamento = async', 'setConfirmandoCancelamento')).toEqual({ ok: true, porque: '' });
    expect(v2).toContain('<CancelarFilhoDeSplitDialog');
    expect(v2).toContain('aoDesfazer={() => { setSplitACancelar(null); onClose(); }}');
    const leitura = ler('components/financeiro-v2/LancamentoLeituraDialog.tsx');
    expect(ordemDaPorta(leitura, 'const pedirCancelamento = async', 'setConfirmCancel')).toEqual({ ok: true, porque: '' });
    expect(leitura).toContain('<CancelarFilhoDeSplitDialog');
    expect(leitura).toContain('aoDesfazer={() => { setSplitACancelar(null); onClose(); onCancelado?.(); }}');
  });
  it('o hook: as portas sem diálogo recebem a FRASE da tela antes de escrever, e o lote pula os filhos e segue', () => {
    const hook = ler('hooks/useFinanceiroV2.ts');
    const um = hook.slice(hook.indexOf('const excluirLancamento = useCallback('), hook.indexOf('const excluirLancamentosEmLote = useCallback('));
    const consulta = um.indexOf('const split = await consultarSplitDoLancamento(id);');
    expect(consulta).toBeGreaterThan(-1);
    expect(um).toContain('if (split) { toast.error(fraseDaTravaDoSplit(split)); return false; }');
    expect(consulta).toBeLessThan(um.indexOf('cancelado: true'));            // antes de escrever
    const lote = hook.slice(hook.indexOf('const excluirLancamentosEmLote = useCallback('), hook.indexOf('const marcarRealizadoEmLote = useCallback('));
    const separa = lote.indexOf('separarFilhosDeSplit(semParcela, await filhosDeSplitVivo(semParcela))');
    expect(separa).toBeGreaterThan(-1);
    expect(separa).toBeLessThan(lote.indexOf('cancelado: true'));
    expect(lote).toContain('puladosOC, puladosParcela, puladosSplit };');
    expect(ler('pages/FinanceiroV2Tab.tsx')).toContain('toast.warning(fraseDoLoteDeSplit(result.puladosSplit.length));');
  });
  it('o diálogo não usa toast e a tela não lê classificacao_split_itens', () => {
    const dlg = ler('components/conciliacao/CancelarFilhoDeSplitDialog.tsx');
    expect(dlg.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')).not.toMatch(/\btoast\b|sonner/);
    for (const f of ['components/conciliacao/CancelarFilhoDeSplitDialog.tsx', 'lib/conciliacao/cancelarFilhoDeSplit.ts']) {
      expect(ler(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')).not.toContain('classificacao_split_itens');
    }
  });
});
