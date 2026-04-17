import React, { useState, useEffect, useCallback } from 'react';
import { type Pasto, type CategoriaRebanho } from '@/hooks/usePastos';
import { type FechamentoPasto, useFechamento } from '@/hooks/useFechamento';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Lock, Copy, Save, LockOpen } from 'lucide-react';
import { calcUA } from '@/lib/calculos/zootecnicos';
import { formatNum } from '@/lib/calculos/formatters';

const TIPOS_USO_OPTIONS = [
  { value: 'cria', label: 'Cria' },
  { value: 'recria', label: 'Recria' },
  { value: 'engorda', label: 'Engorda' },
  { value: 'vedado', label: 'Vedado' },
  { value: 'reforma_pecuaria', label: 'Reforma Pecuária' },
  { value: 'agricultura', label: 'Agricultura' },
  { value: 'app', label: 'APP' },
  { value: 'reserva_legal', label: 'Reserva Legal' },
  { value: 'benfeitorias', label: 'Benfeitorias' },
  { value: 'divergencia', label: '⚠️ Divergência do Campeiro' },
];

const TIPOS_USO_EXIGEM_REBANHO = ['cria', 'recria', 'engorda'];
const QUALIDADE_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

// ── Regra definitiva de separação MACHOS x FÊMEAS ──
const MACHOS_CODIGOS = ['mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros'];
const FEMEAS_CODIGOS = ['mamotes_f', 'desmama_f', 'novilhas', 'vacas'];

function isMacho(codigo: string): boolean {
  return MACHOS_CODIGOS.includes(codigo);
}

interface FechamentoItem {
  categoria_id: string;
  quantidade: number;
  peso_medio_kg: number | null;
  lote: string | null;
  observacoes: string | null;
  origem_dado: string;
}

// ── CategoriaCard extracted outside to prevent re-mount on parent re-render ──
interface CategoriaCardProps {
  c: CategoriaRebanho;
  idx: number;
  tabBase: number;
  quantidade: number;
  pesoMedioKg: number | null;
  origemDado: string;
  disabled: boolean;
  onUpdateQtd: (catId: string, val: number) => void;
  onUpdatePeso: (catId: string, val: number | null) => void;
}

const CategoriaCard = React.memo(function CategoriaCard({
  c, idx, tabBase, quantidade, pesoMedioKg, origemDado, disabled, onUpdateQtd, onUpdatePeso
}: CategoriaCardProps) {
  const [qtdLocal, setQtdLocal] = useState(() => quantidade > 0 ? String(quantidade) : '');
  const [pesoLocal, setPesoLocal] = useState(() =>
    pesoMedioKg != null && pesoMedioKg !== 0 ? pesoMedioKg.toFixed(2).replace('.', ',') : ''
  );
  const [qtdFocused, setQtdFocused] = useState(false);
  const [pesoFocused, setPesoFocused] = useState(false);

  // Sync from external changes (e.g. "Copiar anterior") only when not focused
  useEffect(() => {
    if (!qtdFocused) {
      setQtdLocal(quantidade > 0 ? String(quantidade) : '');
    }
  }, [quantidade, qtdFocused]);

  useEffect(() => {
    if (!pesoFocused) {
      setPesoLocal(pesoMedioKg != null && pesoMedioKg !== 0 ? pesoMedioKg.toFixed(2).replace('.', ',') : '');
    }
  }, [pesoMedioKg, pesoFocused]);

  return (
    <div className="flex flex-col items-center gap-1 min-w-0 w-full sm:w-auto" style={{ minWidth: 0 }}>
      <span className="text-[11px] font-semibold text-foreground whitespace-nowrap mb-0.5">{c.nome}</span>
      <div className="relative">
        <Input
          type="text" inputMode="numeric"
          tabIndex={tabBase + idx * 2}
          value={qtdLocal}
          onChange={e => setQtdLocal(e.target.value)}
          onFocus={() => setQtdFocused(true)}
          onBlur={() => {
            setQtdFocused(false);
            const parsed = parseInt(qtdLocal, 10);
            if (!isNaN(parsed) && parsed > 0) {
              onUpdateQtd(c.id, parsed);
              setQtdLocal(String(parsed));
            } else {
              onUpdateQtd(c.id, 0);
              setQtdLocal('');
            }
          }}
          disabled={disabled}
          className="h-8 text-xs font-bold px-1.5 text-center tabular-nums w-full sm:w-[58px]"
          placeholder="0"
        />
        {origemDado === 'copiado_mes_anterior' && (
          <Badge variant="secondary" className="absolute -top-1.5 -right-1.5 text-[6px] h-3 px-0.5 leading-none">Cop</Badge>
        )}
      </div>
      <Input
        type="text" inputMode="decimal"
        tabIndex={tabBase + idx * 2 + 1}
        value={pesoLocal}
        onChange={e => setPesoLocal(e.target.value)}
        onFocus={() => setPesoFocused(true)}
        onBlur={() => {
          setPesoFocused(false);
          const raw = pesoLocal.replace(',', '.');
          if (raw === '' || raw.trim() === '') {
            onUpdatePeso(c.id, null);
            setPesoLocal('');
          } else {
            const parsed = parseFloat(raw);
            if (!isNaN(parsed)) {
              const valorFinal = Math.round(parsed * 100) / 100;
              onUpdatePeso(c.id, valorFinal);
              setPesoLocal(valorFinal.toFixed(2).replace('.', ','));
            } else {
              onUpdatePeso(c.id, null);
              setPesoLocal('');
            }
          }
        }}
        disabled={disabled}
        className="h-8 text-xs px-1.5 text-center tabular-nums w-full sm:w-[58px]"
        placeholder="kg"
      />
    </div>
  );
});

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pasto: Pasto;
  fechamento: FechamentoPasto;
  categorias: CategoriaRebanho[];
  onSave: (items: FechamentoItem[]) => Promise<boolean>;
  onFechar: () => Promise<boolean>;
  onReabrir: () => Promise<boolean>;
  onCopiar: () => Promise<{ itens: FechamentoItem[]; dadosMes: { lote_mes: string | null; tipo_uso_mes: string | null; qualidade_mes: number | null; observacao_mes: string | null } }>;
}

export function FechamentoPastoDialog({
  open, onOpenChange, pasto, fechamento,
  categorias, onSave, onFechar, onReabrir, onCopiar
}: Props) {
  const [itens, setItens] = useState<FechamentoItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(fechamento.status);

  const [loteMes, setLoteMes] = useState(fechamento.lote_mes || '');
  const [tipoUsoMes, setTipoUsoMes] = useState(fechamento.tipo_uso_mes || '');
  const [qualidadeMes, setQualidadeMes] = useState<number | null>(fechamento.qualidade_mes);
  const [observacaoMes, setObservacaoMes] = useState(fechamento.observacao_mes || '');

  const isFechado = status === 'fechado';
  const { loadItens, atualizarCamposMensais } = useFechamento();

  useEffect(() => {
    setStatus(fechamento.status);
  }, [fechamento]);

  // Load items + meta when modal opens
  useEffect(() => {
    if (!open || !fechamento) return;
    const blank = categorias.map(c => ({ categoria_id: c.id, quantidade: 0, peso_medio_kg: null, lote: null, observacoes: null, origem_dado: 'manual' }));
    setItens(blank);

    loadItens(fechamento.id).then(existing => {
      if (existing.length > 0) {
        // Has saved data — load items + meta from DB record
        setItens(categorias.map(c => {
          const found = existing.find(e => e.categoria_id === c.id);
          return found
            ? { categoria_id: c.id, quantidade: found.quantidade, peso_medio_kg: found.peso_medio_kg, lote: found.lote, observacoes: found.observacoes, origem_dado: found.origem_dado }
            : { categoria_id: c.id, quantidade: 0, peso_medio_kg: null, lote: null, observacoes: null, origem_dado: 'manual' };
        }));
        setLoteMes(fechamento.lote_mes || '');
        setTipoUsoMes(fechamento.tipo_uso_mes || '');
        setQualidadeMes(fechamento.qualidade_mes);
        setObservacaoMes(fechamento.observacao_mes || '');
      } else {
        // No saved items — pasto não iniciado → everything blank
        setLoteMes('');
        setTipoUsoMes('');
        setQualidadeMes(null);
        setObservacaoMes('');
      }
    });
  }, [open, fechamento, categorias, loadItens]);

  const updateItem = useCallback((catId: string, field: string, value: any) => {
    setItens(prev => prev.map(item => item.categoria_id === catId
      ? { ...item, [field]: value, origem_dado: item.origem_dado === 'copiado_mes_anterior' ? 'ajustado' : item.origem_dado }
      : item
    ));
  }, []);

  const onUpdateQtd = useCallback((catId: string, val: number) => {
    setItens(prev => prev.map(item => item.categoria_id === catId
      ? { ...item, quantidade: val, origem_dado: item.origem_dado === 'copiado_mes_anterior' ? 'ajustado' : item.origem_dado }
      : item
    ));
  }, []);

  const onUpdatePeso = useCallback((catId: string, val: number | null) => {
    setItens(prev => prev.map(item => item.categoria_id === catId
      ? { ...item, peso_medio_kg: val, origem_dado: item.origem_dado === 'copiado_mes_anterior' ? 'ajustado' : item.origem_dado }
      : item
    ));
  }, []);

  const getItem = (catId: string) => itens.find(i => i.categoria_id === catId);

  // Snapshot of initial data for dirty-checking
  const [initialItens, setInitialItens] = useState<string>('');
  const [initialMeta, setInitialMeta] = useState<string>('');

  useEffect(() => {
    if (open) {
      // Set snapshot after items load (slight delay)
      const t = setTimeout(() => {
        setInitialItens(JSON.stringify(itens));
        setInitialMeta(JSON.stringify({ loteMes, tipoUsoMes, qualidadeMes, observacaoMes }));
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open, fechamento]);

  const isDirty = () => {
    return JSON.stringify(itens) !== initialItens ||
      JSON.stringify({ loteMes, tipoUsoMes, qualidadeMes, observacaoMes }) !== initialMeta;
  };

  const handleSave = async () => {
    setSaving(true);
    await atualizarCamposMensais(fechamento.id, {
      lote_mes: loteMes || null,
      tipo_uso_mes: tipoUsoMes || null,
      qualidade_mes: qualidadeMes,
      observacao_mes: observacaoMes || null,
    });
    await onSave(itens);
    await onFechar();
    setStatus('fechado');
    setSaving(false);
    onOpenChange(false);
  };

  const handleCopiar = async () => {
    const { itens: copied, dadosMes } = await onCopiar();
    setItens(copied);
    if (dadosMes.lote_mes) setLoteMes(dadosMes.lote_mes);
    if (dadosMes.tipo_uso_mes) setTipoUsoMes(dadosMes.tipo_uso_mes);
    if (dadosMes.qualidade_mes !== null) setQualidadeMes(dadosMes.qualidade_mes);
    if (dadosMes.observacao_mes) setObservacaoMes(dadosMes.observacao_mes);
  };

  const handleReabrir = async () => {
    const ok = await onReabrir();
    if (ok) setStatus('rascunho');
  };

  const [cancelAlertOpen, setCancelAlertOpen] = useState(false);

  const handleCancel = () => {
    if (isDirty()) {
      setCancelAlertOpen(true);
    } else {
      onOpenChange(false);
    }
  };

  // ── Cálculos ──
  const total = itens.reduce((s, i) => s + (i.quantidade || 0), 0);
  const pesoTotalEstoque = itens.reduce((s, i) => s + (i.quantidade || 0) * (i.peso_medio_kg || 0), 0);
  const pesoMedioPonderado = total > 0 ? pesoTotalEstoque / total : 0;
  const uaTotal = itens.reduce((s, i) => s + calcUA(i.quantidade, i.peso_medio_kg), 0);
  const uaHa = pasto.area_produtiva_ha && uaTotal > 0 ? uaTotal / pasto.area_produtiva_ha : null;

  // ── Separação por grupo ──
  const catsMachos = categorias.filter(c => isMacho(c.codigo));
  const catsFemeas = categorias.filter(c => !isMacho(c.codigo));

  const totalMachos = catsMachos.reduce((s, c) => s + (getItem(c.id)?.quantidade || 0), 0);
  const totalFemeas = catsFemeas.reduce((s, c) => s + (getItem(c.id)?.quantidade || 0), 0);

  const exigeRebanho = TIPOS_USO_EXIGEM_REBANHO.includes(tipoUsoMes);
  const isDivergencia = pasto.tipo_uso === 'divergencia' || tipoUsoMes === 'divergencia';
  const itensComQtd = itens.filter(i => i.quantidade > 0).map(item => ({ ...item, cat: categorias.find(c => c.id === item.categoria_id) }));

  const avisos: string[] = [];
  if (total === 0 && exigeRebanho) avisos.push('Nenhum animal informado');
  if (total === 0 && !exigeRebanho && !isDivergencia) avisos.push('Pasto sem rebanho (conforme tipo de uso selecionado)');
  if (itensComQtd.length > 0 && itensComQtd.some(i => !i.peso_medio_kg)) avisos.push('Peso médio não informado em alguma categoria');
  if (!qualidadeMes && !isDivergencia) avisos.push('Qualidade do pasto não preenchida');
  if (isDivergencia && !observacaoMes.trim()) avisos.push('Observação da divergência é obrigatória');

  const podeFechar = isDivergencia
    ? observacaoMes.trim().length > 0
    : exigeRebanho
    ? total > 0 && itensComQtd.some(i => i.peso_medio_kg)
    : true;
  const tipoUsoLabel = TIPOS_USO_OPTIONS.find(t => t.value === tipoUsoMes)?.label || tipoUsoMes;

  // CategoriaCard is defined outside the component to avoid re-mount on parent re-render

  // ── Render de um grupo (machos ou fêmeas) ──
  const renderGrupo = (label: string, cats: CategoriaRebanho[], colorAccent: string, tabBase: number) => (
    <div>
      <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${colorAccent}`}>{label}</div>
      <div className="flex items-start gap-2 sm:gap-4 pl-2 sm:pl-8">
        <div className="flex flex-col pt-[22px] gap-1 shrink-0 w-[34px] sm:w-[40px]">
          <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground h-8 flex items-center">Qtde</span>
          <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground h-8 flex items-center">Peso</span>
        </div>
        <div className="grid grid-cols-3 gap-x-2 gap-y-2 sm:flex sm:gap-4 sm:flex-wrap flex-1 min-w-0">
          {cats.map((c, idx) => {
            const item = getItem(c.id);
            return (
              <CategoriaCard
                key={c.id}
                c={c}
                idx={idx}
                tabBase={tabBase}
                quantidade={item?.quantidade || 0}
                pesoMedioKg={item?.peso_medio_kg ?? null}
                origemDado={item?.origem_dado || 'manual'}
                disabled={isFechado}
                onUpdateQtd={onUpdateQtd}
                onUpdatePeso={onUpdatePeso}
              />
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-h-[95vh] min-h-0 sm:min-h-[70vh] flex flex-col max-w-3xl p-0 gap-0 overflow-hidden">
        {/* ── HEADER ESCURO ── */}
        <div className="shrink-0 bg-[hsl(215,30%,18%)] text-white px-5 pt-4 pb-3 space-y-2">
          {/* Row 1: Name + status + copy */}
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-2xl leading-none tracking-tight">{pasto.nome}</span>
            {pasto.area_produtiva_ha && <span className="text-base font-medium text-white/70">{pasto.area_produtiva_ha} ha</span>}
            {isFechado && <Badge className="h-5 text-[10px] px-1.5 bg-white/15 text-white border-white/20"><Lock className="h-3 w-3 mr-0.5" />Fechado</Badge>}
            <div className="flex-1" />
            {!isFechado && (
              <Button variant="ghost" size="sm" onClick={handleCopiar} className="h-6 text-[10px] text-white/70 hover:text-white hover:bg-white/10 px-2 gap-1">
                <Copy className="h-3 w-3" />Copiar anterior
              </Button>
            )}
          </div>

          {/* Row 2: Lote + Qual + Tipo Uso + Obs */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 min-w-0 max-w-[200px]">
              <Label className="text-[10px] text-white/50 leading-none">Lote</Label>
              <Input value={loteMes} onChange={e => setLoteMes(e.target.value)} disabled={isFechado} placeholder="Lote..." className="h-7 text-xs px-2 bg-white/10 border-white/15 text-white placeholder:text-white/30" />
            </div>
            <div className="w-12 shrink-0">
              <Label className="text-[10px] text-white/50 leading-none">Qual.</Label>
              <Select value={qualidadeMes?.toString() || 'none'} onValueChange={v => setQualidadeMes(v === 'none' ? null : Number(v))} disabled={isFechado}>
                <SelectTrigger className="h-7 text-xs px-1.5 bg-white/10 border-white/15 text-white"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {QUALIDADE_OPTIONS.map(q => <SelectItem key={q} value={q.toString()}>{q}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[130px] shrink-0">
              <Label className="text-[10px] text-white/50 leading-none">Tipo Uso</Label>
              <Select value={tipoUsoMes} onValueChange={setTipoUsoMes} disabled={isFechado}>
                <SelectTrigger className="h-7 text-xs px-1.5 bg-white/10 border-white/15 text-white"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {TIPOS_USO_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <Label className="text-[10px] text-white/50 leading-none">
                {isDivergencia ? 'Obs. da divergência *' : 'Obs.'}
              </Label>
              <Input
                value={observacaoMes}
                onChange={e => setObservacaoMes(e.target.value)}
                disabled={isFechado}
                placeholder={isDivergencia ? 'Descreva a divergência (obrigatório)' : 'Observação...'}
                className={`h-7 text-xs px-2 bg-white/10 border-white/15 text-white placeholder:text-white/30 ${
                  isDivergencia && !observacaoMes.trim() ? 'ring-1 ring-amber-400' : ''
                }`}
              />
            </div>
          </div>

          {/* Row 3: Resumo */}
          <div className="flex items-center gap-3 rounded bg-white/8 px-3 py-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-white/50 font-medium">Machos:</span>
              <span className="font-bold tabular-nums">{totalMachos}</span>
            </div>
            <div className="h-3 w-px bg-white/15" />
            <div className="flex items-center gap-1">
              <span className="text-white/50 font-medium">Fêmeas:</span>
              <span className="font-bold tabular-nums">{totalFemeas}</span>
            </div>
            <div className="h-3 w-px bg-white/15" />
            <div className="flex items-center gap-1">
              <span className="text-white/50 font-medium">Total:</span>
              <span className="font-extrabold tabular-nums text-[12px]">{total} cab</span>
            </div>
            <div className="h-3 w-px bg-white/15" />
            <div className="flex items-center gap-1">
              <span className="text-white/50 font-medium">Peso médio:</span>
              <span className="font-bold tabular-nums">{pesoMedioPonderado > 0 ? `${formatNum(pesoMedioPonderado, 1)} kg` : '—'}</span>
            </div>
            {pesoTotalEstoque > 0 && (
              <>
                <div className="h-3 w-px bg-white/15" />
                <div className="flex items-center gap-1">
                  <span className="text-white/50 font-medium">Peso total:</span>
                  <span className="font-bold tabular-nums">{formatNum(pesoTotalEstoque, 0)} kg</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── GRADE PRINCIPAL ── */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-4 bg-background">
          {renderGrupo('MACHOS', catsMachos, 'text-blue-600 dark:text-blue-400', 100)}
          {renderGrupo('FÊMEAS', catsFemeas, 'text-pink-600 dark:text-pink-400', 200)}
        </div>

        {/* ── FOOTER ── */}
        <div className="shrink-0 border-t bg-muted/30 px-4 py-1.5 flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">Total:</span>
            <span className="font-extrabold text-foreground tabular-nums text-sm">{total} cab</span>
            {pesoMedioPonderado > 0 && (
              <>
                <span>·</span>
                <span className="font-semibold tabular-nums">{formatNum(pesoMedioPonderado, 1)} kg</span>
              </>
            )}
          </div>
          <div className="flex-1" />
          {!isFechado ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-[11px] px-4" onClick={handleCancel}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving} size="sm" className="h-7 text-[11px] px-4">
                <Save className="h-3 w-3 mr-1" />{saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={handleReabrir} size="sm" className="h-7 text-[11px] px-4">
              <LockOpen className="h-3 w-3 mr-1" />Reabrir
            </Button>
          )}
        </div>

        {/* ── Cancel with unsaved changes alert ── */}
        <AlertDialog open={cancelAlertOpen} onOpenChange={setCancelAlertOpen}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Fechar sem salvar?</AlertDialogTitle>
              <AlertDialogDescription>Existem alterações não salvas. Deseja fechar e perder as alterações?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={() => onOpenChange(false)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Fechar sem salvar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
