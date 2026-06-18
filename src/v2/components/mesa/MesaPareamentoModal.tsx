import { useEffect, useMemo, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup,
} from '@/components/ui/command';
import { Check, X, ArrowLeftRight, ArrowRight, Undo2, AlertTriangle, Search, Pencil, Globe2, Building2, HelpCircle, Coins } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCliente } from '@/contexts/ClienteContext';
import { cn } from '@/lib/utils';
import {
  useCatalogoCliente,
  type CatalogoCliente,
  type SubcentroUsado,
  type NaturezaSubcentro,
} from '@/v2/lib/excelPreview/catalogoCliente';
import { sugerirTodasLinhas, type Sugestao } from '@/v2/lib/excelPreview/sugestaoEngine';
import type { LoteExcel, MatchResult, ExcelLinhaNormalizada } from '@/v2/lib/excelPreview/types';
// PR5 — tipos de domínio agora moram em src/v2/lib/mesaSessao/types.ts
// (fonte única, sem dep cíclica com componentes React)
import type {
  ParCorrecao,
  ParEstado,
  AprovacaoLocal,
  MesaDecisao,
  MesaOfxValidacaoStatus,
  SessaoCompleta,
} from '@/v2/lib/mesaSessao/types';
import {
  salvarPares,
  salvarOfxValidacoes,
  finalizarSessao,
  reabrirSessao,
  descartarSessao,
} from '@/v2/lib/mesaSessao/mutations';
import { useSalvamentoAuto } from '@/v2/lib/mesaSessao/useSalvamentoAuto';
// PR6.1 — gerar staging ao finalizar sessão
import { gerarStagingDaSessao } from '@/v2/lib/staging/mutations';
import type { ResultadoGeracaoStaging } from '@/v2/lib/staging/types';
// PR6.1A — aba interna substitui página V2StagingRevisao (deletada)
import { useStaging } from '@/v2/lib/staging/useStaging';
import { MesaStagingTab } from './MesaStagingTab';
// PR6.1C — fonte única de validação de aprovação
import { validarAprovacao } from '@/v2/lib/mesa/validacao';
// PR6.1D — resolução de conta-da-linha-Excel para o cadastro (helper soberano)
import {
  resolverContaPorTexto,
  type ContaBancariaRow,
  type ContaResolvida,
} from '@/v2/lib/mesa/resolverConta';
// PR6.1 — query fresh direto no banco depois de salvar+finalizar, evitando
// stale state. Não usamos sessaoCompleta.pares do cache local pra gerar staging.
import { supabase } from '@/integrations/supabase/client';
import type { MesaSessaoRow, MesaParRow } from '@/v2/lib/mesaSessao/types';

interface OfxItem {
  id: string;
  data_movimento: string;
  descricao: string;
  valor: number;
}

// PR4.1 — fallbacks pra consolidarFotografia
interface ConsolidarFallbacks {
  dataPagamentoExcel: string | null;
  dataCompetenciaExcel: string | null;
  dataMovimentoOfx: string | null;
  produtoExcel: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  contaNome: string;
  contaId: string;
  anoMes: string;
  saldoOfxResumo: string;
  naoExplicado: string;
  lotes: LoteExcel[];
  matches: Map<string, MatchResult>;
  extratos: OfxItem[];
  // PR5 — sessão persistida (opcional; null = sem sessão ainda)
  sessaoCompleta: SessaoCompleta | null;
  onSessaoMudou: () => Promise<unknown>;
}

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// PR4 + PR4.1 — consolida fotografia da aprovação. Helper puro, sem state.
// Recebe fallbacks (PR4.1) para chain de data competência e produto.
function consolidarFotografia(
  sug: Sugestao | undefined,
  cor: ParCorrecao | null,
  ofxIdVinculado: string | null,
  fallbacks: ConsolidarFallbacks,
): AprovacaoLocal {
  const usaCorrecao = cor !== null;
  return {
    aprovadoEm: new Date().toISOString(),
    origem_aprovacao: usaCorrecao ? 'corrigido' : 'sugestao_direta',
    contaId: cor?.contaId ?? sug?.contaSugerida?.id ?? null,
    contaRotulo: cor?.contaRotulo ?? sug?.contaSugerida?.rotulo ?? null,
    fazendaId: cor?.fazendaId ?? sug?.fazendaSugerida?.id ?? null,
    fazendaNome: cor?.fazendaNome ?? sug?.fazendaSugerida?.nome ?? null,
    fornecedorId: cor?.fornecedorId ?? sug?.fornecedorOficial?.id ?? null,
    fornecedorNome: cor?.fornecedorNome ?? sug?.fornecedorOficial?.nome ?? null,
    fornecedorMarcadoNovo: cor?.fornecedorMarcadoNovo ?? false,
    // PR4.1 — chain de data competência (editável: cor → Excel comp → Excel pag → OFX)
    dataCompetencia:
      cor?.dataCompetencia
      ?? fallbacks.dataCompetenciaExcel
      ?? fallbacks.dataPagamentoExcel
      ?? fallbacks.dataMovimentoOfx
      ?? null,
    // PR6.2-M0.6 — chain de data PAGAMENTO (NÃO editável pelo operador).
    // Prioridade SOBERANA: OFX banco real → Data_Ref Excel → Data_Competencia Excel.
    dataPagamento:
      fallbacks.dataMovimentoOfx
      ?? fallbacks.dataPagamentoExcel
      ?? fallbacks.dataCompetenciaExcel
      ?? null,
    subcentro: cor?.subcentro ?? sug?.subcentroSugerido?.subcentro ?? '',
    macro: cor?.macro_custo ?? sug?.subcentroSugerido?.macro_custo ?? null,
    grupo: cor?.grupo_custo ?? sug?.subcentroSugerido?.grupo_custo ?? null,
    centro: cor?.centro_custo ?? sug?.subcentroSugerido?.centro_custo ?? null,
    // PR4.1 — produto via chain
    produto: cor?.produto ?? fallbacks.produtoExcel ?? null,
    descricao: cor?.descricao ?? null,
    ofxIdVinculado,
  };
}

// PR4.1 — monta fallbacks pra consolidarFotografia.
// Helper puro: lê estado já existente sem produzir efeito colateral.
function buildFallbacks(
  excelKey: string,
  ofxIdAtivo: string | null,
  linhasExcel: ExcelLinhaNormalizada[],
  extratos: OfxItem[],
): ConsolidarFallbacks {
  const linha = linhasExcel.find((l) => l.chaveLinha === excelKey);
  const ofx = ofxIdAtivo ? extratos.find((e) => e.id === ofxIdAtivo) : null;
  return {
    dataPagamentoExcel: linha?.dataPagamento ?? null,
    dataCompetenciaExcel: linha?.dataCompetencia ?? null,
    dataMovimentoOfx: ofx?.data_movimento ?? null,
    produtoExcel: linha?.produto ?? null,
  };
}

// PR4.2 — label legível de natureza para o operador.
function labelNatureza(n: NaturezaSubcentro | null): string {
  if (n === 'entrada') return 'entrada';
  if (n === 'saida') return 'saída';
  if (n === 'transferencia') return 'transferência';
  return 'desconhecida';
}

// PR3.2 — abrevia rótulo da conta sugerida para virar tag de 8 chars no máximo.
function abreviarBanco(rotulo: string): string {
  const palavras = rotulo
    .replace(/[—\-]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 2 && !/^\d+$/.test(p));
  if (palavras.length === 0) return rotulo.slice(0, 6);
  const p = palavras[0];
  const lower = p.toLowerCase();
  if (lower.startsWith('banco') && palavras.length > 1) return palavras[1].slice(0, 8);
  if (lower === 'itau' || lower === 'itaú') return 'Itaú';
  if (lower === 'bb' || lower === 'brasil') return 'BB';
  return p.slice(0, 8);
}

// PR6.1D-5 — Helper puro: linha é transferência (entre contas) se o tipo
// bruto do Excel começa com '3-' ou contém 'transfer'. Padrão idêntico ao
// derivarTipoOperacao do PR6.1C-1 (validacao.ts). Reusado pelo pré-filtro
// das pills (PR6.1D-3) e pela marcação visual de linha (PR6.1D-5).
function ehTransferencia(linha: ExcelLinhaNormalizada): boolean {
  const t = (linha.raw?.Tipo ?? '').toString().toLowerCase().trim();
  return t.startsWith('3-') || t.includes('transfer');
}

// PR6.1D-4 — Badge curto que indica a conta-da-linha-Excel resolvida via
// resolverContaPorTexto (helper soberano do PR6.1D-1). 3 estados visuais:
//   - Match conta-da-sessao: verde (linha pertence à conta do OFX)
//   - Resolvido p/ outra conta: primary (movimento cross-bank do Excel
//     multi-conta)
//   - Não resolvido: amber + ícone "?" (defeito de cadastro ou parser)
// Cor reflete SEMÂNTICA DE MATCH (não banco). Cor por banco viraria
// mosaico visual.
function BadgeContaResolvida({
  resolvido,
  ehContaDaSessao,
}: {
  resolvido: ContaResolvida | null;
  ehContaDaSessao: boolean;
}) {
  if (!resolvido) {
    return (
      <span
        className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-[1px] rounded leading-none bg-amber-500/15 text-amber-700 border border-amber-500/30"
        title="Conta não reconhecida"
        aria-label="Conta não reconhecida"
      >
        <HelpCircle className="h-2.5 w-2.5" aria-hidden="true" />
        <span>?</span>
      </span>
    );
  }
  const labelCru = resolvido.nome_exibicao;
  const label =
    labelCru.length > 12 ? labelCru.slice(0, 11) + '…' : labelCru;
  const cor = ehContaDaSessao
    ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30'
    : 'bg-primary/10 text-primary border border-primary/30';
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-[1px] rounded leading-none uppercase',
        cor,
      )}
      title={resolvido.nome_exibicao}
    >
      <Building2 className="h-2.5 w-2.5" aria-hidden="true" />
      <span className="tracking-tight">{label}</span>
    </span>
  );
}

type FiltroMostrar = 'todos' | 'forte' | 'fraco' | 'sem_match'
                   | 'pendentes' | 'aprovados' | 'rejeitados' | 'orfaos'
                   | 'banco_orfao' | 'corrigidos';
type FiltroOrdem = 'score_desc' | 'valor_desc' | 'valor_asc' | 'data_asc' | 'data_desc' | 'original';
type FiltroEscopo = 'todos' | 'desta_conta' | 'outras_contas' | 'sem_inferencia' | 'sem_ofx';
// PR6.1D-3 — escopo via pills (puramente visual, atua na lista renderizada
// do Modo Excel; não altera Map pares/aprovacoes, contadores ou staging)
type EscopoFiltro = 'todas' | 'sessao' | 'transferencias' | 'externos';

interface ParEscopo {
  isDestaConta: boolean;
  isDivergente: boolean;
  isContaIndefinida: boolean;
  tagBanco: string | null;
  rotuloConta: string | null;
}

// PR3.3 — Modo OFX (visão bancária). PR5 — OfxValidacaoStatus movida para
// mesaSessao/types.ts como MesaOfxValidacaoStatus.
type ModoVisualizacao = 'excel' | 'ofx';
type FiltroMostrarOfx = 'todos' | 'pendentes' | 'com_sugestao'
                      | 'sem_sugestao' | 'aprovados' | 'ofx_orfao_validado';
type FiltroOrdemOfx = 'original' | 'data_asc' | 'data_desc'
                    | 'valor_desc' | 'valor_asc' | 'score_desc';

interface CandidatoExcelParaOfx {
  excelKey: string;
  score: number;
  faixa: 'forte' | 'fraco' | 'nenhum';
  linha: ExcelLinhaNormalizada;
}

export function MesaPareamentoModal({
  open, onOpenChange, clienteId, contaNome, contaId, anoMes,
  saldoOfxResumo, naoExplicado, lotes, matches, extratos,
  sessaoCompleta, onSessaoMudou,
}: Props) {
  // PR6.1A — staging vive em aba interna; pré-fetch usa o cache do TanStack
  const queryClient = useQueryClient();
  // PR6.1D-2 — header soberano exibe nome do cliente na linha de metadados
  const { clienteAtual } = useCliente();
  // PR6.1 — resultado da última geração de staging + flag de operação em curso
  const [resultadoStaging, setResultadoStaging] = useState<ResultadoGeracaoStaging | null>(null);
  const [gerandoStaging, setGerandoStaging] = useState<boolean>(false);
  const [erroStaging, setErroStaging] = useState<string | null>(null);
  // PR6.1A — aba ativa do modal (sempre default 'pareamento' ao reabrir)
  const [abaAtiva, setAbaAtiva] = useState<'pareamento' | 'staging'>('pareamento');
  // PR6.1A — dot indicator na aba "Revisão Staging" quando há registros gerados
  const { data: stagingData } = useStaging(sessaoCompleta?.sessao.id ?? null);
  const stagingTemRegistros = (stagingData?.length ?? 0) > 0;

  const { data: catalogo, isLoading: catalogoCarregando, isError: catalogoErro } =
    useCatalogoCliente(clienteId);

  const linhasExcel = useMemo<ExcelLinhaNormalizada[]>(
    () => lotes.flatMap((l) => l.linhas),
    [lotes],
  );

  const sugestoes = useMemo<Map<string, Sugestao>>(
    () => (catalogo ? sugerirTodasLinhas(linhasExcel, catalogo) : new Map<string, Sugestao>()),
    [linhasExcel, catalogo],
  );

  // PR3.2 — escopo por par: indica se a conta sugerida pela IA bate com a
  // conta visualizada (verde), diverge (roxo), ou não foi inferida (cinza).
  const escopoPorPar = useMemo<Map<string, ParEscopo>>(() => {
    const m = new Map<string, ParEscopo>();
    linhasExcel.forEach((l) => {
      const key = l.chaveLinha;
      const sug = sugestoes.get(key);
      const contaSug = sug?.contaSugerida ?? null;
      if (!contaSug) {
        m.set(key, {
          isDestaConta: false,
          isDivergente: false,
          isContaIndefinida: true,
          tagBanco: null,
          rotuloConta: null,
        });
      } else {
        const isDesta = contaSug.id === contaId;
        m.set(key, {
          isDestaConta: isDesta,
          isDivergente: !isDesta,
          isContaIndefinida: false,
          tagBanco: abreviarBanco(contaSug.rotulo),
          rotuloConta: contaSug.rotulo,
        });
      }
    });
    return m;
  }, [linhasExcel, sugestoes, contaId]);

  // Estado de pares: inicializa com ofxIdAtivo = sugerido pelo engine, decisao pendente.
  // PR5 — depois sobrescreve com dados persistidos da sessão (mesa_par rows).
  // Lazy init: roda só na primeira render do modal.
  const [pares, setPares] = useState<Map<string, ParEstado>>(() => {
    const m = new Map<string, ParEstado>();
    linhasExcel.forEach((l) => {
      const key = l.chaveLinha;
      const mt = matches.get(key);
      m.set(key, {
        excelKey: key,
        ofxIdAtivo: mt?.ofxIdMatched ?? null,
        ofxIdSugeridoOriginal: mt?.ofxIdMatched ?? null,
        decisao: 'pendente',
        correcao: null,
      });
    });
    // PR5 — sobrescreve com persistido
    if (sessaoCompleta) {
      sessaoCompleta.pares.forEach((row) => {
        const exist = m.get(row.excel_key);
        if (exist) {
          m.set(row.excel_key, {
            ...exist,
            // PR-MesaGlobal-OfxAtivoFallbackReload — reload salvo com ofx_id_ativo null
            // recupera o match calculado (exist.ofxIdAtivo) SÓ em pendente; órfão/rejeitado/aprovado mantêm null.
            ofxIdAtivo: row.ofx_id_ativo ?? (
              row.decisao === 'pendente'
                ? exist.ofxIdAtivo
                : null
            ),
            ofxIdSugeridoOriginal: row.ofx_id_sugerido_original ?? exist.ofxIdSugeridoOriginal,
            decisao: row.decisao,
            correcao: row.correcao_json,
          });
        }
      });
    }
    return m;
  });

  const [parAtivoKey, setParAtivoKey] = useState<string | null>(null);
  const [filtroMostrar, setFiltroMostrar] = useState<FiltroMostrar>('todos');
  const [filtroEscopo, setFiltroEscopo] = useState<FiltroEscopo>('todos');
  const [filtroOrdem, setFiltroOrdem] = useState<FiltroOrdem>('score_desc');

  // PR3.3 — Modo OFX (lente bancária)
  const [modoVisualizacao, setModoVisualizacao] = useState<ModoVisualizacao>('excel');
  // PR6.1D-3 — pills de escopo (puramente visual; default 'todas' = comportamento atual)
  const [escopoFiltro, setEscopoFiltro] = useState<EscopoFiltro>('todas');
  // PR5 — inicializa Map ofxValidacoes a partir da sessão persistida
  const [ofxValidacoes, setOfxValidacoes] = useState<Map<string, MesaOfxValidacaoStatus>>(() => {
    const m = new Map<string, MesaOfxValidacaoStatus>();
    if (sessaoCompleta) {
      sessaoCompleta.ofxValidacoes.forEach((row) => m.set(row.ofx_id, row.status));
    }
    return m;
  });
  const [filtroOfxMostrar, setFiltroOfxMostrar] = useState<FiltroMostrarOfx>('todos');
  const [filtroOfxOrdem, setFiltroOfxOrdem] = useState<FiltroOrdemOfx>('original');
  const [ofxAtivoId, setOfxAtivoId] = useState<string | null>(null);

  // PR4 — Modo Corrigir: fotografia consolidada + draft de correção em memória
  // PR5 — inicializa a partir da sessão persistida (aprovacao_json das rows)
  const [aprovacoes, setAprovacoes] = useState<Map<string, AprovacaoLocal>>(() => {
    const m = new Map<string, AprovacaoLocal>();
    if (sessaoCompleta) {
      sessaoCompleta.pares.forEach((row) => {
        if (row.aprovacao_json) m.set(row.excel_key, row.aprovacao_json);
      });
    }
    return m;
  });
  const [corrigindoExcelKey, setCorrigindoExcelKey] = useState<string | null>(null);
  const [rascunhoCorrecao, setRascunhoCorrecao] = useState<ParCorrecao | null>(null);
  const [fornecedorBusca, setFornecedorBusca] = useState<string>('');
  const [subcentroBusca, setSubcentroBusca] = useState<string>('');

  // PR-MesaGlobal-HeaderCompacto — collapse de métricas secundárias do header.
  const [detalhesSessao, setDetalhesSessao] = useState<boolean>(false);
  // PR-MesaGlobal-HeaderCompacto-2 — collapse dos pills de escopo (default fechado).
  const [filtrosEscopo, setFiltrosEscopo] = useState<boolean>(false);

  // PR-4A — edição inline do Resultado escreve DIRETO em pares[key].correcao (fonte única).
  // Sem proto-state, sem "Aplicar": editar já vira correção do par. O seed da base
  // (quando correcao é null) é o MESMO de iniciarCorrecao (sugestão + Excel + chain de data).
  function editarCorrecaoAtiva(patch: Partial<ParCorrecao>) {
    if (edicaoBloqueada || !parAtivoKey) return;
    const key = parAtivoKey;
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(key);
      if (!cur) return prev;
      const sug = sugestoes.get(key);
      const linha = linhasExcel.find((l) => l.chaveLinha === key);
      const ofx = cur.ofxIdAtivo ? extratos.find((e) => e.id === cur.ofxIdAtivo) : null;
      const dataCompetenciaInicial =
        linha?.dataCompetencia ?? linha?.dataPagamento ?? ofx?.data_movimento ?? null;
      const base: ParCorrecao = cur.correcao ?? {
        contaId: sug?.contaSugerida?.id ?? null,
        contaRotulo: sug?.contaSugerida?.rotulo ?? null,
        fazendaId: sug?.fazendaSugerida?.id ?? null,
        fazendaNome: sug?.fazendaSugerida?.nome ?? null,
        fornecedorId: sug?.fornecedorOficial?.id ?? null,
        fornecedorNome: sug?.fornecedorOficial?.nome ?? null,
        fornecedorMarcadoNovo: false,
        dataCompetencia: dataCompetenciaInicial,
        subcentro: sug?.subcentroSugerido?.subcentro ?? null,
        macro_custo: sug?.subcentroSugerido?.macro_custo ?? null,
        grupo_custo: sug?.subcentroSugerido?.grupo_custo ?? null,
        centro_custo: sug?.subcentroSugerido?.centro_custo ?? null,
        produto: linha?.produto ?? null,
        descricao: null,
        corrigidoEm: new Date().toISOString(),
      };
      next.set(key, { ...cur, correcao: { ...base, ...patch, corrigidoEm: new Date().toISOString() } });
      return next;
    });
  }

  // ---------- ações de decisão ----------

  function aprovarPar(key: string) {
    if (edicaoBloqueada) return;
    // PR4 + PR4.1: consolida fotografia com fallbacks (chain de data e produto).
    const sug = sugestoes.get(key);
    const cur = pares.get(key);
    if (!cur) return;
    const fallbacks = buildFallbacks(key, cur.ofxIdAtivo, linhasExcel, extratos);
    const fotografia = consolidarFotografia(sug, cur.correcao, cur.ofxIdAtivo, fallbacks);
    setAprovacoes((prev) => {
      const next = new Map<string, AprovacaoLocal>(prev);
      next.set(key, fotografia);
      return next;
    });
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const c2 = next.get(key);
      if (c2) next.set(key, { ...c2, decisao: 'aprovado' });
      return next;
    });
  }
  function rejeitarPar(key: string) {
    if (edicaoBloqueada) return;
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, decisao: 'rejeitado' });
      return next;
    });
  }
  function marcarExcelOrfao(key: string) {
    if (edicaoBloqueada) return;
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, decisao: 'excel_orfao', ofxIdAtivo: null });
      return next;
    });
  }
  function desfazer(key: string) {
    if (edicaoBloqueada) return;
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, decisao: 'pendente' });
      return next;
    });
  }
  function trocarOfx(key: string, novoOfxId: string) {
    if (edicaoBloqueada) return;
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, ofxIdAtivo: novoOfxId, decisao: 'pendente' });
      return next;
    });
  }

  // ---------- derivações ----------

  // OFX consumidos (vinculados a pares aprovados)
  const ofxConsumidos = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    pares.forEach((p) => {
      if (p.decisao === 'aprovado' && p.ofxIdAtivo) s.add(p.ofxIdAtivo);
    });
    return s;
  }, [pares]);

  // Contadores
  const contadores = useMemo(() => {
    let aprovados = 0, rejeitados = 0, orfaos = 0, pendentes = 0;
    pares.forEach((p) => {
      if (p.decisao === 'aprovado') aprovados++;
      else if (p.decisao === 'rejeitado') rejeitados++;
      else if (p.decisao === 'excel_orfao') orfaos++;
      else pendentes++;
    });
    const bancoOrfao = extratos.length - ofxConsumidos.size;
    return { aprovados, rejeitados, orfaos, pendentes, bancoOrfao };
  }, [pares, ofxConsumidos, extratos.length]);

  // PR6.1D-4 — resolução memoizada por contaTexto único. Performance: lista
  // pode ter 1000+ linhas com poucos contaTexto distintos. Map evita reexec
  // do helper soberano por linha em cada render. Re-roda só quando linhasExcel
  // ou contas do catálogo mudam.
  const resolucaoPorContaTexto = useMemo<Map<string, ContaResolvida | null>>(() => {
    const m = new Map<string, ContaResolvida | null>();
    const contasCadastro = (catalogo?.contas ?? []) as unknown as readonly ContaBancariaRow[];
    for (const l of linhasExcel) {
      const tex = l.contaTexto ?? '';
      if (!m.has(tex)) {
        m.set(tex, resolverContaPorTexto(tex, contasCadastro));
      }
    }
    return m;
  }, [linhasExcel, catalogo]);

  // Lista filtrada e ordenada
  const linhasFiltradas = useMemo<ExcelLinhaNormalizada[]>(() => {
    let arr = linhasExcel.slice();

    // PR6.1D-3 — pré-filtro de escopo (pills do header). PURAMENTE VISUAL:
    // atua só na lista renderizada do Modo Excel, sem tocar pares/aprovacoes
    // ou contadores globais (estado de cada par segue soberano em mesa_par).
    // ehTransferencia é module-level (PR6.1D-5) — mesmo helper usado pela
    // marcação visual da linha.
    const contaSessaoId = sessaoCompleta?.sessao.conta_bancaria_id ?? null;
    if (escopoFiltro === 'transferencias') {
      arr = arr.filter((l) => ehTransferencia(l));
    } else if (escopoFiltro === 'externos') {
      arr = arr.filter((l) => !ehTransferencia(l));
    } else if (escopoFiltro === 'sessao' && contaSessaoId) {
      const contasCadastro = (catalogo?.contas ?? []) as unknown as readonly ContaBancariaRow[];
      arr = arr.filter((l) => {
        const res = resolverContaPorTexto(l.contaTexto, contasCadastro);
        return res?.id === contaSessaoId;
      });
    }

    // PR3.2 — Filtro 1: ESCOPO (verde/roxo/cinza/sem OFX)
    arr = arr.filter((l) => {
      const key = l.chaveLinha;
      const esc = escopoPorPar.get(key);
      const p = pares.get(key);
      switch (filtroEscopo) {
        case 'desta_conta': return esc?.isDestaConta === true;
        case 'outras_contas': return esc?.isDivergente === true;
        case 'sem_inferencia': return esc?.isContaIndefinida === true;
        case 'sem_ofx': return !p?.ofxIdAtivo;
        default: return true;
      }
    });

    // Filtro 2: MOSTRAR (existente + banco_orfao)
    arr = arr.filter((l) => {
      const key = l.chaveLinha;
      const p = pares.get(key);
      const m = matches.get(key);
      switch (filtroMostrar) {
        case 'forte': return m?.faixa === 'forte';
        case 'fraco': return m?.faixa === 'fraco';
        case 'sem_match': return !m || m.faixa === 'nenhum';
        case 'pendentes': return p?.decisao === 'pendente';
        case 'aprovados': return p?.decisao === 'aprovado';
        case 'rejeitados': return p?.decisao === 'rejeitado';
        case 'orfaos': return p?.decisao === 'excel_orfao';
        // PR3.2 — banco órfão: par com OFX vinculado ainda não consumido por aprovação
        case 'banco_orfao':
          return p?.ofxIdAtivo != null && !ofxConsumidos.has(p.ofxIdAtivo);
        // PR4 — corrigidos: par com correção aplicada (independente de decisão)
        case 'corrigidos': return p?.correcao != null;
        default: return true;
      }
    });

    if (filtroOrdem === 'score_desc') {
      arr.sort((a, b) => {
        const sa = matches.get(a.chaveLinha)?.score ?? 0;
        const sb = matches.get(b.chaveLinha)?.score ?? 0;
        return sb - sa;
      });
    } else if (filtroOrdem === 'valor_desc') {
      arr.sort((a, b) => b.valorCentavos - a.valorCentavos);
    } else if (filtroOrdem === 'valor_asc') {
      arr.sort((a, b) => a.valorCentavos - b.valorCentavos);
    } else if (filtroOrdem === 'data_asc') {
      arr.sort((a, b) => {
        const da = a.dataPagamento ?? a.dataCompetencia ?? '';
        const db = b.dataPagamento ?? b.dataCompetencia ?? '';
        return da.localeCompare(db);
      });
    } else if (filtroOrdem === 'data_desc') {
      arr.sort((a, b) => {
        const da = a.dataPagamento ?? a.dataCompetencia ?? '';
        const db = b.dataPagamento ?? b.dataCompetencia ?? '';
        return db.localeCompare(da);
      });
    }
    return arr;
  }, [
    linhasExcel, matches, pares, filtroMostrar, filtroEscopo, filtroOrdem,
    escopoPorPar, ofxConsumidos,
    // PR6.1D-3 — pré-filtro pelas pills
    escopoFiltro, sessaoCompleta?.sessao.conta_bancaria_id, catalogo,
  ]);

  // Linha Excel ativa
  const linhaAtiva = useMemo<ExcelLinhaNormalizada | null>(() => {
    if (!parAtivoKey) return null;
    return linhasExcel.find((l) => l.chaveLinha === parAtivoKey) ?? null;
  }, [parAtivoKey, linhasExcel]);

  const parAtivo = parAtivoKey ? pares.get(parAtivoKey) ?? null : null;
  const matchAtivo = parAtivoKey ? matches.get(parAtivoKey) ?? null : null;
  const sugAtiva = parAtivoKey ? sugestoes.get(parAtivoKey) ?? null : null;
  const ofxAtivo = parAtivo?.ofxIdAtivo
    ? extratos.find((e) => e.id === parAtivo.ofxIdAtivo) ?? null
    : null;

  // PR-A — OFX de EXIBIÇÃO: vínculo, senão sugestão/candidato. NÃO é o vínculo (ofxIdAtivo).
  const ofxExibirId =
    parAtivo?.ofxIdAtivo
    ?? parAtivo?.ofxIdSugeridoOriginal
    ?? matchAtivo?.ofxIdMatched
    ?? null;
  const ofxExibir = ofxExibirId
    ? extratos.find((e) => e.id === ofxExibirId) ?? null
    : null;
  const ofxEhSugestao = !parAtivo?.ofxIdAtivo && ofxExibir != null;

  // Alertas adicionais
  const alertasExtras = useMemo<string[]>(() => {
    if (!linhaAtiva) return [];
    const out: string[] = [];
    // Conta sugerida ≠ conta visualizada
    if (sugAtiva?.contaSugerida && sugAtiva.contaSugerida.id !== contaId) {
      out.push(`Conta sugerida (${sugAtiva.contaSugerida.rotulo}) ≠ conta atual (${contaNome})`);
    }
    // Sinal incoerente Excel ↔ OFX
    if (ofxAtivo) {
      const ofxPositivo = ofxAtivo.valor > 0;
      const ofxNegativo = ofxAtivo.valor < 0;
      if (
        (linhaAtiva.sinal === 'entrada' && ofxNegativo) ||
        (linhaAtiva.sinal === 'saida' && ofxPositivo)
      ) {
        out.push('Sinal Excel ↔ OFX incoerente');
      }
      // Diferença de dias > 3
      const dataExcel = linhaAtiva.dataPagamento ?? linhaAtiva.dataCompetencia;
      if (dataExcel) {
        const d = Math.abs(
          (new Date(dataExcel + 'T12:00:00').getTime()
           - new Date(ofxAtivo.data_movimento + 'T12:00:00').getTime()) / 86400000,
        );
        if (d > 3) out.push(`Diferença de ${Math.round(d)} dias entre Excel e OFX`);
      }
    }
    return out;
  }, [linhaAtiva, sugAtiva, ofxAtivo, contaId, contaNome]);

  // ──────────────────────────────────────────────────────────────────────
  // PR3.3 — Modo OFX: derivações e ações
  // ──────────────────────────────────────────────────────────────────────

  // candidatosPorOfx: inverte `matches` (Excel→OFX) em OFX→Excel.
  // Não recalcula score — apenas reorganiza top-5 já existente em
  // MatchResult.ofxIdCandidatos do PR3.1.
  const candidatosPorOfx = useMemo<Map<string, CandidatoExcelParaOfx[]>>(() => {
    const out = new Map<string, CandidatoExcelParaOfx[]>();
    extratos.forEach((e) => out.set(e.id, []));
    linhasExcel.forEach((l) => {
      const key = l.chaveLinha;
      const m = matches.get(key);
      if (!m) return;
      const ids = new Set<string>([
        ...(m.ofxIdMatched ? [m.ofxIdMatched] : []),
        ...m.ofxIdCandidatos,
      ]);
      ids.forEach((ofxId) => {
        const arr = out.get(ofxId);
        if (!arr) return;
        arr.push({ excelKey: key, score: m.score, faixa: m.faixa, linha: l });
      });
    });
    out.forEach((arr, ofxId) => {
      arr.sort((a, b) => b.score - a.score);
      out.set(ofxId, arr.slice(0, 10));
    });
    return out;
  }, [extratos, linhasExcel, matches]);

  // Contadores específicos do Modo OFX
  const contadoresOfx = useMemo(() => {
    let pendentes = 0;
    let aprovados = 0;
    let orfaoValidado = 0;
    let semSugestao = 0;
    extratos.forEach((e) => {
      const validacao = ofxValidacoes.get(e.id) ?? 'pendente';
      const consumido = ofxConsumidos.has(e.id);
      const candidatos = candidatosPorOfx.get(e.id) ?? [];
      if (validacao === 'ofx_orfao_validado') orfaoValidado++;
      else if (consumido) aprovados++;
      else pendentes++;
      if (candidatos.length === 0) semSugestao++;
    });
    return { pendentes, aprovados, orfaoValidado, semSugestao };
  }, [extratos, ofxConsumidos, ofxValidacoes, candidatosPorOfx]);

  // Lista filtrada/ordenada de OFX
  const ofxFiltrados = useMemo<OfxItem[]>(() => {
    let arr = extratos.slice();
    arr = arr.filter((e) => {
      const validacao = ofxValidacoes.get(e.id) ?? 'pendente';
      const consumido = ofxConsumidos.has(e.id);
      const candidatos = candidatosPorOfx.get(e.id) ?? [];
      switch (filtroOfxMostrar) {
        case 'pendentes':
          return validacao === 'pendente' && !consumido;
        case 'com_sugestao':
          return candidatos.length > 0;
        case 'sem_sugestao':
          return candidatos.length === 0;
        case 'aprovados':
          return consumido;
        case 'ofx_orfao_validado':
          return validacao === 'ofx_orfao_validado';
        default:
          return true;
      }
    });
    if (filtroOfxOrdem === 'data_asc') {
      arr.sort((a, b) => a.data_movimento.localeCompare(b.data_movimento));
    } else if (filtroOfxOrdem === 'data_desc') {
      arr.sort((a, b) => b.data_movimento.localeCompare(a.data_movimento));
    } else if (filtroOfxOrdem === 'valor_desc') {
      arr.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
    } else if (filtroOfxOrdem === 'valor_asc') {
      arr.sort((a, b) => Math.abs(a.valor) - Math.abs(b.valor));
    } else if (filtroOfxOrdem === 'score_desc') {
      arr.sort((a, b) => {
        const sa = candidatosPorOfx.get(a.id)?.[0]?.score ?? 0;
        const sb = candidatosPorOfx.get(b.id)?.[0]?.score ?? 0;
        return sb - sa;
      });
    }
    return arr;
  }, [extratos, ofxConsumidos, ofxValidacoes, candidatosPorOfx, filtroOfxMostrar, filtroOfxOrdem]);

  // Ações Modo OFX
  function marcarOfxOrfaoValidado(ofxId: string) {
    if (edicaoBloqueada) return;
    setOfxValidacoes((prev) => {
      const next = new Map<string, MesaOfxValidacaoStatus>(prev);
      next.set(ofxId, 'ofx_orfao_validado');
      return next;
    });
  }
  function desfazerOfxOrfaoValidado(ofxId: string) {
    if (edicaoBloqueada) return;
    setOfxValidacoes((prev) => {
      const next = new Map<string, MesaOfxValidacaoStatus>(prev);
      next.delete(ofxId);
      return next;
    });
  }
  // Aprovar via candidato Excel: ajusta ofxIdAtivo e decisao do par
  // numa única passagem de setPares (sem race). PR4: também produz
  // fotografia consolidada na Map de aprovações.
  function aprovarOfxComExcel(ofxId: string, excelKey: string) {
    if (edicaoBloqueada) return;
    const sug = sugestoes.get(excelKey);
    const cur = pares.get(excelKey);
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const c2 = next.get(excelKey);
      if (c2) next.set(excelKey, { ...c2, ofxIdAtivo: ofxId, decisao: 'aprovado' });
      return next;
    });
    setAprovacoes((prev) => {
      const next = new Map<string, AprovacaoLocal>(prev);
      const fallbacks = buildFallbacks(excelKey, ofxId, linhasExcel, extratos);
      next.set(excelKey, consolidarFotografia(sug, cur?.correcao ?? null, ofxId, fallbacks));
      return next;
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // PR4 — Handlers Modo Corrigir
  // ──────────────────────────────────────────────────────────────────────

  function iniciarCorrecao(excelKey: string) {
    if (edicaoBloqueada) return;
    const sug = sugestoes.get(excelKey);
    const parAtual = pares.get(excelKey);
    const linha = linhasExcel.find((l) => l.chaveLinha === excelKey);
    const ofx = parAtual?.ofxIdAtivo
      ? extratos.find((e) => e.id === parAtual.ofxIdAtivo)
      : null;

    // PR4.1 — chain de data competência (correcao -> Excel comp -> Excel pag -> OFX)
    const dataCompetenciaInicial =
      linha?.dataCompetencia
      ?? linha?.dataPagamento
      ?? ofx?.data_movimento
      ?? null;

    const correcaoInicial: ParCorrecao = parAtual?.correcao ?? {
      contaId: sug?.contaSugerida?.id ?? null,
      contaRotulo: sug?.contaSugerida?.rotulo ?? null,
      fazendaId: sug?.fazendaSugerida?.id ?? null,
      fazendaNome: sug?.fazendaSugerida?.nome ?? null,
      fornecedorId: sug?.fornecedorOficial?.id ?? null,
      fornecedorNome: sug?.fornecedorOficial?.nome ?? null,
      fornecedorMarcadoNovo: false,
      dataCompetencia: dataCompetenciaInicial,    // PR4.1
      subcentro: sug?.subcentroSugerido?.subcentro ?? null,
      macro_custo: sug?.subcentroSugerido?.macro_custo ?? null,
      grupo_custo: sug?.subcentroSugerido?.grupo_custo ?? null,
      centro_custo: sug?.subcentroSugerido?.centro_custo ?? null,
      produto: linha?.produto ?? null,             // PR4.1 — Excel produto
      descricao: null,                              // operador começa vazio
      corrigidoEm: new Date().toISOString(),
    };
    setRascunhoCorrecao(correcaoInicial);
    setCorrigindoExcelKey(excelKey);
    setFornecedorBusca(correcaoInicial.fornecedorNome ?? '');
    setSubcentroBusca(correcaoInicial.subcentro ?? '');
  }

  function aplicarCorrecao() {
    if (edicaoBloqueada) return;
    if (!corrigindoExcelKey || !rascunhoCorrecao) return;
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(corrigindoExcelKey);
      if (cur) next.set(corrigindoExcelKey, {
        ...cur,
        correcao: { ...rascunhoCorrecao, corrigidoEm: new Date().toISOString() },
      });
      return next;
    });
    setCorrigindoExcelKey(null);
    setRascunhoCorrecao(null);
    setFornecedorBusca('');
    setSubcentroBusca('');
  }

  // PR4.1 — combina aplicarCorrecao + aprovarPar numa única transação:
  // produz fotografia com correção, marca decisão aprovado, persiste em
  // aprovacoes e pares de uma vez. Botão primário do formulário.
  function aplicarEAprovar() {
    if (edicaoBloqueada) return;
    if (!corrigindoExcelKey || !rascunhoCorrecao) return;
    const excelKey = corrigindoExcelKey;
    const sug = sugestoes.get(excelKey);
    const cur = pares.get(excelKey);
    if (!cur) return;

    const correcaoFinal: ParCorrecao = {
      ...rascunhoCorrecao,
      corrigidoEm: new Date().toISOString(),
    };

    const fallbacks = buildFallbacks(excelKey, cur.ofxIdAtivo, linhasExcel, extratos);
    const fotografia = consolidarFotografia(sug, correcaoFinal, cur.ofxIdAtivo, fallbacks);

    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      next.set(excelKey, { ...cur, correcao: correcaoFinal, decisao: 'aprovado' });
      return next;
    });
    setAprovacoes((prev) => {
      const next = new Map<string, AprovacaoLocal>(prev);
      next.set(excelKey, fotografia);
      return next;
    });

    setCorrigindoExcelKey(null);
    setRascunhoCorrecao(null);
    setFornecedorBusca('');
    setSubcentroBusca('');
  }

  function cancelarCorrecao() {
    setCorrigindoExcelKey(null);
    setRascunhoCorrecao(null);
    setFornecedorBusca('');
    setSubcentroBusca('');
  }

  function limparCorrecao(excelKey: string) {
    if (edicaoBloqueada) return;
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(excelKey);
      if (cur) next.set(excelKey, { ...cur, correcao: null });
      return next;
    });
  }

  // Contador de corrigidos pro header
  const totalCorrigidos = useMemo<number>(() => {
    let n = 0;
    pares.forEach((p) => { if (p.correcao) n++; });
    return n;
  }, [pares]);

  // PR4.2 — natureza alvo (entrada/saida) derivada da linha em correção.
  // Usada pra particionar subcentros em primários/secundários.
  const naturezaAlvoCorrecao = useMemo<NaturezaSubcentro | null>(() => {
    if (!corrigindoExcelKey) return null;
    const linha = linhasExcel.find(
      (l) => l.chaveLinha === corrigindoExcelKey,
    );
    if (!linha) return null;
    if (linha.sinal === 'entrada') return 'entrada';
    if (linha.sinal === 'saida') return 'saida';
    return null;
  }, [corrigindoExcelKey, linhasExcel]);

  // PR5 — bloqueio de edição quando sessão finalizada
  const edicaoBloqueada = sessaoCompleta?.sessao.status === 'finalizada';

  // PR5 — hash leve para watch de auto-save (sem JSON.stringify do Map inteiro)
  const watchKey = useMemo<string>(() => {
    let h = '';
    pares.forEach((p) => {
      h += `${p.excelKey}:${p.decisao}:${p.ofxIdAtivo ?? ''}:${p.correcao ? '1' : '0'}|`;
    });
    ofxValidacoes.forEach((s, id) => {
      h += `o:${id}:${s}|`;
    });
    return h;
  }, [pares, ofxValidacoes]);

  // PR5 — auto-save com debounce 5s
  const { status: statusSalvamento, ultimoSalvamento, salvarAgora } = useSalvamentoAuto({
    enabled: !!sessaoCompleta && !edicaoBloqueada,
    debounceMs: 5000,
    watchKey,
    onSalvar: async () => {
      if (!sessaoCompleta) return;
      await salvarPares(
        sessaoCompleta.sessao.id,
        pares,
        aprovacoes,
      );
      await salvarOfxValidacoes(sessaoCompleta.sessao.id, ofxValidacoes);
    },
  });

  // PR6.1 — Finaliza sessão e gera staging com dados FRESCOS do banco.
  // Fluxo obrigatório:
  //   1. salvarAgora()        — flush dos Maps em memória pro banco
  //   2. finalizarSessao()    — mesa_sessao.status = 'finalizada'
  //   3. onSessaoMudou()      — refetch do TanStack pra alinhar cache
  //   4. query fresh direto   — re-busca sessao + pares pelo id, sem confiar no cache
  //   5. gerarStagingDaSessao(sessaoFresh, paresFresh)
  // Se a query fresh falhar/retornar null, aborta com erro explícito —
  // NÃO usa sessaoCompleta.pares stale como fallback.
  async function finalizarEGerarStaging() {
    if (!sessaoCompleta) return;
    if (!window.confirm(
      'Marcar sessão como finalizada e gerar staging? Você poderá revisar antes de promover ao banco real.',
    )) return;

    setGerandoStaging(true);
    setErroStaging(null);
    try {
      const sessaoId = sessaoCompleta.sessao.id;

      // 1. Flush obrigatório do estado React → banco (pares + validações OFX)
      await salvarAgora();

      // 2. Marca sessão como finalizada no banco
      await finalizarSessao(sessaoId);

      // 3. Refetch do TanStack (atualiza cache do useMesaSessao no V2MesaOperacional)
      await onSessaoMudou();

      // 4. Query fresh DIRETO no banco — fonte da verdade, sem cache local.
      //    Cast em supabase: tabelas mesa_* ainda não estão nos tipos gerados.
      const sb = supabase as any;
      const [sessRes, paresRes] = await Promise.all([
        sb.from('mesa_sessao').select('*').eq('id', sessaoId).maybeSingle(),
        sb.from('mesa_par').select('*').eq('sessao_id', sessaoId).range(0, 9999),
      ]);
      if (sessRes.error) throw sessRes.error;
      if (paresRes.error) throw paresRes.error;
      if (!sessRes.data) {
        throw new Error('Sessão não encontrada no banco após finalizar');
      }
      const sessaoFresh = sessRes.data as MesaSessaoRow;
      const paresFresh = ((paresRes.data ?? []) as unknown) as MesaParRow[];

      // 5. Gera staging usando dados frescos
      // PR6.2-M0.5 — passa contas do catálogo (helper soberano usa, mesma
      // lista já consumida pelas pills/badges do PR6.1D-3/D-4).
      const contasCadastro = (catalogo?.contas ?? []) as unknown as readonly ContaBancariaRow[];
      const resultado = await gerarStagingDaSessao(sessaoFresh, paresFresh, contasCadastro);
      setResultadoStaging(resultado);

      // PR6.2-M0.5 — alerta operacional quando linhas foram puladas por
      // resolução de conta inválida (não bloqueia o restante: rowsValidas
      // que conseguiram resolver seguiram normalmente).
      if (resultado.erros.length > 0) {
        toast.warning(
          `${resultado.erros.length} linha(s) não geraram staging — passe o mouse no aviso do header para detalhes.`,
        );
      }

      // 6. PR6.1A — pré-fetch da query do staging. Quando operador clicar na aba
      //    "Revisão Staging", os dados já estão no cache (zero flash de loading).
      await queryClient.prefetchQuery({
        queryKey: ['mesa-staging', sessaoId],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErroStaging(msg);
    } finally {
      setGerandoStaging(false);
    }
  }

  // PR6.1D-2 — período pt-BR a partir do anoMes ('YYYY-MM' → 'Abr/2026').
  const periodoLabel = (() => {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const [ano, mes] = anoMes.split('-');
    const idx = Number(mes) - 1;
    if (!ano || Number.isNaN(idx) || idx < 0 || idx > 11) return anoMes;
    return `${meses[idx]}/${ano}`;
  })();

  // PR-OFX-Espelho Passo 1 — painel de detalhe extraído VERBATIM do IIFE inline
  // do branch 'excel' (refactor puro; fecha sobre o estado/derivados do componente).
  const painelDetalhe = () => {
                    const fmtData = (d?: string | null) => d ? format(new Date(d + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : null;
                    const exValor = (linhaAtiva.sinal === 'entrada' ? 1 : -1) * (linhaAtiva.valorCentavos / 100);
                    if (!parAtivoKey) return null;
                    // PR-4A — payload UMA vez: o que aparece = o que valida = o que persiste.
                    const fallbacksAtivo = buildFallbacks(parAtivoKey, parAtivo.ofxIdAtivo, linhasExcel, extratos);
                    const payloadAtivo = consolidarFotografia(sugAtiva ?? undefined, parAtivo.correcao, parAtivo.ofxIdAtivo, fallbacksAtivo);
                    // Natureza derivada do sinal (editável = PR-4B). Filtra opções de Subcentro.
                    const naturezaAlvoAtiva: NaturezaSubcentro | null =
                      linhaAtiva.sinal === 'entrada' ? 'entrada' : linhaAtiva.sinal === 'saida' ? 'saida' : null;
                    return (
                      <>
                        {/* TABELA ÚNICA — CAMPO | OFX | EXCEL | RESULTADO (uma linha por campo) */}
                        <div className="space-y-0">
                          <div className="grid grid-cols-[72px_1fr_1fr_1.1fr] gap-1 px-1 pb-1 border-b text-[8px] uppercase tracking-wide text-muted-foreground/60 font-semibold">
                            <span>Campo</span>
                            <span title={ofxEhSugestao ? 'OFX sugerido, ainda não vinculado' : undefined}>
                              OFX{ofxEhSugestao && <span className="ml-1 normal-case text-amber-600 font-normal">• sugerido</span>}
                            </span>
                            <span>Excel</span><span>Resultado</span>
                          </div>
                          {/* Data/Valor/Banco — leitura (não editável). OFX = ofxExibir (vínculo ou sugestão) */}
                          <MatrizLinha campo="Data"
                            ofx={ofxExibir ? fmtData(ofxExibir.data_movimento) : null}
                            excel={fmtData(linhaAtiva.dataPagamento)}
                            fin={fmtData(linhaAtiva.dataPagamento)} />
                          <MatrizLinha campo="Valor"
                            ofx={ofxExibir ? fmtBRL(ofxExibir.valor) : null}
                            excel={fmtBRL(exValor)}
                            fin={fmtBRL(exValor)} />
                          <MatrizLinha campo="Banco"
                            ofx={ofxExibir ? (contaNome ?? '—') : null}
                            excel={linhaAtiva.contaTexto}
                            fin={contaNome} />
                          {/* Fornecedor — OFX = descrição bancária (evidência); Resultado = Command oficial */}
                          <MatrizLinha campo="Fornecedor"
                            ofx={ofxExibir?.descricao ?? null}
                            excel={linhaAtiva.fornecedor}
                            fin={
                              <FornecedorInline
                                clienteId={clienteId}
                                valor={payloadAtivo.fornecedorNome}
                                excelOriginal={linhaAtiva.fornecedor}
                                marcadoNovo={payloadAtivo.fornecedorMarcadoNovo}
                                vinculadoId={payloadAtivo.fornecedorId}
                                disabled={edicaoBloqueada}
                                onPick={(patch) => editarCorrecaoAtiva(patch)}
                              />
                            } />
                          <MatrizLinha campo="Fazenda"
                            excel={linhaAtiva.fazendaTexto}
                            fin={
                              <Select value={payloadAtivo.fazendaNome ?? undefined}
                                      onValueChange={(nome) => {
                                        const f = (catalogo?.fazendas ?? []).find((x) => x.nome === nome);
                                        editarCorrecaoAtiva({ fazendaId: f?.id ?? null, fazendaNome: nome });
                                      }}>
                                <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>
                                  {(catalogo?.fazendas ?? []).map((f) => (
                                    <SelectItem key={f.id} value={f.nome} className="text-[11px]">{f.nome}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            } />
                          <MatrizLinha campo="Subcentro"
                            excel={linhaAtiva.subcentro}
                            fin={
                              <SubcentroInline
                                catalogo={catalogo}
                                valor={payloadAtivo.subcentro}
                                naturezaAlvo={naturezaAlvoAtiva}
                                disabled={edicaoBloqueada}
                                onPick={(patch) => editarCorrecaoAtiva(patch)}
                              />
                            } />
                          <MatrizLinha campo="Produto"
                            excel={linhaAtiva.produto}
                            fin={
                              <Input value={payloadAtivo.produto ?? ''}
                                     onChange={(e) => editarCorrecaoAtiva({ produto: e.target.value || null })}
                                     disabled={edicaoBloqueada}
                                     className="h-7 text-[11px]" placeholder="—" />
                            } />
                          <MatrizLinha campo="Data Comp."
                            excel={fmtData(linhaAtiva.dataCompetencia)}
                            fin={
                              <Input type="date" value={payloadAtivo.dataCompetencia ?? ''}
                                     onChange={(e) => editarCorrecaoAtiva({ dataCompetencia: e.target.value || null })}
                                     disabled={edicaoBloqueada}
                                     className="h-7 text-[11px]" />
                            } />
                          {/* PR-DocObsEditavel — Documento fica salvo na sessão (correcao_json). NÃO vai para
                              financeiro_lancamentos_v2 ainda: o mapeamento documento→lançamento final nasce
                              no PR6.2-M1 (promoção real via RPC). */}
                          <MatrizLinha campo="Documento"
                            excel={linhaAtiva.documento}
                            fin={
                              <Input value={parAtivo.correcao?.documento ?? linhaAtiva.documento ?? ''}
                                     onChange={(e) => editarCorrecaoAtiva({ documento: e.target.value })}
                                     disabled={edicaoBloqueada}
                                     className="h-7 text-[11px]" placeholder="—" />
                            } />
                          <MatrizLinha campo="Obs / Histórico"
                            excel={linhaAtiva.observacao}
                            fin={
                              <Input value={parAtivo.correcao?.descricao ?? linhaAtiva.observacao ?? ''}
                                     onChange={(e) => editarCorrecaoAtiva({ descricao: e.target.value })}
                                     disabled={edicaoBloqueada}
                                     className="h-7 text-[11px]" placeholder="—" />
                            } />
                        </div>

                        {/* RODAPÉ — só o CTA primário; secundários (exceção) migraram pra barra de tabs */}
                        <div className="border-t pt-1.5 space-y-1">
                          {parAtivo.correcao && (
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">✎ Corrigido</span>
                              <Button size="sm" variant="ghost" className="h-5 text-[10px]"
                                      onClick={() => parAtivoKey && limparCorrecao(parAtivoKey)}>
                                Limpar correção
                              </Button>
                            </div>
                          )}
                          {parAtivo.decisao === 'pendente' ? (
                            (() => {
                              // PR-4A — REUSA o payloadAtivo computado acima (mesma referência do display).
                              const validacaoAtivo = validarAprovacao(payloadAtivo, linhaAtiva);
                              return (
                                <div className="space-y-1">
                                  {/* PR-P1 — vincular OFX sugerido ao par. ANTES da validação:
                                      vincular independe dos campos classificatórios estarem completos. */}
                                  {!parAtivo.ofxIdAtivo && ofxEhSugestao && ofxExibir && (
                                    <Button size="sm" variant="outline" className="w-full justify-center text-[11px] h-7"
                                            onClick={() => parAtivoKey && trocarOfx(parAtivoKey, ofxExibir.id)}>
                                      Vincular este OFX ao par
                                    </Button>
                                  )}
                                  {validacaoAtivo.valido ? (
                                    <>
                                      <Button size="sm" variant="default" className="w-full justify-center text-[11px] h-7"
                                              onClick={() => aprovarPar(parAtivoKey)} disabled={!parAtivo.ofxIdAtivo}>
                                        <Check className="h-3.5 w-3.5 mr-2" /> Aprovar par
                                      </Button>
                                      {!parAtivo.ofxIdAtivo && (
                                        <p className="text-[9px] text-amber-700 text-center leading-tight">
                                          {ofxEhSugestao
                                            ? 'OFX exibido como sugestão. Vincule o OFX antes de aprovar.'
                                            : 'Vincule o OFX antes de aprovar.'}
                                        </p>
                                      )}
                                    </>
                                  ) : (
                                    <Badge variant="outline"
                                           className="text-amber-700 bg-amber-50 border-amber-200 text-[9px] h-4 leading-none font-normal whitespace-normal text-left"
                                           title={validacaoAtivo.mensagem}>
                                      Faltam p/ aprovar: {validacaoAtivo.camposFaltantes.join(', ')}
                                    </Badge>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            <Button size="sm" variant="ghost" className="w-full justify-center text-[11px] h-7"
                                    onClick={() => desfazer(parAtivoKey)}>
                              <Undo2 className="h-3.5 w-3.5 mr-2" /> Desfazer ({parAtivo.decisao})
                            </Button>
                          )}
                        </div>
                      </>
                    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[1800px] h-[92vh] max-h-[92vh] p-0 flex flex-col">
        <DialogHeader className="px-3 py-1.5 border-b shrink-0 space-y-0.5">
          {/* PR6.1E-1 — Linha A: identidade + contexto + métricas + status + ações.
              Density refactor: todo o conteúdo do header (antes em 4 linhas
              verticais) agora flui horizontal com flex-wrap. Preserva 100% da
              semântica/funções/badges; só re-arranja layout e reduz py/px/gaps. */}
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <DialogTitle className="text-xs font-bold tracking-tight uppercase flex items-center gap-1 shrink-0">
              <Globe2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Mesa Global</span>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Por que vejo movimentos de outras contas?"
                      className="opacity-60 hover:opacity-100 focus:opacity-100 focus:outline-none transition-opacity"
                    >
                      <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="max-w-sm text-xs leading-relaxed normal-case font-normal">
                    <div className="font-semibold mb-1">Por que vejo movimentos de outras contas?</div>
                    <p>
                      O Excel é seu ledger multi-conta do mês — todas as receitas e despesas,
                      de todas as contas. Apenas o OFX é específico da conta acima.
                    </p>
                    <p className="mt-2">
                      Isso permite identificar transferências entre contas e conciliar
                      automaticamente.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DialogTitle>
            <Badge className="bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-[11px] font-semibold uppercase hover:bg-primary/15 inline-flex items-center gap-1 leading-none">
              <Building2 className="h-3 w-3" aria-hidden="true" />
              OFX: {contaNome ? contaNome.toUpperCase() : '—'}
            </Badge>
            <span className="text-muted-foreground text-[10px]">
              {clienteAtual?.nome ?? '—'} · {periodoLabel}
            </span>
            <span className="text-rose-700 font-medium text-[10px]">
              Não explicado: {naoExplicado}
            </span>
            <button
              type="button"
              onClick={() => setDetalhesSessao((v) => !v)}
              className="text-[10px] text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2 shrink-0"
            >
              {detalhesSessao ? 'Detalhes da sessão ▴' : 'Detalhes da sessão ▾'}
            </button>
            {detalhesSessao && (
              <span className="text-muted-foreground text-[10px]">
                OFX entr./saí.: {saldoOfxResumo}
              </span>
            )}
            {detalhesSessao && (modoVisualizacao === 'excel' ? (
              <span className="flex items-center gap-1.5 text-[10px]">
                <span className="text-emerald-700">✓{contadores.aprovados}</span>
                <span className="text-rose-700">✗{contadores.rejeitados}</span>
                <span className="text-amber-700">→{contadores.orfaos}</span>
                <span className="text-muted-foreground">—{contadores.pendentes}</span>
                <span className="text-blue-700">✎{totalCorrigidos}</span>
                <span className="text-muted-foreground">| banco órf.: {contadores.bancoOrfao}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px]">
                <span className="text-emerald-700">✓{contadoresOfx.aprovados}</span>
                <span className="text-muted-foreground">—{contadoresOfx.pendentes}</span>
                <span className="text-amber-700">⊘{contadoresOfx.orfaoValidado}</span>
                <span className="text-muted-foreground">| sem sug.: {contadoresOfx.semSugestao}</span>
              </span>
            ))}
            {sessaoCompleta && (
              <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                {statusSalvamento === 'salvo' && ultimoSalvamento && (
                  <span className="text-emerald-700 text-[10px]">
                    ✓ {ultimoSalvamento.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {detalhesSessao && statusSalvamento === 'salvo' && !ultimoSalvamento && (
                  <span className="text-muted-foreground text-[10px]">Sessão pronta</span>
                )}
                {statusSalvamento === 'salvando' && (
                  <span className="text-blue-700 text-[10px]">Salvando…</span>
                )}
                {statusSalvamento === 'pendente' && (
                  <span className="text-amber-700 text-[10px]">Não salvo (auto 5s)</span>
                )}
                {statusSalvamento === 'erro' && (
                  <span className="text-rose-700 text-[10px]">Erro ao salvar</span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] px-2"
                  onClick={() => void salvarAgora()}
                  disabled={edicaoBloqueada}
                >
                  Salvar
                </Button>
                {sessaoCompleta.sessao.status === 'em_andamento' && (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-6 text-[10px] px-2"
                    disabled={gerandoStaging}
                    onClick={() => { void finalizarEGerarStaging(); }}
                  >
                    {gerandoStaging ? 'Gerando…' : 'Finalizar + staging'}
                  </Button>
                )}
                {sessaoCompleta.sessao.status === 'finalizada' && (
                  <>
                    <span className="text-emerald-700 font-semibold text-[10px]">✓ Finalizada</span>
                    {resultadoStaging && (
                      <span className="text-muted-foreground text-[10px]">
                        Staging: {resultadoStaging.total_apos}
                        {resultadoStaging.gerados > 0 && ` (${resultadoStaging.gerados} novos)`}
                        {resultadoStaging.ja_existentes > 0 && resultadoStaging.gerados === 0 && ' (já existiam)'}
                      </span>
                    )}
                    {resultadoStaging && resultadoStaging.erros.length > 0 && (
                      <span
                        className="text-rose-700 text-[10px]"
                        title={resultadoStaging.erros.map((e) => `${e.excel_key}: ${e.motivo}`).join('\n')}
                      >
                        ⚠ {resultadoStaging.erros.length} n/g
                      </span>
                    )}
                    {resultadoStaging && resultadoStaging.total_apos > 0 && (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-6 text-[10px] px-2"
                        onClick={() => setAbaAtiva('staging')}
                      >
                        Ver staging →
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      onClick={async () => {
                        await reabrirSessao(sessaoCompleta.sessao.id);
                        await onSessaoMudou();
                      }}
                    >
                      Reabrir
                    </Button>
                  </>
                )}
                {erroStaging && (
                  <span
                    className="text-rose-700 text-[10px] font-medium"
                    title={erroStaging}
                  >
                    Erro staging — hover
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] px-2 text-rose-700"
                  onClick={async () => {
                    const corrigidos = Array.from(pares.values()).filter((p) => p.correcao).length;
                    const aprov = Array.from(pares.values()).filter((p) => p.decisao === 'aprovado').length;
                    if (!window.confirm(
                      `Descartar sessão atual? Vai apagar ${pares.size} pares (${aprov} aprovados, ${corrigidos} corrigidos). Não pode desfazer.`,
                    )) return;
                    await descartarSessao(sessaoCompleta.sessao.id);
                    onOpenChange(false);
                    await onSessaoMudou();
                  }}
                >
                  Descartar
                </Button>
              </div>
            )}
          </div>

          {/* PR6.1E-1 — Linha B: pills de escopo + toggle Modo + indicador.
              Mantém PR6.1D-3 (4 pills puramente visuais) + PR3.3 (toggle modo). */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant={escopoFiltro !== 'todas' ? 'default' : 'outline'}
              className="h-6 text-[10px] rounded-full px-2.5"
              onClick={() => setFiltrosEscopo((v) => !v)}
            >
              Escopo: {escopoFiltro === 'todas' ? 'Todas' : escopoFiltro === 'sessao' ? `Apenas ${contaNome}` : escopoFiltro === 'transferencias' ? 'Transferências' : 'Externos'} {filtrosEscopo ? '▴' : '▾'}
            </Button>
            {filtrosEscopo && (
              <>
                <Button
                  size="sm"
                  variant={escopoFiltro === 'todas' ? 'default' : 'outline'}
                  className="h-6 text-[10px] rounded-full px-2.5"
                  onClick={() => setEscopoFiltro('todas')}
                >
                  <Globe2 className="h-3 w-3 mr-1" aria-hidden="true" />
                  Todas
                </Button>
                <Button
                  size="sm"
                  variant={escopoFiltro === 'sessao' ? 'default' : 'outline'}
                  className="h-6 text-[10px] rounded-full px-2.5"
                  onClick={() => setEscopoFiltro('sessao')}
                >
                  <Building2 className="h-3 w-3 mr-1" aria-hidden="true" />
                  Apenas {contaNome}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(
                    'h-6 text-[10px] rounded-full px-2.5',
                    escopoFiltro === 'transferencias' &&
                      'bg-blue-500/15 text-blue-700 border-blue-500/30 hover:bg-blue-500/20 hover:text-blue-700',
                  )}
                  onClick={() => setEscopoFiltro('transferencias')}
                >
                  <ArrowLeftRight className="h-3 w-3 mr-1" aria-hidden="true" />
                  Transferências
                </Button>
                <Button
                  size="sm"
                  variant={escopoFiltro === 'externos' ? 'default' : 'outline'}
                  className="h-6 text-[10px] rounded-full px-2.5"
                  onClick={() => setEscopoFiltro('externos')}
                >
                  <Coins className="h-3 w-3 mr-1" aria-hidden="true" />
                  Externos
                </Button>
              </>
            )}
            {detalhesSessao && escopoFiltro !== 'todas' && modoVisualizacao === 'excel' && (
              <span className="text-[10px] text-muted-foreground italic">
                Mostrando {linhasFiltradas.length} de {linhasExcel.length}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant={modoVisualizacao === 'excel' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setModoVisualizacao('excel')}
                className="text-[10px] h-6 px-2"
              >
                Modo Excel
              </Button>
              <Button
                variant={modoVisualizacao === 'ofx' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setModoVisualizacao('ofx')}
                className="text-[10px] h-6 px-2"
              >
                Modo OFX
              </Button>
            </div>
          </div>
          {/* PR6.1E-2 — Toolbar densa de filtros internos da lista.
              Compactacao pura: labels encurtados (Ver/Origem/Ord.), triggers
              h-6 text-[10px], gap-1.5. Logica e opcoes 100% preservadas. */}
          <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
            {modoVisualizacao === 'excel' ? (
              <>
                <span className="text-[10px] text-muted-foreground">Ver:</span>
                <Select value={filtroMostrar} onValueChange={(v) => setFiltroMostrar(v as FiltroMostrar)}>
                  <SelectTrigger className="h-6 w-[130px] text-[10px] px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos ({linhasExcel.length})</SelectItem>
                    <SelectItem value="forte">Forte</SelectItem>
                    <SelectItem value="fraco">Fraco</SelectItem>
                    <SelectItem value="sem_match">Sem match</SelectItem>
                    <SelectItem value="pendentes">Pendentes</SelectItem>
                    <SelectItem value="aprovados">Aprovados</SelectItem>
                    <SelectItem value="rejeitados">Rejeitados</SelectItem>
                    <SelectItem value="orfaos">Excel órfãos</SelectItem>
                    <SelectItem value="banco_orfao">Banco órfão</SelectItem>
                    <SelectItem value="corrigidos">Corrigidos</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-muted-foreground">Origem:</span>
                <Select value={filtroEscopo} onValueChange={(v) => setFiltroEscopo(v as FiltroEscopo)}>
                  <SelectTrigger className="h-6 w-[150px] text-[10px] px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="desta_conta">Excel desta conta</SelectItem>
                    <SelectItem value="outras_contas">Excel outras contas (divergência)</SelectItem>
                    <SelectItem value="sem_inferencia">Sem inferência de conta</SelectItem>
                    <SelectItem value="sem_ofx">Sem OFX vinculado</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-muted-foreground">Ord.:</span>
                <Select value={filtroOrdem} onValueChange={(v) => setFiltroOrdem(v as FiltroOrdem)}>
                  <SelectTrigger className="h-6 w-[120px] text-[10px] px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="score_desc">Score desc</SelectItem>
                    <SelectItem value="valor_desc">Valor desc</SelectItem>
                    <SelectItem value="valor_asc">Valor asc</SelectItem>
                    <SelectItem value="data_asc">Data asc</SelectItem>
                    <SelectItem value="data_desc">Data desc</SelectItem>
                    <SelectItem value="original">Original</SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                <span className="text-[10px] text-muted-foreground">Ver:</span>
                <Select value={filtroOfxMostrar} onValueChange={(v) => setFiltroOfxMostrar(v as FiltroMostrarOfx)}>
                  <SelectTrigger className="h-6 w-[150px] text-[10px] px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos ({extratos.length})</SelectItem>
                    <SelectItem value="pendentes">Pendentes</SelectItem>
                    <SelectItem value="com_sugestao">Com sugestão</SelectItem>
                    <SelectItem value="sem_sugestao">Sem sugestão</SelectItem>
                    <SelectItem value="aprovados">Aprovados</SelectItem>
                    <SelectItem value="ofx_orfao_validado">OFX órfão validado</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-muted-foreground">Ord.:</span>
                <Select value={filtroOfxOrdem} onValueChange={(v) => setFiltroOfxOrdem(v as FiltroOrdemOfx)}>
                  <SelectTrigger className="h-6 w-[120px] text-[10px] px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original">Original (extrato)</SelectItem>
                    <SelectItem value="data_asc">Data asc</SelectItem>
                    <SelectItem value="data_desc">Data desc</SelectItem>
                    <SelectItem value="valor_desc">Valor desc</SelectItem>
                    <SelectItem value="valor_asc">Valor asc</SelectItem>
                    <SelectItem value="score_desc">Score top desc</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
            {catalogoCarregando && (
              <span className="text-[10px] text-muted-foreground">Cat.: carregando…</span>
            )}
            {catalogoErro && (
              <span className="text-[10px] text-rose-600">Cat.: erro</span>
            )}
            {detalhesSessao && catalogo && (
              <span
                className="text-[10px] text-muted-foreground"
                title={`Catálogo: ${catalogo.contas.length} contas · ${catalogo.fazendas.length} fazendas · ${catalogo.subcentros.length} subcentros · ${catalogo.fornecedores.length} fornecedores`}
              >
                Cat.: {catalogo.contas.length}c · {catalogo.fazendas.length}f · {catalogo.subcentros.length}s · {catalogo.fornecedores.length}fn
              </span>
            )}
          </div>
        </DialogHeader>

        {/* PR6.1A — Tabs internas: Pareamento (conteúdo atual) + Revisão Staging */}
        <Tabs
          value={abaAtiva}
          onValueChange={(v) => setAbaAtiva(v as 'pareamento' | 'staging')}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="shrink-0 mx-2 mt-0.5 flex items-center gap-2">
            <TabsList className="h-6 grid grid-cols-2 max-w-md flex-1">
              <TabsTrigger value="pareamento" className="text-[11px] py-0">
                Pareamento
              </TabsTrigger>
              <TabsTrigger value="staging" className="text-[11px] py-0 relative">
                Revisão Staging
                {stagingTemRegistros && (
                  <span
                    className="ml-2 inline-block w-2 h-2 rounded-full bg-blue-500"
                    aria-label="Há registros em staging"
                  />
                )}
              </TabsTrigger>
            </TabsList>
            {/* Ações secundárias (exceção) inline na barra — só par pendente no Modo Excel */}
            {modoVisualizacao === 'excel' && parAtivo && parAtivo.decisao === 'pendente' && (
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-rose-700 border-rose-200 hover:bg-rose-50"
                        onClick={() => parAtivoKey && rejeitarPar(parAtivoKey)}>
                  <X className="h-3 w-3 mr-1" /> Rejeitar
                </Button>
                <PopoverOutroOfx
                  compact
                  extratos={extratos}
                  ofxConsumidos={ofxConsumidos}
                  ofxAtualId={parAtivo.ofxIdAtivo}
                  onEscolher={(novoId) => parAtivoKey && trocarOfx(parAtivoKey, novoId)}
                />
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                        onClick={() => parAtivoKey && marcarExcelOrfao(parAtivoKey)}>
                  <ArrowRight className="h-3 w-3 mr-1" /> Marcar órfão
                </Button>
              </div>
            )}
          </div>

          <TabsContent
            value="pareamento"
            className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden"
            forceMount
          >
        <div className={cn("h-full overflow-hidden grid gap-2 p-2",
          modoVisualizacao === 'excel' ? "grid-cols-[0.85fr_2.65fr]" : "grid-cols-[1.15fr_1.35fr_1fr]")}>

          {modoVisualizacao === 'excel' && <>

          {/* COL 1 — LISTA DE PARES */}
          <Card className="p-2 flex flex-col overflow-hidden min-h-[260px] xl:min-h-[320px]">
            {/* PR6.1F-3 — header densidade extrato: sem font-bold, com tracking-wide */}
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground px-1 pb-0.5 shrink-0">
              Pares ({linhasFiltradas.length} de {linhasExcel.length})
            </div>
            {/* PR6.1F-3 — divide-y substitui space-y-0.5: linhas finas
                separam itens como em extrato bancário real */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/40">
              {linhasFiltradas.map((linha) => {
                const key = linha.chaveLinha;
                const p = pares.get(key);
                const m = matches.get(key);
                const esc = escopoPorPar.get(key);
                const faixa = m?.faixa ?? 'nenhum';
                const data = linha.dataPagamento ?? linha.dataCompetencia;
                const valorSinalizado = (linha.sinal === 'entrada' ? 1 : -1) * (linha.valorCentavos / 100);
                const sug = sugestoes.get(key);
                const classifVals = [
                  sug?.contaSugerida?.confianca,
                  sug?.fazendaSugerida?.confianca,
                  sug?.subcentroSugerido?.confianca,
                  sug?.fornecedorOficial?.confianca,
                ].filter((v): v is number => typeof v === 'number');
                const classifPct = classifVals.length
                  ? Math.round(Math.min(...classifVals) * 100)
                  : null;
                const ativo = parAtivoKey === key;
                const decisao = p?.decisao ?? 'pendente';

                // PR3.2 — cor de borda: decisão sobrescreve escopo, que sobrescreve faixa
                const corBorda = (() => {
                  if (decisao === 'aprovado') return 'border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20';
                  if (decisao === 'rejeitado') return 'border-l-rose-500 bg-rose-50/40 dark:bg-rose-950/20';
                  if (decisao === 'excel_orfao') return 'border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20';
                  // pendente: prioriza divergência
                  if (esc?.isDivergente) return 'border-l-purple-500';
                  if (esc?.isContaIndefinida) return 'border-l-slate-400';
                  if (esc?.isDestaConta) {
                    if (faixa === 'forte') return 'border-l-blue-500';
                    if (faixa === 'fraco') return 'border-l-amber-500';
                    return 'border-l-rose-500';
                  }
                  return 'border-l-rose-500';
                })();

                const corTag = (() => {
                  if (esc?.isDestaConta) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
                  if (esc?.isDivergente) return 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300';
                  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
                })();

                const iconeDecisao =
                  decisao === 'aprovado' ? '✓' :
                  decisao === 'rejeitado' ? '✗' :
                  decisao === 'excel_orfao' ? '→' :
                  '—';

                // PR6.1D-5 — marcação sutil de transferência (mesma decisão usada
                // pelo filtro pill). Ordem do cn() garante que corBorda (status da
                // decisão) sobreponha o azul: linha aprovada/rejeitada/órfã mantém
                // a cor de status; transferência pendente recebe a tinta azul.
                const linhaEhTransferencia = ehTransferencia(linha);

                return (
                  <button
                    key={key}
                    onClick={() => setParAtivoKey(key)}
                    title={esc?.rotuloConta ? `Conta sugerida: ${esc.rotuloConta}` : undefined}
                    className={cn(
                      // PR6.1F-3 / DensidadePainel — densidade extrato: px-1.5 py-0.5, fonte menor
                      'w-full flex items-center gap-1.5 px-1.5 py-0.5 text-[10px] leading-tight border-l-[3px] rounded-r text-left tabular-nums',
                      linhaEhTransferencia && 'bg-blue-500/5',
                      corBorda,
                      ativo && 'ring-2 ring-primary ring-inset bg-muted',
                    )}
                  >
                    <span className="shrink-0 w-3 text-center text-muted-foreground">{iconeDecisao}</span>
                    {p?.correcao && <span className="shrink-0 text-[9px] text-blue-700" title="Par corrigido">✎</span>}
                    <span className="text-[10px] text-muted-foreground tabular-nums w-10 shrink-0">
                      {data ? format(new Date(data + 'T12:00:00'), 'dd/MM', { locale: ptBR }) : '—'}
                    </span>
                    <BadgeContaResolvida
                      resolvido={resolucaoPorContaTexto.get(linha.contaTexto ?? '') ?? null}
                      ehContaDaSessao={
                        !!sessaoCompleta?.sessao.conta_bancaria_id &&
                        resolucaoPorContaTexto.get(linha.contaTexto ?? '')?.id ===
                          sessaoCompleta.sessao.conta_bancaria_id
                      }
                    />
                    {linhaEhTransferencia && (
                      <span
                        className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-blue-500/15 text-blue-700 border border-blue-500/30 leading-none"
                        title="Movimento de transferência entre contas"
                      >
                        <ArrowLeftRight className="h-2.5 w-2.5" aria-hidden="true" />
                        <span className="tracking-tight">Transferência</span>
                      </span>
                    )}
                    {/* PR-4A.fix item 3 — lista é navegação: sem texto longo de fornecedor/subcentro */}
                    <span className="flex-1 min-w-0" />
                    <span className={cn('tabular-nums shrink-0 font-medium',
                      linha.sinal === 'entrada' ? 'text-emerald-600' : 'text-rose-600',
                    )}>{fmtBRL(valorSinalizado)}</span>
                    {/* Pareamento × classificação — rotulados, nunca número solo. C = confiança mínima */}
                    <span
                      className="shrink-0 flex flex-col items-end leading-none gap-0.5 w-12"
                      title={faixa === 'nenhum'
                        ? `Sem OFX${classifPct != null ? ` · Classif. mín. ${classifPct}` : ''}`
                        : `Pareado · Match ${m?.score ?? 0}${classifPct != null ? ` · Classif. mín. ${classifPct}` : ''}`}
                    >
                      {faixa === 'nenhum' ? (
                        <span className="text-[9px] uppercase tracking-tight text-muted-foreground/70 font-medium">s/OFX</span>
                      ) : (
                        <span className={cn('text-[10px] tabular-nums font-semibold',
                          faixa === 'forte' ? 'text-emerald-700' : 'text-amber-700')}>
                          M {m?.score ?? 0}
                        </span>
                      )}
                      {classifPct != null && (
                        <span className="text-[9px] tabular-nums text-muted-foreground/70">C {classifPct}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* COL 2 — DETALHE DO PAR ATIVO */}
          <Card className="p-2 flex flex-col overflow-hidden min-h-[260px] xl:min-h-[320px]">
            <div className="text-[9px] font-bold uppercase text-muted-foreground pb-1 shrink-0">
              Detalhe do par
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {!parAtivo || !linhaAtiva ? (
                <div className="text-center text-muted-foreground italic py-12">
                  Selecione um par na lista à esquerda
                </div>
              ) : (
                <>
                  {/* PASSO 3 — painel único: BLOCO A (OFX soberano) + BLOCO C (Campo|Excel|Resultado) */}
                  {painelDetalhe()}
                </>
              )}
            </div>
          </Card>

          </>}

          {modoVisualizacao === 'ofx' && <>

          {/* COL 1 — LISTA DE OFX */}
          <Card className="p-2 flex flex-col overflow-hidden min-h-[260px] xl:min-h-[320px]">
            {/* PR6.1F-3 — header densidade extrato (mesmo padrão da Lista Excel) */}
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 pb-1 shrink-0">
              OFX ({ofxFiltrados.length} de {extratos.length})
            </div>
            {/* PR6.1F-3 — divide-y para separar linhas como extrato bancário */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/40">
              {ofxFiltrados.map((e) => {
                const validacao = ofxValidacoes.get(e.id) ?? 'pendente';
                const consumido = ofxConsumidos.has(e.id);
                const candidatos = candidatosPorOfx.get(e.id) ?? [];
                const ativo = ofxAtivoId === e.id;
                const topScore = candidatos[0]?.score ?? 0;

                const corBorda =
                  validacao === 'ofx_orfao_validado'
                    ? 'border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20'
                    : consumido
                      ? 'border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : candidatos.length === 0
                        ? 'border-l-slate-400'
                        : topScore >= 80
                          ? 'border-l-blue-500'
                          : topScore >= 60
                            ? 'border-l-amber-500'
                            : 'border-l-rose-500';

                const icone =
                  validacao === 'ofx_orfao_validado' ? '⊘' :
                  consumido ? '✓' : '—';

                return (
                  <button
                    key={e.id}
                    onClick={() => setOfxAtivoId(e.id)}
                    className={cn(
                      // PR6.1F-3 — densidade extrato (mesmo padrão da Lista Excel)
                      'w-full flex items-center gap-1.5 px-1.5 py-1 text-[11px] leading-tight border-l-[3px] rounded-r text-left tabular-nums',
                      corBorda,
                      ativo && 'ring-2 ring-primary ring-inset bg-muted',
                    )}
                  >
                    <span className="shrink-0 w-3 text-center text-muted-foreground">{icone}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-12 shrink-0">
                      {format(new Date(e.data_movimento + 'T12:00:00'), 'dd/MM', { locale: ptBR })}
                    </span>
                    <span className="flex-1 truncate" title={e.descricao}>{e.descricao}</span>
                    <span className={cn('tabular-nums shrink-0 font-medium',
                      e.valor >= 0 ? 'text-emerald-600' : 'text-rose-600',
                    )}>{fmtBRL(e.valor)}</span>
                    {/* PR6.1F-3 — score sem badge, cor semantica por faixa */}
                    {candidatos.length > 0 ? (
                      <span
                        className={cn(
                          'shrink-0 text-[10px] tabular-nums w-7 text-right',
                          topScore >= 80 && 'text-emerald-700 font-semibold',
                          topScore >= 60 && topScore < 80 && 'text-amber-700',
                          topScore < 60 && 'text-rose-700',
                        )}
                        title={`Top score: ${topScore}`}
                      >
                        {topScore}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground w-7 text-right">—</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* COL 2 — DETALHE DO OFX */}
          <Card className="p-3 flex flex-col overflow-hidden min-h-[260px] xl:min-h-[320px]">
            <div className="text-[10px] font-bold uppercase text-muted-foreground pb-2 shrink-0">
              Detalhe do OFX
            </div>
            {(() => {
              if (!ofxAtivoId) return (
                <div className="flex-1 text-center text-muted-foreground italic py-12">
                  Selecione um OFX na lista à esquerda
                </div>
              );
              const ofx = extratos.find((e) => e.id === ofxAtivoId);
              if (!ofx) return null;
              const candidatos = candidatosPorOfx.get(ofx.id) ?? [];
              const validacao = ofxValidacoes.get(ofx.id) ?? 'pendente';

              // PR-MesaGlobal-Ergonomia-1B — candidato top p/ field-view (reusa helpers do loop)
              const top = candidatos[0] ?? null;
              const linhaTop = top?.linha ?? null;
              const sugTop = top ? sugestoes.get(top.excelKey) : undefined;
              const parTop = top ? pares.get(top.excelKey) : undefined;
              const finalTop = top
                ? consolidarFotografia(sugTop, parTop?.correcao ?? null, ofx.id,
                    buildFallbacks(top.excelKey, ofx.id, linhasExcel, extratos))
                : null;

              return (
                <div className="flex-1 overflow-y-auto space-y-3">
                  {/* BLOCO 1 — CONFERÊNCIA (OFX × candidato top) */}
                  <div className="border rounded p-2.5 space-y-0.5 bg-muted/30">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground pb-1">Conferência</div>
                    {(() => {
                      const fmtData = (d?: string | null) => d ? format(new Date(d + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—';
                      const exData = linhaTop ? (linhaTop.dataPagamento ?? linhaTop.dataCompetencia ?? null) : null;
                      const exValor = linhaTop ? (linhaTop.sinal === 'entrada' ? 1 : -1) * (linhaTop.valorCentavos / 100) : null;
                      let dias: number | null = null;
                      if (linhaTop && exData) {
                        dias = Math.round((new Date(ofx.data_movimento + 'T12:00:00').getTime()
                          - new Date(exData + 'T12:00:00').getTime()) / 86400000);
                      }
                      const valorIgual = linhaTop && exValor != null ? Math.abs(Math.abs(ofx.valor) - Math.abs(exValor)) < 0.01 : false;
                      const colExcel = (v: ReactNode) => linhaTop ? [{ head: 'Excel', valor: v }] : [];
                      return (
                        <>
                          <CampoLinha label="Data"
                            cols={[{ head: 'OFX', valor: fmtData(ofx.data_movimento) }, ...colExcel(fmtData(exData))]}
                            status={!linhaTop ? null : (dias === 0 ? { tone: 'ok', texto: '✓ igual' } : dias != null ? { tone: 'warn', texto: `⚠ ${Math.abs(dias)} dia(s)` } : null)} />
                          <CampoLinha label="Valor"
                            cols={[{ head: 'OFX', valor: fmtBRL(ofx.valor) }, ...colExcel(exValor != null ? fmtBRL(exValor) : '—')]}
                            status={!linhaTop ? null : (valorIgual ? { tone: 'ok', texto: '✓ idêntico' } : { tone: 'bad', texto: '✗ diverge' })} />
                          <CampoLinha label="Banco"
                            cols={[{ head: 'OFX', valor: contaNome ?? '—' }, ...colExcel(linhaTop?.contaTexto || '—')]} />
                          <CampoLinha label="Texto"
                            cols={[{ head: 'OFX', valor: ofx.descricao || '—' }, ...colExcel(linhaTop?.fornecedor || linhaTop?.observacao || '—')]}
                            status={!top ? null : (top.faixa === 'forte' ? { tone: 'ok', texto: '✓ semelhante' } : top.faixa === 'fraco' ? { tone: 'warn', texto: `~ score ${top.score}` } : null)} />
                        </>
                      );
                    })()}
                    {validacao === 'ofx_orfao_validado' && (
                      <div className="text-[10px] font-semibold px-2 py-1 mt-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        ⊘ OFX órfão validado — operador marcou como sem Excel correspondente
                      </div>
                    )}
                  </div>

                  {/* BLOCO 2 — CLASSIFICAÇÃO (candidato top) */}
                  {top && linhaTop && (
                    <div className="border rounded p-2.5 space-y-1">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground pb-1">Classificação (candidato top)</div>
                      <CampoLinha label="Forn." cols={[
                        { head: 'Excel', valor: linhaTop.fornecedor || '—' },
                        { head: 'Sug.', valor: sugTop?.fornecedorOficial?.nome ?? '—' },
                        { head: 'Final', valor: finalTop?.fornecedorNome ?? '—' }]} />
                      <CampoLinha label="Fazenda" cols={[
                        { head: 'Excel', valor: linhaTop.fazendaTexto || '—' },
                        { head: 'Sug.', valor: sugTop?.fazendaSugerida?.nome ?? '—' },
                        { head: 'Final', valor: finalTop?.fazendaNome ?? '—' }]} />
                      <CampoLinha label="Subc." cols={[
                        { head: 'Excel', valor: linhaTop.subcentro || '—' },
                        { head: 'Sug.', valor: sugTop?.subcentroSugerido?.subcentro ?? '—' },
                        { head: 'Final', valor: finalTop?.subcentro ?? '—' }]} />
                      <CampoLinha label="Produto" cols={[
                        { head: 'Excel', valor: linhaTop.produto || '—' },
                        { head: 'Sug.', valor: '—' },
                        { head: 'Final', valor: finalTop?.produto ?? '—' }]} />
                      <CampoLinha label="Compl." cols={[
                        { head: 'Excel', valor: linhaTop.observacao || '—' },
                        { head: 'Sug.', valor: '—' },
                        { head: 'Final', valor: finalTop?.descricao ?? '—' }]} />
                    </div>
                  )}

                  <div className="border rounded p-2.5">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground pb-1.5">
                      Candidatos Excel ({candidatos.length})
                    </div>
                    {candidatos.length === 0 ? (
                      <div className="text-xs italic text-muted-foreground">
                        Nenhum candidato encontrado pelo motor de match
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {candidatos.slice(0, 5).map((cand) => {
                          const data = cand.linha.dataPagamento ?? cand.linha.dataCompetencia;
                          const valorSinalizado = (cand.linha.sinal === 'entrada' ? 1 : -1)
                            * (cand.linha.valorCentavos / 100);
                          const par = pares.get(cand.excelKey);
                          const jaAprovadoOutroOfx = par?.decisao === 'aprovado' && par.ofxIdAtivo !== ofx.id;
                          // PR6.1C-2 — valida payload da aprovação ANTES de oferecer o botão.
                          // Payload reproduz exatamente o que aprovarOfxComExcel salvaria.
                          const sugCand = sugestoes.get(cand.excelKey);
                          const fallbacksCand = buildFallbacks(
                            cand.excelKey, ofx.id, linhasExcel, extratos,
                          );
                          const payloadCand = consolidarFotografia(
                            sugCand, par?.correcao ?? null, ofx.id, fallbacksCand,
                          );
                          const validacaoCand = validarAprovacao(payloadCand, cand.linha);
                          const acaoDesabilitada =
                            jaAprovadoOutroOfx || validacao === 'ofx_orfao_validado';
                          return (
                            <div
                              key={cand.excelKey}
                              className={cn(
                                'border rounded',
                                cand.faixa === 'forte' && 'border-blue-300',
                                cand.faixa === 'fraco' && 'border-amber-300',
                                jaAprovadoOutroOfx && 'opacity-50',
                              )}
                            >
                              <div className="flex items-center gap-2 px-2 py-1.5 text-[11px]">
                                <span className="text-[10px] text-muted-foreground tabular-nums w-12 shrink-0">
                                  {data ? format(new Date(data + 'T12:00:00'), 'dd/MM', { locale: ptBR }) : '—'}
                                </span>
                                <span className="flex-1 truncate">
                                  {cand.linha.fornecedor || cand.linha.subcentro || '—'}
                                </span>
                                <span className={cn('tabular-nums shrink-0',
                                  cand.linha.sinal === 'entrada' ? 'text-emerald-600' : 'text-rose-600',
                                )}>{fmtBRL(valorSinalizado)}</span>
                                <Badge
                                  variant={cand.faixa === 'forte' ? 'default' :
                                           cand.faixa === 'fraco' ? 'secondary' : 'destructive'}
                                  className="text-[9px] h-3.5 px-1 shrink-0 leading-none"
                                >{cand.score}</Badge>
                                {jaAprovadoOutroOfx && (
                                  <span className="text-[9px] text-amber-700 shrink-0">já aprov. em outro OFX</span>
                                )}
                                {validacaoCand.valido ? (
                                  <Button
                                    size="sm" variant="outline"
                                    className="h-6 text-[10px] shrink-0"
                                    disabled={acaoDesabilitada}
                                    onClick={() => aprovarOfxComExcel(ofx.id, cand.excelKey)}
                                  >
                                    Aprovar
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm" variant="outline"
                                    className="h-6 text-[10px] shrink-0 border-amber-300 text-amber-800 hover:bg-amber-50"
                                    disabled={acaoDesabilitada}
                                    title={validacaoCand.mensagem}
                                    onClick={() => {
                                      // PR6.2-M0.7 — vincular OFX sugerido ao par ANTES de navegar pro Modo Excel.
                                      // Sem isso, o par chegava no Excel com ofxIdAtivo=null, exibindo "Sem OFX"
                                      // e perdendo o contexto da sugestão que motivou o "Corrigir antes".
                                      // trocarOfx mantém decisao='pendente' — NÃO aprova automaticamente.
                                      trocarOfx(cand.excelKey, ofx.id);
                                      setParAtivoKey(cand.excelKey);
                                      setModoVisualizacao('excel');
                                      iniciarCorrecao(cand.excelKey);
                                    }}
                                  >
                                    Corrigir antes
                                  </Button>
                                )}
                              </div>
                              {!validacaoCand.valido && (
                                <div className="px-2 pb-1.5">
                                  <Badge
                                    variant="outline"
                                    className="text-amber-700 bg-amber-50 border-amber-200 text-[9px] h-4 leading-none font-normal"
                                  >
                                    Faltam: {validacaoCand.camposFaltantes.join(', ')}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </Card>

          {/* COL 3 — DECISÃO OFX */}
          <Card className="p-3 flex flex-col overflow-hidden min-h-[260px] xl:min-h-[320px]">
            <div className="text-[10px] font-bold uppercase text-muted-foreground pb-2 shrink-0">
              Decisão
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {!ofxAtivoId ? (
                <div className="text-center text-muted-foreground italic py-12">
                  Selecione um OFX
                </div>
              ) : (() => {
                const validacao = ofxValidacoes.get(ofxAtivoId) ?? 'pendente';
                const consumido = ofxConsumidos.has(ofxAtivoId);

                if (consumido) {
                  // Encontrar qual par consumiu
                  let parKey: string | null = null;
                  pares.forEach((p, k) => {
                    if (p.decisao === 'aprovado' && p.ofxIdAtivo === ofxAtivoId) parKey = k;
                  });
                  return (
                    <>
                      <div className="text-[11px] text-emerald-700 px-1">
                        ✓ Aprovado via par Excel
                      </div>
                      {parKey && (
                        <Button
                          size="sm" variant="ghost"
                          className="w-full justify-start text-xs h-8"
                          onClick={() => { if (parKey) desfazer(parKey); }}
                        >
                          <Undo2 className="h-3.5 w-3.5 mr-2" /> Desfazer aprovação
                        </Button>
                      )}
                    </>
                  );
                }

                if (validacao === 'ofx_orfao_validado') {
                  return (
                    <Button
                      size="sm" variant="ghost"
                      className="w-full justify-start text-xs h-8"
                      onClick={() => desfazerOfxOrfaoValidado(ofxAtivoId)}
                    >
                      <Undo2 className="h-3.5 w-3.5 mr-2" /> Desfazer (ofx órfão validado)
                    </Button>
                  );
                }

                return (
                  <>
                    <div className="text-[11px] text-muted-foreground px-1 pb-1">
                      OFX pendente. Aprove via candidato Excel (col. 2) ou marque como órfão validado:
                    </div>
                    <Button
                      size="sm" variant="outline"
                      className="w-full justify-start text-xs h-8"
                      onClick={() => marcarOfxOrfaoValidado(ofxAtivoId)}
                    >
                      ⊘ Marcar como OFX órfão validado
                    </Button>
                    <div className="text-[10px] text-muted-foreground px-1 pt-1">
                      Use para: rendimentos automáticos, IOF, tarifas, estornos internos —
                      qualquer OFX que nunca terá Excel correspondente.
                    </div>
                  </>
                );
              })()}
            </div>
          </Card>

          </>}

        </div>
          </TabsContent>

          <TabsContent
            value="staging"
            className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden"
          >
            {sessaoCompleta?.sessao.id ? (
              <MesaStagingTab sessaoId={sessaoCompleta.sessao.id} />
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Sessão não disponível.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SugLinha({ label, valor, conf, title }: {
  label: string;
  valor: string | null | undefined;
  conf?: number | undefined;
  title?: string;
}) {
  const pct = conf != null ? Math.round(conf * 100) : null;
  const corPct = pct != null && pct >= 80 ? 'text-emerald-700'
              : pct != null && pct >= 50 ? 'text-amber-700'
              : 'text-rose-700';
  return (
    // PR6.1F-2 — denso: label uppercase mini sem ':', valor truncate,
    // title opcional para preservar contexto longo (ex.: hierarquia do Subc.).
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-[10px] uppercase font-medium text-muted-foreground shrink-0">
        {label}
      </span>
      <span
        className={cn(
          'text-[11px] truncate flex-1',
          !valor && 'italic text-muted-foreground',
        )}
        title={title}
      >
        {valor ?? '—'}
      </span>
      {pct != null && valor && (
        <span className={cn('text-[10px] tabular-nums shrink-0', corPct)}>{pct}%</span>
      )}
    </div>
  );
}

// PR-MesaGlobal-Ergonomia-3 — linha da grade horizontal: CAMPO | OFX | EXCEL | SUG | FINAL | STATUS
function MatrizLinha({ campo, ofx, excel, sug, fin, status }: {
  campo: string;
  ofx?: ReactNode; excel?: ReactNode; sug?: ReactNode; fin?: ReactNode;
  status?: { tone: 'ok' | 'warn' | 'bad'; icone: string; titulo: string } | null;
}) {
  const tcls = status?.tone === 'ok' ? 'text-emerald-700'
    : status?.tone === 'warn' ? 'text-amber-700'
    : status?.tone === 'bad' ? 'text-rose-700' : '';
  const cell = (v?: ReactNode) => (
    <span className="truncate" title={typeof v === 'string' ? v : undefined}>{v == null || v === '' ? '—' : v}</span>
  );
  return (
    <div className="grid grid-cols-[72px_1fr_1fr_1.1fr] gap-1 px-1 py-0.5 border-b border-border/30 last:border-0 items-center text-[10px] tabular-nums">
      <span className="text-[9px] uppercase font-medium text-muted-foreground truncate" title={campo}>{campo}</span>
      {cell(ofx)}{cell(excel)}{typeof fin === 'string' ? cell(fin) : fin}
    </div>
  );
}

// PR-MesaGlobal-Ergonomia-1 — linha campo-a-campo: rótulo + 2/3 células alinhadas + status opcional
function CampoLinha({ label, cols, status }: {
  label: string;
  cols: { head: string; valor: ReactNode }[];
  status?: { tone: 'ok' | 'warn' | 'bad'; texto: string } | null;
}) {
  const toneCls = status?.tone === 'ok' ? 'text-emerald-700'
    : status?.tone === 'warn' ? 'text-amber-700'
    : status?.tone === 'bad' ? 'text-rose-700' : '';
  return (
    <div className="grid grid-cols-[64px_1fr] gap-x-2 items-baseline py-0.5 border-b border-border/30 last:border-0">
      <span className="text-[10px] uppercase font-medium text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-3 flex-wrap">
        {cols.map((c, i) => (
          <span key={i} className="text-[11px] min-w-0">
            <span className="text-[9px] uppercase text-muted-foreground/70 mr-1">{c.head}</span>
            <span className="tabular-nums">{c.valor ?? '—'}</span>
          </span>
        ))}
        {status && <span className={`text-[10px] ml-auto ${toneCls}`}>{status.texto}</span>}
      </div>
    </div>
  );
}

// PR-4A — Resultado Fornecedor inline: Command compacto em popover (não cresce a linha).
// Escreve direto no correcao do par via onPick. Lógica relocada do FormularioCorrecao.
function FornecedorInline({ clienteId, valor, excelOriginal, marcadoNovo, vinculadoId, disabled, onPick }: {
  clienteId: string;
  valor: string | null;
  excelOriginal: string | null;
  marcadoNovo: boolean;
  vinculadoId: string | null;
  disabled?: boolean;
  onPick: (patch: Partial<ParCorrecao>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');
  // PR-P2 — typeahead server-side: não depende do catálogo client-side (1000).
  // Mesmo padrão do FornecedorSelect shared: debounce 300ms + ilike + limit 50.
  const [buscaDebounced, setBuscaDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);
  const { data: filtrados = [], isFetching } = useQuery({
    queryKey: ['mesa-fornecedores-busca', clienteId, buscaDebounced] as const,
    enabled: !!clienteId && buscaDebounced.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const safe = buscaDebounced.trim().replace(/[%,()]/g, ' ').trim();
      if (!safe) return [];
      const { data, error } = await supabase
        .from('financeiro_fornecedores')
        .select('id, nome')
        .eq('cliente_id', clienteId)
        .eq('ativo', true)
        .or(`nome_normalizado.ilike.%${safe}%,nome.ilike.%${safe}%`)
        .order('nome', { ascending: true })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const mostrarExcel = !!excelOriginal && !filtrados.some((f) => f.nome.toLowerCase() === excelOriginal.toLowerCase());
  const mostrarNovo = busca.trim().length >= 2
    && !filtrados.some((f) => f.nome.toLowerCase() === busca.trim().toLowerCase())
    && busca.trim().toLowerCase() !== (excelOriginal ?? '').toLowerCase();
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setBusca(''); }}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}
                className="h-7 w-full justify-between text-[11px] px-2 font-normal">
          <span className="truncate">{valor || '—'}</span>
          <span className="ml-1 shrink-0 text-[9px] text-muted-foreground">
            {vinculadoId ? '✓ ' : marcadoNovo ? '⚑ ' : ''}▾
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={busca} onValueChange={setBusca} placeholder="Buscar fornecedor…" className="text-[11px] h-7" />
          <CommandList className="max-h-44">
            <CommandEmpty className="py-2 text-[10px] text-center text-muted-foreground">
              {busca.trim().length < 2 ? 'Digite ao menos 2 caracteres' : isFetching ? 'Buscando…' : 'Nenhum fornecedor encontrado'}
            </CommandEmpty>
            {mostrarExcel && excelOriginal && (
              <CommandGroup heading="Criar do Excel">
                <CommandItem value={`excel|${excelOriginal}`} className="text-[11px]"
                  onSelect={() => { onPick({ fornecedorId: null, fornecedorNome: excelOriginal, fornecedorMarcadoNovo: true }); setOpen(false); }}>
                  <span className="text-amber-700 mr-2">+</span><span className="flex-1 truncate">Criar fornecedor: "{excelOriginal}"</span>
                </CommandItem>
              </CommandGroup>
            )}
            {filtrados.length > 0 && (
              <CommandGroup heading="Catálogo oficial">
                {filtrados.map((f) => (
                  <CommandItem key={f.id} value={f.nome} className="text-[11px]"
                    onSelect={() => { onPick({ fornecedorId: f.id, fornecedorNome: f.nome, fornecedorMarcadoNovo: false }); setOpen(false); }}>
                    <span className="text-emerald-700 mr-2">✓</span><span className="flex-1 truncate">{f.nome}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {mostrarNovo && (
              <CommandGroup heading="Novo fornecedor">
                <CommandItem value={`novo|${busca}`} className="text-[11px]"
                  onSelect={() => { onPick({ fornecedorId: null, fornecedorNome: busca.trim(), fornecedorMarcadoNovo: true }); setOpen(false); }}>
                  <span className="text-amber-700 mr-2">+</span><span className="flex-1 truncate">Marcar como novo: "{busca.trim()}"</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// PR-4A — Resultado Subcentro inline: Command compacto particionado por natureza.
function SubcentroInline({ catalogo, valor, naturezaAlvo, disabled, onPick }: {
  catalogo: CatalogoCliente | undefined;
  valor: string | null;
  naturezaAlvo: NaturezaSubcentro | null;
  disabled?: boolean;
  onPick: (patch: Partial<ParCorrecao>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const part = useMemo<{ primarios: SubcentroUsado[]; secundarios: SubcentroUsado[] }>(() => {
    const q = busca.toLowerCase().trim();
    const todos = (catalogo?.subcentros ?? []).filter((s) => !q || s.subcentro.toLowerCase().includes(q));
    if (!naturezaAlvo) return { primarios: todos.slice(0, 15), secundarios: [] };
    const primariosRaw = todos.filter((s) => s.naturezas.has(naturezaAlvo));
    const secundariosRaw = todos.filter((s) => !s.naturezas.has(naturezaAlvo));
    primariosRaw.sort((a, b) => {
      const qa = naturezaAlvo === 'entrada' ? a.qt_uso_entrada : naturezaAlvo === 'saida' ? a.qt_uso_saida : a.qt_uso_transferencia;
      const qb = naturezaAlvo === 'entrada' ? b.qt_uso_entrada : naturezaAlvo === 'saida' ? b.qt_uso_saida : b.qt_uso_transferencia;
      return qb - qa;
    });
    return { primarios: primariosRaw.slice(0, 12), secundarios: secundariosRaw.slice(0, 6) };
  }, [busca, catalogo, naturezaAlvo]);
  const pick = (s: SubcentroUsado) => {
    onPick({ subcentro: s.subcentro, macro_custo: s.macro_custo, grupo_custo: s.grupo_custo, centro_custo: s.centro_custo });
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setBusca(''); }}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}
                className="h-7 w-full justify-between text-[11px] px-2 font-normal">
          <span className="truncate">{valor || '—'}</span>
          <span className="ml-1 shrink-0 text-[9px] text-muted-foreground">▾</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={busca} onValueChange={setBusca} placeholder="Buscar subcentro…" className="text-[11px] h-7" />
          <CommandList className="max-h-52">
            <CommandEmpty className="py-2 text-[10px] text-center text-muted-foreground">Nenhum subcentro encontrado</CommandEmpty>
            {part.primarios.length > 0 && (
              <CommandGroup heading={naturezaAlvo ? `Da natureza ${labelNatureza(naturezaAlvo)}` : 'Subcentros'}>
                {part.primarios.map((s) => {
                  const qt = !naturezaAlvo ? s.qt_uso : naturezaAlvo === 'entrada' ? s.qt_uso_entrada : naturezaAlvo === 'saida' ? s.qt_uso_saida : s.qt_uso_transferencia;
                  return (
                    <CommandItem key={`prim|${s.subcentro}|${s.macro_custo ?? ''}|${s.grupo_custo ?? ''}|${s.centro_custo ?? ''}`}
                      value={s.subcentro} className="text-[11px]" onSelect={() => pick(s)}>
                      <span className="flex-1 truncate">{s.subcentro}</span>
                      {s.origem === 'historico' && <span className="text-[9px] text-amber-700 mr-2" title="Subcentro legado">⚠ legado</span>}
                      <span className="text-[9px] text-muted-foreground ml-2">({qt}x)</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {part.secundarios.length > 0 && (
              <CommandGroup heading="Outras naturezas (não recomendado)">
                {part.secundarios.map((s) => {
                  const naturezasLabel = Array.from(s.naturezas).map((n) => labelNatureza(n)).join('/');
                  return (
                    <CommandItem key={`sec|${s.subcentro}|${s.macro_custo ?? ''}|${s.grupo_custo ?? ''}|${s.centro_custo ?? ''}`}
                      value={`outras-${s.subcentro}`} className="text-[11px] opacity-60" onSelect={() => pick(s)}>
                      <span className="text-amber-700 mr-1">⚠</span>
                      <span className="flex-1 truncate text-muted-foreground">{s.subcentro}</span>
                      <span className="text-[9px] text-muted-foreground ml-2">({naturezasLabel || 's/ natureza'})</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PopoverOutroOfx({ extratos, ofxConsumidos, ofxAtualId, onEscolher, compact }: {
  extratos: OfxItem[];
  ofxConsumidos: Set<string>;
  ofxAtualId: string | null;
  onEscolher: (id: string) => void;
  compact?: boolean;
}) {
  const [busca, setBusca] = useState<string>('');
  const filtrados = useMemo<OfxItem[]>(() => {
    const q = busca.toLowerCase().trim();
    return extratos.filter((e) =>
      e.id !== ofxAtualId &&
      !ofxConsumidos.has(e.id) &&
      (!q || e.descricao.toLowerCase().includes(q)),
    );
  }, [extratos, busca, ofxAtualId, ofxConsumidos]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        {compact ? (
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2">
            <ArrowLeftRight className="h-3 w-3 mr-1" /> Outro OFX…
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="w-full justify-start text-xs h-8">
            <ArrowLeftRight className="h-3.5 w-3.5 mr-2" /> Outro OFX…
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-2" align="start">
        <div className="flex items-center gap-1 pb-2">
          <Search className="h-3 w-3 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por descrição…"
            className="h-7 text-xs"
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto space-y-0.5">
          {filtrados.slice(0, 100).map((e) => (
            <button
              key={e.id}
              onClick={() => onEscolher(e.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted text-left"
            >
              <span className="text-[10px] text-muted-foreground tabular-nums w-12 shrink-0">
                {format(new Date(e.data_movimento + 'T12:00:00'), 'dd/MM', { locale: ptBR })}
              </span>
              <span className="flex-1 truncate">{e.descricao}</span>
              <span className={cn('tabular-nums shrink-0 font-medium',
                e.valor >= 0 ? 'text-emerald-600' : 'text-rose-600',
              )}>{fmtBRL(e.valor)}</span>
            </button>
          ))}
          {filtrados.length === 0 && (
            <div className="text-xs italic text-muted-foreground py-3 text-center">
              Sem candidatos
            </div>
          )}
          {filtrados.length > 100 && (
            <div className="text-[10px] italic text-muted-foreground py-1 text-center">
              Exibindo 100 de {filtrados.length} — refine a busca
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// PR4 + PR4.1 — Formulário inline de correção. Aparece na Col 3 quando
// `corrigindoExcelKey === parAtivoKey`. Substitui o card de sugestão +
// botões de decisão. Operador refina os campos; "Aplicar + Aprovar"
// fecha o par em 1 clique. "Só aplicar" mantém pendente. "Cancelar" descarta.
function FormularioCorrecao({
  rascunho, setRascunho, catalogo,
  fornecedorBusca, setFornecedorBusca,
  subcentroBusca, setSubcentroBusca,
  fornecedorExcelOriginal,
  naturezaAlvo,
  // PR6.2-M0.6 — props read-only para computar Pgto. (banco/Excel imutável)
  ofxAtivo,
  linhaAtiva,
  onAplicar, onAplicarEAprovar, onCancelar,
}: {
  rascunho: ParCorrecao;
  setRascunho: Dispatch<SetStateAction<ParCorrecao | null>>;
  catalogo: CatalogoCliente;
  fornecedorBusca: string;
  setFornecedorBusca: (v: string) => void;
  subcentroBusca: string;
  setSubcentroBusca: (v: string) => void;
  fornecedorExcelOriginal: string | null;
  naturezaAlvo: NaturezaSubcentro | null;
  ofxAtivo: OfxItem | null;
  linhaAtiva: ExcelLinhaNormalizada | null;
  onAplicar: () => void;
  onAplicarEAprovar: () => void;
  onCancelar: () => void;
}) {
  const fornecedoresFiltrados = useMemo(() => {
    const q = fornecedorBusca.toLowerCase().trim();
    if (!q || q.length < 2) return [];
    return catalogo.fornecedores
      .filter((f) =>
        f.nome.toLowerCase().includes(q)
        || (f.nome_normalizado ?? '').includes(q)
        || (f.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 5);
  }, [fornecedorBusca, catalogo.fornecedores]);

  // PR4.2 — particiona subcentros pela natureza alvo:
  //   primários = natureza casa com linha.sinal (qt_uso da natureza alvo)
  //   secundários = não casa (fallback "outras naturezas")
  // Caso sem natureza (raro): 1 grupo geral com comportamento PR4 preservado.
  const subcentrosParticionados = useMemo<{
    primarios: SubcentroUsado[];
    secundarios: SubcentroUsado[];
  }>(() => {
    const q = subcentroBusca.toLowerCase().trim();
    const todos = catalogo.subcentros.filter((s) =>
      !q || s.subcentro.toLowerCase().includes(q),
    );

    if (!naturezaAlvo) {
      return { primarios: todos.slice(0, 15), secundarios: [] };
    }

    const primariosRaw = todos.filter((s) => s.naturezas.has(naturezaAlvo));
    const secundariosRaw = todos.filter((s) => !s.naturezas.has(naturezaAlvo));

    primariosRaw.sort((a, b) => {
      const qa =
        naturezaAlvo === 'entrada' ? a.qt_uso_entrada :
        naturezaAlvo === 'saida' ? a.qt_uso_saida :
        a.qt_uso_transferencia;
      const qb =
        naturezaAlvo === 'entrada' ? b.qt_uso_entrada :
        naturezaAlvo === 'saida' ? b.qt_uso_saida :
        b.qt_uso_transferencia;
      return qb - qa;
    });

    return {
      primarios: primariosRaw.slice(0, 12),
      secundarios: secundariosRaw.slice(0, 6),
    };
  }, [subcentroBusca, catalogo.subcentros, naturezaAlvo]);

  function set<K extends keyof ParCorrecao>(field: K, value: ParCorrecao[K]) {
    setRascunho((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function escolherFornecedor(f: CatalogoCliente['fornecedores'][number]) {
    setRascunho((prev) => (prev ? {
      ...prev,
      fornecedorId: f.id,
      fornecedorNome: f.nome,
      fornecedorMarcadoNovo: false,
    } : prev));
    setFornecedorBusca(f.nome);
  }

  function escolherFornecedorExcel(nome: string) {
    setRascunho((prev) => (prev ? {
      ...prev,
      fornecedorId: null,
      fornecedorNome: nome,
      fornecedorMarcadoNovo: false,
    } : prev));
    setFornecedorBusca(nome);
  }

  function marcarFornecedorNovo() {
    const nome = fornecedorBusca.trim();
    if (!nome) return;
    setRascunho((prev) => (prev ? {
      ...prev,
      fornecedorId: null,
      fornecedorNome: nome,
      fornecedorMarcadoNovo: true,
    } : prev));
  }

  function escolherSubcentro(s: CatalogoCliente['subcentros'][number]) {
    setRascunho((prev) => (prev ? {
      ...prev,
      subcentro: s.subcentro,
      macro_custo: s.macro_custo,
      grupo_custo: s.grupo_custo,
      centro_custo: s.centro_custo,
    } : prev));
    setSubcentroBusca(s.subcentro);
  }

  // Grupos do Command de fornecedor (3 grupos)
  const mostrarGrupoExcel = !!fornecedorExcelOriginal
    && !fornecedoresFiltrados.some(
      (f) => f.nome.toLowerCase() === fornecedorExcelOriginal.toLowerCase(),
    );

  const mostrarGrupoNovo = fornecedorBusca.trim().length >= 2
    && !fornecedoresFiltrados.some(
      (f) => f.nome.toLowerCase() === fornecedorBusca.trim().toLowerCase(),
    )
    && fornecedorBusca.trim().toLowerCase() !== (fornecedorExcelOriginal ?? '').toLowerCase();

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300 pb-1">
        ✎ Corrigir
      </div>

      {/* Conta — PR-H2: ContaBancariaSelect compartilhado. */}
      <div className="space-y-0.5">
        <label className="text-[10px] text-muted-foreground">Conta</label>
        <ContaBancariaSelect
          value={rascunho.contaId ?? ''}
          onValueChange={(v) => {
            const c = catalogo.contas.find((x) => x.id === v);
            set('contaId', v || null);
            set('contaRotulo', c ? (c.nome_exibicao ?? c.nome_conta) : null);
          }}
          contas={catalogo.contas}
          placeholder="—"
          className="h-7 text-[11px]"
        />
      </div>

      {/* Fazenda */}
      <div className="space-y-0.5">
        <label className="text-[10px] text-muted-foreground">Fazenda</label>
        <Select
          value={rascunho.fazendaId ?? ''}
          onValueChange={(v) => {
            const f = catalogo.fazendas.find((x) => x.id === v);
            set('fazendaId', v || null);
            set('fazendaNome', f?.nome ?? null);
          }}
        >
          <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {catalogo.fazendas.map((f) => (
              <SelectItem key={f.id} value={f.id} className="text-[11px]">
                {f.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Fornecedor híbrido (Command shadcn com 3 grupos) */}
      <div className="space-y-0.5">
        <label className="text-[10px] text-muted-foreground">Fornecedor</label>
        <Command className="border rounded" shouldFilter={false}>
          <CommandInput
            value={fornecedorBusca}
            onValueChange={(v) => {
              setFornecedorBusca(v);
              if (rascunho.fornecedorNome !== v) {
                set('fornecedorId', null);
                set('fornecedorMarcadoNovo', false);
                set('fornecedorNome', v || null);
              }
            }}
            placeholder="Buscar fornecedor…"
            className="text-[11px] h-7"
          />
          <CommandList className="max-h-40">
            <CommandEmpty className="py-2 text-[10px] text-center text-muted-foreground">
              Digite ao menos 2 caracteres
            </CommandEmpty>
            {mostrarGrupoExcel && fornecedorExcelOriginal && (
              <CommandGroup heading="Do Excel">
                <CommandItem
                  value={`excel|${fornecedorExcelOriginal}`}
                  onSelect={() => escolherFornecedorExcel(fornecedorExcelOriginal)}
                  className="text-[11px]"
                >
                  <span className="text-blue-700 mr-2">📄</span>
                  <span className="flex-1 truncate">{fornecedorExcelOriginal}</span>
                </CommandItem>
              </CommandGroup>
            )}
            {fornecedoresFiltrados.length > 0 && (
              <CommandGroup heading="Catálogo oficial">
                {fornecedoresFiltrados.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={f.nome}
                    onSelect={() => escolherFornecedor(f)}
                    className="text-[11px]"
                  >
                    <span className="text-emerald-700 mr-2">✓</span>
                    <span className="flex-1 truncate">{f.nome}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {mostrarGrupoNovo && (
              <CommandGroup heading="Novo fornecedor">
                <CommandItem
                  value={`novo|${fornecedorBusca}`}
                  onSelect={marcarFornecedorNovo}
                  className="text-[11px]"
                >
                  <span className="text-amber-700 mr-2">+</span>
                  <span className="flex-1 truncate">
                    Marcar como novo: "{fornecedorBusca.trim()}"
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>

        {rascunho.fornecedorId && (
          <div className="text-[10px] text-emerald-700">✓ vinculado a fornecedor oficial</div>
        )}
        {rascunho.fornecedorMarcadoNovo && (
          <div className="text-[10px] text-amber-700">
            ⚑ marcado como novo (criar no banco vira PR6+)
          </div>
        )}
        {!rascunho.fornecedorId && !rascunho.fornecedorMarcadoNovo && rascunho.fornecedorNome && (
          <div className="text-[10px] text-muted-foreground">texto livre (não vinculado)</div>
        )}
      </div>

      {/* Subcentro (Command shadcn) */}
      <div className="space-y-0.5">
        <label className="text-[10px] text-muted-foreground">Subcentro</label>
        <Command className="border rounded" shouldFilter={false}>
          <CommandInput
            value={subcentroBusca}
            onValueChange={setSubcentroBusca}
            placeholder="Buscar subcentro… (↑↓ Enter)"
            className="text-[11px] h-7"
          />
          <CommandList className="max-h-44">
            <CommandEmpty className="py-2 text-[10px] text-center text-muted-foreground">
              Nenhum subcentro encontrado
            </CommandEmpty>

            {/* PR4.2 — primário: natureza casa com linha.sinal */}
            {subcentrosParticionados.primarios.length > 0 && (
              <CommandGroup heading={
                naturezaAlvo
                  ? `Da natureza ${labelNatureza(naturezaAlvo)}`
                  : 'Subcentros'
              }>
                {subcentrosParticionados.primarios.map((s) => {
                  const qt = !naturezaAlvo
                    ? s.qt_uso
                    : naturezaAlvo === 'entrada' ? s.qt_uso_entrada
                    : naturezaAlvo === 'saida' ? s.qt_uso_saida
                    : s.qt_uso_transferencia;
                  return (
                    <CommandItem
                      key={`prim|${s.subcentro}|${s.macro_custo ?? ''}|${s.grupo_custo ?? ''}|${s.centro_custo ?? ''}`}
                      value={s.subcentro}
                      onSelect={() => escolherSubcentro(s)}
                      className="text-[11px]"
                    >
                      <span className="flex-1 truncate">{s.subcentro}</span>
                      {s.origem === 'historico' && (
                        <span
                          className="text-[9px] text-amber-700 mr-2"
                          title="Subcentro legado — não está no plano oficial atual"
                        >
                          ⚠ legado
                        </span>
                      )}
                      <span className="text-[9px] text-muted-foreground ml-2">({qt}x)</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {/* PR4.2 — secundário: outras naturezas, fallback discreto */}
            {subcentrosParticionados.secundarios.length > 0 && (
              <CommandGroup heading="Outras naturezas (não recomendado)">
                {subcentrosParticionados.secundarios.map((s) => {
                  const naturezasLabel = Array.from(s.naturezas)
                    .map((n) => labelNatureza(n))
                    .join('/');
                  return (
                    <CommandItem
                      key={`sec|${s.subcentro}|${s.macro_custo ?? ''}|${s.grupo_custo ?? ''}|${s.centro_custo ?? ''}`}
                      value={`outras-${s.subcentro}`}
                      onSelect={() => escolherSubcentro(s)}
                      className="text-[11px] opacity-60"
                    >
                      <span className="text-amber-700 mr-1">⚠</span>
                      <span className="flex-1 truncate text-muted-foreground">{s.subcentro}</span>
                      {s.origem === 'historico' && (
                        <span className="text-[9px] text-amber-700 mr-2">legado</span>
                      )}
                      <span className="text-[9px] text-muted-foreground ml-2">
                        ({naturezasLabel || 's/ natureza'})
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        {rascunho.subcentro && (
          <div className="text-[10px] text-muted-foreground">
            {rascunho.macro_custo ?? '—'} / {rascunho.grupo_custo ?? '—'} / {rascunho.centro_custo ?? '—'}
          </div>
        )}
      </div>

      {/* PR4.1 — Produto (Excel) editável, separado de Observação operador */}
      <div className="space-y-0.5">
        <label className="text-[10px] text-muted-foreground">Produto</label>
        <Input
          value={rascunho.produto ?? ''}
          onChange={(e) => set('produto', e.target.value || null)}
          placeholder="ex: sal mineral, diesel, ureia, parcela trator…"
          className="h-7 text-[11px]"
        />
      </div>

      {/* PR6.2-M0.6 — Data pagamento (read-only, NÃO editável pelo operador).
          Chain: OFX banco real → Data_Ref do Excel → Data_Competencia (último recurso). */}
      <div className="space-y-0.5">
        <label className="text-[10px] text-muted-foreground">Pgto. (banco/Excel)</label>
        {(() => {
          const pgto =
            ofxAtivo?.data_movimento
            ?? linhaAtiva?.dataPagamento
            ?? linhaAtiva?.dataCompetencia
            ?? null;
          return (
            <div className={cn(
              'h-7 px-2 flex items-center text-[11px] tabular-nums rounded-sm border bg-muted/30',
              !pgto && 'text-rose-600 border-rose-200',
            )}>
              {pgto
                ? format(new Date(pgto + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                : 'não definida'}
            </div>
          );
        })()}
      </div>

      {/* Data competência (editável pelo operador) */}
      <div className="space-y-0.5">
        <label className="text-[10px] text-muted-foreground">Data competência</label>
        <Input
          type="date"
          value={rascunho.dataCompetencia ?? ''}
          onChange={(e) => set('dataCompetencia', e.target.value || null)}
          className="h-7 text-[11px]"
        />
      </div>

      {/* Observação operador */}
      <div className="space-y-0.5">
        <label className="text-[10px] text-muted-foreground">Observação operador (opcional)</label>
        <Input
          value={rascunho.descricao ?? ''}
          onChange={(e) => set('descricao', e.target.value || null)}
          placeholder='ex: "parcela 3/10", "ajuste cliente", "sem NF"…'
          className="h-7 text-[11px]"
        />
      </div>

      {/* Ações: primário Aplicar+Aprovar, secundário Só aplicar, ghost Cancelar */}
      <div className="flex items-center gap-1 pt-2 border-t">
        <Button size="sm" variant="default" className="flex-1 h-7 text-[11px]"
                onClick={onAplicarEAprovar}>
          <Check className="h-3 w-3 mr-1" />
          Aplicar + Aprovar
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px]"
                onClick={onAplicar}>
          Só aplicar
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
