/**
 * Meta GMD — GMD previsto por categoria por mês.
 */
import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIAS, type Categoria } from '@/types/cattle';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { useMetaGmd } from '@/hooks/useMetaGmd';
import { Save, ArrowLeft } from 'lucide-react';

interface Props {
  onBack?: () => void;
}

const MESES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function MetaGmdTab({ onBack }: Props) {
  const now = new Date();
  const [ano, setAno] = useState(String(now.getFullYear()));
  const { rows, loading, saving, updateCell, salvar } = useMetaGmd(ano);

  const anos = useMemo(() => {
    const a: string[] = [];
    for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 3; y--) a.push(String(y));
    return a;
  }, []);

  return (
    <div className="w-full px-2 animate-fade-in pb-24">
      <div className="p-2 space-y-3">
        {/* Filtro Ano */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Ano:</span>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger className="w-20 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anos.map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="ml-auto text-xs h-8"
                onClick={salvar}
                disabled={saving || loading}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b">
                      <th className="text-left py-1.5 px-1.5 font-bold text-foreground whitespace-nowrap sticky left-0 bg-card z-20 min-w-[90px]">
                        Categoria
                      </th>
                      {MESES_SHORT.map((m, i) => (
                        <th key={i} className="text-center py-1.5 px-1 font-medium text-muted-foreground min-w-[52px]">
                          {m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const catLabel = CATEGORIAS.find(c => c.value === row.categoria)?.label || row.categoria;
                      return (
                        <tr key={row.categoria} className={idx % 2 ? 'bg-muted/20' : ''}>
                          <td className="py-1 px-1.5 font-medium text-foreground whitespace-nowrap sticky left-0 bg-card z-10 border-r">
                            {catLabel}
                          </td>
                          {Array.from({ length: 12 }, (_, m) => {
                            const key = String(m + 1).padStart(2, '0');
                            const val = row.meses[key] || 0;
                            return (
                              <td key={key} className="py-0.5 px-0.5">
                                <Input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  value={val || ''}
                                  onChange={e => updateCell(row.categoria, key, parseFloat(e.target.value) || 0)}
                                  className="h-6 text-[10px] text-center w-full min-w-[48px] px-0.5"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-[10px] text-muted-foreground text-center">
          Valores em kg/cab/dia. Estas metas alimentam o cenário "Previsto" do Painel do Consultor.
        </p>
      </div>
    </div>
  );
}
