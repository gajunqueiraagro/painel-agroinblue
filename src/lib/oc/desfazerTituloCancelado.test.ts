/**
 * OC-DESVINCULAR-01 (D2) — o "Desfazer compromisso" passa pela Graxaria 73a183eb, cujo titulo (f489abd9)
 * foi cancelado pelo Financeiro com a parte viva; e continua parando num titulo VIVO realizado.
 *
 * ⚠ A GUARDA MORA NO BANCO (`oc_estornar_materializacao`) e foi provada la', em rollback: antes do D2
 *   a Graxaria recusava com "Estorne a liquidacao ou conciliacao financeira antes..."; depois, a cadeia
 *   cancela parte, parcela, programacao e compromisso — e o principal 3e05fd75 (realizado) segue recusado.
 * ⚠ AQUI O BANCO E' FALSO e aplica a MESMA regra, para travar o que a CADEIA do front faz com cada
 *   resposta: segue ate' o fim quando o banco deixa, e para dizendo o que foi e o que falta quando recusa.
 *   A cadeia escolhe o titulo pela PARCELA (`materializada`), nao pelo titulo — e' por isso que a
 *   Graxaria entra nela mesmo com o titulo ja' cancelado.
 */
import { describe, it, expect, vi } from 'vitest';
import { executarDesfazerCompromisso, ErroDesfazer, type EstadoDoDesfazer, type DepsDesfazer } from '@/lib/oc/desfazerCompromisso';

const RECUSA = 'Estorne a liquidacao ou conciliacao financeira antes de estornar esta materializacao.';

function banco(titulo: { cancelado: boolean; status: string }, comp: string, prog: string, parc: string) {
  const e: EstadoDoDesfazer = {
    versao: 16,
    titulos: [{ programacaoId: prog, parcelaId: parc, sequencia: 1, valor: 5056, vencimento: '2025-01-17' }],
    programacaoAtivaId: prog, compromissoCancelado: false,
  };
  const deps: DepsDesfazer = {
    lerEstado: vi.fn(async () => structuredClone(e)),
    /* A guarda do D2: status/conciliacao so' contam em titulo NAO cancelado. */
    estornar: vi.fn(async () => {
      if (!titulo.cancelado && ['realizado', 'conciliado'].includes(titulo.status)) throw new Error(RECUSA);
      e.titulos = [];
      return ++e.versao;
    }),
    cancelarProgramacao: vi.fn(async () => { if (e.titulos.length) throw new Error('titulo ativo'); e.programacaoAtivaId = null; return ++e.versao; }),
    cancelarCompromisso: vi.fn(async () => { if (e.programacaoAtivaId) throw new Error('programacao ativa'); e.compromissoCancelado = true; return ++e.versao; }),
  };
  return { e, deps, comp };
}

describe('Desfazer com o D2', () => {
  it('Graxaria 73a183eb (titulo f489abd9 JA cancelado): a cadeia vai ate o compromisso', async () => {
    const b = banco({ cancelado: true, status: 'realizado' }, '73a183eb', 'aa6867d9', 'cd4a5c63');
    const r = await executarDesfazerCompromisso({ compromissoId: b.comp, motivo: 'devolução fora da OC', estornoId: 'est-1', deps: b.deps });
    expect(r.feito).toHaveLength(3);
    expect(r.feito[0]).toMatch(/^estornado o título de R\$\s5\.056,00 \(venc\. 17\/01\/2025\)$/);
    expect(r.feito.slice(1)).toEqual(['cancelada a programação', 'cancelado o compromisso']);
    expect(b.e.compromissoCancelado).toBe(true);
  });

  it('titulo VIVO realizado (principal 3e05fd75): para no primeiro nivel e diz o que falta', async () => {
    const b = banco({ cancelado: false, status: 'realizado' }, '0119442b', '85850b05', '2fb3b13c');
    await expect(executarDesfazerCompromisso({ compromissoId: b.comp, motivo: 'x', estornoId: 'est-2', deps: b.deps }))
      .rejects.toBeInstanceOf(ErroDesfazer);
    expect(b.deps.cancelarProgramacao).not.toHaveBeenCalled();
    expect(b.e.compromissoCancelado).toBe(false);
  });
});
