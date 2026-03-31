import React, { useState, useEffect } from 'react';
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
];

const TIPOS_USO_EXIGEM_REBANHO = ['cria', 'recria', 'engorda'];

const QUALIDADE_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

interface FechamentoItem {
  categoria_id: string;
  quantidade: number;
  peso_medio_kg: number | null;
  lote: string | null;
  observacoes: string | null;
  origem_dado: string;
}

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
    setLoteMes(fechamento.lote_mes || '');
    setTipoUsoMes(fechamento.tipo_uso_mes || '');
    setQualidadeMes(fechamento.qualidade_mes);
    setObservacaoMes(fechamento.observacao_mes || '');
  }, [fechamento]);

  useEffect(() => {
    if (!open) return;
    setItens(categorias.map(c => ({ categoria_id: c.id, quantidade: 0, peso_medio_kg: null, lote: null, observacoes: null, origem_dado: 'manual' })));
  }, [open, categorias]);

  useEffect(() => {
    if (!open || !fechamento) return;
    loadItens(fechamento.id).then(existing => {
      if (existing.length > 0) {
        setItens(categorias.map(c => {
          const found = existing.find(e => e.categoria_id === c.id);
          return found
            ? { categoria_id: c.id, quantidade: found.quantidade, peso_medio_kg: found.peso_medio_kg, lote: found.lote, observacoes: found.observacoes, origem_dado: found.origem_dado }
            : { categoria_id: c.id, quantidade: 0, peso_medio_kg: null, lote: null, observacoes: null, origem_dado: 'manual' };
        }));
      }
    });
  }, [open, fechamento, categorias, loadItens]);

  const updateItem = (idx: number, field: string, value: any) => {
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value, origem_dado: item.origem_dado === 'copiado_mes_anterior' ? 'ajustado' : item.origem_dado } : item));
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
    setSaving(false);
  };

  const handleCopiar = async () => {
    const { itens: copied, dadosMes } = await onCopiar();
    setItens(copied);
    if (dadosMes.lote_mes) setLoteMes(dadosMes.lote_mes);
    if (dadosMes.tipo_uso_mes) setTipoUsoMes(dadosMes.tipo_uso_mes);
    if (dadosMes.qualidade_mes !== null) setQualidadeMes(dadosMes.qualidade_mes);
    if (dadosMes.observacao_mes) setObservacaoMes(dadosMes.observacao_mes);
  };

  const handleFechar = async () => {
    await handleSave();
    const ok = await onFechar();
    if (ok) setStatus('fechado');
  };

  const handleReabrir = async () => {
    const ok = await onReabrir();
    if (ok) setStatus('rascunho');
  };

  const [confirmOpen, setConfirmOpen] = useState(false);

  const total = itens.reduce((s, i) => s + (i.quantidade || 0), 0);
  const itensComQtd = itens
    .map(item => ({ ...item, cat: categorias.find(c => c.id === item.categoria_id) }))
    .filter(i => i.quantidade > 0)
    .sort((a, b) => (a.cat?.ordem_exibicao ?? 99) - (b.cat?.ordem_exibicao ?? 99));

  const pesoTotalEstoque = itensComQtd.reduce((s, i) => s + i.quantidade * (i.peso_medio_kg || 0), 0);
  const pesoMedioPonderado = total > 0 ? pesoTotalEstoque / total : 0;
  const uaTotal = itens.reduce((s, i) => s + calcUA(i.quantidade, i.peso_medio_kg), 0);
  const uaHa = pasto.area_produtiva_ha && uaTotal > 0 ? uaTotal / pasto.area_produtiva_ha : null;

  const exigeRebanho = TIPOS_USO_EXIGEM_REBANHO.includes(tipoUsoMes);

  const avisos: string[] = [];
  if (total === 0 && exigeRebanho) avisos.push('Nenhum animal informado');
  if (total === 0 && !exigeRebanho) avisos.push('Pasto sem rebanho (conforme tipo de uso selecionado)');
  if (itensComQtd.length > 0 && itensComQtd.some(i => !i.peso_medio_kg)) avisos.push('Peso médio não informado em alguma categoria');
  if (!qualidadeMes) avisos.push('Qualidade do pasto não preenchida');

  const podeFechar = exigeRebanho
    ? total > 0 && itensComQtd.some(i => i.peso_medio_kg)
    : true;
  const tipoUsoLabel = TIPOS_USO_OPTIONS.find(t => t.value === tipoUsoMes)?.label || tipoUsoMes;

  // Separate categories into Machos / Fêmeas for summary
  const machosCodigos = ['BZ', 'GA', 'NV', 'TO', 'BO'];
  const summaryMachos = itensComQtd.filter(i => machosCodigos.includes(i.cat?.codigo || ''));
  const summaryFemeas = itensComQtd.filter(i => !machosCodigos.includes(i.cat?.codigo || ''));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col max-w-lg p-0 gap-0 overflow-hidden">
        {/* ── FIXED HEADER ── */}
        <div className="shrink-0 bg-background border-b px-3 pt-2 pb-1.5 space-y-1">
          {/* Row 1: Name + status + area + copy */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-base leading-none">{pasto.nome}</span>
            {pasto.area_produtiva_ha && <span className="text-[10px] text-muted-foreground">{pasto.area_produtiva_ha} ha</span>}
            {isFechado && <Badge variant="default" className="h-4 text-[9px] px-1"><Lock className="h-2.5 w-2.5 mr-0.5" />Fechado</Badge>}
            <div className="flex-1" />
            {!isFechado && (
              <Button variant="ghost" size="sm" onClick={handleCopiar} className="h-5 text-[9px] text-muted-foreground px-1.5 gap-0.5 mr-4">
                <Copy className="h-2.5 w-2.5" />Copiar anterior
              </Button>
            )}
          </div>

          {/* Row 2: Lote + Qual + Tipo Uso */}
          <div className="flex gap-1 items-end">
            <div className="w-20 shrink-0">
              <Label className="text-[9px] text-muted-foreground leading-none">Lote</Label>
              <Input value={loteMes} onChange={e => setLoteMes(e.target.value)} disabled={isFechado} placeholder="Lote..." className="h-6 text-[10px] px-1.5 placeholder:text-[9px] placeholder:italic placeholder:text-muted-foreground/60" />
            </div>
            <div className="w-12 shrink-0">
              <Label className="text-[9px] text-muted-foreground leading-none">Qual.</Label>
              <Select value={qualidadeMes?.toString() || ''} onValueChange={v => setQualidadeMes(v ? Number(v) : null)} disabled={isFechado}>
                <SelectTrigger className="h-6 text-[10px] px-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {QUALIDADE_OPTIONS.map(q => <SelectItem key={q} value={q.toString()}>{q}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[130px] shrink-0">
              <Label className="text-[9px] text-muted-foreground leading-none">Tipo Uso</Label>
              <Select value={tipoUsoMes} onValueChange={setTipoUsoMes} disabled={isFechado}>
                <SelectTrigger className="h-6 text-[10px] px-1.5 whitespace-nowrap"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {TIPOS_USO_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <Label className="text-[9px] text-muted-foreground leading-none">Obs. mês</Label>
              <Input value={observacaoMes} onChange={e => setObservacaoMes(e.target.value)} disabled={isFechado} placeholder="Observação..." className="h-6 text-[10px] px-1.5 placeholder:text-[9px] placeholder:italic placeholder:text-muted-foreground/60" />
            </div>
          </div>

          {/* Row 3: Current summary - Machos | Fêmeas | Total */}
          {itensComQtd.length > 0 && (
            <div className="border rounded bg-muted/40 px-2 py-0.5">
              <div className="flex gap-3 text-[9px]">
                {/* Machos */}
                <div className="flex-1 min-w-0">
                  <span className="text-muted-foreground font-semibold text-[8px] uppercase tracking-wider">Machos</span>
                  {summaryMachos.length > 0 ? summaryMachos.map(i => (
                    <div key={i.categoria_id} className="flex justify-between gap-1">
                      <span className="truncate">{i.cat?.nome}</span>
                      <span className="tabular-nums font-semibold shrink-0">{i.quantidade}</span>
                    </div>
                  )) : <div className="text-muted-foreground/50">—</div>}
                </div>
                {/* Fêmeas */}
                <div className="flex-1 min-w-0 border-l border-border pl-2">
                  <span className="text-muted-foreground font-semibold text-[8px] uppercase tracking-wider">Fêmeas</span>
                  {summaryFemeas.length > 0 ? summaryFemeas.map(i => (
                    <div key={i.categoria_id} className="flex justify-between gap-1">
                      <span className="truncate">{i.cat?.nome}</span>
                      <span className="tabular-nums font-semibold shrink-0">{i.quantidade}</span>
                    </div>
                  )) : <div className="text-muted-foreground/50">—</div>}
                </div>
                {/* Resumo */}
                <div className="shrink-0 border-l border-border pl-2 text-right">
                  <span className="text-muted-foreground font-semibold text-[8px] uppercase tracking-wider">Resumo</span>
                  <div className="font-bold tabular-nums">{total} cab</div>
                  <div className="text-muted-foreground tabular-nums">{pesoMedioPonderado > 0 ? `${formatNum(pesoMedioPonderado, 1)} kg` : '—'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Row 4: Action buttons */}
          {!isFechado ? (
            <div className="flex gap-1.5">
              <Button onClick={handleSave} disabled={saving} size="sm" className="flex-1 h-5 text-[10px] px-2">
                <Save className="h-2.5 w-2.5 mr-0.5" />{saving ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="default" size="sm" className="h-5 text-[10px] px-2" onClick={() => setConfirmOpen(true)}>
                <Lock className="h-2.5 w-2.5 mr-0.5" />Fechar
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={handleReabrir} size="sm" className="w-full h-5 text-[10px]">
              <LockOpen className="h-2.5 w-2.5 mr-0.5" />Reabrir Pasto
            </Button>
          )}
        </div>

        {/* ── SCROLLABLE: category rows ── */}
        <div className="overflow-y-auto flex-1 px-3 py-1">
          <div className="space-y-px">
            {categorias.map((cat, idx) => (
              <div key={cat.id} className="flex items-center gap-1 rounded border px-1.5 py-0.5">
                <span className="text-[10px] font-medium flex-1 min-w-0 truncate">{cat.nome}</span>
                {itens[idx]?.origem_dado === 'copiado_mes_anterior' && (
                  <Badge variant="secondary" className="text-[7px] h-3 px-0.5 shrink-0">Cop</Badge>
                )}
                <Input
                  type="number" inputMode="numeric" min={0}
                  value={itens[idx]?.quantidade || ''}
                  onChange={e => updateItem(idx, 'quantidade', Number(e.target.value) || 0)}
                  disabled={isFechado}
                  className="h-5 text-[10px] font-bold px-1 w-[72px] shrink-0 text-right placeholder:text-[9px] placeholder:italic placeholder:font-normal placeholder:text-muted-foreground/50"
                  placeholder="Qtde"
                />
                <Input
                  type="number" inputMode="decimal" step="0.01"
                  value={itens[idx]?.peso_medio_kg ?? ''}
                  onChange={e => updateItem(idx, 'peso_medio_kg', e.target.value ? Number(e.target.value) : null)}
                  onBlur={e => {
                    if (e.target.value) {
                      updateItem(idx, 'peso_medio_kg', Math.round(Number(e.target.value) * 100) / 100);
                    }
                  }}
                  disabled={isFechado}
                  className="h-5 text-[10px] px-1 w-[80px] shrink-0 text-right placeholder:text-[9px] placeholder:italic placeholder:font-normal placeholder:text-muted-foreground/50"
                  placeholder="Peso kg"
                />
              </div>
            ))}
          </div>

          {/* Total bar */}
          <div className="rounded bg-muted px-3 py-0.5 text-center mt-1">
            <span className="text-[9px] text-muted-foreground">Total: </span>
            <span className="text-xs font-bold">{total} cab</span>
          </div>
        </div>

        {/* ── Confirm close dialog ── */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="max-h-[85vh] overflow-y-auto max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar fechamento do pasto</AlertDialogTitle>
              <AlertDialogDescription>Revise os dados antes de confirmar</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="font-semibold text-xs uppercase text-muted-foreground tracking-wide mb-1">Informações do pasto</div>
              <div className="flex justify-between"><span className="text-muted-foreground">Lote:</span><span className="font-medium">{loteMes || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tipo de uso:</span><span className="font-medium">{tipoUsoLabel || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Qualidade:</span><span className="font-medium">{qualidadeMes ?? '—'}</span></div>
            </div>
            {itensComQtd.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="font-semibold text-xs uppercase text-muted-foreground tracking-wide mb-2">Composição do rebanho</div>
                <div className="space-y-1">
                  {itensComQtd.map(i => (
                    <div key={i.categoria_id} className="flex justify-between">
                      <span>{i.cat?.nome}</span>
                      <span className="font-medium tabular-nums">{i.quantidade} cab{i.peso_medio_kg ? ` / ${formatNum(i.peso_medio_kg, 1)} kg` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <div className="font-semibold text-xs uppercase text-muted-foreground tracking-wide mb-1">Totais do pasto</div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total de cabeças:</span><span className="font-bold">{total}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Peso médio:</span><span className="font-medium">{pesoMedioPonderado > 0 ? `${formatNum(pesoMedioPonderado, 1)} kg` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Peso total estimado:</span><span className="font-medium">{pesoTotalEstoque > 0 ? `${formatNum(pesoTotalEstoque, 0)} kg` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Lotação (UA/ha):</span><span className="font-medium">{uaHa ? formatNum(uaHa, 2) : '—'}</span></div>
            </div>
            {avisos.length > 0 && (
              <div className={`rounded-lg border p-3 text-sm space-y-1 ${exigeRebanho && (total === 0 || itensComQtd.some(i => !i.peso_medio_kg)) ? 'border-yellow-500/30 bg-yellow-500/10' : 'border-blue-500/30 bg-blue-500/10'}`}>
                <div className={`flex items-center gap-1 font-semibold text-xs uppercase tracking-wide mb-1 ${exigeRebanho && (total === 0 || itensComQtd.some(i => !i.peso_medio_kg)) ? 'text-yellow-700 dark:text-yellow-400' : 'text-blue-700 dark:text-blue-400'}`}>
                  <AlertTriangle className="h-3.5 w-3.5" />Avisos
                </div>
                {avisos.map((a, i) => (
                  <div key={i} className={exigeRebanho && (total === 0 || itensComQtd.some(ii => !ii.peso_medio_kg)) ? 'text-yellow-700 dark:text-yellow-400' : 'text-blue-700 dark:text-blue-400'}>• {a}</div>
                ))}
              </div>
            )}
            {!podeFechar && (
              <div className="text-sm text-destructive font-medium text-center">Não é possível fechar: informe ao menos 1 categoria com quantidade e peso.</div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar para edição</AlertDialogCancel>
              <AlertDialogAction onClick={handleFechar} disabled={!podeFechar} className="bg-green-600 hover:bg-green-700 text-white">Confirmar fechamento</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
