import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search } from 'lucide-react';

interface PlanoItem {
  id: string;
  tipo_operacao: string;
  macro_custo: string;
  grupo_custo: string | null;
  centro_custo: string;
  subcentro: string | null;
  ativo: boolean;
  ordem_exibicao: number;
}

export function FinV2PlanoContasTab() {
  const { clienteAtual } = useCliente();
  const [items, setItems] = useState<PlanoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showInativos, setShowInativos] = useState(false);

  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('financeiro_plano_contas')
      .select('id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, ativo, ordem_exibicao')
      .eq('cliente_id', clienteAtual.id)
      .order('ordem_exibicao');
    setItems((data as PlanoItem[]) || []);
    setLoading(false);
  }, [clienteAtual?.id]);

  useEffect(() => { load(); }, [load]);

  const TIPO_ORDER: Record<string, number> = { 'Receita': 0, 'Despesa': 1, 'Transferência': 2 };

  const tipoLabel = (t: string) => {
    if (t.startsWith('1')) return 'Receita';
    if (t.startsWith('2')) return 'Despesa';
    if (t.toLowerCase().includes('transf')) return 'Transferência';
    return t;
  };

  const hasInativos = items.some(i => !i.ativo);

  const filtered = items
    .filter(i => {
      if (!showInativos && !i.ativo) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        (i.subcentro || '').toLowerCase().includes(s) ||
        i.centro_custo.toLowerCase().includes(s) ||
        (i.grupo_custo || '').toLowerCase().includes(s) ||
        i.macro_custo.toLowerCase().includes(s) ||
        i.tipo_operacao.toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      const ta = TIPO_ORDER[tipoLabel(a.tipo_operacao)] ?? 99;
      const tb = TIPO_ORDER[tipoLabel(b.tipo_operacao)] ?? 99;
      if (ta !== tb) return ta - tb;
      return a.ordem_exibicao - b.ordem_exibicao;
    });

  // Group by macro_custo for visual separation
  const groups: { label: string; items: PlanoItem[] }[] = [];
  let lastGroup = '';
  for (const item of filtered) {
    const key = `${tipoLabel(item.tipo_operacao)} › ${item.macro_custo}${item.grupo_custo ? ' › ' + item.grupo_custo : ''}`;
    if (key !== lastGroup) {
      groups.push({ label: key, items: [] });
      lastGroup = key;
    }
    groups[groups.length - 1].items.push(item);
  }

  const cellClass = "text-[11px] font-medium leading-tight py-1 px-2";
  const colSpan = 6;

  return (
    <div className="w-full p-4 pb-20 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-foreground">Plano de Contas</h2>
        <div className="flex items-center gap-3">
          {hasInativos && (
            <div className="flex items-center gap-1.5">
              <Switch id="show-inativos" checked={showInativos} onCheckedChange={setShowInativos} className="h-4 w-7" />
              <Label htmlFor="show-inativos" className="text-[10px] text-muted-foreground cursor-pointer">Mostrar inativos</Label>
            </div>
          )}
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] font-semibold py-1 px-2">Macro Custo</TableHead>
                <TableHead className="text-[11px] font-semibold py-1 px-2">Grupo</TableHead>
                <TableHead className="text-[11px] font-semibold py-1 px-2">Centro Custo</TableHead>
                <TableHead className="text-[11px] font-semibold py-1 px-2">Subcentro</TableHead>
                <TableHead className="text-[11px] font-semibold py-1 px-2">Tipo</TableHead>
                {showInativos && <TableHead className="text-[11px] font-semibold py-1 px-2">Status</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8 text-xs">Carregando...</TableCell></TableRow>}
              {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8 text-xs">Nenhum registro</TableCell></TableRow>}
              {groups.map(g => (
                <>{/* Group header */}
                  <TableRow key={`grp-${g.label}`} className="bg-muted/40 border-t">
                    <TableCell colSpan={showInativos ? colSpan : colSpan - 1} className="text-[12px] font-semibold py-1.5 px-2 text-foreground/80">
                      {g.label}
                    </TableCell>
                  </TableRow>
                  {g.items.map(i => (
                    <TableRow key={i.id} className={!i.ativo ? 'opacity-50' : ''}>
                      <TableCell className={cellClass}>{i.macro_custo}</TableCell>
                      <TableCell className={cellClass}>{i.grupo_custo || '-'}</TableCell>
                      <TableCell className={cellClass}>{i.centro_custo}</TableCell>
                      <TableCell className={cellClass}>{i.subcentro || '-'}</TableCell>
                      <TableCell className={cellClass}>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">{tipoLabel(i.tipo_operacao)}</Badge>
                      </TableCell>
                      {showInativos && (
                        <TableCell className={cellClass}>
                          <Badge variant={i.ativo ? 'default' : 'secondary'} className="text-[9px] px-1 py-0">
                            {i.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center">
        {filtered.length} registro(s) encontrado(s)
      </p>
    </div>
  );
}
