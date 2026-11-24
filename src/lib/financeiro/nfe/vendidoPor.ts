/**
 * DA-NOTA-CLASSIF-01 (4) (Gabriel 24/11 09:17, NF da Kelfer casada com o lançamento "Mercado Livre") — o MARKETPLACE: o fornecedor do lançamento
 * (quem cobrou: Mercado Livre, o cartão) não é o emitente da nota (quem vendeu). A tela DIZ "vendido por <emitente>" e NUNCA troca o fornecedor
 * do lançamento (trocar é só marcando, `fn_lancamentos_trocar_favorecido`). PURO.
 */
import { soDigitos } from '@/lib/financeiro/nfe/formatos';

export interface CadastroMinimo { id: string; cpf_cnpj?: string | null }

/**
 * O fornecedor do lançamento é OUTRO que o emitente? Não é quando: é o mesmo cadastro que a nota achou para o emitente, ou o documento dele é o
 * da nota. Sem fornecedor no lançamento = não diz nada (a etapa 2 preenche). Cadastro fora da lista e sem id igual = outro.
 */
export function fornecedorNaoEOEmitente(fornecedorDoLancamentoId: string | null | undefined, cadastroDoEmitenteId: string | null | undefined,
  documentoDoEmitente: string | null | undefined, cadastros: readonly CadastroMinimo[]): boolean {
  if (!fornecedorDoLancamentoId) return false;
  if (cadastroDoEmitenteId && fornecedorDoLancamentoId === cadastroDoEmitenteId) return false;
  const doc = soDigitos(cadastros.find((c) => c.id === fornecedorDoLancamentoId)?.cpf_cnpj ?? '');
  const daNota = soDigitos(documentoDoEmitente ?? '');
  return !(doc !== '' && doc === daNota);
}
