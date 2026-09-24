import { useValorRebanhoInicio, type RebanhoInicio } from '@/hooks/useValorRebanhoInicio';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Save, Copy, Info, Lock, Unlock, AlertTriangle, TrendingUp, TrendingDown, Minus, ArrowLeft } from 'lucide-react';
import { Lancamento, SaldoInicial, CATEGORIAS, kgToArrobas } from '@/types/cattle';
import { useFazenda } from '@/contexts/FazendaContext';
import { useRedirecionarPecuaria } from '@/hooks/useRedirecionarPecuaria';
import { usePastos } from '@/hooks/usePastos';
import { useValorRebanho, type SnapshotDetalheCategoria } from '@/hooks/useValorRebanho';
import { useValorRebanhoGlobal } from '@/hooks/useValorRebanhoGlobal';
import { usePrecoMercado } from '@/hooks/usePrecoMercado';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';
import { toast } from 'sonner';
import { useRebanhoOficial, type ZootCategoriaMensal } from '@/hooks/useRebanhoOficial';
import { supabase } from '@/integrations/supabase/client';
import { useSnapshotStatus } from '@/hooks/useSnapshotStatus';
import { SnapshotStatusBanner } from '@/components/SnapshotStatusBanner';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { MesAnteriorAvisoIcon } from '@/components/MesAnteriorAvisoIcon';
import { FluxoFechamentoFooter } from '@/components/FluxoFechamentoFooter';
import { useMasterLock } from '@/hooks/useMasterLock';
import { MasterLockBanner } from '@/components/MasterLockBanner';

type OrigemPeso = 'pastos' | 'lancamento' | 'saldo_inicial' | 'sem_base';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack?: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
  onNavigateToFechamentoPastos?: () => void;
  onNavigateToMovimentacoes?: () => void;
}

interface LinhaTabelaValor {
  categoriaId: string;
  codigo: string;
  nome: string;
  saldo: number;
  pesoMedio: number;
  origemPeso: OrigemPeso;
  precoKg: number;
  valorCabeca: number;
  precoArroba: number;
  valorTotal: number;
  isSugerido: boolean;
}

interface HistoricoMes {
  valor: number;
  pesoKg: number;
}

interface MetricasExibicao {
  valor: number | null;
  cabecas: number | null;
  pesoTotalKg: number | null;
  pesoMedio: number | null;
  totalArrobas: number | null;
  precoArroba: number | null;
  valorCabeca: number | null;
  precoKg: number | null;
}

type FonteMes = 'live' | 'snapshot' | 'snapshot_incompleto';

const ORIGEM_LABEL: Record<OrigemPeso, string> = {
  pastos: 'Fechamento do mês',
  lancamento: 'Último lançamento',
  saldo_inicial: 'Saldo inicial do ano',
  sem_base: 'Sem dados',
};

const MAPA_PRECO_MERCADO: Record<string, { bloco: string; categoria: string; unidade: 'kg' | 'arroba' }> = {
  mamotes_m: { bloco: 'magro_macho', categoria: '200 kg média', unidade: 'kg' },
  desmama_m: { bloco: 'magro_macho', categoria: '200 kg média', unidade: 'kg' },
  garrotes: { bloco: 'magro_macho', categoria: 'Garrotes 350 kg média', unidade: 'kg' },
  bois: { bloco: 'frigorifico', categoria: 'Boi Gordo', unidade: 'arroba' },
  touros: { bloco: 'frigorifico', categoria: 'Vaca', unidade: 'arroba' },
  mamotes_f: { bloco: 'magro_femea', categoria: '200 kg média', unidade: 'kg' },
  desmama_f: { bloco: 'magro_femea', categoria: '200 kg média', unidade: 'kg' },
  novilhas: { bloco: 'frigorifico', categoria: 'Novilha', unidade: 'arroba' },
  vacas: { bloco: 'frigorifico', categoria: 'Vaca', unidade: 'arroba' },
};

const ORDEM_CATEGORIAS_FIXA = [
  'mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros',
  'mamotes_f', 'desmama_f', 'novilhas', 'vacas',
];

const MESES_SHORT = [
  { key: '01', label: 'Jan' }, { key: '02', label: 'Fev' }, { key: '03', label: 'Mar' },
  { key: '04', label: 'Abr' }, { key: '05', label: 'Mai' }, { key: '06', label: 'Jun' },
  { key: '07', label: 'Jul' }, { key: '08', label: 'Ago' }, { key: '09', label: 'Set' },
  { key: '10', label: 'Out' }, { key: '11', label: 'Nov' }, { key: '12', label: 'Dez' },
];

const CHART_LABELS = ['I', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
/**
 * AS RÉGUAS DA EVOLUÇÃO PATRIMONIAL — VALOR-REBANHO-COMPACTO-02 (mock v1).
 *
 * ⚠ SÃO MEDIDAS, não as do mock: as do mock (70|40|46|40|48|56|76 e 78|72|56|62) foram desenhadas
 * antes de ver os números do SR, que têm oito dígitos em "Valor total" e "15.824.817" no
 * indicador. A régua da casa é pior texto + 8 de folga + 12 de padding, e o método é o `Range`
 * sobre o conteúdo contra o `clientWidth` — o mesmo que já corrigiu o DRE três vezes.
 * ⚠ A COLUNA R$/kg É A EDITÁVEL e não encolhe abaixo do input: ela carrega um `<input>` de
 * verdade, não texto.
 */
/* Medido na tela, SR ago/21, com os grupos e o total à vista. As três da direita estouravam:
     R$/@         "R$ 312,39"        50,8 numa caixa de 44  (faltavam  6,7)
     R$/cab       "R$ 2.937,67"      59,9 numa caixa de 50  (faltavam  9,9)
     Valor total  "R$ 12.255.963,06" 88,5 numa caixa de 72  (faltavam 16,5)
   E "R$/kg" estava em folga ZERO — no limite, que é o mesmo que cortar no próximo número. */
/* ⚠ R$/kg FOI A 64 numa segunda passada: ela media folga ZERO com "15,00" — e zero é o mesmo que
     cortar no próximo número. A célula do TOTAL tem padding de 12 e as de dados, de 4 (é a coluna
     do `<input>`), então a coluna tem de caber a MAIOR das duas leituras. */
/* ⚠ SEGUNDA PASSADA, com o mês ABERTO (onde aparecem o "*" da origem do peso e os 100,0% de
     variação): "Peso" media 42,1 em 44 ("140,00 *") e "vs mês" estourava por 0,9 em "100,0%".
   ⚠ E UM FALSO POSITIVO DO MEU MEDIDOR fica registrado: a coluna R$/kg dá folga ZERO porque a
     célula do total é um `<span className="block">`, e um bloco sempre mede a largura do
     container — não o texto dentro dele. Não é corte; é o `Range` medindo a caixa. */
const COLS_CAT_VR = [74, 50, 64, 64, 72, 80, 110] as const;
const COLS_IND_VR = [82, 74, 64, 64] as const;

const CHART_FULL_LABELS = ['Inicial', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function mapFonteToOrigem(fonte?: string): OrigemPeso {
  if (fonte === 'fechamento') return 'pastos';
  if (fonte === 'fallback_movimentacao') return 'lancamento';
  return 'sem_base';
}

interface ResumoOficialLike {
  rows: Array<{
    categoriaId: string;
    categoriaCodigo: string;
    categoriaNome: string;
    quantidadeFinal: number;
    pesoMedioFinalKg: number | null;
    origemPeso: OrigemPeso;
  }>;
}

function extractResumoFromView(
  viewData: ZootCategoriaMensal[] | undefined,
  mes: number,
): ResumoOficialLike {
  if (!viewData) return { rows: [] };
  const mesRows = viewData.filter(r => r.mes === mes);
  return {
    rows: mesRows.map(r => ({
      categoriaId: r.categoria_id,
      categoriaCodigo: r.categoria_codigo,
      categoriaNome: r.categoria_nome,
      quantidadeFinal: r.saldo_final,
      pesoMedioFinalKg: r.peso_medio_final,
      origemPeso: mapFonteToOrigem(r.fonte_oficial_mes),
    })),
  };
}

/**
 * Hook that fetches official closure data from fechamento_pasto_itens
 * aggregated by category. Returns null when P1 is not closed.
 */
function useFechamentoOficialPastos(fazendaId: string | undefined, anoMes: string) {
  const [data, setData] = useState<ResumoOficialLike | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!fazendaId || fazendaId === '__global__') {
      setData(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Check if ALL active pastos are closed for this month
        const { data: statusData } = await supabase.rpc(
          'get_status_pilares_fechamento' as any,
          { _fazenda_id: fazendaId, _ano_mes: anoMes },
        );
        const p1Status = (statusData as any)?.p1_mapa_pastos?.status;

        if (p1Status !== 'oficial') {
          if (!cancelled) setData(null);
          return;
        }

        // P1 is oficial — fetch from fechamento_pasto_itens (source of truth)
        // First get all fechamento IDs for this month
        const { data: fechamentos } = await supabase
          .from('fechamento_pastos')
          .select('id')
          .eq('fazenda_id', fazendaId)
          .eq('ano_mes', anoMes)
          .eq('status', 'fechado');

        const fechIds = (fechamentos || []).map(f => f.id);
        if (fechIds.length === 0) {
          if (!cancelled) setData({ rows: [] });
          return;
        }

        const { data: itens, error } = await supabase
          .from('fechamento_pasto_itens')
          .select('categoria_id, quantidade, peso_medio_kg')
          .in('fechamento_id', fechIds);

        if (error) throw error;

        // Aggregate by category
        const catMap = new Map<string, { qty: number; pesoTotal: number; catId: string }>();
        (itens || []).forEach((item: any) => {
          const catId = item.categoria_id;
          const qty = Number(item.quantidade) || 0;
          const pesoMedio = Number(item.peso_medio_kg) || 0;
          const existing = catMap.get(catId) || { qty: 0, pesoTotal: 0, catId };
          existing.qty += qty;
          existing.pesoTotal += qty * pesoMedio;
          catMap.set(catId, existing);
        });

        // Fetch category metadata
        const catIds = Array.from(catMap.keys());
        if (catIds.length === 0) {
          if (!cancelled) setData({ rows: [] });
          return;
        }

        const { data: cats } = await supabase
          .from('categorias_rebanho')
          .select('id, codigo, nome, ordem_exibicao')
          .in('id', catIds);

        const catLookup = new Map((cats || []).map(c => [c.id, c]));

        const rows = Array.from(catMap.entries())
          .map(([catId, agg]) => {
            const cat = catLookup.get(catId);
            const pesoMedio = agg.qty > 0 ? agg.pesoTotal / agg.qty : 0;
            return {
              categoriaId: catId,
              categoriaCodigo: cat?.codigo || catId,
              categoriaNome: cat?.nome || catId,
              ordemExibicao: cat?.ordem_exibicao || 99,
              quantidadeFinal: agg.qty,
              pesoMedioFinalKg: pesoMedio,
              origemPeso: 'pastos' as OrigemPeso,
            };
          })
          .sort((a, b) => a.ordemExibicao - b.ordemExibicao);

        if (!cancelled) setData({ rows });
      } catch (e) {
        console.error('Erro ao carregar fechamento oficial:', e);
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [fazendaId, anoMes]);

  return { fechamentoOficial: data, loadingFechamento: loading };
}

function calcVariacaoNullable(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

function formatNumNullable(valor: number | null, casas: number) {
  return valor === null ? '—' : formatNum(valor, casas);
}

function formatMoedaNullable(valor: number | null) {
  return valor === null ? '—' : formatMoeda(valor);
}

function buildMetricsFromTotals(valor: number | null, cabecas: number | null, pesoTotalKg: number | null): MetricasExibicao {
  const pesoMedio = cabecas !== null && pesoTotalKg !== null
    ? (cabecas > 0 ? pesoTotalKg / cabecas : 0)
    : null;
  const totalArrobas = pesoTotalKg !== null ? pesoTotalKg / 30 : null;
  const precoArroba = valor !== null && totalArrobas !== null
    ? (totalArrobas > 0 ? valor / totalArrobas : 0)
    : null;
  const valorCabeca = valor !== null && cabecas !== null
    ? (cabecas > 0 ? valor / cabecas : 0)
    : null;
  const precoKg = valor !== null && pesoTotalKg !== null
    ? (pesoTotalKg > 0 ? valor / pesoTotalKg : 0)
    : null;

  return {
    valor,
    cabecas,
    pesoTotalKg,
    pesoMedio,
    totalArrobas,
    precoArroba,
    valorCabeca,
    precoKg,
  };
}

function aggregateMetricsFromTableRows(rows: LinhaTabelaValor[]): MetricasExibicao {
  if (rows.length === 0) return buildMetricsFromTotals(null, null, null);

  const cabecas = rows.reduce((sum, row) => sum + row.saldo, 0);
  const pesoTotalKg = rows.reduce((sum, row) => sum + (row.saldo * row.pesoMedio), 0);
  const valor = rows.reduce((sum, row) => sum + row.valorTotal, 0);

  return buildMetricsFromTotals(valor, cabecas, pesoTotalKg);
}

function aggregateMetricsFromSnapshotItems(items: SnapshotDetalheCategoria[]): MetricasExibicao | null {
  if (items.length === 0) return null;

  const cabecas = items.reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0);
  const pesoTotalKg = items.reduce((sum, item) => {
    const quantidade = Number(item.quantidade) || 0;
    const pesoMedio = Number(item.peso_medio_kg) || 0;
    return sum + quantidade * pesoMedio;
  }, 0);
  const valor = items.reduce((sum, item) => sum + (Number(item.valor_total_categoria) || 0), 0);

  return buildMetricsFromTotals(valor, cabecas, pesoTotalKg);
}

function VariacaoBadge({ valor, label, showLabel }: { valor: number | null; label: string; showLabel?: boolean }) {
  if (valor === null) return null;
  const isPositive = valor > 0;
  const isNeutral = Math.abs(valor) < 0.1;
  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const color = isNeutral
    ? 'text-muted-foreground'
    : isPositive
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-destructive';

  const formattedVal = Math.abs(valor).toFixed(1).replace('.', ',');

  return (
    <span className={`inline-flex items-center gap-0.5 text-[8px] font-semibold tabular-nums ${color}`}>
      <Icon className="h-2.5 w-2.5" />
      {formattedVal}%
      {showLabel && <span className="font-normal text-muted-foreground ml-0.5">{label}</span>}
    </span>
  );
}

/**
 * O CARD "INÍCIO" — o retrato de 1º de janeiro (mock v2).
 *
 * ⚠ ELE NÃO É UM MÊS, É A BASE: o ponto de partida contra o qual os doze meses se comparam. Por
 * isso a pílula diz "Base" e não "Fechado", não há Reabrir nem desbloqueio — não há o que fechar
 * num retrato que já veio fechado de dezembro.
 *
 * ⚠ AS COMPARAÇÕES SAEM EM "—", e isso é a sentinela funcionando: "vs mês" e "vs início do ano"
 * não existem para o próprio início. Zero ali afirmaria estabilidade onde não há termo de
 * comparação.
 *
 * ⚠ E OS GRÁFICOS NÃO RENDERIZAM, em vez de aparecerem vazios: uma série de um ponto não é uma
 * série. A área some inteira — o corpo não se move porque nada dela tinha altura reservada.
 *
 * ⚠ A FAIXA DIZ A ORIGEM em 9px, e é o que impede a pergunta seguinte: "fechamento de dez/20" ou
 * "saldo inicial do cadastro". As duas fontes são as MESMAS que o P0 do DRE usa, nessa ordem.
 */
function CardInicio({ ano, inicio, carregando, fazendaNome }: {
  ano: number;
  inicio: RebanhoInicio | null;
  carregando: boolean;
  fazendaNome: string;
}) {
  const traco = '—';
  const nz = (v: number | null | undefined, casas = 0) =>
    (v == null ? traco : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));

  const origem = inicio?.origem === 'fechamento'
    ? `fechamento de ${rotuloMesCurto(inicio.mesBase)}`
    : inicio?.origem === 'cadastro' ? 'saldo inicial do cadastro' : null;

  const pesoMedio = inicio && inicio.cabecas > 0 ? (inicio.arrobas * 30) / inicio.cabecas : null;
  const precoAt = inicio && inicio.arrobas > 0 ? inicio.valor / inicio.arrobas : null;
  const precoCab = inicio && inicio.cabecas > 0 ? inicio.valor / inicio.cabecas : null;

  const cel = (txt: string, esq?: boolean, forte?: boolean) => (
    <td className={`truncate px-1.5 py-0 tabular-nums ${esq ? 'text-left' : 'text-right'} ${forte ? 'font-medium' : ''}`}
      style={{ fontSize: 9, lineHeight: 1 }}>{txt}</td>
  );

  return (
    <div className="space-y-1.5">
      {/* A faixa do Início: informativa, nunca de bloqueio. */}
      <div className="flex items-center justify-between gap-2 rounded border px-2"
        style={{ height: 22, backgroundColor: '#EEF3F8', borderColor: '#B5D4F4', color: '#0C447C' }}>
        <span className="truncate" style={{ fontSize: 9 }}>
          Retrato de 1º de janeiro de {ano} · saldo inicial do ano
          {origem && <span className="opacity-80"> · {origem}</span>}
        </span>
        <span className="shrink-0 rounded px-1.5 font-medium"
          style={{ fontSize: 9, lineHeight: '16px', backgroundColor: '#0C447C', color: '#fff' }}>Base</span>
      </div>

      {carregando ? (
        <div className="rounded border bg-card px-2 py-6 text-center text-[10px] text-muted-foreground">
          Carregando o retrato de 1º de janeiro…
        </div>
      ) : !inicio || inicio.origem === 'vazio' ? (
        /* ⚠ VAZIO É TRAÇO E EXPLICAÇÃO, nunca zero: um rebanho de zero cabeças é uma afirmação. */
        <div className="rounded border bg-card px-2 py-6 text-center text-[10px] text-muted-foreground">
          {fazendaNome === 'Global'
            ? `O retrato de 1º de janeiro é por FAZENDA: escolha uma no seletor. Somá-las aqui seria
               uma terceira fonte para o mesmo dado, ao lado do fechamento e do cadastro.`
            : `Sem fechamento de dezembro/${ano - 1} e sem saldo inicial no cadastro — não há
               retrato de 1º de janeiro de ${ano} para esta fazenda.`}
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: '376px 268px' }}>
          <div className="overflow-hidden rounded border bg-card">
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>{[70, 40, 46, 40, 48, 56, 76].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead>
                <tr style={{ height: 16 }}>
                  {['Categoria', 'Qtd', 'Peso', 'R$/kg', 'R$/@', 'R$/cab', 'Valor total'].map((r, i) => (
                    <th key={r} className={`truncate px-1.5 py-0 font-semibold text-white ${i === 0 ? 'text-left' : 'text-right'}`}
                      style={{ backgroundColor: '#2C3E5C', fontSize: 9, lineHeight: 1 }}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inicio.categorias.map((c, i) => {
                  const at = c.pesoMedioKg == null ? null : kgToArrobas(c.pesoMedioKg);
                  return (
                    <tr key={c.categoria} style={{ height: 13, backgroundColor: i % 2 === 0 ? '#F5F4F0' : undefined }}>
                      {cel(nomeDaCategoria(c.categoria), true)}
                      {cel(nz(c.quantidade))}
                      {cel(nz(c.pesoMedioKg, 1))}
                      {cel(nz(c.precoKg, 2))}
                      {cel(at == null || c.precoKg == null ? traco : nz(at * c.precoKg, 2))}
                      {cel(c.quantidade === 0 ? traco : nz(c.valor / c.quantidade))}
                      {cel(nz(c.valor))}
                    </tr>
                  );
                })}
                <tr style={{ height: 16, backgroundColor: '#D6D4CC' }}>
                  {cel('Total', true, true)}
                  {cel(nz(inicio.cabecas), false, true)}
                  {cel(nz(pesoMedio, 1), false, true)}
                  {cel(traco, false, true)}
                  {cel(nz(precoAt, 2), false, true)}
                  {cel(nz(precoCab), false, true)}
                  {cel(nz(inicio.valor), false, true)}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded border bg-card">
            <div className="truncate px-1.5 py-0 font-medium"
              style={{ height: 16, lineHeight: '16px', fontSize: 9, backgroundColor: '#E9EFF6', color: '#0C447C' }}>
              Valor do rebanho · 1º jan/{String(ano).slice(2)} · {fazendaNome}
            </div>
            <div className="flex items-baseline justify-between gap-2 px-1.5" style={{ height: 22 }}>
              <span className="truncate font-medium tabular-nums" style={{ fontSize: 14 }}>{nz(inicio.valor)}</span>
              {/* ⚠ AS DUAS COMPARAÇÕES EM TRAÇO: o início não tem mês anterior nem início de ano. */}
              <span className="shrink-0 text-muted-foreground" style={{ fontSize: 9 }}>{traco} mês · {traco} ano</span>
            </div>
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>{[78, 72, 56, 62].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead>
                <tr style={{ height: 16 }}>
                  {['', 'Valor', 'vs mês', 'vs ini. ano'].map((r, i) => (
                    <th key={r} className={`truncate px-1.5 py-0 font-semibold text-white ${i === 0 ? 'text-left' : 'text-right'}`}
                      style={{ backgroundColor: '#2C3E5C', fontSize: 9, lineHeight: 1 }}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['Cabeças', nz(inicio.cabecas)],
                  ['Peso médio', nz(pesoMedio, 1)],
                  ['R$/@', nz(precoAt, 2)],
                  ['R$/cab', nz(precoCab)],
                  ['@ em estoque', nz(inicio.arrobas, 2)],
                ] as const).map(([rot, val]) => (
                  <tr key={rot} style={{ height: 16 }}>
                    {cel(rot, true)}
                    {cel(val)}
                    {cel(traco)}
                    {cel(traco)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** "2020-12" -> "dez/20". */
function rotuloMesCurto(am: string) {
  const M = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [a, m] = (am || '').split('-');
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${M[i]}/${a.slice(2)}` : am;
}

/** ⚠ O NOME DA CASA, NUNCA O CÓDIGO — a mesma lista dos lançamentos. */
function nomeDaCategoria(cod: string) {
  return CATEGORIAS.find(c => c.value === cod)?.label ?? cod;
}

function MiniChart({ data, color, title, unit }: { data: { label: string; fullLabel?: string; value: number | null }[]; color: string; title: string; unit?: 'currency' | 'arroba' }) {
  // Strip leading null points so the chart renders from the first real value (e.g. Jan)
  const firstRealIdx = data.findIndex(d => d.value !== null);
  const visibleData = firstRealIdx > 0 ? data.slice(firstRealIdx) : data;

  return (
    /* ⚠ 60px DE ALTURA — VALOR-REBANHO-COMPACTO-02. Eram 150, e três deles empurravam a tabela e
       os indicadores para fora da primeira tela. A série é a MESMA; o que encolheu foi o desenho.
       ⚠ E O TÍTULO DEIXOU DE SER CAIXA-ALTA MUTED: 9px/500 em navy, como as capas das duas tabelas
       acima. Três tipografias para três caixas irmãs era o que fazia a tela parecer remendada. */
    <div className="flex-1 min-w-0">
      <p className="mb-0.5 truncate text-center font-medium" style={{ fontSize: 9, color: '#0C447C' }}>{title}</p>
      <div className="h-[60px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={visibleData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="label" tick={{ fontSize: 6 }} interval={0} tickLine={false} axisLine={false} />
            <YAxis hide domain={['auto', 'auto']} />
            <RechartsTooltip
              contentStyle={{ fontSize: 9, padding: '2px 6px' }}
              labelStyle={{ fontSize: 8 }}
              labelFormatter={(label: string, payload: any[]) => payload?.[0]?.payload?.fullLabel || label}
              formatter={(v: number) => {
                if (unit === 'currency') return ['R$ ' + formatNum(v, 0), ''];
                if (unit === 'arroba') return [formatNum(v, 1) + ' @', ''];
                return [formatNum(v, 1), ''];
              }}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.2} dot={{ r: 1.5, fill: color, strokeWidth: 0 }} activeDot={{ r: 3 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ValorRebanhoTab({ lancamentos, saldosIniciais, onBack, filtroAnoInicial, filtroMesInicial, onNavigateToFechamentoPastos, onNavigateToMovimentacoes }: Props) {
  const { fazendaAtual, isGlobal, fazendas } = useFazenda();
  const { bloqueado } = useRedirecionarPecuaria();
  const { categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;

  const qc = useQueryClient();

  // IDs de fazendas pecuárias (para Global)
  const fazendaIdsPecuaria = useMemo(
    () => fazendas.filter(f => f.id !== '__global__' && f.tem_pecuaria !== false).map(f => f.id),
    [fazendas],
  );

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(l.data.substring(0, 4)); } catch {} });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const mesAtual = filtroMesInicial ? String(filtroMesInicial).padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0');
  const [mesFiltro, setMesFiltro] = useState(mesAtual);
  /**
   * O CARD "INÍCIO" — VALOR-REBANHO-COMPACTO-01.
   *
   * ⚠ ESTADO PRÓPRIO, NÃO UM MÊS '00': o `anoMes` alimenta uma dúzia de hooks e queries, e um mês
   * que não existe no calendário viraria `2021-00` em todas elas. O Início é uma VISTA do mesmo
   * ano, não um décimo terceiro mês.
   */
  const [verInicio, setVerInicio] = useState(false);

  useEffect(() => {
    if (filtroAnoInicial) setAnoFiltro(filtroAnoInicial);
    if (filtroMesInicial) setMesFiltro(String(filtroMesInicial).padStart(2, '0'));
  }, [filtroAnoInicial, filtroMesInicial]);

  const anoMes = `${anoFiltro}-${mesFiltro}`;
  /* ⚠ SEMPRE CHAMADO, nunca dentro de `if`: hook condicional derruba a tela (check:hooks). Quando o
     card está fechado ele lê e ninguém olha — é uma consulta por ano, não por clique. */
  const { inicio, carregando: carregandoInicio } = useValorRebanhoInicio(Number(anoFiltro), fazendaId);
  const isDezembro = mesFiltro === '12';

  // Regra temporal: mês atual, passado ou futuro
  const hoje = new Date();
  const mesAtualSistema = hoje.getMonth() + 1;
  const anoAtualSistema = hoje.getFullYear();
  const mesNumFiltro = Number(mesFiltro);
  const anoNumFiltro = Number(anoFiltro);
  const isMesFuturo = anoNumFiltro > anoAtualSistema || (anoNumFiltro === anoAtualSistema && mesNumFiltro > mesAtualSistema);
  const isMesAtual = anoNumFiltro === anoAtualSistema && mesNumFiltro === mesAtualSistema;

  const {
    precos,
    saving,
    salvarPrecos,
    loadPrecosMesAnterior,
    isFechado,
    isAdmin,
    reabrirFechamento,
  } = useValorRebanho(anoMes);

  // Global hook — sempre chamado para manter ordem dos hooks
  const globalData = useValorRebanhoGlobal(
    isGlobal ? fazendaIdsPecuaria : [],
    lancamentos, saldosIniciais, categorias, anoFiltro, mesFiltro,
  );

  const { itens: precosMercado } = usePrecoMercado(anoMes);

  // FONTE OFICIAL: useRebanhoOficial (camada única obrigatória)
  const { rawCategorias: viewDataAnoAtual } = useRebanhoOficial({ ano: Number(anoFiltro), cenario: 'realizado' });
  const { rawCategorias: viewDataAnoAnterior } = useRebanhoOficial({ ano: Number(anoFiltro) - 1, cenario: 'realizado' });

  // Governança do snapshot
  const { getStatusByMonth: getSnapStatus } = useSnapshotStatus(Number(anoFiltro));
  const snapStatusMes = getSnapStatus(Number(mesFiltro));
  const isSnapInvalidado = snapStatusMes === 'invalidado';
  const isSnapCadeiaQuebrada = snapStatusMes === 'cadeia_quebrada';

  // FONTE OFICIAL PARA MÊS FECHADO: fechamento_pasto_itens
  const { fechamentoOficial, loadingFechamento } = useFechamentoOficialPastos(
    isGlobal ? undefined : fazendaId,
    anoMes,
  );
  const p1Fechado = !loadingFechamento && fechamentoOficial !== null;

  const precosSugeridos = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(MAPA_PRECO_MERCADO).forEach(([codigo, ref]) => {
      const item = precosMercado.find(p => p.bloco === ref.bloco && p.categoria === ref.categoria);
      if (!item || item.valor <= 0) return;
      const valorComAgio = item.valor * (1 + (item.agio_perc || 0) / 100);
      map[codigo] = ref.unidade === 'arroba' ? valorComAgio / 30 : valorComAgio;
    });
    return map;
  }, [precosMercado]);

  const [precosLocal, setPrecosLocal] = useState<Record<string, number>>({});
  const [precosDisplay, setPrecosDisplay] = useState<Record<string, string>>({});

  // Para mês fechado (P1 oficial): usa fechamento_pasto_itens
  // Para mês aberto: usa vw_zoot_categoria_mensal (view)
  const resumoOficial = useMemo(() => {
    if (fechamentoOficial) return fechamentoOficial;
    return extractResumoFromView(viewDataAnoAtual, Number(mesFiltro));
  }, [fechamentoOficial, viewDataAnoAtual, mesFiltro]);

  const categoriasComSugestao = useMemo(() => {
    const set = new Set<string>();
    Object.keys(precosSugeridos).forEach(codigo => {
      const temPrecoSalvo = precos.some(p => p.categoria === codigo && p.preco_kg > 0);
      const precoAtual = precosLocal[codigo];
      const sugerido = precosSugeridos[codigo];
      if (!temPrecoSalvo && sugerido > 0 && precoAtual === sugerido) {
        set.add(codigo);
      }
    });
    return set;
  }, [precosSugeridos, precos, precosLocal]);

  const temSugestao = categoriasComSugestao.size > 0;

  // Detecta ausência de rebanho no período (fazenda individual apenas)
  const semRebanhoNoPeriodo = useMemo(() => {
    if (isGlobal) return false;
    if (isMesFuturo) return false;
    return !resumoOficial.rows.some(r => r.quantidadeFinal > 0);
  }, [isGlobal, isMesFuturo, resumoOficial.rows]);

  const allRows = useMemo<LinhaTabelaValor[]>(() => {
    return resumoOficial.rows.map(row => {
      const precoKg = precosLocal[row.categoriaCodigo] ?? 0;
      const valorTotal = row.quantidadeFinal * (row.pesoMedioFinalKg || 0) * precoKg;
      const valorCabeca = row.quantidadeFinal > 0 && row.pesoMedioFinalKg && precoKg > 0
        ? row.pesoMedioFinalKg * precoKg
        : 0;
      const arrobasLinha = row.quantidadeFinal * (row.pesoMedioFinalKg || 0) / 30;
      const precoArroba = arrobasLinha > 0 ? valorTotal / arrobasLinha : 0;

      return {
        categoriaId: row.categoriaId,
        codigo: row.categoriaCodigo,
        nome: row.categoriaNome,
        saldo: row.quantidadeFinal,
        pesoMedio: row.pesoMedioFinalKg || 0,
        origemPeso: row.origemPeso,
        precoKg,
        valorCabeca,
        precoArroba,
        valorTotal,
        isSugerido: categoriasComSugestao.has(row.categoriaCodigo),
      };
    });
  }, [resumoOficial.rows, precosLocal, categoriasComSugestao]);

  const liveRows = useMemo<LinhaTabelaValor[]>(() => {
    return ORDEM_CATEGORIAS_FIXA.map(codigo => {
      const existing = allRows.find(r => r.codigo === codigo);
      if (existing) return existing;
      const cat = categorias.find(c => c.codigo === codigo);
      return {
        categoriaId: cat?.id || codigo,
        codigo,
        nome: cat?.nome || codigo,
        saldo: 0,
        pesoMedio: 0,
        origemPeso: 'sem_base' as OrigemPeso,
        precoKg: precosLocal[codigo] ?? 0,
        valorCabeca: 0,
        precoArroba: 0,
        valorTotal: 0,
        isSugerido: false,
      };
    });
  }, [allRows, categorias, precosLocal]);

  const temEstimativa = liveRows.some(r => r.saldo > 0 && r.pesoMedio > 0 && r.origemPeso !== 'pastos');
  const totalRebanhoLive = useMemo(() => liveRows.reduce((sum, r) => sum + r.valorTotal, 0), [liveRows]);
  const totalCabecasLive = useMemo(() => liveRows.reduce((sum, r) => sum + r.saldo, 0), [liveRows]);
  const pesoTotalKgLive = useMemo(() => liveRows.reduce((sum, r) => sum + (r.saldo * r.pesoMedio), 0), [liveRows]);
  const metricasLiveSelecionado = useMemo(
    () => buildMetricsFromTotals(totalRebanhoLive, totalCabecasLive, pesoTotalKgLive),
    [totalRebanhoLive, totalCabecasLive, pesoTotalKgLive],
  );

  const categoriasSemPreco = useMemo(() => {
    if (!isDezembro) return [];
    return liveRows.filter(r => r.precoKg <= 0).map(r => r.nome);
  }, [liveRows, isDezembro]);

  const dezembroCompleto = isDezembro && categoriasSemPreco.length === 0;
  const fmtKg = (v: number) => v.toFixed(2).replace('.', ',');

  useEffect(() => {
    const numMap: Record<string, number> = {};
    const strMap: Record<string, string> = {};

    precos.forEach(p => {
      const v = Number(p.preco_kg) || 0;
      numMap[p.categoria] = v;
      strMap[p.categoria] = v > 0 ? fmtKg(v) : '0,00';
    });

    Object.entries(precosSugeridos).forEach(([codigo, valor]) => {
      if (!numMap[codigo] || numMap[codigo] <= 0) {
        const v = Number(valor.toFixed(4));
        numMap[codigo] = v;
        strMap[codigo] = v > 0 ? fmtKg(v) : '0,00';
      }
    });

    setPrecosLocal(numMap);
    setPrecosDisplay(strMap);
  }, [precos, precosSugeridos]);

  const mesNum = Number(mesFiltro);
  const mesAnteriorKey = mesNum > 1 ? String(mesNum - 1).padStart(2, '0') : '12';
  const anoMesAnterior = mesNum > 1 ? `${anoFiltro}-${mesAnteriorKey}` : `${Number(anoFiltro) - 1}-12`;
  const anoMesDezAnterior = `${Number(anoFiltro) - 1}-12`;

  // ---------------------------------------------------------------------------
  // Âncora patrimonial oficial: saldos_iniciais (ano inicial da fazenda)
  // ---------------------------------------------------------------------------
  const anoInicialFazenda = useMemo(() => {
    if (saldosIniciais.length === 0) return null;
    return Math.min(...saldosIniciais.map(s => s.ano));
  }, [saldosIniciais]);

  const isAnoInicial = anoInicialFazenda !== null && Number(anoFiltro) === anoInicialFazenda;

  const saldosIniciaisAnoFiltro = useMemo(() => {
    if (!isAnoInicial) return [];
    return saldosIniciais.filter(s => s.ano === Number(anoFiltro));
  }, [saldosIniciais, anoFiltro, isAnoInicial]);

  const baseInicialIncompleta = useMemo(() => {
    if (!isAnoInicial) return false;
    if (saldosIniciaisAnoFiltro.length === 0) return true;
    // Considerar apenas categorias com rebanho efetivo (quantidade > 0)
    const categoriasComRebanho = saldosIniciaisAnoFiltro.filter(s => (s.quantidade || 0) > 0);
    // Se nenhuma categoria tem rebanho, base está completa (não há o que precificar)
    if (categoriasComRebanho.length === 0) return false;
    return categoriasComRebanho.some(s => s.precoKg == null || s.precoKg <= 0);
  }, [isAnoInicial, saldosIniciaisAnoFiltro]);

  const metricasSaldosIniciais = useMemo((): MetricasExibicao | null => {
    if (!isAnoInicial) return null;
    // baseInicialIncompleta não bloqueia cálculo — badge cuida do aviso
    if (saldosIniciaisAnoFiltro.length === 0) return null;
    console.log('[VALOR-REBANHO] saldosIniciaisAnoFiltro:', JSON.stringify(saldosIniciaisAnoFiltro.map(s => ({ cat: s.categoria, qty: s.quantidade, peso: s.pesoMedioKg, preco: s.precoKg }))));

    let valor = 0;
    let cabecas = 0;
    let pesoTotalKg = 0;

    saldosIniciaisAnoFiltro.forEach(s => {
      const qty = s.quantidade || 0;
      const peso = s.pesoMedioKg || 0;
      cabecas += qty;
      pesoTotalKg += qty * peso;
      if (s.precoKg != null && s.precoKg > 0) {
        valor += qty * peso * s.precoKg;
      }
    });

    return buildMetricsFromTotals(valor, cabecas, pesoTotalKg);
  }, [isAnoInicial, baseInicialIncompleta, saldosIniciaisAnoFiltro]);

  const resumoMesAnterior = useMemo(() => {
    const mesAnt = mesNum > 1 ? mesNum - 1 : 12;
    const data = mesNum > 1 ? viewDataAnoAtual : viewDataAnoAnterior;
    return extractResumoFromView(data, mesAnt);
  }, [viewDataAnoAtual, viewDataAnoAnterior, mesNum]);
  const { precos: precosMesAnterior } = useValorRebanho(anoMesAnterior);

  const resumoDezAnterior = useMemo(() => extractResumoFromView(viewDataAnoAnterior, 12), [viewDataAnoAnterior]);
  const { precos: precosDezAnterior } = useValorRebanho(anoMesDezAnterior);

  const metricasMesAnteriorLive = useMemo(() => {
    let valor = 0;
    let cabecas = 0;
    let pesoTotalKg = 0;

    resumoMesAnterior.rows.forEach(row => {
      const precoKg = precosMesAnterior.find(p => p.categoria === row.categoriaCodigo)?.preco_kg || 0;
      valor += row.quantidadeFinal * (row.pesoMedioFinalKg || 0) * precoKg;
      cabecas += row.quantidadeFinal;
      pesoTotalKg += row.quantidadeFinal * (row.pesoMedioFinalKg || 0);
    });

    return buildMetricsFromTotals(valor, cabecas, pesoTotalKg);
  }, [resumoMesAnterior.rows, precosMesAnterior]);

  const metricasDezAnteriorLive = useMemo(() => {
    let valor = 0;
    let cabecas = 0;
    let pesoTotalKg = 0;

    resumoDezAnterior.rows.forEach(row => {
      const precoKg = precosDezAnterior.find(p => p.categoria === row.categoriaCodigo)?.preco_kg || 0;
      valor += row.quantidadeFinal * (row.pesoMedioFinalKg || 0) * precoKg;
      cabecas += row.quantidadeFinal;
      pesoTotalKg += row.quantidadeFinal * (row.pesoMedioFinalKg || 0);
    });

    return buildMetricsFromTotals(valor, cabecas, pesoTotalKg);
  }, [resumoDezAnterior.rows, precosDezAnterior]);

  const [historicoPorMes, setHistoricoPorMes] = useState<Record<string, HistoricoMes>>({});
  const [historicoDetalhadoPorMes, setHistoricoDetalhadoPorMes] = useState<Record<string, SnapshotDetalheCategoria[]>>({});

  useEffect(() => {
    if (!fazendaId || fazendaId === '__global__') {
      setHistoricoPorMes({});
      setHistoricoDetalhadoPorMes({});
      return;
    }

    const fetchHistorico = async () => {
      const anoMeses = [
        `${Number(anoFiltro) - 1}-12`,
        ...Array.from({ length: 12 }, (_, i) => `${anoFiltro}-${String(i + 1).padStart(2, '0')}`),
      ];

      try {
        const [fechamentoRes, itensRes] = await Promise.all([
          supabase
            .from('valor_rebanho_fechamento')
            .select('ano_mes, valor_total, peso_total_kg')
            .eq('fazenda_id', fazendaId)
            .eq('status', 'fechado')
            .in('ano_mes', anoMeses),
          supabase
            .from('valor_rebanho_fechamento_itens')
            .select('ano_mes, categoria, quantidade, peso_medio_kg, preco_kg, valor_total_categoria')
            .eq('fazenda_id', fazendaId)
            .in('ano_mes', anoMeses),
        ]);

        if (fechamentoRes.error) throw fechamentoRes.error;
        if (itensRes.error) throw itensRes.error;

        const mapFechado: Record<string, HistoricoMes> = {};
        (fechamentoRes.data || []).forEach((item: any) => {
          mapFechado[item.ano_mes] = {
            valor: Number(item.valor_total) || 0,
            pesoKg: Number(item.peso_total_kg) || 0,
          };
        });

        const mapDetalhado: Record<string, SnapshotDetalheCategoria[]> = {};
        (itensRes.data || []).forEach((item: any) => {
          if (!mapDetalhado[item.ano_mes]) mapDetalhado[item.ano_mes] = [];
          mapDetalhado[item.ano_mes].push({
            categoria: item.categoria,
            quantidade: Number(item.quantidade) || 0,
            peso_medio_kg: Number(item.peso_medio_kg) || 0,
            preco_kg: Number(item.preco_kg) || 0,
            valor_total_categoria: Number(item.valor_total_categoria) || 0,
          });
        });

        setHistoricoPorMes(mapFechado);
        setHistoricoDetalhadoPorMes(mapDetalhado);
      } catch (error) {
        console.error('Erro ao carregar snapshots oficiais do valor do rebanho:', error);
        setHistoricoPorMes({});
        setHistoricoDetalhadoPorMes({});
      }
    };

    fetchHistorico();
  }, [fazendaId, anoFiltro, isFechado]);

  const getFrozen = useCallback((mesKey: string) => historicoPorMes[mesKey] ?? null, [historicoPorMes]);
  const getFrozenDetalhado = useCallback((mesKey: string) => historicoDetalhadoPorMes[mesKey] ?? [], [historicoDetalhadoPorMes]);

  const frozenSelecionado = getFrozen(anoMes);
  const mesSelecionadoFechado = isFechado || frozenSelecionado !== null;
  const frozenDetalhadoSelecionado = getFrozenDetalhado(anoMes);

  const fonteMes: FonteMes = !mesSelecionadoFechado
    ? 'live'
    : frozenDetalhadoSelecionado.length > 0
      ? 'snapshot'
      : 'snapshot_incompleto';

  // Snapshot rows: use OFFICIAL closure data (resumoOficial) for qty/weight,
  // snapshot only for pricing. This ensures consistency with Mapa do Rebanho / Painel.
  const snapshotRowsSelecionado = useMemo<LinhaTabelaValor[]>(() => {
    const itensPorCategoria = new Map(frozenDetalhadoSelecionado.map(item => [item.categoria, item]));
    const oficialPorCodigo = new Map(resumoOficial.rows.map(r => [r.categoriaCodigo, r]));

    return ORDEM_CATEGORIAS_FIXA.map(codigo => {
      const snapshotItem = itensPorCategoria.get(codigo);
      const oficialRow = oficialPorCodigo.get(codigo);
      const cat = categorias.find(c => c.codigo === codigo);

      // Quantities and weights ALWAYS from fechamento_pasto_itens (official source)
      const saldo = oficialRow?.quantidadeFinal ?? 0;
      const pesoMedio = oficialRow?.pesoMedioFinalKg ?? 0;
      // Price from snapshot (user-entered)
      const precoKg = Number(snapshotItem?.preco_kg) || 0;
      const valorTotal = saldo * pesoMedio * precoKg;
      const arrobasLinha = saldo > 0 ? (saldo * pesoMedio) / 30 : 0;

      return {
        categoriaId: cat?.id || codigo,
        codigo,
        nome: cat?.nome || codigo,
        saldo,
        pesoMedio,
        origemPeso: oficialRow?.origemPeso ?? ('pastos' as OrigemPeso),
        precoKg,
        valorCabeca: saldo > 0 && pesoMedio > 0 ? pesoMedio * precoKg : 0,
        precoArroba: arrobasLinha > 0 ? valorTotal / arrobasLinha : 0,
        valorTotal,
        isSugerido: false,
      };
    });
  }, [frozenDetalhadoSelecionado, categorias, resumoOficial.rows]);

  // Build metrics for ANY month: physical data (qty/weight) ALWAYS from the view,
  // financial data (valor) from snapshot prices applied to view quantities.
  const buildFrozenMetrics = useCallback((mesKey: string): MetricasExibicao | null => {
    const snapshotDetalhado = historicoDetalhadoPorMes[mesKey] ?? [];
    const snapshotCabecalho = historicoPorMes[mesKey] ?? null;

    // Se existe snapshot fechado com itens detalhados, usar diretamente
    // Isso garante paridade absoluta: Dez/2020 final === base de 2021
    if (snapshotCabecalho && snapshotDetalhado.length > 0) {
      return aggregateMetricsFromSnapshotItems(snapshotDetalhado);
    }

    // Determine which view data to use based on the month's year
    const [keyAno, keyMes] = mesKey.split('-').map(Number);
    const viewData = keyAno === Number(anoFiltro) ? viewDataAnoAtual : viewDataAnoAnterior;
    const viewRows = (viewData || []).filter(r => r.mes === keyMes);

    // If no view data AND no snapshot, nothing to show
    if (viewRows.length === 0 && snapshotDetalhado.length === 0 && !snapshotCabecalho) return null;

    // Snapshot header sem itens detalhados — usar header direto
    if (snapshotCabecalho && snapshotDetalhado.length === 0) {
      return buildMetricsFromTotals(
        snapshotCabecalho.valor ?? null,
        null,
        snapshotCabecalho.pesoKg ?? null,
      );
    }

    // Mês aberto (live): usar view com preços do snapshot se disponíveis
    const itensPorCategoria = new Map(snapshotDetalhado.map(item => [item.categoria, item]));
    let totalValor = 0;
    let totalCab = 0;
    let totalPesoKg = 0;

    if (viewRows.length > 0) {
      viewRows.forEach(row => {
        const precoKg = Number(itensPorCategoria.get(row.categoria_codigo)?.preco_kg) || 0;
        const pesoMedio = row.peso_medio_final || 0;
        totalCab += row.saldo_final;
        totalPesoKg += row.saldo_final * pesoMedio;
        totalValor += row.saldo_final * pesoMedio * precoKg;
      });
      return buildMetricsFromTotals(totalValor, totalCab, totalPesoKg);
    }

    return null;
  }, [historicoPorMes, historicoDetalhadoPorMes, anoFiltro, viewDataAnoAtual, viewDataAnoAnterior]);

  const metricasSelecionado = useMemo(() => {
    if (fonteMes === 'live') return metricasLiveSelecionado;
    if (fonteMes === 'snapshot_incompleto') return buildMetricsFromTotals(null, null, null);
    // Snapshot: usar mesma base da tabela (resumoOficial qty/peso + snapshot preço)
    return aggregateMetricsFromTableRows(snapshotRowsSelecionado);
  }, [fonteMes, metricasLiveSelecionado, snapshotRowsSelecionado]);

  const metricasMesAnterior = useMemo(() => {
    if (fonteMes === 'live') return metricasMesAnteriorLive;
    return buildFrozenMetrics(anoMesAnterior);
  }, [fonteMes, metricasMesAnteriorLive, buildFrozenMetrics, anoMesAnterior]);

  // Base "Dez anterior" unificada: no ano inicial, saldos_iniciais substitui completamente
  const metricasDezBase = useMemo(() => {
    if (isAnoInicial) return metricasSaldosIniciais;
    return buildFrozenMetrics(anoMesDezAnterior);
  }, [isAnoInicial, metricasSaldosIniciais, buildFrozenMetrics, anoMesDezAnterior]);

  // metricasInicioAno removido — usar metricasDezBase diretamente

  const rowsExibicao = fonteMes === 'snapshot' ? snapshotRowsSelecionado : liveRows;
  const metricasTabela = useMemo(() => {
    if (fonteMes === 'snapshot') return aggregateMetricsFromTableRows(snapshotRowsSelecionado);
    if (fonteMes === 'live') return metricasLiveSelecionado;
    return buildMetricsFromTotals(null, null, null);
  }, [fonteMes, snapshotRowsSelecionado, metricasLiveSelecionado]);

  const valorRebanhoExibido = metricasSelecionado.valor;
  const pesoTotalKgExibido = metricasSelecionado.pesoTotalKg;
  const pesoMedioGeralExibido = metricasSelecionado.pesoMedio;
  const totalCabecasExibido = metricasSelecionado.cabecas;
  const totalArrobasExibido = metricasSelecionado.totalArrobas;
  const precoMedioArrobaExibido = metricasSelecionado.precoArroba;
  const valorMedioCabecaExibido = metricasSelecionado.valorCabeca;

  // (variações individuais movidas para bloco unificado abaixo)

  const buildChartData = useCallback((getValue: (mes: number) => number | null) => {
    return CHART_LABELS.map((label, idx) => {
      const fullLabel = CHART_FULL_LABELS[idx];
      if (idx === 0) return { label, fullLabel, value: getValue(0) };
      const mes = idx;
      if (mes > mesNum) return { label, fullLabel, value: null };
      return { label, fullLabel, value: getValue(mes) };
    });
  }, [mesNum]);

  // Helper: get view-based physical metrics for a given month key
  const getViewMetricsForMonth = useCallback((mesKey: string): { cabecas: number; pesoKg: number } | null => {
    const [keyAno, keyMes] = mesKey.split('-').map(Number);
    const viewData = keyAno === Number(anoFiltro) ? viewDataAnoAtual : viewDataAnoAnterior;
    const viewRows = (viewData || []).filter(r => r.mes === keyMes);
    if (viewRows.length === 0) return null;
    let cabecas = 0;
    let pesoKg = 0;
    viewRows.forEach(r => {
      cabecas += r.saldo_final;
      pesoKg += r.saldo_final * (r.peso_medio_final || 0);
    });
    return { cabecas, pesoKg };
  }, [anoFiltro, viewDataAnoAtual, viewDataAnoAnterior]);

  const chartDataValor = useMemo(() => {
    return buildChartData((mes) => {
      if (mes === 0) return metricasDezBase?.valor ?? null;
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      if (mes === mesNum) return metricasSelecionado.valor;
      return buildFrozenMetrics(key)?.valor ?? null;
    });
  }, [buildChartData, anoFiltro, mesNum, metricasSelecionado.valor, buildFrozenMetrics, metricasDezBase]);

  const chartDataArrobas = useMemo(() => {
    return buildChartData((mes) => {
      if (mes === 0) return metricasDezBase?.totalArrobas ?? null;
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      if (mes === mesNum) return metricasSelecionado.totalArrobas;
      const vm = getViewMetricsForMonth(key);
      return vm ? vm.pesoKg / 30 : null;
    });
  }, [buildChartData, anoFiltro, mesNum, metricasSelecionado.totalArrobas, getViewMetricsForMonth, metricasDezBase]);

  const chartDataPrecoArroba = useMemo(() => {
    return buildChartData((mes) => {
      if (mes === 0) return metricasDezBase?.precoArroba ?? null;
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      if (mes === mesNum) return metricasSelecionado.precoArroba;
      const metrics = buildFrozenMetrics(key);
      return metrics?.precoArroba ?? null;
    });
  }, [buildChartData, anoFiltro, mesNum, metricasSelecionado.precoArroba, buildFrozenMetrics, metricasDezBase]);

  const handlePrecoChange = (codigo: string, value: string) => {
    const sanitized = value.replace(/[^0-9.,]/g, '');
    setPrecosDisplay(prev => ({ ...prev, [codigo]: sanitized }));
    const num = parseFloat(sanitized.replace(',', '.'));
    setPrecosLocal(prev => ({ ...prev, [codigo]: isNaN(num) ? 0 : num }));
  };

  const handlePrecoBlur = (codigo: string) => {
    const num = precosLocal[codigo] || 0;
    setPrecosDisplay(prev => ({ ...prev, [codigo]: fmtKg(num) }));
  };

  const handleSalvar = async () => {
    const semPreco = liveRows.filter(r => r.saldo > 0 && (!r.precoKg || r.precoKg <= 0));
    if (semPreco.length > 0) {
      const nomes = semPreco.map(r => r.nome).join(', ');
      toast.error(`Preencha o preço de: ${nomes}`);
      return;
    }

    const items = Object.entries(precosLocal).map(([categoria, preco_kg]) => ({ categoria, preco_kg }));
    const snapshotDetalhado: SnapshotDetalheCategoria[] = liveRows.map(row => ({
      categoria: row.codigo,
      quantidade: row.saldo,
      peso_medio_kg: row.pesoMedio,
      preco_kg: row.precoKg,
      valor_total_categoria: row.valorTotal,
    }));

    await salvarPrecos(items, totalRebanhoLive, pesoTotalKgLive, snapshotDetalhado);
  };

  const handleCopiarMesAnterior = async () => {
    const prev = await loadPrecosMesAnterior();
    if (prev.length === 0) {
      toast.info('Nenhum preço encontrado no mês anterior');
      return;
    }

    const numMap: Record<string, number> = { ...precosLocal };
    const strMap: Record<string, string> = { ...precosDisplay };

    prev.forEach(p => {
      const v = Number(p.preco_kg) || 0;
      numMap[p.categoria] = v;
      strMap[p.categoria] = fmtKg(v);
    });

    setPrecosLocal(numMap);
    setPrecosDisplay(strMap);
    toast.success(`${prev.length} preços copiados do mês anterior`);
  };

  const canEdit = fonteMes === 'live' && !isMesFuturo;
  const tabelaUsaSnapshot = fonteMes === 'snapshot';
  const avisoSnapshotIncompleto = fonteMes === 'snapshot_incompleto';
  const fazendaNome = fazendaAtual?.nome || '';

  // ---------------------------------------------------------------------------
  // Unified data: Global vs Individual
  // ---------------------------------------------------------------------------

  const uRows = isGlobal ? globalData.rows : rowsExibicao;
  const uMetricas = isGlobal ? globalData.metricas : metricasSelecionado;
  const uMetricasMesAnt = isGlobal ? globalData.metricasMesAnterior : metricasMesAnterior;
  const uMetricasInicioAno = isGlobal ? globalData.metricasInicioAno : metricasDezBase;
  const uBaseInicialIncompleta = isGlobal ? false : (isAnoInicial && baseInicialIncompleta);
  const uFonteMes = isGlobal ? globalData.fonteMes : fonteMes;
  const uHistoricoPorMes = isGlobal ? globalData.historicoPorMes : historicoPorMes;
  const { isReadOnly: isMesReadOnlyVR } = useMasterLock(anoMes);
  const masterReadOnlyVR = isMesReadOnlyVR(anoMes);
  const uCanEdit = isGlobal ? false : (canEdit && !masterReadOnlyVR);
  const uTabelaUsaSnapshot = isGlobal
    ? (globalData.fonteMes === 'snapshot')
    : tabelaUsaSnapshot;
  const uAvisoSnapshotIncompleto = isGlobal
    ? (globalData.fonteMes === 'snapshot_incompleto')
    : avisoSnapshotIncompleto;
  const uFazendaNome = isGlobal ? '🌐 Global' : (fazendaAtual?.nome || '');
  const uMesFechado = isGlobal
    ? (globalData.fonteMes === 'snapshot' || globalData.fonteMes === 'snapshot_incompleto')
    : mesSelecionadoFechado;

  // Variações
  const uVarValorMes = calcVariacaoNullable(uMetricas.valor, uMetricasMesAnt?.valor ?? null);
  const uVarValorAno = calcVariacaoNullable(uMetricas.valor, uMetricasInicioAno?.valor ?? null);
  const uVarCabMes = calcVariacaoNullable(uMetricas.cabecas, uMetricasMesAnt?.cabecas ?? null);
  const uVarCabAno = calcVariacaoNullable(uMetricas.cabecas, uMetricasInicioAno?.cabecas ?? null);
  const uVarPesoMes = calcVariacaoNullable(uMetricas.pesoMedio, uMetricasMesAnt?.pesoMedio ?? null);
  const uVarPesoAno = calcVariacaoNullable(uMetricas.pesoMedio, uMetricasInicioAno?.pesoMedio ?? null);
  const uVarArrobaMes = calcVariacaoNullable(uMetricas.precoArroba, uMetricasMesAnt?.precoArroba ?? null);
  const uVarArrobaAno = calcVariacaoNullable(uMetricas.precoArroba, uMetricasInicioAno?.precoArroba ?? null);
  const uVarCabValorMes = calcVariacaoNullable(uMetricas.valorCabeca, uMetricasMesAnt?.valorCabeca ?? null);
  const uVarCabValorAno = calcVariacaoNullable(uMetricas.valorCabeca, uMetricasInicioAno?.valorCabeca ?? null);
  const uVarArrobasEstoqueMes = calcVariacaoNullable(uMetricas.totalArrobas, uMetricasMesAnt?.totalArrobas ?? null);
  const uVarArrobasEstoqueAno = calcVariacaoNullable(uMetricas.totalArrobas, uMetricasInicioAno?.totalArrobas ?? null);

  // Métricas da tabela
  const uMetricasTabela = isGlobal
    ? (uFonteMes === 'snapshot_incompleto' ? buildMetricsFromTotals(null, null, null) : (() => {
        const cabecas = uRows.reduce((s, r) => s + r.saldo, 0);
        const pesoTotalKg = uRows.reduce((s, r) => s + r.saldo * r.pesoMedio, 0);
        const valor = uRows.reduce((s, r) => s + r.valorTotal, 0);
        return buildMetricsFromTotals(cabecas > 0 ? valor : null, cabecas > 0 ? cabecas : null, cabecas > 0 ? pesoTotalKg : null);
      })())
    : metricasTabela;

  // Charts — global
  const uChartDataValor = useMemo(() => {
    if (!isGlobal) return chartDataValor;
    const dezKey = `${Number(anoFiltro) - 1}-12`;
    return CHART_LABELS.map((label, idx) => {
      const fullLabel = CHART_FULL_LABELS[idx];
      if (idx === 0) return { label, fullLabel, value: uHistoricoPorMes[dezKey]?.valor ?? null };
      const mes = idx;
      if (mes > mesNum) return { label, fullLabel, value: null };
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      if (mes === mesNum && globalData.fonteMes === 'live') {
        return { label, fullLabel, value: uMetricas.valor };
      }
      return { label, fullLabel, value: uHistoricoPorMes[key]?.valor ?? null };
    });
  }, [isGlobal, chartDataValor, anoFiltro, mesNum, globalData.fonteMes, uMetricas.valor, uHistoricoPorMes]);

  const uChartDataArrobas = useMemo(() => {
    if (!isGlobal) return chartDataArrobas;
    const dezKey = `${Number(anoFiltro) - 1}-12`;
    return CHART_LABELS.map((label, idx) => {
      const fullLabel = CHART_FULL_LABELS[idx];
      if (idx === 0) {
        const frozen = uHistoricoPorMes[dezKey];
        return { label, fullLabel, value: frozen ? frozen.pesoKg / 30 : null };
      }
      const mes = idx;
      if (mes > mesNum) return { label, fullLabel, value: null };
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      if (mes === mesNum && globalData.fonteMes === 'live') {
        return { label, fullLabel, value: uMetricas.totalArrobas };
      }
      const frozen = uHistoricoPorMes[key];
      return { label, fullLabel, value: frozen ? frozen.pesoKg / 30 : null };
    });
  }, [isGlobal, chartDataArrobas, anoFiltro, mesNum, globalData.fonteMes, uMetricas.totalArrobas, uHistoricoPorMes]);

  const uChartDataPrecoArroba = useMemo(() => {
    if (!isGlobal) return chartDataPrecoArroba;
    const dezKey = `${Number(anoFiltro) - 1}-12`;
    return CHART_LABELS.map((label, idx) => {
      const fullLabel = CHART_FULL_LABELS[idx];
      if (idx === 0) {
        const frozen = uHistoricoPorMes[dezKey];
        return { label, fullLabel, value: frozen && frozen.pesoKg > 0 ? frozen.valor / (frozen.pesoKg / 30) : null };
      }
      const mes = idx;
      if (mes > mesNum) return { label, fullLabel, value: null };
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      if (mes === mesNum && globalData.fonteMes === 'live') {
        return { label, fullLabel, value: uMetricas.precoArroba };
      }
      const frozen = uHistoricoPorMes[key];
      return { label, fullLabel, value: frozen && frozen.pesoKg > 0 ? frozen.valor / (frozen.pesoKg / 30) : null };
    });
  }, [isGlobal, chartDataPrecoArroba, anoFiltro, mesNum, globalData.fonteMes, uMetricas.precoArroba, uHistoricoPorMes]);

  const mesLabel = MESES_COLS.find(m => m.key === mesFiltro)?.label || mesFiltro;

  if (bloqueado) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <span className="text-4xl">🐄</span>
        <p className="font-medium text-base">Esta fazenda não possui operação pecuária</p>
        <p className="text-sm">Selecione uma fazenda com pecuária para visualizar os dados zootécnicos.</p>
      </div>
    );
  }

  if (!isGlobal && loadingFechamento) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const mostrarOverlayP1 = !isGlobal && !loadingFechamento && !p1Fechado;

  return (
    <div className="p-2 w-full space-y-1.5 animate-fade-in pb-16">
      {/* ⚠ O INÍCIO NÃO RECEBE O CADEADO DO MÊS: ele não é um mês, é a base. O banner falava de
          "2021-09 fechado" sobre um retrato de 1º de janeiro, e o overlay o deixava esmaecido como
          se houvesse algo a editar ali. */}
      {/* ⚠ A LINHA DE 22px FICA RESERVADA quando o mês está aberto (A23): sem ela, fechar um mês
          empurrava a tela inteira 22px para baixo, e o operador perdia o lugar onde estava lendo. */}
      {!verInicio && (
        isGlobal
          ? <div style={{ height: 22 }} aria-hidden />
          : <div style={{ minHeight: 22 }}><MasterLockBanner anoMes={anoMes} compacto /></div>
      )}
      <div className="flex gap-1.5 items-center flex-wrap">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        {/* ⚠ O SELETOR DE ANO APARECE SEMPRE — VALOR-REBANHO-COMPACTO-01, e é MUDANÇA DE
            COMPORTAMENTO. Ele era escondido por `{!filtroAnoInicial && …}`: quem chegava pelo link
            "Corrigir preços" do DRE ficava preso no ano que o link mandou, justamente quem mais
            precisa navegar para conferir o ano vizinho. A prop continua SEMEANDO o estado na
            montagem; ela nunca foi uma segunda fonte, só escondia o controle. */}
        <div className="flex h-5 shrink-0 items-center gap-0.5 rounded border bg-card px-0.5">
          <button type="button" aria-label="Ano anterior"
            onClick={() => setAnoFiltro(a => String(Number(a) - 1))}
            className="px-1 text-[11px] leading-none text-muted-foreground hover:text-foreground">◂</button>
          <span className="min-w-[30px] text-center text-[10px] font-semibold tabular-nums">{anoFiltro}</span>
          <button type="button" aria-label="Próximo ano"
            onClick={() => setAnoFiltro(a => String(Number(a) + 1))}
            className="px-1 text-[11px] leading-none text-muted-foreground hover:text-foreground">▸</button>
        </div>

        {!verInicio && uCanEdit && !isGlobal && (
          <Button variant="outline" size="sm" onClick={handleCopiarMesAnterior} className="gap-1 h-7 text-xs px-2">
            <Copy className="h-3 w-3" /> Mês anterior
          </Button>
        )}

        {!verInicio && isMesFuturo && (
          <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Futuro
          </Badge>
        )}

        {/* ⚠ AS PÍLULAS DE ESTADO DO MÊS SOMEM NO INÍCIO — VALOR-REBANHO-COMPACTO-01. "Fechado",
            "Live", "Reabrir" e "Salvar e Fechar" falam de um MÊS que se pode abrir e fechar; o
            retrato de 1º de janeiro não é um. A do Início é "Base", e mora na faixa dele. */}
        {!verInicio && !isMesFuturo && uMesFechado && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Lock className="h-3 w-3" /> Fechado
            {isGlobal && ` (${globalData.fazendasFechadas}/${globalData.fazendasTotal})`}
          </Badge>
        )}

        {!verInicio && !isMesFuturo && !uMesFechado && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Info className="h-3 w-3" /> Live
          </Badge>
        )}

        {isGlobal && globalData.fonteMes === 'misto' && (
          <Badge variant="outline" className="gap-1 text-xs border-amber-500/50 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> Misto ({globalData.fazendasFechadas}/{globalData.fazendasTotal} fechadas)
          </Badge>
        )}

        <div className="ml-auto flex gap-1.5">
          {!verInicio && !isGlobal && !isMesFuturo && mesSelecionadoFechado && isAdmin && (
            <Button variant="outline" size="sm" onClick={reabrirFechamento} className="gap-1 h-7 text-xs px-2">
              <Unlock className="h-3 w-3" /> Reabrir
            </Button>
          )}
          {!verInicio && uCanEdit && !isGlobal && (
            <Button size="sm" onClick={handleSalvar} disabled={saving} className="gap-1 h-7 text-xs px-3">
              <Save className="h-3 w-3" />
              {saving ? 'Salvando...' : 'Salvar e Fechar'}
            </Button>
          )}
        </div>
      </div>

      {/* ⚠ O INÍCIO É O PRIMEIRO DA RÉGUA, e fica nela e não fora: ele é o ponto de partida da
          mesma série que os doze meses continuam. Um controle à parte o faria parecer outra tela. */}
      <div className="flex gap-0.5 bg-muted/30 rounded-md p-0.5 border">
        <button type="button" onClick={() => setVerInicio(true)}
          title="Retrato de 1º de janeiro — o saldo inicial do ano"
          className={`shrink-0 rounded px-2 text-center text-[10px] font-semibold transition-colors
            ${verInicio ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-card text-muted-foreground hover:bg-muted'}`}
          style={{ flex: 1.3, paddingTop: 4, paddingBottom: 4 }}>
          Início
        </button>
        {MESES_SHORT.map(m => {
          const mesKey = `${anoFiltro}-${m.key}`;
          const isClosed = isGlobal ? !!uHistoricoPorMes[mesKey] : !!historicoPorMes[mesKey];
          /* ⚠ NO INÍCIO NENHUM MÊS FICA ACESO: dois navy na mesma régua diriam que a tela
             mostra os dois. O mês escolhido é LEMBRADO — trocar de ano o mantém. */
          const isSelected = !verInicio && mesFiltro === m.key;
          const mesN = Number(m.key);
          const isFuturo = anoNumFiltro > anoAtualSistema || (anoNumFiltro === anoAtualSistema && mesN > mesAtualSistema);
          const mesSnapStatus = !isGlobal ? getSnapStatus(mesN) : 'sem_snapshot';
          const isComprometido = mesSnapStatus === 'invalidado' || mesSnapStatus === 'cadeia_quebrada';
          return (
            <button
              key={m.key}
              onClick={() => { setMesFiltro(m.key); setVerInicio(false); }}
              title={isComprometido ? (mesSnapStatus === 'invalidado' ? 'Snapshot invalidado' : 'Cadeia quebrada') : undefined}
              className={`flex-1 text-center text-[11px] font-semibold py-1 rounded transition-colors
                ${isSelected
                  ? isComprometido
                    ? 'bg-destructive text-destructive-foreground shadow-sm'
                    : 'bg-primary text-primary-foreground shadow-sm'
                  : isFuturo
                    ? 'bg-muted/40 text-muted-foreground/50 cursor-default'
                    : isComprometido
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                      : isClosed
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40'
                }`}
            >
              {isComprometido ? '⚠' : ''}{m.label}
              {isSelected && (
                <span className="absolute -top-1 -right-1 inline-block">
                  <MesAnteriorAvisoIcon
                    fazendaId={fazendaId}
                    anoMes={mesKey}
                    size={12}
                  />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ⚠ O INÍCIO SUBSTITUI O CORPO, não convive com ele: os dois mostram o MESMO tipo de tabela
          para datas diferentes, e empilhá-los faria o operador somar as duas. */}
      {verInicio ? (
        <CardInicio ano={Number(anoFiltro)} inicio={inicio} carregando={carregandoInicio}
          fazendaNome={isGlobal ? 'Global' : (fazendaAtual?.nome ?? '—')} />
      ) : (
      <div className="relative">
        <div className={mostrarOverlayP1 ? 'opacity-40 pointer-events-none' : ''}>

      {/* Snapshot governance banner */}
      {!isGlobal && (isSnapInvalidado || isSnapCadeiaQuebrada) && (
        <SnapshotStatusBanner
          status={snapStatusMes}
          mesLabel={`${mesLabel}/${anoFiltro}`}
          onRevalidar={isSnapInvalidado ? () => {
            qc.invalidateQueries({ queryKey: ['valor-rebanho-snapshot', fazendaId, anoFiltro, mesFiltro] });
            qc.invalidateQueries({ queryKey: ['fechamento-status', fazendaId, anoFiltro] });
          } : undefined}
          onIrMesAnterior={isSnapCadeiaQuebrada ? () => {
            const mesAtualNum = Number(mesFiltro);
            const mesAnterior = mesAtualNum === 1 ? 12 : mesAtualNum - 1;
            const anoAnterior = mesAtualNum === 1 ? Number(anoFiltro) - 1 : Number(anoFiltro);
            setAnoFiltro(String(anoAnterior));
            setMesFiltro(String(mesAnterior).padStart(2, '0'));
          } : undefined}
        />
      )}

      {isMesAtual && !isMesFuturo && uFonteMes === 'live' && (
        <div className="flex items-center gap-1.5 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded px-2 py-1 border border-amber-500/30">
          <Info className="h-3 w-3 shrink-0" />
          <span>Mês atual em andamento — valores parciais até o fechamento oficial.</span>
        </div>
      )}

      {uFonteMes === 'live' && !isMesFuturo && !isMesAtual && (
        <div className="flex items-center gap-1.5 text-[10px] bg-muted/40 text-muted-foreground rounded px-2 py-1 border">
          <Info className="h-3 w-3 shrink-0" />
          <span>{isGlobal ? 'Mês aberto: valores consolidados de todas as fazendas em cálculo live.' : 'Mês aberto: tabela, card e gráficos exibem cálculo live até o fechamento oficial.'}</span>
        </div>
      )}

      {uAvisoSnapshotIncompleto && (
        <div className="flex items-center gap-1.5 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded px-2 py-1 border border-amber-500/30">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{isGlobal
            ? 'Nem todas as fazendas possuem snapshot detalhado para este mês. Reabra e salve em cada fazenda individualmente.'
            : 'Mês fechado sem snapshot detalhado. Reabra e salve novamente para consolidar a base oficial.'}</span>
        </div>
      )}

      {uFonteMes === 'live' && isDezembro && !isGlobal && categoriasSemPreco.length > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] bg-destructive/10 text-destructive rounded px-2 py-0.5 border border-destructive/30">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span><strong>Dezembro — base anual:</strong> {categoriasSemPreco.length} categoria(s) sem preço: {categoriasSemPreco.join(', ')}.</span>
        </div>
      )}

      <div className="relative">
        {semRebanhoNoPeriodo && !isMesFuturo && (
          <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-[1px] rounded-lg flex flex-col items-center justify-center gap-1.5">
            <AlertTriangle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-semibold text-muted-foreground">Sem rebanho no período selecionado</p>
            <p className="text-[10px] text-muted-foreground/70">Esta fazenda não possui animais neste mês/ano.</p>
          </div>
        )}
        {isMesFuturo && (
          <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-[1px] rounded-lg flex flex-col items-center justify-center gap-1.5">
            <Lock className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-semibold text-muted-foreground">Mês ainda não aberto</p>
            <p className="text-[10px] text-muted-foreground/70">Apenas o mês vigente pode ser alimentado.</p>
          </div>
        )}
      {/* ⚠ GRID DE LARGURA FIXA — VALOR-REBANHO-COMPACTO-02. Era `flex-1 max-w-[50%]`: a tabela
          mudava de largura conforme o conteúdo dos indicadores ao lado, então trocar de mês movia
          as colunas. A lei de estabilidade pede que nada ande ao trocar mês, ano ou fazenda. */}
      <div className="flex flex-wrap gap-2 items-start">
        <div className="shrink-0 bg-card rounded border overflow-hidden" style={{ width: COLS_CAT_VR.reduce((a, w) => a + w, 0) }}>
          <table className="border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>{COLS_CAT_VR.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead>
              <tr style={{ height: 16 }}>
                {['Categoria', 'Qtd', 'Peso', 'R$/kg', 'R$/@', 'R$/cab', 'Valor total'].map((r, i) => (
                  <th key={r} className={`truncate px-1.5 py-0 font-semibold text-white ${i === 0 ? 'text-left' : 'text-right'}`}
                    style={{ backgroundColor: '#2C3E5C', fontSize: 9, lineHeight: 1 }}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {uAvisoSnapshotIncompleto ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-[10px] text-muted-foreground">
                    {isGlobal
                      ? 'Nem todas as fazendas possuem snapshot detalhado. Reabra e salve em cada fazenda.'
                      : 'Mês fechado sem snapshot detalhado. Reabra e salve novamente para consolidar a base oficial.'}
                  </td>
                </tr>
              ) : (
                uRows.map((r, i) => (
                  <tr key={r.codigo} style={{ height: 13, backgroundColor: i % 2 === 0 ? '#F5F4F0' : undefined }}>
                    <td className="truncate px-1.5 py-0 text-left" title={r.nome}
                      style={{ fontSize: 9, lineHeight: 1 }}>
                      {r.nome}
                    </td>
                    <td className="truncate px-1.5 py-0 text-right tabular-nums" style={{ fontSize: 9, lineHeight: 1 }}>
                      {r.saldo > 0 ? formatNum(r.saldo, 0) : '-'}
                    </td>
                    <td className="truncate px-1.5 py-0 text-right tabular-nums" style={{ fontSize: 9, lineHeight: 1 }}>
                      {r.saldo > 0 && r.pesoMedio > 0 ? (
                        (uTabelaUsaSnapshot || isGlobal) ? (
                          <span className="text-foreground">{formatNum(r.pesoMedio, 2)}</span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`cursor-help ${r.origemPeso === 'pastos' ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {formatNum(r.pesoMedio, 2)}
                                {r.origemPeso !== 'pastos' && ' *'}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Fonte: {ORIGEM_LABEL[r.origemPeso]}
                            </TooltipContent>
                          </Tooltip>
                        )
                      ) : '-'}
                    </td>
                    {/* ⚠ A CÉLULA EDITÁVEL SÓ MUDA DE TAMANHO — o `handlePrecoChange`, o
                        `handlePrecoBlur`, o `value` e o `disabled` são os MESMOS. Ela é a única da
                        tabela que carrega um `<input>`, e por isso a coluna não encolhe abaixo
                        dele: 11px de altura de caixa dentro de uma linha de 13. */}
                    {/* ⚠ A `td` PRECISA DO PRÓPRIO `fontSize`/`lineHeight`: sem eles ela herda os
                        16px/24px do documento, e 24 de line-height fixa a linha em 18 mesmo com o
                        input em 12. Medido — o input não era o culpado. */}
                    <td className="px-0.5 py-0" style={{ fontSize: 9, lineHeight: 1 }}>
                      {(uTabelaUsaSnapshot || isGlobal) ? (
                        <span className="block truncate px-1 text-right tabular-nums" style={{ fontSize: 9, lineHeight: 1 }}>
                          {r.saldo > 0 && r.precoKg > 0 ? formatNum(r.precoKg, 2) : '-'}
                        </span>
                      ) : r.saldo > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Input
                              type="text"
                              inputMode="decimal"
                              /* ⚠ 12px E `py-0`: com 11 declarado o input renderizava 14 (borda mais
                                 o padding do componente) e a LINHA ia a 18, contra os 13 das linhas
                                 sem input — mês aberto e mês fechado com réguas diferentes. Medido
                                 na tela em 24/09. */
                              className={`h-3 py-0 text-right !text-[9px] leading-none tabular-nums px-1 w-full ${r.isSugerido ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20' : ''}`}
                              placeholder="0,00"
                              value={precosDisplay[r.codigo] !== undefined ? precosDisplay[r.codigo] : fmtKg(r.precoKg)}
                              onChange={e => handlePrecoChange(r.codigo, e.target.value)}
                              onBlur={() => handlePrecoBlur(r.codigo)}
                              disabled={!uCanEdit}
                            />
                          </TooltipTrigger>
                          {r.isSugerido && (
                            <TooltipContent side="top" className="text-xs max-w-[200px]">
                              Preço sugerido pelo mercado. Edite se necessário.
                            </TooltipContent>
                          )}
                        </Tooltip>
                      ) : (
                        <span className="block text-right text-muted-foreground" style={{ fontSize: 9, lineHeight: 1 }}>-</span>
                      )}
                    </td>
                    <td className="truncate px-1.5 py-0 text-right tabular-nums" style={{ fontSize: 9, lineHeight: 1 }}>
                      {r.precoArroba > 0 ? formatMoeda(r.precoArroba) : '-'}
                    </td>
                    <td className="truncate px-1.5 py-0 text-right tabular-nums" style={{ fontSize: 9, lineHeight: 1 }}>
                      {r.valorCabeca > 0 ? formatMoeda(r.valorCabeca) : '-'}
                    </td>
                    <td className="truncate px-1.5 py-0 text-right tabular-nums" style={{ fontSize: 9, lineHeight: 1 }}>
                      {r.valorTotal > 0 ? formatMoeda(r.valorTotal) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr style={{ height: 16, backgroundColor: '#D6D4CC' }}>
                <td className="truncate px-1.5 py-0 text-left font-medium" style={{ fontSize: 10, lineHeight: 1 }}>Total</td>
                <td className="truncate px-1.5 py-0 text-right font-medium tabular-nums" style={{ fontSize: 10, lineHeight: 1 }}>{formatNumNullable(uMetricasTabela.cabecas, 0)}</td>
                <td className="truncate px-1.5 py-0 text-right font-medium tabular-nums" style={{ fontSize: 10, lineHeight: 1 }}>{formatNumNullable(uMetricasTabela.pesoMedio, 2)}</td>
                <td className="truncate px-1.5 py-0 text-right font-medium tabular-nums" style={{ fontSize: 10, lineHeight: 1 }}>
                  {formatNumNullable(uMetricasTabela.precoKg, 2)}
                </td>
                <td className="truncate px-1.5 py-0 text-right font-medium tabular-nums" style={{ fontSize: 10, lineHeight: 1 }}>{formatMoedaNullable(uMetricasTabela.precoArroba)}</td>
                <td className="truncate px-1.5 py-0 text-right font-medium tabular-nums" style={{ fontSize: 10, lineHeight: 1 }}>{formatMoedaNullable(uMetricasTabela.valorCabeca)}</td>
                <td className="truncate px-1.5 py-0 text-right font-medium tabular-nums" style={{ fontSize: 10, lineHeight: 1 }}>{formatMoedaNullable(uMetricasTabela.valor)}</td>
              </tr>
            </tfoot>
          </table>

          {uFonteMes === 'live' && !isGlobal && (
            <div className="flex items-center justify-end px-1.5 py-0.5 border-t">
              <p className="text-[9px] text-muted-foreground">
                * Peso estimado
                {isDezembro && ' • Dez = base anual'}
              </p>
            </div>
          )}

          {uFonteMes === 'live' && !isGlobal && (temSugestao || temEstimativa || dezembroCompleto) && (
            <div className="px-1.5 pb-1 space-y-0.5">
              {temSugestao && (
                <p className="text-[9px] text-amber-600 dark:text-amber-400">
                  ⚠ Preço de mercado sugerido. Valor definitivo após validação do fechamento.
                </p>
              )}
              {temEstimativa && (
                <p className="text-[9px] text-muted-foreground">
                  * Algumas categorias usam peso estimado (último lançamento ou saldo inicial).
                </p>
              )}
              {dezembroCompleto && (
                <p className="text-[9px] text-primary">
                  ✔ Base anual completa. Todas as categorias têm preço informado para dezembro.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="w-full lg:min-w-[200px] lg:flex-1 space-y-1.5">
          {uAvisoSnapshotIncompleto ? (
            <Card className="bg-amber-500/10 border-amber-500/30">
              <CardContent className="p-4 flex flex-col items-center justify-center gap-2 text-center">
                <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {isGlobal ? 'Snapshot incompleto' : 'Mês fechado sem snapshot detalhado'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {isGlobal
                    ? 'Nem todas as fazendas possuem snapshot detalhado. Acesse cada fazenda individualmente para reabrir e salvar.'
                    : 'Reabra e salve novamente para consolidar a base oficial. Nenhum valor será exibido até que o snapshot completo seja gerado.'}
                </p>
              </CardContent>
            </Card>
          ) : (
          <>
          {/* ⚠ OS INDICADORES VIRARAM TABELA — VALOR-REBANHO-COMPACTO-02, e é a mesma forma da
              tabela ao lado: cabeçalho escuro, faixa de título azul-clara, números à direita. Eram
              um card com número de 20px e um grid de spans, que ocupava o dobro da altura para
              dizer o mesmo. Os VALORES e as VARIAÇÕES são os mesmos — `uMetricas` e os `uVar*`
              intactos; o `VariacaoBadge` continua sendo quem pinta o sinal. */}
          <div className="shrink-0 overflow-hidden rounded border bg-card"
            style={{ width: COLS_IND_VR.reduce((x, w) => x + w, 0) }}>
            <div className="truncate px-1.5 py-0 font-medium"
              style={{ height: 16, lineHeight: '16px', fontSize: 9, backgroundColor: '#E9EFF6', color: '#0C447C' }}>
              Valor do rebanho · {mesLabel}/{String(anoFiltro).slice(2)}{uFazendaNome ? ` · ${uFazendaNome}` : ''}
            </div>
            <div className="flex items-baseline justify-between gap-1 px-1.5" style={{ height: 22 }}>
              <span className="truncate font-medium tabular-nums" style={{ fontSize: 14 }}>
                {formatMoedaNullable(uMetricas.valor)}
              </span>
              <span className="flex shrink-0 items-baseline gap-1.5" style={{ fontSize: 9 }}>
                <VariacaoBadge valor={uVarValorMes} label="mês" showLabel />
                {uBaseInicialIncompleta
                  ? <span className="font-semibold text-amber-600 dark:text-amber-400">base incompleta</span>
                  : <VariacaoBadge valor={uVarValorAno} label="ano" showLabel />}
              </span>
            </div>
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>{COLS_IND_VR.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead>
                <tr style={{ height: 16 }}>
                  {['', 'Valor', 'vs mês', 'vs ini. ano'].map((r, i) => (
                    <th key={r} className={`truncate px-1.5 py-0 font-semibold text-white ${i === 0 ? 'text-left' : 'text-right'}`}
                      style={{ backgroundColor: '#2C3E5C', fontSize: 9, lineHeight: 1 }}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Cabeças', value: formatNumNullable(uMetricas.cabecas, 0), varMes: uVarCabMes, varAno: uVarCabAno },
                  { label: 'Peso médio', value: uMetricas.pesoMedio === null ? '—' : `${formatNum(uMetricas.pesoMedio, 2)} kg`, varMes: uVarPesoMes, varAno: uVarPesoAno },
                  { label: 'R$/@', value: formatMoedaNullable(uMetricas.precoArroba), varMes: uVarArrobaMes, varAno: uVarArrobaAno },
                  { label: 'R$/cab', value: formatMoedaNullable(uMetricas.valorCabeca), varMes: uVarCabValorMes, varAno: uVarCabValorAno },
                  { label: '@ em estoque', value: formatNumNullable(uMetricas.totalArrobas, 2), varMes: uVarArrobasEstoqueMes, varAno: uVarArrobasEstoqueAno },
                ].map(ind => (
                  <tr key={ind.label} style={{ height: 16 }}>
                    <td className="truncate px-1.5 py-0 text-left text-muted-foreground" style={{ fontSize: 9, lineHeight: 1 }}>{ind.label}</td>
                    <td className="truncate px-1.5 py-0 text-right tabular-nums" style={{ fontSize: 9, lineHeight: 1 }}>{ind.value}</td>
                    <td className="truncate px-1.5 py-0 text-right" style={{ fontSize: 9, lineHeight: 1 }}>
                      <VariacaoBadge valor={ind.varMes} label="" />
                    </td>
                    <td className="truncate px-1.5 py-0 text-right" style={{ fontSize: 9, lineHeight: 1 }}>
                      {/* ⚠ TRAÇO QUANDO A BASE DO ANO ESTÁ INCOMPLETA: sem o 1º de janeiro inteiro
                          não há contra o que comparar, e um número ali seria comparação com meia
                          base. É a mesma regra do card Início. */}
                      {uBaseInicialIncompleta ? '—' : <VariacaoBadge valor={ind.varAno} label="" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex w-full gap-2">
            <MiniChart data={uChartDataValor} color="hsl(var(--primary))" title="Valor do rebanho" unit="currency" />
            <MiniChart data={uChartDataArrobas} color="hsl(142, 71%, 45%)" title="Arrobas em estoque" unit="arroba" />
            <MiniChart data={uChartDataPrecoArroba} color="hsl(217, 91%, 60%)" title="R$/@ médio" unit="currency" />
          </div>
          </>
          )}
        </div>
      </div>
      </div>

        </div>
        {mostrarOverlayP1 && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-16 pointer-events-none">
            <Card className="pointer-events-auto max-w-md mx-4 shadow-xl border-amber-300 dark:border-amber-700">
              <CardContent className="p-6 text-center space-y-3">
                <Lock className="h-8 w-8 mx-auto text-amber-600 dark:text-amber-400" />
                <p className="text-sm font-medium">
                  Feche os pastos deste mês primeiro para inserir o valor do rebanho.
                </p>
                {onNavigateToMovimentacoes && (
                  <Button size="sm" onClick={onNavigateToMovimentacoes} className="gap-1">
                    Ir para Mapa de Pastos
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      )}

      {/* Footer de atalhos do fluxo de fechamento */}
      {(onNavigateToFechamentoPastos || onNavigateToMovimentacoes) && (
        <FluxoFechamentoFooter
          current="valor_rebanho"
          onPrev={onNavigateToFechamentoPastos}
        />
      )}
    </div>
  );
}
