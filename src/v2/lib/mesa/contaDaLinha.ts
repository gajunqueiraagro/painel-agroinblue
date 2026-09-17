/**
 * A CONTA BANCÁRIA DE UMA LINHA DA MESA — PR-MESA-CONTA-ENTRADA-01.
 *
 * ⚠ DUAS REGRAS QUE ESTAVAM ESPALHADAS, agora num lugar só: QUAL das duas colunas do Excel é a
 * conta, e EM QUAL coluna do lançamento ela se grava. As duas erravam de formas diferentes e a
 * soma das duas apagou vinte entradas conciliadas em 16/09/2026.
 *
 * ⚠ A PLANILHA TEM ORIGEM E DESTINO, E SÓ UMA DELAS É CONTA. Numa saída o dinheiro sai do banco
 * (origem) e vai para o fornecedor (destino, que não é conta); numa ENTRADA é o contrário — o
 * banco está na ORIGEM e o destino é "terceiros | . .". A Mesa lia só `excel_conta_destino`, então
 * para toda entrada ela não encontrava conta nenhuma. Medido: 2.438 linhas do Santa Rita com
 * destino "terceiros | . .", que não é conta de ninguém.
 * ⚠ QUEM DECIDE É O RESOLVEDOR, NÃO A POSIÇÃO: a coluna que resolve para uma conta do cliente é a
 * conta; a outra é o terceiro. Isso dispensa saber se a linha é entrada ou saída para achar a
 * conta — e é por isso que funciona nas duas.
 * ⚠ AS DUAS RESOLVENDO É TRANSFERÊNCIA, por construção: dinheiro que sai de uma conta do cliente e
 * entra em outra conta do cliente é exatamente isso.
 *
 * ⚠ E A ENTRADA GUARDA A CONTA EM `conta_destino_id`, não em `conta_bancaria_id` — 1.392 entradas
 * deste cliente têm `conta_bancaria_id` NULO. `contaEfetivaId` já sabia disso na LEITURA
 * (`enriquecimentoView`); a gravação não sabia, e escrevia sempre em `conta_bancaria_id`. A conta
 * ia para a coluna que ninguém lê, e a coluna que todos leem ficava como estava.
 */
import { resolverContaPorTexto, type ContaResolvivel } from '@/v2/lib/mesa/resolverConta';
import { ehTipoTransferencia } from '@/v2/lib/mesa/transferenciaPlano';

/** O que as duas colunas do Excel dizem sobre a conta desta linha. */
export interface ContaDaLinha {
  /**
   * A conta da linha, quando UMA das colunas resolve.
   *
   * ⚠ `null` NUMA TRANSFERÊNCIA, de propósito: ali não há "a conta", há duas. Quem quiser o par
   * lê `origemId`/`destinoId`.
   */
  contaId: string | null;
  /** As duas pontas, preenchidas só quando as duas colunas resolvem. */
  origemId: string | null;
  destinoId: string | null;
  ehTransferencia: boolean;
  /**
   * O texto que o Excel trouxe e ninguém reconheceu — §2c.
   *
   * ⚠ `null` QUANDO RESOLVEU, e também quando não havia texto nenhum: "não reconhecida" é sobre um
   * texto que EXISTE e não casa. Sem texto não há o que avisar, e o campo fica vazio como antes.
   * ⚠ ELE EXISTE PORQUE O VAZIO SILENCIOSO ESCONDEU O DEFEITO: a coluna Resultado mostrava "—" e o
   * operador salvava por cima. As 95 linhas "cc-001 | bradesco pecuária" — apelido que mudou de
   * conta em 15/09 e a planilha não acompanhou — caem exatamente aqui.
   */
  textoNaoReconhecido: string | null;
}

/**
 * ⚠ ORIGEM PRIMEIRO NO AVISO, e não é arbitrário: é a coluna onde este cliente põe o banco nas
 * entradas, que é o caso que motivou o PR. Com as duas sem resolver, a de origem é a que o
 * operador reconhece como "a conta que eu quis dizer".
 */
export function contaDaLinha(
  excelOrigem: string | null | undefined,
  excelDestino: string | null | undefined,
  contas: readonly ContaResolvivel[],
): ContaDaLinha {
  const origem = resolverContaPorTexto(excelOrigem, contas)?.id ?? null;
  const destino = resolverContaPorTexto(excelDestino, contas)?.id ?? null;

  if (origem && destino) {
    return {
      contaId: null, origemId: origem, destinoId: destino,
      ehTransferencia: true, textoNaoReconhecido: null,
    };
  }
  if (origem || destino) {
    return {
      contaId: origem ?? destino, origemId: null, destinoId: null,
      ehTransferencia: false, textoNaoReconhecido: null,
    };
  }
  const texto = (excelOrigem ?? '').trim() || (excelDestino ?? '').trim();
  return {
    contaId: null, origemId: null, destinoId: null,
    ehTransferencia: false,
    textoNaoReconhecido: texto || null,
  };
}

/**
 * ONDE A CONTA SE GRAVA — o patch de `update_proposto` para o campo "Banco" do Resultado.
 *
 * ⚠ VAZIO NÃO ESCREVE NADA, e esta é a linha que faltava. O editor mandava `conta_bancaria_id:
 * id || null`, então um Resultado vazio propunha APAGAR. Vazio é "não tenho proposta", nunca
 * "apague o que está lá" — e a diferença entre as duas leituras foi o que deixou o operador
 * apagar vinte contas sem perceber que apagava.
 * ⚠ E POR ISSO ESTE CAMPO NÃO LIMPA CONTA. Quem quiser tirar a conta de um lançamento faz no
 * lançamento; a Mesa propõe, e proposta vazia é silêncio.
 */
export function patchDaConta(
  tipoEfetivo: string | null | undefined,
  contaId: string | null | undefined,
): Record<string, unknown> {
  const id = (contaId ?? '').trim();
  if (!id) return {};
  /* ⚠ TRANSFERÊNCIA MANTÉM O DE HOJE: neste campo ela é a ORIGEM, e o destino tem campo próprio
     (`ResultadoContaDestinoEditor`). Mexer aqui mudaria um fluxo que funciona. */
  if (ehTipoTransferencia(tipoEfetivo)) return { conta_bancaria_id: id };
  /* ⚠ A ENTRADA GRAVA NO DESTINO — ver o cabeçalho do arquivo. */
  if (tipoEfetivo === '1-Entradas') return { conta_destino_id: id };
  return { conta_bancaria_id: id };
}
