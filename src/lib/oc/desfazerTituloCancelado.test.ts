/**
 * OC-DESVINCULAR-01 (D2) — o "Desfazer compromisso" passa pela Graxaria 73a183eb, cujo titulo (f489abd9)
 * foi cancelado pelo Financeiro com a parte viva; e continua recusando num titulo VIVO realizado.
 *
 * ⚠ A GUARDA MORA NO BANCO (`oc_estornar_materializacao`) e a CADEIA TAMBEM (`oc_desfazer_compromisso`,
 *   OC-CC-MODAL-FINANCEIRO-01): o front faz UMA chamada. Aqui o banco e' falso e responde como o de verdade
 *   responde nos dois casos, para travar o que a TELA faz com cada resposta — e que o front nao encadeia mais.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { executarDesfazerCompromisso, ErroDesfazer, type RpcDesfazer } from '@/lib/oc/desfazerCompromisso';

const RECUSA = 'O lançamento de R$ 5.056,00 de 13/04/2026 já foi pago ou conciliado. Desfaça o pagamento no lançamento antes.';
const OP = '11111111-1111-4111-8111-111111111111';

describe('Desfazer com o D2', () => {
  it('Graxaria 73a183eb (titulo f489abd9 JA cancelado): o banco desfaz ate o compromisso e a tela diz os tres passos', async () => {
    const rpc = vi.fn<RpcDesfazer>(async () => ({
      data: {
        ok: true, simulado: false, estorno_id: 'est-1', compromisso_id: '73a183eb',
        titulos_estornados: [{ sequencia: 1, parcela_id: 'cd4a5c63', titulo_id: 'f489abd9', valor: 5056 }],
        programacoes_canceladas: 1, operacao_id: OP, operacao_versao: 19,
      },
      error: null,
    }));
    const r = await executarDesfazerCompromisso({ operacaoId: OP, versao: 16, compromissoId: '73a183eb', motivo: 'devolução fora da OC', rpc });
    expect(r.feito).toHaveLength(3);
    expect(r.feito[0]).toMatch(/^estornado o título de R\$\s5\.056,00 \(parcela 1\)$/);
    expect(r.feito.slice(1)).toEqual(['cancelada a programação', 'cancelado o compromisso']);
  });

  it('titulo VIVO realizado (principal 3e05fd75): a recusa do banco sobe inteira e NADA foi desfeito', async () => {
    const rpc = vi.fn<RpcDesfazer>(async () => ({ data: null, error: { code: 'P0001', message: RECUSA } }));
    const erro = await executarDesfazerCompromisso({ operacaoId: OP, versao: 16, compromissoId: '0119442b', motivo: 'x', falta: ['cancelar o compromisso'], rpc })
      .catch(e => e);
    expect(erro).toBeInstanceOf(ErroDesfazer);
    expect(erro.message).toBe(RECUSA);   // OC-DESFAZER-PREVISTO-01b: a frase vem pronta do banco e passa como veio
    expect(erro.feito).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('o front NAO encadeia: o dono so cita a RPC da cadeia, e a busca sabe achar as tres antigas', () => {
    const fonte = readFileSync('src/lib/oc/desfazerCompromisso.ts', 'utf8');
    const antigas = /oc_estornar_materializacao|oc_cancelar_programacao|oc_cancelar_compromisso|estornarMaterializacao|cancelarProgramacao\(/;
    expect(antigas.test("await rpc('oc_cancelar_programacao')")).toBe(true);       // auto-teste do detector
    expect(antigas.test(fonte)).toBe(false);
    expect(fonte).toMatch(/rpc\('oc_desfazer_compromisso'/);
  });
});
