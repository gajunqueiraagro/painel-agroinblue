import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import type { Pasto } from '@/hooks/usePastos';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pasto: Pasto;
}

interface HistoricoItem {
  id: string;
  ano_mes: string;
  lote_mes: string | null;
  qualidade_mes: number | null;
  tipo_uso_mes: string | null;
  status: string;
  total_cabecas: number;
}

export function HistoricoPastoDialog({ open, onOpenChange, pasto }: Props) {
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const { data: fechamentos } = await supabase
        .from('fechamento_pastos')
        .select('id, ano_mes, lote_mes, qualidade_mes, tipo_uso_mes, status')
        .eq('pasto_id', pasto.id)
        .order('ano_mes', { ascending: false })
        .limit(24);

      if (!fechamentos || fechamentos.length === 0) {
        setHistorico([]);
        setLoading(false);
        return;
      }

      // Load items for each fechamento to get total
      const items: HistoricoItem[] = [];
      for (const f of fechamentos) {
        const { data: itens } = await supabase
          .from('fechamento_pasto_itens')
          .select('quantidade')
          .eq('fechamento_id', f.id);
        const total = (itens || []).reduce((s, i) => s + i.quantidade, 0);
        items.push({ ...f, total_cabecas: total });
      }
      setHistorico(items);
      setLoading(false);
    };
    load();
  }, [open, pasto.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Histórico — {pasto.nome}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : historico.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum registro encontrado.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1.5 px-2">Mês</th>
                  <th className="text-center py-1.5 px-2">Cab.</th>
                  <th className="text-center py-1.5 px-2">Lote</th>
                  <th className="text-center py-1.5 px-2">Qual.</th>
                  <th className="text-center py-1.5 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {historico.map(h => (
                  <tr key={h.id} className="border-b hover:bg-muted/30">
                    <td className="py-1.5 px-2 font-medium">{h.ano_mes}</td>
                    <td className="py-1.5 px-2 text-center font-semibold">{h.total_cabecas}</td>
                    <td className="py-1.5 px-2 text-center text-muted-foreground">{h.lote_mes || '—'}</td>
                    <td className="py-1.5 px-2 text-center">{h.qualidade_mes || '—'}</td>
                    <td className="py-1.5 px-2 text-center">
                      <Badge variant={h.status === 'fechado' ? 'default' : 'secondary'} className="text-[10px]">
                        {h.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
