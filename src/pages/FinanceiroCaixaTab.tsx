/**
 * Módulo Financeiro — container principal com sub-abas horizontais no topo.
 * Topo fixo: nome fazenda + seletor fazenda/global + filtro ano + filtro mês.
 * Sub-abas: Dashboard | Fluxo de Caixa | Rateio ADM | Importação
 * Suporta drill-down: ao clicar numa categoria no dashboard, mostra lançamentos filtrados.
 */
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ImportacaoFinanceira } from '@/components/financeiro/ImportacaoFinanceira';
import { DashboardFinanceiro, type DrillDownPayload } from '@/components/financeiro/DashboardFinanceiro';
import { RateioADMConferenciaView } from '@/components/financeiro/RateioADMConferencia';
import { FluxoFinanceiro } from '@/components/financeiro/FluxoFinanceiro';
import DrillDownMacro from '@/components/financeiro/DrillDownMacro';
import { useFinanceiro, type FinanceiroLancamento } from '@/hooks/useFinanceiro';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FazendaSelector } from '@/components/FazendaSelector';
import { ArrowLeft, Loader2, Filter, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatMoeda } from '@/lib/calculos/formatters';
import { MESES_NOMES } from '@/lib/calculos/labels';
import {
  isRealizado as isRealizadoShared,
  isEntradaFinanceira,
  isSaidaFinanceira,
  datePagtoAnoMes as datePagtoAnoMesShared,
} from '@/lib/financeiro/filters';
import {
  classificarEntrada as classificarEntradaCentral,
  classificarSaida as classificarSaidaCentral,
} from '@/lib/financeiro/classificacao';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import type { FluxoDrillPayload } from '@/components/financeiro/FluxoFinanceiro';
import { toast } from 'sonner';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

type SubTab = 'dashboard' | 'fluxo' | 'rateio' | 'importacao';

interface Props {
  lancamentosPecuarios?: Lancamento[];
  saldosIniciais?: SaldoInicial[];
  onBack?: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
  
}

const MESES_FILTRO = [
  { value: '1', label: 'Janeiro' }, { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' }, { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' }, { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' }, { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' }, { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
];

// Classification: use centralized functions from classificacao.ts (centro_custo based)
function classifyEntrada(l: FinanceiroLancamento): string {
  return classificarEntradaCentral(l);
}

function classifySaida(l: FinanceiroLancamento): string {
  return classificarSaidaCentral(l);
}

export function FinanceiroCaixaTab({ lancamentosPecuarios = [], saldosIniciais = [], onBack, filtroAnoInicial, filtroMesInicial }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('dashboard');
  const [drillDown, setDrillDown] = useState<(DrillDownPayload & { ano: string; mes: number }) | null>(null);
  const [drillMacro, setDrillMacro] = useState<string | null>(null);
  const { fazendaAtual, fazendas } = useFazenda();
  const { pastos, categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;
  const isGlobal = fazendaId === '__global__';
  const {
    importacoes, lancamentos, centrosCusto, contasBancarias, indicadores,
    rateioADM, rateioConferencia, fazendasSemRebanho, fazendaMapForImport,
    loading, confirmarImportacao, excluirImportacao, buscarDetalhesLote, fazendaADM,
    totalLancamentosADM, reloadData,
  } = useFinanceiro();

  // V2 hook for editing lancamentos from audit modal
  const v2Hook = useFinanceiroV2(1);

  // Load V2 supporting data on mount
  useEffect(() => {
    v2Hook.loadContas();
    v2Hook.loadFornecedores();
    v2Hook.loadClassificacoes();
  }, [v2Hook.loadContas, v2Hook.loadFornecedores, v2Hook.loadClassificacoes]);

  // Edit dialog state — opens ON TOP of audit modal
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingLancV2, setEditingLancV2] = useState<any>(null);

  // Lifted audit modal state — persists across useFinanceiro reload cycles
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditPayload, setAuditPayload] = useState<FluxoDrillPayload | null>(null);
  const [auditValorClicado, setAuditValorClicado] = useState(0);

  const handleAuditModalOpen = useCallback((payload: FluxoDrillPayload, valorClicado: number) => {
    setAuditPayload(payload);
    setAuditValorClicado(valorClicado);
    setAuditModalOpen(true);
  }, []);

  const handleAuditModalClose = useCallback(() => {
    setAuditModalOpen(false);
  }, []);

  // Ref to fluxo reload function
  const fluxoReloadRef = useRef<(() => void) | null>(null);
  const handleFluxoReloadRef = useCallback((reload: () => void) => {
    fluxoReloadRef.current = reload;
  }, []);

  // Convert FinanceiroLancamento to LancamentoV2-like for the dialog
  const handleEditFromAuditoria = useCallback((lanc: FinanceiroLancamento) => {
    const v2Like = {
      id: lanc.id,
      cliente_id: '',
      fazenda_id: lanc.fazenda_id,
      conta_bancaria_id: lanc.conta_bancaria_id || null,
      data_competencia: lanc.data_realizacao || lanc.ano_mes?.replace('-', '-') + '-01' || '',
      data_pagamento: lanc.data_pagamento || null,
      valor: Math.abs(lanc.valor),
      sinal: lanc.sinal ?? (lanc.valor >= 0 ? 1 : -1),
      tipo_operacao: lanc.tipo_operacao || '2-Saídas',
      status_transacao: lanc.status_transacao || 'realizado',
      descricao: lanc.descricao || lanc.produto || '',
      macro_custo: lanc.macro_custo || null,
      grupo_custo: lanc.grupo_custo || null,
      centro_custo: lanc.centro_custo || null,
      subcentro: lanc.subcentro || null,
      escopo_negocio: lanc.escopo_negocio || null,
      observacao: lanc.observacao || lanc.obs || null,
      ano_mes: lanc.ano_mes || '',
      documento: null,
      historico: null,
      numero_documento: lanc.numero_documento || null,
      favorecido_id: lanc.favorecido_id || null,
      conta_destino_id: null,
      origem_lancamento: lanc.origem_lancamento || 'importacao',
      lote_importacao_id: lanc.lote_importacao_id || null,
      forma_pagamento: lanc.forma_pagamento || null,
      dados_pagamento: null,
      cancelado: lanc.cancelado || false,
      editado_manual: lanc.editado_manual || false,
      created_at: '',
      updated_at: '',
    };
    setEditingLancV2(v2Like);
    setEditDialogOpen(true);
  }, []);

  const handleEditSave = useCallback(async (form: any, id?: string) => {
    if (!id) return false;
    const ok = await v2Hook.editarLancamento(id, form);
    if (ok) {
      // Close edit dialog but keep audit modal open
      setEditDialogOpen(false);
      setEditingLancV2(null);
      // Reload both data sources in parallel
      await Promise.all([
        reloadData(),
        fluxoReloadRef.current?.(),
      ]);
    }
    return ok;
  }, [v2Hook, reloadData]);

  const handleEditDelete = useCallback(async (id: string) => {
    const ok = await v2Hook.excluirLancamento(id);
    if (ok) {
      setEditDialogOpen(false);
      setEditingLancV2(null);
      await Promise.all([
        reloadData(),
        fluxoReloadRef.current?.(),
      ]);
    }
    return ok;
  }, [v2Hook, reloadData]);

  // Filtro único — herdado do Resumo, ajustável localmente
  const [localAno, setLocalAno] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const [localMes, setLocalMes] = useState(filtroMesInicial || new Date().getMonth() + 1);

  useEffect(() => {
    if (filtroAnoInicial) setLocalAno(filtroAnoInicial);
    if (filtroMesInicial) setLocalMes(filtroMesInicial);
  }, [filtroAnoInicial, filtroMesInicial]);

  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  const zooOficial = useIndicadoresZootecnicos(
    fazendaId, anoAtual, mesAtual,
    lancamentosPecuarios, saldosIniciais, pastos, categorias,
  );

  // Available years from lancamentos
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(anoAtual));
    if (filtroAnoInicial) anos.add(filtroAnoInicial);
    lancamentos.forEach(l => {
      if (l.data_pagamento && l.data_pagamento.length >= 4) {
        anos.add(l.data_pagamento.substring(0, 4));
      }
      if (l.ano_mes && l.ano_mes.length >= 4) {
        anos.add(l.ano_mes.substring(0, 4));
      }
    });
    return Array.from(anos).sort().reverse();
  }, [lancamentos, anoAtual, filtroAnoInicial]);

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'fluxo', label: 'Fluxo de Caixa' },
    ...(fazendaADM ? [{ id: 'rateio' as SubTab, label: 'Rateio ADM' }] : []),
    { id: 'importacao', label: 'Importação' },
  ];

  const fazendaNome = isGlobal ? '🌐 Global' : (fazendaAtual?.nome || 'Fazenda');

  // Drill-down handler
  const handleDrillDown = useCallback((payload: DrillDownPayload) => {
    setDrillDown({ ...payload, ano: localAno, mes: localMes });
  }, [localAno, localMes]);

  // Filtered lancamentos for drill-down view
  const drillDownLancamentos = useMemo(() => {
    if (!drillDown) return [];
    const { categoria, tipo, periodo, ano, mes } = drillDown;

    return lancamentos.filter(l => {
      if (!isRealizadoShared(l)) return false;

      // Check tipo (entrada/saida)
      if (tipo === 'entrada' && !isEntradaFinanceira(l)) return false;
      if (tipo === 'saida' && !isSaidaFinanceira(l)) return false;

      // Check period
      const am = datePagtoAnoMesShared(l);
      if (!am) return false;
      if (periodo === 'mes') {
        const periodoMes = `${ano}-${String(mes).padStart(2, '0')}`;
        if (am !== periodoMes) return false;
      } else {
        if (!am.startsWith(ano)) return false;
        if (Number(am.substring(5, 7)) > mes) return false;
      }

      // Check category classification
      const classified = tipo === 'entrada' ? classifyEntrada(l) : classifySaida(l);
      return classified === categoria;
    });
  }, [drillDown, lancamentos]);

  const drillDownTotal = useMemo(
    () => drillDownLancamentos.reduce((s, l) => s + Math.abs(l.valor), 0),
    [drillDownLancamentos],
  );

  // If drill-down is active, show filtered view
  if (drillDown) {
    const periodoLabel = drillDown.periodo === 'mes'
      ? `${MESES_NOMES[drillDown.mes - 1]}/${drillDown.ano}`
      : `Jan→${MESES_NOMES[drillDown.mes - 1]}/${drillDown.ano}`;
    const tipoLabel = drillDown.tipo === 'entrada' ? 'Entrada' : 'Saída';

    return (
      <div className="max-w-full mx-auto animate-fade-in pb-20">
        {/* Header with back button and filter info */}
        <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 py-2.5 space-y-2">
          <button
            onClick={() => setDrillDown(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para Dashboard
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-md px-2.5 py-1 text-xs font-bold">
              <Filter className="h-3 w-3" />
              {drillDown.categoria}
            </div>
            <span className="text-xs text-muted-foreground">
              {tipoLabel} · {periodoLabel}
            </span>
            <button
              onClick={() => setDrillDown(null)}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{drillDownLancamentos.length} lançamentos</span>
            <span className={`font-bold font-mono ${drillDown.tipo === 'entrada' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              Total: {formatMoeda(drillDownTotal)}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="px-4 pb-4">
          {drillDownLancamentos.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Nenhum lançamento encontrado para este filtro.
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] px-2 py-1.5 whitespace-nowrap">Data Pgto</TableHead>
                    <TableHead className="text-[10px] px-2 py-1.5">Produto</TableHead>
                    <TableHead className="text-[10px] px-2 py-1.5">Fornecedor</TableHead>
                    <TableHead className="text-[10px] px-2 py-1.5">Centro Custo</TableHead>
                    <TableHead className="text-[10px] px-2 py-1.5 text-right">Valor</TableHead>
                    <TableHead className="text-[10px] px-2 py-1.5">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillDownLancamentos.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="text-[10px] px-2 py-1.5 whitespace-nowrap">{l.data_pagamento || '-'}</TableCell>
                      <TableCell className="text-[10px] px-2 py-1.5 max-w-[140px] truncate">{l.produto || '-'}</TableCell>
                      <TableCell className="text-[10px] px-2 py-1.5 max-w-[120px] truncate">{l.fornecedor || '-'}</TableCell>
                      <TableCell className="text-[10px] px-2 py-1.5 max-w-[120px] truncate">{l.centro_custo || '-'}</TableCell>
                      <TableCell className={`text-[10px] px-2 py-1.5 text-right font-mono font-bold ${drillDown.tipo === 'entrada' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatMoeda(Math.abs(l.valor))}
                      </TableCell>
                      <TableCell className="text-[10px] px-2 py-1.5">{l.status_transacao || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-full mx-auto animate-fade-in pb-20">
      {/* ── Topo fixo: filtros + abas na mesma linha ── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 py-1.5">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Select value={localAno} onValueChange={setLocalAno}>
            <SelectTrigger className="w-20 h-7 text-xs font-bold shrink-0">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent side="bottom">
              {anosDisponiveis.map(a => (
                <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(localMes)} onValueChange={v => setLocalMes(Number(v))}>
            <SelectTrigger className="w-36 h-7 text-xs font-bold shrink-0">
              <SelectValue placeholder="Até o mês" />
            </SelectTrigger>
            <SelectContent side="bottom">
              {MESES_FILTRO.map(m => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  Até {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="h-5 w-px bg-border shrink-0 mx-1" />

          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-2.5 py-1 text-[11px] font-bold whitespace-nowrap rounded-md transition-colors shrink-0 ${
                subTab === t.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Conteúdo ── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {subTab === 'dashboard' && (
            <div className="p-4">
              {drillMacro ? (
                <DrillDownMacro
                  macro={drillMacro}
                  lancamentos={lancamentos}
                  filtros={{ ano: Number(localAno), meses: Array.from({ length: localMes }, (_, i) => i + 1), fazendaId }}
                  onVoltar={() => setDrillMacro(null)}
                />
              ) : (
                <DashboardFinanceiro
                  lancamentos={lancamentos}
                  indicadores={indicadores}
                  lancamentosPecuarios={lancamentosPecuarios}
                  saldosIniciais={saldosIniciais}
                  rateioADM={rateioADM}
                  isGlobal={isGlobal}
                  fazendasSemArea={fazendasSemRebanho}
                  pastos={pastos}
                  categorias={categorias}
                  fazendaId={fazendaId}
                  ano={Number(localAno)}
                  mesAte={localMes}
                  onDrillDown={handleDrillDown}
                  onMacroDrillDown={(macro) => setDrillMacro(macro)}
                />
              )}
            </div>
          )}
          {subTab === 'fluxo' && (
            <FluxoFinanceiro
              lancamentos={lancamentos}
              rateioADM={rateioADM}
              ano={Number(localAno)}
              mesAte={localMes}
              fazendaAtualNome={isGlobal ? undefined : fazendaAtual?.nome}
              onEditLancamento={handleEditFromAuditoria}
              modalOpen={auditModalOpen}
              modalPayload={auditPayload}
              modalValorClicado={auditValorClicado}
              onModalOpen={handleAuditModalOpen}
              onModalClose={handleAuditModalClose}
              onFluxoReloadRef={handleFluxoReloadRef}
            />
          )}
          {subTab === 'rateio' && (
            <div className="p-4">
              <RateioADMConferenciaView
                conferencia={rateioConferencia}
                fazendasSemRebanho={fazendasSemRebanho}
                totalLancamentosADM={totalLancamentosADM}
              />
            </div>
          )}
          {subTab === 'importacao' && (
            <div className="p-4">
              <ImportacaoFinanceira
                importacoes={importacoes}
                centrosCusto={centrosCusto}
                fazendas={fazendaMapForImport}
                contasBancarias={contasBancarias}
                onConfirmar={confirmarImportacao}
                onExcluir={excluirImportacao}
                onBuscarDetalhesLote={buscarDetalhesLote}
              />
            </div>
          )}
        </>
      )}

      {/* Edit dialog overlay — renders ON TOP of audit modal */}
      <LancamentoV2Dialog
        open={editDialogOpen}
        onClose={() => { setEditDialogOpen(false); setEditingLancV2(null); }}
        onSave={handleEditSave}
        onDelete={handleEditDelete}
        lancamento={editingLancV2}
        fazendas={fazendas}
        contas={v2Hook.contasBancarias}
        classificacoes={v2Hook.classificacoes}
        fornecedores={v2Hook.fornecedores}
        defaultFazendaId={fazendaId !== '__global__' ? fazendaId || '' : ''}
        onCriarFornecedor={v2Hook.criarFornecedor}
      />
    </div>
  );
}
