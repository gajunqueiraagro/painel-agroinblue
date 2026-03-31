import { useState, useEffect } from 'react';
import { type Pasto, type CategoriaRebanho } from '@/hooks/usePastos';
import { type FechamentoPasto, useFechamento } from '@/hooks/useFechamento';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle, Lock, Copy, Save, LockOpen } from 'lucide-react';
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

  // Monthly variable fields
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
    // Save monthly fields
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col max-w-lg p-0 gap-0">
        {/* ── STICKY TOP: identification + monthly fields + current summary ── */}
        <div className="sticky top-0 z-10 bg-background border-b px-3 pt-3 pb-2 space-y-1.5 shrink-0">
          {/* Row 1: Name + status + area */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-base leading-none">{pasto.nome}</span>
            {pasto.area_produtiva_ha && <span className="text-[11px] text-muted-foreground">{pasto.area_produtiva_ha} ha</span>}
            {isFechado && <Badge variant="default" className="h-5 text-[10px] px-1.5"><Lock className="h-2.5 w-2.5 mr-0.5" />Fechado</Badge>}
          </div>

          {/* Row 2: Lote + Qualidade + Tipo Uso — compact horizontal */}
          <div className="flex gap-1.5 items-end">
            <div className="flex-1 min-w-0">
              <Label className="text-[10px] text-muted-foreground leading-none">Lote</Label>
              <Input value={loteMes} onChange={e => setLoteMes(e.target.value)} disabled={isFechado} placeholder="Lote" className="h-7 text-xs px-2" />
            </div>
            <div className="w-16 shrink-0">
              <Label className="text-[10px] text-muted-foreground leading-none">Qual.</Label>
              <Input type="number" inputMode="numeric" min={1} max={10} value={qualidadeMes ?? ''} onChange={e => setQualidadeMes(e.target.value ? Number(e.target.value) : null)} disabled={isFechado} placeholder="1-10" className="h-7 text-xs px-2" />
            </div>
            <div className="w-28 shrink-0">
              <Label className="text-[10px] text-muted-foreground leading-none">Tipo Uso</Label>
              <Select value={tipoUsoMes} onValueChange={setTipoUsoMes} disabled={isFechado}>
                <SelectTrigger className="h-7 text-xs px-2"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {TIPOS_USO_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Obs — single line */}
          <div>
            <Label className="text-[10px] text-muted-foreground leading-none">Obs. mês</Label>
            <Input value={observacaoMes} onChange={e => setObservacaoMes(e.target.value)} disabled={isFechado} placeholder="Observações..." className="h-7 text-xs px-2" />
          </div>

          {/* Row 4: Current summary table */}
          {itensComQtd.length > 0 && (
            <div className="border rounded bg-muted/40 px-2 py-1">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Resumo atual</div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[11px]">
                <span className="text-muted-foreground font-medium">Cat</span>
                <span className="text-muted-foreground font-medium text-right">Qtde</span>
                <span className="text-muted-foreground font-medium text-right">Peso</span>
                {itensComQtd.map(i => (
                  <React.Fragment key={i.categoria_id}>
                    <span className="truncate">{i.cat?.nome}</span>
                    <span className="text-right font-semibold tabular-nums">{i.quantidade}</span>
                    <span className="text-right tabular-nums text-muted-foreground">{i.peso_medio_kg ? `${formatNum(i.peso_medio_kg, 0)}` : '—'}</span>
                  </React.Fragment>
                ))}
                <span className="font-bold border-t border-border pt-0.5">Total</span>
                <span className="text-right font-bold tabular-nums border-t border-border pt-0.5">{total}</span>
                <span className="text-right tabular-nums text-muted-foreground border-t border-border pt-0.5">{pesoMedioPonderado > 0 ? formatNum(pesoMedioPonderado, 0) : '—'}</span>
              </div>
            </div>
          )}

          {!isFechado && (
            <Button variant="outline" size="sm" onClick={handleCopiar} className="w-full h-6 text-[11px]">
              <Copy className="h-3 w-3 mr-1" />Copiar do mês anterior
            </Button>
          )}
        </div>

        {/* ── SCROLLABLE: category cards ── */}
        <div className="overflow-y-auto flex-1 px-3 py-2 space-y-1.5">
          {categorias.map((cat, idx) => (
            <div key={cat.id} className="rounded border px-2.5 py-1.5">
              <div className="font-medium text-xs mb-1">{cat.nome}</div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <Label className="text-[10px] text-muted-foreground leading-none">Qtde</Label>
                  <Input type="number" inputMode="numeric" min={0} value={itens[idx]?.quantidade || ''} onChange={e => updateItem(idx, 'quantidade', Number(e.target.value) || 0)} disabled={isFechado} className="h-8 text-sm font-bold px-2" placeholder="0" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground leading-none">Peso (kg)</Label>
                  <Input type="number" inputMode="decimal" value={itens[idx]?.peso_medio_kg ?? ''} onChange={e => updateItem(idx, 'peso_medio_kg', e.target.value ? Number(e.target.value) : null)} disabled={isFechado} className="h-8 text-sm px-2" placeholder="0" />
                </div>
              </div>
              {itens[idx]?.origem_dado === 'copiado_mes_anterior' && (
                <Badge variant="secondary" className="text-[9px] mt-0.5 h-4">Copiado</Badge>
              )}
            </div>
          ))}

          {/* Total bar */}
          <div className="rounded bg-muted px-3 py-1.5 text-center">
            <span className="text-xs text-muted-foreground">Total: </span>
            <span className="text-base font-bold">{total} cab</span>
          </div>
        </div>

        {/* ── STICKY BOTTOM: action buttons ── */}
        <div className="sticky bottom-0 bg-background border-t px-3 py-2 shrink-0">
          {!isFechado ? (
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1 h-9 text-sm">
                <Save className="h-3.5 w-3.5 mr-1" />{saving ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="default" className="h-9 text-sm" onClick={() => setConfirmOpen(true)}>
                <Lock className="h-3.5 w-3.5 mr-1" />Fechar
              </Button>
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
            </div>
          ) : (
            <Button variant="outline" onClick={handleReabrir} className="w-full h-9 text-sm">
              <LockOpen className="h-3.5 w-3.5 mr-1" />Reabrir Pasto
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
