import { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Info, AlertTriangle, CheckCircle } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { toast } from 'sonner';
import type { StatusOperacional } from '@/lib/statusOperacional';

type TipoPreco = 'por_kg' | 'por_cab' | 'por_total';

interface Parcela {
  data: string;
  valor: number;
}

interface Props {
  quantidade: number;
  pesoKg: number;
  data: string;
  categoria: string;
  statusOp: StatusOperacional;
  fazendaOrigem: string;
  notaFiscal: string;
  onNotaFiscalChange: (v: string) => void;
  /** After saving the lancamento, pass its ID here to enable financial generation */
  lancamentoId?: string;
}

function fmt(v?: number, decimals = 2) {
  if (v === undefined || v === null || isNaN(v) || v === 0) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function CompraFinanceiroPanel({
  quantidade, pesoKg, data, categoria, statusOp, fazendaOrigem, notaFiscal, onNotaFiscalChange, lancamentoId,
}: Props) {
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();

  const [tipoPreco, setTipoPreco] = useState<TipoPreco>('por_kg');
  const [precoKg, setPrecoKg] = useState('');
  const [precoCab, setPrecoCab] = useState('');
  const [valorTotal, setValorTotal] = useState('');

  const [frete, setFrete] = useState('');
  const [comissaoPct, setComissaoPct] = useState('');

  const [pagamentoOpen, setPagamentoOpen] = useState(false);
  const [formaPag, setFormaPag] = useState<'avista' | 'prazo'>('avista');
  const [qtdParcelas, setQtdParcelas] = useState('2');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);

  const [gerado, setGerado] = useState(false);
  const [gerando, setGerando] = useState(false);

  const qtd = quantidade || 0;
  const peso = pesoKg || 0;
  const totalKg = peso * qtd;

  // ===== CÁLCULOS =====
  const calc = useMemo(() => {
    let valorBase = 0;
    let rKg = 0;
    let rCab = 0;

    if (tipoPreco === 'por_kg') {
      rKg = Number(precoKg) || 0;
      valorBase = totalKg * rKg;
      rCab = qtd > 0 ? valorBase / qtd : 0;
    } else if (tipoPreco === 'por_cab') {
      rCab = Number(precoCab) || 0;
      valorBase = qtd * rCab;
      rKg = totalKg > 0 ? valorBase / totalKg : 0;
    } else {
      valorBase = Number(valorTotal) || 0;
      rKg = totalKg > 0 ? valorBase / totalKg : 0;
      rCab = qtd > 0 ? valorBase / qtd : 0;
    }

    const freteVal = Number(frete) || 0;
    const comissaoVal = valorBase * ((Number(comissaoPct) || 0) / 100);
    const totalDespesas = freteVal + comissaoVal;

    const liqTotal = valorBase + totalDespesas;
    const liqKg = totalKg > 0 ? liqTotal / totalKg : 0;
    const liqCab = qtd > 0 ? liqTotal / qtd : 0;

    return { valorBase, rKg, rCab, freteVal, comissaoVal, totalDespesas, liqTotal, liqKg, liqCab };
  }, [tipoPreco, precoKg, precoCab, valorTotal, frete, comissaoPct, totalKg, qtd]);

  // ===== PARCELAS =====
  const gerarParcelas = useCallback((n: number, base: number) => {
    const p: Parcela[] = [];
    const vp = base / n;
    for (let i = 0; i < n; i++) {
      const d = addDays(parseISO(data || format(new Date(), 'yyyy-MM-dd')), 30 * (i + 1));
      p.push({ data: format(d, 'yyyy-MM-dd'), valor: Math.round(vp * 100) / 100 });
    }
    if (p.length > 0) {
      const rest = p.slice(0, -1).reduce((s, x) => s + x.valor, 0);
      p[p.length - 1].valor = Math.round((base - rest) * 100) / 100;
    }
    return p;
  }, [data]);

  const handleQtdParcChange = (v: string) => {
    setQtdParcelas(v);
    const n = Number(v);
    if (n > 0 && calc.valorBase > 0) {
      setParcelas(gerarParcelas(n, calc.valorBase));
    }
  };

  // ===== GERAÇÃO FINANCEIRA =====
  const handleGerarFinanceiro = async () => {
    if (!lancamentoId) {
      toast.error('Salve o lançamento zootécnico antes de gerar os financeiros.');
      return;
    }
    if (!fazendaAtual || !clienteAtual) return;
    if (calc.valorBase <= 0) {
      toast.error('Preencha o valor da compra antes de gerar.');
      return;
    }

    setGerando(true);
    try {
      // Check duplicates
      const { data: existing } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id')
        .eq('movimentacao_rebanho_id', lancamentoId)
        .eq('cancelado', false)
        .limit(1);

      if (existing && existing.length > 0) {
        toast.error('Lançamentos financeiros já foram gerados para esta movimentação.');
        setGerado(true);
        return;
      }

      const statusFin = statusOp === 'previsto' ? 'previsto' : 'confirmado';
      const produtoLabel = `Compra & ${categoria}`;
      const anoMes = data.slice(0, 7);
      const inserts: any[] = [];

      // Determine subcentro based on category (female vs male)
      const FEMEAS = ['mamotes_f', 'desmama_f', 'novilhas', 'vacas'];
      const isFemea = FEMEAS.includes(categoria);
      const subcentroCompra = isFemea ? 'COMPRAS ANIMAIS/FEMEAS' : 'COMPRAS ANIMAIS/MACHOS';

      // Base record with full classification (ano_mes will be overridden per entry)
      const baseRecord = {
        cliente_id: clienteAtual.id,
        fazenda_id: fazendaAtual.id,
        tipo_operacao: '2-Saídas',
        sinal: -1,
        status_transacao: statusFin,
        origem_lancamento: 'movimentacao_rebanho',
        movimentacao_rebanho_id: lancamentoId,
        macro_custo: 'Investimento em Bovinos',
        centro_custo: 'Reposição de Bovinos',
      };

      if (formaPag === 'prazo' && parcelas.length > 0) {
        parcelas.forEach((p, i) => {
          inserts.push({
            ...baseRecord,
            ano_mes: p.data.slice(0, 7),
            subcentro: subcentroCompra,
            valor: p.valor,
            data_competencia: data,
            data_pagamento: p.data,
            descricao: `${produtoLabel} - Parcela ${i + 1}/${parcelas.length}`,
            historico: fazendaOrigem ? `Origem: ${fazendaOrigem}` : undefined,
            origem_tipo: 'compra_rebanho:parcela',
            nota_fiscal: notaFiscal || undefined,
          });
        });
      } else {
        inserts.push({
          ...baseRecord,
          subcentro: subcentroCompra,
          valor: calc.valorBase,
          data_competencia: data,
          data_pagamento: data,
          descricao: produtoLabel,
          historico: fazendaOrigem ? `Origem: ${fazendaOrigem}` : undefined,
          origem_tipo: 'compra_rebanho:parcela',
          nota_fiscal: notaFiscal || undefined,
        });
      }

      // Frete
      if (calc.freteVal > 0) {
        inserts.push({
          ...baseRecord,
          subcentro: 'FRETE COMPRA ANIMAIS',
          valor: calc.freteVal,
          data_competencia: data,
          data_pagamento: data,
          descricao: `Prev. Mov - Frete compra ${categoria}`,
          origem_tipo: 'compra_rebanho:frete',
        });
      }

      // Comissão
      if (calc.comissaoVal > 0) {
        inserts.push({
          ...baseRecord,
          subcentro: 'COMISSÃO COMPRA ANIMAIS',
          valor: calc.comissaoVal,
          data_competencia: data,
          data_pagamento: data,
          descricao: `Prev. Mov - Comissão compra ${categoria}`,
          origem_tipo: 'compra_rebanho:comissao',
        });
      }

      const { error } = await supabase.from('financeiro_lancamentos_v2').insert(inserts);
      if (error) throw error;

      setGerado(true);
      toast.success(`${inserts.length} lançamento(s) financeiro(s) gerado(s) com sucesso!`);
    } catch (err: any) {
      toast.error('Erro ao gerar lançamentos: ' + (err.message || err));
    } finally {
      setGerando(false);
    }
  };

  const isPrevisto = statusOp === 'previsto';
  const previstoInputClass = isPrevisto ? 'border-orange-400 text-orange-800 dark:text-orange-300' : '';

  return (
    <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
      <h3 className="text-[11px] font-bold uppercase text-muted-foreground tracking-wide">Detalhes Financeiros</h3>
      <Separator />

      {/* BLOCO 1 — Tipo de Compra */}
      <div className="space-y-1">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Tipo de Compra</span>
        <div className="grid grid-cols-3 gap-1">
          {([
            { value: 'por_kg' as TipoPreco, label: 'Por kg' },
            { value: 'por_cab' as TipoPreco, label: 'Por cab.' },
            { value: 'por_total' as TipoPreco, label: 'Por total' },
          ]).map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => { setTipoPreco(t.value); setPrecoKg(''); setPrecoCab(''); setValorTotal(''); }}
              className={`h-7 rounded text-[11px] font-bold border transition-all ${
                tipoPreco === t.value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted/30'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* BLOCO 2 — Preço Base */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Preço Base</span>

        {tipoPreco === 'por_kg' && (
          <div>
            <Label className="text-[11px]">R$/kg</Label>
            <Input type="number" value={precoKg} onChange={e => setPrecoKg(e.target.value)} placeholder="0,00" className={`h-8 text-[12px] ${previstoInputClass}`} />
          </div>
        )}
        {tipoPreco === 'por_cab' && (
          <div>
            <Label className="text-[11px]">R$/cab.</Label>
            <Input type="number" value={precoCab} onChange={e => setPrecoCab(e.target.value)} placeholder="0,00" className={`h-8 text-[12px] ${previstoInputClass}`} />
          </div>
        )}
        {tipoPreco === 'por_total' && (
          <div>
            <Label className="text-[11px]">Valor total (R$)</Label>
            <Input type="number" value={valorTotal} onChange={e => setValorTotal(e.target.value)} placeholder="0,00" className={`h-8 text-[12px] ${previstoInputClass}`} />
          </div>
        )}

        {calc.valorBase > 0 && (
          <div className="bg-muted/30 rounded-md p-2 space-y-0.5 text-[11px]">
            {tipoPreco !== 'por_kg' && (
              <div className="flex justify-between"><span className="text-muted-foreground">R$/kg</span><strong>R$ {fmt(calc.rKg, 4)}</strong></div>
            )}
            {tipoPreco !== 'por_cab' && (
              <div className="flex justify-between"><span className="text-muted-foreground">R$/cab.</span><strong>R$ {fmt(calc.rCab)}</strong></div>
            )}
            <div className="flex justify-between font-semibold">
              <span className="text-muted-foreground">Total base</span>
              <span>R$ {fmt(calc.valorBase)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Nota Fiscal */}
      <div>
        <Label className="text-[11px]">Nota Fiscal</Label>
        <Input value={notaFiscal} onChange={e => onNotaFiscalChange(e.target.value)} placeholder="Nº da nota" className="h-8 text-[12px]" />
      </div>

      <Separator />

      {/* BLOCO 3 — Despesas Extras */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Despesas Extras</span>
        <div>
          <Label className="text-[11px]">Frete total (R$)</Label>
          <Input type="number" value={frete} onChange={e => setFrete(e.target.value)} placeholder="0,00" className={`h-8 text-[12px] ${previstoInputClass}`} />
        </div>
        <div>
          <Label className="text-[11px]">Comissão (%)</Label>
          <Input type="number" value={comissaoPct} onChange={e => setComissaoPct(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} />
        </div>
        {calc.comissaoVal > 0 && (
          <div className="flex justify-between text-[11px] px-1">
            <span className="text-muted-foreground">Comissão (R$)</span>
            <strong>R$ {fmt(calc.comissaoVal)}</strong>
          </div>
        )}
        {calc.totalDespesas > 0 && (
          <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md p-2 flex justify-between text-[11px] font-bold">
            <span className="text-orange-700 dark:text-orange-400">Total despesas</span>
            <span className="text-orange-800 dark:text-orange-300">R$ {fmt(calc.totalDespesas)}</span>
          </div>
        )}
      </div>

      <Separator />

      {/* BLOCO 4 — Valor Líquido */}
      {calc.valorBase > 0 && (
        <div className={`rounded-md p-2 ${isPrevisto ? 'bg-orange-200/50 dark:bg-orange-950/50' : 'bg-primary/10'}`}>
          <div className="flex justify-between text-[12px] font-bold">
            <span>Valor total líquido</span>
            <span className={isPrevisto ? 'text-orange-800 dark:text-orange-300' : 'text-primary'}>R$ {fmt(calc.liqTotal)}</span>
          </div>
          <div className="flex justify-between text-[11px] mt-0.5">
            <span className="text-muted-foreground">R$/kg líq.</span>
            <strong>R$ {fmt(calc.liqKg, 4)}</strong>
          </div>
          <div className="flex justify-between text-[11px] mt-0.5">
            <span className="text-muted-foreground">R$/cab. líq.</span>
            <strong>R$ {fmt(calc.liqCab)}</strong>
          </div>
        </div>
      )}

      <Separator />

      {/* BLOCO 5 — Informações de Pagamento (colapsado) */}
      <Collapsible open={pagamentoOpen} onOpenChange={setPagamentoOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full text-[10px] font-bold uppercase text-muted-foreground tracking-wide py-1 hover:text-foreground transition-colors">
          Informações de Pagamento
          {pagamentoOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1.5 pt-1">
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => { setFormaPag('avista'); setParcelas([]); }}
              className={`h-7 rounded text-[11px] font-bold border-2 transition-all ${formaPag === 'avista' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
              À vista
            </button>
            <button type="button" onClick={() => { setFormaPag('prazo'); if (calc.valorBase > 0) setParcelas(gerarParcelas(Number(qtdParcelas) || 2, calc.valorBase)); }}
              className={`h-7 rounded text-[11px] font-bold border-2 transition-all ${formaPag === 'prazo' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
              A prazo
            </button>
          </div>

          {formaPag === 'prazo' && (
            <div className="space-y-1.5">
              <div>
                <Label className="text-[11px]">Quantidade de parcelas</Label>
                <Input type="number" min="2" max="48" value={qtdParcelas} onChange={e => handleQtdParcChange(e.target.value)} className="h-7 text-[11px]" />
              </div>
              <p className="text-[9px] text-muted-foreground">Parcelas calculadas sobre o valor base (sem frete/comissão)</p>
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-2 gap-1 bg-muted/30 rounded p-1.5">
                  <div>
                    <Label className="text-[10px]">Parcela {i + 1}</Label>
                    <Input type="date" value={p.data} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], data: e.target.value }; setParcelas(np); }} className="h-7 text-[10px]" />
                  </div>
                  <div>
                    <Label className="text-[10px]">R$</Label>
                    <Input type="number" value={String(p.valor)} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], valor: Number(e.target.value) || 0 }; setParcelas(np); }} className="h-7 text-[10px]" />
                  </div>
                </div>
              ))}
              {parcelas.length > 0 && (
                <div className="text-[10px] text-muted-foreground text-right">
                  Soma: R$ {fmt(parcelas.reduce((s, p) => s + p.valor, 0))}
                </div>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      {/* BLOCO SUGESTÕES FINANCEIRAS */}
      {calc.valorBase > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">Sugestões financeiras da movimentação</span>

          <div className="bg-muted/30 rounded-md p-2 space-y-1 text-[10px]">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Info className="h-3 w-3" />
              <span>Os lançamentos abaixo serão sugeridos:</span>
            </div>
            {formaPag === 'prazo' && parcelas.length > 0 ? (
              parcelas.map((p, i) => (
                <div key={i} className="flex justify-between text-[10px]">
                  <span>Parcela {i + 1}/{parcelas.length} — {format(parseISO(p.data), 'dd/MM/yyyy')}</span>
                  <span className="font-semibold">R$ {fmt(p.valor)}</span>
                </div>
              ))
            ) : (
              <div className="flex justify-between text-[10px]">
                <span>Pagamento único</span>
                <span className="font-semibold">R$ {fmt(calc.valorBase)}</span>
              </div>
            )}
            {calc.freteVal > 0 && (
              <div className="flex justify-between text-[10px]">
                <span>Frete</span>
                <span className="font-semibold">R$ {fmt(calc.freteVal)}</span>
              </div>
            )}
            {calc.comissaoVal > 0 && (
              <div className="flex justify-between text-[10px]">
                <span>Comissão</span>
                <span className="font-semibold">R$ {fmt(calc.comissaoVal)}</span>
              </div>
            )}
          </div>

          {gerado ? (
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-md p-2 border border-green-200 dark:border-green-800">
              <CheckCircle className="h-3.5 w-3.5" />
              Lançamentos financeiros já gerados
            </div>
          ) : (
            <>
              {!lancamentoId && (
                <div className="flex items-center gap-1 text-[10px] text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="h-3 w-3" />
                  Salve o lançamento zootécnico primeiro
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-8 text-[11px] font-bold"
                disabled={!lancamentoId || gerando}
                onClick={handleGerarFinanceiro}
              >
                {gerando ? 'Gerando...' : 'Gerar lançamentos no financeiro'}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
