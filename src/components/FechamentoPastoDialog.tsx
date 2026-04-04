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

  const updateItem = (catId: string, field: string, value: any) => {
    setItens(prev => prev.map(item => item.categoria_id === catId
      ? { ...item, [field]: value, origem_dado: item.origem_dado === 'copiado_mes_anterior' ? 'ajustado' : item.origem_dado }
      : item
    ));
  };

  const getItem = (catId: string) => itens.find(i => i.categoria_id === catId);

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
  const itensComQtd = itens.filter(i => i.quantidade > 0).map(item => ({ ...item, cat: categorias.find(c => c.id === item.categoria_id) }));

  const avisos: string[] = [];
  if (total === 0 && exigeRebanho) avisos.push('Nenhum animal informado');
  if (total === 0 && !exigeRebanho) avisos.push('Pasto sem rebanho (conforme tipo de uso selecionado)');
  if (itensComQtd.length > 0 && itensComQtd.some(i => !i.peso_medio_kg)) avisos.push('Peso médio não informado em alguma categoria');
  if (!qualidadeMes) avisos.push('Qualidade do pasto não preenchida');

  const podeFechar = exigeRebanho
    ? total > 0 && itensComQtd.some(i => i.peso_medio_kg)
    : true;
  const tipoUsoLabel = TIPOS_USO_OPTIONS.find(t => t.value === tipoUsoMes)?.label || tipoUsoMes;

  // ── Render de um grupo (machos ou fêmeas) ──
  const renderGrupo = (label: string, cats: CategoriaRebanho[], colorAccent: string) => (
    <div>
      <div className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${colorAccent}`}>{label}</div>
      <div className="border rounded bg-background inline-block">
        <table className="text-[11px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-1 py-0.5 w-[38px]"></th>
              {cats.map(c => (
                <th key={c.id} className="text-center px-1 py-0.5 text-[9px] font-semibold text-foreground whitespace-nowrap" style={{ minWidth: '52px', maxWidth: '64px' }}>
                  {c.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="px-1 py-0.5 text-[10px] font-bold text-muted-foreground/80">Qtde</td>
              {cats.map(c => {
                const item = getItem(c.id);
                return (
                  <td key={c.id} className="px-0.5 py-0.5 text-center">
                    <div className="relative">
                      <Input
                        type="number" inputMode="numeric" min={0}
                        value={item?.quantidade || ''}
                        onChange={e => updateItem(c.id, 'quantidade', Number(e.target.value) || 0)}
                        disabled={isFechado}
                        className="h-6 text-[11px] font-bold px-0.5 text-center tabular-nums w-[48px]"
                        placeholder="0"
                      />
                      {item?.origem_dado === 'copiado_mes_anterior' && (
                        <Badge variant="secondary" className="absolute -top-1.5 -right-1.5 text-[6px] h-3 px-0.5 leading-none">Cop</Badge>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="px-1 py-0.5 text-[10px] font-bold text-muted-foreground/80">Peso</td>
              {cats.map(c => {
                const item = getItem(c.id);
                return (
                  <td key={c.id} className="px-0.5 py-0.5 text-center">
                    <Input
                      type="number" inputMode="decimal" step="0.1"
                      value={item?.peso_medio_kg ?? ''}
                      onChange={e => updateItem(c.id, 'peso_medio_kg', e.target.value ? Number(e.target.value) : null)}
                      onBlur={e => {
                        if (e.target.value) {
                          updateItem(c.id, 'peso_medio_kg', Math.round(Number(e.target.value) * 10) / 10);
                        }
                      }}
                      disabled={isFechado}
                      className="h-6 text-[11px] px-0.5 text-center tabular-nums w-[48px]"
                      placeholder="kg"
                    />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col max-w-3xl p-0 gap-0 overflow-hidden">
        {/* ── HEADER ESCURO ── */}
        <div className="shrink-0 bg-[hsl(215,30%,18%)] text-white px-4 pt-3 pb-2.5 space-y-1.5">
          {/* Row 1: Name + status + copy */}
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xl leading-none tracking-tight">{pasto.nome}</span>
            {pasto.area_produtiva_ha && <span className="text-sm font-medium text-white/70">{pasto.area_produtiva_ha} ha</span>}
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
              <Label className="text-[9px] text-white/50 leading-none">Lote</Label>
              <Input value={loteMes} onChange={e => setLoteMes(e.target.value)} disabled={isFechado} placeholder="Lote..." className="h-6 text-[11px] px-2 bg-white/10 border-white/15 text-white placeholder:text-white/30" />
            </div>
            <div className="w-12 shrink-0">
              <Label className="text-[9px] text-white/50 leading-none">Qual.</Label>
              <Select value={qualidadeMes?.toString() || 'none'} onValueChange={v => setQualidadeMes(v === 'none' ? null : Number(v))} disabled={isFechado}>
                <SelectTrigger className="h-6 text-[11px] px-1.5 bg-white/10 border-white/15 text-white"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {QUALIDADE_OPTIONS.map(q => <SelectItem key={q} value={q.toString()}>{q}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[130px] shrink-0">
              <Label className="text-[9px] text-white/50 leading-none">Tipo Uso</Label>
              <Select value={tipoUsoMes} onValueChange={setTipoUsoMes} disabled={isFechado}>
                <SelectTrigger className="h-6 text-[11px] px-1.5 bg-white/10 border-white/15 text-white"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {TIPOS_USO_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <Label className="text-[9px] text-white/50 leading-none">Obs.</Label>
              <Input value={observacaoMes} onChange={e => setObservacaoMes(e.target.value)} disabled={isFechado} placeholder="Observação..." className="h-6 text-[11px] px-2 bg-white/10 border-white/15 text-white placeholder:text-white/30" />
            </div>
          </div>

          {/* Row 3: Resumo */}
          <div className="flex items-center gap-3 rounded bg-white/8 px-3 py-1.5 text-[11px]">
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
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3 bg-background">
          {renderGrupo('MACHOS', catsMachos, 'text-blue-600 dark:text-blue-400')}
          {renderGrupo('FÊMEAS', catsFemeas, 'text-pink-600 dark:text-pink-400')}
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
              <Button onClick={handleSave} disabled={saving} size="sm" className="h-7 text-[11px] px-4">
                <Save className="h-3 w-3 mr-1" />{saving ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="default" size="sm" className="h-7 text-[11px] px-4" onClick={() => setConfirmOpen(true)}>
                <Lock className="h-3 w-3 mr-1" />Fechar
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={handleReabrir} size="sm" className="h-7 text-[11px] px-4">
              <LockOpen className="h-3 w-3 mr-1" />Reabrir
            </Button>
          )}
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
              <div className="flex justify-between"><span className="text-muted-foreground">Machos:</span><span className="font-bold">{totalMachos} cab</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fêmeas:</span><span className="font-bold">{totalFemeas} cab</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total de cabeças:</span><span className="font-bold">{total}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Peso médio:</span><span className="font-medium">{pesoMedioPonderado > 0 ? `${formatNum(pesoMedioPonderado, 1)} kg` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Peso total estimado:</span><span className="font-medium">{pesoTotalEstoque > 0 ? `${formatNum(pesoTotalEstoque, 0)} kg` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Lotação (UA/ha):</span><span className="font-medium">{uaHa ? formatNum(uaHa, 2) : '—'}</span></div>
            </div>
            {avisos.length > 0 && (
              <div className={`rounded-lg border p-3 text-sm space-y-1 ${exigeRebanho && (total === 0 || itensComQtd.some(i => !i.peso_medio_kg)) ? 'border-yellow-500/30 bg-yellow-500/10' : 'border-blue-500/30 bg-blue-500/10'}`}>
                <div className={`flex items-center gap-1 font-semibold text-xs uppercase tracking-wide mb-1 ${exigeRebanho && (total === 0 || itensComQtd.some(ii => !ii.peso_medio_kg)) ? 'text-yellow-700 dark:text-yellow-400' : 'text-blue-700 dark:text-blue-400'}`}>
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
