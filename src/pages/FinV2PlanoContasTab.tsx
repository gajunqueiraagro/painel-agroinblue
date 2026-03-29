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

  const filtered = items.filter(i => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (i.subcentro || '').toLowerCase().includes(s) ||
      i.centro_custo.toLowerCase().includes(s) ||
      i.macro_custo.toLowerCase().includes(s) ||
      i.tipo_operacao.toLowerCase().includes(s)
    );
  });

  const tipoLabel = (t: string) => {
    if (t.startsWith('1')) return 'Receita';
    if (t.startsWith('2')) return 'Despesa';
    return t;
  };

  return (
    <div className="max-w-4xl mx-auto p-4 pb-20 space-y-4 animate-fade-in">
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
                <TableHead>Tipo</TableHead>
                <TableHead>Macro Custo</TableHead>
                <TableHead>Centro Custo</TableHead>
                <TableHead>Subcentro</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>}
              {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum registro</TableCell></TableRow>}
              {filtered.map(i => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{tipoLabel(i.tipo_operacao)}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{i.macro_custo}</TableCell>
                  <TableCell className="text-xs">{i.centro_custo}</TableCell>
                  <TableCell className="text-xs font-medium">{i.subcentro || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={i.ativo ? 'default' : 'secondary'} className="text-[10px]">
                      {i.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                </TableRow>
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
