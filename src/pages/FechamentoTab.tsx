import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, CheckCircle, AlertTriangle, Lock, Unlock, Pencil, BarChart3, Lightbulb, Activity } from 'lucide-react';
import { ResumoAtividadesView } from '@/components/ResumoAtividadesView';
import { usePastos, type Pasto } from '@/hooks/usePastos';
import { useFechamento, type FechamentoPasto, type FechamentoItem } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
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
import { FechamentoPastoDialog } from '@/components/FechamentoPastoDialog';
import { calcUA } from '@/lib/calculos/zootecnicos';
import { formatNum } from '@/lib/calculos/formatters';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { gerarSugestoes, type Sugestao } from '@/lib/calculos/sugestoesConciliacao';
import { useZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';

/* ── Colunas de categorias ── */
const CAT_COLS = [
  { codigo: 'mamotes_m', sigla: 'MM' },
  { codigo: 'desmama_m', sigla: 'DM' },
  { codigo: 'garrotes', sigla: 'G' },
  { codigo: 'bois', sigla: 'B' },
  { codigo: 'touros', sigla: 'T' },
  { codigo: 'mamotes_f', sigla: 'MF' },
  { codigo: 'desmama_f', sigla: 'DF' },
  { codigo: 'novilhas', sigla: 'N' },
  { codigo: 'vacas', sigla: 'V' },
];

/* ── Status de conciliação por pasto ── */
type PastoStatusConcil = 'nao_iniciado' | 'em_edicao' | 'inconsistente' | 'conciliado' | 'fechado';

const STATUS_CARD_CLASSES: Record<PastoStatusConcil, string> = {
  nao_iniciado: 'bg-muted/50 border-border',
  em_edicao: 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700',
  inconsistente: 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 dark:border-amber-600',
  conciliado: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700',
  fechado: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-500 dark:border-emerald-500',
};

const STATUS_ICON: Record<PastoStatusConcil, string> = {
  nao_iniciado: '○',
  em_edicao: '…',
  inconsistente: '!',
  conciliado: '●',
  fechado: '✓',
};

const STATUS_ICON_COLOR: Record<PastoStatusConcil, string> = {
  nao_iniciado: 'text-muted-foreground',
  em_edicao: 'text-blue-600 dark:text-blue-400',
  inconsistente: 'text-amber-600 dark:text-amber-400',
  conciliado: 'text-emerald-600 dark:text-emerald-400',
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
  onNavigateToValorRebanho?: () => void;
  onNavigateToConferenciaGmd?: () => void;
}

const FECHAMENTO_GLOBAL_MARKER = 'fechamento_global_administrativo';

const normalizeTipoUso = (tipoUso?: string) => {
  if (!tipoUso) return '';
  return tipoUso.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
};

/* ── GMD color ── */
function gmdColor(gmd: number | null): string {
  if (gmd == null) return 'text-muted-foreground';
  if (gmd < 0.3) return 'text-red-600 dark:text-red-400';
  if (gmd < 0.6) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

export function FechamentoTab({ filtroAnoInicial, filtroMesInicial, onBackToConciliacao, onNavigateToReclass, onNavigateToValorRebanho, onNavigateToConferenciaGmd }: Props = {}) {
  const { isGlobal, fazendaAtual } = useFazenda();
  const { canEdit } = usePermissions();
  const { pastos, categorias } = usePastos();
  const { lancamentos, saldosIniciais } = useLancamentos();
  const { fechamentos, loading, loadFechamentos, criarFechamento, loadItens, salvarItens, fecharPasto, reabrirPasto, copiarMesAnterior } = useFechamento();

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
  const [bulkReopening, setBulkReopening] = useState(false);
  const [showSugestoes, setShowSugestoes] = useState(false);

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
    () => pastos.filter(p => p.ativo && p.entra_conciliacao),
    [pastos]
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

  // FONTE OFICIAL: saldo previsto por movimentações (vw_zoot_categoria_mensal)
  const saldoMap = useMemo(() => {
    const map = new Map<string, number>();
    const monthData = (viewDataForConcil || []).filter(r => r.mes === mesNum);
    for (const cat of monthData) {
      const movSaldo = cat.saldo_inicial + cat.entradas_externas - cat.saidas_externas
        + cat.evol_cat_entrada - cat.evol_cat_saida;
      map.set(cat.categoria_codigo, (map.get(cat.categoria_codigo) || 0) + movSaldo);
    }
    return map;
  }, [viewDataForConcil, mesNum]);

  // GMD por categoria da view oficial
  const gmdByCat = useMemo(() => {
    const map = new Map<string, number | null>();
    const monthData = (viewDataForConcil || []).filter(r => r.mes === mesNum);
    for (const cat of monthData) {
      map.set(cat.categoria_codigo, cat.gmd);
    }
    return map;
  }, [viewDataForConcil, mesNum]);

  // Operational fechamentos (pastos ativos only)
  const operationalFechamentos = useMemo(
    () => pastosAtivos
      .map(pasto => getFechamento(pasto.id))
      .filter((fech): fech is FechamentoPasto => Boolean(fech)),
    [pastosAtivos, getFechamento]
  );

  const operationalFechIds = useMemo(
    () => new Set(operationalFechamentos.map(f => f.id)),
    [operationalFechamentos]
  );

  // Pasto data by category
  const pastoDataByCat = useMemo(() => {
    const catIdToCodigo = new Map((categorias || []).map(c => [c.id, c.codigo]));
    const map = new Map<string, number>();
    itensMap.forEach((items, fechId) => {
      if (!operationalFechIds.has(fechId)) return;
      items.forEach(i => {
        if (i.quantidade > 0) {
          const codigo = catIdToCodigo.get(i.categoria_id);
          if (codigo) map.set(codigo, (map.get(codigo) || 0) + i.quantidade);
        }
      });
    });
    return map;
  }, [itensMap, categorias, operationalFechIds]);

  // Peso médio ponderado por categoria
  const pesoMedioByCat = useMemo(() => {
    const catIdToCodigo = new Map((categorias || []).map(c => [c.id, c.codigo]));
    const acc = new Map<string, { totalPeso: number; totalCab: number }>();
    itensMap.forEach((items, fechId) => {
      if (!operationalFechIds.has(fechId)) return;
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
  }, [itensMap, categorias, operationalFechIds]);

  const totalPasto = CAT_COLS.reduce((s, c) => s + (pastoDataByCat.get(c.codigo) || 0), 0);
  const totalSistema = CAT_COLS.reduce((s, c) => s + (saldoMap.get(c.codigo) || 0), 0);
  const totalDiferenca = totalPasto - totalSistema;

  // Sugestões
  const catMap = useMemo(
    () => new Map((categorias || []).map(c => [c.codigo, c.nome])),
    [categorias]
  );

  const sugestoes = useMemo(() => {
    const allCodigos = new Set([...saldoMap.keys(), ...pastoDataByCat.keys()]);
    const rows: { codigo: string; nome: string; qtdSistema: number; qtdPasto: number; diferenca: number }[] = [];
    allCodigos.forEach(codigo => {
      const qtdSistema = saldoMap.get(codigo) || 0;
      const qtdPasto = pastoDataByCat.get(codigo) || 0;
      if (qtdSistema === 0 && qtdPasto === 0) return;
      rows.push({ codigo, nome: catMap.get(codigo) || codigo, qtdSistema, qtdPasto, diferenca: qtdPasto - qtdSistema });
    });
    return gerarSugestoes(rows, catMap);
  }, [saldoMap, pastoDataByCat, catMap]);

  // GMD total ponderado
  const gmdTotal = useMemo(() => {
    const monthData = (viewDataForConcil || []).filter(r => r.mes === mesNum);
    let totalProd = 0;
    let totalCabDias = 0;
    for (const cat of monthData) {
      totalProd += cat.producao_biologica;
      const cabMedia = (cat.saldo_inicial + cat.saldo_final) / 2;
      totalCabDias += cabMedia * cat.dias_mes;
    }
    return totalCabDias > 0 ? totalProd / totalCabDias : null;
  }, [viewDataForConcil, mesNum]);

  const hasDivergencia = useMemo(() => {
    if (totalDiferenca !== 0) return true;
    return CAT_COLS.some(c => {
      const qtdPasto = pastoDataByCat.get(c.codigo) || 0;
      const qtdSistema = saldoMap.get(c.codigo) || 0;
      return qtdPasto - qtdSistema !== 0;
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

  const handleBulkClose = async () => {
    if (!fazendaAtual || fazendaAtual.id === '__global__') return;
    if (hasDivergencia) {
      // Detailed error
      const erros: string[] = [];
      CAT_COLS.forEach(c => {
        const qtdPasto = pastoDataByCat.get(c.codigo) || 0;
        const qtdSistema = saldoMap.get(c.codigo) || 0;
        const dif = qtdPasto - qtdSistema;
        if (dif !== 0) {
          const nome = catMap.get(c.codigo) || c.sigla;
          erros.push(`${nome}: ${dif > 0 ? '+' : ''}${dif} cab no pasto vs sistema`);
        }
      });
      toast.error(`Impossível fechar: divergências em ${erros.length} categoria(s).\n${erros.join(' · ')}`);
      setConfirmBulkOpen(false);
      return;
    }

    setBulkClosing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const pastosParaFechar: string[] = [];
      for (const pasto of pastosAtivos) {
        const fech = getFechamento(pasto.id);
        if (!fech || fech.status !== 'fechado') pastosParaFechar.push(pasto.id);
      }
      if (pastosParaFechar.length === 0) {
        toast.info('Todos os pastos já estão fechados.');
        setBulkClosing(false);
        setConfirmBulkOpen(false);
        return;
      }

      let erros = 0;
      const errosMsgs: string[] = [];
      for (const pastoId of pastosParaFechar) {
        let fech = getFechamento(pastoId);
        if (!fech) {
          fech = await criarFechamento(pastoId, anoMes);
          if (!fech) { erros++; errosMsgs.push(`Pasto não pôde ser criado`); continue; }
        }
        const { error } = await supabase
          .from('fechamento_pastos')
          .update({ status: 'fechado', responsavel_nome: FECHAMENTO_GLOBAL_MARKER })
          .eq('id', fech.id);
        if (error) {
          erros++;
          errosMsgs.push(error.message || 'Erro desconhecido');
        }
      }

      if (erros > 0) {
        toast.error(`${erros} pasto(s) falharam: ${errosMsgs[0]}${errosMsgs.length > 1 ? ` (+${errosMsgs.length - 1})` : ''}`);
      } else {
        toast.success(`${pastosParaFechar.length} pasto(s) fechado(s) com sucesso ✓`);
      }
      await loadFechamentos(anoMes);
    } catch (e: any) {
      toast.error(`Erro inesperado: ${e?.message || 'Tente novamente'}`);
    } finally {
      setBulkClosing(false);
      setConfirmBulkOpen(false);
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
              <Select value={String(mesFiltro)} onValueChange={v => setMesFiltro(Number(v))}>
                <SelectTrigger className="w-[72px] h-7 text-[11px] font-bold px-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES_COLS.map((m, i) => (
                    <SelectItem key={m.key} value={String(i + 1)}>{m.label}</SelectItem>
                  ))}
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
            {allClosed && onNavigateToValorRebanho && (
              <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 font-bold w-fit mt-1" onClick={onNavigateToValorRebanho}>
                Inserir preço do rebanho →
              </Button>
            )}
          </div>

          {/* ── COL 2: Tabela Conciliação (compacta, centralizada) ── */}
          <div className="flex justify-center overflow-x-auto">
            <table className="text-[10px] border-collapse w-auto">
              <thead>
                <tr className="bg-blue-50 dark:bg-blue-950/20">
                  <th className="text-left font-bold text-blue-900 dark:text-blue-200 px-2 py-1 w-16 border-r border-blue-200 dark:border-blue-800">Cab.</th>
                  {CAT_COLS.map((c, idx) => (
                    <th key={c.sigla} className={`text-center font-bold text-blue-900 dark:text-blue-200 px-1.5 py-1 min-w-[36px]${idx === 4 ? ' border-r border-blue-200 dark:border-blue-800' : ''}`}>{c.sigla}</th>
                  ))}
                  <th className="text-center font-bold text-blue-900 dark:text-blue-200 px-2 py-1 min-w-[44px] border-l border-blue-200 dark:border-blue-800">Total</th>
                </tr>
              </thead>
              <tbody>
                {/* SISTEMA */}
                <tr className="bg-muted/30">
                  <td className="font-bold text-muted-foreground px-2 py-0.5 border-r border-border/30 text-[9px]">Sistema</td>
                  {CAT_COLS.map((c, idx) => {
                    const v = saldoMap.get(c.codigo) || 0;
                    return <td key={c.sigla} className={`text-center text-muted-foreground px-1.5 py-0.5 tabular-nums${idx === 4 ? ' border-r border-border/30' : ''}`}>{v ? formatNum(v, 0) : ''}</td>;
                  })}
                  <td className="text-center font-semibold text-muted-foreground px-2 py-0.5 border-l border-border/30 tabular-nums">{totalSistema ? formatNum(totalSistema, 0) : ''}</td>
                </tr>
                {/* PASTO */}
                <tr>
                  <td className="font-bold text-foreground px-2 py-0.5 border-r border-border/30 text-[9px]">Pasto</td>
                  {CAT_COLS.map((c, idx) => {
                    const v = pastoDataByCat.get(c.codigo) || 0;
                    return <td key={c.sigla} className={`text-center font-semibold text-foreground px-1.5 py-0.5 tabular-nums${idx === 4 ? ' border-r border-border/30' : ''}`}>{v ? formatNum(v, 0) : ''}</td>;
                  })}
                  <td className="text-center font-bold text-foreground px-2 py-0.5 border-l border-border/30 tabular-nums">{totalPasto ? formatNum(totalPasto, 0) : ''}</td>
                </tr>
                {/* DIFERENÇA */}
                <tr className={`border-t-2 ${hasDivergencia ? 'border-red-400' : 'border-emerald-400'}`}>
                  <td className={`font-extrabold px-2 py-1 border-r border-border/30 text-[10px] ${hasDivergencia ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30' : 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20'}`}>Dif.</td>
                  {CAT_COLS.map((c, idx) => {
                    const pv = pastoDataByCat.get(c.codigo) || 0;
                    const sv = saldoMap.get(c.codigo) || 0;
                    const dif = pv - sv;
                    return (
                      <td key={c.sigla} className={`text-center font-extrabold px-1.5 py-1 tabular-nums ${difCellClass(dif)}${idx === 4 ? ' border-r border-border/30' : ''}`}>
                        {fmtDif(dif)}
                      </td>
                    );
                  })}
                  <td className={`text-center font-extrabold px-2 py-1 border-l border-border/30 tabular-nums ${difCellClass(totalDiferenca)}`}>
                    {fmtDif(totalDiferenca)}
                  </td>
                </tr>
                {/* PESO */}
                <tr className="border-t border-border/20 bg-muted/20">
                  <td className="text-muted-foreground px-2 py-0.5 border-r border-border/30 text-[8px] italic">Peso kg</td>
                  {CAT_COLS.map((c, idx) => {
                    const peso = pesoMedioByCat.get(c.codigo);
                    return <td key={c.sigla} className={`text-center text-[9px] italic text-muted-foreground px-1.5 py-0.5 tabular-nums${idx === 4 ? ' border-r border-border/30' : ''}`}>{peso ? formatNum(peso, 1) : ''}</td>;
                  })}
                  {(() => {
                    let totalPesoAcc = 0;
                    let totalCabAcc = 0;
                    pesoMedioByCat.forEach((peso, codigo) => {
                      const cab = pastoDataByCat.get(codigo) || 0;
                      totalPesoAcc += peso * cab;
                      totalCabAcc += cab;
                    });
                    const pesoMedioTotal = totalCabAcc > 0 ? totalPesoAcc / totalCabAcc : null;
                    return (
                      <td className="text-center text-[9px] italic text-muted-foreground px-2 py-0.5 border-l border-border/30 tabular-nums font-semibold">
                        {pesoMedioTotal ? formatNum(pesoMedioTotal, 1) : ''}
                      </td>
                    );
                  })()}
                </tr>
                {/* GMD */}
                <tr className="bg-muted/20">
                  <td className="text-muted-foreground px-2 py-0.5 border-r border-border/30 text-[8px] italic">GMD</td>
                  {CAT_COLS.map((c, idx) => {
                    const g = gmdByCat.get(c.codigo);
                    return <td key={c.sigla} className={`text-center text-[9px] italic px-1.5 py-0.5 tabular-nums ${gmdColor(g ?? null)}${idx === 4 ? ' border-r border-border/30' : ''}`}>{g != null ? formatNum(g, 3) : ''}</td>;
                  })}
                  <td className={`text-center text-[9px] italic px-2 py-0.5 border-l border-border/30 tabular-nums ${gmdColor(gmdTotal)}`}>{gmdTotal != null ? formatNum(gmdTotal, 3) : ''}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── COL 3: Ações ── */}
          <div className="flex flex-col gap-1.5 items-end min-w-[120px]">
            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2.5 font-bold gap-1 w-full justify-start" onClick={() => setShowResumoAtividades(true)}>
              <BarChart3 className="h-3.5 w-3.5" /> Resumo por Atividade
            </Button>
            {onNavigateToConferenciaGmd && (
              <Button size="sm" variant="outline" className="h-7 text-[10px] px-2.5 font-bold gap-1 w-full justify-start" onClick={onNavigateToConferenciaGmd}>
                <Activity className="h-3.5 w-3.5" /> Conferência do GMD
              </Button>
            )}

            {allClosed && (
              <Badge className="bg-emerald-200 text-emerald-900 dark:bg-emerald-800/50 dark:text-emerald-100 text-[11px] font-bold gap-1">
                <CheckCircle className="h-3.5 w-3.5" /> Mês fechado
              </Badge>
            )}

            {showCloseButton && (
              <Button
                size="sm"
                className="w-full h-8 text-xs font-bold gap-1"
                onClick={() => setConfirmBulkOpen(true)}
              >
                <Lock className="h-3.5 w-3.5" /> Fechar Mês
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
                {onNavigateToReclass && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] font-bold gap-1 w-full justify-start"
                    onClick={() => onNavigateToReclass({ ano: anoFiltro, mes: mesFiltro })}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Ajustar Conciliação
                  </Button>
                )}
              </div>
            )}

            {fechadosCount > 0 && (canEdit('zootecnico') || canEdit('pastos')) && (
              <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2.5 font-bold gap-1 text-destructive hover:text-destructive w-full justify-start" onClick={() => setConfirmBulkReopenOpen(true)}>
                <Unlock className="h-3.5 w-3.5" /> Reabrir Mês
              </Button>
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

                return (
                  <Tooltip key={p.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleOpenPasto(p)}
                        className={`w-full rounded-lg border px-2 py-1.5 text-left hover:ring-1 hover:ring-primary/40 transition-all ${STATUS_CARD_CLASSES[pastoStatus]}`}
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
                          {resumo.totalCabecas > 0 ? `${resumo.totalCabecas} cab` : '—'}
                        </div>
                        {/* Peso médio */}
                        {resumo.pesoMedio && (
                          <div className="text-[8px] text-muted-foreground leading-none mt-0.5 tabular-nums">
                            {formatNum(resumo.pesoMedio, 1)} kg
                          </div>
                        )}
                        {/* Área + Tipo uso */}
                        <div className="flex items-center justify-between mt-0.5">
                          {p.area_produtiva_ha ? (
                            <span className="text-[8px] text-muted-foreground leading-none">{formatNum(p.area_produtiva_ha, 1)} ha</span>
                          ) : <span />}
                          {tipoUsoEfetivo && (
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
    </div>
  );
}
