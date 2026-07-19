import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Catálogo GLOBAL de componentes financeiros (PR-OC-04A). Domínio PRÓPRIO — não
// confundir com plano de contas (usePlanoContasOC): plano classifica contabilmente;
// este catálogo dá a identidade estável (natureza, codigo) de cada componente da
// composição financeira. Somente leitura. A ordenação é SOBERANA do servidor
// (ordem_exibicao, depois nome) — o frontend não reordena.
export interface ComponenteFinanceiro {
  id: string;
  natureza: 'principal' | 'deducao' | 'acrescimo';
  codigo: string;
  nome: string;
  categoria: string;
  ativo: boolean;
  ordem_exibicao: number;
}

export function useComponentesFinanceiros() {
  const [rows, setRows] = useState<ComponenteFinanceiro[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // (supabase as any) — mesmo idioma do .rpc; zoo_componentes_financeiros ainda não
    // está no types.ts gerado. Só componentes ATIVOS podem ser usados em novas escritas.
    (supabase as any)
      .from('zoo_componentes_financeiros')
      .select('id, natureza, codigo, nome, categoria, ativo, ordem_exibicao')
      .eq('ativo', true)
      .order('ordem_exibicao', { ascending: true })
      .order('nome', { ascending: true })
      .then(({ data, error }: { data: ComponenteFinanceiro[] | null; error: unknown }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) { setRows([]); return; }
        setRows(data ?? []);
      });
    return () => { cancelled = true; };
  }, []);

  // Filtra por natureza PRESERVANDO a ordem soberana do servidor (não reordena).
  const porNatureza = useMemo(
    () => (natureza: string) => rows.filter(r => r.natureza === natureza),
    [rows],
  );

  return { rows, loading, porNatureza };
}
