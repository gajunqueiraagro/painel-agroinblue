/**
 * Conciliação de Categoria — compara saldo do sistema vs fechamento de pastos por categoria.
 */
import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { MESES_COLS } from '@/lib/calculos/labels';
import { formatNum } from '@/lib/calculos/formatters';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { supabase } from '@/integrations/supabase/client';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

interface RowData {
  codigo: string;
  nome: string;
  qtdSistema: number;
  qtdPasto: number;
  diferenca: number;
}

export function ConciliacaoCategoriaTab({ lancamentos, saldosIniciais, onBack, filtroAnoInicial, filtroMesInicial }: Props) {
  const { fazendaAtual, isGlobal } = useFazenda();
  const { categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;

  const anosDisp = useMemo(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { set.add(l.data.substring(0, 4)); } catch {} });
    saldosIniciais.forEach(s => set.add(String(s.ano)));
    return Array.from(set).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const anoNum = Number(anoFiltro);
  const mesDefault = filtroMesInicial || (anoNum === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);
  const [mesFiltro, setMesFiltro] = useState(mesDefault);
  const anoMes = `${anoFiltro}-${String(mesFiltro).padStart(2, '0')}`;

  const [pastoData, setPastoData] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  // Load pasto quantities
  useEffect(() => {
    if (!fazendaId) return;
    setLoading(true);

    const load = async () => {
      // Get fechamento_pastos for this period
      let fpQuery = supabase.from('fechamento_pastos').select('id').eq('ano_mes', anoMes);
      if (!isGlobal) fpQuery = fpQuery.eq('fazenda_id', fazendaId);

      const { data: fps } = await fpQuery;
      const fechIds = (fps || []).map(f => f.id);

      if (fechIds.length === 0) {
        setPastoData(new Map());
        setLoading(false);
        return;
      }

      const { data: itens } = await supabase
        .from('fechamento_pasto_itens')
        .select('categoria_id, quantidade')
        .in('fechamento_id', fechIds)
        .gt('quantidade', 0);

      // Map categoria_id -> codigo
      const { data: catsData } = await supabase.from('categorias_rebanho').select('id, codigo');
      const idToCodigo = new Map((catsData || []).map(c => [c.id, c.codigo]));

      const map = new Map<string, number>();
      (itens || []).forEach(i => {
        const codigo = idToCodigo.get(i.categoria_id);
        if (codigo) map.set(codigo, (map.get(codigo) || 0) + i.quantidade);
      });

      setPastoData(map);
      setLoading(false);
    };

    load();
  }, [fazendaId, anoMes, isGlobal]);

  // Build rows
  const saldoMap = useMemo(
    () => calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoNum, mesFiltro),
    [saldosIniciais, lancamentos, anoNum, mesFiltro]
  );

  const rows: RowData[] = useMemo(() => {
    const catMap = new Map((categorias || []).map(c => [c.codigo, c.nome]));
    const allCodigos = new Set([...saldoMap.keys(), ...pastoData.keys()]);
    const result: RowData[] = [];

    allCodigos.forEach(codigo => {
      const qtdSistema = saldoMap.get(codigo) || 0;
      const qtdPasto = pastoData.get(codigo) || 0;
      if (qtdSistema === 0 && qtdPasto === 0) return;
      result.push({
        codigo,
        nome: catMap.get(codigo) || codigo,
        qtdSistema,
        qtdPasto,
        diferenca: qtdPasto - qtdSistema,
      });
    });

    // Sort by categoria name
    return result.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [saldoMap, pastoData, categorias]);

  const totalSistema = rows.reduce((s, r) => s + r.qtdSistema, 0);
  const totalPasto = rows.reduce((s, r) => s + r.qtdPasto, 0);
  const totalDiferenca = rows.reduce((s, r) => s + r.diferenca, 0);
  const catsDivergentes = rows.filter(r => r.diferenca !== 0).length;

  const mesLabel = MESES_COLS.find(m => m.key === String(mesFiltro).padStart(2, '0'))?.label || '';

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-extrabold text-foreground leading-tight">📋 Conciliação de Categoria</h1>
          <span className="text-xs text-muted-foreground">📍 {fazendaAtual?.nome || 'Global'}</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="w-24 text-base font-bold"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(mesFiltro)} onValueChange={v => setMesFiltro(Number(v))}>
          <SelectTrigger className="w-28 text-sm font-bold"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES_COLS.map((m, i) => (
              <SelectItem key={m.key} value={String(i + 1)}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <Card className={catsDivergentes > 0 ? 'border-l-4 border-l-destructive' : 'border-l-4 border-l-emerald-500'}>
        <CardContent className="p-4 space-y-1">
          <p className="text-xs text-muted-foreground font-medium">{mesLabel}/{anoFiltro}</p>
          {catsDivergentes > 0 ? (
            <>
              <p className="text-sm font-bold text-destructive">
                {catsDivergentes} categoria(s) divergente(s)
              </p>
              <p className="text-xs text-muted-foreground">
                Diferença total: <strong className="text-destructive">{totalDiferenca > 0 ? '+' : ''}{totalDiferenca} cab</strong>
              </p>
            </>
          ) : (
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              ✅ Categorias conciliadas
            </p>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Sem dados para o período.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-foreground font-bold">Categoria</TableHead>
                <TableHead className="text-right text-foreground font-bold">Sistema</TableHead>
                <TableHead className="text-right text-foreground font-bold">Pasto</TableHead>
                <TableHead className="text-right text-foreground font-bold">Diferença</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.codigo} className={r.diferenca !== 0 ? 'bg-destructive/5' : ''}>
                  <TableCell className="font-medium text-foreground">{r.nome}</TableCell>
                  <TableCell className="text-right text-foreground">{formatNum(r.qtdSistema)}</TableCell>
                  <TableCell className="text-right text-foreground">{formatNum(r.qtdPasto)}</TableCell>
                  <TableCell className={`text-right font-bold ${r.diferenca !== 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {r.diferenca > 0 ? '+' : ''}{r.diferenca}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/60">
                <TableCell className="font-extrabold text-foreground">TOTAL</TableCell>
                <TableCell className="text-right font-extrabold text-foreground">{formatNum(totalSistema)}</TableCell>
                <TableCell className="text-right font-extrabold text-foreground">{formatNum(totalPasto)}</TableCell>
                <TableCell className={`text-right font-extrabold ${totalDiferenca !== 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {totalDiferenca > 0 ? '+' : ''}{totalDiferenca}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* Return button */}
      <button
        onClick={onBack}
        className="w-full flex items-center justify-center gap-1 text-sm font-bold text-primary bg-primary/10 rounded-lg py-2.5 transition-colors hover:bg-primary/20"
      >
        <ArrowLeft className="h-4 w-4" /> Retornar ao Resumo Zootécnico
      </button>
    </div>
  );
}
