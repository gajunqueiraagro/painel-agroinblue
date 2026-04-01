import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search } from 'lucide-react';

interface PlanoItem {
  id: string;
  tipo_operacao: string;
  macro_custo: string;
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

  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('financeiro_plano_contas')
      .select('id, tipo_operacao, macro_custo, centro_custo, subcentro, ativo, ordem_exibicao')
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

  const filtered = items
    .filter(i => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        (i.subcentro || '').toLowerCase().includes(s) ||
        i.centro_custo.toLowerCase().includes(s) ||
        i.macro_custo.toLowerCase().includes(s) ||
        i.tipo_operacao.toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      const ta = TIPO_ORDER[tipoLabel(a.tipo_operacao)] ?? 99;
      const tb = TIPO_ORDER[tipoLabel(b.tipo_operacao)] ?? 99;
      if (ta !== tb) return ta - tb;
      const mc = a.macro_custo.localeCompare(b.macro_custo);
      if (mc !== 0) return mc;
      const cc = a.centro_custo.localeCompare(b.centro_custo);
      if (cc !== 0) return cc;
      return (a.subcentro || '').localeCompare(b.subcentro || '');
    });

  // Group by tipo for visual separation
  const groups: { label: string; items: PlanoItem[] }[] = [];
  let lastTipo = '';
  for (const item of filtered) {
    const tipo = tipoLabel(item.tipo_operacao);
    if (tipo !== lastTipo) {
      groups.push({ label: tipo === 'Receita' ? 'Receitas' : tipo === 'Despesa' ? 'Despesas' : 'Transferências', items: [] });
      lastTipo = tipo;
    }
    groups[groups.length - 1].items.push(item);
  }

  const cellClass = "text-[12px] font-medium leading-tight py-1 px-2";

  return (
    <div className="w-full p-4 pb-20 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">Plano de Contas</h2>
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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[12px] font-semibold py-1 px-2">Tipo</TableHead>
                <TableHead className="text-[12px] font-semibold py-1 px-2">Macro Custo</TableHead>
                <TableHead className="text-[12px] font-semibold py-1 px-2">Centro Custo</TableHead>
                <TableHead className="text-[12px] font-semibold py-1 px-2">Subcentro</TableHead>
                <TableHead className="text-[12px] font-semibold py-1 px-2">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-xs">Carregando...</TableCell></TableRow>}
              {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-xs">Nenhum registro</TableCell></TableRow>}
              {groups.map(g => (
                <>
                  <TableRow key={`grp-${g.label}`} className="bg-muted/40 border-t">
                    <TableCell colSpan={5} className="text-[13px] font-semibold py-1.5 px-2 text-foreground/80">
                      {g.label}
                    </TableCell>
                  </TableRow>
                  {g.items.map(i => (
                    <TableRow key={i.id}>
                      <TableCell className={cellClass}>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tipoLabel(i.tipo_operacao)}</Badge>
                      </TableCell>
                      <TableCell className={cellClass}>{i.macro_custo}</TableCell>
                      <TableCell className={cellClass}>{i.centro_custo}</TableCell>
                      <TableCell className={cellClass}>{i.subcentro || '-'}</TableCell>
                      <TableCell className={cellClass}>
                        <Badge variant={i.ativo ? 'default' : 'secondary'} className="text-[9px] px-1 py-0">
                          {i.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
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
