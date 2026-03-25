import { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Save, Copy, Eye, EyeOff, Info, Lock, Unlock, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { useValorRebanho } from '@/hooks/useValorRebanho';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';
import { toast } from 'sonner';
import { useFechamentoCategoria, type OrigemPeso } from '@/hooks/useFechamentoCategoria';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack?: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

/** Mapeia OrigemPeso → label amigável */
const ORIGEM_LABEL: Record<OrigemPeso, string> = {
  pastos: 'Fechamento do mês',
  lancamento: 'Último lançamento',
  saldo_inicial: 'Saldo inicial do ano',
  sem_base: 'Sem dados',
};

export function ValorRebanhoTab({ lancamentos, saldosIniciais, onBack, filtroAnoInicial, filtroMesInicial }: Props) {
  const { fazendaAtual, isGlobal } = useFazenda();
  const { categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(l.data.substring(0, 4)); } catch {} });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const mesAtual = String(new Date().getMonth() + 1).padStart(2, '0');
  const [mesFiltro, setMesFiltro] = useState(mesAtual);
  const [mostrarZerados, setMostrarZerados] = useState(false);

  const anoMes = `${anoFiltro}-${mesFiltro}`;
  const isDezembro = mesFiltro === '12';

  const {
    precos, loading, saving, salvarPrecos, loadPrecosMesAnterior,
    isFechado, isAdmin, reabrirFechamento,
  } = useValorRebanho(anoMes);

  const [precosLocal, setPrecosLocal] = useState<Record<string, number>>({});
  const [precosDisplay, setPrecosDisplay] = useState<Record<string, string>>({});

  // --- BASE OFICIAL: useFechamentoCategoria ---
  const resumoOficial = useFechamentoCategoria(
    fazendaId,
    Number(anoFiltro),
    Number(mesFiltro),
    lancamentos,
    saldosIniciais,
    categorias,
  );

  // Build rows from official source
  const allRows = useMemo(() => {
    return resumoOficial.rows.map(row => {
      const precoKg = precosLocal[row.categoriaCodigo] ?? 0;
      const valorTotal = row.quantidadeFinal * (row.pesoMedioFinalKg || 0) * precoKg;
      const valorCabeca = row.quantidadeFinal > 0 && row.pesoMedioFinalKg && precoKg > 0
        ? row.pesoMedioFinalKg * precoKg
        : 0;
      return {
        categoriaId: row.categoriaId,
        codigo: row.categoriaCodigo,
        nome: row.categoriaNome,
        saldo: row.quantidadeFinal,
        pesoMedio: row.pesoMedioFinalKg || 0,
        origemPeso: row.origemPeso,
        precoKg,
        valorCabeca,
        valorTotal,
      };
    });
  }, [resumoOficial.rows, precosLocal]);

  const rows = useMemo(() => {
    if (mostrarZerados || isDezembro) return allRows;
    return allRows.filter(r => r.saldo > 0);
  }, [allRows, mostrarZerados, isDezembro]);

  const categoriasOcultas = allRows.length - allRows.filter(r => r.saldo > 0).length;
  const temEstimativa = rows.some(r => r.saldo > 0 && r.pesoMedio > 0 && r.origemPeso !== 'pastos');

  const totalRebanho = useMemo(() => allRows.reduce((sum, r) => sum + r.valorTotal, 0), [allRows]);
  const totalCabecas = useMemo(() => allRows.reduce((sum, r) => sum + r.saldo, 0), [allRows]);
  const pesoMedioGeral = useMemo(() => {
    const totalPeso = allRows.reduce((sum, r) => sum + (r.saldo * r.pesoMedio), 0);
    return totalCabecas > 0 ? totalPeso / totalCabecas : 0;
  }, [allRows, totalCabecas]);
  const valorMedioCabeca = totalCabecas > 0 ? totalRebanho / totalCabecas : 0;

  const precoMedioKg = useMemo(() => {
    const pesoTotal = allRows.reduce((sum, r) => sum + (r.saldo * r.pesoMedio), 0);
    return pesoTotal > 0 ? totalRebanho / pesoTotal : 0;
  }, [allRows, totalRebanho]);

  const precoMedioArroba = precoMedioKg * 30;
  const mesLabel = MESES_COLS.find(m => m.key === mesFiltro)?.label || mesFiltro;

  const categoriasSemPreco = useMemo(() => {
    if (!isDezembro) return [];
    return allRows.filter(r => r.precoKg <= 0).map(r => r.nome);
  }, [allRows, isDezembro]);

  const dezembroCompleto = isDezembro && categoriasSemPreco.length === 0;

  // Sync loaded prices to local state
  useEffect(() => {
    const numMap: Record<string, number> = {};
    const strMap: Record<string, string> = {};
    precos.forEach(p => {
      numMap[p.categoria] = p.preco_kg;
      strMap[p.categoria] = p.preco_kg > 0 ? String(p.preco_kg).replace('.', ',') : '';
    });
    setPrecosLocal(numMap);
    setPrecosDisplay(strMap);
  }, [precos]);

  const handlePrecoChange = (codigo: string, value: string) => {
    const sanitized = value.replace(/[^0-9.,]/g, '');
    setPrecosDisplay(prev => ({ ...prev, [codigo]: sanitized }));
    const num = parseFloat(sanitized.replace(',', '.'));
    setPrecosLocal(prev => ({ ...prev, [codigo]: isNaN(num) ? 0 : num }));
  };

  const handleSalvar = async () => {
    const items = Object.entries(precosLocal).map(([categoria, preco_kg]) => ({
      categoria,
      preco_kg,
    }));
    await salvarPrecos(items);
  };

  const handleCopiarMesAnterior = async () => {
    const prev = await loadPrecosMesAnterior();
    if (prev.length === 0) {
      toast.info('Nenhum preço encontrado no mês anterior');
      return;
    }
    const numMap: Record<string, number> = { ...precosLocal };
    const strMap: Record<string, string> = { ...precosDisplay };
    prev.forEach(p => {
      numMap[p.categoria] = p.preco_kg;
      strMap[p.categoria] = p.preco_kg > 0 ? String(p.preco_kg).replace('.', ',') : '';
    });
    setPrecosLocal(numMap);
    setPrecosDisplay(strMap);
    toast.success(`${prev.length} preços copiados do mês anterior`);
  };

  const canEdit = !isFechado;

  if (isGlobal) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Selecione uma fazenda para ver o valor do rebanho.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4 animate-fade-in pb-20">
      {/* Filtros */}
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="w-[100px] touch-target text-base font-bold">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-base">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="w-[120px] touch-target text-base font-bold">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {MESES_COLS.map(m => (
              <SelectItem key={m.key} value={m.key} className="text-base">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canEdit && (
          <Button variant="outline" size="sm" onClick={handleCopiarMesAnterior} className="gap-1">
            <Copy className="h-4 w-4" /> Mês anterior
          </Button>
        )}

        {isFechado && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Lock className="h-3 w-3" /> Fechado
          </Badge>
        )}
      </div>

      {/* Summary card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1">
            Valor do Rebanho — {mesLabel}/{anoFiltro}
          </p>
          <p className="text-2xl font-extrabold text-foreground">{formatMoeda(totalRebanho)}</p>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
            <span><strong className="text-foreground">{totalCabecas}</strong> cabeças</span>
            <span>Peso médio: <strong className="text-foreground">{formatNum(pesoMedioGeral, 1)} kg</strong></span>
            <span>R$/cab: <strong className="text-foreground">{formatMoeda(valorMedioCabeca)}</strong></span>
          </div>
          <div className="flex gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
            <span>R$/kg médio: <strong className="text-foreground">{precoMedioKg > 0 ? formatMoeda(precoMedioKg) : '—'}</strong></span>
            <span>R$/@ médio: <strong className="text-foreground">{precoMedioArroba > 0 ? formatMoeda(precoMedioArroba) : '—'}</strong></span>
          </div>
        </CardContent>
      </Card>

      {/* Aviso de estimativa */}
      {temEstimativa && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 border border-border">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Algumas categorias usam peso estimado (último lançamento ou saldo inicial).
            Para maior precisão, realize o fechamento de pastos do mês.
          </span>
        </div>
      )}

      {/* December warning */}
      {isDezembro && categoriasSemPreco.length > 0 && (
        <div className="flex items-start gap-2 text-xs bg-destructive/10 text-destructive rounded-md px-3 py-2 border border-destructive/30">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>Dezembro — base anual:</strong> Os preços de dezembro serão usados como referência do ano seguinte.
            {' '}{categoriasSemPreco.length} categoria(s) sem preço: {categoriasSemPreco.join(', ')}.
            Informe preço para todas as categorias para completar o fechamento anual.
          </span>
        </div>
      )}

      {isDezembro && dezembroCompleto && (
        <div className="flex items-start gap-2 text-xs text-primary bg-primary/10 rounded-md px-3 py-2 border border-primary/30">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>Base anual completa.</strong> Todas as categorias têm preço informado para dezembro.
            Esses valores serão a referência para análise "sem efeito de mercado" no ano seguinte.
          </span>
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-semibold text-foreground">Categoria</th>
              <th className="text-right px-2 py-2 font-semibold text-foreground">Qtd</th>
              <th className="text-right px-2 py-2 font-semibold text-foreground">Peso</th>
              <th className="text-center px-2 py-2 font-semibold text-foreground min-w-[90px]">R$/kg</th>
              <th className="text-right px-2 py-2 font-semibold text-foreground">R$/cab</th>
              <th className="text-right px-3 py-2 font-semibold text-foreground">Valor Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.codigo} className={`border-b ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                <td className="px-3 py-2 font-medium text-foreground">
                  {r.nome}
                  {isDezembro && r.saldo === 0 && (
                    <span className="text-[10px] text-muted-foreground ml-1">(sem saldo)</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right text-foreground font-semibold">
                  {r.saldo > 0 ? r.saldo : '-'}
                </td>
                <td className="px-2 py-2 text-right text-xs">
                  {r.pesoMedio > 0 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`cursor-help ${r.origemPeso === 'pastos' ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                          {formatNum(r.pesoMedio, 1)} kg
                          {r.origemPeso !== 'pastos' && ' *'}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Fonte: {ORIGEM_LABEL[r.origemPeso]}
                      </TooltipContent>
                    </Tooltip>
                  ) : '-'}
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-8 text-right text-sm w-full"
                    placeholder="0,00"
                    value={precosDisplay[r.codigo] ?? ''}
                    onChange={e => handlePrecoChange(r.codigo, e.target.value)}
                    disabled={!canEdit}
                  />
                </td>
                <td className="px-2 py-2 text-right text-muted-foreground text-xs">
                  {r.valorCabeca > 0 ? formatMoeda(r.valorCabeca) : '-'}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-foreground">
                  {r.valorTotal > 0 ? formatMoeda(r.valorTotal) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-primary/10">
              <td className="px-3 py-2 font-extrabold text-foreground">TOTAL</td>
              <td className="px-2 py-2 text-right font-extrabold text-foreground">{totalCabecas}</td>
              <td className="px-2 py-2 text-right text-xs text-muted-foreground">{formatNum(pesoMedioGeral, 1)} kg</td>
              <td className="px-2 py-2 text-center text-xs text-muted-foreground">
                {precoMedioKg > 0 ? `${formatNum(precoMedioKg, 2)}/kg` : ''}
              </td>
              <td className="px-2 py-2 text-right text-xs font-semibold text-foreground">{formatMoeda(valorMedioCabeca)}</td>
              <td className="px-3 py-2 text-right font-extrabold text-foreground">{formatMoeda(totalRebanho)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] text-muted-foreground">
          * Peso estimado — sem fechamento oficial no mês. Passe o dedo sobre o valor para ver a fonte.
          {isDezembro && ' • Em dezembro, informe preço para todas as categorias (base anual).'}
        </p>
        <div className="flex justify-between items-center">
          <div className="flex gap-2 items-center">
            {categoriasOcultas > 0 && !isDezembro && (
              <Button variant="ghost" size="sm" onClick={() => setMostrarZerados(!mostrarZerados)} className="gap-1 text-xs text-muted-foreground">
                {mostrarZerados ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {mostrarZerados ? 'Ocultar zeradas' : `Mostrar ${categoriasOcultas} zeradas`}
              </Button>
            )}
          </div>
          <div className="flex gap-2 ml-auto">
            {isFechado && isAdmin && (
              <Button variant="outline" size="sm" onClick={reabrirFechamento} className="gap-1">
                <Unlock className="h-4 w-4" /> Reabrir fechamento
              </Button>
            )}
            {canEdit && (
              <Button onClick={handleSalvar} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? 'Salvando...' : 'Salvar e Fechar'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
