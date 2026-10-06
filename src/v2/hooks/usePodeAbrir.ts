import { useCliente } from '@/contexts/ClienteContext';
import { useMemo } from 'react';
import { acessoDaPessoa, podeNaOperacao, type AcessoOperacao, type CapacidadeOC } from '@/v2/lib/acessoOperacao';
import { nivelDaTela, podeEditarMeta, podeVerMeta } from '@/v2/lib/acessoTelas';
import { TELA_OPERACAO_COMERCIAL, type V2Section } from '@/v2/lib/navGrupos';

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

/**
 * A PESSOA PODE ABRIR UMA ROTA FORA DO V2? — ACESSOS-FIN-01. As rotas fora do `V2Index` (`/caderno-importacao`, `/v3`,
 * `/layout-lab`, `/resumo-operacional`) nao sao `V2Section`: quem as guarda e' o `SoAdmin` (`src/AppRouter.tsx`), e a regra dele
 * e' so' "admin do AGROinBLUE". Este ajudante e' o ESPELHO DECLARADO dessa guarda, para quem desenha o ATALHO: o cartao
 * "Movimentações por foto" de "Lançar movimentação" levava quem nao e' admin a "/" sem dizer nada.
 * ⚠ Quem mudar a regra do `SoAdmin` muda esta junto (preso por teste de fonte, `acessoSaidas.test.tsx`).
 */
export function usePodeAbrirRotaSoAdmin(): boolean {
  const { isAdmin } = useCliente();
  return isAdmin;
}

/**
 * A PESSOA VE^ META? — ACESSOS-FIN-02. O ajudante de quem desenha um controle Realizado | Meta (ou a referencia "Meta") dentro
 * de uma tela liberada. So' consulta o dono (`podeVerMeta`, `acessoTelas.ts`): nenhum `if` de perfil no ponto de uso.
 */
export function usePodeVerMeta(): boolean {
  const { clienteAtual, isAdmin } = useCliente();
  return podeVerMeta(clienteAtual?.perfil ?? null, isAdmin);
}

/**
 * A PESSOA EDITA META? — ACESSOS-FIN-03. O ajudante de quem desenha um gesto que CRIA, ALTERA ou APAGA meta (a grade META do
 * Fluxo Caixa, a linha de meta de Pecuária › Lançamentos). Hoje so' o admin. So' consulta o dono (`podeEditarMeta`).
 */
export function usePodeEditarMeta(): boolean {
  const { clienteAtual, isAdmin } = useCliente();
  return podeEditarMeta(clienteAtual?.perfil ?? null, isAdmin);
}

/** A tela pela qual se abre e se altera uma operacao comercial — a MESMA que os atalhos do ACESSOS-02b consultam. Desde o
 *  ACESSOS-OC-01 e' a tela PROPRIA da operacao (`operacao-comercial`), nao mais a de lancamentos do rebanho. */
export const TELA_DA_OPERACAO: V2Section = TELA_OPERACAO_COMERCIAL;

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

/**
 * A PESSOA PODE ISTO DENTRO DA OPERACAO COMERCIAL? — ACESSOS-OC-03a. So' consulta o dono (`podeNaOperacao`,
 * `src/v2/lib/acessoOperacao.ts`): nenhum `if` de perfil no ponto de uso.
 */
export function usePodeNaOperacao(capacidade: CapacidadeOC): boolean {
  const { clienteAtual, isAdmin } = useCliente();
  return podeNaOperacao(clienteAtual?.perfil ?? null, isAdmin, capacidade);
}

/** Todas as capacidades da pessoa, de uma vez: o que o HOSPEDEIRO da OC le' e desce por prop aos shells e as abas. */
export function useAcessoOperacao(): AcessoOperacao {
  const { clienteAtual, isAdmin } = useCliente();
  const perfil = clienteAtual?.perfil ?? null;
  return useMemo(() => acessoDaPessoa(perfil, isAdmin), [perfil, isAdmin]);
}
