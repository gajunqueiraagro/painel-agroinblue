/**
 * Meta GMD — GMD meta por categoria por mês.
 */
import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIAS } from '@/types/cattle';
import { useMetaGmd } from '@/hooks/useMetaGmd';
import { Save, ArrowLeft, CopyCheck } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  onBack?: () => void;
  initialAno?: string;
  backLabel?: string;
  ocultarFiltroAno?: boolean;
}

const MESES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function MetaGmdTab({ onBack, initialAno, backLabel, ocultarFiltroAno }: Props) {
  const now = new Date();
  const [ano, setAno] = useState(initialAno || String(now.getFullYear()));
  useEffect(() => {
    if (initialAno) setAno(initialAno);
  }, [initialAno]);
  const { rows, loading, saving, updateCell, salvar } = useMetaGmd(ano);

  const anos = useMemo(() => {
    const a: string[] = [];
    for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 3; y--) a.push(String(y));
    return a;
  }, []);

  const copyPreviousMonth = (mesIndex: number) => {
    if (mesIndex === 0) return;
    const prevKey = String(mesIndex).padStart(2, '0');
    const currKey = String(mesIndex + 1).padStart(2, '0');
    for (const row of rows) {
      const prevVal = row.meses[prevKey] || 0;
      updateCell(row.categoria, currKey, prevVal);
    }
    toast.success(`Valores de ${MESES_SHORT[mesIndex - 1]} copiados para ${MESES_SHORT[mesIndex]}`);
  };

  return (
    <div className="w-full px-2 animate-fade-in pb-4">
      <div className="p-1 space-y-1.5">
        {/* Header: Voltar + Título + Filtro Ano + Salvar */}
        <div className="flex items-center gap-2 flex-wrap">
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel || 'Voltar'}
            </button>
          )}
          <h2 className="text-sm font-semibold text-orange-600">GMD Meta</h2>
          <div className="ml-auto flex items-center gap-2">
            {!ocultarFiltroAno && (<>
            <span className="text-[10px] font-semibold text-muted-foreground">Ano:</span>
            <Select value={ano} onValueChange={setAno}>
              <SelectTrigger className="w-18 h-6 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map(a => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            </>)}
            <Button
              size="sm"
              className="text-[10px] h-6 px-2 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={salvar}
              disabled={saving || loading}
            >
              <Save className="h-3 w-3 mr-1" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-4 text-muted-foreground text-[10px]">Carregando...</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[10px]" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '80px' }} />
                {MESES_SHORT.map((_, i) => (
                  <col key={i} style={{ width: '52px' }} />
                ))}
              </colgroup>
              <thead>
                {/* Copy previous month buttons row */}
                <tr>
                  <th className="sticky left-0 z-20 bg-background"></th>
                  {MESES_SHORT.map((m, i) => (
                    <th key={i} className="px-0 py-0.5 text-center">
                      {i > 0 ? (
                        <button
                          onClick={() => copyPreviousMonth(i)}
                          className="text-[8px] text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded px-0.5 py-0 leading-tight transition-colors"
                          title={`Copiar ${MESES_SHORT[i - 1]} → ${m}`}
                        >
                          <CopyCheck className="h-2.5 w-2.5 inline" />
                        </button>
                      ) : null}
                    </th>
                  ))}
                </tr>
                {/* Month headers */}
                <tr className="bg-orange-500 text-white">
                  <th className="text-left py-1 px-1.5 font-bold whitespace-nowrap sticky left-0 z-20 bg-orange-500">
                    Categoria
                  </th>
                  {MESES_SHORT.map((m, i) => (
                    <th key={i} className="text-center py-1 px-0.5 font-medium">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const catLabel = CATEGORIAS.find(c => c.value === row.categoria)?.label || row.categoria;
                  return (
                    <tr key={row.categoria} className={idx % 2 ? 'bg-orange-50/40' : 'bg-background'}>
                      <td className="py-0.5 px-1.5 font-medium text-foreground whitespace-nowrap sticky left-0 z-10 border-r bg-orange-50/60">
                        {catLabel}
                      </td>
                      {Array.from({ length: 12 }, (_, m) => {
                        const key = String(m + 1).padStart(2, '0');
                        const val = row.meses[key] || 0;
                        const bgColor = val === 0 ? 'bg-gray-100'
                          : val <= 0.200 ? 'bg-yellow-100'
                          : val <= 0.500 ? 'bg-green-100'
                          : val <= 0.800 ? 'bg-blue-100'
                          : val <= 2.000 ? 'bg-blue-300'
                          : 'bg-red-200';
                        const textColor = val > 0.800 && val <= 2.000 ? 'text-white' : val > 2.000 ? 'text-red-800' : 'text-orange-600';
                        return (
                          <td key={key} className="py-0 px-0.5 relative">
                            <Input
                              type="number"
                              step="0.050"
                              min="0"
                              tabIndex={m * rows.length + idx + 1}
                              value={val === 0 ? '' : val.toFixed(3)}
                              placeholder="–"
                              onChange={e => updateCell(row.categoria, key, parseFloat(e.target.value) || 0)}
                              className={`h-5 text-[10px] text-center w-full px-0 italic border-orange-200 focus:border-orange-400 hover:brightness-95 transition-colors placeholder:text-muted-foreground/50 placeholder:not-italic ${bgColor} ${textColor}`}
                            />
                            {val > 2.000 && <span className="absolute right-0.5 top-0 text-[8px] text-red-600 font-bold">*</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[9px] text-muted-foreground text-center">
          Valores em kg/cab/dia · Cenário Meta
        </p>
      </div>
    </div>
  );
}
