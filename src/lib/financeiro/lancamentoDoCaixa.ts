/**
 * EDITAR-SO-MUDADOS-01 (Gabriel 29/10 09:1x) — o Editar aberto pelo CAIXA (`FinanceiroCaixaTab`) recebia um lançamento MONTADO À MÃO a partir da
 * linha da visão (`v2Like`): sem vencimento, tipo de documento, safra, cultura e chave do plano; conta destino e dados de pagamento nulos; a
 * competência trocada pela data de realização. O Salvar exigia redigitar o vencimento e gravava o resto vazio. Agora ele abre com a LINHA DO
 * BANCO, como as outras telas (`lerLancamentoDaLinha`: o "id#2" da parte abre o lançamento). Leitura que falha diz, nunca abre com buracos.
 * O lançamento que veio do rebanho segue para o modal soberano do zoo.
 */
import type { LancamentoV2 } from '@/hooks/useFinanceiroV2';

export type AberturaDoCaixa = { zoo: string } | { lancamento: LancamentoV2 } | { erro: string };
export const FRASE_NAO_ABRIU = 'Não consegui abrir este lançamento. Tente de novo.';

export async function lancamentoDoCaixaParaOEditar(
  linha: { id: string; movimentacao_rebanho_id?: string | null },
  ler: (idDaLinha: string) => Promise<LancamentoV2 | null>,
): Promise<AberturaDoCaixa> {
  if (linha.movimentacao_rebanho_id) return { zoo: linha.movimentacao_rebanho_id };
  try {
    const lancamento = await ler(linha.id);
    return lancamento ? { lancamento } : { erro: FRASE_NAO_ABRIU };
  } catch (e) {
    console.error('[Caixa] abrir no Editar', e);
    return { erro: FRASE_NAO_ABRIU };
  }
}
