/**
 * AS CELULAS DO LANCAMENTO DIVIDIDO NA LISTA — FIN-CLASSIF-DIVIDIDA-01c (mock aprovado 22/10, vista 3). Sem coluna nova:
 *   · Classificacao: o texto corta, o selo fica — "1 de 2 contas" quando o filtro pega parte; "dividido" quando pega o lancamento inteiro;
 *   · Valor: com o filtro pegando parte, a PARTE (o que entra no total do filtro) e, embaixo, "de R$ <o lancamento>" a 7px; a linha segue
 *     com 19px. Quem decide o que casa e' o banco (`fn_fin_v2_lista_pagina`); aqui so' se le^ (`valorDividido`).
 */
import type { ReactNode } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { ValorDividido } from '@/lib/financeiro/divisaoDaClassificacao';

export function ClassificacaoComSelo({ texto, dividida }: { texto: ReactNode; dividida: ValorDividido }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate">{texto}</span>
      <span className="selo-divisao shrink-0 rounded-full bg-sky-100 px-1 text-sky-800" data-testid="selo-divisao"
        title={dividida.parte != null ? `Esta linha mostra ${dividida.casadas} das ${dividida.partes} contas do lançamento` : `Classificação dividida em ${dividida.partes} contas`}>
        {dividida.parte != null ? `${dividida.casadas} de ${dividida.partes} contas` : 'dividido'}
      </span>
    </span>
  );
}

/** `textoDaParte`: o valor da parte JA' com o sinal e o formato da linha (o mesmo `formatarValorLinha` da lista). */
export function ValorDaParte({ textoDaParte, total }: { textoDaParte: string; total: number }) {
  return (
    <span className="inline-flex flex-col items-end leading-none">
      <span className="leading-none" data-testid="valor-da-parte">{textoDaParte}</span>
      <span className="valor-de-total font-normal text-muted-foreground" data-testid="valor-de-total">de {formatMoeda(total)}</span>
    </span>
  );
}
