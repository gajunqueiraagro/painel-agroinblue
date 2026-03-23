import { useState, useEffect, useCallback } from 'react';
import { usePastos, type Pasto, type CategoriaRebanho } from '@/hooks/usePastos';
import { useFechamento, type FechamentoPasto } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CheckCircle, Circle, Lock, Copy, Save, LockOpen } from 'lucide-react';
import { format, subMonths } from 'date-fns';

function getAnoMesOptions() {
  const opts: string[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = subMonths(now, i);
    opts.push(format(d, 'yyyy-MM'));
  }
  return opts;
}

function FechamentoPastoDialog({
  open, onOpenChange, pasto, fechamento, categorias,
  onSave, onFechar, onReabrir, onCopiar
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  pasto: Pasto; fechamento: FechamentoPasto | null;
  categorias: CategoriaRebanho[];
  onSave: (items: any[]) => Promise<boolean>;
  onFechar: () => Promise<boolean>;
  onReabrir: () => Promise<boolean>;
  onCopiar: () => Promise<any[]>;
}) {
  const [itens, setItens] = useState<{ categoria_id: string; quantidade: number; peso_medio_kg: number | null; lote: string | null; observacoes: string | null; origem_dado: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const isFechado = fechamento?.status === 'fechado';

  useEffect(() => {
    if (!open) return;
    // Initialize empty items for all categories
    setItens(categorias.map(c => ({ categoria_id: c.id, quantidade: 0, peso_medio_kg: null, lote: pasto.lote_padrao || null, observacoes: null, origem_dado: 'manual' })));
  }, [open, categorias, pasto]);

  // Load existing items when fechamento exists
  const { loadItens } = useFechamento();
  useEffect(() => {
    if (!open || !fechamento) return;
    loadItens(fechamento.id).then(existing => {
      if (existing.length > 0) {
        setItens(categorias.map(c => {
          const found = existing.find(e => e.categoria_id === c.id);
          return found
            ? { categoria_id: c.id, quantidade: found.quantidade, peso_medio_kg: found.peso_medio_kg, lote: found.lote, observacoes: found.observacoes, origem_dado: found.origem_dado }
            : { categoria_id: c.id, quantidade: 0, peso_medio_kg: null, lote: pasto.lote_padrao || null, observacoes: null, origem_dado: 'manual' };
        }));
      }
    });
  }, [open, fechamento, categorias, loadItens, pasto]);

  const updateItem = (idx: number, field: string, value: any) => {
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value, origem_dado: item.origem_dado === 'copiado_mes_anterior' ? 'ajustado' : item.origem_dado } : item));
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(itens);
    setSaving(false);
  };

  const handleCopiar = async () => {
    const copied = await onCopiar();
    setItens(copied);
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
            {pasto.area_produtiva_ha && `${pasto.area_produtiva_ha} ha • `}
            {pasto.lote_padrao && `Lote ${pasto.lote_padrao}`}
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {!isFechado && (
            <Button variant="outline" size="sm" onClick={handleCopiar} className="w-full">
              <Copy className="h-4 w-4 mr-1" />Copiar mês anterior
            </Button>
          )}

          {categorias.map((cat, idx) => (
            <div key={cat.id} className="rounded-lg border p-3">
              <div className="font-medium text-sm mb-2">{cat.nome}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Qtde</Label>
                  <Input
                    type="number"
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
                <Save className="h-4 w-4 mr-1" />{saving ? 'Salvando...' : 'Salvar Rascunho'}
              </Button>
              <Button variant="default" onClick={async () => { await handleSave(); await onFechar(); onOpenChange(false); }} className="h-12">
                <Lock className="h-4 w-4 mr-1" />Fechar
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={async () => { await onReabrir(); }} className="w-full h-12">
              <LockOpen className="h-4 w-4 mr-1" />Reabrir Pasto
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FechamentoTab() {
  const { isGlobal } = useFazenda();
  const { pastos, categorias } = usePastos();
  const { fechamentos, loading, loadFechamentos, criarFechamento, salvarItens, fecharPasto, reabrirPasto, copiarMesAnterior } = useFechamento();
  const [anoMes, setAnoMes] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedPasto, setSelectedPasto] = useState<Pasto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  const pastosAtivos = pastos.filter(p => p.ativo && p.entra_conciliacao);
  const getFechamento = useCallback((pastoId: string) => fechamentos.find(f => f.pasto_id === pastoId) || null, [fechamentos]);

  const preenchidos = pastosAtivos.filter(p => getFechamento(p.id)).length;

  const handleOpenPasto = async (pasto: Pasto) => {
    let fech = getFechamento(pasto.id);
    if (!fech) {
      fech = await criarFechamento(pasto.id, anoMes);
    }
    setSelectedPasto(pasto);
    setDialogOpen(true);
  };

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para o fechamento.</div>;

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center gap-3">
        <Select value={anoMes} onValueChange={setAnoMes}>
          <SelectTrigger className="w-40 h-12"><SelectValue /></SelectTrigger>
          <SelectContent>
            {getAnoMesOptions().map(am => (
              <SelectItem key={am} value={am}>{am.split('-').reverse().join('/')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary">{preenchidos} de {pastosAtivos.length} pastos</Badge>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : pastosAtivos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nenhum pasto ativo para conciliação.</div>
      ) : (
        <div className="space-y-2">
          {pastosAtivos.map(p => {
            const fech = getFechamento(p.id);
            const status = fech?.status;
            return (
              <button
                key={p.id}
                onClick={() => handleOpenPasto(p)}
                className="w-full rounded-lg border p-4 text-left hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{p.nome}</div>
                    <div className="text-sm text-muted-foreground">
                      {p.area_produtiva_ha && `${p.area_produtiva_ha} ha`}
                      {p.lote_padrao && ` • Lote ${p.lote_padrao}`}
                    </div>
                  </div>
                  <div>
                    {status === 'fechado' ? (
                      <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Fechado</Badge>
                    ) : status === 'rascunho' ? (
                      <Badge variant="secondary"><Circle className="h-3 w-3 mr-1" />Rascunho</Badge>
                    ) : (
                      <Badge variant="outline"><Circle className="h-3 w-3 mr-1" />Não iniciado</Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedPasto && (
        <FechamentoPastoDialog
          open={dialogOpen}
          onOpenChange={(o) => { setDialogOpen(o); if (!o) { setSelectedPasto(null); loadFechamentos(anoMes); } }}
          pasto={selectedPasto}
          fechamento={getFechamento(selectedPasto.id)}
          categorias={categorias}
          onSave={async (items) => {
            const fech = getFechamento(selectedPasto.id);
            if (!fech) return false;
            return salvarItens(fech.id, items);
          }}
          onFechar={async () => {
            const fech = getFechamento(selectedPasto.id);
            if (!fech) return false;
            return fecharPasto(fech.id);
          }}
          onReabrir={async () => {
            const fech = getFechamento(selectedPasto.id);
            if (!fech) return false;
            const ok = await reabrirPasto(fech.id);
            if (ok) loadFechamentos(anoMes);
            return ok;
          }}
          onCopiar={async () => copiarMesAnterior(selectedPasto.id, anoMes, categorias)}
        />
      )}
    </div>
  );
}
