import { useState, useEffect } from 'react';
import { type Pasto, type CategoriaRebanho } from '@/hooks/usePastos';
import { type FechamentoPasto, useFechamento } from '@/hooks/useFechamento';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, Lock, Copy, Save, LockOpen } from 'lucide-react';

const TIPOS_USO_OPTIONS = [
  { value: 'cria', label: 'Cria' },
  { value: 'recria', label: 'Recria' },
  { value: 'engorda', label: 'Engorda' },
  { value: 'reforma_pecuaria', label: 'Reforma Pecuária' },
  { value: 'agricultura', label: 'Agricultura' },
  { value: 'app', label: 'APP' },
  { value: 'reserva_legal', label: 'Reserva Legal' },
  { value: 'benfeitorias', label: 'Benfeitorias' },
];

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
  onCopiar: () => Promise<FechamentoItem[]>;
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
    const copied = await onCopiar();
    setItens(copied);
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

  const total = itens.reduce((s, i) => s + (i.quantidade || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {pasto.nome}
            {isFechado && <Badge variant="default"><Lock className="h-3 w-3 mr-1" />Fechado</Badge>}
          </DialogTitle>
          <div className="text-sm text-muted-foreground">
            {pasto.area_produtiva_ha && `${pasto.area_produtiva_ha} ha`}
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {/* Monthly variable fields */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do mês</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Lote</Label>
                <Input
                  value={loteMes}
                  onChange={e => setLoteMes(e.target.value)}
                  disabled={isFechado}
                  placeholder="Lote"
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-xs">Qualidade (1-10)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10}
                  value={qualidadeMes ?? ''}
                  onChange={e => setQualidadeMes(e.target.value ? Number(e.target.value) : null)}
                  disabled={isFechado}
                  placeholder="1-10"
                  className="h-10"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Tipo de Uso</Label>
              <Select value={tipoUsoMes} onValueChange={setTipoUsoMes} disabled={isFechado}>
                <SelectTrigger className="h-10"><SelectValue placeholder={TIPOS_USO_OPTIONS.find(t => t.value === pasto.tipo_uso)?.label || 'Selecione'} /></SelectTrigger>
                <SelectContent>
                  {TIPOS_USO_OPTIONS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Observação do mês</Label>
              <Textarea
                value={observacaoMes}
                onChange={e => setObservacaoMes(e.target.value)}
                disabled={isFechado}
                placeholder="Observações deste mês..."
                className="min-h-[60px] text-sm"
              />
            </div>
          </div>

          {!isFechado && (
            <Button variant="outline" size="sm" onClick={handleCopiar} className="w-full">
              <Copy className="h-4 w-4 mr-1" />Copiar do mês anterior
            </Button>
          )}

          {categorias.map((cat, idx) => (
            <div key={cat.id} className="rounded-lg border p-3">
              <div className="font-medium text-sm mb-2">{cat.nome}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Quantidade</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={itens[idx]?.quantidade || ''}
                    onChange={e => updateItem(idx, 'quantidade', Number(e.target.value) || 0)}
                    disabled={isFechado}
                    className="h-12 text-lg font-bold"
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs">Peso Médio (kg)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={itens[idx]?.peso_medio_kg ?? ''}
                    onChange={e => updateItem(idx, 'peso_medio_kg', e.target.value ? Number(e.target.value) : null)}
                    disabled={isFechado}
                    className="h-12"
                    placeholder="0"
                  />
                </div>
              </div>
              {itens[idx]?.origem_dado === 'copiado_mes_anterior' && (
                <Badge variant="secondary" className="text-xs mt-1">Copiado do mês anterior</Badge>
              )}
            </div>
          ))}

          <div className="rounded-lg bg-muted p-3 text-center">
            <span className="text-sm text-muted-foreground">Total: </span>
            <span className="text-xl font-bold">{total} cab</span>
          </div>

          {!isFechado ? (
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1 h-12">
                <Save className="h-4 w-4 mr-1" />{saving ? 'Salvando...' : 'Salvar'}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="default" className="h-12">
                    <Lock className="h-4 w-4 mr-1" />Fechar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Fechar pasto?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Após fechar, os dados não poderão ser alterados sem reabrir o pasto. Deseja continuar?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleFechar}>Confirmar Fechamento</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <Button variant="outline" onClick={handleReabrir} className="w-full h-12">
              <LockOpen className="h-4 w-4 mr-1" />Reabrir Pasto
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
