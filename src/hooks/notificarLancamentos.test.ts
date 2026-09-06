/**
 * O que este teste trava — o registro que avisa as OUTRAS telas quando um lançamento nasce.
 *
 * ⚠ `useFinanceiroV2` NÃO USA REACT-QUERY: cada instância tem estado próprio e não há cache
 * comum para invalidar. O custeio e o Financeiro V2 montam instâncias diferentes; sem este
 * aviso, os 43 lançamentos que o Raul criou pelo custeio só apareciam depois de sair e
 * voltar da seção — o que remonta a tela e força o load.
 * ⚠ O IDIOMA É O DO `usePastos`, e as três armadilhas dele valem aqui: iterar uma CÓPIA do
 * Set (um ouvinte pode desmontar durante a iteração), limpar a chave quando esvazia (senão
 * o Map cresce por cliente visitado até o refresh) e notificar DEPOIS da escrita.
 */
import { describe, it, expect, vi } from 'vitest';

/** Réplica exata do registro do hook — se ele mudar, este teste tem de mudar junto. */
const subs = new Map<string, Set<() => void>>();
const inscrever = (cliente: string, cb: () => void) => {
  let set = subs.get(cliente);
  if (!set) { set = new Set(); subs.set(cliente, set); }
  set.add(cb);
  return () => { set.delete(cb); if (set.size === 0) subs.delete(cliente); };
};
const notificar = (cliente: string) => {
  const set = subs.get(cliente);
  if (!set) return;
  for (const cb of [...set]) cb();
};

describe('registro de mudança de lançamentos', () => {
  it('avisa todas as instâncias do mesmo cliente', () => {
    subs.clear();
    const a = vi.fn(), b = vi.fn();
    inscrever('cli-1', a); inscrever('cli-1', b);
    notificar('cli-1');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('⚠ não vaza entre clientes — o NJ não recarrega quando o Raul lança', () => {
    subs.clear();
    const nj = vi.fn(), raul = vi.fn();
    inscrever('nj', nj); inscrever('raul', raul);
    notificar('raul');
    expect(raul).toHaveBeenCalledTimes(1);
    expect(nj).not.toHaveBeenCalled();
  });

  it('⚠ um ouvinte que desmonta DURANTE a notificação não quebra os outros', () => {
    /* Sem a cópia do Set, remover durante o `for` pula o próximo — e a tela que ficou
       montada não recarregaria, com o defeito reaparecendo só às vezes. */
    subs.clear();
    const depois = vi.fn();
    const cancelar = inscrever('cli-1', () => cancelar());
    inscrever('cli-1', depois);
    expect(() => notificar('cli-1')).not.toThrow();
    expect(depois).toHaveBeenCalledTimes(1);
  });

  it('a chave sai do mapa quando o último ouvinte desmonta', () => {
    subs.clear();
    const sair = inscrever('cli-1', () => {});
    expect(subs.has('cli-1')).toBe(true);
    sair();
    expect(subs.has('cli-1')).toBe(false);
  });

  it('notificar cliente sem ouvinte é inofensivo', () => {
    subs.clear();
    expect(() => notificar('ninguem')).not.toThrow();
  });
});
