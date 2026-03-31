import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowRightLeft, History, ClipboardCheck } from 'lucide-react';
import type { PastoMapData } from '@/pages/MapaGeoPastosTab';
import type { CategoriaRebanho } from '@/hooks/usePastos';
import { formatNum } from '@/lib/calculos/formatters';
import { RegistrarCondicaoDialog } from './RegistrarCondicaoDialog';
import { HistoricoPastoDialog } from './HistoricoPastoDialog';
import { MovimentarLoteDialog } from './MovimentarLoteDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PastoMapData | null;
  anoMes: string;
  categorias: CategoriaRebanho[];
}

export function PastoDetailSheet({ open, onOpenChange, data, anoMes, categorias }: Props) {
  const [condicaoOpen, setCondicaoOpen] = useState(false);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [movimentarOpen, setMovimentarOpen] = useState(false);

  if (!data) return null;

  const { pasto, totalCabecas, pesoMedio, uaTotal, uaHa, lote, qualidade } = data;
  const lotacao_cab_ha = pasto.area_produtiva_ha ? totalCabecas / pasto.area_produtiva_ha : null;

  const condicaoLabel = data.ultimaCondicao === 'bom' ? 'Bom' : data.ultimaCondicao === 'regular' ? 'Regular' : data.ultimaCondicao === 'ruim' ? 'Ruim' : 'Não avaliado';
  const condicaoColor = data.ultimaCondicao === 'bom' ? 'bg-green-100 text-green-800' : data.ultimaCondicao === 'regular' ? 'bg-yellow-100 text-yellow-800' : data.ultimaCondicao === 'ruim' ? 'bg-red-100 text-red-800' : 'bg-muted text-muted-foreground';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {pasto.nome}
              <Badge className={condicaoColor}>{condicaoLabel}</Badge>
            </SheetTitle>
            <SheetDescription>Detalhes do pasto — {anoMes}</SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3">
              <InfoItem label="Área (ha)" value={pasto.area_produtiva_ha ? formatNum(pasto.area_produtiva_ha, 1) : '—'} />
              <InfoItem label="Lote Atual" value={lote || '—'} />
              <InfoItem label="Total Cabeças" value={String(totalCabecas)} highlight />
              <InfoItem label="Peso Médio (kg)" value={pesoMedio ? formatNum(pesoMedio, 0) : '—'} />
              <InfoItem label="Lotação (cab/ha)" value={lotacao_cab_ha ? formatNum(lotacao_cab_ha, 2) : '—'} />
              <InfoItem label="Lotação (UA/ha)" value={uaHa ? formatNum(uaHa, 2) : '—'} />
              <InfoItem label="Qualidade" value={qualidade ? String(qualidade) : '—'} />
              <InfoItem label="Tipo Uso" value={pasto.tipo_uso || '—'} />
            </div>

            <Separator />

            {/* Categories breakdown */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Categorias no Pasto</h4>
              {data.categorias.size > 0 ? (
                <div className="space-y-1">
                  {Array.from(data.categorias.entries()).map(([catId, val]) => (
                    <div key={catId} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{val.categoria_nome}</span>
                      <div className="flex gap-3">
                        <span className="font-semibold">{val.quantidade} cab</span>
                        {val.peso_medio_kg && (
                          <span className="text-muted-foreground">{formatNum(val.peso_medio_kg, 0)} kg</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma categoria registrada.</p>
              )}
            </div>

            {pasto.observacoes && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-1">Observações</h4>
                  <p className="text-sm text-muted-foreground">{pasto.observacoes}</p>
                </div>
              </>
            )}

            <Separator />

            {/* Action buttons */}
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => setMovimentarOpen(true)}>
                <ArrowRightLeft className="h-4 w-4 mr-2" />Movimentar Lote
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => setHistoricoOpen(true)}>
                <History className="h-4 w-4 mr-2" />Ver Histórico do Pasto
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => setCondicaoOpen(true)}>
                <ClipboardCheck className="h-4 w-4 mr-2" />Registrar Condição do Pasto
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <RegistrarCondicaoDialog
        open={condicaoOpen}
        onOpenChange={setCondicaoOpen}
        pasto={data.pasto}
      />
      <HistoricoPastoDialog
        open={historicoOpen}
        onOpenChange={setHistoricoOpen}
        pasto={data.pasto}
      />
      <MovimentarLoteDialog
        open={movimentarOpen}
        onOpenChange={setMovimentarOpen}
        pasto={data.pasto}
        anoMes={anoMes}
      />
    </>
  );
}

function InfoItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-sm ${highlight ? 'font-bold text-primary' : 'font-semibold'}`}>{value}</p>
    </div>
  );
}
