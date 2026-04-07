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
import { calcUA } from '@/lib/calculos/zootecnicos';
import { formatNum } from '@/lib/calculos/formatters';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { gerarSugestoes, type Sugestao } from '@/lib/calculos/sugestoesConciliacao';
import { useZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';

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
  onNavigateToValorRebanho?: () => void;
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

export function FechamentoTab({ filtroAnoInicial, filtroMesInicial, onBackToConciliacao, onNavigateToReclass, onNavigateToValorRebanho }: Props = {}) {
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

  const pastosAtivos = useMemo(
    () => pastos.filter(p => p.ativo && p.entra_conciliacao),
    [pastos]
  );
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

  // FONTE OFICIAL: saldo previsto por movimentações (vw_zoot_categoria_mensal)
  // Compara contra pastoDataByCat para detectar divergências de conciliação
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

  // Fonte oficial da conciliação visual:
  // fechamento_pastos deduplicado por pasto (updated_at mais recente),
  // sem depender de pasto ativo atual para não distorcer meses históricos.
  const dedupFechamentos = useMemo(() => {
    const byPasto = new Map<string, FechamentoPasto>();
    fechamentos.forEach(f => {
      const atual = byPasto.get(f.pasto_id);
      const tsAtual = atual?.updated_at || '';
      const tsNovo = f.updated_at || '';

      if (!atual || tsNovo > tsAtual || (tsNovo === tsAtual && f.status === 'fechado' && atual.status !== 'fechado')) {
        byPasto.set(f.pasto_id, f);
      }
    });
    return Array.from(byPasto.values());
  }, [fechamentos]);

  const dedupFechIds = useMemo(
    () => new Set(dedupFechamentos.map(f => f.id)),
    [dedupFechamentos]
  );

  // ── Fonte OPERACIONAL: mesma base visual dos pastos/cards/resumo (sem conciliação) ──
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

  // ── Fonte OPERACIONAL: realidade dos pastos exibida nas telas operacionais ──
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

  // hasDivergencia usa a mesma fonte OPERACIONAL (pastoDataByCat) da linha Dif.
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
        fechamentos={operationalFechamentos}
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
          <div className="flex items-start gap-1 w-full md:w-[50%] shrink-0">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="border-b border-border/40 bg-muted">
                    <th className="text-left font-bold text-muted-foreground px-1 py-0.5 w-12 border-r border-border/30 bg-muted">Cab.</th>
                    {CAT_COLS.map((c, idx) => (
                      <th key={c.sigla} className={`text-right font-bold text-muted-foreground px-1 py-0.5 min-w-[28px]${idx === 4 ? ' border-r border-border/30' : ''}`}>{c.sigla}</th>
                    ))}
                    <th className="text-right font-bold text-foreground px-1 py-0.5 min-w-[32px] border-l border-border/30 bg-muted">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-bold text-foreground px-1 py-0.5 border-r border-border/30 bg-muted">Pasto</td>
                    {CAT_COLS.map((c, idx) => {
                      const v = pastoDataByCat.get(c.codigo) || 0;
                      return <td key={c.sigla} className={`text-right italic text-foreground px-1 py-0.5${idx === 4 ? ' border-r border-border/30' : ''}`}>{v ? v.toLocaleString('pt-BR') : ''}</td>;
                    })}
                    <td className="text-right italic font-bold text-foreground px-1 py-0.5 border-l border-border/30 bg-muted">{totalPasto.toLocaleString('pt-BR')}</td>
                  </tr>
                  <tr>
                    <td className="font-bold text-foreground px-1 py-0.5 border-r border-border/30 bg-muted">Sistema</td>
                    {CAT_COLS.map((c, idx) => {
                      const v = saldoMap.get(c.codigo) || 0;
                      return <td key={c.sigla} className={`text-right italic text-foreground px-1 py-0.5${idx === 4 ? ' border-r border-border/30' : ''}`}>{v ? v.toLocaleString('pt-BR') : ''}</td>;
                    })}
                    <td className="text-right italic font-bold text-foreground px-1 py-0.5 border-l border-border/30 bg-muted">{totalSistema.toLocaleString('pt-BR')}</td>
                  </tr>
                  <tr className="border-t border-border/40 bg-muted">
                    <td className="font-bold text-foreground px-1 py-0.5 border-r border-border/30 bg-muted">Dif.</td>
                    {CAT_COLS.map((c, idx) => {
                      const pasto = pastoDataByCat.get(c.codigo) || 0;
                      const sistema = saldoMap.get(c.codigo) || 0;
                      const dif = pasto - sistema;
                      const formatted = dif !== 0 ? (dif > 0 ? `+${Math.abs(dif).toLocaleString('pt-BR')}` : `-${Math.abs(dif).toLocaleString('pt-BR')}`) : '';
                      return (
                        <td key={c.sigla} className={`text-right italic font-bold px-1 py-0.5 ${dif > 0 ? 'text-emerald-600' : dif < 0 ? 'text-red-600' : 'text-muted-foreground'}${idx === 4 ? ' border-r border-border/30' : ''}`}>
                          {formatted}
                        </td>
                      );
                    })}
                    <td className={`text-right italic font-bold px-1 py-0.5 border-l border-border/30 bg-muted ${totalDiferenca > 0 ? 'text-emerald-600' : totalDiferenca < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {totalDiferenca !== 0 ? (totalDiferenca > 0 ? `+${Math.abs(totalDiferenca).toLocaleString('pt-BR')}` : `-${Math.abs(totalDiferenca).toLocaleString('pt-BR')}`) : '0'}
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

          {/* Botões em coluna - centralizados no espaço restante */}
          <div className="hidden md:flex flex-col gap-1 flex-1 items-center justify-center pt-0.5">
            {onNavigateToReclass && hasDivergencia && (
              <Button
                size="sm"
                variant="outline"
                className="text-[10px] font-bold h-5 px-2 w-[170px] justify-center"
                onClick={() => onNavigateToReclass({ ano: anoFiltro, mes: mesFiltro })}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Evoluir Categorias
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-[10px] font-bold h-5 px-2 w-[170px] justify-center"
              onClick={() => setShowResumoAtividades(true)}
            >
              <BarChart3 className="h-3 w-3 mr-1" />
              Resumo por Atividade
            </Button>
            {canBulkClose && (
              <Button
                size="sm"
                variant="outline"
                className="text-[10px] font-bold border-warning text-warning hover:bg-warning/10 h-5 px-2 w-[170px] justify-center"
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
                className="text-[10px] font-bold border-destructive text-destructive hover:bg-destructive/10 h-5 px-2 w-[170px] justify-center"
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

      <div className="px-2 pt-1.5 pb-4">

      {/* Alert: all pastos closed */}
      {!loading && pastosAtivos.length > 0 && fechadosCount === pastosAtivos.length && (
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 text-[10px] font-bold gap-1">
            <CheckCircle className="h-3 w-3" />
            Categorias conciliadas
          </Badge>
          {onNavigateToValorRebanho && (
            <Button size="sm" variant="outline" className="text-[10px] h-5 px-2 font-bold" onClick={onNavigateToValorRebanho}>
              Inserir preço do rebanho
            </Button>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : pastosAtivos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhum pasto ativo para conciliação.</p>
          <p className="text-xs mt-1">Cadastre pastos na aba "Pastos" e marque "Entra na conciliação".</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1">
          {pastosAtivos.map(p => {
            const fech = getFechamento(p.id);
            const status = fech?.status;
            const resumo = getResumo(fech, p);
            const adminClose = isAdminClosed(fech);
            const tipoNorm = normalizeTipoUso(p.tipo_uso);
            const isEmpty = resumo.totalCabecas === 0;

            const cardBg = isEmpty
              ? 'bg-gray-100 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700'
              : tipoNorm === 'recria'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-700'
              : tipoNorm === 'engorda'
              ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-700'
              : tipoNorm === 'cria'
              ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-700'
              : 'bg-card border-border';

            return (
              <button
                key={p.id}
                onClick={() => handleOpenPasto(p)}
                className={`w-full rounded border px-1.5 py-1 text-left hover:ring-1 hover:ring-primary/40 transition-all ${cardBg}`}
              >
                {/* Line 1: Name + Status */}
                <div className="flex items-center justify-between gap-0.5">
                  <span className="font-bold text-xs text-foreground truncate leading-tight">{p.nome}</span>
                  {status === 'fechado' ? (
                    adminClose ? (
                      <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[7px] px-0.5 py-0 h-[12px] shrink-0 leading-none">
                        <Lock className="h-2 w-2" />G
                      </Badge>
                    ) : (
                      <Badge variant="default" className="text-[7px] px-0.5 py-0 h-[12px] shrink-0 leading-none"><CheckCircle className="h-2 w-2" /></Badge>
                    )
                  ) : status === 'rascunho' ? (
                    <Badge variant="secondary" className="text-[7px] px-0.5 py-0 h-[12px] shrink-0 leading-none">R</Badge>
                  ) : null}
                </div>

                {/* Line 2: Cabeças (principal) */}
                <div className="font-extrabold text-[13px] tabular-nums text-foreground leading-tight mt-0.5">
                  {resumo.totalCabecas > 0 ? `${resumo.totalCabecas} cab` : '—'}
                </div>

                {/* Line 3: Área + Tipo uso */}
                <div className="flex items-center justify-between mt-0.5">
                  {p.area_produtiva_ha ? (
                    <span className="text-[8px] text-muted-foreground leading-none">{formatNum(p.area_produtiva_ha, 1)} ha</span>
                  ) : <span />}
                  {p.tipo_uso && (
                    <span className={`text-[7px] font-bold uppercase tracking-wider leading-none ${
                      tipoNorm === 'recria' ? 'text-emerald-700 dark:text-emerald-400'
                      : tipoNorm === 'engorda' ? 'text-blue-700 dark:text-blue-400'
                      : tipoNorm === 'cria' ? 'text-orange-700 dark:text-orange-400'
                      : 'text-muted-foreground'
                    }`}>
                      {p.tipo_uso.toUpperCase()}
                    </span>
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
