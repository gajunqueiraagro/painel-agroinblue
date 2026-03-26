/**
 * Conciliação de Categoria — compara saldo do sistema vs fechamento de pastos por categoria.
 * Inclui sugestões inteligentes de ajuste baseadas na cadeia zootécnica.
 */
import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MESES_COLS } from '@/lib/calculos/labels';
import { formatNum } from '@/lib/calculos/formatters';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { supabase } from '@/integrations/supabase/client';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

// ── Cadeia zootécnica ──
const CADEIA_MACHOS = ['mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros'];
const CADEIA_FEMEAS = ['mamotes_f', 'desmama_f', 'novilhas', 'vacas'];

function getCadeiaVizinhos(codigo: string): string[] {
  const idxM = CADEIA_MACHOS.indexOf(codigo);
  if (idxM >= 0) {
    const vizinhos: string[] = [];
    if (idxM > 0) vizinhos.push(CADEIA_MACHOS[idxM - 1]);
    if (idxM < CADEIA_MACHOS.length - 1) vizinhos.push(CADEIA_MACHOS[idxM + 1]);
    return vizinhos;
  }
  const idxF = CADEIA_FEMEAS.indexOf(codigo);
  if (idxF >= 0) {
    const vizinhos: string[] = [];
    if (idxF > 0) vizinhos.push(CADEIA_FEMEAS[idxF - 1]);
    if (idxF < CADEIA_FEMEAS.length - 1) vizinhos.push(CADEIA_FEMEAS[idxF + 1]);
    return vizinhos;
  }
  return [];
}

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack: () => void;
  onNavigateToReclass: () => void;
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

interface Sugestao {
  tipo: 'evolucao' | 'excesso' | 'falta';
  mensagem: string;
}

function gerarSugestoes(rows: RowData[], catMap: Map<string, string>): Sugestao[] {
  const sugestoes: Sugestao[] = [];
  const divergentes = rows.filter(r => r.diferenca !== 0);
  if (divergentes.length === 0) return sugestoes;

  // Tentar casar pares complementares na cadeia
  const usados = new Set<string>();

  for (const r of divergentes) {
    if (usados.has(r.codigo)) continue;
    const vizinhos = getCadeiaVizinhos(r.codigo);

    for (const viz of vizinhos) {
      if (usados.has(viz)) continue;
      const vizRow = divergentes.find(d => d.codigo === viz);
      if (!vizRow) continue;

      // Excesso no sistema (diferenca < 0 = pasto < sistema) e falta no vizinho (diferenca > 0)
      if (r.diferenca < 0 && vizRow.diferenca > 0 && Math.abs(r.diferenca + vizRow.diferenca) <= 3) {
        const qty = Math.min(Math.abs(r.diferenca), vizRow.diferenca);
        sugestoes.push({
          tipo: 'evolucao',
          mensagem: `${r.nome} tem ${Math.abs(r.diferenca)} cab a mais no sistema e ${vizRow.nome} tem ${vizRow.diferenca} a menos. Sugestão: reclassificar ${qty} cabeça(s) de ${r.nome} → ${vizRow.nome}.`,
        });
        usados.add(r.codigo);
        usados.add(viz);
        break;
      }
      if (r.diferenca > 0 && vizRow.diferenca < 0 && Math.abs(r.diferenca + vizRow.diferenca) <= 3) {
        const qty = Math.min(r.diferenca, Math.abs(vizRow.diferenca));
        sugestoes.push({
          tipo: 'evolucao',
          mensagem: `${vizRow.nome} tem ${Math.abs(vizRow.diferenca)} cab a mais no sistema e ${r.nome} tem ${r.diferenca} a menos. Sugestão: reclassificar ${qty} cabeça(s) de ${vizRow.nome} → ${r.nome}.`,
        });
        usados.add(r.codigo);
        usados.add(viz);
        break;
      }
    }
  }

  // Sugestões residuais para divergências não casadas
  for (const r of divergentes) {
    if (usados.has(r.codigo)) continue;
    const vizinhos = getCadeiaVizinhos(r.codigo);
    const vizNomes = vizinhos.map(v => catMap.get(v) || v).join(' ou ');

    if (r.diferenca < 0) {
      // Sistema > Pasto → excesso no sistema
      sugestoes.push({
        tipo: 'excesso',
        mensagem: `${r.nome} (+${Math.abs(r.diferenca)} no sistema): verificar se deveria ter sido evoluído para ${vizNomes || 'outra categoria'}.`,
      });
    } else {
      // Pasto > Sistema → falta no sistema
      sugestoes.push({
        tipo: 'falta',
        mensagem: `${r.nome} (-${r.diferenca} no sistema): verificar se animais foram corretamente evoluídos a partir de ${vizNomes || 'outra categoria'}.`,
      });
    }
  }

  return sugestoes;
}

export function ConciliacaoCategoriaTab({ lancamentos, saldosIniciais, onBack, onNavigateToReclass, filtroAnoInicial, filtroMesInicial }: Props) {
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

  useEffect(() => {
    if (filtroAnoInicial) setAnoFiltro(filtroAnoInicial);
    if (filtroMesInicial) setMesFiltro(filtroMesInicial);
  }, [filtroAnoInicial, filtroMesInicial]);

  const [pastoData, setPastoData] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fazendaId) return;
    setLoading(true);
    const load = async () => {
      let fpQuery = supabase.from('fechamento_pastos').select('id').eq('ano_mes', anoMes);
      if (!isGlobal) fpQuery = fpQuery.eq('fazenda_id', fazendaId);
      const { data: fps } = await fpQuery;
      const fechIds = (fps || []).map(f => f.id);
      if (fechIds.length === 0) { setPastoData(new Map()); setLoading(false); return; }

      const { data: itens } = await supabase
        .from('fechamento_pasto_itens')
        .select('categoria_id, quantidade')
        .in('fechamento_id', fechIds)
        .gt('quantidade', 0);

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

  const saldoMap = useMemo(
    () => calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoNum, mesFiltro),
    [saldosIniciais, lancamentos, anoNum, mesFiltro]
  );

  const catMap = useMemo(
    () => new Map((categorias || []).map(c => [c.codigo, c.nome])),
    [categorias]
  );

  const rows: RowData[] = useMemo(() => {
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
    return result.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [saldoMap, pastoData, catMap]);

  const totalSistema = rows.reduce((s, r) => s + r.qtdSistema, 0);
  const totalPasto = rows.reduce((s, r) => s + r.qtdPasto, 0);
  const totalDiferenca = rows.reduce((s, r) => s + r.diferenca, 0);
  const catsDivergentes = rows.filter(r => r.diferenca !== 0).length;

  const sugestoes = useMemo(() => gerarSugestoes(rows, catMap), [rows, catMap]);

  const mesLabel = MESES_COLS.find(m => m.key === String(mesFiltro).padStart(2, '0'))?.label || '';

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
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

      {/* Sugestão inteligente */}
      <Card className={sugestoes.length > 0 ? 'border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20' : 'border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'}>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-bold text-foreground">📌 Sugestão de Ajuste</p>
          {sugestoes.length === 0 ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Categorias conciliadas. Nenhum ajuste necessário.
            </p>
          ) : (
            sugestoes.map((s, i) => (
              <p key={i} className="text-xs text-muted-foreground leading-relaxed">
                {s.tipo === 'evolucao' ? '🔄' : s.tipo === 'excesso' ? '⬆️' : '⬇️'} {s.mensagem}
              </p>
            ))
          )}
        </CardContent>
      </Card>

      {/* Botão de ação — Reclassificação */}
      {catsDivergentes > 0 && (
        <Button
          onClick={onNavigateToReclass}
          className="w-full font-bold"
          size="lg"
        >
          🔄 Ajustar Categorias (Reclass.) <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      )}

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
                <TableHead className="text-right text-foreground font-bold text-xs">Dif. no Sistema</TableHead>
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
