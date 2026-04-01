import { useState, useMemo, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronUp, Info, AlertTriangle, CheckCircle, Plus } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { toast } from 'sonner';
import type { StatusOperacional } from '@/lib/statusOperacional';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { NovoFornecedorDialog } from '@/components/financeiro-v2/NovoFornecedorDialog';
import { CATEGORIAS } from '@/types/cattle';

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
  /** 'create' = new purchase flow, 'update' = recalculate existing financial */
  mode?: 'create' | 'update';
  /** Called after financial records are successfully updated (in update mode) */
  onFinanceiroUpdated?: () => void;
}

function fmt(v?: number, decimals = 2) {
  if (v === undefined || v === null || isNaN(v) || v === 0) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function CompraFinanceiroPanel({
  quantidade, pesoKg, data, categoria, statusOp, fazendaOrigem, notaFiscal, onNotaFiscalChange, lancamentoId, mode = 'create', onFinanceiroUpdated,
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
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);
  const [existingCount, setExistingCount] = useState(0);
  const [existingLoaded, setExistingLoaded] = useState(false);

  // Fornecedor state
  const [fornecedorId, setFornecedorId] = useState<string>('');
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [novoFornecedorOpen, setNovoFornecedorOpen] = useState(false);
  const [origemSugestao, setOrigemSugestao] = useState<'encontrado' | 'criar' | null>(null);
  const [origemSugestaoDescartada, setOrigemSugestaoDescartada] = useState(false);

  useEffect(() => {
    if (!clienteAtual) return;
    supabase
      .from('financeiro_fornecedores')
      .select('id, nome')
      .eq('cliente_id', clienteAtual.id)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => {
        if (data) setFornecedores(data);
      });
  }, [clienteAtual]);

  // Load existing financial records in update mode and pre-fill fields
  useEffect(() => {
    if (mode !== 'update' || !lancamentoId) { setExistingLoaded(true); return; }
    supabase
      .from('financeiro_lancamentos_v2')
      .select('id, valor, data_competencia, data_pagamento, descricao, origem_tipo, favorecido_id, nota_fiscal')
      .eq('movimentacao_rebanho_id', lancamentoId)
      .eq('cancelado', false)
      .order('data_pagamento', { ascending: true })
      .then(({ data: records }) => {
        const recs = records || [];
        setExistingCount(recs.length);
        setExistingLoaded(true);

        if (recs.length === 0) return;

        // Separate by origin type
        const parcelaRecs = recs.filter(r => r.origem_tipo?.includes('parcela'));
        const freteRec = recs.find(r => r.origem_tipo?.includes('frete'));
        const comissaoRec = recs.find(r => r.origem_tipo?.includes('comissao'));

        // Calculate total purchase value from parcelas
        const totalParcelas = parcelaRecs.reduce((s, r) => s + (r.valor || 0), 0);

        if (totalParcelas > 0) {
          setTipoPreco('por_total');
          setValorTotal(String(totalParcelas));
        }

        // Set frete
        if (freteRec && freteRec.valor > 0) {
          setFrete(String(freteRec.valor));
        }

        // Set comissão (reverse calculate percentage)
        if (comissaoRec && comissaoRec.valor > 0 && totalParcelas > 0) {
          const pct = (comissaoRec.valor / totalParcelas) * 100;
          setComissaoPct(String(Math.round(pct * 100) / 100));
        }

        // Set parcelas if more than 1
        if (parcelaRecs.length > 1) {
          setFormaPag('prazo');
          setPagamentoOpen(true);
          setQtdParcelas(String(parcelaRecs.length));
          setParcelas(parcelaRecs.map(r => ({
            data: r.data_pagamento || r.data_competencia,
            valor: r.valor,
          })));
        }

        // Set fornecedor
        const favId = recs[0]?.favorecido_id;
        if (favId && !fornecedorId) {
          setFornecedorId(favId as string);
        }

        // Set nota fiscal
        const nf = parcelaRecs[0]?.nota_fiscal;
        if (nf && !notaFiscal) {
          onNotaFiscalChange(nf as string);
        }
      });
  }, [mode, lancamentoId]);

  // Auto-suggest fornecedor based on fazendaOrigem
  useEffect(() => {
    if (!fazendaOrigem?.trim() || origemSugestaoDescartada) {
      setOrigemSugestao(null);
      return;
    }
    const nomeNorm = fazendaOrigem.trim().toLowerCase();
    const match = fornecedores.find(f => f.nome.toLowerCase() === nomeNorm);
    if (match) {
      if (!fornecedorId) {
        setFornecedorId(match.id);
        setOrigemSugestao('encontrado');
        setTimeout(() => setOrigemSugestao(null), 3000);
      } else {
        setOrigemSugestao(null);
      }
    } else if (fazendaOrigem.trim().length >= 3) {
      setOrigemSugestao('criar');
    } else {
      setOrigemSugestao(null);
    }
  }, [fazendaOrigem, fornecedores, fornecedorId, origemSugestaoDescartada]);

  // Reset descartada flag when origem changes
  useEffect(() => {
    setOrigemSugestaoDescartada(false);
  }, [fazendaOrigem]);

  const handleCriarFornecedorFromOrigem = async () => {
    if (!clienteAtual || !fazendaAtual || !fazendaOrigem?.trim()) return;
    const nome = fazendaOrigem.trim();
    const { data, error } = await supabase
      .from('financeiro_fornecedores')
      .insert({
        cliente_id: clienteAtual.id,
        fazenda_id: fazendaAtual.id,
        nome,
      })
      .select('id, nome')
      .single();
    if (error) { toast.error('Erro ao criar fornecedor'); return; }
    if (data) {
      setFornecedores(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
      setFornecedorId(data.id);
      setOrigemSugestao(null);
      toast.success(`Fornecedor "${data.nome}" criado e selecionado`);
    }
  };

  const handleNovoFornecedor = async (nome: string, cpfCnpj?: string) => {
    if (!clienteAtual || !fazendaAtual) return;
    const { data, error } = await supabase
      .from('financeiro_fornecedores')
      .insert({
        cliente_id: clienteAtual.id,
        fazenda_id: fazendaAtual.id,
        nome,
        cpf_cnpj: cpfCnpj || null,
      })
      .select('id, nome')
      .single();
    if (error) { toast.error('Erro ao salvar fornecedor'); return; }
    if (data) {
      setFornecedores(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
      setFornecedorId(data.id);
      toast.success(`Fornecedor "${data.nome}" criado e selecionado`);
    }
    setNovoFornecedorOpen(false);
  };

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

  // ===== VALIDAÇÕES =====
  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    // 1. Fornecedor obrigatório
    if (!fornecedorId) {
      errors.push('Selecione o fornecedor (quem você pagou) antes de gerar o financeiro.');
    }

    // 2. Valor base obrigatório
    if (calc.valorBase <= 0) {
      errors.push('Preencha o valor da compra antes de gerar.');
    }

    // 3. Validar parcelas (a prazo)
    if (formaPag === 'prazo' && parcelas.length > 0) {
      const somaParcelas = Math.round(parcelas.reduce((s, p) => s + p.valor, 0) * 100) / 100;
      const valorBaseRound = Math.round(calc.valorBase * 100) / 100;
      if (Math.abs(somaParcelas - valorBaseRound) > 0.01) {
        errors.push(`A soma das parcelas (R$ ${fmt(somaParcelas)}) deve ser igual ao valor base da compra (R$ ${fmt(valorBaseRound)}).`);
      }
      parcelas.forEach((p, i) => {
        if (!p.data) errors.push(`Parcela ${i + 1}: data obrigatória.`);
        if (!p.valor || p.valor <= 0) errors.push(`Parcela ${i + 1}: valor deve ser maior que zero.`);
      });
    }

    return errors;
  }, [fornecedorId, calc.valorBase, formaPag, parcelas]);

  const canGenerate = validationErrors.length === 0 && !!lancamentoId;

  // ===== CONFIRMAÇÃO DE SUBSTITUIÇÃO (item 6) =====

  const handleClickGerar = () => {
    if (mode === 'update' && existingCount > 0) {
      setConfirmUpdateOpen(true);
    } else {
      handleGerarFinanceiro();
    }
  };

  // ===== GERAÇÃO FINANCEIRA =====
  const handleGerarFinanceiro = async () => {
    if (!lancamentoId) {
      toast.error('Salve o lançamento zootécnico antes de gerar os financeiros.');
      return;
    }
    if (!fazendaAtual || !clienteAtual) return;
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    setGerando(true);
    try {
      // In update mode, cancel existing records first
      if (mode === 'update') {
        const { data: oldRecords } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('id')
          .eq('movimentacao_rebanho_id', lancamentoId)
          .eq('cancelado', false);

        const oldIds = (oldRecords || []).map(r => r.id);
        if (oldIds.length > 0) {
          const userId = (await supabase.auth.getUser()).data.user?.id;
          await supabase
            .from('financeiro_lancamentos_v2')
            .update({
              cancelado: true,
              cancelado_em: new Date().toISOString(),
              cancelado_por: userId || null,
            })
            .in('id', oldIds);

          // Write audit log
          await supabase.from('audit_log_movimentacoes').insert({
            cliente_id: clienteAtual.id,
            usuario_id: userId || null,
            acao: 'recalculo_financeiro_compra',
            movimentacao_id: lancamentoId,
            financeiro_ids: oldIds,
            detalhes: {
              registros_cancelados: oldIds.length,
              motivo: 'Recálculo financeiro da compra',
            },
          });
        }
      } else {
        // In create mode, check duplicates
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
      }

      const statusFin = statusOp === 'previsto' ? 'previsto' : 'confirmado';
      const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria;
      const compraLabel = `Compra ${quantidade} ${catLabel}`;
      const produtoLabel = `${quantidade} ${catLabel}`;
      const anoMes = data.slice(0, 7);
      const inserts: any[] = [];

      // Determine subcentro based on category (female vs male)
      const FEMEAS = ['mamotes_f', 'desmama_f', 'novilhas', 'vacas'];
      const isFemea = FEMEAS.includes(categoria);
      const subcentroCompra = isFemea ? 'COMPRAS ANIMAIS/FEMEAS' : 'COMPRAS ANIMAIS/MACHOS';

      // Base record with full classification (ano_mes will be overridden per entry)
      const baseRecord: Record<string, any> = {
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

      // Add favorecido_id if a fornecedor was selected
      if (fornecedorId) {
        baseRecord.favorecido_id = fornecedorId;
      }

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
          ano_mes: anoMes,
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
          ano_mes: anoMes,
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
          ano_mes: anoMes,
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
      const msg = mode === 'update'
        ? `Financeiro atualizado: ${inserts.length} novo(s) lançamento(s) gerado(s)`
        : `${inserts.length} lançamento(s) financeiro(s) gerado(s) com sucesso!`;
      toast.success(msg);
      if (mode === 'update' && onFinanceiroUpdated) onFinanceiroUpdated();
    } catch (err: any) {
      toast.error('Erro ao gerar lançamentos: ' + (err.message || err));
    } finally {
      setGerando(false);
    }
  };

  const isPrevisto = statusOp === 'previsto';
  const previstoInputClass = isPrevisto ? 'border-orange-400 text-orange-800 dark:text-orange-300' : '';

  return (
    <div className="bg-card rounded-md border shadow-sm p-2.5 space-y-1.5 self-start relative">
      {/* Overlay: block editing until movimentação is saved */}
      {!lancamentoId && mode === 'create' && (
        <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-[1px] rounded-md flex items-center justify-center p-3">
          <div className="text-center space-y-1">
            <AlertTriangle className="h-4 w-4 mx-auto text-muted-foreground" />
            <p className="text-[11px] font-medium text-muted-foreground">
              Registre a entrada primeiro para depois preencher o financeiro
            </p>
          </div>
        </div>
      )}

      <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">
        {mode === 'update' ? 'Atualizar Financeiro da Compra' : 'Detalhes Financeiros'}
      </h3>
      {mode === 'update' && existingCount > 0 && (
        <div className="flex items-center gap-1 text-[10px] p-1.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{existingCount} lançamento(s) existente(s) serão cancelados e substituídos.</span>
        </div>
      )}
      {mode === 'update' && existingLoaded && existingCount > 0 && (
        <p className="text-[9px] text-muted-foreground/70 italic">Valores atuais carregados automaticamente</p>
      )}
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
      <div className="space-y-1">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Preço Base</span>

        {tipoPreco === 'por_kg' && (
          <div>
            <Label className="text-[10px]">R$/kg</Label>
            <Input type="number" value={precoKg} onChange={e => setPrecoKg(e.target.value)} placeholder="0,00" className={`h-7 text-[11px] ${previstoInputClass}`} />
          </div>
        )}
        {tipoPreco === 'por_cab' && (
          <div>
            <Label className="text-[10px]">R$/cab.</Label>
            <Input type="number" value={precoCab} onChange={e => setPrecoCab(e.target.value)} placeholder="0,00" className={`h-7 text-[11px] ${previstoInputClass}`} />
          </div>
        )}
        {tipoPreco === 'por_total' && (
          <div>
            <Label className="text-[10px]">Valor total (R$)</Label>
            <Input type="number" value={valorTotal} onChange={e => setValorTotal(e.target.value)} placeholder="0,00" className={`h-7 text-[11px] ${previstoInputClass}`} />
          </div>
        )}

        {calc.valorBase > 0 && (
          <div className="bg-muted/30 rounded px-2 py-1.5 space-y-px text-[10px]">
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

      {/* Fornecedor (quem você pagou) */}
      <div className="space-y-0.5">
        <Label className="text-[10px]">Fornecedor (quem você pagou)</Label>
        <div className="flex gap-1">
          <div className="flex-1">
            <SearchableSelect
              value={fornecedorId}
              onValueChange={setFornecedorId}
              placeholder="Selecione o fornecedor"
              options={fornecedores.map(f => ({ value: f.id, label: f.nome }))}
            />
          </div>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setNovoFornecedorOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {/* Sugestão automática baseada na Origem */}
        {origemSugestao === 'encontrado' && (
          <p className="text-[9px] text-green-600 flex items-center gap-1">
            <CheckCircle className="h-2.5 w-2.5" /> Fornecedor selecionado automaticamente
          </p>
        )}
        {origemSugestao === 'criar' && !fornecedorId && (
          <div className="flex items-center gap-1 p-1 rounded border border-dashed border-muted-foreground/30 bg-muted/40">
            <span className="text-[9px] text-muted-foreground flex-1">
              Criar "<strong>{fazendaOrigem?.trim()}</strong>"?
            </span>
            <Button type="button" variant="outline" size="sm" className="h-5 text-[9px] px-1.5" onClick={handleCriarFornecedorFromOrigem}>
              Criar
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-5 text-[9px] px-1" onClick={() => setOrigemSugestaoDescartada(true)}>
              ✕
            </Button>
          </div>
        )}
      </div>

      {/* Nota Fiscal */}
      <div>
        <Label className="text-[10px]">Nota Fiscal</Label>
        <Input value={notaFiscal} onChange={e => onNotaFiscalChange(e.target.value)} placeholder="Nº da nota" className="h-7 text-[11px]" />
      </div>

      <NovoFornecedorDialog open={novoFornecedorOpen} onClose={() => setNovoFornecedorOpen(false)} onSave={handleNovoFornecedor} />

      <Separator />

      {/* BLOCO 3 — Despesas Extras */}
      <div className="space-y-1">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Despesas Extras</span>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Frete (R$)</Label>
            <Input type="number" value={frete} onChange={e => setFrete(e.target.value)} placeholder="0,00" className={`h-7 text-[11px] ${previstoInputClass}`} />
          </div>
          <div>
            <Label className="text-[10px]">Comissão (%)</Label>
            <Input type="number" value={comissaoPct} onChange={e => setComissaoPct(e.target.value)} placeholder="0" className={`h-7 text-[11px] ${previstoInputClass}`} />
          </div>
        </div>
        {calc.comissaoVal > 0 && (
          <div className="flex justify-between text-[10px] px-1">
            <span className="text-muted-foreground">Comissão (R$)</span>
            <strong>R$ {fmt(calc.comissaoVal)}</strong>
          </div>
        )}
        {calc.totalDespesas > 0 && (
          <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded px-2 py-1.5 flex justify-between text-[10px] font-bold">
            <span className="text-orange-700 dark:text-orange-400">Total despesas</span>
            <span className="text-orange-800 dark:text-orange-300">R$ {fmt(calc.totalDespesas)}</span>
          </div>
        )}
      </div>

      <Separator />

      {/* BLOCO 4 — Valor Líquido */}
      {calc.valorBase > 0 && (
        <div className={`rounded-md px-2 py-1.5 ${isPrevisto ? 'bg-orange-200/50 dark:bg-orange-950/50' : 'bg-primary/10'}`}>
          <div className="flex justify-between text-[11px] font-bold">
            <span>Valor total líquido</span>
            <span className={`text-sm ${isPrevisto ? 'text-orange-800 dark:text-orange-300' : 'text-primary'}`}>R$ {fmt(calc.liqTotal)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">R$/kg líq.</span>
            <strong>R$ {fmt(calc.liqKg, 4)}</strong>
          </div>
          <div className="flex justify-between text-[10px]">
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

          {/* Validation errors */}
          {validationErrors.length > 0 && !gerado && (
            <div className="space-y-1 p-2 rounded-md border border-destructive/30 bg-destructive/5">
              {validationErrors.map((err, i) => (
                <div key={i} className="flex items-start gap-1 text-[10px] text-destructive">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {gerado ? (
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-md p-2 border border-green-200 dark:border-green-800">
              <CheckCircle className="h-3.5 w-3.5" />
              {mode === 'update' ? 'Financeiro atualizado com sucesso' : 'Lançamentos financeiros já gerados'}
            </div>
          ) : (
            <>
              {!lancamentoId && mode === 'create' && (
                <div className="flex items-center gap-1 text-[10px] text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="h-3 w-3" />
                  Salve o lançamento zootécnico primeiro
                </div>
              )}
              <Button
                type="button"
                variant={mode === 'update' ? 'default' : 'outline'}
                size="sm"
                className={`w-full h-8 text-[11px] font-bold ${mode === 'update' ? 'shadow-sm' : ''}`}
                disabled={!canGenerate || gerando}
                onClick={handleClickGerar}
              >
                {gerando
                  ? (mode === 'update' ? 'Atualizando...' : 'Gerando...')
                  : (mode === 'update' ? '✓ Atualizar lançamentos no financeiro' : 'Gerar lançamentos no financeiro')}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Confirmation dialog for update (item 6) */}
      <AlertDialog open={confirmUpdateOpen} onOpenChange={setConfirmUpdateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar atualização financeira</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Esta compra possui <strong>{existingCount} lançamento(s) financeiro(s)</strong> vinculado(s).</p>
              <p>Ao confirmar:</p>
              <ul className="list-disc pl-4 space-y-1 text-[12px]">
                <li>Os lançamentos atuais serão <strong>cancelados</strong></li>
                <li>Novos lançamentos serão gerados com os valores atualizados</li>
              </ul>
              <p className="text-[11px] text-muted-foreground">Esta ação é registrada no log de auditoria.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmUpdateOpen(false); handleGerarFinanceiro(); }}>
              Confirmar e atualizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
