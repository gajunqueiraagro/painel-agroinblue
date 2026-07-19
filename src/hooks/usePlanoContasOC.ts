import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Contrato reutilizado do Financeiro V2 (financeiro_plano_contas). NÃO recriar
// carga/cascata/mapeamento — apenas consumir o mesmo conjunto, com o filtro tenant
// mandado (G6): ativo=true AND (cliente_id IS NULL OR = clienteAtual).
// tipo_operacao do plano usa '1-Entradas'/'2-Saídas'/'3-Transferências' (não o enum zoo).
export interface ClassificacaoItem {
  id: string;
  cliente_id: string | null;
  tipo_operacao: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
  escopo_negocio: string | null;
  ordem_exibicao: number | null;
}

// Mapa operação-comercial → tipo_operacao do plano, espelhando os painéis existentes
// (Compra: '2-Saídas'; Venda/Abate: receita '1-Entradas', dedução '2-Saídas'). Não é
// inferência nova — é a mesma convenção usada por CompraFinanceiroPanel/VendaFinanceiroPanel/
// AbateFinanceiroPanel e pelo próprio motor (oc_sincronizar).
export function planoTipoOperacao(
  tipoOC: 'compra' | 'venda' | 'abate',
  natureza: 'principal' | 'deducao' | 'acrescimo',
): string {
  const baseEntrada = tipoOC === 'venda' || tipoOC === 'abate';
  const entrada = natureza === 'deducao' ? !baseEntrada : baseEntrada;
  return entrada ? '1-Entradas' : '2-Saídas';
}

export type ResolucaoPlano =
  | { status: 'none' }
  | { status: 'ok'; item: ClassificacaoItem }
  | { status: 'ambiguous'; count: number };

const uniqSorted = (rows: ClassificacaoItem[], pick: (r: ClassificacaoItem) => string | null) =>
  Array.from(new Set(rows.map(pick).filter((v): v is string => !!v))).sort();

export function usePlanoContasOC(clienteId: string | undefined) {
  const [rows, setRows] = useState<ClassificacaoItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clienteId) { setRows([]); return; }
    let cancelled = false;
    setLoading(true);
    // (supabase as any) — mesmo idioma do .rpc; evita atrito de nulabilidade dos tipos gerados.
    (supabase as any)
      .from('financeiro_plano_contas')
      .select('id, cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ordem_exibicao')
      .eq('ativo', true)
      .or(`cliente_id.is.null,cliente_id.eq.${clienteId}`)
      .order('ordem_exibicao', { ascending: true })
      .then(({ data, error }: { data: ClassificacaoItem[] | null; error: unknown }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) { setRows([]); return; }
        setRows(data ?? []);
      });
    return () => { cancelled = true; };
  }, [clienteId]);

  // Cascata dependente por tipo_operacao (mesma lógica do FinanceiroV2Tab).
  const cascata = useMemo(() => {
    const porTipo = (tipo: string) => rows.filter(r => r.tipo_operacao === tipo);
    return {
      macros: (tipo: string) => uniqSorted(porTipo(tipo), r => r.macro_custo),
      grupos: (tipo: string, macro: string) =>
        uniqSorted(porTipo(tipo).filter(r => r.macro_custo === macro), r => r.grupo_custo),
      centros: (tipo: string, macro: string, grupo: string) =>
        uniqSorted(porTipo(tipo).filter(r => r.macro_custo === macro && r.grupo_custo === grupo), r => r.centro_custo),
      subcentros: (tipo: string, macro: string, grupo: string, centro: string) =>
        uniqSorted(
          porTipo(tipo).filter(r => r.macro_custo === macro && r.grupo_custo === grupo && r.centro_custo === centro),
          r => r.subcentro,
        ),
    };
  }, [rows]);

  // Resolução do plano_conta_id pela HIERARQUIA COMPLETA selecionada na cascata
  // (tipo_operacao + macro + grupo + centro + subcentro), não por chave parcial.
  // NÃO escolhe arbitrariamente e NÃO assume unicidade:
  //   0 linhas  -> 'none'      (campo não vinculado, estado honesto);
  //   1 linha   -> 'ok'        (uma linha real, inequívoca);
  //   >1 linhas -> 'ambiguous' (bloqueia a vinculação e reporta ambiguidade).
  const resolvePlanoConta = (
    tipo: string, macro: string | null, grupo: string | null, centro: string | null, subcentro: string | null,
  ): ResolucaoPlano => {
    if (!subcentro) return { status: 'none' };
    const cand = rows.filter(r =>
      r.tipo_operacao === tipo &&
      r.macro_custo === macro && r.grupo_custo === grupo &&
      r.centro_custo === centro && r.subcentro === subcentro);
    if (cand.length === 0) return { status: 'none' };
    if (cand.length > 1) return { status: 'ambiguous', count: cand.length };
    return { status: 'ok', item: cand[0] };
  };

  return { rows, loading, cascata, resolvePlanoConta };
}
