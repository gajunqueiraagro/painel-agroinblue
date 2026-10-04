import { useCliente } from '@/contexts/ClienteContext';
import { nivelDaTela } from '@/v2/lib/acessoTelas';
import type { V2Section } from '@/v2/lib/navGrupos';

/**
 * A PESSOA PODE ABRIR ESTA TELA? — ACESSOS-02b. O ajudante de quem desenha um ATALHO para outra tela (o icone e o "Abrir OC" do
 * lancamento, o "Ver contrato" da parcela de financiamento, o "Abrir →" do modal).
 *
 * ⚠ ATALHO PARA TELA SEM ACESSO NAO E' OFERECIDO: ele some. A INFORMACAO da linha fica (que o lancamento e' de uma OC, que e'
 *   parcela de financiamento); so' o controle que navega sai. Nao e' a regra do menu "⋯" da OC (item que nao vale fica
 *   desabilitado com o motivo): aqui e' ACESSO, e o que a pessoa nao pode ter nao se oferece.
 * ⚠ SO' CONSULTA O DONO (`nivelDaTela`, `src/v2/lib/acessoTelas.ts`): nenhum `if` de perfil no ponto de uso. Perfil e `isAdmin` ja'
 *   estao no `ClienteContext` — nenhuma consulta nova ao banco. Para o admin e para quem tem a tela, devolve true: nada muda.
 */
export function usePodeAbrir(tela: V2Section): boolean {
  const { clienteAtual, isAdmin } = useCliente();
  return nivelDaTela(clienteAtual?.perfil ?? null, isAdmin, tela) !== 'nao';
}
