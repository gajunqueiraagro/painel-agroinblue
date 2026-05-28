/**
 * buildExcelContext — monta o contexto read-only "Contexto Excel / Sugestão"
 * exibido no painel lateral do LancamentoV2Dialog quando aberto a partir da
 * Mesa Classificação Excel (criação ou edição).
 *
 * Função PURA — sem async, sem rede, sem store. Reusa resolverContaPorTexto
 * (helper soberano) para mapear o texto de conta do Excel ao nome do cadastro.
 * NÃO altera matcher/RPC/banco. Apenas formata dados já presentes na staging row.
 */
import { resolverContaPorTexto } from '@/v2/lib/mesa/resolverConta';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';

type ContaBancariaLike = {
  id?: string;
  nome_exibicao?: string | null;
  nome_conta?: string | null;
  codigo_conta?: string | null;
};

export interface ExcelContext {
  data: string | null;
  valor: number | null;
  tipo_operacao: string | null;
  fazenda_codigo: string | null;
  subcentro: string | null;
  fornecedor: string | null;
  produto: string | null;
  conta_origem: { sistemaNome: string | null; excelTexto: string | null };
  conta_destino: { sistemaNome: string | null; excelTexto: string | null };
  match_status: string | null;
  mensagemDivergencia?: string | null;
}

export function buildExcelContext(
  row: ClassificacaoStagingPreviewRow,
  contas: ContaBancariaLike[],
): ExcelContext {
  const resolve = (texto: string | null | undefined) => {
    const excelTexto = texto?.trim() || null;
    if (!excelTexto) return { sistemaNome: null, excelTexto: null };
    const r = resolverContaPorTexto(excelTexto, contas as never);
    return {
      sistemaNome: r?.nome_exibicao ?? null,
      excelTexto,
    };
  };

  let mensagemDivergencia: string | null = null;
  if (
    row.match_status === 'divergente' &&
    row.will_create_subcentro_orfao &&
    row.proposto_subcentro
  ) {
    mensagemDivergencia = `Subcentro "${row.proposto_subcentro}" fora do plano oficial`;
  }

  return {
    data: row.excel_data ?? null,
    valor: row.excel_valor ?? null,
    tipo_operacao: row.excel_tipo_operacao ?? null,
    fazenda_codigo: row.excel_fazenda_codigo ?? null,
    subcentro: row.excel_subcentro ?? row.proposto_subcentro ?? null,
    fornecedor: row.excel_fornecedor ?? null,
    produto: row.excel_produto ?? null,
    conta_origem: resolve(row.excel_conta_origem),
    conta_destino: resolve(row.excel_conta_destino),
    match_status: row.match_status ?? null,
    mensagemDivergencia,
  };
}
