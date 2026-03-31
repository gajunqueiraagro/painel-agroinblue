import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, CheckCircle, Circle, Lock, AlertTriangle, Sprout, BarChart3, Unlock, Lightbulb, Pencil } from 'lucide-react';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { formatAnoMes } from '@/lib/dateUtils';
import { MESES_COLS } from '@/lib/calculos/labels';
import { FechamentoPastoDialog } from '@/components/FechamentoPastoDialog';
import { calcUA, calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
import { formatNum } from '@/lib/calculos/formatters';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { gerarSugestoes, type Sugestao } from '@/lib/calculos/sugestoesConciliacao';

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

interface PastoResumo {
  totalCabecas: number;
  pesoMedio: number | null;
  uaHa: number | null;
  uaTotal: number;
  catBreakdown: { sigla: string; qty: number }[];
  lotacaoKgHa: number | null;
}

interface Props {
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
  onBackToConciliacao?: () => void;
  onNavigateToReclass?: (filtro?: { ano: string; mes: number }) => void;
}

const FECHAMENTO_GLOBAL_MARKER = 'fechamento_global_administrativo';

// Color map for tipo_uso
const TIPO_USO_STYLES: Record<string, { border: string; text: string; bg: string; icon?: 'plant' }> = {
  'cria':             { border: 'border-l-orange-500', text: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-500/10' },
  'recria':           { border: 'border-l-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  'engorda':          { border: 'border-l-blue-500', text: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-500/10' },
  'vedado':           { border: 'border-l-green-800', text: 'text-green-800 dark:text-green-400', bg: 'bg-green-800/10' },
  'reforma pecuaria': { border: 'border-l-gray-600', text: 'text-gray-700 dark:text-gray-300', bg: 'bg-gray-600/10' },
  'agricultura':      { border: 'border-l-lime-600', text: 'text-lime-700 dark:text-lime-400', bg: 'bg-lime-600/10', icon: 'plant' },
  'app':              { border: 'border-l-gray-900 dark:border-l-gray-100', text: 'text-gray-900 dark:text-gray-100', bg: 'bg-gray-900/10 dark:bg-gray-100/10' },
  'reserva legal':    { border: 'border-l-gray-900 dark:border-l-gray-100', text: 'text-gray-900 dark:text-gray-100', bg: 'bg-gray-900/10 dark:bg-gray-100/10' },
  'benfeitorias':     { border: 'border-l-gray-900 dark:border-l-gray-100', text: 'text-gray-900 dark:text-gray-100', bg: 'bg-gray-900/10 dark:bg-gray-100/10' },
};

const DEFAULT_TIPO_USO_STYLE: { border: string; text: string; bg: string; icon?: 'plant' } = {
  border: 'border-l-border',
  text: 'text-foreground',
  bg: 'bg-muted/20',
};

const normalizeTipoUso = (tipoUso?: string) => {
  if (!tipoUso) return '';
  return tipoUso
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
};

const getTipoUsoStyle = (tipoUso: string | undefined) => {
  if (!tipoUso) return DEFAULT_TIPO_USO_STYLE;
  return TIPO_USO_STYLES[normalizeTipoUso(tipoUso)] || DEFAULT_TIPO_USO_STYLE;
};

export function FechamentoTab({ filtroAnoInicial, filtroMesInicial, onBackToConciliacao, onNavigateToReclass }: Props = {}) {
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

  // Load items for all fechamentos to show summary on cards
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

  const pastosAtivos = pastos.filter(p => p.ativo && p.entra_conciliacao);
  const getFechamento = useCallback((pastoId: string) => fechamentos.find(f => f.pasto_id === pastoId) || null, [fechamentos]);

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

    // Category breakdown
    const catIdToCodigo = new Map((categorias || []).map(c => [c.id, c.codigo]));
    const catBreakdown: { sigla: string; qty: number }[] = [];
    for (const col of CAT_COLS) {
      const qty = items.filter(i => catIdToCodigo.get(i.categoria_id) === col.codigo).reduce((s, i) => s + i.quantidade, 0);
      if (qty > 0) catBreakdown.push({ sigla: col.sigla, qty });
    }

    // Lotação kg/ha
    const pesoTotal = comPeso.reduce((s, i) => s + (i.peso_medio_kg || 0) * i.quantidade, 0);
    const lotacaoKgHa = pasto.area_produtiva_ha && pesoTotal > 0 ? pesoTotal / pasto.area_produtiva_ha : null;

    return { totalCabecas: totalCab, pesoMedio, uaHa, uaTotal, catBreakdown, lotacaoKgHa };
  }, [itensMap, categorias]);

  const preenchidos = pastosAtivos.filter(p => getFechamento(p.id)).length;
  const fechadosCount = pastosAtivos.filter(p => getFechamento(p.id)?.status === 'fechado').length;
  const pendentesCount = pastosAtivos.length - fechadosCount;

  // Determine if bulk close button should show
  const canBulkClose = useMemo(() => {
    if (!anoMes) return false;
    if (pendentesCount === 0) return false;
    if (!canEdit('zootecnico') && !canEdit('pastos')) return false;
    return true;
  }, [anoMes, pendentesCount, canEdit]);

  // ── Conciliation summary data ──
  const anoNum = Number(anoMes.split('-')[0]);
  const mesNum = Number(anoMes.split('-')[1]);

  const saldoMap = useMemo(
    () => calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoNum, mesNum),
    [saldosIniciais, lancamentos, anoNum, mesNum]
  );

  // Only count items from pastosAtivos (ativo && entra_conciliacao) to match ResumoAtividadesView
  const activeFechIds = useMemo(() => {
    const activeIds = new Set(pastosAtivos.map(p => p.id));
    return new Set(fechamentos.filter(f => activeIds.has(f.pasto_id)).map(f => f.id));
  }, [pastosAtivos, fechamentos]);

  const pastoDataByCat = useMemo(() => {
    const catIdToCodigo = new Map((categorias || []).map(c => [c.id, c.codigo]));
    const map = new Map<string, number>();
    itensMap.forEach((items, fechId) => {
      if (!activeFechIds.has(fechId)) return;
      items.forEach(i => {
        if (i.quantidade > 0) {
          const codigo = catIdToCodigo.get(i.categoria_id);
          if (codigo) map.set(codigo, (map.get(codigo) || 0) + i.quantidade);
        }
      });
    });
    return map;
  }, [itensMap, categorias, activeFechIds]);

  const totalPasto = CAT_COLS.reduce((s, c) => s + (pastoDataByCat.get(c.codigo) || 0), 0);
  const totalSistema = CAT_COLS.reduce((s, c) => s + (saldoMap.get(c.codigo) || 0), 0);
  const totalDiferenca = totalPasto - totalSistema;

  // Sugestões de conciliação (mesma lógica da tela Conciliação de Categoria)
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

  const hasDivergencia = useMemo(() => {
    if (totalDiferenca !== 0) return true;
    return CAT_COLS.some(c => {
      const qtdPasto = pastoDataByCat.get(c.codigo) || 0;
      const qtdSistema = saldoMap.get(c.codigo) || 0;
      return qtdPasto - qtdSistema !== 0;
    });
  }, [totalDiferenca, pastoDataByCat, saldoMap]);

  const isAdminClosed = (fech: FechamentoPasto | null) => {
    return fech?.responsavel_nome === FECHAMENTO_GLOBAL_MARKER;
  };

  const handleOpenPasto = async (pasto: Pasto) => {
    let fech = getFechamento(pasto.id);
    if (!fech) {
      fech = await criarFechamento(pasto.id, anoMes);
    }
    if (!fech) return;
    setActiveFechamento(fech);
    setSelectedPasto(pasto);
    setDialogOpen(true);
  };

  const handleBulkClose = async () => {
    if (!fazendaAtual || fazendaAtual.id === '__global__') return;

    // Block if any category has divergence
    if (hasDivergencia) {
      toast.error('Não é possível fechar os pastos. Existem categorias desconciliadas entre Pasto e Sistema. Realize a conciliação antes de fechar.');
      setConfirmBulkOpen(false);
      return;
    }

    setBulkClosing(true);

    try {
      const fazendaId = fazendaAtual.id;
      const clienteId = fazendaAtual.cliente_id;

      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      const pastosParaFechar: string[] = [];
      for (const pasto of pastosAtivos) {
        const fech = getFechamento(pasto.id);
        if (!fech || fech.status !== 'fechado') {
          pastosParaFechar.push(pasto.id);
        }
      }

      if (pastosParaFechar.length === 0) {
        toast.info('Todos os pastos já estão fechados.');
        setBulkClosing(false);
        setConfirmBulkOpen(false);
        return;
      }

      for (const pastoId of pastosParaFechar) {
        let fech = getFechamento(pastoId);

        if (!fech) {
          fech = await criarFechamento(pastoId, anoMes);
          if (!fech) continue;
        }

        const { error } = await supabase
          .from('fechamento_pastos')
          .update({
            status: 'fechado',
            responsavel_nome: FECHAMENTO_GLOBAL_MARKER,
          })
          .eq('id', fech.id);

        if (error) {
          console.error('Erro ao fechar pasto administrativamente:', error);
        }
      }

      const auditPayload = {
        usuario_id: userId,
        fazenda_id: fazendaId,
        cliente_id: clienteId,
        competencia: anoMes,
        tipo_acao: FECHAMENTO_GLOBAL_MARKER,
        pastos_fechados: pastosParaFechar.length,
        data_hora: new Date().toISOString(),
      };
      console.info('[AUDIT] Fechamento Global Administrativo:', auditPayload);

      toast.success(`${pastosParaFechar.length} pasto(s) fechado(s) administrativamente.`);
      await loadFechamentos(anoMes);
    } catch (e) {
      console.error('Erro no fechamento global:', e);
      toast.error('Erro ao realizar fechamento global.');
    } finally {
      setBulkClosing(false);
      setConfirmBulkOpen(false);
    }
  };

  const handleBulkReopen = async () => {
    setBulkReopening(true);
    try {
      const pastosParaReabrir = pastosAtivos.filter(p => {
        const fech = getFechamento(p.id);
        return fech?.status === 'fechado';
      });

      for (const pasto of pastosParaReabrir) {
        const fech = getFechamento(pasto.id)!;
        const { error } = await supabase
          .from('fechamento_pastos')
          .update({ status: 'rascunho', responsavel_nome: null })
          .eq('id', fech.id);
        if (error) console.error('Erro ao reabrir pasto:', error);
      }

      toast.success(`${pastosParaReabrir.length} pasto(s) reaberto(s).`);
      await loadFechamentos(anoMes);
    } catch (e) {
      console.error('Erro ao reabrir pastos:', e);
      toast.error('Erro ao reabrir pastos.');
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
        fechamentos={fechamentos}
        itensMap={itensMap}
        categorias={categorias}
        anoMes={anoMes}
        onBack={() => setShowResumoAtividades(false)}
      />
    );
  }

  return (
    <div className="pb-24">
      {/* Tabela conciliação + Filtros - sticky */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm pt-2 px-2 pb-2 space-y-1.5">
        {/* Container superior: tabela esquerda + botões direita */}
        <div className="flex items-start justify-between gap-4">
          {/* Tabela resumo conciliação - 50% no desktop */}
          <div className="flex items-start gap-1 w-full md:w-[70%] shrink-0">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left font-bold text-muted-foreground px-1 py-0.5 w-12 border-r border-border/30">Cat.</th>
                    {CAT_COLS.map((c, idx) => (
                      <th key={c.sigla} className={`text-center font-bold text-muted-foreground px-0.5 py-0.5 min-w-[28px]${idx === 4 ? ' border-r border-border/30' : ''}`}>{c.sigla}</th>
                    ))}
                    <th className="text-center font-bold text-foreground px-1 py-0.5 min-w-[32px] border-l border-border/30">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-bold text-foreground px-1 py-0.5 border-r border-border/30">Pasto</td>
                    {CAT_COLS.map((c, idx) => {
                      const v = pastoDataByCat.get(c.codigo) || 0;
                      return <td key={c.sigla} className={`text-center text-foreground px-0.5 py-0.5${idx === 4 ? ' border-r border-border/30' : ''}`}>{v || ''}</td>;
                    })}
                    <td className="text-center font-bold text-foreground px-1 py-0.5 border-l border-border/30">{totalPasto}</td>
                  </tr>
                  <tr>
                    <td className="font-bold text-foreground px-1 py-0.5 border-r border-border/30">Sistema</td>
                    {CAT_COLS.map((c, idx) => {
                      const v = saldoMap.get(c.codigo) || 0;
                      return <td key={c.sigla} className={`text-center text-foreground px-0.5 py-0.5${idx === 4 ? ' border-r border-border/30' : ''}`}>{v || ''}</td>;
                    })}
                    <td className="text-center font-bold text-foreground px-1 py-0.5 border-l border-border/30">{totalSistema}</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="font-bold text-foreground px-1 py-0.5 border-r border-border/30">Dif.</td>
                    {CAT_COLS.map((c, idx) => {
                      const pasto = pastoDataByCat.get(c.codigo) || 0;
                      const sistema = saldoMap.get(c.codigo) || 0;
                      const dif = pasto - sistema;
                      return (
                        <td key={c.sigla} className={`text-center font-bold px-0.5 py-0.5 ${dif > 0 ? 'text-emerald-600' : dif < 0 ? 'text-red-600' : 'text-muted-foreground'}${idx === 4 ? ' border-r border-border/30' : ''}`}>
                          {dif !== 0 ? (dif > 0 ? `+${dif}` : dif) : ''}
                        </td>
                      );
                    })}
                    <td className={`text-center font-bold px-1 py-0.5 border-l border-border/30 ${totalDiferenca > 0 ? 'text-emerald-600' : totalDiferenca < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {totalDiferenca !== 0 ? (totalDiferenca > 0 ? `+${totalDiferenca}` : totalDiferenca) : '0'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {sugestoes.length > 0 && (
              <button
                onClick={() => setShowSugestoes(true)}
                className="shrink-0 mt-1 p-1 rounded-md hover:bg-accent transition-colors"
                title="Ver sugestões de ajuste"
              >
                <Lightbulb className="h-4 w-4 text-amber-500" />
              </button>
            )}
          </div>

          {/* Botões em coluna à direita - desktop */}
          <div className="hidden md:flex flex-col gap-1 shrink-0 pt-0.5">
            {onNavigateToReclass && hasDivergencia && (
              <Button
                size="sm"
                variant="outline"
                className="text-[10px] font-bold h-5 px-2 min-w-[140px] justify-center"
                onClick={() => onNavigateToReclass({ ano: anoFiltro, mes: mesFiltro })}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Evoluir Categorias
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-[10px] font-bold h-5 px-2 min-w-[140px] justify-center"
              onClick={() => setShowResumoAtividades(true)}
            >
              <BarChart3 className="h-3 w-3 mr-1" />
              Resumo por Atividade
            </Button>
            {canBulkClose && (
              <Button
                size="sm"
                variant="outline"
                className="text-[10px] font-bold border-warning text-warning hover:bg-warning/10 h-5 px-2 min-w-[140px] justify-center"
                onClick={() => {
                  if (hasDivergencia) {
                    toast.error('Não é possível fechar os pastos. Existem categorias desconciliadas entre Pasto e Sistema. Realize a conciliação antes de fechar.');
                    return;
                  }
                  setConfirmBulkOpen(true);
                }}
              >
                <Lock className="h-3 w-3 mr-1" />
                Fechamento Todos
              </Button>
            )}
            {fechadosCount > 0 && (canEdit('zootecnico') || canEdit('pastos')) && (
              <Button
                size="sm"
                variant="outline"
                className="text-[10px] font-bold border-destructive text-destructive hover:bg-destructive/10 h-5 px-2 min-w-[140px] justify-center"
                onClick={() => setConfirmBulkReopenOpen(true)}
              >
                <Unlock className="h-3 w-3 mr-1" />
                Reabrir Pastos
              </Button>
            )}
          </div>
        </div>

        {/* Container inferior: filtros | status central | status secundário */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <Select value={anoFiltro} onValueChange={setAnoFiltro}>
              <SelectTrigger className="w-[68px] h-6 text-[11px] font-bold px-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(mesFiltro)} onValueChange={v => setMesFiltro(Number(v))}>
              <SelectTrigger className="w-[68px] h-6 text-[11px] font-bold px-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES_COLS.map((m, i) => (
                  <SelectItem key={m.key} value={String(i + 1)}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 flex justify-center">
            <Badge variant="secondary" className="text-[10px] font-bold">{preenchidos}/{pastosAtivos.length} iniciados</Badge>
          </div>
          <div className="shrink-0">
            <span className="text-[10px] text-muted-foreground font-medium">{fechadosCount} fechados</span>
          </div>
        </div>

        {/* Botões mobile */}
        <div className="flex md:hidden items-center gap-1.5 flex-wrap">
          {onNavigateToReclass && hasDivergencia && (
            <Button size="sm" variant="outline" className="text-xs font-bold h-7 flex-1 min-w-[120px] justify-center" onClick={() => onNavigateToReclass({ ano: anoFiltro, mes: mesFiltro })}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Evoluir Categorias
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs font-bold h-7 flex-1 min-w-[120px] justify-center" onClick={() => setShowResumoAtividades(true)}>
            <BarChart3 className="h-3.5 w-3.5 mr-1" /> Resumo por Atividade
          </Button>
          {canBulkClose && (
            <Button size="sm" variant="outline" className="text-xs font-bold border-warning text-warning hover:bg-warning/10 h-7 flex-1 min-w-[120px] justify-center" onClick={() => { if (hasDivergencia) { toast.error('Não é possível fechar. Categorias desconciliadas.'); return; } setConfirmBulkOpen(true); }}>
              <Lock className="h-3.5 w-3.5 mr-1" /> Fechamento Todos
            </Button>
          )}
          {fechadosCount > 0 && (canEdit('zootecnico') || canEdit('pastos')) && (
            <Button size="sm" variant="outline" className="text-xs font-bold border-destructive text-destructive hover:bg-destructive/10 h-7 flex-1 min-w-[120px] justify-center" onClick={() => setConfirmBulkReopenOpen(true)}>
              <Unlock className="h-3.5 w-3.5 mr-1" /> Reabrir Pastos
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : pastosAtivos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhum pasto ativo para conciliação.</p>
          <p className="text-xs mt-1">Cadastre pastos na aba "Pastos" e marque "Entra na conciliação".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {pastosAtivos.map(p => {
            const fech = getFechamento(p.id);
            const status = fech?.status;
            const resumo = getResumo(fech, p);
            const adminClose = isAdminClosed(fech);
            const tipoStyle = getTipoUsoStyle(p.tipo_uso);
            return (
              <button
                key={p.id}
                onClick={() => handleOpenPasto(p)}
                className={`w-full rounded-lg border px-2.5 py-2 text-left hover:bg-accent/50 transition-colors border-l-4 ${tipoStyle.border} ${tipoStyle.bg}`}
              >
                {/* Header: nome + badge */}
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm truncate mr-1">{p.nome}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {status === 'fechado' ? (
                      adminClose ? (
                        <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0 h-[18px]">
                          <Lock className="h-3 w-3 mr-0.5" />Global
                        </Badge>
                      ) : (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 h-[18px]"><CheckCircle className="h-3 w-3 mr-0.5" />Fechado</Badge>
                      )
                    ) : status === 'rascunho' ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-[18px]"><Circle className="h-3 w-3 mr-0.5" />Rascunho</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-[18px]"><Circle className="h-3 w-3 mr-0.5" />Não iniciado</Badge>
                    )}
                  </div>
                </div>

                {/* Compact info row: lote + categorias */}
                {(fech?.lote_mes || (fech && resumo.catBreakdown.length > 0)) && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px] text-muted-foreground mt-0.5">
                    {fech?.lote_mes && <span className="font-medium">Lote: {fech.lote_mes}</span>}
                    {fech && resumo.catBreakdown.length > 0 && resumo.catBreakdown.map(cb => (
                      <span key={cb.sigla}>
                        <span className="font-medium text-foreground">{cb.sigla}</span> {cb.qty}
                      </span>
                    ))}
                  </div>
                )}

                {/* Indicadores compactos */}
                {fech && resumo.totalCabecas > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0 text-[10px] text-muted-foreground mt-0.5">
                    {fech.qualidade_mes && (
                      <span>Qual: <span className="font-medium text-foreground">{fech.qualidade_mes}</span></span>
                    )}
                    {resumo.uaHa && (
                      <span>UA/ha: <span className="font-medium text-foreground">{formatNum(resumo.uaHa, 2)}</span></span>
                    )}
                    {resumo.lotacaoKgHa && (
                      <span>Lotação: <span className="font-medium text-foreground">{formatNum(resumo.lotacaoKgHa, 0)} kg/ha</span></span>
                    )}
                  </div>
                )}

                {/* Footer: área | cabeças | tipo uso */}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/30 pt-1 mt-1">
                  <div className="flex items-center">
                    <span>{p.area_produtiva_ha ? `📍 ${formatNum(p.area_produtiva_ha, 1)} ha` : '—'}</span>
                    {resumo.totalCabecas > 0 && (
                      <>
                        <span className="mx-1.5 text-border">|</span>
                        <span className="font-medium text-foreground">{resumo.totalCabecas} cab</span>
                      </>
                    )}
                  </div>
                  {p.tipo_uso && (
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 font-bold uppercase tracking-wide ${tipoStyle.text} border-current/30`}>
                      {tipoStyle.icon === 'plant' && <Sprout className="h-3 w-3 mr-0.5" />}
                      {p.tipo_uso}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
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
            const ok = await reabrirPasto(activeFechamento.id);
            if (ok) loadFechamentos(anoMes);
            return ok;
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

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmBulkOpen} onOpenChange={setConfirmBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Fechamento Global da Fazenda
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              Você está realizando um <strong>fechamento global</strong> da fazenda
              {fazendaAtual ? ` "${fazendaAtual.nome}"` : ''} para o mês <strong>{formatAnoMes(anoMes)}</strong>.
              <br /><br />
              Os <strong>{pendentesCount} pasto(s)</strong> ainda não fechados serão marcados como{' '}
              <strong>"Fechamento Global"</strong> (fechamento administrativo).
              <br /><br />
              Pastos já fechados individualmente <strong>não serão alterados</strong>.
              <br /><br />
              <span className="text-muted-foreground text-xs">
                Esta ação ficará registrada para auditoria.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkClosing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkClose}
              disabled={bulkClosing}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              {bulkClosing ? 'Fechando...' : `Fechar ${pendentesCount} pasto(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen Confirmation Dialog */}
      <AlertDialog open={confirmBulkReopenOpen} onOpenChange={setConfirmBulkReopenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5 text-destructive" />
              Reabrir Pastos
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              Você está reabrindo <strong>{fechadosCount} pasto(s) fechado(s)</strong> da fazenda
              {fazendaAtual ? ` "${fazendaAtual.nome}"` : ''} para o mês <strong>{formatAnoMes(anoMes)}</strong>.
              <br /><br />
              O status será alterado de <strong>"Fechado"</strong> para <strong>"Rascunho"</strong>.
              <br /><br />
              <strong>Nenhum dado será alterado</strong>, apenas o status dos pastos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkReopening}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkReopen}
              disabled={bulkReopening}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkReopening ? 'Reabrindo...' : `Reabrir ${fechadosCount} pasto(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sugestões de Ajuste Dialog */}
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
                  s.tipo === 'evolucao'
                    ? 'border-primary/30 bg-primary/5'
                    : s.tipo === 'excesso'
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-red-500/30 bg-red-500/5'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">
                    {s.tipo === 'evolucao' ? '🔄' : s.tipo === 'excesso' ? '⚠️' : '❌'}
                  </span>
                  <span className="text-foreground">{s.mensagem}</span>
                </div>
              </div>
            ))}
            {sugestoes.length === 0 && (
              <p className="text-center text-muted-foreground py-4">Nenhuma sugestão de ajuste.</p>
            )}
          </div>
          {onNavigateToReclass && sugestoes.some(s => s.tipo === 'evolucao') && (
            <Button
              className="w-full mt-2"
              onClick={() => {
                setShowSugestoes(false);
                onNavigateToReclass({ ano: anoFiltro, mes: mesFiltro });
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Evol. Categoria
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
