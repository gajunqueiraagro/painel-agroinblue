/**
 * PROD-EVOLUCAO-01a — os meses da Evolução no Ano, montados SÓ das fontes que a tela já lia (nada de banco novo; OK do Gabriel 30/10 18:12):
 *   - saldos e indicadores: `useRebanhoOficial` (cache + overlay do Fechamento) — as MESMAS regras da tela antiga;
 *   - cabeças por tipo: `useMovimentacoesMensais` (lançamentos) — a MESMA fonte das 8 linhas de hoje;
 *   - kg por tipo, carcaça e evolução de categoria: o cache por categoria (`rawCategorias`), somado no mês;
 *   - área de pecuária do mês: `useSnapshotAreaAnual` (a do PC-100); a da meta, `useAreaPlanejamento`.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { useMovimentacoesMensais } from '@/hooks/useMovimentacoesMensais';
import { useSnapshotAreaAnual } from '@/hooks/useFechamentoArea';
import { useAreaPlanejamento } from '@/hooks/useAreaPlanejamento';
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import type { ZootMensal } from '@/hooks/useZootMensal';
import type { FluxoTipo } from '@/lib/calculos/zootecnicos';
import type { MesDaEvolucao } from '@/lib/producao/evolucaoAno';

const COLUNA_DO_PESO: Record<FluxoTipo, keyof ZootCategoriaMensal> = {
  nascimento: 'peso_nascimento', compra: 'peso_compra', transferencia_entrada: 'peso_transf_entrada', abate: 'peso_abate', venda: 'peso_venda',
  transferencia_saida: 'peso_transf_saida', consumo: 'peso_consumo', morte: 'peso_morte',
};
const TIPOS: FluxoTipo[] = ['nascimento', 'compra', 'transferencia_entrada', 'abate', 'venda', 'transferencia_saida', 'consumo', 'morte'];

type Totais = Record<number, { saldo_inicial: number; saldo_final: number; saldo_sistema: number | null } | undefined>;

/** Monta os 12 meses de um cenário. Pura (testável): recebe o que os hooks entregam. */
export function mesesDaEvolucao({ cenario, totaisPorMes, fazendaByMes, rawCategorias, porMesTipo, areaPorMes }: {
  cenario: 'realizado' | 'meta';
  totaisPorMes: Totais;
  fazendaByMes: Record<string, ZootMensal | undefined>;
  rawCategorias: ZootCategoriaMensal[];
  porMesTipo: Record<string, Partial<Record<FluxoTipo, number>> | undefined>;
  /** índice 0 = jan; null = sem área */
  areaPorMes: (number | null)[];
}): MesDaEvolucao[] {
  const catsDoMes = new Map<number, ZootCategoriaMensal[]>();
  for (const c of rawCategorias) {
    const l = catsDoMes.get(c.mes) ?? []; l.push(c); catsDoMes.set(c.mes, l);
  }
  const somaCol = (cats: ZootCategoriaMensal[], col: keyof ZootCategoriaMensal) => cats.reduce((s, c) => s + (Number(c[col]) || 0), 0);
  const meses: MesDaEvolucao[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const key = String(mes).padStart(2, '0');
    const t = totaisPorMes[mes];
    const z = fazendaByMes[key];
    const cats = catsDoMes.get(mes) ?? [];
    if (!t && !z && cats.length === 0) continue;
    /* a regra de hoje (`FluxoAnualTab`, antes do 01a): jan = saldo_inicial; depois o saldo_sistema do mês anterior */
    const saldoInicio = mes === 1 ? (t?.saldo_inicial ?? null) : (totaisPorMes[mes - 1]?.saldo_sistema ?? null);
    const cab: Partial<Record<FluxoTipo, number>> = {};
    const kg: Partial<Record<FluxoTipo, number>> = {};
    for (const tipo of TIPOS) {
      cab[tipo] = porMesTipo[key]?.[tipo] ?? 0;
      kg[tipo] = somaCol(cats, COLUNA_DO_PESO[tipo]);
    }
    meses.push({
      mes,
      /* a regra de hoje (`temDado`): o mês tem o Fechamento; no Meta, sempre */
      fechado: cenario === 'meta' || z?.fonte_oficial_mes === 'fechamento',
      saldoInicio,
      saldoFinal: t?.saldo_final ?? null,
      pesoInicioKg: z?.peso_inicio_kg ?? null,
      pesoFinalKg: z?.peso_total_final_kg ?? null,
      cab, kg,
      kgCarcacaAbate: somaCol(cats, 'peso_carcaca_abate'),
      evolEntrou: somaCol(cats, 'evol_cat_entrada'),
      evolSaiu: somaCol(cats, 'evol_cat_saida'),
      kgEvolEntrou: somaCol(cats, 'peso_evol_cat_entrada'),
      kgEvolSaiu: somaCol(cats, 'peso_evol_cat_saida'),
      pesoMedioFinal: z?.peso_medio_final_kg ?? null,
      gmd: z?.gmd_kg_cab_dia ?? null,
      producaoBio: z?.gmd_numerador_kg ?? null,
      cabInicio: z?.cabecas_inicio ?? null,
      cabFinal: z?.cabecas_final ?? null,
      dias: z?.dias_mes ?? null,
      uaMedia: z?.ua_media ?? null,
      areaPecuaria: areaPorMes[mes - 1] ?? null,
    });
  }
  return meses;
}

export function useEvolucaoDoAno(ano: number) {
  const { isGlobal, fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const real = useRebanhoOficial({ ano, cenario: 'realizado', global: isGlobal });
  const meta = useRebanhoOficial({ ano, cenario: 'meta', global: isGlobal });
  const movReal = useMovimentacoesMensais(ano, 'realizado');
  const movMeta = useMovimentacoesMensais(ano, 'meta');
  const areaReal = useSnapshotAreaAnual(ano, isGlobal ? undefined : fazendaAtual?.id, isGlobal, clienteAtual?.id);
  const areaMeta = useAreaPlanejamento(clienteAtual?.id ?? null, isGlobal ? null : fazendaAtual?.id ?? null, ano, isGlobal);

  const areaRealPorMes = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const s = areaReal.snapshots.find((x) => x.mes === i + 1);
    return s ? s.area_pecuaria_ha : null;
  }), [areaReal.snapshots]);
  const areaMetaPorMes = useMemo(() => (areaMeta.data?.porMes ?? []).map((m) => m.area_pecuaria_ha ?? null), [areaMeta.data]);

  const mesesReal = useMemo(() => mesesDaEvolucao({
    cenario: 'realizado', totaisPorMes: real.totaisPorMes, fazendaByMes: real.fazendaByMes, rawCategorias: real.rawCategorias,
    porMesTipo: movReal.data?.porMesTipo ?? {}, areaPorMes: areaRealPorMes,
  }), [real.totaisPorMes, real.fazendaByMes, real.rawCategorias, movReal.data, areaRealPorMes]);
  const mesesMeta = useMemo(() => mesesDaEvolucao({
    cenario: 'meta', totaisPorMes: meta.totaisPorMes, fazendaByMes: meta.fazendaByMes, rawCategorias: meta.rawCategorias,
    porMesTipo: movMeta.data?.porMesTipo ?? {}, areaPorMes: areaMetaPorMes,
  }), [meta.totaisPorMes, meta.fazendaByMes, meta.rawCategorias, movMeta.data, areaMetaPorMes]);

  /* a meta é "rascunho" enquanto a última versão do (cliente, ano, fazenda | Global) não estiver 'aprovada' — a regra de
     `usePlanejamentoAprovacaoData` (`metaStatus`, :708-710), a mesma leitura (`meta_versoes`, a mais recente) */
  const fazendaDaVersao = isGlobal ? null : fazendaAtual?.id ?? null;
  const versao = useQuery({
    queryKey: ['evolucao-meta-versao', clienteAtual?.id, ano, fazendaDaVersao],
    enabled: !!clienteAtual?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      let q = (supabase as any).from('meta_versoes').select('status').eq('cliente_id', clienteAtual!.id).eq('ano', ano)
        .order('created_at', { ascending: false }).limit(1);
      q = fazendaDaVersao ? q.eq('fazenda_id', fazendaDaVersao) : q.is('fazenda_id', null);
      const { data, error } = await q;
      if (error) throw error;
      const linha: { status?: string } | undefined = data?.[0];
      return linha?.status ?? null;
    },
  });
  const metaRascunho = versao.data !== 'aprovada';

  return { mesesReal, mesesMeta, isGlobal, metaRascunho, carregando: real.loading || movReal.isLoading };
}
