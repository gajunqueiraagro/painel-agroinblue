import { useMemo } from 'react';
import { ArrowLeft, Sprout, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatNum } from '@/lib/calculos/formatters';
import { calcUA } from '@/lib/calculos/zootecnicos';
import { TIPOS_USO, isPastoAtivoNoMes, type Pasto } from '@/hooks/usePastos';
import type { FechamentoPasto, FechamentoItem } from '@/hooks/useFechamento';
import type { CategoriaRebanho } from '@/hooks/usePastos';

const TIPO_USO_STYLES: Record<string, { border: string; text: string; bg: string; icon?: 'plant' }> = {
  'cria':             { border: 'border-l-orange-500', text: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-500/10' },
  'recria':           { border: 'border-l-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  'engorda':          { border: 'border-l-blue-500', text: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-500/10' },
  'vedado':           { border: 'border-l-green-800', text: 'text-green-800 dark:text-green-400', bg: 'bg-green-800/10' },
  'reforma pecuaria': { border: 'border-l-gray-600', text: 'text-gray-700 dark:text-gray-300', bg: 'bg-gray-600/10' },
  'agricultura':      { border: 'border-l-lime-600', text: 'text-lime-700 dark:text-lime-400', bg: 'bg-lime-600/10', icon: 'plant' },
  'app':              { border: 'border-l-gray-900 dark:border-l-gray-100', text: 'text-gray-900 dark:text-gray-100', bg: 'bg-gray-900/10 dark:bg-gray-100/10' },
  'reserva legal':    { border: 'border-l-gray-900 dark:border-l-gray-100', text: 'text-gray-900 dark:text-gray-100', bg: 'bg-gray-900/10 dark:bg-gray-100/10' },
  'benfeitorias':     { border: 'border-l-gray-900 dark:border-l-gray-100', text: 'text-gray-900 dark:text-gray-100', bg: 'bg-gray-900/10 dark:bg-gray-100/10' },
};

const normalizeTipoUso = (t?: string) => {
  if (!t) return '';
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
};

interface AtividadeResumo {
  tipoUso: string;
  tipoUsoLabel: string;
  qtdPastos: number;
  cabecasTotal: number;
  pesoTotal: number;
  pesoMedio: number | null;
  areaTotal: number;
  uaTotal: number;
  uaHa: number | null;
  kgHa: number | null;
  cabHa: number | null;
  arrobasTotal: number | null;
  pastoNomes: string[];
}

interface Props {
  pastos: Pasto[];
  fechamentos: FechamentoPasto[];
  itensMap: Map<string, FechamentoItem[]>;
  categorias: CategoriaRebanho[];
  anoMes: string;
  onBack: () => void;
  onVerPastos?: (tipoUso: string) => void;
}

export function ResumoAtividadesView({ pastos, fechamentos, itensMap, categorias, anoMes, onBack, onVerPastos }: Props) {
  const resumos = useMemo(() => {
    const pastosAtivos = pastos.filter(p => p.ativo && p.entra_conciliacao && isPastoAtivoNoMes(p, anoMes));
    const fechMap = new Map(fechamentos.map(f => [f.pasto_id, f]));

    // Group by tipo_uso
    const groups = new Map<string, Pasto[]>();
    pastosAtivos.forEach(p => {
      const key = normalizeTipoUso(p.tipo_uso) || 'sem tipo';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    });

    const result: AtividadeResumo[] = [];

    groups.forEach((pastosGrupo, key) => {
      let cabecasTotal = 0;
      let pesoTotal = 0;
      let areaTotal = 0;
      let uaTotal = 0;
      const pastoNomes: string[] = [];

      pastosGrupo.forEach(pasto => {
        pastoNomes.push(pasto.nome);
        areaTotal += pasto.area_produtiva_ha || 0;

        const fech = fechMap.get(pasto.id);
        if (!fech) return;

        const items = itensMap.get(fech.id) || [];
        items.forEach(item => {
          cabecasTotal += item.quantidade;
          if (item.peso_medio_kg && item.quantidade > 0) {
            pesoTotal += item.peso_medio_kg * item.quantidade;
          }
          uaTotal += calcUA(item.quantidade, item.peso_medio_kg);
        });
      });

      const pesoMedio = cabecasTotal > 0 ? pesoTotal / cabecasTotal : null;
      const uaHa = areaTotal > 0 && uaTotal > 0 ? uaTotal / areaTotal : null;
      const kgHa = areaTotal > 0 && pesoTotal > 0 ? pesoTotal / areaTotal : null;
      const cabHa = areaTotal > 0 && cabecasTotal > 0 ? cabecasTotal / areaTotal : null;
      const arrobasTotal = pesoTotal > 0 ? pesoTotal / 15 : null;

      const tipoUsoLabel = TIPOS_USO.find(t => normalizeTipoUso(t.label) === key)?.label || key;

      result.push({
        tipoUso: key,
        tipoUsoLabel,
        qtdPastos: pastosGrupo.length,
        cabecasTotal,
        pesoTotal,
        pesoMedio,
        areaTotal,
        uaTotal,
        uaHa,
        kgHa,
        cabHa,
        arrobasTotal,
        pastoNomes,
      });
    });

    // Sort by cabecasTotal desc
    result.sort((a, b) => b.cabecasTotal - a.cabecasTotal);
    return result;
  }, [pastos, fechamentos, itensMap, categorias]);

  const totalGeral = resumos.reduce((s, r) => s + r.cabecasTotal, 0);
  const areaGeral = resumos.reduce((s, r) => s + r.areaTotal, 0);

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-sm font-bold text-foreground">Resumo por Atividade</h2>
              <p className="text-[10px] text-muted-foreground">{anoMes}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5">
              {totalGeral} cab
            </Badge>
            {areaGeral > 0 && (
              <span className="text-[10px] text-muted-foreground">{formatNum(areaGeral, 1)} ha</span>
            )}
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="p-4">
        {resumos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Nenhum pasto ativo encontrado.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {resumos.map(r => {
            const style = TIPO_USO_STYLES[r.tipoUso] || { border: 'border-l-border', text: 'text-foreground', bg: 'bg-muted/20' };
            return (
              <div
                key={r.tipoUso}
                className={`rounded-lg border p-4 border-l-4 ${style.border} ${style.bg}`}
              >
                {/* Title row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {style.icon === 'plant' && <Sprout className="h-4 w-4 text-lime-600" />}
                    <h3 className="text-base font-bold text-foreground">{r.tipoUsoLabel}</h3>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                      {r.qtdPastos} {r.qtdPastos === 1 ? 'pasto' : 'pastos'}
                    </Badge>
                  </div>
                  <span className="text-lg font-bold text-primary tabular-nums">{r.cabecasTotal} cab</span>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Peso Médio</span>
                    <p className="font-semibold text-foreground tabular-nums">
                      {r.pesoMedio ? `${formatNum(r.pesoMedio, 1)} kg` : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Área Total</span>
                    <p className="font-semibold text-foreground tabular-nums">
                      {r.areaTotal > 0 ? `${formatNum(r.areaTotal, 1)} ha` : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">UA/ha</span>
                    <p className="font-semibold text-foreground tabular-nums">
                      {r.uaHa ? formatNum(r.uaHa, 2) : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">kg/ha</span>
                    <p className="font-semibold text-foreground tabular-nums">
                      {r.kgHa ? formatNum(r.kgHa, 0) : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">cab/ha</span>
                    <p className="font-semibold text-foreground tabular-nums">
                      {r.cabHa ? formatNum(r.cabHa, 2) : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Arrobas</span>
                    <p className="font-semibold text-foreground tabular-nums">
                      {r.arrobasTotal ? formatNum(r.arrobasTotal, 1) : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">UA Total</span>
                    <p className="font-semibold text-foreground tabular-nums">
                      {r.uaTotal > 0 ? formatNum(r.uaTotal, 1) : '—'}
                    </p>
                  </div>
                </div>

                {/* Pastos list */}
                <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground truncate max-w-[70%]">
                    {r.pastoNomes.join(', ')}
                  </p>
                  {onVerPastos && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[10px] h-6 px-2 text-primary"
                      onClick={() => onVerPastos(r.tipoUso)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Ver pastos
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}
