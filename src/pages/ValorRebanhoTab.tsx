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
import { usePrecoMercado } from '@/hooks/usePrecoMercado';
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

/**
 * Mapeamento categoria → preço de mercado
 * bloco + categoria conforme tela Preço de Mercado
 * unidade: 'kg' = já em R$/kg; 'arroba' = R$/@ (converter dividindo por 15)
 */
const MAPA_PRECO_MERCADO: Record<string, { bloco: string; categoria: string; unidade: 'kg' | 'arroba' }> = {
  mamotes_m: { bloco: 'magro_macho', categoria: '200 kg média', unidade: 'kg' },
  desmama_m: { bloco: 'magro_macho', categoria: '200 kg média', unidade: 'kg' },
  garrotes:  { bloco: 'magro_macho', categoria: 'Garrotes 350 kg média', unidade: 'kg' },
  bois:      { bloco: 'frigorifico', categoria: 'Boi Gordo', unidade: 'arroba' },
  touros:    { bloco: 'frigorifico', categoria: 'Vaca', unidade: 'arroba' },
  mamotes_f: { bloco: 'magro_femea', categoria: '200 kg média', unidade: 'kg' },
  desmama_f: { bloco: 'magro_femea', categoria: '200 kg média', unidade: 'kg' },
  novilhas:  { bloco: 'frigorifico', categoria: 'Novilha', unidade: 'arroba' },
  vacas:     { bloco: 'frigorifico', categoria: 'Vaca', unidade: 'arroba' },
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

  const [anoFiltro, setAnoFiltro] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const mesAtual = filtroMesInicial ? String(filtroMesInicial).padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0');
  const [mesFiltro, setMesFiltro] = useState(mesAtual);

  useEffect(() => {
    if (filtroAnoInicial) setAnoFiltro(filtroAnoInicial);
    if (filtroMesInicial) setMesFiltro(String(filtroMesInicial).padStart(2, '0'));
  }, [filtroAnoInicial, filtroMesInicial]);
  const [mostrarZerados, setMostrarZerados] = useState(false);

  const anoMes = `${anoFiltro}-${mesFiltro}`;
  const isDezembro = mesFiltro === '12';

  const {
    precos, loading, saving, salvarPrecos, loadPrecosMesAnterior,
    isFechado, isAdmin, reabrirFechamento,
  } = useValorRebanho(anoMes);

  // Preço de mercado do mês
  const { itens: precosMercado, isValidado: mercadoValidado } = usePrecoMercado(anoMes);

  // Build a lookup: codigo → R$/kg sugerido
  const precosSugeridos = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(MAPA_PRECO_MERCADO).forEach(([codigo, ref]) => {
      const item = precosMercado.find(p => p.bloco === ref.bloco && p.categoria === ref.categoria);
      if (!item || item.valor <= 0) return;
      // Ajuste de ágio
      const valorComAgio = item.valor * (1 + (item.agio_perc || 0) / 100);
      if (ref.unidade === 'arroba') {
        // R$/@ → R$/kg: dividir por 15
        map[codigo] = valorComAgio / 15;
      } else {
        map[codigo] = valorComAgio;
      }
    });
    return map;
  }, [precosMercado]);

  const [precosLocal, setPrecosLocal] = useState<Record<string, number>>({});
  const [precosDisplay, setPrecosDisplay] = useState<Record<string, string>>({});
  const [sugestaoAplicada, setSugestaoAplicada] = useState(false);

  // --- BASE OFICIAL: useFechamentoCategoria ---
  const resumoOficial = useFechamentoCategoria(
    fazendaId,
    Number(anoFiltro),
    Number(mesFiltro),
    lancamentos,
    saldosIniciais,
    categorias,
  );

  // Track which categories are using suggested prices
  const categoriasComSugestao = useMemo(() => {
    const set = new Set<string>();
    Object.keys(precosSugeridos).forEach(codigo => {
      const temPrecoSalvo = precos.some(p => p.categoria === codigo && p.preco_kg > 0);
      const precoAtual = precosLocal[codigo];
      const sugerido = precosSugeridos[codigo];
      if (!temPrecoSalvo && sugerido > 0 && precoAtual === sugerido) {
        set.add(codigo);
      }
    });
    return set;
  }, [precosSugeridos, precos, precosLocal]);

  const temSugestao = categoriasComSugestao.size > 0;

  // Build rows from official source
  const allRows = useMemo(() => {
    return resumoOficial.rows.map(row => {
      const precoKg = precosLocal[row.categoriaCodigo] ?? 0;
      const valorTotal = row.quantidadeFinal * (row.pesoMedioFinalKg || 0) * precoKg;
      const valorCabeca = row.quantidadeFinal > 0 && row.pesoMedioFinalKg && precoKg > 0
        ? row.pesoMedioFinalKg * precoKg
        : 0;
      const arrobasLinha = row.quantidadeFinal * (row.pesoMedioFinalKg || 0) / 30;
      const precoArroba = arrobasLinha > 0 ? valorTotal / arrobasLinha : 0;
      return {
        categoriaId: row.categoriaId,
        codigo: row.categoriaCodigo,
        nome: row.categoriaNome,
        saldo: row.quantidadeFinal,
        pesoMedio: row.pesoMedioFinalKg || 0,
        origemPeso: row.origemPeso,
        precoKg,
        valorCabeca,
        precoArroba,
        valorTotal,
        isSugerido: categoriasComSugestao.has(row.categoriaCodigo),
      };
    });
  }, [resumoOficial.rows, precosLocal, categoriasComSugestao]);

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

  const totalArrobas = useMemo(() => allRows.reduce((sum, r) => sum + (r.saldo * r.pesoMedio / 30), 0), [allRows]);
  const precoMedioArroba = totalArrobas > 0 ? totalRebanho / totalArrobas : 0;
  const mesLabel = MESES_COLS.find(m => m.key === mesFiltro)?.label || mesFiltro;

  const categoriasSemPreco = useMemo(() => {
    if (!isDezembro) return [];
    return allRows.filter(r => r.precoKg <= 0).map(r => r.nome);
  }, [allRows, isDezembro]);

  const dezembroCompleto = isDezembro && categoriasSemPreco.length === 0;

  // Sync loaded prices to local state + apply market suggestions for empty ones
  const fmtKg = (v: number) => v.toFixed(2).replace('.', ',');

  useEffect(() => {
    const numMap: Record<string, number> = {};
    const strMap: Record<string, string> = {};
    precos.forEach(p => {
      const v = Number(p.preco_kg) || 0;
      numMap[p.categoria] = v;
      strMap[p.categoria] = v > 0 ? fmtKg(v) : '0,00';
    });

    // Auto-fill suggestions for categories without saved price
    let aplicouSugestao = false;
    Object.entries(precosSugeridos).forEach(([codigo, valor]) => {
      if (!numMap[codigo] || numMap[codigo] <= 0) {
        const v = Number(valor.toFixed(4));
        numMap[codigo] = v;
        strMap[codigo] = v > 0 ? fmtKg(v) : '0,00';
        aplicouSugestao = true;
      }
    });

    setPrecosLocal(numMap);
    setPrecosDisplay(strMap);
    setSugestaoAplicada(aplicouSugestao);
  }, [precos, precosSugeridos]);

  const handlePrecoChange = (codigo: string, value: string) => {
    const sanitized = value.replace(/[^0-9.,]/g, '');
    setPrecosDisplay(prev => ({ ...prev, [codigo]: sanitized }));
    const num = parseFloat(sanitized.replace(',', '.'));
    setPrecosLocal(prev => ({ ...prev, [codigo]: isNaN(num) ? 0 : num }));
  };

  const handlePrecoBlur = (codigo: string) => {
    const num = precosLocal[codigo] || 0;
    setPrecosDisplay(prev => ({ ...prev, [codigo]: fmtKg(num) }));
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
    <div className="p-3 max-w-4xl mx-auto space-y-2 animate-fade-in pb-20">
      {/* Filtros */}
      <div className="flex gap-1.5 items-center flex-wrap">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="w-20 h-7 text-xs font-bold">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="w-24 h-7 text-xs font-bold">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {MESES_COLS.map(m => (
              <SelectItem key={m.key} value={m.key} className="text-sm">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canEdit && (
          <Button variant="outline" size="sm" onClick={handleCopiarMesAnterior} className="gap-1 h-7 text-xs px-2">
            <Copy className="h-3 w-3" /> Mês anterior
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

      {/* Aviso de sugestão de mercado */}
      {temSugestao && (
        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2 border border-amber-200 dark:border-amber-800">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>Preço de mercado sugerido.</strong> O valor só será considerado definitivo após validação do fechamento do valor do rebanho.
          </span>
        </div>
      )}

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
              <th className="text-left px-2 py-1.5 font-semibold text-foreground text-xs">Categoria</th>
              <th className="text-right px-2 py-1.5 font-semibold text-foreground text-xs">Qtd</th>
              <th className="text-right px-2 py-1.5 font-semibold text-foreground text-xs">Peso</th>
              <th className="text-center px-1 py-1.5 font-semibold text-foreground text-xs w-[55px]">R$/kg</th>
              <th className="text-right px-2 py-1.5 font-semibold text-foreground text-xs">R$/cab</th>
              <th className="text-right px-2 py-1.5 font-semibold text-foreground text-xs">R$/@</th>
              <th className="text-right px-2 py-1.5 font-semibold text-foreground text-xs">Valor Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.codigo} className={`border-b ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                <td className="px-2 py-1 font-medium text-foreground text-xs whitespace-nowrap">
                  {r.nome}
                  {isDezembro && r.saldo === 0 && (
                    <span className="text-[10px] text-muted-foreground ml-1">(0)</span>
                  )}
                </td>
                <td className="px-2 py-1 text-right text-foreground font-semibold text-xs">
                  {r.saldo > 0 ? r.saldo : '-'}
                </td>
                <td className="px-2 py-1 text-right text-[11px]">
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
                <td className="px-1 py-0.5 w-[55px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative">
                        <Input
                          type="text"
                          inputMode="decimal"
                          className={`h-6 text-right text-[11px] px-1 w-full ${r.isSugerido ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20' : ''}`}
                          placeholder="0,00"
                          value={precosDisplay[r.codigo] !== undefined ? precosDisplay[r.codigo] : fmtKg(r.precoKg)}
                          onChange={e => handlePrecoChange(r.codigo, e.target.value)}
                          onBlur={() => handlePrecoBlur(r.codigo)}
                          disabled={!canEdit}
                        />
                      </div>
                    </TooltipTrigger>
                    {r.isSugerido && (
                      <TooltipContent side="top" className="text-xs max-w-[200px]">
                        Preço sugerido pelo mercado. Edite se necessário.
                      </TooltipContent>
                    )}
                  </Tooltip>
                </td>
                <td className="px-2 py-1 text-right text-muted-foreground text-[11px]">
                  {r.valorCabeca > 0 ? formatMoeda(r.valorCabeca) : '-'}
                </td>
                <td className="px-2 py-1 text-right text-muted-foreground text-[11px]">
                  {r.precoArroba > 0 ? formatMoeda(r.precoArroba) : '-'}
                </td>
                <td className="px-2 py-1 text-right font-semibold text-foreground text-xs">
                  {r.valorTotal > 0 ? formatMoeda(r.valorTotal) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-primary/10">
              <td className="px-2 py-1.5 font-extrabold text-foreground text-xs">TOTAL</td>
              <td className="px-2 py-1.5 text-right font-extrabold text-foreground text-xs">{totalCabecas}</td>
              <td className="px-2 py-1.5 text-right text-[11px] text-muted-foreground">{formatNum(pesoMedioGeral, 1)} kg</td>
              <td className="px-1 py-1.5 text-center text-[11px] text-muted-foreground w-[55px]">
                {precoMedioKg > 0 ? `${formatNum(precoMedioKg, 2)}` : ''}
              </td>
              <td className="px-2 py-1.5 text-right text-[11px] font-semibold text-foreground">{formatMoeda(valorMedioCabeca)}</td>
              <td className="px-2 py-1.5 text-right text-[11px] font-semibold text-foreground">{precoMedioArroba > 0 ? formatMoeda(precoMedioArroba) : '-'}</td>
              <td className="px-2 py-1.5 text-right font-extrabold text-foreground text-xs">{formatMoeda(totalRebanho)}</td>
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

      {/* Return button */}
      {onBack && (
        <button
          onClick={onBack}
          className="w-full flex items-center justify-center gap-1 text-sm font-bold text-primary bg-primary/10 rounded-lg py-2.5 transition-colors hover:bg-primary/20"
        >
          <ArrowLeft className="h-4 w-4" /> Retornar ao Resumo Zootécnico
        </button>
      )}
    </div>
  );
}
