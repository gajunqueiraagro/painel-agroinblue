/**
 * O QUE CADA PERFIL PODE DENTRO DA OPERACAO COMERCIAL — ACESSOS-OC-03a (Gabriel, 05/10/2026).
 *
 * `nivelDaTela` (`acessoTelas.ts`) responde "esta pessoa ABRE esta tela?". Dentro da OC a pergunta e' outra: "esta pessoa faz
 * ISTO?" — e a resposta mora AQUI, por `podeNaOperacao`, e so' aqui. Nenhum componente pergunta pelo perfil: o hospedeiro
 * (`LancamentosTab`) le' as capacidades uma vez (`useAcessoOperacao`) e as desce por prop aos shells e as abas.
 *
 * O MODELO: O COMBINADO x O QUE ACONTECEU.
 *   · A NEGOCIACAO (lote: categoria, quantidade, peso, preco; incluir e excluir lote) e' o COMBINADO.
 *   · A ENTREGA / O RECEBIMENTO e' o que ACONTECEU, e move rebanho.
 *   · Depois do primeiro movimento, o combinado fisico (quantidade, peso, categoria, lixeira, incluir lote) so' segue aberto
 *     para quem tem 'negociar_apos_movimento'; o preco segue aberto.
 * "HOUVE MOVIMENTO?" E' FATO DA OC, NAO CAPACIDADE: `ocTemGadoMovido`, lida do que a tela ja' tem carregado. O ponto de uso
 * combina as duas.
 *
 * ⚠ ACESSOS-FIN-01 (Gabriel, 06/10/2026) REVERTE A DECISAO DE 05/10 (ACESSOS-OC-03a): "O financeiro tem um acesso mais completo
 *   do sistema. O bloqueio maior tem que ser com o campo." O financeiro passou a REGISTRAR entrega e recebimento de gado
 *   ('movimentar_gado'), a alterar quantidade, peso, categoria e lotes depois do movimento ('negociar_apos_movimento') e a
 *   reabrir depois dele ('reabrir_apos_movimento'). Foram TRES celulas; o mecanismo (trava do fisico, Entrega em leitura,
 *   Reabrir apagado) continua no codigo e hoje nenhum perfil que abre a OC cai nele. Abate e boitel seguem fechados para ele.
 *
 * ⚠ E' O QUE A TELA OFERECE, NAO A TRAVA: a gravacao por perfil e' do banco (01F). `oc_salvar_lotes` manda o lote inteiro.
 * ⚠ ARQUIVO IRMAO de `acessoTelas.ts`, e nao dentro dele: aquele e' o dono de TELA (menu e rota) e ja' tem 130 linhas; este e' o
 *   dono de GESTO dentro de uma tela. A unica ponte e' a capacidade 'abrir', presa a `nivelDaTela` por teste.
 */
import type { PerfilCliente } from './acessoTelas';

export type CapacidadeOC =
  | 'abrir'
  | 'criar'
  | 'negociar_preco'
  | 'negociar_combinado'
  | 'negociar_apos_movimento'
  | 'negociar_abate_boitel'
  | 'movimentar_gado'
  | 'concluir_negociacao'
  | 'reabrir_apos_movimento'
  | 'lancar_realizado_boitel'
  | 'atualizar_entregas'
  | 'excluir_definitivo';

export const CAPACIDADES_OC_LISTA: readonly CapacidadeOC[] = [
  'abrir', 'criar', 'negociar_preco', 'negociar_combinado', 'negociar_apos_movimento', 'negociar_abate_boitel',
  'movimentar_gado', 'concluir_negociacao', 'reabrir_apos_movimento', 'lancar_realizado_boitel', 'atualizar_entregas',
  'excluir_definitivo',
];

const S = true;
const N = false;

/**
 * A TABELA, num lugar so'. Linha = capacidade; coluna = perfil. O admin do AGROinBLUE nao entra: ele pode tudo.
 * ⚠ CADA DECISAO E' UMA CELULA: mudar o que o financeiro pode e' trocar um `S`/`N` aqui, nunca um `if` na tela.
 * ⚠ 'negociar_abate_boitel' E' DO 03a: no abate e na venda em boitel a Negociacao INTEIRA fica so' leitura para o financeiro
 *   ate' o 03b abrir campo a campo (carcaca, dias, mortes, data do abate, "Lançar realizado do abate").
 * ⚠ 'excluir_definitivo' e' so' do admin: nenhum perfil de cliente a tem.
 */
export const CAPACIDADES_OC: Record<CapacidadeOC, Record<PerfilCliente, boolean>> = {
  abrir:                   { gestor_cliente: S, financeiro: S, campo: N, leitura: N },
  criar:                   { gestor_cliente: S, financeiro: S, campo: N, leitura: N },
  negociar_preco:          { gestor_cliente: S, financeiro: S, campo: N, leitura: N },
  negociar_combinado:      { gestor_cliente: S, financeiro: S, campo: N, leitura: N },
  negociar_apos_movimento: { gestor_cliente: S, financeiro: S, campo: N, leitura: N },
  negociar_abate_boitel:   { gestor_cliente: S, financeiro: N, campo: N, leitura: N },
  movimentar_gado:         { gestor_cliente: S, financeiro: S, campo: N, leitura: N },
  concluir_negociacao:     { gestor_cliente: S, financeiro: S, campo: N, leitura: N },
  reabrir_apos_movimento:  { gestor_cliente: S, financeiro: S, campo: N, leitura: N },
  lancar_realizado_boitel: { gestor_cliente: S, financeiro: N, campo: N, leitura: N },
  atualizar_entregas:      { gestor_cliente: S, financeiro: S, campo: N, leitura: N },
  excluir_definitivo:      { gestor_cliente: N, financeiro: N, campo: N, leitura: N },
};

function ehPerfilCliente(perfil: string): perfil is PerfilCliente {
  return perfil === 'gestor_cliente' || perfil === 'financeiro' || perfil === 'campo' || perfil === 'leitura';
}

/** A pessoa pode ISTO dentro da operacao comercial? Admin: tudo. Perfil desconhecido ou nulo: nada. */
export function podeNaOperacao(perfil: string | null | undefined, isAdmin: boolean, capacidade: CapacidadeOC): boolean {
  if (isAdmin) return true;
  if (!perfil || !ehPerfilCliente(perfil)) return false;
  return CAPACIDADES_OC[capacidade][perfil];
}

/** As capacidades que o hospedeiro desce aos shells, ja' resolvidas para a pessoa. */
export type AcessoOperacao = Record<CapacidadeOC, boolean>;

export function acessoDaPessoa(perfil: string | null | undefined, isAdmin: boolean): AcessoOperacao {
  const p = (c: CapacidadeOC) => podeNaOperacao(perfil, isAdmin, c);
  return {
    abrir: p('abrir'), criar: p('criar'), negociar_preco: p('negociar_preco'), negociar_combinado: p('negociar_combinado'),
    negociar_apos_movimento: p('negociar_apos_movimento'), negociar_abate_boitel: p('negociar_abate_boitel'),
    movimentar_gado: p('movimentar_gado'), concluir_negociacao: p('concluir_negociacao'),
    reabrir_apos_movimento: p('reabrir_apos_movimento'), lancar_realizado_boitel: p('lancar_realizado_boitel'),
    atualizar_entregas: p('atualizar_entregas'), excluir_definitivo: p('excluir_definitivo'),
  };
}

/** Tudo liberado: o que vale para quem nao recebe `acessoOC` (o admin, o gestor de antes, os testes dos shells). */
export const ACESSO_TOTAL: AcessoOperacao = {
  abrir: true, criar: true, negociar_preco: true, negociar_combinado: true, negociar_apos_movimento: true,
  negociar_abate_boitel: true, movimentar_gado: true, concluir_negociacao: true, reabrir_apos_movimento: true,
  lancar_realizado_boitel: true, atualizar_entregas: true, excluir_definitivo: true,
};

/**
 * HOUVE GADO MOVIDO NESTA OC? — o FATO, lido das movimentacoes que a tela ja' carregou (`useOperacaoRecebimento`). So' conta a
 * movimentacao VIVA: o estorno e' append-only e deixa a linha, cancelada.
 */
export function ocTemGadoMovido(movimentacoes: ReadonlyArray<{ cancelado?: boolean | null }> | null | undefined): boolean {
  return (movimentacoes ?? []).some((m) => m.cancelado !== true);
}

/** OS MOTIVOS, lista unica: o gesto que nao vale fica apagado com um destes escrito, nunca some.
 *  ⚠ Os tres primeiros dizem QUEM faz, e por isso mudaram com a tabela no ACESSOS-FIN-01: gestor OU financeiro. */
export const MOTIVO_GADO = 'Movimentação de gado: feita pelo gestor ou pelo financeiro.';
export const MOTIVO_APOS_MOVIMENTO = 'Gado já movimentado: quantidade, peso, categoria e lotes são alterados pelo gestor ou pelo financeiro. O preço segue editável.';
export const MOTIVO_REABRIR_APOS_MOVIMENTO = 'Gado já movimentado: a negociação é reaberta pelo gestor ou pelo financeiro.';
export const MOTIVO_ABATE_BOITEL = 'Abate e boitel: edição pelo financeiro chega na próxima etapa.';
export const MOTIVO_SEM_CAPACIDADE = 'Seu perfil não faz isto na operação comercial.';

/** A trava do combinado FISICO para esta pessoa nesta OC: o motivo, ou nulo quando ela pode. */
export function motivoFisicoTravado(acesso: AcessoOperacao, gadoMovido: boolean): string | null {
  if (!acesso.negociar_combinado) return MOTIVO_SEM_CAPACIDADE;
  if (gadoMovido && !acesso.negociar_apos_movimento) return MOTIVO_APOS_MOVIMENTO;
  return null;
}

/** Reabrir a negociacao: o motivo que apaga o gesto, ou nulo. */
export function motivoReabrirTravado(acesso: AcessoOperacao, gadoMovido: boolean): string | null {
  if (!acesso.concluir_negociacao) return MOTIVO_SEM_CAPACIDADE;
  if (gadoMovido && !acesso.reabrir_apos_movimento) return MOTIVO_REABRIR_APOS_MOVIMENTO;
  return null;
}
