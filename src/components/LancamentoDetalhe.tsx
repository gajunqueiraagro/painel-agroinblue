import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Lancamento,
  CATEGORIAS,
  TODOS_TIPOS,
  Categoria,
  TipoMovimentacao,
  kgToArrobas,
} from '@/types/cattle';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { isEntrada, isReclassificacao } from '@/lib/calculos/zootecnicos';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pencil, Trash2, DollarSign, AlertTriangle } from 'lucide-react';
import { AbateShareButtons } from '@/components/AbateExportMenu';
import { useFazenda } from '@/contexts/FazendaContext';
import { STATUS_OPTIONS_ZOOTECNICO_COM_META, getStatusBadge, getStatus, isMeta, type StatusOperacional } from '@/lib/statusOperacional';
import { usePermissions } from '@/hooks/usePermissions';
import { CompraFinanceiroPanel } from '@/components/CompraFinanceiroPanel';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda, formatKg, formatArroba, formatPercent } from '@/lib/calculos/formatters';
import { calcValorTotal, calcArrobas, calcIndicadoresLancamento } from '@/lib/calculos/economicos';

interface Props {
  lancamento: Lancamento;
  open: boolean;
  onClose: () => void;
  onEditar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover: (id: string) => void;
  onCountFinanceiros?: (id: string) => Promise<number>;
  onEditarAbate?: (lancamento: Lancamento) => void;
  onEditarVenda?: (lancamento: Lancamento) => void;
  onEditarCompra?: (lancamento: Lancamento) => void;
  onEditarTransferencia?: (lancamento: Lancamento) => void;
  onEditarReclass?: (lancamento: Lancamento) => void;
  fazendaId?: string;
}

export function LancamentoDetalhe({ lancamento, open, onClose, onEditar, onRemover, onCountFinanceiros, onEditarAbate, onEditarVenda, onEditarCompra, onEditarTransferencia, onEditarReclass, fazendaId }: Props) {
  const { fazendaAtual, fazendas } = useFazenda();
  const { canEditMeta } = usePermissions();
  const nomeFazenda = fazendaAtual?.nome || '';
  const outrasFazendas = useMemo(() => fazendas.filter(f => f.id !== fazendaAtual?.id), [fazendas, fazendaAtual]);
  const lancamentoIsMeta = isMeta(lancamento);
  const metaLocked = lancamentoIsMeta && !canEditMeta;

  // ─── P1 governance for this lancamento's month ───
  const lancAnoMes = useMemo(() => lancamento.data?.slice(0, 7), [lancamento.data]);
  const { status: statusPilaresLanc } = useStatusPilares(fazendaId, lancAnoMes);
  const p1Oficial = statusPilaresLanc.p1_mapa_pastos.status === 'oficial';

  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ ...lancamento });
  /** UI-only: tracks whether 'meta' is selected in the status toggle (for edit forms) */
  const [formStatusMode, setFormStatusMode] = useState<'realizado' | 'programado' | 'meta'>(
    lancamentoIsMeta ? 'meta' : ((lancamento.statusOperacional as any) || 'realizado')
  );

  // Confirmation modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [financeiroCount, setFinanceiroCount] = useState(0);
  const [checkingVinculos, setCheckingVinculos] = useState(false);
  const [notaFiscalEdit, setNotaFiscalEdit] = useState(lancamento.notaFiscal || '');

  // Unified purchase edit sheet
  const [compraEditSheetOpen, setCompraEditSheetOpen] = useState(false);
  const [compraForm, setCompraForm] = useState({ ...lancamento });
  const [compraStatusMode, setCompraStatusMode] = useState<'realizado' | 'programado' | 'meta'>(
    lancamentoIsMeta ? 'meta' : ((lancamento.statusOperacional as any) || 'realizado')
  );
  const [compraSaving, setCompraSaving] = useState(false);
  const [compraZooSaved, setCompraZooSaved] = useState(false);

  // Financial records summary for purchases
  interface FinResumo { id: string; descricao: string; valor: number; data_pagamento: string | null; cancelado: boolean; origem_tipo: string | null; }
  const [finRecords, setFinRecords] = useState<FinResumo[]>([]);
  const [finLoading, setFinLoading] = useState(false);
  const [detalheFornecedorId, setDetalheFornecedorId] = useState('');

  const isCompra = lancamento.tipo === 'compra';
  const isAbate = lancamento.tipo === 'abate';
  const isVenda = lancamento.tipo === 'venda';
  const isTransferenciaSaida = lancamento.tipo === 'transferencia_saida';

  const loadFinRecords = useCallback(() => {
    if (!isCompra) return;
    setFinLoading(true);
    supabase
      .from('financeiro_lancamentos_v2')
      .select('id, descricao, valor, data_pagamento, cancelado, origem_tipo, favorecido_id')
      .eq('movimentacao_rebanho_id', lancamento.id)
      .eq('cancelado', false)
      .order('data_pagamento', { ascending: true })
      .then(({ data }) => {
        setFinRecords((data as FinResumo[]) || []);
        setFinLoading(false);
        const favId = (data as any[])?.[0]?.favorecido_id;
        if (favId && !detalheFornecedorId) setDetalheFornecedorId(favId);
      });
  }, [isCompra, lancamento.id, detalheFornecedorId]);

  useEffect(() => {
    if (open) loadFinRecords();
  }, [open, loadFinRecords]);

  const tipoInfo = TODOS_TIPOS.find(t => t.value === lancamento.tipo);
  const catInfo = CATEGORIAS.find(c => c.value === lancamento.categoria);

  const isTransferenciaEntrada = lancamento.tipo === 'transferencia_entrada';

  // ---- Handle edit click ----
  const handleEditClick = () => {
    if (isAbate && onEditarAbate) {
      // Redirect abate to the full form in LancamentosTab
      onClose();
      onEditarAbate(lancamento);
    } else if (isVenda && onEditarVenda) {
      // Redirect venda to the full form in LancamentosTab
      onClose();
      onEditarVenda(lancamento);
    } else if (isCompra && onEditarCompra) {
      // Redirect compra to the full form in LancamentosTab
      onClose();
      onEditarCompra(lancamento);
    } else if (lancamento.tipo === 'transferencia_saida' && onEditarTransferencia) {
      onClose();
      onEditarTransferencia(lancamento);
    } else if (isReclassificacao(lancamento.tipo) && onEditarReclass) {
      onClose();
      onEditarReclass(lancamento);
    } else if (isCompra) {
      // Fallback: Open unified purchase edit sheet
      setCompraForm({ ...lancamento });
      setCompraStatusMode(lancamentoIsMeta ? 'meta' : ((lancamento.statusOperacional as any) || 'realizado'));
      setCompraZooSaved(false);
      setNotaFiscalEdit(lancamento.notaFiscal || '');
      setCompraEditSheetOpen(true);
    } else {
      setForm({ ...lancamento });
      setFormStatusMode(lancamentoIsMeta ? 'meta' : ((lancamento.statusOperacional as any) || 'realizado'));
      setEditando(true);
    }
  };

  // ---- Simple edit save (non-purchase) ----
  const handleSalvar = () => {
    const isSaidaAuto = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(form.tipo);
    const isEntradaAuto = ['nascimento', 'compra', 'transferencia_entrada'].includes(form.tipo);

    onEditar(lancamento.id, {
      data: form.data,
      tipo: form.tipo,
      quantidade: Number(form.quantidade),
      categoria: form.categoria,
      categoriaDestino: form.categoriaDestino,
      fazendaOrigem: isSaidaAuto ? nomeFazenda : (form.fazendaOrigem || undefined),
      fazendaDestino: isEntradaAuto ? nomeFazenda : (form.fazendaDestino || undefined),
      pesoMedioKg: form.pesoMedioKg ? Number(form.pesoMedioKg) : undefined,
      pesoMedioArrobas: form.pesoMedioKg ? kgToArrobas(Number(form.pesoMedioKg)) : undefined,
      precoMedioCabeca: form.precoMedioCabeca ? Number(form.precoMedioCabeca) : undefined,
      cenario: formStatusMode === 'meta' ? 'meta' : 'realizado',
      statusOperacional: formStatusMode === 'meta' ? null : (form.statusOperacional || null),
    });
    setEditando(false);
    onClose();
  };

  // ---- Purchase zootécnico save ----
  const handleSalvarCompraZoo = async () => {
    setCompraSaving(true);
    try {
      await onEditar(lancamento.id, {
        data: compraForm.data,
        tipo: compraForm.tipo,
        quantidade: Number(compraForm.quantidade),
        categoria: compraForm.categoria,
        fazendaOrigem: compraForm.fazendaOrigem || undefined,
        fazendaDestino: nomeFazenda,
        pesoMedioKg: compraForm.pesoMedioKg ? Number(compraForm.pesoMedioKg) : undefined,
        pesoMedioArrobas: compraForm.pesoMedioKg ? kgToArrobas(Number(compraForm.pesoMedioKg)) : undefined,
        cenario: compraStatusMode === 'meta' ? 'meta' : 'realizado',
        statusOperacional: compraStatusMode === 'meta' ? null : (compraForm.statusOperacional || null),
      });
      setCompraZooSaved(true);
    } finally {
      setCompraSaving(false);
    }
  };

  // ---- Deletion ----
  const handleRemoverClick = useCallback(async () => {
    if (onCountFinanceiros) {
      setCheckingVinculos(true);
      try {
        const count = await onCountFinanceiros(lancamento.id);
        setFinanceiroCount(count);
        setConfirmOpen(true);
      } finally {
        setCheckingVinculos(false);
      }
    } else {
      setFinanceiroCount(0);
      setConfirmOpen(true);
    }
  }, [lancamento.id, onCountFinanceiros]);

  const handleConfirmRemover = () => {
    setConfirmOpen(false);
    onRemover(lancamento.id);
    onClose();
  };

  // ===================== VIEW MODE =====================
  if (!editando) {
    const entrada = isEntrada(lancamento.tipo);
    const reclass = isReclassificacao(lancamento.tipo);
    const catDestinoInfo = lancamento.categoriaDestino
      ? CATEGORIAS.find(c => c.value === lancamento.categoriaDestino)
      : null;

    const statusBadge = getStatusBadge(lancamento);
    const ind = calcIndicadoresLancamento(lancamento);
    const totalArrobas = calcArrobas(lancamento);
    const valorTotalCalc = calcValorTotal(lancamento);

    // Helper for a detail row
    const Row = ({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) => (
      <div className={className}>
        <p className="text-[9px] text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className="font-bold text-foreground text-[11px] leading-tight tabular-nums">{value}</p>
      </div>
    );

    return (
      <>
        <Dialog open={open} onOpenChange={onClose}>
          <DialogContent className="max-w-lg">
            <DialogHeader className="pb-0">
              <DialogTitle className="flex items-center gap-2 text-sm">
                <span className="text-lg">{tipoInfo?.icon}</span>
                {tipoInfo?.label}
                <span className={`ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge.cls}`}>
                  {statusBadge.label}
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-1.5">
              {/* ── Dados operacionais ── */}
              <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                <Row label={isAbate ? 'Data do Abate' : 'Data'} value={format(parseISO(lancamento.data), 'dd/MM/yyyy', { locale: ptBR })} />
                <Row
                  label="Quantidade"
                  value={
                    <span className={entrada ? 'text-green-700 dark:text-green-400' : reclass ? '' : 'text-destructive'}>
                      {entrada ? '+' : reclass ? '' : '-'}{lancamento.quantidade} cab.
                    </span>
                  }
                />
                <Row label="Categoria" value={catInfo?.label || '-'} />

                {catDestinoInfo && <Row label="Cat. Destino" value={catDestinoInfo.label} />}

                {lancamento.pesoMedioKg && (
                  <Row label="Peso Médio" value={`${formatKg(lancamento.pesoMedioKg)} (${formatArroba(lancamento.pesoMedioKg / 30)})`} />
                )}

                {lancamento.fazendaOrigem && (
                  <Row label="Fazenda Origem" value={lancamento.fazendaOrigem} />
                )}
                {lancamento.fazendaDestino && (
                  <Row label={isAbate ? 'Frigorífico' : 'Fazenda Destino'} value={lancamento.fazendaDestino} />
                )}
              </div>

              {/* ── Abate: campos específicos ── */}
              {isAbate && (
                <>
                  <Separator className="my-0.5" />
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                    {lancamento.dataVenda && <Row label="Data Venda" value={format(parseISO(lancamento.dataVenda), 'dd/MM/yyyy')} />}
                    {lancamento.dataEmbarque && <Row label="Data Embarque" value={format(parseISO(lancamento.dataEmbarque), 'dd/MM/yyyy')} />}
                    {lancamento.dataAbate && <Row label="Data Abate" value={format(parseISO(lancamento.dataAbate), 'dd/MM/yyyy')} />}
                    {lancamento.tipoVenda && (
                      <Row label="Comercialização" value={{ escala: 'Escala', a_termo: 'A termo', spot: 'Spot', outro: 'Outro' }[lancamento.tipoVenda] || lancamento.tipoVenda} />
                    )}
                    {lancamento.tipoPeso && (
                      <Row label="Tipo de Abate" value={{ vivo: 'Peso vivo', morto: 'Peso morto' }[lancamento.tipoPeso] || lancamento.tipoPeso} />
                    )}
                    {lancamento.pesoCarcacaKg && <Row label="Peso Carcaça" value={formatKg(lancamento.pesoCarcacaKg)} />}
                    {lancamento.pesoCarcacaKg && lancamento.pesoMedioKg && ind.rendimento > 0 && (
                      <Row label="Rendimento" value={formatPercent(ind.rendimento)} />
                    )}
                    {lancamento.precoArroba && <Row label="R$/@ Base" value={formatMoeda(lancamento.precoArroba)} />}
                  </div>
                </>
              )}

              {/* ── Bloco financeiro resumido ── */}
              {isAbate && valorTotalCalc > 0 ? (
                <>
                  <Separator className="my-0.5" />
                  {(() => {
                    const snap = lancamento.detalhesSnapshot as any;
                    const snapCalc = snap?.calculation;
                    const valorBase = snapCalc?.valorBase ?? ((totalArrobas || 0) * (lancamento.precoArroba || 0));
                    const funruralTotal = snapCalc?.funruralTotal ?? (lancamento.descontoFunrural || 0);
                    const valorBruto = snapCalc?.valorBruto ?? (valorBase - funruralTotal);
                    const bonusTotal = snapCalc?.totalBonus ?? ((lancamento.bonusPrecoce || 0) + (lancamento.bonusQualidade || 0) + (lancamento.bonusListaTrace || 0));
                    const descontosTotal = snapCalc?.totalDescontos ?? ((lancamento.descontoQualidade || 0) + (lancamento.outrosDescontos || 0));
                    const valorLiquido = snapCalc?.valorLiquido ?? valorTotalCalc;
                    const liqArrobaVal = snapCalc?.liqArroba ?? ind.liqArroba;
                    const liqCabecaVal = snapCalc?.liqCabeca ?? ind.liqCabeca;
                    const liqKgVal = snapCalc?.liqKg ?? ind.liqKg;
                    const totalArrobasVal = snapCalc?.totalArrobas ?? totalArrobas;
                    return (
                      <>
                        <div className="space-y-0.5 text-[10px]">
                          <div className="flex justify-between"><span className="text-muted-foreground">Valor Base</span><strong className="tabular-nums">{formatMoeda(valorBase)}</strong></div>
                          {funruralTotal > 0 && (
                            <div className="flex justify-between"><span className="text-muted-foreground">– Funrural</span><strong className="text-destructive tabular-nums">-{formatMoeda(funruralTotal)}</strong></div>
                          )}
                          <div className="flex justify-between font-bold text-[10px]"><span>= Valor Bruto</span><span className="tabular-nums">{formatMoeda(valorBruto)}</span></div>
                          {bonusTotal > 0 && (
                            <div className="flex justify-between"><span className="text-muted-foreground">+ Bônus</span><strong className="text-green-600 dark:text-green-400 tabular-nums">+{formatMoeda(bonusTotal)}</strong></div>
                          )}
                          {descontosTotal > 0 && (
                            <div className="flex justify-between"><span className="text-muted-foreground">– Descontos</span><strong className="text-destructive tabular-nums">-{formatMoeda(descontosTotal)}</strong></div>
                          )}
                        </div>
                        <div className="bg-primary/10 rounded px-2.5 py-1.5 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground font-medium">Valor Líquido</span>
                          <span className="font-extrabold text-primary text-base tabular-nums">{formatMoeda(valorLiquido)}</span>
                        </div>
                        <div className="grid grid-cols-4 gap-x-2 gap-y-0.5 text-[10px]">
                          <Row label="Qtde" value={`${lancamento.quantidade} cab.`} />
                          {totalArrobasVal > 0 && <Row label="Total @" value={formatArroba(totalArrobasVal)} />}
                          {liqArrobaVal > 0 && <Row label="R$/@ líq." value={formatMoeda(liqArrobaVal)} />}
                          {liqCabecaVal > 0 && <Row label="R$/cab líq." value={formatMoeda(liqCabecaVal)} />}
                          {liqKgVal > 0 && <Row label="R$/kg líq." value={formatMoeda(liqKgVal)} />}
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : isVenda && (() => {
                const snap = lancamento.detalhesSnapshot as any;
                const vc = snap?._tipo === 'venda' ? snap : (snap?.type === 'venda_boitel' ? snap : (snap?.calculation || null));
                if (!vc || (!vc.valorBruto && !vc.tipoVenda)) return false;
                return true;
              })() ? (
                <>
                  <Separator className="my-0.5" />
                  {(() => {
                    const snap = lancamento.detalhesSnapshot as any;
                    const isBoitelSnap = snap?.type === 'venda_boitel';
                    const vc = snap?._tipo === 'venda' ? snap : snap;
                    return (
                      <>
                        {isBoitelSnap ? (
                          <div className="space-y-0.5 text-[10px]">
                            <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><strong>Boitel</strong></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Qtde</span><strong>{lancamento.quantidade} cab.</strong></div>
                            {vc.pesoKg > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Peso Inicial</span><strong>{formatKg(vc.pesoKg)}</strong></div>}
                          </div>
                        ) : (
                          <>
                            <div className="space-y-0.5 text-[10px]">
                              <div className="flex justify-between"><span className="text-muted-foreground">Valor Bruto</span><strong className="tabular-nums">{formatMoeda(vc.valorBruto || vc.valorBase)}</strong></div>
                              {(vc.totalDespesas > 0) && (
                                <div className="flex justify-between"><span className="text-muted-foreground">– Despesas</span><strong className="text-orange-600 dark:text-orange-400 tabular-nums">-{formatMoeda(vc.totalDespesas)}</strong></div>
                              )}
                              {(vc.totalDeducoes > 0 || vc.funruralTotal > 0) && (
                                <div className="flex justify-between"><span className="text-muted-foreground">– Deduções</span><strong className="text-destructive tabular-nums">-{formatMoeda(vc.totalDeducoes || vc.funruralTotal)}</strong></div>
                              )}
                            </div>
                            <div className="bg-primary/10 rounded px-2.5 py-1.5 flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground font-medium">Valor Líquido</span>
                              <span className="font-extrabold text-primary text-base tabular-nums">{formatMoeda(vc.valorLiquido)}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-x-2 gap-y-0.5 text-[10px]">
                              <Row label="Qtde" value={`${lancamento.quantidade} cab.`} />
                              {vc.totalArrobas > 0 && <Row label="Total @" value={formatArroba(vc.totalArrobas)} />}
                              {vc.liqArroba > 0 && <Row label="R$/@ líq." value={formatMoeda(vc.liqArroba)} />}
                              {vc.liqCabeca > 0 && <Row label="R$/cab líq." value={formatMoeda(vc.liqCabeca)} />}
                              {vc.liqKg > 0 && <Row label="R$/kg líq." value={formatMoeda(vc.liqKg)} />}
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </>
              ) : valorTotalCalc > 0 ? (
                <>
                  <Separator className="my-0.5" />
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                    {totalArrobas && totalArrobas > 0 && (
                      <Row label="Total Arrobas" value={formatArroba(totalArrobas)} />
                    )}
                    {ind.liqCabeca > 0 && (
                      <Row label="R$/Cabeça" value={formatMoeda(ind.liqCabeca)} />
                    )}
                    {totalArrobas && totalArrobas > 0 && ind.liqArroba > 0 && (
                      <Row label="R$/@ Líq." value={formatMoeda(ind.liqArroba)} />
                    )}
                  </div>
                  <div className="bg-primary/10 rounded px-2.5 py-1.5 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-medium">Valor Total</span>
                    <span className="font-extrabold text-primary text-base tabular-nums">{formatMoeda(valorTotalCalc)}</span>
                  </div>
                </>
              ) : null}

              {/* ── Transferência Saída: bloco econômico do snapshot ── */}
              {isTransferenciaSaida && (() => {
                const snap = lancamento.detalhesSnapshot as any;
                if (!snap || snap._tipo !== 'transferencia_saida') return null;
                const temPreco = snap.temPrecoReferencia;
                return (
                  <>
                    <Separator className="my-0.5" />
                    <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                      {snap.pesoTotalKg > 0 && <Row label="Peso Total" value={formatKg(snap.pesoTotalKg)} />}
                      {snap.totalArrobas > 0 && <Row label="Total @" value={formatArroba(snap.totalArrobas)} />}
                      {snap.arrobasCab > 0 && <Row label="@/cab" value={formatArroba(snap.arrobasCab)} />}
                    </div>
                    {temPreco && (
                      <>
                        <Separator className="my-0.5" />
                        <p className="text-[8px] text-muted-foreground font-semibold uppercase tracking-wider">Referência Econômica (gerencial)</p>
                        <div className="space-y-0.5 text-[10px]">
                          {snap.precoReferenciaArroba > 0 && (
                            <div className="flex justify-between"><span className="text-muted-foreground">R$/@ ref.</span><strong className="tabular-nums">{formatMoeda(snap.precoReferenciaArroba)}</strong></div>
                          )}
                          {snap.precoReferenciaCabeca > 0 && (
                            <div className="flex justify-between"><span className="text-muted-foreground">R$/cab ref.</span><strong className="tabular-nums">{formatMoeda(snap.precoReferenciaCabeca)}</strong></div>
                          )}
                          {snap.precoReferenciaKg > 0 && (
                            <div className="flex justify-between"><span className="text-muted-foreground">R$/kg ref.</span><strong className="tabular-nums">{formatMoeda(snap.precoReferenciaKg)}</strong></div>
                          )}
                        </div>
                        <div className="bg-primary/10 rounded px-2.5 py-1.5 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground font-medium">Valor Econômico do Lote</span>
                          <span className="font-extrabold text-primary text-base tabular-nums">{formatMoeda(snap.valorEconomicoLote)}</span>
                        </div>
                      </>
                    )}
                    {!temPreco && (
                      <div className="bg-muted/30 rounded px-2 py-1 text-[9px] text-muted-foreground">
                        Sem preço de referência informado.
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Abate share buttons */}
              {isAbate && <AbateShareButtons lancamento={lancamento} fazendaNome={nomeFazenda} />}

              {/* ── Histórico (compacto) ── */}
              <div className="bg-muted/30 rounded px-2 py-1 space-y-px">
                <p className="text-[8px] text-muted-foreground font-semibold uppercase tracking-wider">Histórico</p>
                <p className="text-[9px] text-muted-foreground leading-tight">
                  <span className="font-semibold">ID:</span> {lancamento.id.slice(0, 8)}
                  {lancamento.createdAt && (
                    <> · <span className="font-semibold">Criado:</span> {format(parseISO(lancamento.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}{lancamento.createdByNome && ` por ${lancamento.createdByNome}`}</>
                  )}
                </p>
                {lancamento.updatedAt && lancamento.updatedAt !== lancamento.createdAt && (
                  <p className="text-[9px] text-muted-foreground leading-tight">
                    <span className="font-semibold">Editado:</span> {format(parseISO(lancamento.updatedAt), "dd/MM/yy HH:mm", { locale: ptBR })}{lancamento.updatedByNome && ` por ${lancamento.updatedByNome}`}
                  </p>
                )}
              </div>

              {isTransferenciaEntrada && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                  <p className="text-[9px] text-amber-700 dark:text-amber-400 font-medium">
                    🔒 Transferência automática — só pode ser editada/removida na fazenda de origem.
                  </p>
                </div>
              )}

              {/* ── P1 governance banner ── */}
              {p1Oficial && (
                <div className="bg-destructive/10 border border-destructive/30 rounded px-2 py-1">
                  <p className="text-[9px] text-destructive font-medium">
                    🔒 Mês fechado (P1 oficial). Reabra o período para alterar campos estruturais ou excluir.
                  </p>
                </div>
              )}

              {/* META lock banner */}
              {metaLocked && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                  <p className="text-[9px] text-amber-700 dark:text-amber-400 font-medium">
                    🔒 Registro META — somente consultores podem editar ou excluir.
                  </p>
                </div>
              )}

              {/* ── Ações ── */}
              <div className="flex gap-2 pt-0.5">
                {!isTransferenciaEntrada && !metaLocked && (
                  <>
                    <Button variant="default" size="sm" className="flex-1 h-7 text-[10px] font-bold" onClick={handleEditClick}>
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button variant="destructive" size="sm" className="h-7 text-[10px]" onClick={handleRemoverClick} disabled={checkingVinculos || p1Oficial}>
                      <Trash2 className="h-3 w-3 mr-1" /> Apagar
                    </Button>
                  </>
                )}
              </div>

              {/* Resumo financeiro da compra (view-only) */}
              {isCompra && !isTransferenciaEntrada && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase text-muted-foreground tracking-wider">
                    <DollarSign className="h-3 w-3" /> Financeiro vinculado
                  </div>
                  {finLoading ? (
                    <p className="text-[9px] text-muted-foreground">Carregando...</p>
                  ) : finRecords.length === 0 ? (
                    <div className="bg-muted/30 rounded px-2 py-1 text-[9px] text-muted-foreground">
                      Nenhum lançamento financeiro gerado para esta compra.
                    </div>
                  ) : (() => {
                    const bovinos = finRecords.filter(r => !r.origem_tipo?.includes('frete') && !r.origem_tipo?.includes('comissao'));
                    const despesas = finRecords.filter(r => r.origem_tipo?.includes('frete') || r.origem_tipo?.includes('comissao'));
                    const totalBov = bovinos.reduce((s, r) => s + r.valor, 0);
                    const totalDesp = despesas.reduce((s, r) => s + r.valor, 0);
                    return (
                      <div className="bg-muted/20 rounded px-2 py-1 space-y-1">
                        {bovinos.length > 0 && (
                          <div className="space-y-px">
                            <p className="text-[8px] font-bold uppercase text-muted-foreground tracking-wider">Rebanho</p>
                            {bovinos.map(r => (
                              <div key={r.id} className="flex justify-between text-[9px] leading-tight">
                                <span className="text-muted-foreground truncate max-w-[60%]">💰 {r.descricao}</span>
                                <span className="font-semibold tabular-nums shrink-0">{formatMoeda(r.valor)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between text-[9px] font-bold pt-0.5 border-t border-border/30">
                              <span>Total Bovinos</span>
                              <span className="tabular-nums">{formatMoeda(totalBov)}</span>
                            </div>
                          </div>
                        )}
                        {despesas.length > 0 && (
                          <div className="space-y-px">
                            <p className="text-[8px] font-bold uppercase text-muted-foreground tracking-wider">Despesas Vinculadas</p>
                            {despesas.map(r => {
                              const icon = r.origem_tipo?.includes('frete') ? '🚚' : '📋';
                              return (
                                <div key={r.id} className="flex justify-between text-[9px] leading-tight">
                                  <span className="text-muted-foreground truncate max-w-[60%]">{icon} {r.descricao}</span>
                                  <span className="font-semibold tabular-nums shrink-0">{formatMoeda(r.valor)}</span>
                                </div>
                              );
                            })}
                            <div className="flex justify-between text-[9px] font-bold pt-0.5 border-t border-border/30">
                              <span>Total Despesas</span>
                              <span className="tabular-nums">{formatMoeda(totalDesp)}</span>
                            </div>
                          </div>
                        )}
                        <div className="flex justify-between text-[10px] font-bold pt-0.5 border-t border-border/50 text-primary">
                          <span>Total Geral Vinculado</span>
                          <span className="tabular-nums">{formatMoeda(totalBov + totalDesp)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Unified purchase edit sheet */}
        <Sheet open={compraEditSheetOpen} onOpenChange={(v) => {
          setCompraEditSheetOpen(v);
          if (!v) loadFinRecords();
        }}>
          <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader className="pb-1">
              <SheetTitle className="text-sm">Editar Compra</SheetTitle>
              <p className="text-[10px] text-muted-foreground/70 italic">
                Alterações irão recalcular o financeiro da compra
              </p>
            </SheetHeader>
            <div className="mt-2 space-y-2.5">
              {/* BLOCO 1 — Zootécnico */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted-foreground tracking-wide">
                  📋 Dados Zootécnicos
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] font-bold text-foreground">Data</Label>
                    <Input type="date" value={compraForm.data} onChange={e => setCompraForm(f => ({ ...f, data: e.target.value }))} className="mt-0.5 h-7 text-[11px]" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-foreground">Quantidade</Label>
                    <Input type="number" value={compraForm.quantidade} onChange={e => setCompraForm(f => ({ ...f, quantidade: Number(e.target.value) }))} className="mt-0.5 h-7 text-[11px]" min="1" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-foreground">Peso (kg)</Label>
                    <Input type="number" value={compraForm.pesoMedioKg || ''} onChange={e => setCompraForm(f => ({ ...f, pesoMedioKg: e.target.value ? Number(e.target.value) : undefined }))} className="mt-0.5 h-7 text-[11px]" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] font-bold text-foreground">Categoria</Label>
                    <Select value={compraForm.categoria} onValueChange={v => setCompraForm(f => ({ ...f, categoria: v as Categoria }))}>
                      <SelectTrigger className="mt-0.5 h-7 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-foreground">Origem</Label>
                    <Input value={compraForm.fazendaOrigem || ''} onChange={e => setCompraForm(f => ({ ...f, fazendaOrigem: e.target.value }))} className="mt-0.5 h-7 text-[11px]" placeholder="Faz. Boa Vista" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-foreground">Destino</Label>
                    <Input value={nomeFazenda} readOnly className="mt-0.5 h-7 text-[11px] bg-muted cursor-not-allowed" />
                  </div>
                </div>
                {/* Status */}
                <div>
                  <Label className="text-[10px] font-bold text-foreground">Status</Label>
                  <div className="flex gap-1 mt-0.5">
                    {STATUS_OPTIONS_ZOOTECNICO_COM_META.map(s => {
                      const disabled = s.value === 'meta' && !canEditMeta;
                      return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => {
                          if (disabled) return;
                          setCompraStatusMode(s.value as any);
                          setCompraForm(f => ({
                            ...f,
                            statusOperacional: s.value === 'meta' ? null : s.value,
                            cenario: s.value === 'meta' ? 'meta' : 'realizado',
                          }));
                        }}
                        disabled={disabled}
                        className={`flex-1 py-1 rounded text-[10px] font-bold border-2 transition-all ${
                          disabled ? 'opacity-40 cursor-not-allowed' : ''
                        } ${
                          compraStatusMode === s.value
                            ? `${s.bg} text-white border-transparent shadow-md`
                            : 'border-border text-muted-foreground bg-muted/30'
                        }`}
                      >
                        {s.label}
                      </button>
                      );
                    })}
                  </div>
                </div>
                {/* Warning: zootécnico changes impact financeiro */}
                {finRecords.length > 0 && (
                  compraForm.quantidade !== lancamento.quantidade ||
                  compraForm.pesoMedioKg !== lancamento.pesoMedioKg ||
                  compraForm.categoria !== lancamento.categoria
                ) && (
                  <div className="flex items-center gap-1 text-[10px] p-1.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>Alterações nos dados zootécnicos impactam o financeiro.</span>
                  </div>
                )}
                {/* Save zootécnico button */}
                {!compraZooSaved ? (
                  <Button
                    className="w-full h-7 text-[10px] font-bold"
                    size="sm"
                    onClick={handleSalvarCompraZoo}
                    disabled={compraSaving}
                  >
                    {compraSaving ? 'Salvando...' : '1. Salvar dados zootécnicos'}
                  </Button>
                ) : (
                  <div className="flex items-center gap-1 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded px-2 py-1 border border-green-200 dark:border-green-800">
                    ✅ Dados zootécnicos salvos
                  </div>
                )}
              </div>

              <Separator />

              {/* BLOCO 2 — Financeiro */}
              <div className="relative">
                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted-foreground tracking-wide mb-1.5">
                  <DollarSign className="h-3 w-3" /> 2. Recalcular Financeiro
                </div>
                {/* Warning about recalculation */}
                {finRecords.length > 0 && (
                  <div className="flex items-center gap-1 text-[10px] p-1.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 mb-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>Os {finRecords.length} lançamento(s) existente(s) serão cancelados e substituídos.</span>
                  </div>
                )}
                {!compraZooSaved && (
                  <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-[1px] rounded-md flex items-center justify-center p-4">
                    <div className="text-center space-y-1">
                      <AlertTriangle className="h-4 w-4 mx-auto text-muted-foreground" />
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Salve os dados zootécnicos primeiro
                      </p>
                    </div>
                  </div>
                )}
                <CompraFinanceiroPanel
                  quantidade={compraZooSaved ? Number(compraForm.quantidade) : lancamento.quantidade}
                  pesoKg={compraZooSaved ? (compraForm.pesoMedioKg || 0) : (lancamento.pesoMedioKg || 0)}
                  data={compraZooSaved ? compraForm.data : lancamento.data}
                  categoria={compraZooSaved ? compraForm.categoria : lancamento.categoria}
                  statusOp={(compraZooSaved ? (compraForm.statusOperacional || 'realizado') : (lancamento.statusOperacional || 'realizado')) as StatusOperacional}
                  fazendaOrigem={compraZooSaved ? (compraForm.fazendaOrigem || '') : (lancamento.fazendaOrigem || '')}
                  notaFiscal={notaFiscalEdit}
                  onNotaFiscalChange={setNotaFiscalEdit}
                  fornecedorId={detalheFornecedorId}
                  lancamentoId={lancamento.id}
                  mode="update"
                  onFinanceiroUpdated={() => {
                    setCompraEditSheetOpen(false);
                    loadFinRecords();
                  }}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Confirmation dialog for deletion */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                {financeiroCount > 0
                  ? `Esta movimentação possui ${financeiroCount} lançamento(s) financeiro(s) vinculado(s). Ao excluir, os lançamentos financeiros restantes também serão removidos.`
                  : 'Deseja realmente excluir esta movimentação?'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmRemover} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {financeiroCount > 0 ? 'Excluir tudo' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // ===================== SIMPLE EDIT MODE (non-purchase types) =====================
  const isTransSaida = form.tipo === 'transferencia_saida';
  const isNascimento = form.tipo === 'nascimento';
  const isSaidaAuto = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(form.tipo);
  const isEntradaAuto = ['nascimento', 'compra', 'transferencia_entrada'].includes(form.tipo);
  const showOrigem = !isNascimento;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* P1 governance notice */}
            {p1Oficial && (
              <div className="bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
                <p className="text-[9px] text-destructive font-medium">
                  🔒 Mês fechado (P1 oficial). Campos estruturais estão bloqueados. Apenas peso, preço e observação podem ser alterados.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-bold text-foreground">Data</Label>
                <Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className="mt-1" disabled={p1Oficial} />
              </div>
              <div>
                <Label className="font-bold text-foreground">Quantidade</Label>
                <Input type="number" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: Number(e.target.value) }))} className="mt-1" min="1" disabled={p1Oficial} />
              </div>
            </div>
            <div>
              <Label className="font-bold text-foreground">Categoria</Label>
              <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v as Categoria }))} disabled={p1Oficial}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.tipo === 'reclassificacao' && (
              <div>
                <Label className="font-bold text-foreground">Categoria Destino</Label>
                <Select value={form.categoriaDestino || ''} onValueChange={v => setForm(f => ({ ...f, categoriaDestino: v as Categoria }))} disabled={p1Oficial}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.filter(c => c.value !== form.categoria).map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-bold text-foreground">Peso (kg)</Label>
                <Input type="number" value={form.pesoMedioKg || ''} onChange={e => setForm(f => ({ ...f, pesoMedioKg: e.target.value ? Number(e.target.value) : undefined }))} className="mt-1" />
              </div>
              <div>
                <Label className="font-bold text-foreground">Preço/Cab (R$)</Label>
                <Input type="number" value={form.precoMedioCabeca || ''} onChange={e => setForm(f => ({ ...f, precoMedioCabeca: e.target.value ? Number(e.target.value) : undefined }))} className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {showOrigem && (
                <div>
                  <Label className="font-bold text-foreground">Faz. Origem</Label>
                  {isSaidaAuto ? (
                    <Input value={nomeFazenda} readOnly className="mt-1 bg-muted cursor-not-allowed" />
                  ) : (
                    <Input value={form.fazendaOrigem || ''} onChange={e => setForm(f => ({ ...f, fazendaOrigem: e.target.value }))} className="mt-1" disabled={p1Oficial} />
                  )}
                </div>
              )}
              <div>
                <Label className="font-bold text-foreground">
                  {form.tipo === 'morte' ? 'Motivo da Morte' : form.tipo === 'consumo' ? 'Motivo' : 'Faz. Destino'}
                </Label>
                {isEntradaAuto ? (
                  <Input value={nomeFazenda} readOnly className="mt-1 bg-muted cursor-not-allowed" />
                ) : isTransSaida && outrasFazendas.length > 0 ? (
                  <Select value={form.fazendaDestino || ''} onValueChange={v => setForm(f => ({ ...f, fazendaDestino: v }))} disabled={p1Oficial}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
                    <SelectContent>
                      {outrasFazendas.map(f => (
                        <SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.fazendaDestino || ''}
                    onChange={e => setForm(f => ({ ...f, fazendaDestino: e.target.value }))}
                    placeholder={form.tipo === 'morte' ? 'Ex: Raio, Picada de cobra' : form.tipo === 'consumo' ? 'Ex: Consumo interno' : 'Ex: Faz. Santa Cruz'}
                    className="mt-1"
                    disabled={p1Oficial}
                  />
                )}
              </div>
            </div>

            {/* Status Operacional */}
            <div>
              <Label className="font-bold text-foreground">Status</Label>
              <div className="flex gap-1 mt-1">
                {STATUS_OPTIONS_ZOOTECNICO_COM_META.map(s => {
                  const disabled = (s.value === 'meta' && !canEditMeta) || p1Oficial;
                  return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => {
                      if (disabled) return;
                      setFormStatusMode(s.value as any);
                      setForm(f => ({
                        ...f,
                        statusOperacional: s.value === 'meta' ? null : s.value,
                        cenario: s.value === 'meta' ? 'meta' : 'realizado',
                      }));
                    }}
                    disabled={disabled}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                      disabled ? 'opacity-50 cursor-not-allowed' : ''
                    } ${
                      formStatusMode === s.value
                        ? `${s.bg} text-white border-transparent shadow-md`
                        : 'border-border text-muted-foreground bg-muted/30'
                    }`}
                  >
                    {s.label}
                  </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 touch-target" onClick={() => setEditando(false)}>Cancelar</Button>
              <Button variant="destructive" className="touch-target" onClick={handleRemoverClick} disabled={checkingVinculos || p1Oficial}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button className="flex-1 touch-target" onClick={handleSalvar}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              {financeiroCount > 0
                ? `Esta movimentação possui ${financeiroCount} lançamento(s) financeiro(s) vinculado(s). Ao excluir, os lançamentos financeiros restantes também serão removidos.`
                : 'Deseja realmente excluir esta movimentação?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemover} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {financeiroCount > 0 ? 'Excluir tudo' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
