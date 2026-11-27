/**
 * NOTA-ITENS-SUGESTAO (Gabriel 27/11, mock aprovado 10:47) — a resposta da escada única (`fn_itens_sugerir_conta`) → o que a proposta da
 * nota leva ao modal: a CLASSIFICAÇÃO de partida (uma conta = ela; várias = a de MAIOR valor, Q2; nenhum item = o último deste fornecedor),
 * o rótulo curto do campo e a frase da faixa (a origem, ou o aviso pequeno "N itens em X classificações"). PURO.
 */
import type { SugestaoNaProposta, UltimaClassificacao } from './proporLancamento';
import { fraseDaFaixa, resumoDaSugestao, type ItemSugerido, type SugestaoDoFornecedor } from './sugestaoDosItens';
import { dataCurta } from './formatos';

export type SugestaoParaAProposta = SugestaoNaProposta & { classificacao: UltimaClassificacao | null; origem: string | null };

export function sugestaoParaAProposta(
  resposta: { itens: ItemSugerido[]; fornecedor: SugestaoDoFornecedor | null } | { falha: string },
  itensDaNota: readonly { nItem: number; descricao: string; liquidoCent: number }[],
  emissao: string,
): SugestaoParaAProposta {
  if ('falha' in resposta) {
    return { itens: [], frase: 'Não consegui verificar a sugestão da classificação: escolha a conta', varias: false, porque: resposta.falha, classificacao: null, origem: null };
  }
  const valor = new Map(itensDaNota.map((i) => [i.nItem, i.liquidoCent]));
  const descricao = new Map(itensDaNota.map((i) => [i.nItem, i.descricao]));
  const r = resumoDaSugestao(resposta.itens, valor, descricao);
  const conta = (planoContaId: string, subcentro: string): UltimaClassificacao => ({
    plano_conta_id: planoContaId, subcentro, macro_custo: null, grupo_custo: null, centro_custo: null, escopo_negocio: null, data: emissao,
  });
  const porque = resposta.itens.filter((i) => i.origem).map((i) => `${i.nItem}: ${i.origem}`).join(' · ');
  if (r.tipo === 'uma') {
    return { itens: resposta.itens, frase: fraseDaFaixa(r, resposta.fornecedor, dataCurta), varias: false, porque: porque || r.subcentro,
      classificacao: conta(r.planoContaId, r.subcentro), origem: r.peloFornecedor ? 'último deste fornecedor' : 'pelos itens' };
  }
  if (r.tipo === 'varias') {
    return { itens: resposta.itens, frase: fraseDaFaixa(r, resposta.fornecedor, dataCurta), varias: true,
      porque: `Cada item tem a sua conta sugerida (${porque}). Em Itens da nota › Contas: use a divisão (1 lançamento com partes) ou junte tudo numa conta.`,
      classificacao: r.maior ? conta(r.maior.planoContaId, r.maior.subcentro) : null, origem: 'pelos itens' };
  }
  /* nenhum item sugere (ou a nota não tem itens): o último deste fornecedor, se houver */
  const f = resposta.fornecedor;
  if (!f) return { itens: resposta.itens, frase: null, varias: false, porque: '', classificacao: null, origem: null };
  return { itens: resposta.itens, frase: `Classificação sugerida: ${f.subcentro} · último deste fornecedor${f.ultimo ? ` (${dataCurta(f.ultimo)})` : ''}`,
    varias: false, porque: 'A conta mais usada deste fornecedor nos 12 meses até o último lançamento.',
    classificacao: conta(f.planoContaId, f.subcentro), origem: 'último deste fornecedor' };
}
