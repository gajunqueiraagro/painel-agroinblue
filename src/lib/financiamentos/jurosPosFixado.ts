/**
 * JUROS ESTIMADOS DE CONTRATO POS-FIXADO — FIN-POS-FIXADO-01a (Gabriel, 20/10/2026). Puro.
 *
 * ESPELHO DECLARADO de `_fn_juros_estimado` (banco, migration 20261027204500), preso pelos MESMOS casos
 * (`jurosPosFixado.casos.json`, que o teste SQL repete): juros estimados = contrato `tipo_taxa = 'pos'` + parcela nao paga e nao
 * cancelada + lancamento de juros nao realizado nem conciliado. O principal nunca e' estimado. Quem decide na tela e' o BANCO
 * (`fn_juros_estimados_do_cliente`); este espelho existe para a regra estar escrita e testada dos dois lados.
 * ⚠ `ajustada` NAO ENTRA: no banco ela significa "editada a mao, protegida no Regerar", nao "valor real informado".
 */
export interface JurosDaParcela {
  tipoTaxa: string | null;
  statusParcela: string | null;
  statusLancamento: string | null;
}

export function jurosEstimadoPosFixado(j: JurosDaParcela): boolean {
  return (j.tipoTaxa ?? '') === 'pos'
    && !['pago', 'cancelado'].includes(j.statusParcela ?? '')
    && !['realizado', 'conciliado'].includes(j.statusLancamento ?? '');
}

/** Os ids que `fn_juros_estimados_do_cliente` devolveu. Peca torta = nulo (a leitura inteira nao vale). */
export function lerJurosEstimados(dado: unknown): Set<string> | null {
  if (!Array.isArray(dado)) return null;
  const ids = new Set<string>();
  for (const linha of dado) {
    const id: unknown = linha != null && typeof linha === 'object' ? Reflect.get(linha, 'lancamento_id') : null;
    if (typeof id !== 'string' || id === '') return null;
    ids.add(id);
  }
  return ids;
}
