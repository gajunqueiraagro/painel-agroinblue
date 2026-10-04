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

/** A tela pela qual se abre e se altera uma operacao comercial — a MESMA que os atalhos do ACESSOS-02b consultam. */
export const TELA_DA_OPERACAO: V2Section = 'lancamentos-zoot';

/**
 * A PESSOA PODE ALTERAR UMA OPERACAO COMERCIAL? — ACESSOS-02c. O ajudante de quem desenha um GESTO que altera a operacao a partir
 * de outra tela (vincular e desvincular o lancamento, no modal do Financeiro). Exige nivel 'editar' na tela da operacao.
 *
 * ⚠ ATALHO SOME, GESTO FICA APAGADO COM O MOTIVO: quem nao tem a tela da operacao nao ve^ o efeito do gesto nem tem como desfaze^-lo
 *   — o botao continua la', desabilitado, e diz por que (`GestoDeOperacao`). Para o admin e para quem edita a tela, true: nada muda.
 * ⚠ E' O QUE A TELA OFERECE, NAO A TRAVA: a gravacao por perfil e' do banco (01F).
 */
export function usePodeAlterarOperacao(): boolean {
  const { clienteAtual, isAdmin } = useCliente();
  return nivelDaTela(clienteAtual?.perfil ?? null, isAdmin, TELA_DA_OPERACAO) === 'editar';
}
