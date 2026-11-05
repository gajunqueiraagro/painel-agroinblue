/**
 * FIN-FILTRO-FILIAIS-01 (Gabriel 04/11/2026) — o filtro de fornecedor de Lançamentos com "+ filiais (N)": o cadastro escolhido e os
 * outros cadastros do MESMO cliente com a mesma raiz de 8 dígitos do CNPJ (`raizDoCnpj`, a regra do FORN-FILIAL-01). Inativos entram (o
 * histórico deles é o que se procura); mesclado nunca (o destino dele já é um dos cadastros). CPF e sem CNPJ não têm filial: só ele.
 * A REGRA ÚNICA do conjunto — a tela manda o resultado ao banco (`fornecedor_ids`) e confere a seção sem caixa com ele.
 */
import { raizDoCnpj } from '@/lib/financeiro/nfe/resolverEmitente';

export interface CadastroComCnpj {
  readonly id: string;
  readonly cpf_cnpj: string | null;
  readonly fundido_em_id?: string | null;
}

/** O escolhido primeiro, depois as filiais (na ordem do cadastro). Escolhido fora da lista = só ele. */
export function filiaisDoFornecedor(cadastros: readonly CadastroComCnpj[], escolhido: string): string[] {
  const ele = cadastros.find((c) => c.id === escolhido);
  const raiz = raizDoCnpj(ele?.cpf_cnpj);
  if (!ele || !raiz) return [escolhido];
  const outras = cadastros.filter((c) => c.id !== escolhido && !c.fundido_em_id && raizDoCnpj(c.cpf_cnpj) === raiz).map((c) => c.id);
  return [escolhido, ...outras];
}
