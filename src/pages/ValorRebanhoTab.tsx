import { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, Copy, Eye, EyeOff, Info, Lock, Unlock, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { useValorRebanho } from '@/hooks/useValorRebanho';
import { usePrecoMercado } from '@/hooks/usePrecoMercado';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';
import { toast } from 'sonner';
import { useFechamentoCategoria, type OrigemPeso } from '@/hooks/useFechamentoCategoria';
import { useStatusZootecnico } from '@/hooks/useStatusZootecnico';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack?: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

const ORIGEM_LABEL: Record<OrigemPeso, string> = {
  pastos: 'Fechamento do mês',
  lancamento: 'Último lançamento',
  saldo_inicial: 'Saldo inicial do ano',
  sem_base: 'Sem dados',
};

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

const MESES_SHORT = [
  { key: '01', label: 'Jan' }, { key: '02', label: 'Fev' }, { key: '03', label: 'Mar' },
  { key: '04', label: 'Abr' }, { key: '05', label: 'Mai' }, { key: '06', label: 'Jun' },
  { key: '07', label: 'Jul' }, { key: '08', label: 'Ago' }, { key: '09', label: 'Set' },
  { key: '10', label: 'Out' }, { key: '11', label: 'Nov' }, { key: '12', label: 'Dez' },
];

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

  const statusZoo = useStatusZootecnico(fazendaId, Number(anoFiltro), Number(mesFiltro), lancamentos, saldosIniciais);
  const categoriasStatus = statusZoo.pendencias.find(p => p.id === 'categorias');
  const categoriasConciliadas = categoriasStatus?.status === 'fechado';
  const bloqueadoPorConciliacao = !categoriasConciliadas && !isGlobal && !statusZoo.loading;

  const {
    precos, loading, saving, salvarPrecos, loadPrecosMesAnterior,
    isFechado, isAdmin, reabrirFechamento,
  } = useValorRebanho(anoMes);

  const { itens: precosMercado, isValidado: mercadoValidado } = usePrecoMercado(anoMes);

  const precosSugeridos = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(MAPA_PRECO_MERCADO).forEach(([codigo, ref]) => {
      const item = precosMercado.find(p => p.bloco === ref.bloco && p.categoria === ref.categoria);
      if (!item || item.valor <= 0) return;
      const valorComAgio = item.valor * (1 + (item.agio_perc || 0) / 100);
      if (ref.unidade === 'arroba') {
        map[codigo] = valorComAgio / 30;
      } else {
        map[codigo] = valorComAgio;
      }
    });
    return map;
  }, [precosMercado]);

  const [precosLocal, setPrecosLocal] = useState<Record<string, number>>({});
  const [precosDisplay, setPrecosDisplay] = useState<Record<string, string>>({});
  const [sugestaoAplicada, setSugestaoAplicada] = useState(false);

  const resumoOficial = useFechamentoCategoria(
    fazendaId, Number(anoFiltro), Number(mesFiltro), lancamentos, saldosIniciais, categorias,
  );

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

  const allRows = useMemo(() => {
    return resumoOficial.rows.map(row => {
      const precoKg = precosLocal[row.categoriaCodigo] ?? 0;
      const valorTotal = row.quantidadeFinal * (row.pesoMedioFinalKg || 0) * precoKg;
      const valorCabeca = row.quantidadeFinal > 0 && row.pesoMedioFinalKg && precoKg > 0
        ? row.pesoMedioFinalKg * precoKg : 0;
      const arrobasLinha = row.quantidadeFinal * (row.pesoMedioFinalKg || 0) / 30;
      const precoArroba = arrobasLinha > 0 ? valorTotal / arrobasLinha : 0;
      return {
        categoriaId: row.categoriaId, codigo: row.categoriaCodigo, nome: row.categoriaNome,
        saldo: row.quantidadeFinal, pesoMedio: row.pesoMedioFinalKg || 0,
        origemPeso: row.origemPeso, precoKg, valorCabeca, precoArroba, valorTotal,
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

  const fmtKg = (v: number) => v.toFixed(2).replace('.', ',');

  useEffect(() => {
    const numMap: Record<string, number> = {};
    const strMap: Record<string, string> = {};
    precos.forEach(p => {
      const v = Number(p.preco_kg) || 0;
      numMap[p.categoria] = v;
      strMap[p.categoria] = v > 0 ? fmtKg(v) : '0,00';
    });
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
    if (bloqueadoPorConciliacao) {
      toast.error('Não é possível salvar. Existem categorias desconciliadas entre Pasto e Sistema.');
      return;
    }
    const items = Object.entries(precosLocal).map(([categoria, preco_kg]) => ({ categoria, preco_kg }));
    await salvarPrecos(items, totalRebanho);
  };

  const handleCopiarMesAnterior = async () => {
    const prev = await loadPrecosMesAnterior();
    if (prev.length === 0) { toast.info('Nenhum preço encontrado no mês anterior'); return; }
    const numMap: Record<string, number> = { ...precosLocal };
    const strMap: Record<string, string> = { ...precosDisplay };
    prev.forEach(p => {
      const v = Number(p.preco_kg) || 0;
      numMap[p.categoria] = v;
      strMap[p.categoria] = fmtKg(v);
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
    <div className="p-2 w-full space-y-1.5 animate-fade-in pb-16">
      {/* Bloqueio por conciliação */}
      {bloqueadoPorConciliacao && (
        <Alert variant="destructive" className="border-destructive/50 py-1.5">
          <ShieldAlert className="h-3.5 w-3.5" />
          <AlertDescription className="text-[11px] font-medium">
            Fechamento bloqueado: existem divergências na Conciliação de Categorias.
            {categoriasStatus?.descricao && ` (${categoriasStatus.descricao})`}
          </AlertDescription>
        </Alert>
      )}

      {/* Ano filter + actions */}
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

        <div className="ml-auto flex gap-1.5">
          {isFechado && isAdmin && (
            <Button variant="outline" size="sm" onClick={reabrirFechamento} className="gap-1 h-7 text-xs px-2">
              <Unlock className="h-3 w-3" /> Reabrir
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={handleSalvar} disabled={saving || bloqueadoPorConciliacao} className="gap-1 h-7 text-xs px-3">
              <Save className="h-3 w-3" />
              {bloqueadoPorConciliacao ? 'Bloqueado' : saving ? 'Salvando...' : 'Salvar e Fechar'}
            </Button>
          )}
        </div>
      </div>

      {/* Month bar */}
      <div className="flex gap-0.5 bg-muted/30 rounded-md p-0.5 border">
        {MESES_SHORT.map(m => (
          <button
            key={m.key}
            onClick={() => setMesFiltro(m.key)}
            className={`flex-1 text-center text-[11px] font-semibold py-1 rounded transition-colors
              ${mesFiltro === m.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Alerts row — compact */}
      {(temSugestao || temEstimativa || (isDezembro && categoriasSemPreco.length > 0) || (isDezembro && dezembroCompleto)) && (
        <div className="space-y-1">
          {temSugestao && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1 border border-amber-200 dark:border-amber-800">
              <Info className="h-3 w-3 shrink-0" />
              <span><strong>Preço de mercado sugerido.</strong> Valor definitivo após validação do fechamento.</span>
            </div>
          )}
          {temEstimativa && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/40 rounded px-2 py-1 border border-border">
              <Info className="h-3 w-3 shrink-0" />
              <span>Algumas categorias usam peso estimado (último lançamento ou saldo inicial).</span>
            </div>
          )}
          {isDezembro && categoriasSemPreco.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] bg-destructive/10 text-destructive rounded px-2 py-1 border border-destructive/30">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span><strong>Dezembro — base anual:</strong> {categoriasSemPreco.length} categoria(s) sem preço: {categoriasSemPreco.join(', ')}.</span>
            </div>
          )}
          {isDezembro && dezembroCompleto && (
            <div className="flex items-center gap-1.5 text-[11px] text-primary bg-primary/10 rounded px-2 py-1 border border-primary/30">
              <Info className="h-3 w-3 shrink-0" />
              <span><strong>Base anual completa.</strong> Todas as categorias têm preço informado para dezembro.</span>
            </div>
          )}
        </div>
      )}

      {/* Main content: table left (60%) + summary card right (40%) */}
      <div className="flex gap-2 items-start">
        {/* LEFT — Table */}
        <div className="flex-[3] min-w-0 bg-card rounded-lg shadow-sm border overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">Categoria</th>
                <th className="text-right px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">Qtd</th>
                <th className="text-right px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">Peso</th>
                <th className="text-center px-1 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider w-[60px]">R$/kg</th>
                <th className="text-right px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">R$/@</th>
                <th className="text-right px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">R$/cab</th>
                <th className="text-right px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.codigo} className={`border-b ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                  <td className="px-1.5 py-0.5 font-medium text-foreground text-[11px] whitespace-nowrap">
                    {r.nome}
                    {isDezembro && r.saldo === 0 && <span className="text-[9px] text-muted-foreground ml-1">(0)</span>}
                  </td>
                  <td className="px-1.5 py-0.5 text-right text-foreground font-semibold tabular-nums">
                    {r.saldo > 0 ? r.saldo : '-'}
                  </td>
                  <td className="px-1.5 py-0.5 text-right tabular-nums">
                    {r.pesoMedio > 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`cursor-help ${r.origemPeso === 'pastos' ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                            {formatNum(r.pesoMedio, 1)}
                            {r.origemPeso !== 'pastos' && ' *'}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          Fonte: {ORIGEM_LABEL[r.origemPeso]}
                        </TooltipContent>
                      </Tooltip>
                    ) : '-'}
                  </td>
                  <td className="px-0.5 py-0.5 w-[60px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className={`h-5 text-right !text-[10px] leading-none font-normal tabular-nums px-1 w-full ${r.isSugerido ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20' : ''}`}
                          placeholder="0,00"
                          value={precosDisplay[r.codigo] !== undefined ? precosDisplay[r.codigo] : fmtKg(r.precoKg)}
                          onChange={e => handlePrecoChange(r.codigo, e.target.value)}
                          onBlur={() => handlePrecoBlur(r.codigo)}
                          disabled={!canEdit}
                        />
                      </TooltipTrigger>
                      {r.isSugerido && (
                        <TooltipContent side="top" className="text-xs max-w-[200px]">
                          Preço sugerido pelo mercado. Edite se necessário.
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </td>
                  <td className="px-1.5 py-0.5 text-right text-muted-foreground tabular-nums">
                    {r.precoArroba > 0 ? formatMoeda(r.precoArroba) : '-'}
                  </td>
                  <td className="px-1.5 py-0.5 text-right text-muted-foreground tabular-nums">
                    {r.valorCabeca > 0 ? formatMoeda(r.valorCabeca) : '-'}
                  </td>
                  <td className="px-1.5 py-0.5 text-right font-semibold text-foreground tabular-nums">
                    {r.valorTotal > 0 ? formatMoeda(r.valorTotal) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-primary/10">
                <td className="px-1.5 py-1 font-extrabold text-foreground text-[11px]">TOTAL</td>
                <td className="px-1.5 py-1 text-right font-extrabold text-foreground tabular-nums">{totalCabecas}</td>
                <td className="px-1.5 py-1 text-right text-muted-foreground tabular-nums">{formatNum(pesoMedioGeral, 1)}</td>
                <td className="px-1 py-1 text-center text-muted-foreground tabular-nums w-[60px]">
                  {precoMedioKg > 0 ? formatNum(precoMedioKg, 2) : ''}
                </td>
                <td className="px-1.5 py-1 text-right font-semibold text-foreground tabular-nums">{precoMedioArroba > 0 ? formatMoeda(precoMedioArroba) : '-'}</td>
                <td className="px-1.5 py-1 text-right font-semibold text-foreground tabular-nums">{formatMoeda(valorMedioCabeca)}</td>
                <td className="px-1.5 py-1 text-right font-extrabold text-foreground tabular-nums">{formatMoeda(totalRebanho)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Footer inside table area */}
          <div className="flex items-center justify-between px-1.5 py-1 border-t">
            <div className="flex items-center gap-1">
              {categoriasOcultas > 0 && !isDezembro && (
                <Button variant="ghost" size="sm" onClick={() => setMostrarZerados(!mostrarZerados)} className="gap-1 text-[10px] text-muted-foreground h-5 px-1">
                  {mostrarZerados ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {mostrarZerados ? 'Ocultar zeradas' : `+${categoriasOcultas} zeradas`}
                </Button>
              )}
            </div>
            <p className="text-[9px] text-muted-foreground">
              * Peso estimado
              {isDezembro && ' • Dez = base anual'}
            </p>
          </div>
        </div>

        {/* RIGHT — Summary Card */}
        <div className="flex-[2] min-w-[200px] max-w-[320px]">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-0.5">
                Valor do Rebanho — {mesLabel}/{anoFiltro}
              </p>
              <p className="text-xl font-extrabold text-foreground leading-tight">{formatMoeda(totalRebanho)}</p>

              <div className="mt-2 space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cabeças</span>
                  <span className="font-bold text-foreground tabular-nums">{formatNum(totalCabecas)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Peso médio</span>
                  <span className="font-semibold text-foreground tabular-nums">{formatNum(pesoMedioGeral, 1)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">R$/@ médio</span>
                  <span className="font-semibold text-foreground tabular-nums">{precoMedioArroba > 0 ? formatMoeda(precoMedioArroba) : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">R$/cab</span>
                  <span className="font-semibold text-foreground tabular-nums">{formatMoeda(valorMedioCabeca)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
