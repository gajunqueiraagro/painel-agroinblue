/**
 * A transferência entre contas, num lugar só — PR-MESA-TRANSF-01.
 *
 * ⚠ O QUE ESTE MÓDULO EXISTE PARA IMPEDIR: duas telas discordando sobre o que é uma
 * transferência. O Financeiro (`LancamentoV2Dialog`) já exigia conta de destino e deixava o
 * plano livre; a Mesa nem tinha o campo. Uma transferência classificada em qualquer outra
 * conta do plano entra na DRE — que é exatamente o que ela não pode fazer.
 *
 * ⚠ A LINHA DO PLANO SE ACHA PELO `ordem_exibicao` 18010, e não pelo texto nem pelo id.
 * Pelo texto quebraria num acento corrigido ("Transferencia" × "Transferência"); pelo id
 * amarraria o front ao uuid de uma base. A ordem é o número que o plano usa para se
 * identificar, e é global (a linha tem `cliente_id` nulo).
 *
 * ⚠ A GRAFIA QUE SE GRAVA É SEMPRE O PLURAL, '3-Transferências'. O banco tem 593 linhas no
 * singular ('3-Transferência'), e elas são a frente [TIPO-TRANSFERENCIA-DUPLO] — fora deste
 * PR. Por isso `ehTipoTransferencia` LÊ as duas e `TIPO_TRANSFERENCIA` ESCREVE uma só:
 * reconhecer o legado não é perpetuá-lo.
 */
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';

export const TIPO_ENTRADA = '1-Entradas';
export const TIPO_SAIDA = '2-Saídas';
/** A grafia ÚNICA que qualquer tela grava. */
export const TIPO_TRANSFERENCIA = '3-Transferências';

/** Os três tipos, com o nome que o operador lê. Ordem do dropdown. */
export const TIPOS_OPERACAO_RESULTADO: ReadonlyArray<{ valor: string; rotulo: string }> = [
  { valor: TIPO_ENTRADA, rotulo: 'Entrada' },
  { valor: TIPO_SAIDA, rotulo: 'Saída' },
  { valor: TIPO_TRANSFERENCIA, rotulo: 'Transferência' },
];

/** A linha do plano que classifica uma transferência entre contas. */
export const ORDEM_PLANO_TRANSFERENCIA = 18010;

/**
 * É transferência? — lê as DUAS grafias.
 *
 * ⚠ NÃO USA `normalizarTipo` DE PROPÓSITO: aquele resolve três vocabulários (o do Excel, o
 * do lançamento e o sinal) para responder "entrada, saída ou transferência?" numa
 * comparação. Aqui a pergunta é sobre um `tipo_operacao` do contrato do lançamento, e a
 * resposta precisa ser a mesma do CASE que a `fn_classificacao_apply_row` usa para decidir
 * se o destino sobrevive — que é literalmente `IN ('3-Transferências','3-Transferência')`.
 */
export function ehTipoTransferencia(tipo: string | null | undefined): boolean {
  const t = (tipo ?? '').trim();
  return t === TIPO_TRANSFERENCIA || t === '3-Transferência';
}

/**
 * A linha 18010 do plano, ou `null` quando o catálogo ainda não chegou.
 *
 * ⚠ `null` NÃO TRAVA NADA: sem catálogo não há o que forçar, e forçar por suposição seria
 * gravar um subcentro adivinhado. Quem chama trata a ausência como "não força".
 */
export function planoDeTransferencia(
  classificacoes: readonly ClassificacaoItem[] | null | undefined,
): ClassificacaoItem | null {
  if (!classificacoes) return null;
  return classificacoes.find((c) => c.ordem_exibicao === ORDEM_PLANO_TRANSFERENCIA) ?? null;
}

/** O subcentro da 18010, para quem só precisa do texto que se grava. */
export function subcentroDeTransferencia(
  classificacoes: readonly ClassificacaoItem[] | null | undefined,
): string | null {
  return planoDeTransferencia(classificacoes)?.subcentro ?? null;
}
