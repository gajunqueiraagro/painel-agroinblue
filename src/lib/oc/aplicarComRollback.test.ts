/**
 * O CAMINHO DE VOLTA DE UMA GRAVAÇÃO RECUSADA — OC-BOITEL-REALIZADO-01.
 *
 * ⚠ NASCE DE UM CARD QUE MOSTRAVA DUAS VERDADES AO MESMO TEMPO. OC 6a808c4c (NJ · venda boitel
 * JBS Guaiçara · 03/04/2020 · 200 garrotes): o operador aplicou o realizado com a negociação
 * fechada, `oc_salvar_boitel` recusou, e o card ficou exibindo os deltas (+0,025 kg · +14 dias ·
 * +1,00 pp) enquanto GMD, Dias e RC saíam "—". Os deltas a tela calcula do que ele digitou; os
 * três traços ela lê da linha `cenario = 'realizado'`, que nunca existiu. O estado local
 * sobreviveu à recusa porque o `setOcBoitelReal(proximo)` rodava ANTES do `try`.
 *
 * ⚠ O CASO QUE JUSTIFICA O ARQUIVO É O DA RESTAURAÇÃO COM VALOR ANTERIOR NÃO-VAZIO. Um teste que
 * só afirmasse "rejeitou, estado volta a null" passaria verde também numa função que LIMPASSE o
 * estado — e aí uma segunda edição recusada apagaria da tela um realizado que já estava gravado
 * no banco. Trocar uma mentira por outra não é conserto.
 */
import { describe, it, expect, vi } from 'vitest';
import { aplicarComRollback } from '@/lib/oc/aplicarComRollback';

type Boitel = { pesoVivoTotalAbate: string };

describe('aplicarComRollback', () => {
  it('RPC resolve: o estado fica com o valor novo', async () => {
    const vistos: (Boitel | null)[] = [];
    const ok = await aplicarComRollback<Boitel | null>(
      null,
      { pesoVivoTotalAbate: '96.000,00' },
      v => vistos.push(v),
      async () => ({ versao: 2 }),
    );

    expect(ok).toBe(true);
    expect(vistos.at(-1)).toEqual({ pesoVivoTotalAbate: '96.000,00' });
  });

  it('RPC rejeita: o estado volta a ser IGUAL ao anterior — o caso do NJ 03/04/2020', async () => {
    const vistos: (Boitel | null)[] = [];
    const erro = new Error('Negociação fechada. Reabra para editar.');

    await expect(
      aplicarComRollback<Boitel | null>(
        null,
        { pesoVivoTotalAbate: '96.000,00' },
        v => vistos.push(v),
        async () => { throw erro; },
      ),
    ).rejects.toBe(erro);

    /* ⚠ O intermediário EXISTE de propósito: a tela mostra o que foi digitado enquanto a RPC
       corre. O que este caso trava é o ÚLTIMO estado, que é o que sobra na tela. */
    expect(vistos).toEqual([{ pesoVivoTotalAbate: '96.000,00' }, null]);
    expect(vistos.at(-1)).toBeNull();
  });

  it('rejeitando, restaura o ANTERIOR — não limpa', async () => {
    /* ⚠ É o caso que separa conserto de troca de defeito: já havia um realizado gravado
       (94.500,00) e a edição nova foi recusada. Limpar apagaria da tela um dado que o banco tem. */
    const anterior: Boitel = { pesoVivoTotalAbate: '94.500,00' };
    const vistos: Boitel[] = [];

    await expect(
      aplicarComRollback<Boitel>(
        anterior,
        { pesoVivoTotalAbate: '96.000,00' },
        v => vistos.push(v),
        async () => { throw new Error('recusada'); },
      ),
    ).rejects.toThrow('recusada');

    expect(vistos.at(-1)).toBe(anterior);
    expect(vistos.at(-1)?.pesoVivoTotalAbate).toBe('94.500,00');
  });

  it('o erro SOBE — quem chama é que decide o toast', async () => {
    /* ⚠ Engolir o erro aqui deixaria o chamador sem como distinguir "negociação fechada"
       (que ganha o botão Reabrir) de 40001 (que recarrega a versão). */
    const erro = new Error('40001');
    await expect(
      aplicarComRollback(null, 1, () => {}, async () => { throw erro; }),
    ).rejects.toBe(erro);
  });

  it('não chama a gravação antes de aplicar o estado', async () => {
    const ordem: string[] = [];
    await aplicarComRollback(
      null,
      1,
      () => ordem.push('set'),
      async () => { ordem.push('gravar'); },
    );
    expect(ordem).toEqual(['set', 'gravar']);
  });

  it('a gravação roda uma vez só', async () => {
    const gravar = vi.fn(async () => undefined);
    await aplicarComRollback(null, 1, () => {}, gravar);
    expect(gravar).toHaveBeenCalledTimes(1);
  });
});
