/**
 * OC-MOTIVO-UNICO-01 — "Desfazer compromisso": um motivo, um estorno_id, a cadeia inteira.
 *
 * ⚠ O MOLDE E' A TRILHA REAL DO 0fdec0eb (8b211cae, 25/09/2026, 12:47 Brasilia): o titulo da parcela
 * ba90d4c8 (848.713,32) estornado com a operacao na versao 14, a programacao d7182dd1 cancelada na 15,
 * o compromisso na 16 — tres gestos, tres "erro" digitados, tres estorno_id diferentes. Aqui e' um
 * gesto: o mesmo motivo e o MESMO estorno_id nas tres chamadas, e a versao andando pelo retorno.
 * ⚠ O BANCO E' UM ESTADO EM MEMORIA com as mesmas regras das guardas (programacao recusa com titulo
 * vivo; compromisso recusa com programacao ativa), para o teste falhar se a ordem estiver errada.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  executarDesfazerCompromisso, rolDoEstado, ErroDesfazer, type EstadoDoDesfazer, type DepsDesfazer,
} from '@/lib/oc/desfazerCompromisso';

const COMP = '0fdec0eb-9542-42ed-9610-b92ae2f509fd';
const PROG = 'd7182dd1-daf6-43ac-a09c-850388b35204';
const PARC = 'ba90d4c8-a861-4988-85b6-d60cf6978e3e';
const ESTORNO = 'c5e27c63-f1dc-4415-a2ce-517857da227d';

function bancoFalso(inicial: Omit<EstadoDoDesfazer, 'versao'>, versao = 14) {
  const e: EstadoDoDesfazer = { versao, ...structuredClone(inicial) };
  const chamadas: Array<[string, number, string, string]> = [];
  const falhas: Record<string, Error | undefined> = {};
  const deps: DepsDesfazer = {
    lerEstado: vi.fn(async () => structuredClone(e)),
    estornar: vi.fn(async (v, _prog, parc, motivo, estornoId) => {
      chamadas.push(['estornar', v, motivo, estornoId]);
      if (falhas.estornar) throw falhas.estornar;
      e.titulos = e.titulos.filter(t => t.parcelaId !== parc);
      return ++e.versao;
    }),
    cancelarProgramacao: vi.fn(async (v, _prog, motivo, estornoId) => {
      chamadas.push(['programacao', v, motivo, estornoId]);
      if (falhas.programacao) throw falhas.programacao;
      if (e.titulos.length) throw new Error('Existe titulo ativo vinculado a esta programacao; estorne a materializacao antes.');
      e.programacaoAtivaId = null;
      return ++e.versao;
    }),
    cancelarCompromisso: vi.fn(async (v, _id, motivo, estornoId) => {
      chamadas.push(['compromisso', v, motivo, estornoId]);
      if (e.programacaoAtivaId) throw new Error('Cancele a programacao ativa antes de cancelar o compromisso.');
      e.compromissoCancelado = true;
      return ++e.versao;
    }),
  };
  return { e, deps, chamadas, falhas };
}

const COMPLETO = {
  titulos: [{ programacaoId: PROG, parcelaId: PARC, sequencia: 1, valor: 848713.32, vencimento: '2022-04-13' }],
  programacaoAtivaId: PROG,
  compromissoCancelado: false,
};

describe('Desfazer compromisso', () => {
  it('0fdec0eb: titulo -> programacao -> compromisso, com UM motivo e UM estorno_id, versao pelo retorno', async () => {
    const b = bancoFalso(COMPLETO);
    const r = await executarDesfazerCompromisso({ compromissoId: COMP, motivo: 'erro', estornoId: ESTORNO, deps: b.deps });
    expect(b.chamadas).toEqual([
      ['estornar', 14, 'erro', ESTORNO],
      ['programacao', 15, 'erro', ESTORNO],
      ['compromisso', 16, 'erro', ESTORNO],
    ]);
    expect(r.feito).toEqual([
      'estornado o título de R$ 848.713,32 (venc. 13/04/2022)'.replace(/R\$ /, 'R$ '),
      'cancelada a programação',
      'cancelado o compromisso',
    ]);
    expect(b.e.compromissoCancelado).toBe(true);
  });

  it('compromisso so programado (sem titulo): pula o estorno', async () => {
    const b = bancoFalso({ ...COMPLETO, titulos: [] });
    await executarDesfazerCompromisso({ compromissoId: COMP, motivo: 'erro', estornoId: ESTORNO, deps: b.deps });
    expect(b.chamadas.map(c => c[0])).toEqual(['programacao', 'compromisso']);
  });

  it('compromisso so aberto: direto ao cancelamento', async () => {
    const b = bancoFalso({ titulos: [], programacaoAtivaId: null, compromissoCancelado: false });
    await executarDesfazerCompromisso({ compromissoId: COMP, motivo: 'erro', estornoId: ESTORNO, deps: b.deps });
    expect(b.chamadas.map(c => c[0])).toEqual(['compromisso']);
  });

  it('retomada depois de falha no meio: o titulo ja estornado e pulado, o resto segue com o MESMO estorno_id', async () => {
    const b = bancoFalso(COMPLETO);
    b.falhas.programacao = new Error('Falha de rede');
    await expect(executarDesfazerCompromisso({ compromissoId: COMP, motivo: 'erro', estornoId: ESTORNO, deps: b.deps }))
      .rejects.toBeInstanceOf(ErroDesfazer);
    expect(b.e.titulos).toEqual([]);                   // o estorno entrou antes da falha

    b.falhas.programacao = undefined;
    b.chamadas.length = 0;
    await executarDesfazerCompromisso({ compromissoId: COMP, motivo: 'erro', estornoId: ESTORNO, deps: b.deps });
    expect(b.chamadas).toEqual([
      ['programacao', 15, 'erro', ESTORNO],
      ['compromisso', 16, 'erro', ESTORNO],
    ]);
  });

  it('recusa E3 do banco: para ali, diz o que ja foi e o que falta, e nao tenta o resto', async () => {
    const b = bancoFalso(COMPLETO);
    b.falhas.estornar = new Error('Titulo realizado/conciliado; estorne a liquidacao antes.');
    const erro = await executarDesfazerCompromisso({ compromissoId: COMP, motivo: 'erro', estornoId: ESTORNO, deps: b.deps })
      .catch(e => e);
    expect(erro).toBeInstanceOf(ErroDesfazer);
    expect(erro.message).toMatch(/liquidacao antes/);
    expect(erro.feito).toEqual([]);
    expect(erro.falta).toEqual(rolDoEstado(COMPLETO));
    expect(b.chamadas.map(c => c[0])).toEqual(['estornar']);
  });

  it('"ja desfeito" do banco e idempotencia, nao erro: segue a cadeia com a versao relida', async () => {
    const b = bancoFalso({ ...COMPLETO, titulos: [] });
    /* O banco diz que ja' esta' cancelada — no retrato real, a programacao ja' nao existe. */
    b.deps.cancelarProgramacao = vi.fn(async () => { b.e.programacaoAtivaId = null; throw new Error('Programacao ja cancelada'); });
    const r = await executarDesfazerCompromisso({ compromissoId: COMP, motivo: 'erro', estornoId: ESTORNO, deps: b.deps });
    expect(r.feito).toEqual(['cancelado o compromisso']);
    expect(b.chamadas.map(c => c[0])).toEqual(['compromisso']);
  });

  it('motivo vazio nao executa nada — nem a leitura', async () => {
    const b = bancoFalso(COMPLETO);
    await expect(executarDesfazerCompromisso({ compromissoId: COMP, motivo: '   ', estornoId: ESTORNO, deps: b.deps }))
      .rejects.toBeInstanceOf(ErroDesfazer);
    expect(b.deps.lerEstado).not.toHaveBeenCalled();
    expect(b.chamadas).toEqual([]);
  });
});
