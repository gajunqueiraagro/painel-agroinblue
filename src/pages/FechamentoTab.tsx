import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, CheckCircle, AlertTriangle, Lock, Unlock, Pencil, BarChart3, Lightbulb, Activity, Map as MapIcon } from 'lucide-react';
import { ResumoAtividadesView } from '@/components/ResumoAtividadesView';
import { usePastos, type Pasto } from '@/hooks/usePastos';
import { useFechamento, type FechamentoPasto, type FechamentoItem } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRedirecionarPecuaria } from '@/hooks/useRedirecionarPecuaria';
import { usePermissions } from '@/hooks/usePermissions';
import { useLancamentos } from '@/hooks/useLancamentos';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatAnoMes } from '@/lib/dateUtils';
import { MESES_COLS } from '@/lib/calculos/labels';
import { isPastoPecuario, isPastoOperacional, getTipoUsoEfetivo, isPastoDivergencia } from '@/lib/classificacaoArea';
import { FechamentoPastoDialog } from '@/components/FechamentoPastoDialog';
import { useReclassificacaoState, ReclassificacaoFormFields } from '@/components/ReclassificacaoForm';
import { ReclassificacaoResumoPanel } from '@/components/ReclassificacaoResumoPanel';
import { MapaRebanhoImportDialog, type MapaItem } from '@/components/MapaRebanhoImportDialog';
import { calcUA } from '@/lib/calculos/zootecnicos';
import { formatNum } from '@/lib/calculos/formatters';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { gerarSugestoes, type Sugestao } from '@/lib/calculos/sugestoesConciliacao';
import { useZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';

/* ── Colunas de categorias ── */
const CAT_COLS = [
  { codigo: 'mamotes_m', sigla: 'MM', nome: 'Mamotes M' },
  { codigo: 'desmama_m', sigla: 'DM', nome: 'Desmama M' },
  { codigo: 'garrotes', sigla: 'G', nome: 'Garrotes' },
  { codigo: 'bois', sigla: 'B', nome: 'Bois' },
  { codigo: 'touros', sigla: 'T', nome: 'Touros' },
  { codigo: 'mamotes_f', sigla: 'MF', nome: 'Mamotes F' },
  { codigo: 'desmama_f', sigla: 'DF', nome: 'Desmama F' },
  { codigo: 'novilhas', sigla: 'N', nome: 'Novilhas' },
  { codigo: 'vacas', sigla: 'V', nome: 'Vacas' },
];

/* ── Status de conciliação por pasto ── */
type PastoStatusConcil = 'nao_iniciado' | 'em_edicao' | 'inconsistente' | 'conciliado' | 'fechado';

// Cor regra:
//   - fechado     → verde (oficial, único caso de verde)
//   - conciliado  → amarelo (rascunho com itens batendo, NÃO fechado oficialmente)
//   - inconsistente → laranja (rascunho com divergência)
//   - em_edicao   → azul (em edição)
//   - nao_iniciado → cinza/neutro
const STATUS_CARD_CLASSES: Record<PastoStatusConcil, string> = {
  nao_iniciado: 'bg-muted/50 border-border',
  em_edicao: 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700',
  inconsistente: 'bg-orange-50 dark:bg-orange-950/30 border-orange-400 dark:border-orange-600',
  conciliado: 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700',
  fechado: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-500 dark:border-emerald-500',
};

const STATUS_ICON: Record<PastoStatusConcil, string> = {
  nao_iniciado: '○',
  em_edicao: '…',
  inconsistente: '!',
  conciliado: '⏳',
  fechado: '✓',
};

const STATUS_ICON_COLOR: Record<PastoStatusConcil, string> = {
  nao_iniciado: 'text-muted-foreground',
  em_edicao: 'text-blue-600 dark:text-blue-400',
  inconsistente: 'text-orange-600 dark:text-orange-400',
  conciliado: 'text-amber-700 dark:text-amber-400',
  fechado: 'text-emerald-700 dark:text-emerald-300',
};

interface PastoResumo {
  totalCabecas: number;
  pesoMedio: number | null;
  uaHa: number | null;
  uaTotal: number;
  catBreakdown: { sigla: string; qty: number; pesoMedio: number | null }[];
  lotacaoKgHa: number | null;
}

interface Props {
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
  onBackToConciliacao?: () => void;
  onNavigateToReclass?: (filtro?: { ano: string; mes: number }) => void;
  onNavigateToValorRebanho?: (filtro: { ano: string; mes: number }) => void;
  onNavigateToConferenciaGmd?: (filtro: { ano: string; mes: number }) => void;
  onNavigateToMapaPastos?: (filtro: { ano: string; mes: number }) => void;
}

const FECHAMENTO_GLOBAL_MARKER = 'fechamento_global_administrativo';

const normalizeTipoUso = (tipoUso?: string) => {
  if (!tipoUso) return '';
  return tipoUso.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
};

/* Classificação de áreas centralizada em @/lib/classificacaoArea.ts */

/* ── GMD color ── */
function gmdColor(gmd: number | null): string {
  if (gmd == null) return 'text-muted-foreground';
  if (gmd < 0.3) return 'text-red-600 dark:text-red-400';
  if (gmd < 0.6) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

export function FechamentoTab({ filtroAnoInicial, filtroMesInicial, onBackToConciliacao, onNavigateToReclass, onNavigateToValorRebanho, onNavigateToConferenciaGmd, onNavigateToMapaPastos }: Props = {}) {
  const { isGlobal, fazendaAtual } = useFazenda();
  const { bloqueado } = useRedirecionarPecuaria();
  const { canEdit } = usePermissions();

  const { pastos, categorias } = usePastos();
  const { lancamentos, saldosIniciais, adicionarLancamento } = useLancamentos();
  const { fechamentos, loading, loadFechamentos, criarFechamento, loadItens, salvarItens, fecharPasto, reabrirPasto, copiarMesAnterior } = useFechamento();
  const { user } = useAuth();

  const anosDisp = useMemo(() => {
    const set = new Set<string>();
    const curYear = new Date().getFullYear();
    for (let y = curYear; y >= curYear - 3; y--) set.add(String(y));
    lancamentos.forEach(l => { try { set.add(l.data.substring(0, 4)); } catch {} });
    saldosIniciais.forEach(s => set.add(String(s.ano)));
    return Array.from(set).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const anoNum2 = Number(anoFiltro);
  const mesDefault = filtroMesInicial || (anoNum2 === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);
  const [mesFiltro, setMesFiltro] = useState(mesDefault);
  const anoMes = `${anoFiltro}-${String(mesFiltro).padStart(2, '0')}`;

  // FONTE OFICIAL: view zootécnica para saldo por movimentações (conciliação)
  const { data: viewDataForConcil } = useZootCategoriaMensal({ ano: anoNum2, cenario: 'realizado' });
  // Fonte oficial (com overlay de fechamento) para GMD e produção biológica.
  const { rawCategorias: rebanhoRows } = useRebanhoOficial({ ano: anoNum2, cenario: 'realizado' });

  useEffect(() => {
    if (filtroAnoInicial) setAnoFiltro(filtroAnoInicial);
    if (filtroMesInicial) setMesFiltro(filtroMesInicial);
  }, [filtroAnoInicial, filtroMesInicial]);

  const [selectedPasto, setSelectedPasto] = useState<Pasto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeFechamento, setActiveFechamento] = useState<FechamentoPasto | null>(null);
  const [itensMap, setItensMap] = useState<Map<string, FechamentoItem[]>>(new Map());
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);
  const [bulkClosing, setBulkClosing] = useState(false);
  const [showResumoAtividades, setShowResumoAtividades] = useState(false);
  const [confirmBulkReopenOpen, setConfirmBulkReopenOpen] = useState(false);
  // Pré-checagem: pastos vazios sem tipo_uso_mes definido
  const [vazioCheckOpen, setVazioCheckOpen] = useState(false);
  const [pastosVaziosIds, setPastosVaziosIds] = useState<string[]>([]);
  const [marcandoVedado, setMarcandoVedado] = useState(false);
  const [verificandoVazios, setVerificandoVazios] = useState(false);
  const [bulkReopening, setBulkReopening] = useState(false);
  const [showSugestoes, setShowSugestoes] = useState(false);
  const [showReclassModal, setShowReclassModal] = useState(false);
  const [showMapaImport, setShowMapaImport] = useState(false);

  // Auto-abre o modal "Importar Mapa IA" quando navegado via card "por Foto" no LancarZooHub.
  useEffect(() => {
    if (isGlobal) return;
    try {
      if (sessionStorage.getItem('fechamento:autoOpenMapaImport') === '1') {
        sessionStorage.removeItem('fechamento:autoOpenMapaImport');
        setShowMapaImport(true);
      }
    } catch { /* ignore */ }
  }, [isGlobal]);
  const [statusPorMes, setStatusPorMes] = useState<Record<number, 'fechado' | 'rascunho' | 'vazio'>>({});

  useEffect(() => {
    if (!fazendaAtual?.id || fazendaAtual.id === '__global__') {
      setStatusPorMes({});
      return;
    }
    supabase
      .from('fechamento_pastos')
      .select('ano_mes, status, pastos!inner(ativo)')
      .eq('fazenda_id', fazendaAtual.id)
      .eq('pastos.ativo', true)
      .like('ano_mes', `${anoFiltro}-%`)
      .then(({ data }) => {
        if (!data) return;
        const grouped: Record<number, { total: number; fechados: number }> = {};
        (data as any[]).forEach((r: any) => {
          const m = parseInt(String(r.ano_mes).substring(5, 7));
          if (isNaN(m)) return;
          if (!grouped[m]) grouped[m] = { total: 0, fechados: 0 };
          grouped[m].total++;
          if (r.status === 'fechado') grouped[m].fechados++;
        });
        const result: Record<number, 'fechado' | 'rascunho' | 'vazio'> = {};
        for (let m = 1; m <= 12; m++) {
          const g = grouped[m];
          if (!g || g.total === 0) result[m] = 'vazio';
          else if (g.fechados === g.total) result[m] = 'fechado';
          else result[m] = 'rascunho';
        }
        setStatusPorMes(result);
      });
  }, [fazendaAtual?.id, anoFiltro, fechamentos]);

  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  // Load items for all fechamentos
  useEffect(() => {
    const loadAll = async () => {
      const map = new Map<string, FechamentoItem[]>();
      await Promise.all(fechamentos.map(async (f) => {
        const items = await loadItens(f.id);
        map.set(f.id, items);
      }));
      setItensMap(map);
    };
    if (fechamentos.length > 0) loadAll();
    else setItensMap(new Map());
  }, [fechamentos, loadItens]);

  const pastosAtivos = useMemo(
    () => {
      // Primeiro dia do mês selecionado (ex.: '2026-02' -> '2026-02-01')
      const primeiroDiaMes = `${anoMes}-01`;
      const filtrados = pastos.filter(p => {
        if (!p.ativo || !p.entra_conciliacao) return false;
        // Filtro por data_inicio: pasto só aparece se sem restrição OU iniciado até o mês atual
        if (p.data_inicio && p.data_inicio > primeiroDiaMes) return false;
        return true;
      });
      // Pastos de divergência sempre no FINAL da lista
      const normais = filtrados.filter(p => !isPastoDivergencia(p.tipo_uso));
      const divergencia = filtrados.filter(p => isPastoDivergencia(p.tipo_uso));
      return [...normais, ...divergencia];
    },
    [pastos, anoMes]
  );

  const getFechamento = useCallback(
    (pastoId: string) => fechamentos.find(f => f.pasto_id === pastoId) || null,
    [fechamentos]
  );

  const getResumo = useCallback((fech: FechamentoPasto | null, pasto: Pasto): PastoResumo => {
    if (!fech) return { totalCabecas: 0, pesoMedio: null, uaHa: null, uaTotal: 0, catBreakdown: [], lotacaoKgHa: null };
    const items = itensMap.get(fech.id) || [];
    const totalCab = items.reduce((s, i) => s + i.quantidade, 0);
    const comPeso = items.filter(i => i.quantidade > 0 && i.peso_medio_kg);
    const pesoMedio = comPeso.length > 0
      ? comPeso.reduce((s, i) => s + (i.peso_medio_kg || 0) * i.quantidade, 0) / comPeso.reduce((s, i) => s + i.quantidade, 0)
      : null;
    let uaTotal = 0;
    items.forEach(i => { uaTotal += calcUA(i.quantidade, i.peso_medio_kg); });
    const uaHa = pasto.area_produtiva_ha && uaTotal > 0 ? uaTotal / pasto.area_produtiva_ha : null;
    const catIdToCodigo = new Map((categorias || []).map(c => [c.id, c.codigo]));
    const catBreakdown: { sigla: string; qty: number; pesoMedio: number | null }[] = [];
    for (const col of CAT_COLS) {
      const catItems = items.filter(i => catIdToCodigo.get(i.categoria_id) === col.codigo);
      const qty = catItems.reduce((s, i) => s + i.quantidade, 0);
      const pesoItem = catItems.find(i => i.quantidade > 0 && i.peso_medio_kg);
      if (qty > 0) catBreakdown.push({ sigla: col.sigla, qty, pesoMedio: pesoItem?.peso_medio_kg ?? null });
    }
    const pesoTotal = comPeso.reduce((s, i) => s + (i.peso_medio_kg || 0) * i.quantidade, 0);
    const lotacaoKgHa = pasto.area_produtiva_ha && pesoTotal > 0 ? pesoTotal / pasto.area_produtiva_ha : null;
    return { totalCabecas: totalCab, pesoMedio, uaHa, uaTotal, catBreakdown, lotacaoKgHa };
  }, [itensMap, categorias]);

  /* ── Status de conciliação por pasto ── */
  const getPastoStatus = useCallback((pasto: Pasto): PastoStatusConcil => {
    const fech = getFechamento(pasto.id);
    // Pasto não-pecuário ou pecuário sem lotação (reforma/vedado): conciliado automaticamente
    if (!isPastoOperacional(pasto, fech)) return fech?.status === 'fechado' ? 'fechado' : 'conciliado';
    if (!fech) return 'nao_iniciado';
    if (fech.status === 'fechado') return 'fechado';
    const items = itensMap.get(fech.id) || [];
    const totalCab = items.reduce((s, i) => s + i.quantidade, 0);
    if (totalCab === 0) return 'nao_iniciado';
    const semPeso = items.some(i => i.quantidade > 0 && !i.peso_medio_kg);
    if (semPeso) return 'inconsistente';
    return 'conciliado';
  }, [getFechamento, itensMap]);

  // Counters
  const statusCounts = useMemo(() => {
    const counts: Record<PastoStatusConcil, number> = {
      nao_iniciado: 0, em_edicao: 0, inconsistente: 0, conciliado: 0, fechado: 0,
    };
    pastosAtivos.forEach(p => { counts[getPastoStatus(p)]++; });
    return counts;
  }, [pastosAtivos, getPastoStatus]);

  const conciliadosCount = statusCounts.conciliado + statusCounts.fechado;
  const divergenciaCount = statusCounts.inconsistente;
  const fechadosCount = statusCounts.fechado;
  const pendentesCount = pastosAtivos.length - fechadosCount;

  const canBulkClose = useMemo(() => {
    if (!anoMes) return false;
    if (pendentesCount === 0) return false;
    if (!canEdit('zootecnico') && !canEdit('pastos')) return false;
    return true;
  }, [anoMes, pendentesCount, canEdit]);

  // ── Conciliation summary data ──
  const mesNum = Number(anoMes.split('-')[1]);

  // Sistema = saldo_sistema (cadeia pura de lançamentos, sem override de P1)
  // Não usa saldo_final. Se saldo_sistema for null, omitir — não converter para zero.
  const saldoMap = useMemo(() => {
    const map = new Map<string, number>();
    const monthData = (viewDataForConcil || []).filter(r => r.mes === mesNum);
    for (const cat of monthData) {
      const val = (cat as any).saldo_sistema;
      if (val != null) {
        map.set(cat.categoria_codigo, Number(val));
      }
    }
    return map;
  }, [viewDataForConcil, mesNum]);

  // GMD por categoria — fonte oficial (rawCategorias com overlay de fechamento)
  const gmdByCat = useMemo(() => {
    const map = new Map<string, number | null>();
    const monthData = (rebanhoRows || []).filter(r => r.mes === mesNum);
    for (const row of monthData) {
      if (row.categoria_codigo) {
        map.set(row.categoria_codigo, row.gmd ?? null);
      }
    }
    return map;
  }, [rebanhoRows, mesNum]);

  // Operational fechamentos: only pecuário pastos
  const operationalFechamentos = useMemo(
    () => pastosAtivos
      .filter(pasto => isPastoOperacional(pasto, getFechamento(pasto.id)))
      .map(pasto => getFechamento(pasto.id))
      .filter((fech): fech is FechamentoPasto => Boolean(fech)),
    [pastosAtivos, getFechamento]
  );

  // Mês "fechado" para fins de exibir GMD: todos os pastos operacionais com fechamento status='fechado'.
  const mesFechado = useMemo(() => {
    if (!operationalFechamentos.length) return false;
    return operationalFechamentos.every(f => f.status === 'fechado');
  }, [operationalFechamentos]);

  const operationalFechIds = useMemo(
    () => new Set(operationalFechamentos.map(f => f.id)),
    [operationalFechamentos]
  );

  // IDs de fechamentos que entram na RECONCILIAÇÃO (linha "Pasto"):
  // inclui todos os pastos com entra_conciliacao = true, INDEPENDENTE de tipo_uso.
  // Isso garante que o pasto "⚠️ Divergência do Campeiro" (tipo_uso = 'divergencia')
  // contribua para a soma de cabeças da reconciliação Sistema × Pasto.
  const reconciliacaoFechIds = useMemo(
    () => new Set(
      pastosAtivos
        .map(pasto => getFechamento(pasto.id))
        .filter((fech): fech is FechamentoPasto => Boolean(fech))
        .map(f => f.id)
    ),
    [pastosAtivos, getFechamento]
  );

  // Pasto data by category — usa reconciliacaoFechIds (inclui pastos de divergência)
  const pastoDataByCat = useMemo(() => {
    const catIdToCodigo = new Map((categorias || []).map(c => [c.id, c.codigo]));
    const map = new Map<string, number>();
    itensMap.forEach((items, fechId) => {
      if (!reconciliacaoFechIds.has(fechId)) return;
      items.forEach(i => {
        if (i.quantidade > 0) {
          const codigo = catIdToCodigo.get(i.categoria_id);
          if (codigo) map.set(codigo, (map.get(codigo) || 0) + i.quantidade);
        }
      });
    });
    return map;
  }, [itensMap, categorias, reconciliacaoFechIds]);

  // Peso médio ponderado por categoria — usa reconciliacaoFechIds (inclui pastos de divergência)
  const pesoMedioByCat = useMemo(() => {
    const catIdToCodigo = new Map((categorias || []).map(c => [c.id, c.codigo]));
    const acc = new Map<string, { totalPeso: number; totalCab: number }>();
    itensMap.forEach((items, fechId) => {
      if (!reconciliacaoFechIds.has(fechId)) return;
      items.forEach(i => {
        if (i.quantidade > 0 && i.peso_medio_kg) {
          const codigo = catIdToCodigo.get(i.categoria_id);
          if (codigo) {
            const cur = acc.get(codigo) || { totalPeso: 0, totalCab: 0 };
            cur.totalPeso += i.peso_medio_kg * i.quantidade;
            cur.totalCab += i.quantidade;
            acc.set(codigo, cur);
          }
        }
      });
    });
    const result = new Map<string, number>();
    acc.forEach((v, k) => { if (v.totalCab > 0) result.set(k, v.totalPeso / v.totalCab); });
    return result;
  }, [itensMap, categorias, reconciliacaoFechIds]);

  const totalPasto = CAT_COLS.reduce((s, c) => { const v = pastoDataByCat.get(c.codigo); return s + (v != null ? v : 0); }, 0);
  const totalSistema = CAT_COLS.reduce((s, c) => { const v = saldoMap.get(c.codigo); return s + (v != null ? v : 0); }, 0);
  const totalDiferenca = totalPasto - totalSistema;

  // Sugestões
  const catMap = useMemo(
    () => new Map((categorias || []).map(c => [c.codigo, c.nome])),
    [categorias]
  );

  const sugestoes = useMemo(() => {
    const allCodigos = new Set([...saldoMap.keys(), ...pastoDataByCat.keys()]);
    const rows: { codigo: string; nome: string; qtdSistema: number | null; qtdPasto: number | null; diferenca: number | null }[] = [];
    allCodigos.forEach(codigo => {
      const qtdSistema = saldoMap.has(codigo) ? saldoMap.get(codigo)! : null;
      const qtdPasto = pastoDataByCat.has(codigo) ? pastoDataByCat.get(codigo)! : null;
      if (qtdSistema == null && qtdPasto == null) return;
      const diferenca = qtdSistema != null && qtdPasto != null ? qtdPasto - qtdSistema : null;
      rows.push({ codigo, nome: catMap.get(codigo) || codigo, qtdSistema, qtdPasto, diferenca });
    });
    return gerarSugestoes(rows, catMap);
  }, [saldoMap, pastoDataByCat, catMap]);

  // GMD total ponderado — fonte oficial (rawCategorias)
  const gmdTotal = useMemo(() => {
    const monthData = (rebanhoRows || []).filter(r => r.mes === mesNum);
    let totalProd = 0;
    let totalCabDias = 0;
    for (const row of monthData) {
      totalProd += row.producao_biologica ?? 0;
      const cabMedia = ((row.saldo_inicial ?? 0) + (row.saldo_final ?? 0)) / 2;
      totalCabDias += cabMedia * (row.dias_mes ?? 30);
    }
    return totalCabDias > 0 ? totalProd / totalCabDias : null;
  }, [rebanhoRows, mesNum]);

  const hasDivergencia = useMemo(() => {
    if (totalDiferenca !== 0) return true;
    return CAT_COLS.some(c => {
      const qtdPasto = pastoDataByCat.has(c.codigo) ? pastoDataByCat.get(c.codigo)! : null;
      const qtdSistema = saldoMap.has(c.codigo) ? saldoMap.get(c.codigo)! : null;
      return qtdPasto != null && qtdSistema != null ? qtdPasto - qtdSistema !== 0 : (qtdPasto != null || qtdSistema != null);
    });
  }, [totalDiferenca, pastoDataByCat, saldoMap]);

  /* ── Handlers ── */
  const handleOpenPasto = async (pasto: Pasto) => {
    let fech = getFechamento(pasto.id);
    if (!fech) fech = await criarFechamento(pasto.id, anoMes);
    if (!fech) return;
    setActiveFechamento(fech);
    setSelectedPasto(pasto);
    setDialogOpen(true);
  };

  // Pré-checagem antes de abrir o dialog de fechamento:
  // identifica pastos sem tipo_uso_mes e sem itens (quantidade > 0).
  const handleCloseClick = async () => {
    if (!fazendaAtual || fazendaAtual.id === '__global__') return;
    setVerificandoVazios(true);
    try {
      // 1) fechamentos da fazenda/mês com tipo_uso_mes IS NULL
      const { data: fechs, error: fErr } = await supabase
        .from('fechamento_pastos')
        .select('id')
        .eq('fazenda_id', fazendaAtual.id)
        .eq('ano_mes', anoMes)
        .is('tipo_uso_mes', null);
      if (fErr) {
        console.error(fErr);
        toast.error('Erro ao verificar pastos vazios');
        setConfirmBulkOpen(true);
        return;
      }
      const candidatos = (fechs || []).map(f => f.id);
      if (candidatos.length === 0) {
        setConfirmBulkOpen(true);
        return;
      }
      // 2) entre os candidatos, manter apenas os que NÃO têm itens com quantidade > 0
      const { data: itens, error: iErr } = await supabase
        .from('fechamento_pasto_itens')
        .select('fechamento_id')
        .in('fechamento_id', candidatos)
        .gt('quantidade', 0);
      if (iErr) {
        console.error(iErr);
        toast.error('Erro ao verificar itens dos pastos');
        setConfirmBulkOpen(true);
        return;
      }
      const comItens = new Set((itens || []).map(i => i.fechamento_id));
      const vazios = candidatos.filter(id => !comItens.has(id));
      if (vazios.length === 0) {
        setConfirmBulkOpen(true);
        return;
      }
      setPastosVaziosIds(vazios);
      setVazioCheckOpen(true);
    } finally {
      setVerificandoVazios(false);
    }
  };

  const aplicarVedadoEContinuar = async () => {
    if (pastosVaziosIds.length === 0) {
      setVazioCheckOpen(false);
      setConfirmBulkOpen(true);
      return;
    }
    setMarcandoVedado(true);
    try {
      const { error } = await supabase
        .from('fechamento_pastos')
        .update({ tipo_uso_mes: 'vedado' })
        .in('id', pastosVaziosIds);
      if (error) {
        console.error(error);
        toast.error(`Erro ao marcar pastos como Vedado: ${error.message}`);
        return;
      }
      toast.success(`${pastosVaziosIds.length} pasto(s) marcado(s) como Vedado.`);
      await loadFechamentos(anoMes);
      setVazioCheckOpen(false);
      setPastosVaziosIds([]);
      setConfirmBulkOpen(true);
    } finally {
      setMarcandoVedado(false);
    }
  };

  const pularVedadoEContinuar = () => {
    setVazioCheckOpen(false);
    setPastosVaziosIds([]);
    setConfirmBulkOpen(true);
  };

  const handleBulkClose = async () => {
    if (!fazendaAtual || fazendaAtual.id === '__global__') return;
    if (hasDivergencia) {
      // Detailed error
      const erros: string[] = [];
      CAT_COLS.forEach(c => {
        const qtdPasto = pastoDataByCat.has(c.codigo) ? pastoDataByCat.get(c.codigo)! : null;
        const qtdSistema = saldoMap.has(c.codigo) ? saldoMap.get(c.codigo)! : null;
        const nome = catMap.get(c.codigo) || c.sigla;
        if (qtdSistema == null || qtdPasto == null) {
          // Dado ausente em um dos lados — bloquear fechamento, não tratar como OK.
          if (qtdSistema != null || qtdPasto != null) {
            erros.push(`${nome}: dado ausente em Sistema ou Pasto`);
          }
          return;
        }
        const dif = qtdPasto - qtdSistema;
        if (dif !== 0) {
          erros.push(`${nome}: ${dif > 0 ? '+' : ''}${dif} cab no pasto vs sistema`);
        }
      });
      toast.error(`Impossível fechar: divergências em ${erros.length} categoria(s).\n${erros.join(' · ')}`);
      setConfirmBulkOpen(false);
      return;
    }

    setBulkClosing(true);
    try {
      // Separar pastos que já têm fechamento dos que precisam ser criados
      const pastosParaFechar: string[] = [];
      const pastosParaCriar: string[] = [];
      const idsParaAtualizar: string[] = [];

      for (const pasto of pastosAtivos) {
        const fech = getFechamento(pasto.id);
        if (fech && fech.status === 'fechado') continue; // já fechado
        if (fech) {
          pastosParaFechar.push(pasto.id);
          idsParaAtualizar.push(fech.id);
        } else {
          pastosParaCriar.push(pasto.id);
        }
      }

      if (pastosParaCriar.length === 0 && idsParaAtualizar.length === 0) {
        if (fazendaAtual?.id) {
          const { error: snapError } = await supabase.rpc('gerar_snapshot_area', {
            p_fazenda_id: fazendaAtual.id,
            p_ano_mes: `${anoMes}-01`,
            p_fechado_por: user?.id ?? null,
          });
          if (snapError) {
            console.error('Snapshot área:', snapError);
            toast.error(`Erro ao gerar snapshot de área: ${snapError.message}`);
            setBulkClosing(false);
            setConfirmBulkOpen(false);
            return;
          }
        }
        toast.info('Todos os pastos já estão fechados. Snapshot de área verificado.');
        setBulkClosing(false);
        setConfirmBulkOpen(false);
        return;
      }

      const errosMsgs: string[] = [];

      // 1) Batch insert: criar fechamentos faltantes em uma única chamada
      if (pastosParaCriar.length > 0) {
        const rowsToInsert = pastosParaCriar.map(pastoId => {
          const pasto = pastosAtivos.find(p => p.id === pastoId)!;
          return {
            pasto_id: pastoId,
            fazenda_id: fazendaAtual!.id,
            cliente_id: fazendaAtual!.cliente_id!,
            ano_mes: anoMes,
            status: 'fechado',
            tipo_uso_mes: isPastoOperacional(pasto, null) ? 'pecuario' : 'vedado',
            responsavel_nome: FECHAMENTO_GLOBAL_MARKER,
          };
        });

        const BATCH_SIZE = 500;
        for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
          const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
          const { error } = await supabase.from('fechamento_pastos').insert(batch);
          if (error) {
            errosMsgs.push(`Criar: ${error.message}`);
          }
        }
      }

      // 2) Batch update: atualizar status dos existentes em uma única chamada
      if (idsParaAtualizar.length > 0) {
        const BATCH_SIZE = 500;
        for (let i = 0; i < idsParaAtualizar.length; i += BATCH_SIZE) {
          const batch = idsParaAtualizar.slice(i, i + BATCH_SIZE);
          const { error } = await supabase
            .from('fechamento_pastos')
            .update({ status: 'fechado', responsavel_nome: FECHAMENTO_GLOBAL_MARKER })
            .in('id', batch);
          if (error) {
            errosMsgs.push(`Fechar: ${error.message}`);
          }
        }
      }

      const totalProcessados = pastosParaCriar.length + idsParaAtualizar.length;
      if (errosMsgs.length > 0) {
        toast.error(`Erro(s): ${errosMsgs[0]}${errosMsgs.length > 1 ? ` (+${errosMsgs.length - 1})` : ''}`);
      } else {
        if (fazendaAtual?.id) {
          const anoMesDate = `${anoMes}-01`;
          const { error: snapError } = await supabase.rpc('gerar_snapshot_area', {
            p_fazenda_id: fazendaAtual.id,
            p_ano_mes: anoMesDate,
            p_fechado_por: user?.id ?? null,
          });
          if (snapError) {
            console.error('Snapshot área:', snapError);
            toast.warning(`Fechamento OK, mas snapshot de área falhou: ${snapError.message}`);
          } else {
            toast.success(`${totalProcessados} pasto(s) fechado(s) com sucesso ✓`);
          }
        } else {
          toast.success(`${totalProcessados} pasto(s) fechado(s) com sucesso ✓`);
        }
      }
      await loadFechamentos(anoMes);
    } catch (e: any) {
      toast.error(`Erro inesperado: ${e?.message || 'Tente novamente'}`);
    } finally {
      setBulkClosing(false);
      setConfirmBulkOpen(false);
    }
  };

  const handleImportMapa = async (dados: MapaItem[], anoMesAlvo: string) => {
    // Carrega fechamentos do mês alvo (pode ser diferente do filtro atual da tela).
    if (anoMesAlvo !== anoMes) {
      await loadFechamentos(anoMesAlvo);
    }
    let pastosImportados = 0;
    for (const item of dados) {
      // Recarregar fechamento pelo pasto_id no contexto do anoMesAlvo. Como `fechamentos`
      // pode ainda estar com o mês antigo neste tick, criamos sempre que necessário.
      const existente = fechamentos.find(f => f.pasto_id === item.pasto_id && f.ano_mes === anoMesAlvo);
      let fech = existente ?? null;
      if (!fech) fech = await criarFechamento(item.pasto_id, anoMesAlvo);
      if (!fech) continue;
      const itensPayload = item.categorias.map(c => ({
        categoria_id: c.categoria_id,
        quantidade: c.quantidade,
        peso_medio_kg: c.peso_medio_kg,
        lote: item.lote,
        observacoes: null,
        origem_dado: 'ia_mapa_rebanho',
      }));
      const ok = await salvarItens(fech.id, itensPayload);
      if (ok) pastosImportados++;
    }
    await loadFechamentos(anoMes);
    if (pastosImportados > 0) {
      toast.success(`${pastosImportados} pasto(s) importado(s) em ${anoMesAlvo}`);
    } else {
      toast.error('Nenhum pasto importado');
    }
  };

  const handleBulkReopen = async () => {
    if (!fazendaAtual || fazendaAtual.id === '__global__') return;
    setBulkReopening(true);
    try {
      const { data, error } = await supabase.rpc('reabrir_pilar_fechamento', {
        _fazenda_id: fazendaAtual.id,
        _ano_mes: anoMes,
        _pilar: 'p1_mapa_pastos',
        _motivo: 'Reabertura via tela de Fechamento de Pastos',
      });
      if (error) {
        toast.error(`Erro ao reabrir: ${error.message}`);
      } else if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in data) {
        toast.error(`Erro: ${(data as any).error}`);
      } else {
        const cascata = (data && typeof data === 'object' && !Array.isArray(data) && 'cascata' in data) ? (data as any).cascata : [];
        toast.success(`Mês ${anoMes} reaberto com sucesso.${cascata.length > 0 ? ` Pilares invalidados: ${cascata.join(', ')}` : ''}`);
      }
      await loadFechamentos(anoMes);
    } catch (e: any) {
      toast.error(`Erro inesperado: ${e?.message || 'Tente novamente'}`);
    } finally {
      setBulkReopening(false);
      setConfirmBulkReopenOpen(false);
    }
  };

  const dataInicialReclass = `${anoFiltro}-${String(mesFiltro).padStart(2, '0')}-01`;
  const reclassState = useReclassificacaoState({
    onAdicionar: async (lancamento) => {
      const id = await adicionarLancamento(lancamento);
      if (id) {
        setShowReclassModal(false);
        await loadFechamentos(anoMes);
      }
      return id;
    },
    dataInicial: dataInicialReclass,
    lancamentos,
    ano: Number(anoFiltro),
  });
  const [reclassSubmitting, setReclassSubmitting] = useState(false);
  const reclassPesoNum = parseFloat((reclassState.pesoKg || '0').replace(',', '.')) || 0;
  const reclassQtdNum = Number(reclassState.quantidade) || 0;
  const reclassCanRegister = reclassQtdNum > 0 && reclassState.categoriaOrigem !== reclassState.categoriaDestino;

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para o fechamento.</div>;

  if (showResumoAtividades) {
    return (
      <ResumoAtividadesView
        pastos={pastos}
        fechamentos={operationalFechamentos}
        itensMap={itensMap}
        categorias={categorias}
        anoMes={anoMes}
        onBack={() => setShowResumoAtividades(false)}
      />
    );
  }

  /* ── Helper: formatação de diferença ── */
  const fmtDif = (dif: number) => {
    if (dif === 0) return '0 ✓';
    return dif > 0 ? `+${dif}` : `${dif}`;
  };

  const difCellClass = (dif: number) => {
    if (dif === 0) return 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30';
    return 'text-red-700 dark:text-red-400 bg-amber-50 dark:bg-amber-950/30';
  };


  // Determine main action
  const allClosed = fechadosCount === pastosAtivos.length && pastosAtivos.length > 0;
  const showCloseButton = !hasDivergencia && !allClosed && canBulkClose;
  const showAdjustButton = hasDivergencia;

  if (bloqueado) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <span className="text-4xl">🐄</span>
        <p className="font-medium text-base">Esta fazenda não possui operação pecuária</p>
        <p className="text-sm">Selecione uma fazenda com pecuária para visualizar os dados zootécnicos.</p>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* ═══ HEADER FIXO — 3 COLUNAS ═══ */}
      <div className="sticky top-0 z-20 bg-background border-b border-border shadow-sm px-3 py-2">
        <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-start">

          {/* ── COL 1: Contexto / Filtros ── */}
          <div className="flex flex-col gap-1.5 min-w-[120px]">
            <div className="flex items-center gap-1.5">
              <Select value={anoFiltro} onValueChange={setAnoFiltro}>
                <SelectTrigger className="w-[68px] h-7 text-[11px] font-bold px-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 text-[10px] font-bold gap-1 w-fit">
                <CheckCircle className="h-3 w-3" />
                {conciliadosCount} conciliados
              </Badge>
             {divergenciaCount > 0 && (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-700 text-[10px] font-bold gap-1 w-fit">
                  <AlertTriangle className="h-3 w-3" />
                  {divergenciaCount} divergências
                </Badge>
              )}
            </div>
            {allClosed && (
              <Badge className="bg-emerald-200 text-emerald-900 dark:bg-emerald-800/50 dark:text-emerald-100 text-[11px] font-bold gap-1 w-fit">
                <CheckCircle className="h-3.5 w-3.5" /> Mês fechado
              </Badge>
            )}
            {fechadosCount > 0 && (canEdit('zootecnico') || canEdit('pastos')) && (
              <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2.5 font-bold gap-1 text-destructive hover:text-destructive w-fit justify-start" onClick={() => setConfirmBulkReopenOpen(true)}>
                <Unlock className="h-3.5 w-3.5" /> Reabrir Mês
              </Button>
            )}
            {showCloseButton && (
              <Button
                size="sm"
                className="w-full h-8 text-xs font-bold gap-1"
                onClick={handleCloseClick}
                disabled={verificandoVazios}
              >
                <Lock className="h-3.5 w-3.5" /> {verificandoVazios ? 'Verificando…' : 'Fechar Mês'}
              </Button>
            )}
            {allClosed && onNavigateToValorRebanho && (
              <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 font-bold w-fit mt-1" onClick={() => onNavigateToValorRebanho({ ano: anoFiltro, mes: mesFiltro })}>
                Inserir preço do rebanho →
              </Button>
            )}
          </div>

          {/* ── COL 2: Cards de mês + Tabela Conciliação ── */}
          <div className="flex flex-col gap-2 min-w-0">
            <div className="grid grid-cols-12 gap-0.5 max-w-[400px] mx-auto">
              {MESES_COLS.map((m, idx) => {
                const mesNum = idx + 1;
                const status = statusPorMes[mesNum] || 'vazio';
                const isSelected = mesFiltro === mesNum;
                let cls = '';
                let dotCls = '';
                if (isSelected) {
                  cls = 'bg-[#185FA5] text-white border border-[#185FA5]';
                  dotCls = 'bg-white/60';
                } else if (status === 'fechado') {
                  cls = 'bg-[#EAF3DE] text-[#3B6D11] border border-[#639922] hover:brightness-95';
                  dotCls = 'bg-[#639922]';
                } else if (status === 'rascunho') {
                  cls = 'bg-[#FAEEDA] text-[#854F0B] border border-[#BA7517] hover:brightness-95';
                  dotCls = 'bg-[#BA7517]';
                } else {
                  cls = 'bg-muted text-muted-foreground border border-border hover:bg-muted/80';
                  dotCls = 'bg-transparent border border-border';
                }
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMesFiltro(mesNum)}
                    className={`flex flex-col items-center justify-center py-1 px-0 min-w-[28px] rounded text-[10px] font-bold transition-colors ${cls}`}
                  >
                    <span>{m.label}</span>
                    <span className={`mt-0.5 h-1 w-1 rounded-full ${dotCls}`} />
                  </button>
                );
              })}
            </div>

            <div className="flex justify-center overflow-x-auto">
            <TooltipProvider delayDuration={150}>
            <table className="text-[10px] border-collapse table-fixed">
              <thead>
                <tr className="bg-blue-50 dark:bg-blue-950/20">
                  <th className="text-left font-bold text-blue-900 dark:text-blue-200 px-2.5 py-1 w-20 border-r-2 border-blue-300 dark:border-blue-700 bg-blue-100/60 dark:bg-blue-900/30">Cabeças</th>
                  {CAT_COLS.map((c, idx) => {
                    const hasSepRight = idx === 4;
                    return (
                      <Tooltip key={c.sigla}>
                        <TooltipTrigger asChild>
                          <th className={`text-center font-bold text-blue-900 dark:text-blue-200 px-1 py-1 w-[38px] cursor-help${hasSepRight ? ' border-r-2 border-blue-300 dark:border-blue-700' : ''}`}>{c.sigla}</th>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs font-medium">{c.nome}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                  <th className="text-center font-bold text-blue-900 dark:text-blue-200 px-2.5 py-1 min-w-[48px] border-l-2 border-blue-300 dark:border-blue-700 bg-blue-100/60 dark:bg-blue-900/30">Total</th>
                </tr>
              </thead>
              <tbody>
                {/* SISTEMA */}
                <tr className="bg-muted/30">
                  <td className="font-bold text-muted-foreground px-2.5 py-0.5 border-r-2 border-border/40 text-[9px] bg-muted/50">Sistema</td>
                  {CAT_COLS.map((c, idx) => {
                    const v = saldoMap.has(c.codigo) ? saldoMap.get(c.codigo)! : null;
                    return <td key={c.sigla} className={`text-center text-muted-foreground px-2 py-0.5 tabular-nums${idx === 4 ? ' border-r-2 border-border/40' : ''}`}>{v != null ? formatNum(v, 0) : '—'}</td>;
                  })}
                  <td className="text-center font-semibold text-muted-foreground px-2.5 py-0.5 border-l-2 border-border/40 tabular-nums bg-muted/50">{formatNum(totalSistema, 0)}</td>
                </tr>
                {/* PASTO */}
                <tr>
                  <td className="font-bold text-foreground px-2.5 py-0.5 border-r-2 border-border/40 text-[9px] bg-muted/20">Pasto</td>
                  {CAT_COLS.map((c, idx) => {
                    const v = pastoDataByCat.has(c.codigo) ? pastoDataByCat.get(c.codigo)! : null;
                    return <td key={c.sigla} className={`text-center font-semibold text-foreground px-2 py-0.5 tabular-nums${idx === 4 ? ' border-r-2 border-border/40' : ''}`}>{v != null ? formatNum(v, 0) : '—'}</td>;
                  })}
                  <td className="text-center font-bold text-foreground px-2.5 py-0.5 border-l-2 border-border/40 tabular-nums bg-muted/20">{formatNum(totalPasto, 0)}</td>
                </tr>
                {/* DIFERENÇA */}
                <tr className={`border-t-2 ${hasDivergencia ? 'border-red-400' : 'border-emerald-400'}`}>
                  <td className={`font-extrabold px-2.5 py-1 border-r-2 border-border/40 text-[10px] ${hasDivergencia ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30' : 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20'}`}>Dif.</td>
                  {CAT_COLS.map((c, idx) => {
                    const pv = pastoDataByCat.has(c.codigo) ? pastoDataByCat.get(c.codigo)! : null;
                    const sv = saldoMap.has(c.codigo) ? saldoMap.get(c.codigo)! : null;
                    const dif = pv != null && sv != null ? pv - sv : null;
                    return (
                      <td key={c.sigla} className={`text-center font-extrabold px-2 py-1 tabular-nums ${dif != null ? difCellClass(dif) : 'text-muted-foreground'}${idx === 4 ? ' border-r-2 border-border/40' : ''}`}>
                        {dif != null ? fmtDif(dif) : '—'}
                      </td>
                    );
                  })}
                  <td className={`text-center font-extrabold px-2.5 py-1 border-l-2 border-border/40 tabular-nums ${difCellClass(totalDiferenca)}`}>
                    {fmtDif(totalDiferenca)}
                  </td>
                </tr>
                {/* PESO */}
                <tr className="border-t border-border/20 bg-muted/20">
                  <td className="text-muted-foreground px-2.5 py-0.5 border-r-2 border-border/40 text-[8px] italic bg-muted/30">Peso kg</td>
                  {CAT_COLS.map((c, idx) => {
                    const peso = pesoMedioByCat.get(c.codigo);
                    return <td key={c.sigla} className={`text-center text-[9px] italic text-muted-foreground px-2 py-0.5 tabular-nums${idx === 4 ? ' border-r-2 border-border/40' : ''}`}>{peso ? formatNum(peso, 1) : ''}</td>;
                  })}
                  {(() => {
                    let totalPesoAcc = 0;
                    let totalCabAcc = 0;
                    pesoMedioByCat.forEach((peso, codigo) => {
                      const cab = pastoDataByCat.has(codigo) ? pastoDataByCat.get(codigo)! : null;
                      if (cab != null) {
                        totalPesoAcc += peso * cab;
                        totalCabAcc += cab;
                      }
                    });
                    const pesoMedioTotal = totalCabAcc > 0 ? totalPesoAcc / totalCabAcc : null;
                    return (
                      <td className="text-center text-[9px] italic text-muted-foreground px-2.5 py-0.5 border-l-2 border-border/40 tabular-nums font-semibold bg-muted/30">
                        {pesoMedioTotal ? formatNum(pesoMedioTotal, 1) : ''}
                      </td>
                    );
                  })()}
                </tr>
                {/* GMD — só após fechamento P1 de todos os pastos operacionais */}
                {mesFechado && (
                  <tr className="bg-muted/20">
                    <td className="text-muted-foreground px-2.5 py-0.5 border-r-2 border-border/40 text-[8px] italic bg-muted/30">GMD</td>
                    {CAT_COLS.map((c, idx) => {
                      const g = gmdByCat.get(c.codigo);
                      return <td key={c.sigla} className={`text-center text-[9px] italic px-2 py-0.5 tabular-nums ${gmdColor(g ?? null)}${idx === 4 ? ' border-r-2 border-border/40' : ''}`}>{g != null ? formatNum(g, 3) : ''}</td>;
                    })}
                    <td className={`text-center text-[9px] italic px-2.5 py-0.5 border-l-2 border-border/40 tabular-nums bg-muted/30 ${gmdColor(gmdTotal)}`}>{gmdTotal != null ? formatNum(gmdTotal, 3) : ''}</td>
                  </tr>
                )}
              </tbody>
            </table>
            </TooltipProvider>
            </div>
          </div>

          {/* ── COL 3: Ações ── */}
          <div className="flex flex-col gap-1.5 items-end min-w-[120px]">
            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2.5 font-bold gap-1 w-full justify-start" onClick={() => setShowResumoAtividades(true)}>
              <BarChart3 className="h-3.5 w-3.5" /> Resumo por Atividade
            </Button>
            {onNavigateToConferenciaGmd && (
              <Button size="sm" variant="outline" className="h-7 text-[10px] px-2.5 font-bold gap-1 w-full justify-start" onClick={() => onNavigateToConferenciaGmd({ ano: anoFiltro, mes: mesFiltro })}>
                <Activity className="h-3.5 w-3.5" /> Conferência do GMD
              </Button>
            )}
            {onNavigateToMapaPastos && (
              <Button size="sm" variant="outline" className="h-7 text-[10px] px-2.5 font-bold gap-1 w-full justify-start" onClick={() => onNavigateToMapaPastos({ ano: anoFiltro, mes: mesFiltro })}>
                <MapIcon className="h-3.5 w-3.5" /> Mapa de Pastos
              </Button>
            )}

            {showAdjustButton && (
              <div className="flex flex-col gap-1 w-full">
                {sugestoes.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] font-bold gap-1 border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 w-full justify-start"
                    onClick={() => setShowSugestoes(true)}
                  >
                    <Lightbulb className="h-3.5 w-3.5" /> Ver sugestões
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] font-bold gap-1 w-full justify-start"
                  onClick={() => setShowReclassModal(true)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Ajustar Conciliação
                </Button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ═══ CARDS DOS PASTOS ═══ */}
      <div className="px-2 pt-2 pb-4">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : pastosAtivos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum pasto ativo para conciliação.</p>
            <p className="text-xs mt-1">Cadastre pastos na aba "Pastos" e marque "Entra na conciliação".</p>
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
              {pastosAtivos.map(p => {
                const fech = getFechamento(p.id);
                const pastoStatus = getPastoStatus(p);
                const resumo = getResumo(fech, p);
                const tipoUsoEfetivo = fech?.tipo_uso_mes || p.tipo_uso;
                const tipoNorm = normalizeTipoUso(tipoUsoEfetivo);

                const isDivergencia = isPastoDivergencia(tipoUsoEfetivo);

                return (
                  <Tooltip key={p.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleOpenPasto(p)}
                        className={`w-full rounded-lg border px-2 py-1.5 text-left hover:ring-1 hover:ring-primary/40 transition-all ${
                          isDivergencia
                            ? 'bg-amber-100 dark:bg-amber-950/40 border-amber-500 dark:border-amber-600 border-2'
                            : STATUS_CARD_CLASSES[pastoStatus]
                        }`}
                      >
                        {/* Nome + status icon */}
                        <div className="flex items-center justify-between gap-0.5">
                          <span className="font-bold text-xs text-foreground truncate leading-tight">{p.nome}</span>
                          <span className={`text-sm font-bold leading-none ${STATUS_ICON_COLOR[pastoStatus]}`}>
                            {STATUS_ICON[pastoStatus]}
                          </span>
                        </div>
                        {/* Cabeças */}
                        <div className="font-extrabold text-[13px] tabular-nums text-foreground leading-tight mt-0.5">
                          {resumo.totalCabecas > 0 ? `${formatNum(resumo.totalCabecas, 0)} cab` : '—'}
                        </div>
                        {/* Peso médio */}
                        {resumo.pesoMedio && (
                          <div className="text-[8px] text-muted-foreground leading-none mt-0.5 tabular-nums">
                            {formatNum(resumo.pesoMedio, 1)} kg
                          </div>
                        )}
                        {/* Área + Tipo uso (área omitida em pastos de divergência) */}
                        <div className="flex items-center justify-between mt-0.5">
                          {isDivergencia ? (
                            <span className="text-[7px] font-bold uppercase tracking-wider leading-none text-amber-800 dark:text-amber-300">⚠️ Divergência</span>
                          ) : p.area_produtiva_ha ? (
                            <span className="text-[8px] text-muted-foreground leading-none">{formatNum(p.area_produtiva_ha, 1)} ha</span>
                          ) : <span />}
                          {!isDivergencia && tipoUsoEfetivo && (
                            <span className={`text-[7px] font-bold uppercase tracking-wider leading-none ${
                              tipoNorm === 'recria' ? 'text-emerald-700 dark:text-emerald-400'
                              : tipoNorm === 'engorda' ? 'text-blue-700 dark:text-blue-400'
                              : tipoNorm === 'cria' ? 'text-orange-700 dark:text-orange-400'
                              : 'text-muted-foreground'
                            }`}>
                              {tipoUsoEfetivo!.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] p-2 text-[10px] space-y-1">
                      <div className="font-bold text-xs">{p.nome}</div>
                      {resumo.totalCabecas > 0 && (
                        <>
                          <div className="text-muted-foreground">
                            <span className="font-semibold text-foreground">{resumo.totalCabecas}</span> cab
                            {resumo.pesoMedio && <> · <span className="font-semibold text-foreground">{formatNum(resumo.pesoMedio, 1)}</span> kg</>}
                          </div>
                          {resumo.catBreakdown.length > 0 && (
                            <div className="space-y-0.5 pt-1 border-t border-border/30">
                              {resumo.catBreakdown.map(cb => (
                                <div key={cb.sigla} className="flex justify-between">
                                  <span className="text-muted-foreground">{cb.sigla}</span>
                                  <span className="tabular-nums">{cb.qty} cab{cb.pesoMedio ? ` · ${formatNum(cb.pesoMedio, 0)} kg` : ''}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {resumo.lotacaoKgHa != null && (
                            <div className="pt-1 border-t border-border/30 text-muted-foreground">
                              Lotação: <span className="font-semibold text-foreground">{formatNum(resumo.lotacaoKgHa, 0)}</span> kg/ha
                              {resumo.uaHa != null && <> · <span className="font-semibold text-foreground">{formatNum(resumo.uaHa, 2)}</span> UA/ha</>}
                            </div>
                          )}
                        </>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        )}

        {selectedPasto && activeFechamento && (
          <FechamentoPastoDialog
            open={dialogOpen}
            onOpenChange={(o) => { setDialogOpen(o); if (!o) { setSelectedPasto(null); setActiveFechamento(null); loadFechamentos(anoMes); } }}
            pasto={selectedPasto}
            fechamento={activeFechamento}
            categorias={categorias}
            onSave={async (items) => salvarItens(activeFechamento.id, items)}
            onFechar={async () => fecharPasto(activeFechamento.id)}
            onReabrir={async () => {
              if (!fazendaAtual || fazendaAtual.id === '__global__') return false;
              const { data, error } = await supabase.rpc('reabrir_pilar_fechamento', {
                _fazenda_id: fazendaAtual.id,
                _ano_mes: anoMes,
                _pilar: 'p1_mapa_pastos',
                _motivo: 'Reabertura individual via modal de pasto',
              });
              if (error) {
                toast.error(`Erro ao reabrir: ${error.message}`);
                return false;
              }
              if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in data) {
                toast.error(`Erro: ${(data as any).error}`);
                return false;
              }
              toast.success('Mês reaberto com sucesso.');
              await loadFechamentos(anoMes);
              return true;
            }}
            onCopiar={async () => copiarMesAnterior(selectedPasto.id, anoMes, categorias)}
          />
        )}

        {onBackToConciliacao && (
          <button
            onClick={onBackToConciliacao}
            className="w-full flex items-center justify-center gap-1 text-sm font-bold text-primary bg-primary/10 rounded-lg py-2.5 transition-colors hover:bg-primary/20 mt-4"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar para Conciliação de Categoria
          </button>
        )}
      </div>

      {/* ═══ DIALOGS ═══ */}
      {/* Fechar Mês */}
      <AlertDialog open={confirmBulkOpen} onOpenChange={setConfirmBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Fechar Mês
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              Fechamento da fazenda
              {fazendaAtual ? ` "${fazendaAtual.nome}"` : ''} para <strong>{formatAnoMes(anoMes)}</strong>.
              <br /><br />
              <strong>{pendentesCount} pasto(s)</strong> serão fechados. Pastos já fechados não serão alterados.
              <br /><br />
              <span className="text-muted-foreground text-xs">Ação registrada para auditoria.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkClosing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkClose} disabled={bulkClosing}>
              {bulkClosing ? 'Fechando...' : `Fechar ${pendentesCount} pasto(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pré-checagem: pastos vazios sem Tipo de Uso */}
      <AlertDialog open={vazioCheckOpen} onOpenChange={(o) => { if (!marcandoVedado) setVazioCheckOpen(o); }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Pastos sem Tipo de Uso
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              <strong>{pastosVaziosIds.length} pasto(s)</strong> estão vazios e sem Tipo de Uso definido.
              <br /><br />
              Deseja marcá-los automaticamente como <strong>"Vedado"</strong> antes de fechar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={marcandoVedado}>Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={pularVedadoEContinuar}
              disabled={marcandoVedado}
            >
              Não, continuar sem alterar
            </Button>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); aplicarVedadoEContinuar(); }} disabled={marcandoVedado}>
              {marcandoVedado ? 'Marcando…' : 'Sim, marcar como Vedado e continuar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reabrir Mês */}
      <AlertDialog open={confirmBulkReopenOpen} onOpenChange={setConfirmBulkReopenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5 text-destructive" />
              Reabrir Mês
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              Reabrindo <strong>{fechadosCount} pasto(s)</strong> de
              {fazendaAtual ? ` "${fazendaAtual.nome}"` : ''} em <strong>{formatAnoMes(anoMes)}</strong>.
              <br /><br />
              Nenhum dado será alterado, apenas o status. Pilares dependentes serão invalidados automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkReopening}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkReopen} disabled={bulkReopening} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {bulkReopening ? 'Reabrindo...' : `Reabrir Mês`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sugestões */}
      <Dialog open={showSugestoes} onOpenChange={setShowSugestoes}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              Sugestões de Ajuste
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {sugestoes.map((s, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 text-sm ${
                  s.tipo === 'evolucao' ? 'border-primary/30 bg-primary/5'
                  : s.tipo === 'excesso' ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-red-500/30 bg-red-500/5'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">{s.tipo === 'evolucao' ? '🔄' : s.tipo === 'excesso' ? '⚠️' : '❌'}</span>
                  <span className="text-foreground">{s.mensagem}</span>
                </div>
              </div>
            ))}
            {sugestoes.length === 0 && (
              <p className="text-center text-muted-foreground py-4">Nenhuma sugestão.</p>
            )}
          </div>
          {onNavigateToReclass && sugestoes.some(s => s.tipo === 'evolucao') && (
            <Button className="w-full mt-2" onClick={() => { setShowSugestoes(false); onNavigateToReclass({ ano: anoFiltro, mes: mesFiltro }); }}>
              <Pencil className="h-4 w-4 mr-2" /> Evol. Categoria
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {showReclassModal && (
        <Dialog open={showReclassModal} onOpenChange={setShowReclassModal}>
          <DialogContent
            className="max-w-5xl p-0"
            style={{ position: 'fixed', top: 'auto', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 240px' }}>

              {/* COL 1: Form */}
              <div className="p-3 border-r border-border/50">
                <p className="text-[11px] font-medium text-muted-foreground mb-2">
                  Reclassificar — {MESES_COLS[mesFiltro - 1]?.label}/{anoFiltro}
                </p>
                <ReclassificacaoFormFields state={reclassState} hideStatus={true} />
              </div>

              {/* COL 2: Sugestões */}
              <div className="p-3 border-r border-border/50">
                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Sugestões de ajuste
                </p>
                {sugestoes.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Nenhuma divergência encontrada.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {sugestoes.map((s, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          if (!s.acao) return;
                          reclassState.setCategoriaOrigem(s.acao.origemCodigo as any);
                          reclassState.setCategoriaDestino(s.acao.destinoCodigo as any);
                          reclassState.setQuantidade(String(s.acao.qtd));
                        }}
                        style={{
                          background: s.tipo === 'evolucao' ? '#EAF3DE' : '#FCEBEB',
                          border: `0.5px solid ${s.tipo === 'evolucao' ? '#639922' : '#E24B4A'}`,
                          borderRadius: '6px',
                          padding: '6px 8px',
                          cursor: s.acao ? 'pointer' : 'default',
                          display: 'flex',
                          gap: '6px',
                          alignItems: 'flex-start',
                        }}
                      >
                        <span style={{ fontSize: '11px', flexShrink: 0, color: s.tipo === 'evolucao' ? '#639922' : '#E24B4A' }}>
                          {s.tipo === 'evolucao' ? '↻' : '✕'}
                        </span>
                        <div>
                          <p style={{ fontSize: '10px', color: s.tipo === 'evolucao' ? '#3B6D11' : '#A32D2D', margin: 0, lineHeight: 1.4 }}>
                            {s.mensagem}
                          </p>
                          {s.acao && (
                            <p style={{ fontSize: '9px', color: s.tipo === 'evolucao' ? '#639922' : '#E24B4A', margin: '2px 0 0', opacity: 0.8 }}>
                              Clique para preencher
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* COL 3: Resumo */}
              <div className="p-3 bg-muted/30">
                <ReclassificacaoResumoPanel
                  quantidade={reclassQtdNum}
                  pesoKg={reclassPesoNum}
                  origemLabel={reclassState.origemLabel}
                  destinoLabel={reclassState.destinoLabel}
                  pesoMedioOrigem={reclassState.origemInfo?.pesoMedioKg ?? null}
                  statusOp={reclassState.statusOp}
                  onRequestRegister={async () => {
                    setReclassSubmitting(true);
                    try { await reclassState.handleSubmit(); } finally { setReclassSubmitting(false); }
                  }}
                  submitting={reclassSubmitting}
                  canRegister={reclassCanRegister}
                  onBack={() => setShowReclassModal(false)}
                  backLabel="Fechar"
                />
              </div>

            </div>
          </DialogContent>
        </Dialog>
      )}

      {!isGlobal && (
        <MapaRebanhoImportDialog
          open={showMapaImport}
          onOpenChange={setShowMapaImport}
          pastos={pastos}
          categorias={categorias}
          anoMes={anoMes}
          onImportar={handleImportMapa}
        />
      )}
    </div>
  );
}
