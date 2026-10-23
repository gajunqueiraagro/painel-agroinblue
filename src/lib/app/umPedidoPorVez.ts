/**
 * P53 (Gabriel 23/10/2026; achado do OC-HOSPEDEIRO-LEVE-01) — UM pedido por vez para a MESMA pergunta. Na abertura da OC, o "mês fechado"
 * (`get_status_pilares_fechamento`) saía 3× e a trava master 2× (3 consultas cada): cada componente que usa o hook pedia o seu, ao mesmo
 * tempo, com a mesma chave. Aqui quem chega enquanto o pedido da mesma chave está A CAMINHO recebe a MESMA resposta; terminado, a chave
 * sai — o próximo pedido (um `refetch`, outro mês) vai ao banco como sempre. Nenhuma resposta é guardada além do voo: nada muda de
 * comportamento, só some o pedido repetido.
 */
export function criarUmPedidoPorVez<T>(): (chave: string, pedir: () => Promise<T>) => Promise<T> {
  const emVoo = new Map<string, Promise<T>>();
  return (chave, pedir) => {
    const atual = emVoo.get(chave);
    if (atual) return atual;
    const novo = pedir().finally(() => { emVoo.delete(chave); });
    emVoo.set(chave, novo);
    return novo;
  };
}
