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

// ── Código padrão das categorias ──
const CAT_COLS = [
  { codigo: 'mamotes_m', sigla: 'MM' },
  { codigo: 'desmama_m', sigla: 'DM' },
  { codigo: 'garrotes', sigla: 'G' },
  { codigo: 'bois', sigla: 'B' },
  { codigo: 'touros', sigla: 'T' },
  { codigo: 'mamotes_f', sigla: 'MF' },
  { codigo: 'desmama_f', sigla: 'DF' },
  { codigo: 'novilhas', sigla: 'N' },
  { codigo: 'vacas', sigla: 'V' },
];

// gerarSugestoes imported from shared util

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack: () => void;
  onNavigateToReclass: (filtro?: { ano: string; mes: number }) => void;
  onNavigateToFechamento: (filtro?: { ano: string; mes: number }) => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

import { gerarSugestoes, type RowData, type Sugestao } from '@/lib/calculos/sugestoesConciliacao';

export function ConciliacaoCategoriaTab({ lancamentos, saldosIniciais, onBack, onNavigateToReclass, onNavigateToFechamento, filtroAnoInicial, filtroMesInicial }: Props) {
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
    <div className="max-w-lg mx-auto animate-fade-in pb-20">
      {/* Resumo de conciliação + Filtros - sticky */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm pt-2 px-2 pb-2 space-y-2">
        {/* Tabela resumo compacta */}
        <div className="overflow-x-auto">
           <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left font-bold text-muted-foreground px-1 py-0.5 w-12 border-r border-border/30">Cat.</th>
                {CAT_COLS.map((c, idx) => (
                  <th key={c.sigla} className={`text-center font-bold text-muted-foreground px-0.5 py-0.5 min-w-[28px]${idx === 4 ? ' border-r border-border/30' : ''}`}>{c.sigla}</th>
                ))}
                <th className="text-center font-bold text-foreground px-1 py-0.5 min-w-[32px] border-l border-border/30">Total</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha Pasto */}
              <tr>
                <td className="font-bold text-foreground px-1 py-0.5 border-r border-border/30">Pasto</td>
                {CAT_COLS.map((c, idx) => {
                  const v = pastoData.get(c.codigo) || 0;
                  return <td key={c.sigla} className={`text-center text-foreground px-0.5 py-0.5${idx === 4 ? ' border-r border-border/30' : ''}`}>{v || ''}</td>;
                })}
                <td className="text-center font-bold text-foreground px-1 py-0.5 border-l border-border/30">{totalPasto}</td>
              </tr>
              {/* Linha Sistema */}
              <tr>
                <td className="font-bold text-foreground px-1 py-0.5 border-r border-border/30">Sistema</td>
                {CAT_COLS.map((c, idx) => {
                  const v = saldoMap.get(c.codigo) || 0;
                  return <td key={c.sigla} className={`text-center text-foreground px-0.5 py-0.5${idx === 4 ? ' border-r border-border/30' : ''}`}>{v || ''}</td>;
                })}
                <td className="text-center font-bold text-foreground px-1 py-0.5 border-l border-border/30">{totalSistema}</td>
              </tr>
              {/* Linha Diferença */}
              <tr className="border-t border-border/40">
                <td className="font-bold text-foreground px-1 py-0.5 border-r border-border/30">Dif.</td>
                {CAT_COLS.map((c, idx) => {
                  const pasto = pastoData.get(c.codigo) || 0;
                  const sistema = saldoMap.get(c.codigo) || 0;
                  const dif = pasto - sistema;
                  return (
                    <td key={c.sigla} className={`text-center font-bold px-0.5 py-0.5 ${dif > 0 ? 'text-emerald-600' : dif < 0 ? 'text-red-600' : 'text-muted-foreground'}${idx === 4 ? ' border-r border-border/30' : ''}`}>
                      {dif !== 0 ? (dif > 0 ? `+${dif}` : dif) : ''}
                    </td>
                  );
                })}
                <td className={`text-center font-bold px-1 py-0.5 border-l border-border/30 ${totalDiferenca > 0 ? 'text-emerald-600' : totalDiferenca < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {totalDiferenca !== 0 ? (totalDiferenca > 0 ? `+${totalDiferenca}` : totalDiferenca) : '0'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={anoFiltro} onValueChange={setAnoFiltro}>
            <SelectTrigger className="w-20 h-8 text-xs font-bold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(mesFiltro)} onValueChange={v => setMesFiltro(Number(v))}>
            <SelectTrigger className="w-20 h-8 text-xs font-bold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES_COLS.map((m, i) => (
                <SelectItem key={m.key} value={String(i + 1)}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="px-4 space-y-4">

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

      {/* Botões de ação */}
      {catsDivergentes > 0 && (
        <div className="flex gap-2">
          <Button
            onClick={() => onNavigateToReclass({ ano: anoFiltro, mes: mesFiltro })}
            className="flex-1 font-bold"
            size="lg"
          >
            🔄 Reclass. <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
          <Button
            onClick={() => onNavigateToFechamento({ ano: anoFiltro, mes: mesFiltro })}
            className="flex-1 font-bold"
            size="lg"
            variant="outline"
          >
            🐄 Ajustar no Pasto <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
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
    </div>
  );
}
