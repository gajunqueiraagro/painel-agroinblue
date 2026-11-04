/**
 * CONC-SUGESTOES-TABELA-01 — o que a tabela do Financeiro mostra e as listas da Conciliação não traziam: o PAGAMENTO, a FAZENDA e o
 * DOCUMENTO (o nº da NF) de cada lançamento à vista nas "Sugestões para casar" e no "Procurar no histórico". Uma leitura só, pelos ids das
 * linhas, do cliente, e o código/nome das fazendas delas numa segunda (sem banco novo: as sugestões vêm da mesa da Conferência e o histórico da `fn_conciliacao_historico_buscar`).
 * ⚠ P146 — a leitura que FALHA não vira "sem documento": devolve `null` e a tabela mostra "-" (o mesmo da ausência na lista do Financeiro),
 *   com o erro no console; nada decide por ela (casar e criar seguem pelos seus caminhos).
 */
import { supabase } from '@/integrations/supabase/client';

export interface ComplementoDaLinha {
  dataPagamento: string | null;
  fazendaId: string | null;
  /** a coluna Faz. mostra o CÓDIGO (PUR, RET, ADM); o nome vai no `title` */
  fazendaCodigo: string | null;
  fazendaNome: string | null;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
}

const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);

export async function lerComplementoDasLinhas(clienteId: string, ids: readonly string[]): Promise<Map<string, ComplementoDaLinha> | null> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return new Map();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: a coluna `tipo_documento` não está no tipo gerado
    const { data, error } = await (supabase as any).from('financeiro_lancamentos_v2')
      .select('id, data_pagamento, fazenda_id, tipo_documento, numero_documento')
      .eq('cliente_id', clienteId).in('id', unicos);
    if (error || !Array.isArray(data)) { console.error('[complementoDasLinhas]', error); return null; }
    const idsDasFazendas = [...new Set(data.map((r) => texto(r?.fazenda_id)).filter((x): x is string => !!x))];
    const fazendas = new Map<string, { codigo: string | null; nome: string | null }>();
    if (idsDasFazendas.length) {
      const f = await supabase.from('fazendas').select('id, nome, codigo').eq('cliente_id', clienteId).in('id', idsDasFazendas);
      if (f.error) console.error('[complementoDasLinhas] fazendas', f.error);
      for (const x of f.data ?? []) fazendas.set(x.id, { codigo: texto(x.codigo), nome: texto(x.nome) });
    }
    const m = new Map<string, ComplementoDaLinha>();
    for (const r of data) {
      const id = texto(r?.id);
      if (!id) continue;
      const fazendaId = texto(r.fazenda_id);
      const f = fazendaId ? fazendas.get(fazendaId) : undefined;
      m.set(id, { dataPagamento: texto(r.data_pagamento), fazendaId, fazendaCodigo: f?.codigo ?? null, fazendaNome: f?.nome ?? null,
        tipoDocumento: texto(r.tipo_documento), numeroDocumento: texto(r.numero_documento) });
    }
    return m;
  } catch (e) { console.error('[complementoDasLinhas]', e); return null; }
}
