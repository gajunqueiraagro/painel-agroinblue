/**
 * V2MesaOperacional — PR1
 *
 * Mesa Operacional v2. Leitura visual lado-a-lado:
 * BANCO (OFX real) vs SISTEMA (apontamento). Sem auto-match, sem ações.
 *
 * Atrás de FEATURE_FLAGS.MESA_OPERACIONAL_V2. Conciliação atual
 * (section='conciliacao') NÃO é tocada. Coexiste.
 *
 * Princípios soberanos (22/05/2026):
 *   1. OFX = soberano (verdade do caixa)
 *   2. Excel = hipótese (não importa direto)
 *   3. Aprovação humana obrigatória
 *   4. Diferença explícita é FEATURE
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MesaClassificacaoTab } from '@/v2/components/mesa/MesaClassificacaoTab';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { derivarDetalhePendencias } from '@/lib/financeiro/fechamentoPendencias';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Upload, X, LayoutGrid } from 'lucide-react';
import { parseExcelToLote } from '@/v2/lib/excelPreview/parser';
import { matchTodosLotes, type ExtratoMatcher } from '@/v2/lib/excelPreview/matchEngine';
import type { LoteExcel, MatchResult } from '@/v2/lib/excelPreview/types';
import { MesaPareamentoModal } from '@/v2/components/mesa/MesaPareamentoModal';
import { useMesaSessao } from '@/v2/lib/mesaSessao/useMesaSessao';
import { useTransferenciasDecididas } from '@/hooks/useTransferenciasDecididas';
import { criarOuRecuperarSessao, descartarSessao } from '@/v2/lib/mesaSessao/mutations';
import type { MesaSessaoRow } from '@/v2/lib/mesaSessao/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface V2MesaOperacionalProps {
  initialAno?: string;
  initialMes?: number;
}

interface ContaBancaria {
  id: string;
  nome_exibicao: string;
  ativa: boolean;
}

interface ExtratoLinha {
  id: string;
  data_movimento: string;
  valor: number;
  tipo_movimento: string;
  descricao: string;
  documento: string | null;
  status: string;
  saldo_apos: number | null;
}

interface LancamentoLinha {
  id: string;
  data_pagamento: string | null;
  data_competencia: string;
  valor: number;
  sinal: 'entrada' | 'saida';
  descricao: string | null;
  subcentro: string | null;
  status_transacao: string;
  favorecido_id: string | null;
  macro_custo: string | null;
  centro_custo: string | null;
}

interface SaldoMes {
  ano_mes: string;
  saldo_inicial: number;
  saldo_final: number;
  status_mes: string;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function MesaConciliacaoView({ initialAno, initialMes }: V2MesaOperacionalProps) {
  const { clienteAtual } = useCliente();

  // TODOS os states com tipo genérico explícito.
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [contaId, setContaId] = useState<string | null>(null);
  const [ano, setAno] = useState<number>(Number(initialAno) || new Date().getFullYear());
  const [mes, setMes] = useState<number>(initialMes ?? (new Date().getMonth() + 1));
  const [loading, setLoading] = useState<boolean>(false);

  const [extratos, setExtratos] = useState<ExtratoLinha[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoLinha[]>([]);
  const [semExcelCount, setSemExcelCount] = useState<number | null>(null);
  const [saldos, setSaldos] = useState<SaldoMes[]>([]);
  const [extratosConciliados, setExtratosConciliados] = useState<Set<string>>(new Set<string>());
  const [lancsConciliados, setLancsConciliados] = useState<Set<string>>(new Set<string>());

  // PR-Det-5b — transferências OFX confirmadas (por cliente+mês).
  const { confirmadosOfx } = useTransferenciasDecididas({
    clienteId: clienteAtual?.id ?? null,
    anoMes: `${ano}-${String(mes).padStart(2, '0')}`,
  });

  // Pareáveis = extrato bruto MENOS as transferências já confirmadas.
  // Alimenta matching, órfãos e a prop do filho. O `extratos` cru continua
  // visível na lista (fato bruto) e na sessão (hash).
  const extratosPareaveis = useMemo(
    () => extratos.filter((e) => !confirmadosOfx.has(e.id)),
    [extratos, confirmadosOfx],
  );

  // PR2 — Preview Excel × OFX (zero persistência, vive em memória)
  const [previewAtivo, setPreviewAtivo] = useState<boolean>(false);
  const [lotes, setLotes] = useState<LoteExcel[]>([]);
  const [matches, setMatches] = useState<Map<string, MatchResult>>(new Map<string, MatchResult>());
  const [importando, setImportando] = useState<boolean>(false);
  const [erroImport, setErroImport] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PR3 — Modal de pareamento (preserva preview; só fecha a janela)
  const [modalAberto, setModalAberto] = useState<boolean>(false);
  // PR5 — flag de criando sessão (pra evitar duplo clique no botão)
  const [criandoSessao, setCriandoSessao] = useState<boolean>(false);
  // PR6.1B-3 — modal de divergência: surge quando criarOuRecuperarSessao
  // detecta sessão existente com hash de lotes diferente do upload atual.
  const [divergenciaInfo, setDivergenciaInfo] = useState<{
    sessaoExistente: MesaSessaoRow;
    hashNovo: string;
  } | null>(null);

  // ── 1) CARREGA CONTAS DO CLIENTE ─────────────────────────────────────
  useEffect(() => {
    if (!clienteAtual?.id) return;
    (async () => {
      // Cast em supabase: typed client narrow demais nessas queries multi-coluna
      // de leitura; cast preserva runtime sem afetar tipos da UI (ContaBancaria etc).
      const { data } = await (supabase as any)
        .from('financeiro_contas_bancarias')
        .select('id, nome_exibicao, ativa')
        .eq('cliente_id', clienteAtual.id)
        .order('nome_exibicao');
      const lista = (data ?? []) as unknown as ContaBancaria[];
      setContas(lista);
      // Auto-seleciona primeira conta ativa se nenhuma selecionada
      if (!contaId) {
        const primeiraAtiva = lista.find((c) => c.ativa);
        if (primeiraAtiva) setContaId(primeiraAtiva.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteAtual?.id]);

  // ── 2) CARREGA DADOS DO MÊS+CONTA ────────────────────────────────────
  useEffect(() => {
    if (!clienteAtual?.id || !contaId) return;

    const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
    const anoMesAnterior = mes === 1
      ? `${ano - 1}-12`
      : `${ano}-${String(mes - 1).padStart(2, '0')}`;
    const dataIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dataFim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

    setLoading(true);
    (async () => {
      try {
        // A) Extratos OFX do mês+conta
        const { data: ext } = await (supabase as any)
          .from('extrato_bancario_v2')
          .select('id, data_movimento, valor, tipo_movimento, descricao, documento, status, saldo_apos')
          .eq('cliente_id', clienteAtual.id)
          .eq('conta_bancaria_id', contaId)
          .gte('data_movimento', dataIni)
          .lte('data_movimento', dataFim)
          .is('cancelado_em', null)
          .order('data_movimento', { ascending: true })
          .order('created_at', { ascending: true });
        const extratosArr = (ext ?? []) as unknown as ExtratoLinha[];

        // B) Lançamentos sistema (mesmo mês+conta)
        const { data: lan } = await (supabase as any)
          .from('financeiro_lancamentos_v2')
          .select('id, data_pagamento, data_competencia, valor, sinal, descricao, subcentro, status_transacao, favorecido_id, macro_custo, centro_custo')
          .eq('cliente_id', clienteAtual.id)
          .eq('conta_bancaria_id', contaId)
          .eq('ano_mes', anoMes)
          .eq('cancelado', false)
          .eq('cenario', 'realizado')
          .eq('sem_movimentacao_caixa', false)
          .order('data_pagamento', { ascending: true })
          .order('id', { ascending: true });
        const lancsArr = (lan ?? []) as unknown as LancamentoLinha[];

        // C) Saldos mês corrente + anterior
        const { data: sal } = await (supabase as any)
          .from('financeiro_saldos_bancarios_v2')
          .select('ano_mes, saldo_inicial, saldo_final, status_mes')
          .eq('cliente_id', clienteAtual.id)
          .eq('conta_bancaria_id', contaId)
          .in('ano_mes', [anoMesAnterior, anoMes]);
        const saldosArr = (sal ?? []) as unknown as SaldoMes[];

        // D) Conciliações ativas — busca por dois lados (extrato_id ∈ OR lancamento_id ∈)
        const extratoIds = extratosArr.map((e) => e.id);
        const lancsIds = lancsArr.map((l) => l.id);
        const setExtCons = new Set<string>();
        const setLanCons = new Set<string>();

        if (extratoIds.length > 0 || lancsIds.length > 0) {
          const orParts: string[] = [];
          if (extratoIds.length > 0) {
            orParts.push(`extrato_id.in.(${extratoIds.join(',')})`);
          }
          if (lancsIds.length > 0) {
            orParts.push(`lancamento_id.in.(${lancsIds.join(',')})`);
          }
          const { data: con } = await (supabase as any)
            .from('conciliacao_bancaria_itens')
            .select('extrato_id, lancamento_id')
            .eq('cliente_id', clienteAtual.id)
            .is('desfeito_em', null)
            .or(orParts.join(','));
          ((con ?? []) as Array<{ extrato_id: string | null; lancamento_id: string | null }>).forEach((c) => {
            if (c.extrato_id) setExtCons.add(c.extrato_id);
            if (c.lancamento_id) setLanCons.add(c.lancamento_id);
          });
        }

        setExtratos(extratosArr);
        setLancamentos(lancsArr);
        setSaldos(saldosArr);
        setExtratosConciliados(setExtCons);
        setLancsConciliados(setLanCons);
      } finally {
        setLoading(false);
      }
    })();
  }, [clienteAtual?.id, contaId, ano, mes]);

  // ── 3) CÁLCULOS DO HEADER ────────────────────────────────────────────
  //
  // Princípio: saldo_apos do OFX está NULL hoje (dívida técnica do parser, PR3 resolve).
  // NÃO calcular diferença por saldo_final_ofx (não temos esse valor).
  //
  // Fórmula correta:
  //   liquido_ofx_orfao      = soma dos extratos sem conciliação ativa
  //   liquido_sistema_orfao  = soma dos lançamentos sem conciliação ativa (com sinal)
  //   nao_explicado          = abs(liquido_ofx_orfao - liquido_sistema_orfao)
  //
  const calc = useMemo(() => {
    const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
    const anoMesAnterior = mes === 1
      ? `${ano - 1}-12`
      : `${ano}-${String(mes - 1).padStart(2, '0')}`;
    const saldoMes = saldos.find((s) => s.ano_mes === anoMes);
    const saldoAnt = saldos.find((s) => s.ano_mes === anoMesAnterior);

    // OFX — todos (entradas/saídas pra exibir)
    const entradasOfx = extratos
      .filter((e) => Number(e.valor) > 0)
      .reduce((s, e) => s + Number(e.valor), 0);
    const saidasOfx = extratos
      .filter((e) => Number(e.valor) < 0)
      .reduce((s, e) => s + Math.abs(Number(e.valor)), 0);

    // Sistema — APENAS conciliados (entram nos cálculos de explicação)
    const entradasSist = lancamentos
      .filter((l) => l.sinal === 'entrada' && lancsConciliados.has(l.id))
      .reduce((s, l) => s + Number(l.valor), 0);
    const saidasSist = lancamentos
      .filter((l) => l.sinal === 'saida' && lancsConciliados.has(l.id))
      .reduce((s, l) => s + Number(l.valor), 0);

    // Órfãos
    const extOrfaos = extratosPareaveis.filter((e) => !extratosConciliados.has(e.id));
    const lanOrfaos = lancamentos.filter((l) => !lancsConciliados.has(l.id));

    const liquidoOfxOrfao = extOrfaos.reduce((s, e) => s + Number(e.valor), 0);
    const liquidoSistemaOrfao = lanOrfaos.reduce(
      (s, l) => s + (l.sinal === 'entrada' ? 1 : -1) * Number(l.valor),
      0,
    );

    const naoExplicado = Math.abs(liquidoOfxOrfao - liquidoSistemaOrfao);

    return {
      saldoInicialSistema: saldoMes?.saldo_inicial ?? saldoAnt?.saldo_final ?? null,
      saldoFinalSistema: saldoMes?.saldo_final ?? null,
      statusMes: saldoMes?.status_mes ?? 'aberto',
      entradasOfx,
      saidasOfx,
      entradasSist,
      saidasSist,
      naoExplicado,
      liquidoOfxOrfao,
      liquidoSistemaOrfao,
      countConciliado: extratosConciliados.size,
      countTransfConfirmada: extratos.length - extratosPareaveis.length,
      countBancoOrfao: extOrfaos.length,
      countApontamentoOrfao: lanOrfaos.length,
    };
  }, [extratos, extratosPareaveis, lancamentos, saldos, extratosConciliados, lancsConciliados, ano, mes]);

  type StatusOverall = 'explicado' | 'parcial' | 'nao_explicado';
  const statusOverall: StatusOverall =
    calc.naoExplicado < 0.01 && calc.countBancoOrfao === 0 && calc.countApontamentoOrfao === 0
      ? 'explicado'
      : calc.countConciliado > 0
        ? 'parcial'
        : 'nao_explicado';

  const fmtBRL = (v: number): string =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

  // Sem classificação — mesma lógica do 01B (derivarDetalhePendencias), contando
  // lançamentos distintos realizados que faltam subcentro/favorecido/macro/centro.
  const semClassificacaoCount = useMemo(
    () =>
      derivarDetalhePendencias(
        lancamentos
          .filter((l) => l.status_transacao === 'realizado')
          .map((l) => ({
            ...l,
            conta_bancaria_id: contaId,
          })),
      ).length,
    [lancamentos, contaId],
  );

  const contaSelecionada = contas.find((c) => c.id === contaId);

  // ── PR2 PREVIEW EXCEL ────────────────────────────────────────────────
  // Handlers: parse + match em memória. Zero persistência.
  async function onArquivosSelecionados(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImportando(true);
    setErroImport(null);
    try {
      const novosLotes: LoteExcel[] = [];
      for (const f of Array.from(files)) {
        if (!f.name.toLowerCase().endsWith('.xlsx')) {
          throw new Error(`Arquivo "${f.name}" não é .xlsx`);
        }
        const lote = await parseExcelToLote(f);
        novosLotes.push(lote);
      }
      const todasLinhas = novosLotes.flatMap((l) => l.linhas);
      const ofxMatcher: ExtratoMatcher[] = extratosPareaveis.map((e) => ({
        id: e.id, data_movimento: e.data_movimento,
        valor: Number(e.valor), descricao: e.descricao,
      }));
      const newMatches = matchTodosLotes(todasLinhas, ofxMatcher);
      setLotes(novosLotes);
      setMatches(newMatches);
      setPreviewAtivo(true);
    } catch (err) {
      setErroImport((err as Error).message);
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function fecharPreview() {
    setPreviewAtivo(false);
    setLotes([]);
    setMatches(new Map<string, MatchResult>());
    setErroImport(null);
  }

  // Recalcula matches quando OFX visualizado muda (operador troca mês/conta)
  useEffect(() => {
    if (!previewAtivo || lotes.length === 0) return;
    const todasLinhas = lotes.flatMap((l) => l.linhas);
    const ofxMatcher: ExtratoMatcher[] = extratosPareaveis.map((e) => ({
      id: e.id, data_movimento: e.data_movimento,
      valor: Number(e.valor), descricao: e.descricao,
    }));
    setMatches(matchTodosLotes(todasLinhas, ofxMatcher));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extratosPareaveis, previewAtivo, lotes]);

  const previewStats = useMemo(() => {
    if (!previewAtivo) {
      return { total: 0, forte: 0, fraco: 0, nenhum: 0,
               flagSemDataRef: 0, flagCompetenciaForaMes: 0,
               flagTipoInconsistente: 0, flagContaInvalida: 0 };
    }
    const linhas = lotes.flatMap((l) => l.linhas);
    let forte = 0, fraco = 0, nenhum = 0;
    let flagSemDataRef = 0, flagCompetenciaForaMes = 0,
        flagTipoInconsistente = 0, flagContaInvalida = 0;
    linhas.forEach((l) => {
      const m = matches.get(l.chaveLinha);
      if (m?.faixa === 'forte') forte++;
      else if (m?.faixa === 'fraco') fraco++;
      else nenhum++;
      if (l.flags.semDataRef) flagSemDataRef++;
      if (l.flags.competenciaForaDoMes) flagCompetenciaForaMes++;
      if (l.flags.tipoInconsistente) flagTipoInconsistente++;
      if (l.flags.contaInvalida) flagContaInvalida++;
    });
    return { total: linhas.length, forte, fraco, nenhum,
             flagSemDataRef, flagCompetenciaForaMes,
             flagTipoInconsistente, flagContaInvalida };
  }, [previewAtivo, lotes, matches]);

  // PR5 — sessão persistida (cliente + conta + ano_mes). Fetch reativo:
  // mesmo se mudar mês/conta, query atualiza.
  const anoMesPR5 = `${ano}-${String(mes).padStart(2, '0')}`;
  const {
    data: sessaoCompleta,
    refetch: refetchSessao,
  } = useMesaSessao(
    clienteAtual?.id ?? null,
    contaId,
    anoMesPR5,
  );

  // DIAGNÓSTICO DA SESSÃO — "Pendentes do Excel" = cobertura.sem_excel do fn_diag.
  // RPC não tipado nos types gerados → (supabase as any).rpc (padrão do projeto, TSC neutro).
  useEffect(() => {
    const sid = sessaoCompleta?.sessao?.id;
    if (!sid) {
      setSemExcelCount(null);
      return;
    }
    let ativo = true;
    (async () => {
      const { data, error } = await (supabase as any).rpc('fn_diag_fechamento_sessao', {
        p_sessao_id: sid,
      });
      if (!ativo) return;
      const cobertura = error
        ? null
        : (data as { cobertura?: { sem_excel?: number } } | null)?.cobertura;
      setSemExcelCount(cobertura?.sem_excel ?? null);
    })();
    return () => {
      ativo = false;
    };
  }, [sessaoCompleta?.sessao?.id]);

  // Handler: cria/recupera sessão antes de abrir modal.
  // PR6.1B-3 — trata discriminated union de criarOuRecuperarSessao.
  async function abrirMesaPareamento() {
    if (!clienteAtual?.id || !contaId || criandoSessao) return;
    setCriandoSessao(true);
    try {
      const resultado = await criarOuRecuperarSessao(
        clienteAtual.id,
        contaId,
        anoMesPR5,
        lotes,
        extratos.map((e) => e.id),
      );

      if (resultado.tipo === 'divergencia') {
        // Hash dos lotes novos ≠ hash da sessão existente → operador decide.
        setDivergenciaInfo({
          sessaoExistente: resultado.sessaoExistente,
          hashNovo: resultado.hashNovo,
        });
        return;
      }

      // 'criada' | 'existente_igual' → abre Mesa direto.
      await refetchSessao();
      setModalAberto(true);
    } finally {
      setCriandoSessao(false);
    }
  }

  // PR6.1B-3 — operador opta por continuar a sessão existente: upload novo
  // é ignorado (sessão imutável preserva os arquivos originais).
  async function continuarSessaoAnterior() {
    setDivergenciaInfo(null);
    await refetchSessao();
    setModalAberto(true);
  }

  // PR6.1B-3 — operador opta por descartar a sessão antiga e iniciar uma
  // nova com os arquivos atuais. CASCADE limpa mesa_par e staging vinculados.
  async function descartarECriarNova() {
    if (!divergenciaInfo || !clienteAtual?.id || !contaId) return;
    setCriandoSessao(true);
    try {
      await descartarSessao(divergenciaInfo.sessaoExistente.id);
      setDivergenciaInfo(null);
      const resultado = await criarOuRecuperarSessao(
        clienteAtual.id,
        contaId,
        anoMesPR5,
        lotes,
        extratos.map((e) => e.id),
      );
      // Esperado 'criada' (sessão antiga foi apagada). Defensivo: só
      // abrimos Mesa se NÃO retornou divergência (corrida extrema).
      if (resultado.tipo !== 'divergencia') {
        await refetchSessao();
        setModalAberto(true);
      }
    } finally {
      setCriandoSessao(false);
    }
  }

  function cancelarDivergencia() {
    setDivergenciaInfo(null);
  }

  // ── 4) RENDER ────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-3 max-w-[1400px] mx-auto">

      {/* ── SELETORES ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={contaId ?? ''}
          onChange={(e) => setContaId(e.target.value)}
          className="text-xs h-8 px-2 rounded-md border border-input bg-background"
          aria-label="Conta bancária"
        >
          {contas.filter((c) => c.ativa).map((c) => (
            <option key={c.id} value={c.id}>{c.nome_exibicao}</option>
          ))}
        </select>

        <select
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          className="text-xs h-8 px-2 rounded-md border border-input bg-background"
          aria-label="Ano"
        >
          {[ano - 1, ano, ano + 1].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <div className="flex gap-0.5 flex-wrap">
          {MESES.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => setMes(i + 1)}
              className={cn(
                'h-8 px-2.5 rounded text-[11px] font-medium transition-colors',
                mes === i + 1
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* ── BLOCO 1 — HEADER SOBERANO ─────────────────────────────── */}
      <Card className="sticky top-0 z-10 p-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          {contaSelecionada?.nome_exibicao ?? '—'}
          {' · '}{String(mes).padStart(2, '0')}/{ano}
          {' · '}
          <span className="text-foreground">
            {calc.statusMes === 'fechado' ? 'CONTA FECHADA' : 'CONTA ABERTA'}
          </span>
          {' · '}{extratos.length} mov.
          {' · '}{lancamentos.length} lanç.
        </div>

        <div className="grid grid-cols-3 gap-4 text-xs">
          {/* OFX */}
          <div className="space-y-0.5">
            <div className="text-[10px] font-bold text-foreground mb-1">BANCO (OFX real)</div>
            <div className="flex justify-between text-muted-foreground">
              <span>Saldo inicial:</span>
              <span
                className="tabular-nums"
                title="saldo_apos NULL no parser OFX atual — corrigir em PR3"
              >?</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">+ Entradas:</span>
              <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                {fmtBRL(calc.entradasOfx)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">- Saídas:</span>
              <span className="tabular-nums text-rose-600 dark:text-rose-400">
                {fmtBRL(calc.saidasOfx)}
              </span>
            </div>
            <div className="flex justify-between font-semibold border-t border-border pt-0.5 mt-0.5">
              <span>= Saldo final:</span>
              <span
                className="tabular-nums text-muted-foreground"
                title="saldo_apos NULL — corrigir em PR3"
              >?</span>
            </div>
          </div>

          {/* SISTEMA */}
          <div className="space-y-0.5">
            <div className="text-[10px] font-bold text-foreground mb-1">SISTEMA (apontamento)</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo inicial:</span>
              <span className="tabular-nums">
                {calc.saldoInicialSistema != null ? fmtBRL(calc.saldoInicialSistema) : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">+ Conciliados:</span>
              <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                {fmtBRL(calc.entradasSist)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">- Conciliados:</span>
              <span className="tabular-nums text-rose-600 dark:text-rose-400">
                {fmtBRL(calc.saidasSist)}
              </span>
            </div>
            <div className="flex justify-between font-semibold border-t border-border pt-0.5 mt-0.5">
              <span>= Saldo final:</span>
              <span className="tabular-nums">
                {calc.saldoFinalSistema != null ? fmtBRL(calc.saldoFinalSistema) : '—'}
              </span>
            </div>
          </div>

          {/* DIAGNÓSTICO DA SESSÃO */}
          <div className="space-y-0.5">
            <div className="text-[10px] font-bold text-foreground mb-1">
              DIAGNÓSTICO DA SESSÃO
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lanç. sistema:</span>
              <span className="tabular-nums">{lancamentos.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Conciliados:</span>
              <span className="tabular-nums">{calc.countConciliado}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transferências:</span>
              <span className="tabular-nums">{calc.countTransfConfirmada}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Banco sem sistema:</span>
              <span className="tabular-nums">{calc.countBancoOrfao}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sistema sem OFX:</span>
              <span className="tabular-nums">{calc.countApontamentoOrfao}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pendentes do Excel:</span>
              <span className="tabular-nums">{semExcelCount ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sem classificação:</span>
              <span
                className={
                  semClassificacaoCount > 0
                    ? 'tabular-nums text-rose-600 font-semibold'
                    : 'tabular-nums text-muted-foreground'
                }
              >
                {semClassificacaoCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Agrupamentos:</span>
              <span className="tabular-nums text-muted-foreground">—</span>
            </div>
          </div>
        </div>

        {/* DIFERENÇA */}
        <div className={cn(
          'mt-2 px-2 py-1.5 rounded text-xs flex items-center justify-between',
          statusOverall === 'explicado' && 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100',
          statusOverall === 'parcial' && 'bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100',
          statusOverall === 'nao_explicado' && 'bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-100',
        )}>
          <span className="font-semibold">
            {statusOverall === 'explicado' && '✅ EXPLICADO'}
            {statusOverall === 'parcial' && '⚠️ PARCIAL'}
            {statusOverall === 'nao_explicado' && '❌ NÃO EXPLICADO'}
            {': '}
            {fmtBRL(calc.naoExplicado)}
          </span>
        </div>
      </Card>

      {/* ── PR2: Botão Importar Excel (preview) ──────────────────────── */}
      {!previewAtivo && (
        <div className="flex items-center gap-2 justify-end">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            multiple
            className="hidden"
            onChange={(e) => onArquivosSelecionados(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importando}
            className="text-xs"
          >
            <Upload className="h-3 w-3 mr-1.5" />
            {importando ? 'Lendo Excel…' : 'Importar Excel (preview)'}
          </Button>
          {erroImport && (
            <span className="text-[10px] text-rose-600">{erroImport}</span>
          )}
        </div>
      )}

      {/* ── PR2: Barra de preview ativo ───────────────────────────────── */}
      {previewAtivo && (
        <Card className="p-2 border-l-[4px] border-l-blue-500 bg-blue-50/40 dark:bg-blue-950/20">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className="font-semibold text-foreground">📁 PREVIEW Excel ativo</span>
              <span className="text-muted-foreground">
                {lotes.length} arquivo(s) · {previewStats.total} linhas
              </span>
              <span className="text-blue-700 dark:text-blue-300 font-medium">
                ✓ {previewStats.forte} forte
              </span>
              <span className="text-amber-700 dark:text-amber-300 font-medium">
                ⚠ {previewStats.fraco} fraco
              </span>
              <span className="text-rose-700 dark:text-rose-300 font-medium">
                ✗ {previewStats.nenhum} sem match
              </span>
              {(previewStats.flagSemDataRef + previewStats.flagCompetenciaForaMes
                + previewStats.flagTipoInconsistente + previewStats.flagContaInvalida) > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  (flags: {previewStats.flagSemDataRef} sem data |
                  {' '}{previewStats.flagCompetenciaForaMes} comp. fora do mês |
                  {' '}{previewStats.flagTipoInconsistente} tipo inconsist. |
                  {' '}{previewStats.flagContaInvalida} conta inválida)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="default"
                size="sm"
                onClick={() => { void abrirMesaPareamento(); }}
                disabled={criandoSessao}
                className="text-xs h-7"
              >
                <LayoutGrid className="h-3 w-3 mr-1" />
                {criandoSessao ? 'Preparando…' : 'Abrir Mesa de Pareamento'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={fecharPreview}
                className="text-xs h-7"
              >
                <X className="h-3 w-3 mr-1" />
                Fechar Preview
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── BLOCO 2 — SPLIT 50/50 ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* Esquerda — OFX */}
        <Card className="p-2 max-h-[calc(100vh-280px)] flex flex-col">
          <div className="text-[10px] font-bold uppercase text-muted-foreground px-1 pb-1">
            Extrato OFX ({extratos.length} movimentos)
          </div>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
            {!loading && extratos.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8">
                Sem movimentos OFX no período.
              </div>
            )}
            {!loading && extratos.map((e) => {
              const conciliado = extratosConciliados.has(e.id);
              const transfConfirmada = confirmadosOfx.has(e.id);
              const valorNum = Number(e.valor);
              return (
                <div
                  key={e.id}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 text-xs border-l-[3px] rounded-r hover:bg-muted/30',
                    transfConfirmada
                      ? 'border-l-violet-500'
                      : conciliado ? 'border-l-emerald-500' : 'border-l-rose-500',
                  )}
                >
                  <span className="text-[10px] text-muted-foreground tabular-nums w-12 shrink-0">
                    {format(new Date(e.data_movimento + 'T12:00:00'), 'dd/MM', { locale: ptBR })}
                  </span>
                  <span className="flex-1 truncate text-foreground" title={e.descricao}>
                    {e.descricao}
                  </span>
                  <span
                    className={cn(
                      'tabular-nums shrink-0 font-medium',
                      valorNum >= 0 ? 'text-emerald-600' : 'text-rose-600',
                    )}
                  >
                    {fmtBRL(valorNum)}
                  </span>
                  <Badge
                    variant={transfConfirmada ? 'secondary' : conciliado ? 'default' : 'destructive'}
                    className={cn(
                      'text-[9px] h-4 px-1.5 shrink-0',
                      transfConfirmada && 'bg-violet-100 text-violet-700 border-violet-300',
                    )}
                  >
                    {transfConfirmada ? '⇄ Transferência' : conciliado ? 'Conciliado' : 'Banco órfão'}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Direita — Sistema OU Preview Excel (PR2) */}
        <Card className="p-2 max-h-[calc(100vh-280px)] flex flex-col">
          <div className="text-[10px] font-bold uppercase text-muted-foreground px-1 pb-1">
            {previewAtivo
              ? `Preview Excel (${previewStats.total} linhas de ${lotes.length} arquivo${lotes.length === 1 ? '' : 's'})`
              : `Lançamentos sistema (${lancamentos.length} lançamentos)`
            }
          </div>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
            {!loading && previewAtivo && (
              // Render linhas do Excel (memória) com badge por faixa de match
              lotes.flatMap((l) => l.linhas).length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-8">
                  Excel sem linhas válidas.
                </div>
              ) : (
                lotes.flatMap((l) => l.linhas).map((linha) => {
                  const m = matches.get(linha.chaveLinha);
                  const faixa = m?.faixa ?? 'nenhum';
                  const data = linha.dataPagamento ?? linha.dataCompetencia;
                  const valorSinalizado = (linha.sinal === 'entrada' ? 1 : -1) * (linha.valorCentavos / 100);
                  const corBorda =
                    faixa === 'forte' ? 'border-l-blue-500' :
                    faixa === 'fraco' ? 'border-l-amber-500' :
                    'border-l-rose-500';
                  const badgeLabel =
                    faixa === 'forte' ? `Forte (${m?.score ?? 0})` :
                    faixa === 'fraco' ? `Fraco (${m?.score ?? 0})` :
                    'Sem match';
                  const titulo = `${linha.fornecedor} · ${linha.subcentro}${linha.observacao ? ' · ' + linha.observacao : ''}`;
                  return (
                    <div
                      key={linha.chaveLinha}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 text-xs border-l-[3px] rounded-r hover:bg-muted/30',
                        corBorda,
                        linha.flags.tipoInconsistente && 'bg-rose-50/30 dark:bg-rose-950/10',
                      )}
                      title={titulo}
                    >
                      <span className="text-[10px] text-muted-foreground tabular-nums w-12 shrink-0">
                        {data ? format(new Date(data + 'T12:00:00'), 'dd/MM', { locale: ptBR }) : '—'}
                      </span>
                      <span className="flex-1 truncate text-foreground">
                        {linha.fornecedor || <span className="italic">{linha.subcentro}</span>}
                        {linha.flags.semDataRef && <span className="text-amber-600 ml-1">⚠</span>}
                      </span>
                      <span className={cn('tabular-nums shrink-0 font-medium',
                        linha.sinal === 'entrada' ? 'text-emerald-600' : 'text-rose-600',
                      )}>
                        {fmtBRL(valorSinalizado)}
                      </span>
                      <Badge
                        variant={faixa === 'forte' ? 'default' : faixa === 'fraco' ? 'secondary' : 'destructive'}
                        className="text-[9px] h-4 px-1.5 shrink-0"
                      >
                        {badgeLabel}
                      </Badge>
                    </div>
                  );
                })
              )
            )}
            {!loading && !previewAtivo && lancamentos.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8">
                Sem lançamentos no período.
              </div>
            )}
            {!loading && !previewAtivo && lancamentos.map((l) => {
              const conciliado = lancsConciliados.has(l.id);
              const data = l.data_pagamento ?? l.data_competencia;
              const valorSinalizado = (l.sinal === 'entrada' ? 1 : -1) * Number(l.valor);
              return (
                <div
                  key={l.id}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 text-xs border-l-[3px] rounded-r hover:bg-muted/30',
                    conciliado ? 'border-l-emerald-500' : 'border-l-amber-500',
                  )}
                >
                  <span className="text-[10px] text-muted-foreground tabular-nums w-12 shrink-0">
                    {data ? format(new Date(data + 'T12:00:00'), 'dd/MM', { locale: ptBR }) : '—'}
                  </span>
                  <span className="flex-1 truncate text-foreground" title={l.descricao ?? ''}>
                    {l.descricao || (
                      <span className="italic text-muted-foreground">
                        {l.subcentro ?? '—'}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'tabular-nums shrink-0 font-medium',
                      l.sinal === 'entrada' ? 'text-emerald-600' : 'text-rose-600',
                    )}
                  >
                    {fmtBRL(valorSinalizado)}
                  </span>
                  <Badge
                    variant={conciliado ? 'default' : 'secondary'}
                    className="text-[9px] h-4 px-1.5 shrink-0"
                  >
                    {conciliado ? 'Conciliado' : 'Apontamento órfão'}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>

      </div>

      {/* PR3 — Modal largo de pareamento (3 colunas). Aprovações em memória. */}
      {previewAtivo && contaSelecionada && clienteAtual?.id && (
        <MesaPareamentoModal
          open={modalAberto}
          onOpenChange={setModalAberto}
          clienteId={clienteAtual.id}
          contaNome={contaSelecionada.nome_exibicao ?? '—'}
          contaId={contaSelecionada.id}
          anoMes={`${ano}-${String(mes).padStart(2, '0')}`}
          saldoOfxResumo={`${fmtBRL(calc.entradasOfx)} / ${fmtBRL(calc.saidasOfx)}`}
          naoExplicado={fmtBRL(calc.naoExplicado)}
          lotes={lotes}
          matches={matches}
          extratos={extratosPareaveis.map((e) => ({
            id: e.id,
            data_movimento: e.data_movimento,
            descricao: e.descricao,
            valor: Number(e.valor),
          }))}
          sessaoCompleta={sessaoCompleta ?? null}
          onSessaoMudou={refetchSessao}
        />
      )}

      {/* PR6.1B-3 — modal de divergência de upload */}
      <AlertDialog
        open={!!divergenciaInfo}
        onOpenChange={(o) => {
          if (!o) cancelarDivergencia();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sessão já iniciada para esta conta/mês</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <div>Encontramos uma sessão já iniciada para esta conta/mês.</div>
                <div>
                  Os arquivos enviados agora são diferentes dos arquivos usados
                  nessa sessão.
                </div>
                {divergenciaInfo?.sessaoExistente.updated_at && (
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    Sessão anterior atualizada em:{' '}
                    {new Date(
                      divergenciaInfo.sessaoExistente.updated_at,
                    ).toLocaleString('pt-BR')}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <AlertDialogAction
              onClick={() => {
                void continuarSessaoAnterior();
              }}
              className="w-full"
            >
              Continuar sessão anterior
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                void descartarECriarNova();
              }}
              className="w-full bg-rose-600 hover:bg-rose-700"
            >
              Descartar sessão anterior e iniciar nova com estes arquivos
            </AlertDialogAction>
            <AlertDialogCancel className="w-full mt-0">Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

/**
 * V2MesaOperacional — wrapper de Tabs (PR-M2).
 *
 * Tab 1 "Conciliação OFX" mantém o componente original (renomeado
 * para MesaConciliacaoView). Tab 2 "Classificação Excel" usa o
 * fluxo PR-M (parser local → RPC populate → revisão → RPC apply).
 *
 * Default Radix: TabsContent inativo DESMONTA. Cache do React Query
 * preserva dados entre trocas de tab.
 */
export function V2MesaOperacional(props: V2MesaOperacionalProps) {
  return (
    // Sem padding aqui — cada tab cuida do próprio padding interno
    // (evita conflito com o `p-4` que MesaConciliacaoView já aplica).
    <Tabs defaultValue="conciliacao">
      <div className="px-4 pt-3">
        <TabsList>
          <TabsTrigger value="conciliacao">Conciliação OFX</TabsTrigger>
          <TabsTrigger value="classificacao">Classificação Excel</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="conciliacao" className="mt-0">
        <MesaConciliacaoView {...props} />
      </TabsContent>
      <TabsContent value="classificacao" className="mt-0 p-4 max-w-[1400px] mx-auto">
        <MesaClassificacaoTab />
      </TabsContent>
    </Tabs>
  );
}
