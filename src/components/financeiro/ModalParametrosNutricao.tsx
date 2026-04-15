/**
 * Modal para configurar parâmetros de nutrição META.
 * Salva em meta_parametros_nutricao via upsert (fazenda_id + ano).
 */
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fazendaId: string;
  clienteId: string;
  ano: number;
  onSaved?: () => void;
}

export function ModalParametrosNutricao({ open, onOpenChange, fazendaId, clienteId, ano, onSaved }: Props) {
  const [criaCusto, setCriaCusto] = useState(0);
  const [recriaCusto, setRecriaCusto] = useState(0);
  const [engordaDias, setEngordaDias] = useState(80);
  const [engordaConsumo, setEngordaConsumo] = useState(5);
  const [engordaCustoKg, setEngordaCustoKg] = useState(0);
  const [saving, setSaving] = useState(false);

  const custoTotalEngorda = engordaDias * engordaConsumo * engordaCustoKg;

  // Load existing
  useEffect(() => {
    if (!open || !fazendaId || !clienteId) return;
    (async () => {
      const { data, error } = await (supabase
        .from('meta_parametros_nutricao' as any)
        .select('*')
        .eq('fazenda_id', fazendaId)
        .eq('ano', ano)
        .maybeSingle() as any);
      if (error) { console.error(error); return; }
      if (data) {
        setCriaCusto(Number(data.cria_custo_cab_mes) || 0);
        setRecriaCusto(Number(data.recria_custo_cab_mes) || 0);
        setEngordaDias(Number(data.engorda_periodo_dias) || 80);
        setEngordaConsumo(Number(data.engorda_consumo_kg_ms) || 5);
        setEngordaCustoKg(Number(data.engorda_custo_kg_ms) || 0);
      } else {
        setCriaCusto(0);
        setRecriaCusto(0);
        setEngordaDias(80);
        setEngordaConsumo(5);
        setEngordaCustoKg(0);
      }
    })();
  }, [open, fazendaId, clienteId, ano]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        fazenda_id: fazendaId,
        cliente_id: clienteId,
        ano,
        cria_custo_cab_mes: criaCusto,
        recria_custo_cab_mes: recriaCusto,
        engorda_periodo_dias: engordaDias,
        engorda_consumo_kg_ms: engordaConsumo,
        engorda_custo_kg_ms: engordaCustoKg,
      };

      const { error } = await (supabase
        .from('meta_parametros_nutricao' as any)
        .upsert(payload, { onConflict: 'fazenda_id,ano' }) as any);

      if (error) throw error;
      toast.success('Parâmetros de nutrição salvos');
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const fmtCusto = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Parâmetros de Nutrição — {ano}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* CRIA */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-card-foreground">NUTRIÇÃO CRIA (Vacas)</p>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap w-36">Custo R$/cab/mês</Label>
              <Input
                type="number" step="0.01" min="0"
                className="h-8 text-xs w-28"
                value={criaCusto || ''}
                onChange={e => setCriaCusto(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <Separator />

          {/* RECRIA */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-card-foreground">NUTRIÇÃO RECRIA</p>
            <p className="text-[10px] text-muted-foreground">(Novilhas, Garrotes, Desmama M e F)</p>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap w-36">Custo R$/cab/mês</Label>
              <Input
                type="number" step="0.01" min="0"
                className="h-8 text-xs w-28"
                value={recriaCusto || ''}
                onChange={e => setRecriaCusto(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <Separator />

          {/* ENGORDA */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-card-foreground">NUTRIÇÃO ENGORDA</p>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap w-36">Período de engorda (dias)</Label>
              <Input
                type="number" step="1" min="1"
                className="h-8 text-xs w-28"
                value={engordaDias || ''}
                onChange={e => setEngordaDias(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap w-36">Consumo kg/MS por cab</Label>
              <Input
                type="number" step="0.01" min="0"
                className="h-8 text-xs w-28"
                value={engordaConsumo || ''}
                onChange={e => setEngordaConsumo(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap w-36">Custo do kg/MS (R$)</Label>
              <Input
                type="number" step="0.01" min="0"
                className="h-8 text-xs w-28"
                value={engordaCustoKg || ''}
                onChange={e => setEngordaCustoKg(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] text-muted-foreground w-36">= Custo total por cab:</span>
              <span className="text-xs font-semibold text-card-foreground">{fmtCusto(custoTotalEngorda)}</span>
            </div>
            <p className="text-[9px] text-muted-foreground italic">
              (calculado: {engordaDias} dias × {engordaConsumo} kg × {fmtCusto(engordaCustoKg)})
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
