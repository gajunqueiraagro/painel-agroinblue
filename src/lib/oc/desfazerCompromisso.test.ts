/**
 * "Desfazer compromisso": um motivo, um estorno_id, a cadeia inteira — e, desde o OC-CC-MODAL-FINANCEIRO-01, UMA
 * chamada e UMA transacao (`oc_desfazer_compromisso`). A cadeia de tres idas que este arquivo testava saiu do front
 * com o codigo; o que se prende aqui e' o CONTRATO com a RPC: o que vai, como o retorno e' lido e o que a recusa vira.
 *
 * ⚠ O MOLDE E' A TRILHA REAL DO 0fdec0eb (8b211cae, 25/09/2026): titulo da parcela ba90d4c8 (848.713,32),
 * programacao d7182dd1, compromisso — tres gestos, tres motivos, tres estorno_id. Hoje: um de cada.
 * ⚠ A ORDEM E A ATOMICIDADE SAO DO BANCO, provadas em `supabase/tests/oc_cc_modal_financeiro_01_test.sql` (L5, L6).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  executarDesfazerCompromisso, lerRetornoDoDesfazer, feitoDoRetorno, fraseDoErroDoDesfazer, rolDoEstado, ErroDesfazer,
  type RpcDesfazer,
} from '@/lib/oc/desfazerCompromisso';

const OP = '8b211cae-0000-4000-8000-000000000001';
const COMP = '0fdec0eb-9542-42ed-9610-b92ae2f509fd';
const PROG = 'd7182dd1-daf6-43ac-a09c-850388b35204';
const PARC = 'ba90d4c8-a861-4988-85b6-d60cf6978e3e';
const ESTORNO = 'c5e27c63-f1dc-4415-a2ce-517857da227d';

const retorno = (extra: Record<string, unknown> = {}) => ({
  ok: true, simulado: false, estorno_id: ESTORNO, compromisso_id: COMP, natureza: 'obrigacao', componente: 'frete',
  valor_total: 848713.32,
  titulos_estornados: [{ sequencia: 1, parcela_id: PARC, titulo_id: 't1', valor: 848713.32 }],
  programacoes_canceladas: 1, operacao_id: OP, operacao_versao: 17, ...extra,
});
const rpcQue = (resposta: Awaited<ReturnType<RpcDesfazer>>) => vi.fn<RpcDesfazer>(async () => resposta);

const COMPLETO = {
  titulos: [{ programacaoId: PROG, parcelaId: PARC, sequencia: 1, valor: 848713.32, vencimento: '2022-04-13' }],
  programacaoAtivaId: PROG,
  compromissoCancelado: false,
};

describe('Desfazer compromisso — uma chamada', () => {
  it('0fdec0eb: UMA ida ao banco, com a operacao, a versao, o compromisso e o motivo aparado', async () => {
    const rpc = rpcQue({ data: retorno(), error: null });
    const r = await executarDesfazerCompromisso({ operacaoId: OP, versao: 14, compromissoId: COMP, motivo: '  erro ', rpc });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith({
      p_operacao_id: OP, p_versao: 14, p_compromisso_id: COMP, p_motivo: 'erro', p_simular: false,
    });
    expect(r.feito).toHaveLength(3);
    expect(r.feito[0]).toMatch(/^estornado o título de R\$\s848\.713,32 \(parcela 1\)$/);
    expect(r.feito.slice(1)).toEqual(['cancelada a programação', 'cancelado o compromisso']);
    expect(r.retorno).toMatchObject({ estornoId: ESTORNO, versao: 17, simulado: false, programacoesCanceladas: 1 });
  });

  it('simular vai como p_simular e volta marcado', async () => {
    const rpc = rpcQue({ data: retorno({ simulado: true }), error: null });
    const r = await executarDesfazerCompromisso({ operacaoId: OP, versao: 14, compromissoId: COMP, motivo: 'erro', simular: true, rpc });
    expect(rpc.mock.calls[0][0].p_simular).toBe(true);
    expect(r.retorno.simulado).toBe(true);
  });

  it('o que o gesto fez sai do RETORNO: so programado nao diz titulo; so aberto diz so o compromisso', () => {
    const soProgramado = lerRetornoDoDesfazer(retorno({ titulos_estornados: [] }));
    expect(soProgramado && feitoDoRetorno(soProgramado)).toEqual(['cancelada a programação', 'cancelado o compromisso']);
    const soAberto = lerRetornoDoDesfazer(retorno({ titulos_estornados: [], programacoes_canceladas: 0 }));
    expect(soAberto && feitoDoRetorno(soAberto)).toEqual(['cancelado o compromisso']);
  });

  it('recusa E3 do banco: a frase do banco, NADA feito (a cadeia e uma transacao) e o rol que falta', async () => {
    const rpc = rpcQue({ data: null, error: { code: 'P0001', message: 'Estorne a liquidacao ou conciliacao financeira antes de estornar esta materializacao.' } });
    const falta = rolDoEstado(COMPLETO);
    const erro = await executarDesfazerCompromisso({ operacaoId: OP, versao: 14, compromissoId: COMP, motivo: 'erro', falta, rpc }).catch(e => e);
    expect(erro).toBeInstanceOf(ErroDesfazer);
    expect(erro.message).toBe('Este lançamento já foi pago ou conciliado. Desfaça o pagamento ou a conciliação no Financeiro antes.');
    expect(erro.feito).toEqual([]);
    expect(erro.falta).toEqual(falta);
    expect(rpc).toHaveBeenCalledTimes(1);          // nao ha' segunda tentativa nem passo seguinte
  });

  it('erro que nao e regra de negocio vira frase da casa, nunca o texto cru', () => {
    expect(fraseDoErroDoDesfazer({ code: '40001', message: 'x' })).toMatch(/A operação mudou enquanto você trabalhava/);
    expect(fraseDoErroDoDesfazer({ code: '42501', message: 'permission denied' })).toBe('Sem permissão para esta operação.');
    expect(fraseDoErroDoDesfazer({ code: 'P0002', message: 'x' })).toBe('Operação não encontrada.');
    expect(fraseDoErroDoDesfazer({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe('Não foi possível desfazer agora. Tente de novo.');
    expect(fraseDoErroDoDesfazer({ code: 'P0001', message: 'Compromisso ja cancelado' })).toBe('Este lançamento já foi cancelado.');
    expect(fraseDoErroDoDesfazer({ code: 'P0001', message: 'Desfazer exige motivo' })).toBe('Desfazer exige motivo');   // fora do mapa: como veio
  });

  it('retorno torto NUNCA vira sucesso', async () => {
    for (const torto of [null, {}, retorno({ ok: false }), retorno({ estorno_id: null }), retorno({ operacao_versao: 'x' }),
      retorno({ titulos_estornados: 'nao' }), retorno({ titulos_estornados: [{ sequencia: 'a', valor: 1 }] })]) {
      expect(lerRetornoDoDesfazer(torto)).toBeNull();
    }
    const rpc = rpcQue({ data: {}, error: null });
    await expect(executarDesfazerCompromisso({ operacaoId: OP, versao: 14, compromissoId: COMP, motivo: 'erro', rpc }))
      .rejects.toThrow(/fora do esperado/);
  });

  it('motivo vazio nao vai ao banco', async () => {
    const rpc = rpcQue({ data: retorno(), error: null });
    await expect(executarDesfazerCompromisso({ operacaoId: OP, versao: 14, compromissoId: COMP, motivo: '   ', rpc }))
      .rejects.toBeInstanceOf(ErroDesfazer);
    expect(rpc).not.toHaveBeenCalled();
  });
});
