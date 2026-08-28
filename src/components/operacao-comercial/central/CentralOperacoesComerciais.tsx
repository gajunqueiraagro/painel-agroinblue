import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCliente } from '@/contexts/ClienteContext';
import { useOperacaoComercial } from '@/hooks/useOperacaoComercial';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { MoreVertical, Search, Eye, Filter, Ban, ArrowUp, ArrowDown, Lock, Trash2 } from 'lucide-react';

// Central de Operações Comerciais — PR-OC-CENTRAL-UX-01 (UX/operacional; sem backend novo).
//   Lê em LOTE (ZERO N+1): operações + 3 views soberanas + nomes, filtradas por cliente, mapeadas por
//   operacao_id. Eixos Financeiro/Recebimento/Liquidação vêm das views existentes (nunca somados no React);
//   quando a fonte não classifica um eixo com segurança → "—". Ações de escrita usam SÓ contratos vivos:
//   Abrir (CompraModalShell via onAbrirOperacao), Cancelar (oc_cancelar via useOperacaoComercial),
//   Reabrir recebimento (oc_reabrir_entrega — sem hook arg-based; chamada direta pelo mesmo idioma).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;   // idioma existente do projeto (tabelas/views zoo_* ainda não tipadas)

interface OpRow {
  id: string; versao: number;
  tipo_operacao: string; data_operacao: string;
  contraparte_id: string | null; fazenda_id: string | null;
  status_comercial: string; rascunho: boolean; entrega_encerrada: boolean;
  qtd_negociada: number | null; peso_total_negociado_kg: number | null;
  valor_acordado: number | null; valor_total: number | null;
}
interface FinRow {
  operacao_id: string; modo: string; n_compromissos: number;
  obrigacao_total: number; total_programado: number; total_materializado: number; total_liquidado: number;
  tem_compromissos: boolean; tem_partes_legadas: boolean;
}
interface LiqRow { operacao_id: string; estado_liquidacao: string | null; }
/* Fazenda na coluna e' o CODIGO (SM, ST, PUR...): o nome inteiro empurra a tabela
   para o scroll horizontal e nao acrescenta nada a quem opera. Nome completo no
   title. `codigo` NULL cai no nome — celula vazia nunca. */
interface FazendaRef { nome: string; codigo: string | null; }
interface RecLoteRow { operacao_id: string; estado_recebimento: string; }

const TIPO_LABEL: Record<string, string> = { compra: 'Compra', venda: 'Venda em Pé', abate: 'Abate' };
const PAGE_SIZE = 25;
const fmtData = (iso: string): string => (iso ? iso.split('-').reverse().join('/') : '—');
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const kg = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

const TH = 'px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-primary-foreground whitespace-nowrap';
const TD = 'px-1.5 py-1 text-[10px] align-middle';

/* Rollup soberano do recebimento a partir do estado por lote (nunca soma quantidades).
   A coluna responde UMA pergunta: os animais chegaram?

   ⚠ `entregaEncerrada` SAIU daqui. Ele retornava 'Encerrado' antes de olhar os
   lotes e, com isso, ESCONDIA a resposta: toda operacao encerrada dizia so que
   fechou, nunca se recebeu tudo, parte ou nada. Encerramento e' outro eixo —
   virou o cadeado ao lado da pilula. Alem disso "Encerrado" e "Concluido" sao
   sinonimos em portugues e o operador nao distinguia os dois.
   Sem lotes → null ("—"): sem lote nao ha o que afirmar sobre a chegada. */
function recStatus(estados: string[] | undefined): string | null {
  if (!estados || estados.length === 0) return null;
  // 'Com diferença' e nao 'Diferença': a aba Recebimento tem uma COLUNA Diferença,
  //   e o mesmo nome para as duas coisas faria o operador ler numero onde ha estado.
  if (estados.some(e => e === 'excedente')) return 'Com diferença';
  if (estados.every(e => e === 'completo')) return 'Concluído';
  if (estados.every(e => e === 'nao_iniciado')) return 'Não iniciado';
  return 'Parcial';
}

/* Tons por TOKEN do design system (--success / --warning / --muted), nunca cor
   crua: a paleta literal acima e' idioma anterior desta tela e fica onde esta.
   EXCEDENTE nao e' sucesso — e' divergencia, entao ganha o warning com enfase
   (peso + anel), e nao um verde que faria o operador ler "deu certo". */
const PILULA = 'inline-block rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap';
const TOM_SUCESSO = 'bg-success text-success-foreground';
const TOM_ATENCAO = 'bg-warning text-warning-foreground';
const TOM_ATENCAO_FORTE = 'bg-warning text-warning-foreground font-semibold ring-1 ring-warning-foreground/40';
const TOM_NEUTRO = 'bg-muted text-muted-foreground';

/* Recebimento passou a falar a MESMA lingua de Comercial e Liquidacao. Era a
   unica coluna em cor literal (bg-slate/amber/emerald/rose/blue-100): duas
   linguagens de cor na mesma linha, e o operador traduzindo paleta.
   Precisa ficar DEPOIS dos TOM_* — const de modulo lida antes da declaracao e' TDZ.
   'Com diferença' leva o ATENCAO_FORTE pela mesma logica do excedente: divergencia
   nao e' sucesso, ainda que a entrega tenha acontecido. */
const REC_TONE: Record<string, string> = {
  'Não iniciado': TOM_NEUTRO,
  Parcial: TOM_ATENCAO,
  'Com diferença': TOM_ATENCAO_FORTE,
  Concluído: TOM_SUCESSO,
};

const LIQ_TOM: Record<string, string> = {
  quitada: TOM_SUCESSO,
  parcial: TOM_ATENCAO,
  excedente: TOM_ATENCAO_FORTE,
  nao_liquidada: TOM_NEUTRO,
  em_aberto: TOM_NEUTRO,
  base_indefinida: TOM_NEUTRO,
  sem_base: TOM_NEUTRO,
};

// Financeiro: figura soberana "mais avançada" da View 3 (nunca length de array). Sem modelo → null.
function finResumo(f: FinRow | undefined): { valor: number; rotulo: string; modo: string } | null {
  if (!f || (!f.tem_compromissos && !f.tem_partes_legadas)) return null;
  if (f.total_liquidado > 0) return { valor: f.total_liquidado, rotulo: 'liquidado', modo: f.modo };
  if (f.total_materializado > 0) return { valor: f.total_materializado, rotulo: 'materializado', modo: f.modo };
  if (f.total_programado > 0) return { valor: f.total_programado, rotulo: 'programado', modo: f.modo };
  if (f.obrigacao_total > 0) return { valor: f.obrigacao_total, rotulo: 'obrigação', modo: f.modo };
  return { valor: 0, rotulo: '', modo: f.modo };
}

/* ⚠ `nao_liquidada` deixou de imprimir '—'. A view SABE que nao houve liquidacao:
   isso e' fato, e '—' e' reservado a dado ausente/desconhecido. Trocar os dois
   faz o operador ler "nao sei" onde a resposta existe.

   ⚠ A CHAVE ERA `nao_iniciada` E NUNCA DISPARAVA. `nao_iniciada` e' o valor
   INTERNO de _oc_estado_liquidacao; a view o renomeia antes de publicar
   (`WHEN 'nao_iniciada' THEN 'nao_liquidada'`, 20260722120000). Com a chave
   errada aqui, o rotulo com til ficava inerte e a celula caia no fallback,
   imprimindo "Nao liquidada" sem acento; o tom vinha do `?? TOM_NEUTRO`, certo
   por acidente. Vocabulario publicado desta view, medido no banco:
   nao_liquidada | parcial | quitada | excedente | base_indefinida.
   `em_aberto` e `sem_base` ficam como entradas inertes de outra fonte. */
const LIQ_LABEL: Record<string, string> = {
  quitada: 'Liquidada', parcial: 'Parcial', excedente: 'Excedente',
  nao_liquidada: 'Não liquidada', base_indefinida: 'Base indefinida', sem_base: 'Base indefinida', em_aberto: 'Em aberto',
};
function liqLabel(estado: string | null | undefined): string {
  if (!estado) return '—';
  return LIQ_LABEL[estado] ?? (estado.charAt(0).toUpperCase() + estado.slice(1).replace(/_/g, ' '));
}

/* ORDEM DOS EIXOS POR GRAVIDADE, nunca alfabetica: alfabetica poria "Liquidada"
   antes de "Nao liquidada" e faria o operador ler a lista ao contrario do risco.
   Crescente = do menos resolvido ao mais resolvido. Mapa EXPLICITO de posicao —
   nada inferido do nome do estado.

   AS CHAVES SAO O VOCABULARIO PUBLICADO, conferido no banco, nao o interno:
   - comercial: CHECK da tabela — programada | fechada | cancelada;
   - liquidacao: a view publica nao_liquidada | parcial | quitada | excedente |
     base_indefinida. `nao_iniciada` e `em_aberto` NAO sao publicados por ela
     (`nao_iniciada` e' o valor interno, renomeado na view) e por isso ficam fora;
   - recebimento: a chave e' o rotulo do ROLLUP (recStatus), nao o estado por lote
     da view — a view so tem nao_iniciado|completo, e quem a Central mostra e o
     rollup. Os QUATRO rotulos que ele emite estao mapeados; 'Encerrado' saiu
     porque encerramento deixou de ser estado de chegada e virou o cadeado, que
     NAO entra na ordenacao — e' outro eixo.

   DIVERGENCIA ANTES DO QUE JA FECHOU, nos dois eixos: `excedente` vem antes de
   `quitada` e `Diferenca` antes de `Concluido`. Quem diverge precisa ser visto;
   quem fechou pode esperar. `base_indefinida` fica logo depois de nao_liquidada:
   a base do calculo e' desconhecida, entao nao ha o que dar por resolvido. */
const ORD_COMERCIAL: Record<string, number> = { programada: 1, fechada: 2, cancelada: 3 };
const ORD_RECEBIMENTO: Record<string, number> = {
  'Não iniciado': 1, Parcial: 2, 'Com diferença': 3, Concluído: 4,
};
const ORD_LIQUIDACAO: Record<string, number> = {
  nao_liquidada: 1, base_indefinida: 2, parcial: 3, excedente: 4, quitada: 5,
};
// Rede de seguranca, nao rotina: hoje os tres mapas cobrem todo o vocabulario.
//   Vale para estado NOVO que a fonte passe a emitir sem passar por aqui.
const FIM_DA_ESCALA = 99;

/* Estado AUSENTE (null/vazio) → null, que a comparacao joga para o fim nas duas
   direcoes. Estado CONHECIDO fora do mapa → fim da escala, mas ainda ordenavel:
   ausencia e desconhecimento sao coisas diferentes e nao se confundem aqui. */
function posicao(mapa: Record<string, number>, estado: string | null | undefined): number | null {
  if (estado == null || estado === '') return null;
  return mapa[estado] ?? FIM_DA_ESCALA;
}

type ColunaOrd =
  | 'oc' | 'data' | 'tipo' | 'contraparte' | 'fazenda' | 'animais'
  | 'valor' | 'comercial' | 'recebimento' | 'financeiro' | 'liquidacao';
interface Ordenacao { col: ColunaOrd; dir: 'asc' | 'desc'; }

/* Cabecalho ordenavel. O `th` INTEIRO e' a area de clique (o onClick no th pega
   tambem o padding, o que um button interno nao pegaria). A seta so aparece na
   coluna ativa; sobre o azul opaco ela herda text-primary-foreground, e o realce
   de hover e' o mesmo `primary-foreground/10` que o resto do /v2 usa sobre azul.
   AÇÕES nao usa este componente: nao ordena, nao tem cursor nem seta. */
function ThOrd({ col, rotulo, ord, onOrdenar, direita }: {
  col: ColunaOrd; rotulo: string; ord: Ordenacao | null;
  onOrdenar: (col: ColunaOrd) => void; direita?: boolean;
}) {
  const dirAtiva = ord && ord.col === col ? ord.dir : null;
  return (
    <TableHead
      className={`${TH}${direita ? ' text-right' : ''} cursor-pointer select-none hover:bg-primary-foreground/10`}
      onClick={() => onOrdenar(col)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOrdenar(col); } }}
      tabIndex={0}
      aria-sort={dirAtiva === 'asc' ? 'ascending' : dirAtiva === 'desc' ? 'descending' : 'none'}
    >
      <span className="inline-flex items-center gap-0.5">
        {rotulo}
        {dirAtiva === 'asc' && <ArrowUp className="h-2.5 w-2.5" />}
        {dirAtiva === 'desc' && <ArrowDown className="h-2.5 w-2.5" />}
      </span>
    </TableHead>
  );
}

function BadgeComercial({ status, rascunho }: { status: string; rascunho: boolean }) {
  // Mesmos tokens da Liquidação, para os dois eixos se lerem juntos sem traduzir paleta.
  const cor =
    status === 'fechada' ? TOM_SUCESSO
    : status === 'cancelada' ? TOM_NEUTRO
    : 'bg-secondary text-secondary-foreground';
  const label = status === 'fechada' ? 'Fechada' : status === 'cancelada' ? 'Cancelada' : 'Programada';
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`${PILULA} ${cor}`}>{label}</span>
      {rascunho && <span className={`${PILULA} ${TOM_ATENCAO}`}>Rascunho</span>}
    </span>
  );
}

interface CentralOperacoesComerciaisProps {
  /** FIN-MODAL-FECHO-01 item 2 — ao receber ?oc_id=, a Central localiza a operação do tenant e a abre. */
  initialOcId?: string;
  /** PR-OC-NAV-01 — abertura SPA soberana (sem reload) via parent (V2Index → Lançamentos/CompraModalShell). */
  onAbrirOperacao?: (ocId: string) => void;
}

export function CentralOperacoesComerciais({ initialOcId, onAbrirOperacao }: CentralOperacoesComerciaisProps = {}) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? '';
  const rpc = useOperacaoComercial();

  const [rows, setRows] = useState<OpRow[]>([]);
  const [fazendas, setFazendas] = useState<Record<string, FazendaRef>>({});
  const [contrapartes, setContrapartes] = useState<Record<string, string>>({});
  const [finMap, setFinMap] = useState<Record<string, FinRow>>({});
  const [liqMap, setLiqMap] = useState<Record<string, LiqRow>>({});
  const [recMap, setRecMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  const [busca, setBusca] = useState('');
  const [fTipo, setFTipo] = useState('__all__');
  const [fComercial, setFComercial] = useState('__all__');
  const [fFazenda, setFFazenda] = useState('__all__');
  /* ⚠ O FILTRO PROMETIA MAIS DO QUE ENTREGAVA. Rotulado "Situação", filtrava so
     `status_comercial` enquanto a tabela mostra QUATRO eixos: quem escolhia
     "Programada" achava que filtrava a operacao e filtrava um eixo so. Agora o
     rotulo diz o eixo, e a Liquidacao ganhou o seu.
     Recebimento ganhou o seu em PR-OC-CENTRAL-UX-03, sobre o MESMO rollup que
     pinta a coluna (recStatus), nunca sobre uma segunda leitura da view.
     Financeiro segue SEM filtro — pendencia registrada. */
  const [fLiquidacao, setFLiquidacao] = useState('__all__');
  const [fRecebimento, setFRecebimento] = useState('__all__');
  const [dtIni, setDtIni] = useState('');   // '' = sem limite naquela ponta
  const [dtFim, setDtFim] = useState('');
  const [mostrarRascunhos, setMostrarRascunhos] = useState(false);
  /* null = ordem PADRAO (a que veio do banco, data_operacao desc) e TERCEIRO
     estado do ciclo asc -> desc -> padrao. Uma coluna ativa por vez. */
  const [ord, setOrd] = useState<Ordenacao | null>(null);
  const [page, setPage] = useState(1);

  // Ação de escrita (menu): cancelar/reabrir com motivo obrigatório e saving anti-duplo-clique.
  /* PR-OC-EDICAO-POS-FECHAMENTO-02 — so 'cancelar'. "Reabrir recebimento" saiu daqui:
     ele JA EXISTIA dentro da aba Recebimento (AbaRecebimentoLotes:315), com o mesmo
     dialogo de motivo e a mesma RPC `oc_reabrir_entrega`. Eram duas copias da mesma
     acao; ficou a que mora ao lado do que ela reabre. */
  const [acao, setAcao] = useState<{ tipo: 'cancelar'; op: OpRow } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  /* EXCLUSAO DEFINITIVA — estado PROPRIO, nao mais um `tipo` em `acao`. Aquele dialogo
     e' de uma etapa; este exige DUAS, no mesmo padrao do estorno em tres niveis: a
     primeira mostra o que sera removido, a segunda pede o motivo. Acao irreversivel
     nao pode compartilhar caminho com acao desfazivel. */
  const [excluirAlvo, setExcluirAlvo] = useState<OpRow | null>(null);
  const [excluirEtapa, setExcluirEtapa] = useState<1 | 2>(1);
  const [excluirMotivo, setExcluirMotivo] = useState('');
  const [excluindo, setExcluindo] = useState(false);

  // ZERO N+1, BOUNDED pelo conjunto carregado: FASE 1 = lista de operações; FASE 2 = auxiliares em lote,
  //   filtradas pelos IDs da lista (nunca por cliente inteiro; nunca .in([]); nunca consulta no render/map).
  //   Requests FIXOS: 1 (lista) + até 5 (auxiliares) — independentes do nº de linhas.
  const carregar = useCallback(async () => {
    if (!clienteId) { setRows([]); setFazendas({}); setContrapartes({}); setFinMap({}); setLiqMap({}); setRecMap({}); return; }
    setLoading(true);
    try {
      // FASE 1 — lista de operações (bounded por cliente + limit).
      const ops = await sb.from('zoo_operacoes_comerciais')
        .select('id, versao, data_operacao, tipo_operacao, contraparte_id, fazenda_id, status_comercial, rascunho, entrega_encerrada, qtd_negociada, peso_total_negociado_kg, valor_acordado, valor_total')
        .eq('cliente_id', clienteId).order('data_operacao', { ascending: false }).limit(1000);
      if (ops?.error) throw new Error(ops.error.message);
      const operacoes = (ops.data as OpRow[] | null) ?? [];
      setRows(operacoes);

      const operacaoIds = operacoes.map(op => op.id);
      if (operacaoIds.length === 0) {
        setFazendas({}); setContrapartes({}); setFinMap({}); setLiqMap({}); setRecMap({});
        return;   // sem operações → mapas vazios, sem chamar as views com .in([])
      }
      const fazendaIds = Array.from(new Set(operacoes.map(o => o.fazenda_id).filter((v): v is string => !!v)));
      const contraparteIds = Array.from(new Set(operacoes.map(o => o.contraparte_id).filter((v): v is string => !!v)));

      // FASE 2 — auxiliares em lote, filtradas pelo CONJUNTO FECHADO de IDs da lista carregada.
      const [faz, forn, fin, liq, rec] = await Promise.all([
        fazendaIds.length ? sb.from('fazendas').select('id, nome, codigo').in('id', fazendaIds) : Promise.resolve({ data: [] }),
        contraparteIds.length ? sb.from('financeiro_fornecedores').select('id, nome').in('id', contraparteIds) : Promise.resolve({ data: [] }),
        sb.from('vw_oc_operacao_compromissos_resumo')
          .select('operacao_id, modo, n_compromissos, obrigacao_total, total_programado, total_materializado, total_liquidado, tem_compromissos, tem_partes_legadas')
          .eq('cliente_id', clienteId).in('operacao_id', operacaoIds),
        sb.from('vw_oc_operacao_liquidacao').select('operacao_id, estado_liquidacao').eq('cliente_id', clienteId).in('operacao_id', operacaoIds),
        sb.from('vw_oc_lotes_recebimento').select('operacao_id, estado_recebimento').eq('cliente_id', clienteId).in('operacao_id', operacaoIds),
      ]);

      const fmap: Record<string, FazendaRef> = {};
      ((faz?.data as { id: string; nome: string; codigo: string | null }[] | null) ?? [])
        .forEach(f => { fmap[f.id] = { nome: f.nome, codigo: f.codigo }; });
      setFazendas(fmap);
      const cmap: Record<string, string> = {};
      ((forn?.data as { id: string; nome: string }[] | null) ?? []).forEach(c => { cmap[c.id] = c.nome; });
      setContrapartes(cmap);
      const finmap: Record<string, FinRow> = {};
      ((fin?.data as FinRow[] | null) ?? []).forEach(x => { finmap[x.operacao_id] = x; });
      setFinMap(finmap);
      const liqmap: Record<string, LiqRow> = {};
      ((liq?.data as LiqRow[] | null) ?? []).forEach(x => { liqmap[x.operacao_id] = x; });
      setLiqMap(liqmap);
      const recmap: Record<string, string[]> = {};
      ((rec?.data as RecLoteRow[] | null) ?? []).forEach(x => {
        if (!recmap[x.operacao_id]) recmap[x.operacao_id] = [];
        recmap[x.operacao_id].push(x.estado_recebimento);
      });
      setRecMap(recmap);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar operações.');
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const fazendaOptions = useMemo(
    () => Array.from(new Set(rows.map(r => r.fazenda_id).filter((v): v is string => !!v))),
    [rows],
  );
  /* Opcoes derivadas do que FOI CARREGADO, mesmo idioma do fazendaOptions: lista
     fixa criaria opcao morta (estado que a base nao tem) e esconderia estado novo. */
  const liquidacaoOptions = useMemo(
    () => Array.from(new Set(Object.values(liqMap).map(l => l.estado_liquidacao).filter((v): v is string => !!v))).sort(),
    [liqMap],
  );
  /* Recebimento nao tem coluna crua para derivar: o valor exibido e' o ROLLUP
     (recStatus). Entao as opcoes saem do mesmo rollup, linha a linha — assim opcao
     e coluna nunca discordam, e foi por isso que 'Encerrado' sumiu das opcoes
     sozinho quando recStatus parou de emiti-lo. */
  const recebimentoOptions = useMemo(
    () => Array.from(new Set(rows.map(r => recStatus(recMap[r.id])).filter((v): v is string => !!v))).sort(),
    [rows, recMap],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter(r => {
      if (!mostrarRascunhos && r.rascunho) return false;
      // Canceladas ocultas da visão ativa padrão, salvo quando o filtro Situação pede 'cancelada'.
      if (r.status_comercial === 'cancelada' && fComercial !== 'cancelada') return false;
      if (fTipo !== '__all__' && r.tipo_operacao !== fTipo) return false;
      if (fComercial !== '__all__' && r.status_comercial !== fComercial) return false;
      if (fFazenda !== '__all__' && r.fazenda_id !== fFazenda) return false;
      if (fLiquidacao !== '__all__' && (liqMap[r.id]?.estado_liquidacao ?? '') !== fLiquidacao) return false;
      if (fRecebimento !== '__all__' && (recStatus(recMap[r.id]) ?? '') !== fRecebimento) return false;
      /* data_operacao e' 'yyyy-MM-dd' e o DatePicker devolve o mesmo formato:
         comparacao de string ja e' cronologica, sem Date nem fuso no meio.
         INCLUSIVO nas duas pontas. */
      if (dtIni && r.data_operacao < dtIni) return false;
      if (dtFim && r.data_operacao > dtFim) return false;
      if (q) {
        const nome = (r.contraparte_id ? contrapartes[r.contraparte_id] : '') ?? '';
        if (!nome.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, busca, fTipo, fComercial, fFazenda, fLiquidacao, fRecebimento, dtIni, dtFim, mostrarRascunhos, contrapartes, liqMap, recMap]);

  const nomeContraparte = (r: OpRow) => (r.contraparte_id ? contrapartes[r.contraparte_id] ?? '—' : '—');
  const fazendaRef = (r: OpRow): FazendaRef | null => (r.fazenda_id ? fazendas[r.fazenda_id] ?? null : null);
  const nomeFazenda = (r: OpRow) => fazendaRef(r)?.nome ?? '—';
  const siglaFazenda = (r: OpRow) => { const f = fazendaRef(r); return f ? (f.codigo ?? f.nome) : '—'; };

  const alternarOrd = (col: ColunaOrd) => setOrd(atual =>
    atual?.col !== col ? { col, dir: 'asc' }
    : atual.dir === 'asc' ? { col, dir: 'desc' }
    : null);

  /* ORDENA `filtradas` INTEIRA, ANTES da paginacao. Ordenar so a pagina visivel
     mostraria "o maior valor" que e' apenas o maior daquelas 25 linhas — mentira.
     Nada aqui toca o fetch: a leitura em lote continua identica, isto e' memoria.
     Copia antes de `sort` (filtradas e' resultado de memo, nao se mutila).
     `sort` estavel: empate mantem a ordem padrao que veio do banco.
     A CHAVE E' SEMPRE O QUE A CELULA MOSTRA — nome da contraparte e nao o uuid,
     codigo da fazenda e nao o id, valor do financeiro e nao o rotulo. */
  const ordenadas = useMemo(() => {
    if (!ord) return filtradas;
    const chave = (r: OpRow): string | number | null => {
      switch (ord.col) {
        case 'oc': return r.id;
        // Cronologica de verdade: 'yyyy-MM-dd' vira 20260731 (numero), sem Date e
        //   sem fuso no meio. Data vazia/invalida e' ausencia.
        case 'data': {
          const n = Number((r.data_operacao ?? '').replace(/-/g, ''));
          return Number.isFinite(n) && n > 0 ? n : null;
        }
        case 'tipo': return TIPO_LABEL[r.tipo_operacao] ?? r.tipo_operacao ?? null;
        case 'contraparte': return (r.contraparte_id ? contrapartes[r.contraparte_id] : null) ?? null;
        case 'fazenda': { const f = fazendaRef(r); return f ? (f.codigo ?? f.nome) : null; }
        case 'animais': return r.qtd_negociada ?? null;
        case 'valor': return r.valor_acordado ?? r.valor_total ?? null;
        case 'comercial': return posicao(ORD_COMERCIAL, r.status_comercial);
        case 'recebimento': return posicao(ORD_RECEBIMENTO, recStatus(recMap[r.id]));
        // Mesmo criterio da celula: ela so imprime valor quando fin.valor > 0;
        //   fora disso mostra '—', e '—' ordena como ausencia.
        case 'financeiro': { const f = finResumo(finMap[r.id]); return f && f.valor > 0 ? f.valor : null; }
        case 'liquidacao': return posicao(ORD_LIQUIDACAO, liqMap[r.id]?.estado_liquidacao);
      }
    };
    const dir = ord.dir === 'asc' ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      const ka = chave(a), kb = chave(b);
      /* AUSENCIA POR ULTIMO NAS DUAS DIRECOES. Nulo nao e' menor nem maior — e'
         ausencia, e ausencia fica por ultimo em qualquer leitura. E' por isso que
         estes tres retornos ficam FORA da multiplicacao por `dir`. */
      if (ka === null && kb === null) return 0;
      if (ka === null) return 1;
      if (kb === null) return -1;
      const base = typeof ka === 'number' && typeof kb === 'number'
        ? ka - kb
        : String(ka).localeCompare(String(kb), 'pt-BR');
      return base * dir;
    });
  }, [filtradas, ord, contrapartes, fazendas, finMap, liqMap, recMap]);

  const totalPages = Math.max(1, Math.ceil(ordenadas.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = ordenadas.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  // Reordenar volta para a pagina 1 pelo mesmo motivo que filtrar volta: pagina 3
  //   de uma lista reordenada e' um recorte sem sentido.
  useEffect(() => { setPage(1); }, [busca, fTipo, fComercial, fFazenda, fLiquidacao, fRecebimento, dtIni, dtFim, mostrarRascunhos, ord]);

  // Abertura soberana por tipo (Compra → SPA via parent; venda/abate ainda indisponíveis na Central).
  const abrirOperacaoPorTipo = (r: OpRow) => {
    if (r.tipo_operacao === 'compra') onAbrirOperacao?.(r.id);
  };

  const ocIdHandledRef = useRef(false);
  useEffect(() => {
    if (!initialOcId || loading || ocIdHandledRef.current) return;
    const r = rows.find(x => x.id === initialOcId);
    if (r) { ocIdHandledRef.current = true; abrirOperacaoPorTipo(r); }
  }, [initialOcId, loading, rows]);

  // Ações de escrita — SÓ contratos vivos; versão explícita; motivo obrigatório; recarrega a lista (mantém filtros).
  const confirmarExclusao = async () => {
    if (!excluirAlvo || excluindo) return;
    const m = excluirMotivo.trim();
    if (m === '') { toast.error('Informe o motivo.'); return; }
    setExcluindo(true);
    try {
      const { data, error } = await sb.rpc('oc_excluir_definitivamente', {
        p_operacao_id: excluirAlvo.id, p_cliente_id: clienteId, p_motivo: m,
      });
      /* ⚠ ERRO DO GUARD INTEGRAL, sem mascarar. A RPC diz O QUE impede e QUANTOS
         ("2 titulo(s) financeiro(s) ativo(s)"); resumir isso para "nao foi possivel"
         devolveria o operador ao escuro que este PR veio tirar. */
      if (error) throw new Error(error.message);
      void data;
      toast.success('Operação excluída definitivamente.');
      setExcluirAlvo(null); setExcluirMotivo(''); setExcluirEtapa(1);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir a operação.');
    } finally {
      setExcluindo(false);
    }
  };

  const confirmarAcao = async () => {
    if (!acao || saving) return;
    const m = motivo.trim();
    if (m === '') { toast.error('Informe o motivo.'); return; }
    setSaving(true);
    try {
      await rpc.cancelar(acao.op.id, clienteId, acao.op.versao, m);   // oc_cancelar (hook existente)
      toast.success('Operação cancelada.');
      setAcao(null); setMotivo('');
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha na ação.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 w-full px-3 pt-3">
      {/* Cabeçalho compacto (sem banner, sem botão do fluxo legado) */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold leading-none">Operações Comerciais</h2>
        <span className="text-[10px] text-muted-foreground">{filtradas.length} operação(ões)</span>
      </div>

      {/* Barra de filtros — DUAS LINHAS FIXAS, nao `flex-wrap`: a quebra e' decidida
          aqui, nao pelo espaco que sobrar. Linha 1 = recorte da operacao (quando,
          o que, com quem, onde); linha 2 = os TRES EIXOS de estado, que sao lidos
          juntos porque respondem a mesma pergunta, mais o pedal de Rascunhos.
          A altura desta barra (32 + 6 + 32 + 6 = 76px) entra no calc da tabela. */}
      <div className="sticky top-0 z-20 space-y-1.5 bg-background pb-1.5">
        <div className="flex items-center gap-1.5">
          <DatePicker value={dtIni} onChange={setDtIni} placeholder="Data inicial" size="compact" className="w-[124px]" />
          <DatePicker value={dtFim} onChange={setDtFim} placeholder="Data final" size="compact" className="w-[124px]" />
          <Select value={fTipo} onValueChange={setFTipo}>
            <SelectTrigger className="h-8 w-32 text-[11px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os tipos</SelectItem>
              <SelectItem value="compra">Compra</SelectItem>
              <SelectItem value="venda">Venda em Pé</SelectItem>
              <SelectItem value="abate">Abate</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Contraparte…" className="h-8 w-40 pl-7 text-[11px]" />
          </div>
          <Select value={fFazenda} onValueChange={setFFazenda}>
            <SelectTrigger className="h-8 w-36 text-[11px]"><SelectValue placeholder="Fazenda" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as fazendas</SelectItem>
              {fazendaOptions.map(id => <SelectItem key={id} value={id}>{fazendas[id]?.nome ?? id}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={fComercial} onValueChange={setFComercial}>
            <SelectTrigger className="h-8 w-36 text-[11px]"><SelectValue placeholder="Comercial" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todo comercial</SelectItem>
              <SelectItem value="programada">Programada</SelectItem>
              <SelectItem value="fechada">Fechada</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fRecebimento} onValueChange={setFRecebimento}>
            <SelectTrigger className="h-8 w-36 text-[11px]"><SelectValue placeholder="Recebimento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todo recebimento</SelectItem>
              {recebimentoOptions.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fLiquidacao} onValueChange={setFLiquidacao}>
            <SelectTrigger className="h-8 w-36 text-[11px]"><SelectValue placeholder="Liquidação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Toda liquidação</SelectItem>
              {liquidacaoOptions.map(e => <SelectItem key={e} value={e}>{liqLabel(e)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={mostrarRascunhos ? 'secondary' : 'outline'} size="sm" className="h-8 gap-1 text-[11px]"
            onClick={() => setMostrarRascunhos(v => !v)}>
            <Filter className="h-3 w-3" /> Rascunhos
          </Button>
        </div>
      </div>

      {/* ⚠ `<table>` CRU, e nao o primitivo `<Table>`: aquele embrulha a tabela num
          `div.overflow-auto` (ui/table.tsx:7). Esse div e' um scroll container, entao
          era ELE — e nao este container com max-h — o scrollport do `sticky` do thead.
          Como nunca rola, o cabecalho tinha zero curso e subia junto com a lista: era
          essa a causa do cabecalho que sumia, e nenhum ajuste de `top` a corrigiria.
          Sem o embrulho, o scroll e' DESTE container e o thead cola no topo da LISTA —
          que comeca imediatamente abaixo da barra de filtros, que e' onde ele deve
          ficar. `top-0` aqui NAO e' o topo da pagina: a pagina nao rola (V2Index e'
          h-screen + overflow-hidden), quem rola e' a lista.

          LARGURAS NO `<colgroup>`, nao nos `<th>`: o col rege a coluna inteira, corpo
          incluso, enquanto a largura declarada no th sticky so valia para o th. Era
          por isso que Contraparte invadia Fazenda enquanto Comercial e Recebimento
          sobravam. CONTRAPARTE e' a unica sem largura — fica com toda a sobra (nomes
          como "Eduardo Alves de Oliveira"), truncada, nome completo no title; os tres
          eixos ficam no tamanho da pilula e Fazenda, que mostra so o codigo, e estreita.

          ALTURA MEDIDA, nao arbitrada. Acima: V2FilterBar 45 (py-2 + h-7 + border) +
          pt-3 12 + titulo 15 + space-y-2 8 + barra 76 (32+6+32+6) + space-y-2 8 = 164.
          Abaixo: space-y-2 8 + paginacao h-6 24 + respiro 8 = 40. Total 204. */}
      <div className="rounded-md border overflow-y-auto max-h-[calc(100vh-204px)]">
        <table className="w-full table-fixed caption-bottom text-sm">
          <colgroup>
            {/* Medido no DOM (Chrome, 10px/9px desta tela), nao estimado: cada largura e' o
                maior entre o rotulo do cabecalho e o conteudo mais largo do corpo. Quem
                manda em Fazenda e Recebimento e' o CABECALHO ("FAZENDA", "RECEBIMENTO"),
                nao a celula — por isso nao encolhem mais do que isto. */}
            <col className="w-[62px]" />{/* OC — "#" + 8 hex mono */}
            <col className="w-[72px]" />{/* Data — 31/07/2026 */}
            <col className="w-[68px]" />{/* Tipo — "Venda em Pé" */}
            <col />{/* Contraparte — TODA a sobra */}
            <col className="w-[58px]" />{/* Fazenda — so o codigo; o rotulo e' que pede 56 */}
            <col className="w-[66px]" />{/* Animais — cab + kg */}
            <col className="w-[80px]" />{/* Valor — R$ 1.234.567 */}
            <col className="w-[72px]" />{/* Comercial — pilula */}
            {/* 102 e nao 82: o item 3 do PR-OC-RECEB-UX-01 alargou o conteudo desta
                celula. Pior caso medido no DOM — pilula "Com diferença" (76) + gap (4)
                + cadeado (10) = 90 de conteudo, mais 12 de padding. Os 82 antigos
                cortariam justamente a divergencia, que e' o que nao pode sumir.
                Os 20px saem de Contraparte, a coluna da sobra, que cai de 108 para 88. */}
            <col className="w-[102px]" />{/* Recebimento — pilula + cadeado */}
            <col className="w-[88px]" />{/* Financeiro — valor + rotulo */}
            <col className="w-[88px]" />{/* Liquidação — pilula */}
            <col className="w-[46px]" />{/* Ações */}
          </colgroup>
          <TableHeader className="sticky top-0 z-10 bg-primary">
            <TableRow className="hover:bg-primary">
              <ThOrd col="oc" rotulo="OC" ord={ord} onOrdenar={alternarOrd} />
              <ThOrd col="data" rotulo="Data" ord={ord} onOrdenar={alternarOrd} />
              <ThOrd col="tipo" rotulo="Tipo" ord={ord} onOrdenar={alternarOrd} />
              <ThOrd col="contraparte" rotulo="Contraparte" ord={ord} onOrdenar={alternarOrd} />
              <ThOrd col="fazenda" rotulo="Fazenda" ord={ord} onOrdenar={alternarOrd} />
              <ThOrd col="animais" rotulo="Animais" ord={ord} onOrdenar={alternarOrd} direita />
              <ThOrd col="valor" rotulo="Valor" ord={ord} onOrdenar={alternarOrd} direita />
              <ThOrd col="comercial" rotulo="Comercial" ord={ord} onOrdenar={alternarOrd} />
              <ThOrd col="recebimento" rotulo="Recebimento" ord={ord} onOrdenar={alternarOrd} />
              <ThOrd col="financeiro" rotulo="Financeiro" ord={ord} onOrdenar={alternarOrd} />
              <ThOrd col="liquidacao" rotulo="Liquidação" ord={ord} onOrdenar={alternarOrd} />
              <TableHead className={`${TH} text-right`}>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={`sk-${i}`}><TableCell colSpan={12} className={TD}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
            ))}
            {!loading && pageRows.length === 0 && (
              <TableRow><TableCell colSpan={12} className="py-6 text-center text-[11px] text-muted-foreground">
                Nenhuma operação comercial.
              </TableCell></TableRow>
            )}
            {!loading && pageRows.map(r => {
              const rec = recStatus(recMap[r.id]);
              const fin = finResumo(finMap[r.id]);
              const valorOp = r.valor_acordado ?? r.valor_total ?? 0;
              return (
                <TableRow key={r.id}
                  /* PR-OC-EDICAO-POS-FECHAMENTO-02 — a LINHA abre a operacao, padrao do
                     resto do sistema. O menu de tres pontos fica para as acoes
                     destrutivas. Cursor so muda no que de fato abre: hoje apenas
                     Compra tem tela; prometer clique em venda/abate seria mentir. */
                  onClick={r.tipo_operacao === 'compra' ? () => abrirOperacaoPorTipo(r) : undefined}
                  className={r.tipo_operacao === 'compra' ? 'cursor-pointer' : undefined}>
                  <TableCell className={`${TD} font-mono whitespace-nowrap`} title={r.id}>#{r.id.slice(0, 8)}</TableCell>
                  <TableCell className={`${TD} whitespace-nowrap`}>{fmtData(r.data_operacao)}</TableCell>
                  <TableCell className={`${TD} whitespace-nowrap`}>{TIPO_LABEL[r.tipo_operacao] ?? r.tipo_operacao}</TableCell>
                  <TableCell className={`${TD} truncate`} title={nomeContraparte(r)}>{nomeContraparte(r)}</TableCell>
                  <TableCell className={`${TD} truncate`} title={nomeFazenda(r)}>{siglaFazenda(r)}</TableCell>
                  <TableCell className={`${TD} text-right whitespace-nowrap tabular-nums`}>
                    <div className="leading-tight">
                      <div>{r.qtd_negociada != null ? `${r.qtd_negociada} cab` : '—'}</div>
                      {r.peso_total_negociado_kg != null && r.peso_total_negociado_kg > 0 && (
                        <div className="text-[9px] text-muted-foreground">{kg(r.peso_total_negociado_kg)} kg</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className={`${TD} text-right whitespace-nowrap tabular-nums font-medium`}>{valorOp > 0 ? brl(valorOp) : '—'}</TableCell>
                  <TableCell className={TD}><BadgeComercial status={r.status_comercial} rascunho={r.rascunho} /></TableCell>
                  <TableCell className={TD}>
                    {/* Cadeado = EIXO SEPARADO, ao lado da pilula e nunca dentro dela: o
                        encerramento nao responde "chegou?", so "ainda mexe?". Por isso
                        aparece igual sobre 'Concluído', 'Parcial' ou '—'. O `title` vai no
                        span, nao no svg: em <svg> o atributo nao vira tooltip confiavel. */}
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      {rec
                        ? <span className={`${PILULA} ${REC_TONE[rec] ?? TOM_NEUTRO}`}>{rec}</span>
                        : <span className="text-muted-foreground">—</span>}
                      {r.entrega_encerrada && (
                        <span title="Entrega encerrada" className="text-muted-foreground">
                          <Lock className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className={`${TD} whitespace-nowrap`}>
                    {fin && fin.valor > 0
                      ? (
                        <div className="leading-tight">
                          <div className="tabular-nums font-medium">{brl(fin.valor)}</div>
                          {/* `modo` era diagnostico interno de migracao (novo_modelo / nova_vazia),
                              sem valor para quem opera, e roubava a largura da coluna. */}
                          <div className="text-[9px] text-muted-foreground">{fin.rotulo}</div>
                        </div>
                      )
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={`${TD} whitespace-nowrap`}>{(() => {
                    const est = liqMap[r.id]?.estado_liquidacao;
                    // Sem estado = a fonte não classifica: '—' de texto, NUNCA pílula colorida.
                    if (!est) return <span className="text-muted-foreground">—</span>;
                    return <span className={`${PILULA} ${LIQ_TOM[est] ?? TOM_NEUTRO}`}>{liqLabel(est)}</span>;
                  })()}</TableCell>
                  {/* stopPropagation: sem isto, abrir o menu abriria a operacao junto. */}
                  <TableCell className={`${TD} text-right`} onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6"><MoreVertical className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {r.tipo_operacao === 'compra'
                          ? <DropdownMenuItem onSelect={() => abrirOperacaoPorTipo(r)}><Eye className="h-3.5 w-3.5 mr-2" /> Abrir operação</DropdownMenuItem>
                          : <DropdownMenuItem disabled><Eye className="h-3.5 w-3.5 mr-2" /> Abrir (só Compra)</DropdownMenuItem>}
                        {r.status_comercial !== 'cancelada' && (
                          <DropdownMenuItem className="text-destructive focus:text-destructive"
                            onSelect={() => { setMotivo(''); setAcao({ tipo: 'cancelar', op: r }); }}>
                            <Ban className="h-3.5 w-3.5 mr-2" /> Cancelar operação
                          </DropdownMenuItem>
                        )}
                        {/* SO para cancelada — o mesmo predicado que a RPC exige. Oferecer
                            em outro estado seria prometer o que o banco nega. */}
                        {r.status_comercial === 'cancelada' && (
                          <DropdownMenuItem className="text-destructive focus:text-destructive"
                            onSelect={() => { setExcluirMotivo(''); setExcluirEtapa(1); setExcluirAlvo(r); }}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir definitivamente
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{filtradas.length} operação(ões)</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-6 text-[10px]" disabled={pageSafe <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹ Anterior</Button>
          <span>{pageSafe} / {totalPages}</span>
          <Button variant="outline" size="sm" className="h-6 text-[10px]" disabled={pageSafe >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Próximo ›</Button>
        </div>
      </div>

      {/* EXCLUSAO DEFINITIVA — duas etapas, espelhando o dialogo de estorno.
          `onOpenChange` so fecha quando NAO esta rodando: Esc e clique fora ficam inertes
          durante a execucao, senao o usuario fica sem saber se a exclusao aconteceu. */}
      {excluirAlvo && (
        <Dialog open onOpenChange={(o) => { if (!o && !excluindo) { setExcluirAlvo(null); setExcluirMotivo(''); setExcluirEtapa(1); } }}>
          <DialogContent className="sm:max-w-md"
            onInteractOutside={(e) => { if (excluindo) e.preventDefault(); }}
            onEscapeKeyDown={(e) => { if (excluindo) e.preventDefault(); }}>
            <DialogHeader>
              <DialogTitle className="text-[14px]">Excluir definitivamente</DialogTitle>
            </DialogHeader>
            {excluirEtapa === 1 && (
              <div className="text-[12px] space-y-1.5 leading-snug">
                <p>
                  A operação <span className="font-mono">#{excluirAlvo.id.slice(0, 8)}</span> de{' '}
                  {fmtData(excluirAlvo.data_operacao)}, {nomeContraparte(excluirAlvo)}
                  {excluirAlvo.qtd_negociada != null ? `, ${excluirAlvo.qtd_negociada} cab` : ''}
                  {(excluirAlvo.valor_acordado ?? excluirAlvo.valor_total) ? ` de ${brl(excluirAlvo.valor_acordado ?? excluirAlvo.valor_total ?? 0)}` : ''}
                  {' '}será removida com lotes, compromissos, programações, parcelas, documentos,
                  liquidações, movimentações, partes e todo o histórico de eventos.
                </p>
                {/* Diz o que NAO sai, porque e' a duvida obvia de quem le a lista acima. */}
                <p className="text-muted-foreground">
                  Os lançamentos financeiros e zootécnicos <b>não</b> são apagados — some apenas o
                  vínculo com esta operação.
                </p>
                <p className="text-destructive font-medium">Não há como desfazer.</p>
              </div>
            )}
            {excluirEtapa === 2 && (
              <div className="space-y-2 text-[12px]">
                <div className="text-[11px] text-muted-foreground">
                  O motivo fica registrado na auditoria e sobrevive à exclusão.
                </div>
                <Textarea value={excluirMotivo} onChange={e => setExcluirMotivo(e.target.value)} rows={2}
                  disabled={excluindo} className="text-[12px]" placeholder="Justifique a exclusão" />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" disabled={excluindo}
                onClick={() => { setExcluirAlvo(null); setExcluirMotivo(''); setExcluirEtapa(1); }}>Voltar</Button>
              {excluirEtapa === 1 ? (
                <Button size="sm" variant="destructive" onClick={() => setExcluirEtapa(2)}>Continuar</Button>
              ) : (
                /* O ultimo clique diz a PALAVRA. "Confirmar" nao avisa ninguem. */
                <Button size="sm" variant="destructive" disabled={excluindo || excluirMotivo.trim() === ''}
                  onClick={confirmarExclusao}>
                  {excluindo ? 'Excluindo…' : 'Excluir definitivamente'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog de cancelamento — motivo obrigatório, saving anti-duplo-clique */}
      <Dialog open={acao !== null} onOpenChange={o => { if (!o) { setAcao(null); setMotivo(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Cancelar operação</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-[12px]">
            <div className="text-[11px] text-muted-foreground">
              A operação será cancelada (contrato oc_cancelar), sujeita às regras do backend.
              {acao && <> Operação <span className="font-mono">#{acao.op.id.slice(0, 8)}</span>.</>}
            </div>
            <div>
              <div className="text-[11px] font-medium">Motivo *</div>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} className="mt-0.5 text-[12px]" placeholder="Justifique a ação" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setAcao(null); setMotivo(''); }}>Voltar</Button>
            <Button size="sm" variant="destructive"
              disabled={saving || motivo.trim() === ''} onClick={confirmarAcao}>
              Cancelar operação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
