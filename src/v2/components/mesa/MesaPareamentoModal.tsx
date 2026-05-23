import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { Check, X, ArrowLeftRight, ArrowRight, Undo2, AlertTriangle, Search, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCatalogoCliente,
  type CatalogoCliente,
  type SubcentroUsado,
  type NaturezaSubcentro,
} from '@/v2/lib/excelPreview/catalogoCliente';
import { sugerirTodasLinhas, type Sugestao } from '@/v2/lib/excelPreview/sugestaoEngine';
import type { LoteExcel, MatchResult, ExcelLinhaNormalizada } from '@/v2/lib/excelPreview/types';

type DecisaoStatus = 'pendente' | 'aprovado' | 'rejeitado' | 'excel_orfao';

// PR4 — overrides do operador sobre os campos sugeridos pela IA.
// Vive dentro do ParEstado; quando null, aprovação usa sugestão pura.
interface ParCorrecao {
  contaId: string | null;
  contaRotulo: string | null;
  fazendaId: string | null;
  fazendaNome: string | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  fornecedorMarcadoNovo: boolean;  // PR4.1 — marca pra criar no PR6+
  dataCompetencia: string | null;
  subcentro: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  produto: string | null;          // PR4.1 — separado de descricao
  descricao: string | null;        // PR4.1 — "observação operador"
  corrigidoEm: string;
}

interface ParEstado {
  excelKey: string;
  ofxIdAtivo: string | null;
  ofxIdSugeridoOriginal: string | null;
  decisao: DecisaoStatus;
  correcao: ParCorrecao | null;  // PR4
}

interface OfxItem {
  id: string;
  data_movimento: string;
  descricao: string;
  valor: number;
}

// PR4 — fotografia consolidada (correcao ?? sugestao) na aprovação.
// Schema renomeado vs PR3.1 para ser agnóstico de origem.
interface AprovacaoLocal {
  aprovadoEm: string;
  origem_aprovacao: 'sugestao_direta' | 'corrigido';
  contaId: string | null;
  contaRotulo: string | null;
  fazendaId: string | null;
  fazendaNome: string | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  fornecedorMarcadoNovo: boolean;  // PR4.1
  dataCompetencia: string | null;
  subcentro: string;
  macro: string | null;
  grupo: string | null;
  centro: string | null;
  produto: string | null;          // PR4.1
  descricao: string | null;
  ofxIdVinculado: string | null;
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
    // PR4.1 — chain de data competência
    dataCompetencia:
      cor?.dataCompetencia
      ?? fallbacks.dataCompetenciaExcel
      ?? fallbacks.dataPagamentoExcel
      ?? fallbacks.dataMovimentoOfx
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
  const linha = linhasExcel.find((l) => `${l.loteId}:${l.indiceLinha}` === excelKey);
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

type FiltroMostrar = 'todos' | 'forte' | 'fraco' | 'sem_match'
                   | 'pendentes' | 'aprovados' | 'rejeitados' | 'orfaos'
                   | 'banco_orfao' | 'corrigidos';
type FiltroOrdem = 'score_desc' | 'valor_desc' | 'valor_asc' | 'data_asc' | 'data_desc' | 'original';
type FiltroEscopo = 'todos' | 'desta_conta' | 'outras_contas' | 'sem_inferencia' | 'sem_ofx';

interface ParEscopo {
  isDestaConta: boolean;
  isDivergente: boolean;
  isContaIndefinida: boolean;
  tagBanco: string | null;
  rotuloConta: string | null;
}

// PR3.3 — Modo OFX (visão bancária)
type ModoVisualizacao = 'excel' | 'ofx';
type OfxValidacaoStatus = 'pendente' | 'ofx_orfao_validado';
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
}: Props) {
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
      const key = `${l.loteId}:${l.indiceLinha}`;
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
  // Lazy init: roda só na primeira render do modal.
  const [pares, setPares] = useState<Map<string, ParEstado>>(() => {
    const m = new Map<string, ParEstado>();
    linhasExcel.forEach((l) => {
      const key = `${l.loteId}:${l.indiceLinha}`;
      const mt = matches.get(key);
      m.set(key, {
        excelKey: key,
        ofxIdAtivo: mt?.ofxIdMatched ?? null,
        ofxIdSugeridoOriginal: mt?.ofxIdMatched ?? null,
        decisao: 'pendente',
        correcao: null,
      });
    });
    return m;
  });

  const [parAtivoKey, setParAtivoKey] = useState<string | null>(null);
  const [filtroMostrar, setFiltroMostrar] = useState<FiltroMostrar>('todos');
  const [filtroEscopo, setFiltroEscopo] = useState<FiltroEscopo>('todos');
  const [filtroOrdem, setFiltroOrdem] = useState<FiltroOrdem>('score_desc');

  // PR3.3 — Modo OFX (lente bancária)
  const [modoVisualizacao, setModoVisualizacao] = useState<ModoVisualizacao>('excel');
  const [ofxValidacoes, setOfxValidacoes] = useState<Map<string, OfxValidacaoStatus>>(
    new Map<string, OfxValidacaoStatus>(),
  );
  const [filtroOfxMostrar, setFiltroOfxMostrar] = useState<FiltroMostrarOfx>('todos');
  const [filtroOfxOrdem, setFiltroOfxOrdem] = useState<FiltroOrdemOfx>('original');
  const [ofxAtivoId, setOfxAtivoId] = useState<string | null>(null);

  // PR4 — Modo Corrigir: fotografia consolidada + draft de correção em memória
  const [aprovacoes, setAprovacoes] = useState<Map<string, AprovacaoLocal>>(
    new Map<string, AprovacaoLocal>(),
  );
  const [corrigindoExcelKey, setCorrigindoExcelKey] = useState<string | null>(null);
  const [rascunhoCorrecao, setRascunhoCorrecao] = useState<ParCorrecao | null>(null);
  const [fornecedorBusca, setFornecedorBusca] = useState<string>('');
  const [subcentroBusca, setSubcentroBusca] = useState<string>('');

  // ---------- ações de decisão ----------

  function aprovarPar(key: string) {
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
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, decisao: 'rejeitado' });
      return next;
    });
  }
  function marcarExcelOrfao(key: string) {
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, decisao: 'excel_orfao', ofxIdAtivo: null });
      return next;
    });
  }
  function desfazer(key: string) {
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, decisao: 'pendente' });
      return next;
    });
  }
  function trocarOfx(key: string, novoOfxId: string) {
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

  // Lista filtrada e ordenada
  const linhasFiltradas = useMemo<ExcelLinhaNormalizada[]>(() => {
    let arr = linhasExcel.slice();

    // PR3.2 — Filtro 1: ESCOPO (verde/roxo/cinza/sem OFX)
    arr = arr.filter((l) => {
      const key = `${l.loteId}:${l.indiceLinha}`;
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
      const key = `${l.loteId}:${l.indiceLinha}`;
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
        const sa = matches.get(`${a.loteId}:${a.indiceLinha}`)?.score ?? 0;
        const sb = matches.get(`${b.loteId}:${b.indiceLinha}`)?.score ?? 0;
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
  }, [linhasExcel, matches, pares, filtroMostrar, filtroEscopo, filtroOrdem, escopoPorPar, ofxConsumidos]);

  // Linha Excel ativa
  const linhaAtiva = useMemo<ExcelLinhaNormalizada | null>(() => {
    if (!parAtivoKey) return null;
    return linhasExcel.find((l) => `${l.loteId}:${l.indiceLinha}` === parAtivoKey) ?? null;
  }, [parAtivoKey, linhasExcel]);

  const parAtivo = parAtivoKey ? pares.get(parAtivoKey) ?? null : null;
  const matchAtivo = parAtivoKey ? matches.get(parAtivoKey) ?? null : null;
  const sugAtiva = parAtivoKey ? sugestoes.get(parAtivoKey) ?? null : null;
  const ofxAtivo = parAtivo?.ofxIdAtivo
    ? extratos.find((e) => e.id === parAtivo.ofxIdAtivo) ?? null
    : null;

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
      const key = `${l.loteId}:${l.indiceLinha}`;
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
    setOfxValidacoes((prev) => {
      const next = new Map<string, OfxValidacaoStatus>(prev);
      next.set(ofxId, 'ofx_orfao_validado');
      return next;
    });
  }
  function desfazerOfxOrfaoValidado(ofxId: string) {
    setOfxValidacoes((prev) => {
      const next = new Map<string, OfxValidacaoStatus>(prev);
      next.delete(ofxId);
      return next;
    });
  }
  // Aprovar via candidato Excel: ajusta ofxIdAtivo e decisao do par
  // numa única passagem de setPares (sem race). PR4: também produz
  // fotografia consolidada na Map de aprovações.
  function aprovarOfxComExcel(ofxId: string, excelKey: string) {
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
    const sug = sugestoes.get(excelKey);
    const parAtual = pares.get(excelKey);
    const linha = linhasExcel.find((l) => `${l.loteId}:${l.indiceLinha}` === excelKey);
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
      (l) => `${l.loteId}:${l.indiceLinha}` === corrigindoExcelKey,
    );
    if (!linha) return null;
    if (linha.sinal === 'entrada') return 'entrada';
    if (linha.sinal === 'saida') return 'saida';
    return null;
  }, [corrigindoExcelKey, linhasExcel]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[1800px] h-[92vh] max-h-[92vh] p-0 flex flex-col">
        <DialogHeader className="p-3 border-b shrink-0">
          <DialogTitle className="text-base flex items-center justify-between gap-3 flex-wrap">
            <span>Mesa de Pareamento — {contaNome} · {anoMes}</span>
            <div className="flex items-center gap-3 text-xs font-normal flex-wrap">
              <span className="text-muted-foreground">OFX entr./saí.: {saldoOfxResumo}</span>
              <span className="text-rose-700 font-medium">Não explicado: {naoExplicado}</span>
              {modoVisualizacao === 'excel' ? (
                <>
                  <span className="text-emerald-700">✓ {contadores.aprovados} aprov.</span>
                  <span className="text-rose-700">✗ {contadores.rejeitados} rej.</span>
                  <span className="text-amber-700">→ {contadores.orfaos} excel órf.</span>
                  <span className="text-muted-foreground">— {contadores.pendentes} pend.</span>
                  <span className="text-blue-700">✎ {totalCorrigidos} corrig.</span>
                  <span className="text-muted-foreground">| banco órf.: {contadores.bancoOrfao}</span>
                </>
              ) : (
                <>
                  <span className="text-emerald-700">✓ {contadoresOfx.aprovados} aprov.</span>
                  <span className="text-muted-foreground">— {contadoresOfx.pendentes} pend.</span>
                  <span className="text-amber-700">⊘ {contadoresOfx.orfaoValidado} órfão validado</span>
                  <span className="text-muted-foreground">| sem sugestão: {contadoresOfx.semSugestao}</span>
                </>
              )}
            </div>
          </DialogTitle>
          {/* PR3.3 — Toggle Modo Excel / Modo OFX */}
          <div className="flex items-center gap-1 pt-1">
            <Button
              variant={modoVisualizacao === 'excel' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setModoVisualizacao('excel')}
              className="text-xs h-7"
            >
              Modo Excel
            </Button>
            <Button
              variant={modoVisualizacao === 'ofx' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setModoVisualizacao('ofx')}
              className="text-xs h-7"
            >
              Modo OFX
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs pt-2 flex-wrap">
            {modoVisualizacao === 'excel' ? (
              <>
                <span className="text-muted-foreground">Mostrar:</span>
                <Select value={filtroMostrar} onValueChange={(v) => setFiltroMostrar(v as FiltroMostrar)}>
                  <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue /></SelectTrigger>
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
                <span className="text-muted-foreground ml-2">Escopo:</span>
                <Select value={filtroEscopo} onValueChange={(v) => setFiltroEscopo(v as FiltroEscopo)}>
                  <SelectTrigger className="h-7 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="desta_conta">Excel desta conta</SelectItem>
                    <SelectItem value="outras_contas">Excel outras contas (divergência)</SelectItem>
                    <SelectItem value="sem_inferencia">Sem inferência de conta</SelectItem>
                    <SelectItem value="sem_ofx">Sem OFX vinculado</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground ml-2">Ordenar:</span>
                <Select value={filtroOrdem} onValueChange={(v) => setFiltroOrdem(v as FiltroOrdem)}>
                  <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
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
                <span className="text-muted-foreground">Mostrar:</span>
                <Select value={filtroOfxMostrar} onValueChange={(v) => setFiltroOfxMostrar(v as FiltroMostrarOfx)}>
                  <SelectTrigger className="h-7 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos ({extratos.length})</SelectItem>
                    <SelectItem value="pendentes">Pendentes</SelectItem>
                    <SelectItem value="com_sugestao">Com sugestão</SelectItem>
                    <SelectItem value="sem_sugestao">Sem sugestão</SelectItem>
                    <SelectItem value="aprovados">Aprovados</SelectItem>
                    <SelectItem value="ofx_orfao_validado">OFX órfão validado</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground ml-2">Ordenar:</span>
                <Select value={filtroOfxOrdem} onValueChange={(v) => setFiltroOfxOrdem(v as FiltroOrdemOfx)}>
                  <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
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
              <span className="text-muted-foreground ml-2">Carregando catálogo…</span>
            )}
            {catalogoErro && (
              <span className="text-rose-600 ml-2">Erro carregando catálogo</span>
            )}
            {catalogo && (
              <span className="text-muted-foreground ml-2">
                Catálogo: {catalogo.contas.length} contas · {catalogo.fazendas.length} fazendas ·
                {' '}{catalogo.subcentros.length} subc · {catalogo.fornecedores.length} fornec.
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-[1.15fr_1.35fr_1fr] gap-2 p-2">

          {modoVisualizacao === 'excel' && <>

          {/* COL 1 — LISTA DE PARES */}
          <Card className="p-2 flex flex-col overflow-hidden">
            <div className="text-[10px] font-bold uppercase text-muted-foreground px-1 pb-1 shrink-0">
              Pares ({linhasFiltradas.length} de {linhasExcel.length})
            </div>
            <div className="flex-1 overflow-y-auto space-y-0.5">
              {linhasFiltradas.map((linha) => {
                const key = `${linha.loteId}:${linha.indiceLinha}`;
                const p = pares.get(key);
                const m = matches.get(key);
                const esc = escopoPorPar.get(key);
                const faixa = m?.faixa ?? 'nenhum';
                const data = linha.dataPagamento ?? linha.dataCompetencia;
                const valorSinalizado = (linha.sinal === 'entrada' ? 1 : -1) * (linha.valorCentavos / 100);
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

                return (
                  <button
                    key={key}
                    onClick={() => setParAtivoKey(key)}
                    title={esc?.rotuloConta ? `Conta sugerida: ${esc.rotuloConta}` : undefined}
                    className={cn(
                      'w-full flex items-center gap-1 px-2 py-1 text-[11px] leading-tight border-l-[3px] rounded-r text-left tabular-nums',
                      corBorda,
                      ativo && 'ring-2 ring-primary ring-inset bg-muted',
                    )}
                  >
                    <span className="shrink-0 w-3 text-center text-muted-foreground">{iconeDecisao}</span>
                    {p?.correcao && <span className="shrink-0 text-[9px] text-blue-700" title="Par corrigido">✎</span>}
                    <span className="text-[10px] text-muted-foreground tabular-nums w-10 shrink-0">
                      {data ? format(new Date(data + 'T12:00:00'), 'dd/MM', { locale: ptBR }) : '—'}
                    </span>
                    <span className={cn(
                      'shrink-0 text-[9px] font-semibold px-1 py-[1px] rounded leading-none',
                      corTag,
                    )}>
                      {esc?.tagBanco ?? '?'}
                    </span>
                    <span className="flex-1 truncate font-normal">
                      {linha.fornecedor || <span className="italic text-muted-foreground">{linha.subcentro}</span>}
                    </span>
                    <span className={cn('tabular-nums shrink-0 font-medium',
                      linha.sinal === 'entrada' ? 'text-emerald-600' : 'text-rose-600',
                    )}>{fmtBRL(valorSinalizado)}</span>
                    <Badge
                      variant={faixa === 'forte' ? 'default' :
                               faixa === 'fraco' ? 'secondary' : 'destructive'}
                      className="text-[9px] h-3.5 px-1 shrink-0 leading-none"
                    >{m?.score ?? 0}</Badge>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* COL 2 — DETALHE DO PAR ATIVO */}
          <Card className="p-3 flex flex-col overflow-hidden">
            <div className="text-[10px] font-bold uppercase text-muted-foreground pb-2 shrink-0">
              Detalhe do par
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {!parAtivo || !linhaAtiva ? (
                <div className="text-center text-muted-foreground italic py-12">
                  Selecione um par na lista à esquerda
                </div>
              ) : (
                <>
                  {/* PR3.2 — faixa roxa de divergência de conta */}
                  {parAtivoKey && escopoPorPar.get(parAtivoKey)?.isDivergente && (
                    <div className="text-[10px] font-semibold px-2 py-1 rounded bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300">
                      ⚠ Divergência de conta — Excel classificado em "{escopoPorPar.get(parAtivoKey)?.rotuloConta}", visualizando "{contaNome}"
                    </div>
                  )}

                  {/* OFX vinculado */}
                  <div className="border rounded p-2.5 space-y-1 bg-muted/30">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">
                      OFX vinculado
                    </div>
                    {!ofxAtivo ? (
                      <div className="text-xs italic text-muted-foreground">Nenhum OFX vinculado</div>
                    ) : (
                      <>
                        <div className="text-xs flex items-center gap-3">
                          <span className="tabular-nums text-muted-foreground">
                            {format(new Date(ofxAtivo.data_movimento + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                          </span>
                          <span className={cn('tabular-nums font-bold',
                            ofxAtivo.valor >= 0 ? 'text-emerald-600' : 'text-rose-600',
                          )}>{fmtBRL(ofxAtivo.valor)}</span>
                        </div>
                        <div className="text-xs">{ofxAtivo.descricao}</div>
                      </>
                    )}
                  </div>

                  {/* Excel */}
                  <div className="border rounded p-2.5 space-y-1">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">
                      Excel
                    </div>
                    <div className="text-xs flex items-center gap-3">
                      <span className="tabular-nums text-muted-foreground">
                        {linhaAtiva.dataPagamento
                          ? format(new Date(linhaAtiva.dataPagamento + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                          : (linhaAtiva.dataCompetencia
                              ? `comp. ${format(new Date(linhaAtiva.dataCompetencia + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}`
                              : '—')}
                      </span>
                      <span className={cn('tabular-nums font-bold',
                        linhaAtiva.sinal === 'entrada' ? 'text-emerald-600' : 'text-rose-600',
                      )}>{fmtBRL((linhaAtiva.sinal === 'entrada' ? 1 : -1) * (linhaAtiva.valorCentavos / 100))}</span>
                    </div>
                    <div className="text-xs"><strong>Forn.:</strong> {linhaAtiva.fornecedor || '—'}</div>
                    <div className="text-xs"><strong>Conta:</strong> {linhaAtiva.contaTexto || '—'}</div>
                    <div className="text-xs"><strong>Fazenda:</strong> {linhaAtiva.fazendaTexto || '—'}</div>
                    <div className="text-xs"><strong>Subc.:</strong> {linhaAtiva.subcentro || '—'}</div>
                    {/* PR4.1 — Produto/Doc/Histórico Excel como blocos read-only */}
                    {linhaAtiva.produto && (
                      <div className="text-xs"><strong>Produto (Excel):</strong> {linhaAtiva.produto}</div>
                    )}
                    {linhaAtiva.documento && (
                      <div className="text-xs"><strong>Doc (Excel):</strong> {linhaAtiva.documento}</div>
                    )}
                    {linhaAtiva.observacao && (
                      <div className="text-xs"><strong>Histórico Excel:</strong>{' '}
                        <span className="italic">{linhaAtiva.observacao}</span>
                      </div>
                    )}
                  </div>

                  {/* Alertas */}
                  {(alertasExtras.length > 0 || (sugAtiva && sugAtiva.alertas.length > 0)) && (
                    <div className="border border-amber-300 rounded p-2 space-y-1 bg-amber-50/30 dark:bg-amber-950/10">
                      <div className="text-[10px] font-bold uppercase text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Alertas
                      </div>
                      {alertasExtras.map((a, i) => (
                        <div key={`ae-${i}`} className="text-[11px] text-amber-800">⚠ {a}</div>
                      ))}
                      {sugAtiva?.alertas.map((a, i) => (
                        <div key={`as-${i}`} className="text-[11px] text-amber-800">⚠ {a}</div>
                      ))}
                    </div>
                  )}

                  {/* Score */}
                  {matchAtivo && matchAtivo.faixa !== 'nenhum' && (
                    <div className="text-[10px] text-muted-foreground border-t pt-2">
                      Score: <strong>{matchAtivo.score}</strong> ({matchAtivo.faixa})
                      {matchAtivo.detalheScore.diasDistancia != null && (
                        <span> · {Math.abs(matchAtivo.detalheScore.diasDistancia)} dia(s) de distância</span>
                      )}
                      <span> · similaridade nome {(matchAtivo.detalheScore.similaridadeNome * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* COL 3 — SUGESTÃO/CORRIGIDO + DECISÃO (PR4: switch para FormularioCorrecao) */}
          <Card className="p-3 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-3">
              {!parAtivo || !sugAtiva ? (
                <>
                  <div className="text-[10px] font-bold uppercase text-muted-foreground pb-2">
                    IA sugere + Decisão
                  </div>
                  <div className="text-center text-muted-foreground italic py-12">
                    Selecione um par para ver a sugestão e decidir
                  </div>
                </>
              ) : corrigindoExcelKey === parAtivoKey && rascunhoCorrecao && catalogo ? (
                // PR4 — modo edição: formulário inline substitui card + botões
                <FormularioCorrecao
                  rascunho={rascunhoCorrecao}
                  setRascunho={setRascunhoCorrecao}
                  catalogo={catalogo}
                  fornecedorBusca={fornecedorBusca}
                  setFornecedorBusca={setFornecedorBusca}
                  subcentroBusca={subcentroBusca}
                  setSubcentroBusca={setSubcentroBusca}
                  fornecedorExcelOriginal={linhaAtiva?.fornecedor || null}
                  naturezaAlvo={naturezaAlvoCorrecao}
                  onAplicar={aplicarCorrecao}
                  onAplicarEAprovar={aplicarEAprovar}
                  onCancelar={cancelarCorrecao}
                />
              ) : (
                <>
                  {/* Header: IA sugere | ✎ Corrigido (com Limpar correção) */}
                  {parAtivo.correcao ? (
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">
                        ✎ Corrigido
                      </span>
                      <Button size="sm" variant="ghost" className="h-5 text-[10px]"
                              onClick={() => parAtivoKey && limparCorrecao(parAtivoKey)}>
                        Limpar correção
                      </Button>
                    </div>
                  ) : (
                    <div className="text-[10px] font-bold uppercase text-muted-foreground pb-1">
                      IA sugere
                    </div>
                  )}

                  {/* Valores: correção (se houver) prevalece sobre sugestão field-a-field */}
                  {(() => {
                    const cor = parAtivo.correcao;
                    const exibir = {
                      conta: cor?.contaRotulo ?? sugAtiva.contaSugerida?.rotulo ?? null,
                      fazenda: cor?.fazendaNome ?? sugAtiva.fazendaSugerida?.nome ?? null,
                      subc: cor?.subcentro ?? sugAtiva.subcentroSugerido?.subcentro ?? null,
                      macro: cor?.macro_custo ?? sugAtiva.subcentroSugerido?.macro_custo ?? null,
                      grupo: cor?.grupo_custo ?? sugAtiva.subcentroSugerido?.grupo_custo ?? null,
                      centro: cor?.centro_custo ?? sugAtiva.subcentroSugerido?.centro_custo ?? null,
                      forn: cor?.fornecedorNome ?? sugAtiva.fornecedorOficial?.nome ?? null,
                      fornecedorMarcadoNovo: cor?.fornecedorMarcadoNovo ?? false,
                      // PR4.1 — produto vem da correção ou do Excel original
                      produto: cor?.produto ?? linhaAtiva?.produto ?? null,
                      dataComp: cor?.dataCompetencia ?? null,
                      desc: cor?.descricao ?? null,
                    };
                    // Quando corrigido, confiança não se aplica (operador validou).
                    const confConta = cor ? undefined : sugAtiva.contaSugerida?.confianca;
                    const confFaz = cor ? undefined : sugAtiva.fazendaSugerida?.confianca;
                    const confSub = cor ? undefined : sugAtiva.subcentroSugerido?.confianca;
                    const confFor = cor ? undefined : sugAtiva.fornecedorOficial?.confianca;
                    return (
                      <div className="space-y-1 text-[11px]">
                        <SugLinha label="Conta" valor={exibir.conta} conf={confConta} />
                        <SugLinha label="Fazenda" valor={exibir.fazenda} conf={confFaz} />
                        <SugLinha label="Subc." valor={exibir.subc} conf={confSub} />
                        {exibir.subc && (
                          <div className="text-[10px] text-muted-foreground pl-14">
                            {exibir.macro ?? '—'} / {exibir.grupo ?? '—'} / {exibir.centro ?? '—'}
                          </div>
                        )}
                        <SugLinha label="Forn." valor={exibir.forn} conf={confFor} />
                        {exibir.fornecedorMarcadoNovo && (
                          <div className="text-[10px] text-amber-700 pl-14">
                            ⚑ marcado como novo (criar no PR6+)
                          </div>
                        )}
                        {exibir.produto && (
                          <div className="text-[11px]">
                            <span className="text-muted-foreground">Produto:</span>{' '}
                            {exibir.produto}
                          </div>
                        )}
                        {exibir.dataComp && (
                          <div className="text-[11px]">
                            <span className="text-muted-foreground">Data comp.:</span>{' '}
                            {exibir.dataComp}
                          </div>
                        )}
                        {exibir.desc && (
                          <div className="text-[11px]">
                            <span className="text-muted-foreground">Obs operador:</span>{' '}
                            <span className="italic">{exibir.desc}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Botões de decisão */}
                  <div className="border-t pt-3 space-y-2">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Decisão</div>
                    {parAtivo.decisao === 'pendente' ? (
                      <>
                        <Button size="sm" variant="default" className="w-full justify-start text-xs h-8"
                                onClick={() => parAtivoKey && aprovarPar(parAtivoKey)}
                                disabled={!parAtivo.ofxIdAtivo}>
                          <Check className="h-3.5 w-3.5 mr-2" /> Aprovar par
                        </Button>
                        <Button size="sm" variant="destructive" className="w-full justify-start text-xs h-8"
                                onClick={() => parAtivoKey && rejeitarPar(parAtivoKey)}>
                          <X className="h-3.5 w-3.5 mr-2" /> Rejeitar (sugestão errada)
                        </Button>
                        <PopoverOutroOfx
                          extratos={extratos}
                          ofxConsumidos={ofxConsumidos}
                          ofxAtualId={parAtivo.ofxIdAtivo}
                          onEscolher={(novoId) => parAtivoKey && trocarOfx(parAtivoKey, novoId)}
                        />
                        <Button size="sm" variant="outline" className="w-full justify-start text-xs h-8"
                                onClick={() => parAtivoKey && iniciarCorrecao(parAtivoKey)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Corrigir manualmente
                        </Button>
                        <Button size="sm" variant="outline" className="w-full justify-start text-xs h-8"
                                onClick={() => parAtivoKey && marcarExcelOrfao(parAtivoKey)}>
                          <ArrowRight className="h-3.5 w-3.5 mr-2" /> Marcar Excel órfão
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" className="w-full justify-start text-xs h-8"
                              onClick={() => parAtivoKey && desfazer(parAtivoKey)}>
                        <Undo2 className="h-3.5 w-3.5 mr-2" /> Desfazer ({parAtivo.decisao})
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </Card>

          </>}

          {modoVisualizacao === 'ofx' && <>

          {/* COL 1 — LISTA DE OFX */}
          <Card className="p-2 flex flex-col overflow-hidden">
            <div className="text-[10px] font-bold uppercase text-muted-foreground px-1 pb-1 shrink-0">
              OFX ({ofxFiltrados.length} de {extratos.length})
            </div>
            <div className="flex-1 overflow-y-auto space-y-0.5">
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
                      'w-full flex items-center gap-1 px-2 py-1 text-[11px] leading-tight border-l-[3px] rounded-r text-left tabular-nums',
                      corBorda,
                      ativo && 'ring-2 ring-primary ring-inset bg-muted',
                    )}
                  >
                    <span className="shrink-0 w-3 text-center text-muted-foreground">{icone}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-12 shrink-0">
                      {format(new Date(e.data_movimento + 'T12:00:00'), 'dd/MM', { locale: ptBR })}
                    </span>
                    <span className="flex-1 truncate">{e.descricao}</span>
                    <span className={cn('tabular-nums shrink-0 font-medium',
                      e.valor >= 0 ? 'text-emerald-600' : 'text-rose-600',
                    )}>{fmtBRL(e.valor)}</span>
                    {candidatos.length > 0 ? (
                      <Badge
                        variant={topScore >= 80 ? 'default' : topScore >= 60 ? 'secondary' : 'destructive'}
                        className="text-[9px] h-3.5 px-1 shrink-0 leading-none"
                      >{topScore}</Badge>
                    ) : (
                      <span className="text-[9px] text-muted-foreground shrink-0">—</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* COL 2 — DETALHE DO OFX */}
          <Card className="p-3 flex flex-col overflow-hidden">
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

              return (
                <div className="flex-1 overflow-y-auto space-y-3">
                  <div className="border rounded p-2.5 space-y-1 bg-muted/30">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">OFX</div>
                    <div className="text-xs flex items-center gap-3">
                      <span className="tabular-nums text-muted-foreground">
                        {format(new Date(ofx.data_movimento + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                      <span className={cn('tabular-nums font-bold',
                        ofx.valor >= 0 ? 'text-emerald-600' : 'text-rose-600',
                      )}>{fmtBRL(ofx.valor)}</span>
                    </div>
                    <div className="text-xs">{ofx.descricao}</div>
                    {validacao === 'ofx_orfao_validado' && (
                      <div className="text-[10px] font-semibold px-2 py-1 mt-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        ⊘ OFX órfão validado — operador marcou como sem Excel correspondente
                      </div>
                    )}
                  </div>

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
                          return (
                            <div
                              key={cand.excelKey}
                              className={cn(
                                'flex items-center gap-2 px-2 py-1.5 text-[11px] border rounded',
                                cand.faixa === 'forte' && 'border-blue-300',
                                cand.faixa === 'fraco' && 'border-amber-300',
                                jaAprovadoOutroOfx && 'opacity-50',
                              )}
                            >
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
                              <Button
                                size="sm" variant="outline"
                                className="h-6 text-[10px] shrink-0"
                                disabled={jaAprovadoOutroOfx || validacao === 'ofx_orfao_validado'}
                                onClick={() => aprovarOfxComExcel(ofx.id, cand.excelKey)}
                              >
                                Aprovar
                              </Button>
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
          <Card className="p-3 flex flex-col overflow-hidden">
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
      </DialogContent>
    </Dialog>
  );
}

function SugLinha({ label, valor, conf }: {
  label: string;
  valor: string | null | undefined;
  conf: number | undefined;
}) {
  if (!valor) {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-muted-foreground w-12 shrink-0">{label}:</span>
        <span className="text-muted-foreground italic">—</span>
      </div>
    );
  }
  const pct = conf != null ? Math.round(conf * 100) : null;
  const corPct = pct != null && pct >= 80 ? 'text-emerald-700'
              : pct != null && pct >= 50 ? 'text-amber-700'
              : 'text-rose-700';
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground w-12 shrink-0">{label}:</span>
      <span className="truncate flex-1">{valor}</span>
      {pct != null && <span className={cn('text-[10px] tabular-nums shrink-0', corPct)}>{pct}%</span>}
    </div>
  );
}

function PopoverOutroOfx({ extratos, ofxConsumidos, ofxAtualId, onEscolher }: {
  extratos: OfxItem[];
  ofxConsumidos: Set<string>;
  ofxAtualId: string | null;
  onEscolher: (id: string) => void;
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
        <Button size="sm" variant="outline" className="w-full justify-start text-xs h-8">
          <ArrowLeftRight className="h-3.5 w-3.5 mr-2" /> Outro OFX…
        </Button>
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

      {/* Conta */}
      <div className="space-y-0.5">
        <label className="text-[10px] text-muted-foreground">Conta</label>
        <Select
          value={rascunho.contaId ?? ''}
          onValueChange={(v) => {
            const c = catalogo.contas.find((x) => x.id === v);
            set('contaId', v || null);
            set('contaRotulo', c ? (c.nome_exibicao ?? c.nome_conta) : null);
          }}
        >
          <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {catalogo.contas.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-[11px]">
                {c.nome_exibicao ?? c.nome_conta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      {/* Data competência */}
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
