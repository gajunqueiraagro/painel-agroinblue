/**
 * OS LANCAMENTOS QUE SAO TITULO DE UMA OC — VINCULAR-FIX-01, item 4 (o "bife laranja" da lista).
 *
 * ⚠ O CRITERIO E' A PARTE VIVA, NAO A ORIGEM. A lista do Financeiro V2 pintava o icone por
 * `origem_lancamento = 'operacao_comercial'`, e um lancamento VINCULADO a uma OC (importado ou manual,
 * VINCULAR-LANC-OC-01) ficava sem ele — medido em 25/09/2026: 5 lancamentos da Vera. E o desvinculado
 * (OC-DESVINCULAR-01) muda a origem para 'manual', mas quem decide e' a parte: `zoo_operacao_partes`
 * com `cancelada = false`, o mesmo criterio da trava de cancelamento (FIN-V2-CANCEL-MOTIVO-01).
 *
 * ⚠ UMA CONSULTA POR CLIENTE, NUM MAPA — o molde de `useLancamentosConciliados`: sao ~160 partes vivas
 * no proto inteiro (Agnaldo 62, o maior), e a lista carrega tudo e pagina no cliente. `IN (ids)` com
 * trinta mil ids seria a mesma resposta por um caminho absurdo.
 *
 * ⚠ RELE QUANDO OS LANCAMENTOS MUDAM (`inscreverEmLancamentos`): o vincular e o desvincular gravam por
 * fora do hook da lista e notificam — e' isso que faz o icone aparecer e sumir sem F5.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';

export interface OCDoLancamento {
  operacaoId: string;
  /** 'compra' | 'venda' | 'abate' — o parametro que reabre a OC. */
  tipo: string | null;
  /** Venda em boitel (tem linha em `zoo_operacao_boitel`). */
  ehBoitel: boolean;
  /** OC-CC-CLASSIFICACAO-01: recebimento/pagamento (ou devolucao) de OC conta corrente — fica no subcentro da operacao e FORA
   *  do DRE pela parte; a receita/custo entrou pela entrega. */
  foraDoDre: boolean;
}

/**
 * OC-CC-CLASSIFICACAO-01 — ESPELHO de `_oc_cc_fora_do_dre` (migration 20261027173000), que e' quem grava `compoe_dre = false`
 * pelo gatilho. Aqui so' decide o texto do tooltip; o teste le' a migration e compara as duas regras.
 * ⚠ SEM O MODELO DA OC, E E' EQUIVALENTE POR CONSTRUCAO: parte 'recebimento' e explicacao de devolucao so' nascem em OC conta
 *   corrente (`_oc_vincular_recebimento`, `oc_programar_recebimento` e `oc_explicar_saldo` recusam outro modelo). E o tipo gerado
 *   ainda nao conhece `modelo_financeiro` — le-lo aqui pediria um cast.
 */
export function parteForaDoDre(p: { componente: string | null; origem: string | null }): boolean {
  if (p.componente === 'recebimento') return p.origem !== 'explicacao' && p.origem !== 'entrega';
  return p.componente === 'devolucao_comprador' && p.origem === 'explicacao';
}

const ROTULO_TIPO: Record<string, string> = { compra: 'Compra', venda: 'Venda', abate: 'Abate' };

/** O tooltip do icone, pelo tipo da OC: "Origem: Operação Comercial de Venda" — ou de Boitel. O recebimento/pagamento da
 *  conta corrente ganha "· fora do DRE · OC <codigo>" (decisao 6: sem coluna nova; o codigo e' o de `codigoOC`, 8 caracteres). */
export function rotuloOrigemOC(oc: Pick<OCDoLancamento, 'tipo' | 'ehBoitel'> & Partial<Pick<OCDoLancamento, 'foraDoDre' | 'operacaoId'>>): string {
  const tipo = oc.ehBoitel ? 'Boitel' : (oc.tipo ? ROTULO_TIPO[oc.tipo] ?? oc.tipo : null);
  const base = tipo ? `Origem: Operação Comercial de ${tipo}` : 'Origem: Operação Comercial';
  return oc.foraDoDre && oc.operacaoId ? `${base} · fora do DRE · OC ${oc.operacaoId.slice(0, 8)}` : base;
}

export function useLancamentosComOC(clienteId: string | null) {
  const [mapa, setMapa] = useState<ReadonlyMap<string, OCDoLancamento>>(new Map());
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => setVersao(v => v + 1));
  }, [clienteId]);

  useEffect(() => {
    let cancelado = false;
    if (!clienteId) { setMapa(new Map()); return; }
    (async () => {
      const PAGE = 1000;
      const m = new Map<string, OCDoLancamento>();
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('zoo_operacao_partes')
          .select('financeiro_lancamento_id, operacao_id, componente, origem, zoo_operacoes_comerciais(tipo_operacao)')
          .eq('cliente_id', clienteId)
          .eq('cancelada', false)
          .not('financeiro_lancamento_id', 'is', null)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) { console.error('[useLancamentosComOC]', error); return; }
        const rows = data ?? [];
        for (const r of rows) {
          if (!r.financeiro_lancamento_id) continue;
          const op = r.zoo_operacoes_comerciais;
          m.set(r.financeiro_lancamento_id, {
            operacaoId: r.operacao_id,
            tipo: op && typeof op.tipo_operacao === 'string' ? op.tipo_operacao : null,
            ehBoitel: false,
            foraDoDre: parteForaDoDre({ componente: r.componente ?? null, origem: r.origem ?? null }),
          });
        }
        if (rows.length < PAGE) break;
      }
      /* Boitel: as OCs ja' achadas que tem linha de boitel. Poucas dezenas de ids — o lado pequeno. */
      const ops = [...new Set([...m.values()].map(o => o.operacaoId))];
      if (ops.length > 0) {
        const { data: bt, error } = await supabase
          .from('zoo_operacao_boitel')
          .select('operacao_id')
          .in('operacao_id', ops);
        if (error) console.error('[useLancamentosComOC] boitel', error);
        const comBoitel = new Set((bt ?? []).map(b => b.operacao_id));
        for (const [id, o] of m) if (comBoitel.has(o.operacaoId)) m.set(id, { ...o, ehBoitel: true });
      }
      if (!cancelado) setMapa(m);
    })();
    return () => { cancelado = true; };
  }, [clienteId, versao]);

  return mapa;
}
