/**
 * Tela de consolidação Meta — hub + duas views dedicadas.
 * Agora consome a view oficial `vw_zoot_categoria_mensal` via hook.
 */
import { useState, useMemo } from 'react';
import { useRebanhoOficial, type ZootCategoriaMensal } from '@/hooks/useRebanhoOficial';
import { CATEGORIAS } from '@/types/cattle';
import type { Lancamento } from '@/types/cattle';
import type { MetaCategoriaMes } from '@/hooks/useMetaConsolidacao';
import { ConsolidacaoHub } from '@/components/meta-consolidacao/ConsolidacaoHub';
import { ConsolidacaoCategoriaView } from '@/components/meta-consolidacao/ConsolidacaoCategoriaView';
import { ConsolidacaoMesView } from '@/components/meta-consolidacao/ConsolidacaoMesView';

interface Props {
  ano: number;
  metaLancamentos: Lancamento[];
  onBack: () => void;
  onNavigateToLancamentos?: (ano: string, mes: string, categoria?: string) => void;
  onNavigateToReclass?: (mes?: string) => void;
}

type Screen = 'hub' | 'categoria' | 'mes';

/**
 * Converte os dados da view oficial para o formato MetaCategoriaMes
 * que os componentes de consolidação já consomem.
 */
function viewToMetaCategoriaMes(rows: ZootCategoriaMensal[]): MetaCategoriaMes[] {
  return rows.map(r => {
    const catDef = CATEGORIAS.find(c => c.value === r.categoria_codigo);
    return {
      categoria: r.categoria_codigo as any,
      categoriaLabel: catDef?.label || r.categoria_nome,
      mes: String(r.mes).padStart(2, '0'),
      si: r.saldo_inicial,
      ee: r.entradas_externas,
      se: r.saidas_externas,
      ei: r.evol_cat_entrada,
      siInternas: r.evol_cat_saida,
      sf: r.saldo_final,
      cabMedias: (r.saldo_inicial + r.saldo_final) / 2,
      pesoInicial: r.peso_total_inicial,
      pesoEntradas: r.peso_entradas_externas + r.peso_evol_cat_entrada,
      pesoSaidas: r.peso_saidas_externas + r.peso_evol_cat_saida,
      gmd: r.gmd || 0,
      dias: r.dias_mes,
      producaoBio: r.producao_biologica,
      pesoTotalFinal: r.peso_total_final,
      pesoMedioFinal: r.peso_medio_final,
    };
  });
}

export function MetaConsolidacaoTab({ ano, metaLancamentos, onBack, onNavigateToLancamentos, onNavigateToReclass }: Props) {
  // FONTE OFICIAL: useRebanhoOficial (camada única obrigatória)
  const { rawCategorias: viewData, loading: isLoading } = useRebanhoOficial({ ano, cenario: 'meta' });
  const data = useMemo(() => viewToMetaCategoriaMes(viewData), [viewData]);
  const [screen, setScreen] = useState<Screen>('hub');

  if (screen === 'categoria') {
    return <ConsolidacaoCategoriaView data={data} ano={ano} metaLancamentos={metaLancamentos} onBack={() => setScreen('hub')} onNavigateToLancamentos={onNavigateToLancamentos} onNavigateToReclass={onNavigateToReclass} />;
  }

  if (screen === 'mes') {
    return <ConsolidacaoMesView data={data} ano={ano} metaLancamentos={metaLancamentos} onBack={() => setScreen('hub')} onNavigateToLancamentos={onNavigateToLancamentos} onNavigateToReclass={onNavigateToReclass} />;
  }

  return (
    <ConsolidacaoHub
      ano={ano}
      onBack={onBack}
      onSelectCategoria={() => setScreen('categoria')}
      onSelectMes={() => setScreen('mes')}
    />
  );
}
