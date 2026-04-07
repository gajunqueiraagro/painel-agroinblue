import { useState, useEffect, useCallback } from 'react';
import { useFechamentoExecutivo, type FechamentoExecutivo } from '@/hooks/useFechamentoExecutivo';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { useLancamentos } from '@/hooks/useLancamentos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Plus, Lock, Unlock, RefreshCw, Download, Sparkles, ChevronLeft, Edit3, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { FechExecResumoPage } from '@/components/fechamento-exec/FechExecResumoPage';
import { FechExecOperacaoPage } from '@/components/fechamento-exec/FechExecOperacaoPage';
import { FechExecZootecnicoPage } from '@/components/fechamento-exec/FechExecZootecnicoPage';
import { FechExecFluxoCaixaPage } from '@/components/fechamento-exec/FechExecFluxoCaixaPage';
import { FechExecEndividamentoPage } from '@/components/fechamento-exec/FechExecEndividamentoPage';
import { exportFechamentoExecutivoPdf } from '@/lib/exportFechamentoExecutivoPdf';

const MESES_OPTIONS = [
  { value: '1', label: 'Janeiro' }, { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' }, { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' }, { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' }, { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' }, { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: 'bg-amber-100 text-amber-800' },
  revisado: { label: 'Revisado', color: 'bg-blue-100 text-blue-800' },
  fechado: { label: 'Fechado', color: 'bg-green-100 text-green-800' },
};

interface Props {
  onBack?: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

export function FechamentoExecutivoTab({ onBack, filtroAnoInicial, filtroMesInicial }: Props) {
  const now = new Date();
  const [ano, setAno] = useState(Number(filtroAnoInicial) || now.getFullYear());
  const [mes, setMes] = useState(filtroMesInicial || now.getMonth() + 1);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [activeSection, setActiveSection] = useState('resumo');
  const [editingText, setEditingText] = useState<string | null>(null);
  const [editTextValue, setEditTextValue] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);

  const { fazendaAtual, isGlobal } = useFazenda();
  const { clienteAtual } = useCliente();
  const {
    fechamentos, fechamentoAtual, loading, saving,
    loadFechamentos, criarFechamento, salvarTextos,
    alterarStatus, setFechamentoAtual,
  } = useFechamentoExecutivo();

  useEffect(() => {
    loadFechamentos(ano);
  }, [ano, loadFechamentos]);

  const snapshot = fechamentoAtual?.json_snapshot_indicadores || {};
  const textos = fechamentoAtual?.json_snapshot_textos || {};
  const isFechado = fechamentoAtual?.status_fechamento === 'fechado';

  // ── Build snapshot from live data ──
  const buildSnapshot = useCallback(async (): Promise<Record<string, any>> => {
    // For MVP, we build a simplified snapshot from available data
    const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
    const clienteId = clienteAtual?.id;
    const fazendaId = isGlobal ? null : fazendaAtual?.id;
    
    if (!clienteId) return {};

    // Fetch financial data for the period
    let finQuery = supabase
      .from('financeiro_lancamentos_v2')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('cancelado', false)
      .eq('ano_mes', anoMes);
    if (fazendaId) finQuery = finQuery.eq('fazenda_id', fazendaId);
    
    const { data: finData } = await finQuery;
    const lancs = finData || [];

    // Financial aggregations
    const conciliados = lancs.filter(l => (l.status_transacao || '').toLowerCase().trim() === 'realizado');
    const entradas = conciliados.filter(l => (l.tipo_operacao || '').startsWith('1'));
    const saidas = conciliados.filter(l => (l.tipo_operacao || '').startsWith('2'));

    const totalEntradas = entradas.reduce((s, l) => s + Math.abs(l.valor), 0);
    const totalSaidas = saidas.reduce((s, l) => s + Math.abs(l.valor), 0);

    const receitas = conciliados.filter(l => (l.macro_custo || '').toLowerCase().trim() === 'receitas');
    const custeioProdutivo = conciliados.filter(l => (l.macro_custo || '').toLowerCase().trim() === 'custeio produtivo' && (l.tipo_operacao || '').startsWith('2'));
    const reposicao = conciliados.filter(l => (l.macro_custo || '').toLowerCase().trim() === 'investimento em bovinos');
    const deducao = conciliados.filter(l => (l.macro_custo || '').toLowerCase().trim() === 'dedução de receitas');
    const amortizacoes = conciliados.filter(l => (l.macro_custo || '').toLowerCase().trim() === 'amortizações financeiras');
    const dividendos = conciliados.filter(l => (l.macro_custo || '').toLowerCase().trim() === 'dividendos');
    const investimentos = conciliados.filter(l => (l.macro_custo || '').toLowerCase().trim() === 'investimento na fazenda');

    const sum = (arr: any[]) => arr.reduce((s, l) => s + Math.abs(l.valor), 0);

    // Fetch zootechnical lancamentos
    let zooQuery = supabase
      .from('lancamentos')
      .select('*')
      .eq('cliente_id', clienteId)
      .gte('data', `${ano}-${String(mes).padStart(2, '0')}-01`)
      .lte('data', `${ano}-${String(mes).padStart(2, '0')}-31`);
    if (fazendaId) zooQuery = zooQuery.eq('fazenda_id', fazendaId);

    const { data: zooData } = await zooQuery;
    const zooLancs = zooData || [];

    const compras = zooLancs.filter(l => l.tipo === 'compra');
    const vendas = zooLancs.filter(l => l.tipo === 'venda');
    const nascimentos = zooLancs.filter(l => l.tipo === 'nascimento');
    const mortes = zooLancs.filter(l => l.tipo === 'morte');

    const totalCompras = compras.reduce((s, l) => s + l.quantidade, 0);
    const totalVendas = vendas.reduce((s, l) => s + l.quantidade, 0);
    const totalNascimentos = nascimentos.reduce((s, l) => s + l.quantidade, 0);
    const totalMortes = mortes.reduce((s, l) => s + l.quantidade, 0);

    const pesoMedioVendas = vendas.length > 0 
      ? vendas.reduce((s, l) => s + (l.peso_medio_arrobas || 0) * l.quantidade, 0) / totalVendas 
      : 0;

    // Saldo de caixa
    let caixaQuery = supabase
      .from('financeiro_resumo_caixa')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('ano_mes', anoMes);
    if (fazendaId) caixaQuery = caixaQuery.eq('fazenda_id', fazendaId);
    const { data: caixaData } = await caixaQuery;
    const saldoFinal = (caixaData || []).reduce((s, c) => s + (c.saldo_final_total || 0), 0);

    return {
      periodo: { ano, mes, anoMes },
      financeiro: {
        receitas: sum(receitas),
        deducao_receitas: sum(deducao),
        custeio_produtivo: sum(custeioProdutivo),
        reposicao_bovinos: sum(reposicao),
        investimentos_fazenda: sum(investimentos),
        amortizacoes: sum(amortizacoes),
        dividendos: sum(dividendos),
        total_entradas: totalEntradas,
        total_saidas: totalSaidas,
        saldo_caixa: saldoFinal,
        lucro_bruto: sum(receitas) - sum(deducao) - sum(custeioProdutivo),
      },
      zootecnico: {
        compras_cab: totalCompras,
        vendas_cab: totalVendas,
        nascimentos: totalNascimentos,
        mortes: totalMortes,
        peso_medio_vendas_arroba: pesoMedioVendas,
        valor_total_vendas: vendas.reduce((s, l) => s + (l.valor_total || 0), 0),
        preco_medio_compra_cab: totalCompras > 0 ? compras.reduce((s, l) => s + (l.preco_medio_cabeca || 0) * l.quantidade, 0) / totalCompras : 0,
      },
      caixa: {
        entradas_totais: totalEntradas,
        saidas_totais: totalSaidas,
        caixa_final: saldoFinal,
        receitas_caixa: sum(receitas),
        custos_produtivos: sum(custeioProdutivo),
        investimentos_fazenda: sum(investimentos),
        reposicao_animais: sum(reposicao),
        amortizacoes: sum(amortizacoes),
        dividendos: sum(dividendos),
      },
    };
  }, [ano, mes, clienteAtual?.id, isGlobal, fazendaAtual?.id]);

  const handleGerar = useCallback(async () => {
    const snap = await buildSnapshot();
    await criarFechamento(ano, mes, snap);
    loadFechamentos(ano);
    setView('detail');
  }, [buildSnapshot, criarFechamento, ano, mes, loadFechamentos]);

  const handleGerarIA = useCallback(async (secao?: string) => {
    if (!fechamentoAtual) return;
    setGeneratingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-texto-fechamento', {
        body: {
          snapshot: fechamentoAtual.json_snapshot_indicadores,
          periodo: fechamentoAtual.periodo_texto,
          secao: secao || 'todas',
        },
      });
      if (error) throw error;
      const novosTextos = { ...textos, ...data.textos };
      await salvarTextos(fechamentoAtual.id, novosTextos);
      toast.success('Textos gerados pela IA');
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao gerar textos IA');
    }
    setGeneratingAI(false);
  }, [fechamentoAtual, textos, salvarTextos]);

  const handleSaveText = useCallback(async () => {
    if (!fechamentoAtual || !editingText) return;
    const novosTextos = { ...textos, [editingText]: editTextValue };
    await salvarTextos(fechamentoAtual.id, novosTextos);
    setEditingText(null);
  }, [fechamentoAtual, editingText, editTextValue, textos, salvarTextos]);

  const startEditText = (key: string) => {
    setEditingText(key);
    setEditTextValue(textos[key] || '');
  };

  const handleExportPdf = useCallback(() => {
    if (!fechamentoAtual) return;
    exportFechamentoExecutivoPdf(fechamentoAtual);
  }, [fechamentoAtual]);

  // ── LIST VIEW ──
  if (view === 'list') {
    return (
      <div className="p-4 pb-24 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Fechamento Executivo</h2>
        </div>

        <div className="flex gap-2">
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map(a => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES_OPTIONS.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleGerar} disabled={saving} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          {saving ? 'Gerando...' : 'Gerar Fechamento'}
        </Button>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : fechamentos.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhum fechamento encontrado para {ano}</p>
              <p className="text-sm">Selecione o mês e clique em "Gerar Fechamento"</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {fechamentos.map(f => {
              const st = STATUS_LABELS[f.status_fechamento] || STATUS_LABELS.rascunho;
              return (
                <Card
                  key={f.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => { setFechamentoAtual(f); setView('detail'); }}
                >
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{f.periodo_texto}</p>
                      <p className="text-xs text-muted-foreground">v{f.versao} • {new Date(f.data_geracao).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <Badge className={st.color}>{st.label}</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (!fechamentoAtual) return null;

  const TextSection = ({ sectionKey, label }: { sectionKey: string; label: string }) => {
    const text = textos[sectionKey];
    if (editingText === sectionKey) {
      return (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{label}</p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setEditingText(null)}>Cancelar</Button>
              <Button size="sm" onClick={handleSaveText} disabled={saving}>
                <Save className="h-3 w-3 mr-1" />Salvar
              </Button>
            </div>
          </div>
          <Textarea
            value={editTextValue}
            onChange={e => setEditTextValue(e.target.value)}
            rows={6}
            className="text-sm"
          />
        </div>
      );
    }
    return (
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">{label}</p>
          {!isFechado && (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => startEditText(sectionKey)} title="Editar">
                <Edit3 className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleGerarIA(sectionKey)} disabled={generatingAI} title="Gerar com IA">
                <Sparkles className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        {text ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded p-3">{text}</p>
        ) : (
          <p className="text-xs text-muted-foreground italic">Texto não gerado. Clique em ✨ para gerar com IA.</p>
        )}
      </div>
    );
  };

  const st = STATUS_LABELS[fechamentoAtual.status_fechamento] || STATUS_LABELS.rascunho;

  return (
    <div className="p-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setView('list'); setFechamentoAtual(null); }}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">{fechamentoAtual.periodo_texto}</h2>
          <p className="text-xs text-muted-foreground">v{fechamentoAtual.versao}</p>
        </div>
        <Badge className={st.color}>{st.label}</Badge>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {!isFechado && (
          <>
            <Button size="sm" variant="outline" onClick={() => handleGerarIA()} disabled={generatingAI}>
              <Sparkles className="h-3 w-3 mr-1" />
              {generatingAI ? 'Gerando...' : 'Gerar Textos IA'}
            </Button>
            {fechamentoAtual.status_fechamento === 'rascunho' && (
              <Button size="sm" variant="outline" onClick={() => alterarStatus(fechamentoAtual.id, 'revisado')}>
                <RefreshCw className="h-3 w-3 mr-1" />Marcar Revisado
              </Button>
            )}
            <Button size="sm" variant="default" onClick={() => alterarStatus(fechamentoAtual.id, 'fechado')}>
              <Lock className="h-3 w-3 mr-1" />Fechar
            </Button>
          </>
        )}
        {isFechado && (
          <Button size="sm" variant="outline" onClick={() => alterarStatus(fechamentoAtual.id, 'rascunho')}>
            <Unlock className="h-3 w-3 mr-1" />Reabrir
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={handleExportPdf}>
          <Download className="h-3 w-3 mr-1" />Exportar PDF
        </Button>
      </div>

      {/* Sections Tabs */}
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="w-full grid grid-cols-5 h-auto">
          <TabsTrigger value="resumo" className="text-[10px] py-1">Resumo</TabsTrigger>
          <TabsTrigger value="operacao" className="text-[10px] py-1">Operação</TabsTrigger>
          <TabsTrigger value="zootecnico" className="text-[10px] py-1">Zootécnico</TabsTrigger>
          <TabsTrigger value="caixa" className="text-[10px] py-1">Caixa</TabsTrigger>
          <TabsTrigger value="endividamento" className="text-[10px] py-1">Dívida</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo">
          <FechExecResumoPage snapshot={snapshot} />
          <TextSection sectionKey="resumo_executivo_ia" label="Análise Executiva" />
        </TabsContent>

        <TabsContent value="operacao">
          <FechExecOperacaoPage snapshot={snapshot} />
          <TextSection sectionKey="texto_operacional_ia" label="Análise Operacional" />
        </TabsContent>

        <TabsContent value="zootecnico">
          <FechExecZootecnicoPage snapshot={snapshot} />
          <TextSection sectionKey="texto_zootecnico_ia" label="Análise Zootécnica" />
        </TabsContent>

        <TabsContent value="caixa">
          <FechExecFluxoCaixaPage snapshot={snapshot} />
          <TextSection sectionKey="texto_fluxo_caixa_ia" label="Análise do Fluxo de Caixa" />
        </TabsContent>

        <TabsContent value="endividamento">
          <FechExecEndividamentoPage snapshot={snapshot} />
          <TextSection sectionKey="texto_endividamento_ia" label="Análise de Endividamento" />
          <div className="mt-6 border-t pt-4">
            <h3 className="font-bold text-base mb-2">Resumo Global</h3>
            <TextSection sectionKey="resumo_global_ia" label="Resumo Final da Operação" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
