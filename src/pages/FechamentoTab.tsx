import { useState, useEffect, useCallback } from 'react';
import { usePastos, type Pasto } from '@/hooks/usePastos';
import { useFechamento, type FechamentoPasto } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, Circle } from 'lucide-react';
import { format } from 'date-fns';
import { getAnoMesOptions, formatAnoMes } from '@/lib/dateUtils';
import { FechamentoPastoDialog } from '@/components/FechamentoPastoDialog';

export function FechamentoTab() {
  const { isGlobal } = useFazenda();
  const { pastos, categorias } = usePastos();
  const { fechamentos, loading, loadFechamentos, criarFechamento, salvarItens, fecharPasto, reabrirPasto, copiarMesAnterior } = useFechamento();
  const [anoMes, setAnoMes] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedPasto, setSelectedPasto] = useState<Pasto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeFechamento, setActiveFechamento] = useState<FechamentoPasto | null>(null);

  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  const pastosAtivos = pastos.filter(p => p.ativo && p.entra_conciliacao);
  const getFechamento = useCallback((pastoId: string) => fechamentos.find(f => f.pasto_id === pastoId) || null, [fechamentos]);

  const preenchidos = pastosAtivos.filter(p => getFechamento(p.id)).length;
  const fechadosCount = pastosAtivos.filter(p => getFechamento(p.id)?.status === 'fechado').length;

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

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para o fechamento.</div>;

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center gap-3">
        <Select value={anoMes} onValueChange={setAnoMes}>
          <SelectTrigger className="w-40 h-12"><SelectValue /></SelectTrigger>
          <SelectContent>
            {getAnoMesOptions().map(am => (
              <SelectItem key={am} value={am}>{formatAnoMes(am)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-col text-sm">
          <Badge variant="secondary">{preenchidos}/{pastosAtivos.length} iniciados</Badge>
          <span className="text-xs text-muted-foreground mt-0.5">{fechadosCount} fechados</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : pastosAtivos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhum pasto ativo para conciliação.</p>
          <p className="text-xs mt-1">Cadastre pastos na aba "Pastos" e marque "Entra na conciliação".</p>
        </div>
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
    </div>
  );
}
