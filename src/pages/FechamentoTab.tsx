import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePastos, type Pasto } from '@/hooks/usePastos';
import { useFechamento, type FechamentoPasto, type FechamentoItem } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, Circle } from 'lucide-react';
import { format } from 'date-fns';
import { getAnoMesOptions, formatAnoMes } from '@/lib/dateUtils';
import { FechamentoPastoDialog } from '@/components/FechamentoPastoDialog';

function calcUA(quantidade: number, pesoMedioKg: number | null): number {
  if (!pesoMedioKg || pesoMedioKg <= 0) return quantidade;
  return (quantidade * pesoMedioKg) / 450;
}

function fmtNum(val: number | null | undefined, dec = 0): string {
  if (val === null || val === undefined) return '—';
  return val.toFixed(dec).replace('.', ',');
}

interface PastoResumo {
  totalCabecas: number;
  pesoMedio: number | null;
  uaHa: number | null;
}

export function FechamentoTab() {
  const { isGlobal } = useFazenda();
  const { pastos, categorias } = usePastos();
  const { fechamentos, loading, loadFechamentos, criarFechamento, loadItens, salvarItens, fecharPasto, reabrirPasto, copiarMesAnterior } = useFechamento();
  const [anoMes, setAnoMes] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedPasto, setSelectedPasto] = useState<Pasto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeFechamento, setActiveFechamento] = useState<FechamentoPasto | null>(null);
  const [itensMap, setItensMap] = useState<Map<string, FechamentoItem[]>>(new Map());

  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  // Load items for all fechamentos to show summary on cards
  useEffect(() => {
    const loadAll = async () => {
      const map = new Map<string, FechamentoItem[]>();
      await Promise.all(fechamentos.map(async (f) => {
        const items = await loadItens(f.id);
        map.set(f.id, items);
      }));
      setItensMap(map);
    };
    if (fechamentos.length > 0) loadAll();
    else setItensMap(new Map());
  }, [fechamentos, loadItens]);

  const pastosAtivos = pastos.filter(p => p.ativo && p.entra_conciliacao);
  const getFechamento = useCallback((pastoId: string) => fechamentos.find(f => f.pasto_id === pastoId) || null, [fechamentos]);

  const getResumo = useCallback((fech: FechamentoPasto | null, pasto: Pasto): PastoResumo => {
    if (!fech) return { totalCabecas: 0, pesoMedio: null, uaHa: null };
    const items = itensMap.get(fech.id) || [];
    const totalCab = items.reduce((s, i) => s + i.quantidade, 0);
    const comPeso = items.filter(i => i.quantidade > 0 && i.peso_medio_kg);
    const pesoMedio = comPeso.length > 0
      ? comPeso.reduce((s, i) => s + (i.peso_medio_kg || 0) * i.quantidade, 0) / comPeso.reduce((s, i) => s + i.quantidade, 0)
      : null;
    let uaTotal = 0;
    items.forEach(i => { uaTotal += calcUA(i.quantidade, i.peso_medio_kg); });
    const uaHa = pasto.area_produtiva_ha && uaTotal > 0 ? uaTotal / pasto.area_produtiva_ha : null;
    return { totalCabecas: totalCab, pesoMedio, uaHa };
  }, [itensMap]);

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
            const resumo = getResumo(fech, p);
            return (
              <button
                key={p.id}
                onClick={() => handleOpenPasto(p)}
                className="w-full rounded-lg border p-4 text-left hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-base">{p.nome}</span>
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

                <div className="text-sm text-muted-foreground">
                  {p.area_produtiva_ha ? `${fmtNum(p.area_produtiva_ha, 1)} ha` : '—'}
                  {fech?.lote_mes && ` · Lote: ${fech.lote_mes}`}
                </div>

                {fech && resumo.totalCabecas > 0 && (
                  <div className="text-sm mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="font-medium text-foreground">{resumo.totalCabecas} cabeças</span>
                    {fech.qualidade_mes && (
                      <span>Qualidade: <span className="font-medium text-foreground">{fech.qualidade_mes}</span></span>
                    )}
                    {resumo.uaHa && (
                      <span>UA/ha: <span className="font-medium text-foreground">{fmtNum(resumo.uaHa, 2)}</span></span>
                    )}
                  </div>
                )}
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
