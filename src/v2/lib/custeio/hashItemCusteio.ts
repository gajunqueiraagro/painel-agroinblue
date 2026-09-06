/**
 * Hash determinístico de um ITEM do relatório de custeio — CUSTEIO-TXT-02, item 4.
 *
 * Componentes (concatenados com '|', na ordem):
 *   cliente_id + competência (YYYY-MM) + valor (2 casas) + descrição normalizada
 *
 * ⚠ MESMO ALGORITMO E MESMA NORMALIZAÇÃO DO `extratoHash`, de propósito: SHA-256 pela Web
 * Crypto, NFD sem diacríticos, espaços colapsados, UPPERCASE. O relatório vem em cp1252 e
 * o mesmo item pode chegar com o acento ora presente ora quebrado; sem normalizar, "ÓLEO
 * DIESEL" e "OLEO DIESEL" seriam dois itens diferentes e o mês seguinte proporia de novo o
 * que já foi lançado.
 * ⚠ A COMPETÊNCIA ENTRA, E É O QUE TORNA O HASH ÚTIL: o mesmo "Óleo Diesel · 3.200,00"
 * acontece todo mês, e deve ser proposto todo mês. Sem ela, lançar em abril calaria maio.
 * ⚠ O CLIENTE ENTRA PORQUE A CONSULTA É POR HASH: dois clientes com a mesma despesa no
 * mesmo mês colidiriam, e um veria o lançamento do outro como "já lançado".
 * ⚠ O QUE NÃO ENTRA: família e sub-família. Elas são a classificação, e classificação
 * muda — reclassificar um item não pode fazê-lo voltar a ser proposto como se fosse novo.
 *
 * Grava em `financeiro_lancamentos_v2.hash_importacao`, que já é a coluna dessa pergunta
 * (73.582 de 82.625 lançamentos a usam, com dois índices próprios).
 */

function normalizarTexto(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export interface HashItemCusteioInput {
  clienteId: string;
  /** 'YYYY-MM' — a competência do relatório, não a data de lançamento. */
  competencia: string;
  valor: number;
  descricao: string | null | undefined;
}

export async function hashItemCusteio(input: HashItemCusteioInput): Promise<string> {
  const partes = [
    input.clienteId,
    input.competencia,
    input.valor.toFixed(2),
    normalizarTexto(input.descricao),
  ].join('|');

  const buffer = new TextEncoder().encode(partes);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
