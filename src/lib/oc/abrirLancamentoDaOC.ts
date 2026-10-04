/**
 * ABRIR O LANCAMENTO DE UMA OC NO MODAL DO FINANCEIRO, DEIXANDO O ENDERECO DE VOLTA — OC-CC-ACOES-LINHA-02.
 *
 * ⚠ UM DONO SO': era o corpo do `editarTitulo` do `AbaCompromissosOC`, que so' existe montado na sub-aba Despesas. O extrato da
 *   conta corrente (outra sub-aba, outro componente) precisava do MESMO caminho — e uma segunda funcao de abrir divergiria na
 *   primeira mudanca. O corpo veio de la' linha a linha (so' a indentacao e as tres entradas, que viraram parametros).
 * ⚠ A SUB-ABA DE VOLTA E' A QUE ESTA' NA URL (`oc_sub`): na Conta corrente ela nao existe, `returnOcSub` e' apagado e a volta abre
 *   no extrato; nas Despesas ela e' 'despesas' e a volta abre la'.
 */

export interface AberturaDeLancamentoDaOC {
  tituloId: string;
  /** A operacao para onde voltar. Sem ela nao ha' retorno prometido. */
  ocId: string | null;
  tipoOperacao: string | null | undefined;
}

// Editar o título vinculado à parcela materializada: reutiliza o modal oficial do Financeiro V2
// via o fluxo existente ?flancId={tituloId} (V2Index consome, troca de seção e abre o modal com a
// proteção OC — valor/classificação/favorecido/vencimento seguem travados). Sem modal/RPC/writer novo.
/* ⚠ ESTA IDA APAGA `oc_compra` e `oc_id` — e' a identidade da OC morrendo aqui, nao no
   fechamento do modal. Sem deixar endereco, o Editar era o unico drill da base que saia
   sem dizer de onde veio: salvar, X ou clicar fora largavam o usuario no Financeiro e
   ele refazia o caminho inteiro para reabrir a operacao.
   `returnOcId` e' o espelho de `returnZooId` (PR-B1-R2): mesmo gesto, mesmo useEffect
   do outro lado, mesmo estado `drillReturn`. Nao inventa convencao nova — usa a que ja
   existia e que so a OC nao usava.

   ⚠ O ENDERECO PRECISA DO TIPO — PR-OC-VENDA-FIN-PREVISAO-01D. `returnOcId` dizia QUAL
   operacao reabrir e nao dizia QUE TIPO ela e'; do outro lado, `abrirOperacaoOC` tem
   `tipo` com default 'compra'. O retorno de uma VENDA voltava como `oc_compra=1`, a
   hidratacao do LancamentosTab recusava ("Esta operação não é uma Compra e não pode ser
   aberta aqui"), limpava os parametros e largava o usuario em Lancamentos sem modal.
   Um id sem tipo e' meio endereco.
   ⚠ E APAGA `oc_venda` TAMBEM. So' `oc_compra` era apagado, entao numa venda o
   parametro sobrevivia a ida ao Financeiro. E' a mesma armadilha do parametro preso que
   PR-OC-VENDA-REABRIR-01D ja pagou uma vez: `oc_venda=1` esquecido na URL reabre a
   operacao sozinho quando a secao volta a ser Lancamentos por outro caminho. */
export function paramsAbrirLancamentoDaOC(searchParams: URLSearchParams, { tituloId, ocId, tipoOperacao }: AberturaDeLancamentoDaOC): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.set('flancId', tituloId);
  next.set('ocfin', '1');   // PR-OC-FIN-EDIT-FIX-02 — contexto OC: libera edição de favorecido no título
  // Sem id nao ha para onde voltar: melhor nao prometer retorno do que prometer errado.
  if (ocId) {
    next.set('returnOcId', ocId);
    /* ⚠ TRES TIPOS. O abate voltava marcado como compra e a hidratacao o recusava —
       mesmo defeito que a venda pagou em PR-OC-VENDA-FIN-PREVISAO-01D. */
    next.set('returnOcTipo',
      tipoOperacao === 'venda' ? 'venda' : tipoOperacao === 'abate' ? 'abate' : 'compra');
    /* OC-VENDA-FINANCEIRO-COMPLETO-01a-fix2 — a sub-aba aberta (conta corrente) volta junto; sem ela, apaga. */
    const sub = searchParams.get('oc_sub');
    if (sub) next.set('returnOcSub', sub); else next.delete('returnOcSub');
  } else {
    next.delete('returnOcId');
    next.delete('returnOcTipo');
    next.delete('returnOcSub');
  }
  /* ⚠ OS TRES PARAMETROS MORREM AQUI. `oc_abate` entrou junto: um parametro esquecido
     reabre a operacao sozinho quando a secao volta a ser Lancamentos por outro caminho —
     a armadilha que PR-OC-VENDA-REABRIR-01D ja pagou uma vez. */
  next.delete('oc_compra');
  next.delete('oc_venda');
  next.delete('oc_abate');
  next.delete('oc_id');
  next.delete('oc_sub');
  return next;
}
