import { toast } from 'sonner';

/**
 * A RECUSA "negociação fechada" COM O CAMINHO DE VOLTA — OC-BOITEL-REALIZADO-01.
 *
 * ⚠ TRÊS CÓPIAS DA MESMA FRASE, e a terceira nasceu sem o botão. O abate
 * (`salvarNegociacaoAbateOC`) e a venda (`salvarNegociacaoVendaOC`) ganharam a ação inline
 * "Reabrir" no OC-COMPRA-REVALOR-01; o caminho do boitel, que é o MESMO estado recusado pela
 * MESMA razão, continuou com um `toast.error` cru — o operador lia "reabra para editar" e
 * tinha de achar sozinho onde se reabre. Três textos iguais em três lugares viram três
 * comportamentos diferentes na primeira vez que um deles muda.
 *
 * ⚠ O BOTÃO SÓ APARECE ONDE ELE RESOLVE, e é por isso que `reabrir` é obrigatório e não
 * opcional: sem ele a chamada não compila, em vez de degradar calada para um toast sem saída.
 * O caso em que reabrir NÃO basta — venda fechada com saída já registrada — tem texto próprio
 * em `salvarNegociacaoVendaOC` e continua sem botão, de propósito.
 *
 * ⚠ NÃO SERVE `useCompraLotes`: lá a recusa chega como MENSAGEM DO SERVIDOR e é reconhecida
 * por regex (`/reabra para editar/i`) sobre o erro da RPC. Aqui a tela já sabe o estado antes
 * de ir ao servidor. São duas perguntas diferentes com a mesma resposta; unificá-las faria o
 * helper ter de decidir se o argumento é um estado ou um erro.
 */
export function toastNegociacaoFechada(reabrir: () => void | Promise<unknown>): void {
  toast.error('Operação fechada. Reabra a negociação para editar.', {
    action: { label: 'Reabrir', onClick: () => { void reabrir(); } },
  });
}
