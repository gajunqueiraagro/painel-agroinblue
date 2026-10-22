/**
 * CAD-CONTAS-BANCARIAS-01 — o aviso "esta conta mudou": o cadastro de Contas bancarias grava e avisa; quem mostra contas (a Conciliacao,
 * se estiver aberta) rele^ SO' a conta salva, sem F5. Um canal em memoria, por cliente, como o dos fornecedores.
 */
type Ouvinte = (contaId: string) => void;
const ouvintes = new Map<string, Set<Ouvinte>>();

export function avisarContaBancariaMudou(clienteId: string, contaId: string): void {
  for (const f of [...(ouvintes.get(clienteId) ?? [])]) f(contaId);
}

/** Inscreve; devolve o cancelamento (para o `useEffect`). */
export function ouvirContasBancarias(clienteId: string, f: Ouvinte): () => void {
  let set = ouvintes.get(clienteId);
  if (!set) { set = new Set(); ouvintes.set(clienteId, set); }
  set.add(f);
  return () => {
    set!.delete(f);
    if (set!.size === 0) ouvintes.delete(clienteId);
  };
}
