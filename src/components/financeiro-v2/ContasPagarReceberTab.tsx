/**
 * ContasPagarReceberTab — PR-CPR-2A (esqueleto).
 *
 * A tela anti-surpresa: "o que vence, quando, somando TODAS as contas". O eixo é
 * `data_vencimento` e nada mais — é o que a separa do resto do Financeiro.
 *
 * ⚠ O TOTAL DESTA TELA NÃO CASA COM A LISTA DO FINANCEIRO, E É DE PROPÓSITO. A lista
 * recorta pela data FINANCEIRA (`COALESCE(data_pagamento, data_vencimento)`, contrato do
 * PR-FIN-OC-CONTRATO-01); esta recorta pelo VENCIMENTO. São perguntas diferentes, e fazer
 * os dois números baterem exigiria que uma das duas parasse de responder a sua.
 *
 * ⚠ CENÁRIO REAL APENAS. `cenario='meta'` fica fora — meta é planejamento, e uma obrigação
 * planejada listada ao lado das reais é exatamente a surpresa que a tela existe para evitar.
 * Não há filtro escrito aqui para isso: quem exclui `meta`, `cancelado` e `conciliado` é o
 * `aplicarPlanoNaView`, o MESMO caminho da lista paginada. Reusar é o ponto.
 *
 * Frontend puro: sem RPC, sem migration, sem tabela nova.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { supabase } from '@/integrations/supabase/client';
import { useFinanceiroV2, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Segmentado } from '@/components/ui/segmentado';
import { CprFluxoPrevisto } from '@/components/financeiro-v2/CprFluxoPrevisto';
import { DatePicker } from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ATALHOS_CPR, periodoDoAtalho, recortarCpr, ramoDaConsultaCpr, doSegmentoCpr, contaEmAberto,
  ehReceberCpr, contaDaConta, resumoPorContaCpr, contasDaFaixaCpr, SEM_CONTA,
  ancorasDoCaixaCpr, serieDoSaldoCpr, linhasDoSaldoCpr,
  type AtalhoCpr, type PeriodoCpr, type FiltroContaCpr,
} from '@/lib/financeiro/cprRecorte';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { aplicarPlanoNaView, type LinhaViewDoc } from '@/lib/financeiro/listaPaginadaV2';
import { montarPlanoBaseV2 } from '@/lib/financeiro/filtrosBaseV2';
import { paginarTudo } from '@/lib/financeiro/paginarTudo';
import {
  contaSemExtrato, estimarSaldoEmCaixa, grupoDoTipoConta, serieDoSaldoPassado,
  type ContaEmCaixa, type SaldoEmCaixa, type SeriePassado,
} from '@/lib/financeiro/saldoEmCaixa';
import { movimentoNaConta, type LinhaDaPosicao } from '@/hooks/useExtratoDaConta';
import { rotuloOrigem } from '@/v2/lib/origemLancamento';
import { useNomesDeFornecedores } from '@/hooks/useNomesDeFornecedores';
import { Maximize2, Minimize2, Paperclip } from 'lucide-react';
import { COR_SINAL } from '@/lib/oc/contaCorrente';
import { STATUS_FILTRO_COR, STATUS_FILTRO_LABEL } from '@/lib/financeiro/statusFinanceiro';
import { formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário da tela
// ─────────────────────────────────────────────────────────────────────────────

type Segmento = 'pagar' | 'receber' | 'ambos';
/** As duas visões da tela. A Lista é o default; o Fluxo é a mesma pergunta acumulada. */
type Visao = 'lista' | 'fluxo';

/**
 * ⚠ A UNIÃO PRECISA DAS DUAS PONTAS mesmo com só uma viva. O `Segmentado` resolve o seu `T`
 * pelo `valor` (é o que o `NoInfer` das opções garante), então declarar a constante como
 * `'vencimento'` faria a opção desligada de "categoria" virar erro de compilação. Nomear a
 * união é o que permite a opção existir desligada — que é o idioma da casa para dizer para
 * onde a tela vai sem fingir que já chegou.
 */
type Agrupamento = 'vencimento' | 'categoria';
const agrupamento: Agrupamento = 'vencimento';

/** Os três status que a tela liga de saída. `realizado` existe e nasce DESLIGADO. */
const STATUS_DISPONIVEIS = ['previsto', 'programado', 'agendado', 'realizado'] as const;
const STATUS_INICIAIS: string[] = ['previsto', 'programado', 'agendado'];

/**
 * O corte do destaque — R$ 100.000.
 *
 * ⚠ MEDIDO, NÃO ARBITRADO: no NJ ele marca 3 das 110 linhas dos 90 dias (a amortização
 * Sicredi de 500k, os juros de 100,5k e mais uma). Em R$ 50.000 seriam 4. Um corte que
 * marca metade da lista não destaca nada.
 */
const CORTE_DESTAQUE = 100_000;

/**
 * A RÉGUA TIPOGRÁFICA DA LISTA — PR-CPR-2A.3.1, e ela é um NÚMERO, não um gosto.
 *
 * ⚠ A HIERARQUIA ESTAVA INVERTIDA (A18): a linha de lançamento vinha em 11px com a descrição
 * em peso 500 e o valor do grande em 12px/600, enquanto a faixa do dia — o resumo — ficava em
 * 10px. O detalhe gritava mais alto que o agrupamento, e o olho tinha de LER para achar onde o
 * dia começa. Quem manda numa lista agrupada é a faixa.
 *
 *   faixa do dia      11px / 500 / altura 20   ← o único texto acima de 10px
 *   total do grupo    11px / 500               ← acompanha a faixa, é parte dela
 *   linha inteira     10px / 400 / altura 18   ← todas as células, valor incluído
 *   cabeçalho coluna  10px / 400 / altura 22
 *
 * ⚠ PISO 10px NESTA TELA, e ele é mais alto que o piso global de 9,5px do CLAUDE.md por
 * decisão do briefing. A pílula de status subiu de 9,5 para 10 por causa dele.
 * ⚠ E NENHUMA CÉLULA EM NEGRITO. Peso é hierarquia, e a hierarquia desta lista já está dita
 * pela faixa; repeti-la na linha é desfazê-la.
 */

/**
 * A RÉGUA DE COLUNAS — uma só, para o cabeçalho, as linhas e o total do grupo.
 *
 * ⚠ TRÊS LUGARES DESENHAM A MESMA GRADE, e é por isso que as larguras moram aqui: o cabeçalho
 * de coluna, a linha do lançamento e o total da faixa de data têm de ficar alinhados no pixel.
 * Três listas de classes copiadas divergem no primeiro ajuste — e aí o total do grupo deixa de
 * cair embaixo da coluna Valor, que é a única razão de ele estar à direita.
 *
 * ⚠ AS LARGURAS FORAM MEDIDAS, NÃO ARBITRADAS. A 1168px a barra lateral (`w-52` = 208px) deixa
 * 960px para a tela; menos `px-4` do container, a borda do cartão e o `px-3` da linha, sobram
 * ~899px. Com os fixos abaixo (624px) e os oito vãos (48px), a Descrição fica com ~227px —
 * cerca de 45 caracteres a 10px. Sobre 1.175 lançamentos visíveis no proto: descrição p95 49
 * (mediana 18), fornecedor p95 37 (mediana 20), banco p95 16 (máximo 25).
 *
 * ⚠ A DESCRIÇÃO ENCOLHEU DE PROPÓSITO em PR-CPR-2A.3.2 — ela tinha ~331px e comia as vizinhas,
 * que truncavam cedo. Agora ela cobre a mediana com folga e trunca (com `title`) acima de 45
 * caracteres, enquanto Fornecedor, Origem e Status ganharam o que ela devolveu e a coluna Doc
 * coube no que sobrou.
 * ⚠ FORNECEDOR E BANCO CONTINUAM SEPARADOS — a fusão foi vetada pelo Gabriel na 2A.3.2, e não
 * foi necessária: a conta fecha sem rolagem horizontal a 1168px.
 */
/**
 * CPR-SALDO-DIA-01 — AS DUAS RÉGUAS, em px, uma por modo. Cabeçalho, "Saldo hoje", faixa do dia, linha e rodapé leem a MESMA.
 * 0 = a coluna não existe no modo. A Descrição é o que sobra (`flex-1`); número, data e status NUNCA cortam.
 * ⚠ MEDIDAS a 1.126px (ver CLAUDE.md): as três colunas de valor no pior caso "▼ −R$ 99.999.999,99" em negrito.
 */
interface Regua {
  comp: number; venc: number; pgto: number; fornecedor: number; subcentro: number; safra: number; faz: number;
  status: number; anexo: number; pagar: number; receber: number; saldo: number;
}
const REGUA_NORMAL: Regua = { comp: 0, venc: 46, pgto: 0, fornecedor: 100, subcentro: 82, safra: 0, faz: 0, status: 60, anexo: 12, pagar: 111, receber: 111, saldo: 118 };
const REGUA_AMPLIADA: Regua = { comp: 30, venc: 46, pgto: 46, fornecedor: 96, subcentro: 84, safra: 56, faz: 26, status: 60, anexo: 12, pagar: 111, receber: 111, saldo: 118 };
const larg = (px: number): CSSProperties => ({ width: px, flexShrink: 0 });
/** As três células de valor de uma faixa (dia, vencidos, saldo hoje, rodapé): a MESMA grade das linhas. */
const moedaComSinal = (v: number) => `${v < 0 ? '−' : ''}${formatMoeda(Math.abs(v))}`;
/** Os dois tons CLAROS do rodapé navy (contraste ≥ 4,5:1 sobre `bg-primary`) — definidos AQUI, e só aqui. */
const TOM_NO_NAVY = { neg: 'text-[#fca5a5]', pos: 'text-[#86efac]' };
/** Fundo OPACO da faixa do dia: 12 % de primary sobre o cartão (sticky pede opaco — `bg-primary/12` deixaria a linha passar por baixo). */
const FUNDO_DIA = 'bg-[color-mix(in_srgb,hsl(var(--primary))_12%,hsl(var(--card)))]';
const FUNDO_VENCIDOS = 'bg-[color-mix(in_srgb,#b91c1c_9%,hsl(var(--card)))]';
const FUNDO_SALDO_NEGATIVO = 'bg-[color-mix(in_srgb,#b91c1c_16%,hsl(var(--card)))]';
const MOTIVO_SALDO_DOIS_LADOS = 'saldo considera a pagar e a receber';
const MOTIVO_ANTERIORES = 'vencimento em mês já conciliado: abra o lançamento e atualize a data para entrar no saldo';

/**
 * AS TRÊS EXCEÇÕES AO PISO DE 10px DESTA TELA — autorizadas nominalmente, PR-CPR-2A.3.2.
 *
 * O piso da lista é 10px (2A.3.1) e continua valendo para todo o resto. Estas três descem, e
 * cada uma tem motivo próprio:
 *
 *   `doc`     8px — é um NÚMERO de conferência, não texto de leitura corrida. Só 46 dos 1.144
 *                   lançamentos visíveis têm um, e ele existe para bater com o papel na mão,
 *                   não para ser lido varrendo a lista.
 *   `status`  9px — "Programado" é a palavra mais longa do vocabulário e em 10px não cabia na
 *                   coluna sem virar "Program…". Truncar um estado é pior que reduzi-lo: meia
 *                   palavra não diz em que etapa o lançamento está.
 *   `quando`  9px — o "em 17 dias" da faixa é o SUFIXO do rótulo do dia, não o rótulo. Mantê-lo
 *                   em 11px fazia a contagem competir com a data, que é o que identifica o
 *                   grupo. O dia e a data continuam em 11px.
 *
 * ⚠ NENHUMA OUTRA CÉLULA DESCE. Se algo novo não couber em 10px, a saída é a largura da
 * coluna, nunca a fonte — e se a largura não houver, reporta-se.
 */
/** CPR-CONTA-01: quantas contas a faixa do resumo desenha antes do "+N" — MEDIDO a 1.126px (ver CLAUDE.md). */
const MAX_CONTAS_NA_FAIXA = 4;
const FONTE_STATUS = 'text-[9px]';
/** Subcentro, Safra, Faz. e datas: 9,5px (o piso global) — CPR-SALDO-DIA-01. */
const FONTE_FINA = 'text-[9.5px]';
const FONTE_QUANDO = 'text-[9px]';


/**
 * Quantos meses para trás procurar a âncora conciliada de cada conta.
 *
 * ⚠ SEIS, E O NÚMERO FOI MEDIDO: nesta janela o cliente mais pesado (NJ) tem 3.155 realizados,
 * que cabem em quatro levas do PostgREST, e as 20 contas de todos os clientes do proto acharam
 * âncora dentro dela. Uma janela maior tornaria o card caro para atender a um caso que não
 * existe; uma menor deixaria conta sem âncora — e conta sem âncora fica FORA do total.
 */
const MESES_BUSCA_ANCORA = 6;

/** O `YYYY-MM` deslocado de N meses a partir de hoje. */
export function mesRelativoAoHoje(hoje: Date, deslocamento: number): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** O `YYYY-MM` de N meses atrás — o piso da busca pela âncora. */
function mesDeCorte(hoje: Date, meses: number): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Datas — tudo em horário LOCAL, nunca em UTC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ `toISOString()` NÃO SERVE AQUI. Ele converte para UTC, e a três horas de fuso o "hoje"
 * do Brasil vira "amanhã" depois das 21h — a janela inteira anda um dia, e o operador vê a
 * lista mudar à noite sem nada ter mudado. As datas do banco são `date` (sem fuso), então
 * a comparação tem de nascer local.
 */
function isoLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function hojeLocal(): Date {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

/** Dias entre duas datas locais (positivo = no futuro). */
function diasAte(iso: string, hoje: Date): number {
  const alvo = parseISO(iso);
  const base = new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate());
  return Math.round((base.getTime() - hoje.getTime()) / 86_400_000);
}

/**
 * A faixa que encabeça cada grupo, em DUAS partes: "Sexta · 19 set" e "em 3 dias".
 *
 * ⚠ SEPARADAS PORQUE TÊM TAMANHOS DIFERENTES — PR-CPR-2A.3.2. O dia e a data identificam o
 * grupo e ficam em 11px; a contagem é contexto e vai a 9px. Numa string só, reduzir o sufixo
 * exigiria recortá-lo no JSX por índice — que quebra no dia em que o texto mudar de forma.
 * ⚠ E A PRIMEIRA LETRA SOBE AQUI, não no CSS. `format` do date-fns devolve "sexta" minúsculo, e
 * o `capitalize` do CSS agiria sobre CADA palavra do elemento; a faixa tem três ("sexta · 19
 * set"), e "19 Set" não é o que se quer.
 */
function faixaDaData(iso: string, hoje: Date): { dia: string; quando: string } {
  const d = parseISO(iso);
  const cru = format(d, "EEEE · dd MMM", { locale: ptBR });
  const dia = cru.charAt(0).toUpperCase() + cru.slice(1);
  const n = diasAte(iso, hoje);
  const quando = n === 0 ? 'hoje'
    : n === 1 ? 'amanhã'
    : n === -1 ? 'ontem'
    : n > 0 ? `em ${n} dias`
    : `vencido há ${Math.abs(n)} dias`;
  return { dia, quando };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tela
// ─────────────────────────────────────────────────────────────────────────────

interface Grupo {
  chave: string;
  /** CPR-SALDO-DIA-01: os dois subgrupos de vencidos, o intervalo "entre hoje e de", os dias do período, e "Sem vencimento". */
  tipo: 'vencidos_contam' | 'vencidos_anteriores' | 'entre' | 'dia' | 'sem_vencimento';
  titulo: string;
  /** O sufixo de contagem ("em 3 dias"). Vazio fora dos dias. */
  quando: string;
  dica?: string;
  /** As linhas LISTADAS (o segmento governa a listagem). */
  linhas: LinhaViewDoc[];
  /** Totais das contas EM ABERTO do grupo, dos DOIS lados (o saldo é da conta, não do segmento). */
  pagar: number;
  receber: number;
  /** O saldo depois do grupo; `undefined` = o grupo não tem saldo (anteriores, sem vencimento); `null` = não há saldo em caixa. */
  saldo: number | null | undefined;
}

export function ContasPagarReceberTab({ onIntensiveToggle }: {
  /** CPR-SALDO-DIA-01: o MESMO mecanismo do "Ampliar" da lista de Lançamentos — o shell esconde a lateral. */
  onIntensiveToggle?: (ativo: boolean) => void;
} = {}) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { fazendaAtual, fazendas } = useFazenda();
  const fazScope = fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null;
  const queryClient = useQueryClient();
  const fin = useFinanceiroV2();

  const [visao, setVisao] = useState<Visao>('lista');
  /* CPR-PERIODO-VENCIDOS-01 — UM PERÍODO, igual nas duas visões. O atalho dá as datas; editar uma data vira "Escolher datas".
     30 dias segue o default (PR-CPR-2B.3.6). Os vencidos ficam à parte, atrás da caixa "Incluir vencidos" (ligada). */
  const [atalho, setAtalho] = useState<AtalhoCpr>('30');
  const [datas, setDatas] = useState<PeriodoCpr | null>(null);
  const [incluirVencidos, setIncluirVencidos] = useState(true);
  /* CPR-CONTA-01 — o filtro de conta: `null` = todas; um id; ou `SEM_CONTA`. Trocar de cliente volta a "Todas". */
  const [contaSel, setContaSel] = useState<FiltroContaCpr>(null);
  useEffect(() => { setContaSel(null); }, [clienteId]);
  const [segmento, setSegmento] = useState<Segmento>('pagar');
  const [statusLigados, setStatusLigados] = useState<string[]>(STATUS_INICIAIS);
  const [lancEdicao, setLancEdicao] = useState<LancamentoV2 | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  /* Ampliar/Recolher — estado LOCAL; sair da tela desliga (o shell volta a mostrar a lateral). */
  const [ampliado, setAmpliado] = useState(false);
  useEffect(() => { onIntensiveToggle?.(ampliado); }, [ampliado, onIntensiveToggle]);
  useEffect(() => () => { onIntensiveToggle?.(false); }, [onIntensiveToggle]);
  const regua = ampliado ? REGUA_AMPLIADA : REGUA_NORMAL;

  /**
   * ⚠ OS CATÁLOGOS CARREGAM COM A TELA, NÃO COM O CLIQUE — a lição está escrita em
   * `ExtratoGerencialTab:120-129`: sem `fornecedores`/`contas`/`safras`/`classificacoes` o
   * `LancamentoV2Dialog` abre com os selects em branco e o Salvar grava nulo por cima do que
   * havia. Lista vazia é lista válida — nenhum tipo acusa, e o estrago só aparece depois.
   * ⚠ O SINAL É "AS QUATRO CARGAS TERMINARAM", NUNCA "os arrays têm conteúdo". Medir por
   * `length > 0` travaria para sempre a tela de um cliente que legitimamente ainda não tem
   * fornecedor cadastrado — e "vazio porque acabou de carregar" e "vazio porque não existe"
   * são exatamente as duas coisas que este guarda precisa distinguir.
   */
  const [catalogosProntos, setCatalogosProntos] = useState(false);
  useEffect(() => {
    let vivo = true;
    setCatalogosProntos(false);
    void Promise.all([
      fin.loadContas(), fin.loadClassificacoes(), fin.loadFornecedores(), fin.loadSafras(),
    ]).then(() => { if (vivo) setCatalogosProntos(true); });
    return () => { vivo = false; };
  }, [fin.loadContas, fin.loadClassificacoes, fin.loadFornecedores, fin.loadSafras]);

  /* CPR-SALDO-DIA-01 (G): o Fluxo NÃO força mais "Ambos" ao entrar. A única razão era proteger a linha de saldo, que seguia o
     segmento; agora o saldo do gráfico é SEMPRE dos dois lados (a série do dono) e o segmento só decide as barras. */

  const hoje = useMemo(() => hojeLocal(), []);
  const hojeIso = useMemo(() => isoLocal(hoje), [hoje]);
  const periodo = useMemo<PeriodoCpr>(
    () => (atalho === 'datas' && datas ? datas : periodoDoAtalho(atalho === 'datas' ? '30' : atalho, hojeIso)),
    [atalho, datas, hojeIso]);
  /* editar "de" ou "até" parte das datas que estão na tela e passa a "Escolher datas"; campo esvaziado não muda nada */
  const editarData = (campo: 'de' | 'ate', v: string) => {
    if (!v) return;
    setDatas({ ...periodo, [campo]: v });
    setAtalho('datas');
  };
  const escolherAtalho = (a: AtalhoCpr) => { if (a === 'datas') setDatas(periodo); setAtalho(a); };

  // ── Leitura ────────────────────────────────────────────────────────────────
  /**
   * ⚠ UMA CONSULTA SERVE OS TRÊS SEGMENTOS E OS DOIS NÚMEROS DO TOPO. O recorte por
   * pagar/receber acontece em memória, e não na ida: o card "A receber" tem de mostrar o
   * seu total mesmo com o segmento em "A Pagar". Filtrar por segmento no servidor obrigaria
   * a duas consultas para pintar a mesma barra.
   */
  const { data: linhas = [], isFetching } = useQuery({
    /* ⚠ SEM A VISÃO NA CHAVE: Lista e Fluxo leem a MESMA busca (período ∪ vencidos em aberto ∪ sem vencimento). */
    queryKey: ['cpr-lancs', clienteId, fazScope, periodo.de, periodo.ate, statusLigados.join(','), hojeIso],
    enabled: !!clienteId && statusLigados.length > 0,
    queryFn: async (): Promise<LinhaViewDoc[]> => {
      if (!clienteId) return [];
      const plano = montarPlanoBaseV2(
        clienteId,
        fazScope ? { fazenda_id: fazScope } : {},
        { relacao: 'view', semRecorteTemporal: true },
      );
      const ramo = ramoDaConsultaCpr(periodo, hojeIso);
      return paginarTudo<LinhaViewDoc>(async (de, tamanho) => {
        let q = aplicarPlanoNaView(fin.abrirView('*'), plano)
          .in('status_transacao', statusLigados)
          /* Transferência não é conta a pagar nem a receber: é dinheiro trocando de bolso.
             São DUAS grafias no banco ('3-Transferência' e '3-Transferências'), então o
             corte é pelo prefixo — igualdade deixaria as seis linhas do singular passarem. */
          .or('tipo_operacao.not.like.3-*')
          /* OC-VENDA-ENTREGAS-01b (D3): sem caixa nao e' conta a pagar nem a receber — a entrega da conta corrente, o
             barter e o consumo nascem `realizado` sem conta e sem dinheiro. Sai SEMPRE, inclusive com o filtro
             Realizado ligado. NULL conta como caixa, como na lista. */
          .or('sem_movimentacao_caixa.is.null,sem_movimentacao_caixa.eq.false');
        if (ramo) q = q.or(ramo);
        const { data, error } = await q
          .order('data_vencimento', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })
          .range(de, de + tamanho - 1);
        if (error) throw error;
        const leva = data ?? [];
        return { linhas: leva, brutas: leva.length };
      });
    },
  });

  // ── Saldo em caixa ─────────────────────────────────────────────────────────
  /**
   * ⚠ QUEM ENTRA NO CAIXA É `grupoDoTipoConta`, e a lista é BRANCA: corrente é disponível,
   * investimento e PERMUTA são aplicado, cartão e tipo desconhecido ficam fora. A permuta
   * entrou em PR-CPR-2A.2 — é dinheiro que se transfere para conta corrente, só não é dinheiro
   * livre. A régua mora na lib, não aqui, porque a tela não é lugar de decidir o que é caixa.
   *
   * ⚠ A SOMA MUDOU DE REGRA EM PR-CPR-2A.1, e o card antigo era um número fantasma: ele pegava
   * o MAIOR `ano_mes` de cada conta, e como as contas fecham em meses diferentes a soma
   * misturava competências. Na Vera dava R$ 462.109,65 — Itaú Personalite de setembro com Itaú
   * CDI de AGOSTO, quando o CDI já havia caído 205 mil em setembro. Agora cada conta parte do
   * último mês que CONCILIA e soma os realizados desde aquela posição: R$ 198.299,74, o mesmo
   * que a Conciliação mostra. Quem decide é `estimarSaldoEmCaixa`, que é puro e testado.
   */
  const { data: caixaTodas } = useQuery({
    queryKey: ['cpr-caixa', clienteId, isoLocal(hoje)],
    enabled: !!clienteId,
    queryFn: async (): Promise<(SaldoEmCaixa & { passado: SeriePassado; argumentos: Parameters<typeof estimarSaldoEmCaixa>[0] }) | null> => {
      if (!clienteId) return null;
      const { data: contasRaw } = await supabase
        .from('financeiro_contas_bancarias')
        .select('id, nome_conta, nome_exibicao, tipo_conta')
        .eq('cliente_id', clienteId)
        .eq('ativa', true);
      const doCaixa = (contasRaw ?? []).filter((c) => grupoDoTipoConta(c.tipo_conta) !== 'fora');
      if (doCaixa.length === 0) return null;

      /**
       * O acumulado de sempre das contas SEM extrato — só para a nota "a conferir".
       *
       * ⚠ UMA CONSULTA A MAIS, E SÓ PARA A PERMUTA: é a única conta sem extrato do proto (69
       * lançamentos). Ela NÃO entra no total — quem manda no número é o saldo declarado, o
       * mesmo que a tela de Saldos mostra. O que ela responde é se esse declarado explica a
       * conta: a permuta do NJ declara R$ 0,00 em ago/2026 e carrega R$ 264.875,89 de barter
       * entre 2023 e 2026. Sem esta pergunta, essa diferença ficaria invisível.
       */
      const idsSemExtrato = doCaixa.filter((c) => contaSemExtrato(c.tipo_conta)).map((c) => c.id);
      const acumulado = new Map<string, number>();
      if (idsSemExtrato.length > 0) {
        const historico = await paginarTudo<LinhaDaPosicao>(async (de, tamanho) => {
          const { data, error } = await supabase
            .from('financeiro_lancamentos_v2')
            .select('valor, sinal, tipo_operacao, data_pagamento, conta_bancaria_id, conta_destino_id')
            .eq('cliente_id', clienteId)
            .eq('cancelado', false)
            .eq('cenario', 'realizado')
            /* A mesma régua da consulta principal — ver a nota longa abaixo. Aqui o filtro é
               comprovadamente NEUTRO (as 69 linhas da permuta do NJ são todas `realizado`, e o
               acumulado segue 264.875,89); entra para as duas consultas não divergirem no dia
               em que alguém lançar uma permuta programada. */
            .eq('status_transacao', 'realizado')
            .or(`conta_bancaria_id.in.(${idsSemExtrato.join(',')}),`
              + `conta_destino_id.in.(${idsSemExtrato.join(',')})`)
            .order('id', { ascending: true })
            .range(de, de + tamanho - 1);
          if (error) throw error;
          const leva = data ?? [];
          return { linhas: leva, brutas: leva.length };
        });
        for (const id of idsSemExtrato) {
          acumulado.set(id, historico.reduce((soma, l) => soma + movimentoNaConta(l, id), 0));
        }
      }

      const contas: ContaEmCaixa[] = doCaixa.map((c) => ({
        id: c.id,
        nome: c.nome_exibicao || c.nome_conta || 'Conta sem nome',
        tipo: c.tipo_conta,
        acumuladoRealizados: acumulado.get(c.id) ?? null,
      }));

      const mesMinimo = mesDeCorte(hoje, MESES_BUSCA_ANCORA);

      const { data: saldos } = await supabase
        .from('financeiro_saldos_bancarios_v2')
        .select('conta_bancaria_id, ano_mes, saldo_inicial, saldo_final, saldo_data')
        .eq('cliente_id', clienteId)
        .gte('ano_mes', mesMinimo);

      /* Os realizados desde o primeiro mês candidato. `paginarTudo` porque o teto de mil do
         PostgREST não avisa: o NJ tem 3.155 linhas nesta janela, e uma soma silenciosamente
         truncada é o pior defeito possível num card de saldo. */
      const linhas = await paginarTudo<LinhaDaPosicao>(async (de, tamanho) => {
        const { data, error } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('valor, sinal, tipo_operacao, data_pagamento, conta_bancaria_id, conta_destino_id')
          .eq('cliente_id', clienteId)
          .eq('cancelado', false)
          .eq('cenario', 'realizado')
          /**
           * ⚠ `status_transacao = 'realizado'` TAMBÉM — PR-CPR-2B.3.4, e é correção de SSoT.
           * `cenario` e `status_transacao` são eixos diferentes: o primeiro separa realidade de
           * planejamento, o segundo diz se a obrigação ACONTECEU. Existe linha com
           * `cenario='realizado'` e `status='programado'` — planejada como real, mas não paga —
           * e ela vinha para cá como se tivesse saído da conta.
           * ⚠ ISSO FAZIA O CARD DISCORDAR DA TELA DE CONCILIAÇÃO, que sempre filtrou os dois
           * (`ConciliacaoBancariaTab`: `.eq('status_transacao','realizado').eq('cenario',
           * 'realizado')`). No NJ era UMA linha — "Revisão Hilux 6/6", R$ 859,84, saída da
           * Caixa Carlos em 10/08, `programado`: ela sozinha impedia agosto de fechar naquela
           * conta, arrastava o "conciliado até" do cliente inteiro de 31/08 para 31/07 e
           * trocava o saldo âncora por um roll-forward de julho.
           * ⚠ MEDIDO EM 19/09/2026: 2 linhas no NJ e 5 no Teste Cliente em seis meses; Vera,
           * Santa Rita, Agnaldo e RRCC têm ZERO. Só o card do NJ muda — 1.832.544,83 →
           * 1.833.404,67, que é o número que a Conciliação já mostrava.
           */
          .eq('status_transacao', 'realizado')
          .gte('data_pagamento', `${mesMinimo}-01`)
          .lte('data_pagamento', isoLocal(hoje))
          .order('id', { ascending: true })
          .range(de, de + tamanho - 1);
        if (error) throw error;
        const leva = data ?? [];
        return { linhas: leva, brutas: leva.length };
      });

      /**
       * ⚠ A SÉRIE DO PASSADO SAI DAQUI, e não de uma consulta própria — PR-CPR-2B.3. Esta
       * query já tem as três coisas de que ela precisa (contas, saldos e os realizados dos
       * últimos seis meses), e é justamente por partilhar a MESMA entrada que a linha do
       * gráfico fecha no número do card. Buscar de novo abriria a porta para os dois
       * divergirem por um filtro de diferença.
       */
      const argumentos = {
        contas, saldos: saldos ?? [], linhas, hoje: isoLocal(hoje), mesMinimo,
      };
      const card = estimarSaldoEmCaixa(argumentos);
      return {
        ...card,
        /* CPR-CONTA-01: a ENTRADA do cálculo viaja junto — o saldo de UMA conta é a mesma função sobre a mesma entrada. */
        argumentos,
        /* A fronteira do verde é o MESMO "conciliado até" que o rótulo do card mostra — uma
           regra, dois lugares. */
        passado: serieDoSaldoPassado({ ...argumentos, conciliadoAte: card.ancoraMaisAtrasada }),
      };
    },
  });

  /**
   * CPR-CONTA-01 — O SALDO EM CAIXA DE UMA CONTA É O MESMO CÁLCULO, com a lista de contas reduzida àquela: `estimarSaldoEmCaixa`
   * e `serieDoSaldoPassado` já recebem as contas por parâmetro (âncora + movimentos, conta a conta). Nenhuma regra nova, nenhuma
   * consulta nova. Em "Todas" e em "Sem conta definida" vale o total — e o rótulo do cartão DIZ "todas as contas".
   */
  const caixaDeUmaConta = contaSel != null && contaSel !== SEM_CONTA;
  const caixa = useMemo(() => {
    if (!caixaTodas || !caixaDeUmaConta) return caixaTodas;
    const args = { ...caixaTodas.argumentos, contas: caixaTodas.argumentos.contas.filter((c) => c.id === contaSel) };
    const card = estimarSaldoEmCaixa(args);
    return { ...card, argumentos: caixaTodas.argumentos, passado: serieDoSaldoPassado({ ...args, conciliadoAte: card.ancoraMaisAtrasada }) };
  }, [caixaTodas, caixaDeUmaConta, contaSel]);

  /**
   * O rótulo do caixa — calmo. Divergência é informação, não alarme.
   *
   * ⚠ A DATA É O ELO FRACO, e é por isso que ela não é "a data de hoje" nem "o mês de
   * referência": com contas conferidas em datas diferentes, o número inteiro só é tão confiável
   * quanto a conta mais atrasada. Dizer "conciliado até 31/ago" quando uma conta fechou em
   * 17/09 é a leitura conservadora, e é a única que não promete mais do que se sabe.
   * ⚠ NÃO VEM DE `financeiro_conciliacoes`: a tabela está VAZIA (0 linhas, todos os clientes,
   * medido em 19/09/2026). Vem de onde a Conciliação de fato decide — o saldo declarado que
   * FECHA na sua posição, pela mesma `saldoConfere` de tolerância zero.
   * ⚠ E QUANDO TUDO ESTÁ EM DIA o aviso SOME: sobra só "conciliado até DD/mmm". Um alerta que
   * nunca desliga deixa de ser lido.
   */
  const rotuloCaixa = useMemo(() => {
    if (!caixa || !caixa.ancoraMaisAtrasada) return null;
    const ate = `conciliado até ${format(parseISO(caixa.ancoraMaisAtrasada), 'dd/MMM', { locale: ptBR })}`;
    const partes = [ate];
    /* "Inclui <mês> não conciliado" só quando o elo fraco ficou para trás do mês corrente —
       é literalmente o período que o roll-forward está estimando. */
    const mesDoElo = caixa.ancoraMaisAtrasada.slice(0, 7);
    const mesCorrente = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    if (mesDoElo < mesCorrente) {
      partes.push(`inclui ${format(hoje, 'MMMM', { locale: ptBR })} não conciliado`);
    }
    /* A conta que ficou de fora é NOMEADA. Um total silenciosamente incompleto é pior que um
       total menor e declarado. */
    if (caixa.semAncora.length > 0) {
      partes.push(caixa.semAncora.length === 1
        ? `${caixa.semAncora[0]} sem saldo conferido, fora da soma`
        : `${caixa.semAncora.length} contas sem saldo conferido, fora da soma`);
    }
    return partes.join(' · ');
  }, [caixa, hoje]);

  /**
   * AS DUAS LINHAS DO CARD, uma por natureza — PR-CPR-SALDO-NATUREZA-01.
   *
   * ⚠ A CORRENTE MOSTRA DATA, O INVESTIMENTO MOSTRA REGRA. A corrente confere contra o extrato
   * do dia, então "conciliado DD/MM" responde exatamente o que se quer saber dela. O
   * investimento não tem extrato diário: o banco calcula o rendimento no fechamento, e no meio
   * do mês o saldo é base mais aplicações menos resgates, SEM rendimento. Isso não é atraso, é
   * a natureza do produto — e uma data ali faria parecer defeito o que é o normal.
   * ⚠ A LINHA SOME QUANDO A NATUREZA NÃO EXISTE. Um cliente sem investimento não precisa ler
   * "R$ 0,00 sem rendimento"; zero de uma coisa que não há é ruído, não informação.
   * ⚠ "INVESTIDO" INCLUI A PERMUTA, herdado do agrupamento da 2A.2 (`grupoDoTipoConta` manda
   * `inv` e `permuta` para o mesmo lado). Hoje é inofensivo — a única permuta do proto declara
   * R$ 0,00 —, mas se ela um dia carregar valor o rótulo estará estreito para o que soma.
   * Registrado; separá-la é frente própria.
   */
  const naturezasDoCaixa = useMemo(() => {
    if (!caixa || caixa.ancoradas === 0) return undefined;
    const linhas: { rotulo: string; valor: string; detalhe: string; aConferir?: string[] }[] = [];
    if (caixa.contasCorrente > 0) {
      linhas.push({
        rotulo: 'Corrente',
        valor: formatMoeda(caixa.disponivel),
        detalhe: caixa.conciliadoCorrenteAte
          ? `conciliado ${format(parseISO(caixa.conciliadoCorrenteAte), 'dd/MM')}`
          : 'sem conciliação',
      });
    }
    if (caixa.contasAplicado > 0) {
      linhas.push({
        rotulo: 'Investido',
        valor: formatMoeda(caixa.aplicado),
        detalhe: 'saldo sem rendimento · fecha no fim do mês',
        aConferir: caixa.aConferir,
      });
    }
    return linhas;
  }, [caixa]);

  // ── Recortes em memória ────────────────────────────────────────────────────
  /* CPR-PERIODO-VENCIDOS-01 — baldes, cartões e total saem do DONO (`recortarCpr`), dos mesmos dados nas duas visões. */
  const ehReceber = ehReceberCpr;
  /* CPR-SALDO-DIA-01 (D2): a âncora de CADA conta, LIDA do cartão Caixa (a data que o cálculo dele usou) — nenhuma consulta nova. */
  const ancoras = useMemo(() => (caixaTodas ? ancorasDoCaixaCpr(caixaTodas.ancoraPorConta) : undefined), [caixaTodas]);
  const recorte = useMemo(
    () => recortarCpr(linhas, { periodo, hoje: hojeIso, incluirVencidos, conta: contaSel, ancoras }),
    [linhas, periodo, hojeIso, incluirVencidos, contaSel, ancoras]);
  /* A SÉRIE DO SALDO — do dono, a partir do MESMO número do cartão Caixa. A caixa "Incluir vencidos" não entra nela (D3). */
  const serie = useMemo(
    () => serieDoSaldoCpr(recorte, caixa && caixa.ancoradas > 0 ? caixa.total : null),
    [recorte, caixa]);
  /* o resumo por conta (opções do seletor e a faixa): do MESMO dono, sobre os MESMOS dados, sempre de TODAS as contas */
  const recorteDeTodas = useMemo(
    () => (contaSel == null ? recorte : recortarCpr(linhas, { periodo, hoje: hojeIso, incluirVencidos, ancoras })),
    [recorte, contaSel, linhas, periodo, hojeIso, incluirVencidos, ancoras]);
  const resumoContas = useMemo(
    () => resumoPorContaCpr(linhas, { periodo, hoje: hojeIso, incluirVencidos }),
    [linhas, periodo, hojeIso, incluirVencidos]);
  /* a faixa só desenha conta com a pagar > 0 (do dono); o seletor segue com todas */
  const contasNaFaixa = useMemo(() => contasDaFaixaCpr(resumoContas), [resumoContas]);
  /* o que a lista desenha por dia: o período em aberto + as pagas do período (pílula Realizado), que nunca somam */
  const doPeriodoNaLista = useMemo(
    () => [...recorte.periodoSoma.linhas, ...recorte.pagas].filter((l) => doSegmentoCpr(l, segmento)),
    [recorte, segmento]);
  /* o que o gráfico desenha: EXATAMENTE as contas em aberto que a série do saldo soma (vencidos que contam + entre hoje e "de" +
     período), dos DOIS lados, em qualquer segmento — o saldo é da conta. O segmento vai à parte e só decide as barras (G). */
  const doFluxo = useMemo(() => linhasDoSaldoCpr(recorte), [recorte]);

  /**
   * Os grupos de vencimento.
   *
   * ⚠ "SEM VENCIMENTO" VAI PARA O FIM, e vai SEMPRE — ele é o grupo que não pode faltar. A
   * chave de ordenação usa `'9999-99-99'` para que ele caia depois de qualquer data real
   * sem um segundo critério de ordenação por perto.
   */
  /**
   * Os NOMES dos favorecidos — hook existente, não consulta nova escrita aqui.
   *
   * ⚠ UUID NUNCA VAI À TELA, e a view só traz `favorecido_id`. O `useNomesDeFornecedores` já
   * resolve isso em levas (o `.in()` do PostgREST tem teto) e com uma `queryKey` que não
   * serializa o array a cada render. Escrever a consulta aqui seria a terceira cópia da mesma.
   */
  const nomesFornecedores = useNomesDeFornecedores(useMemo(
    () => linhas.map((l) => l.favorecido_id), [linhas]));

  /**
   * Quais lançamentos TÊM documento anexado.
   *
   * ⚠ A VIEW DA LISTA NÃO SABE DISSO — medido: `vw_financeiro_lancamentos_v2_doc` tem
   * `documento`, `numero_documento`, `tipo_documento` e `documento_formatado`, e os quatro são
   * o NÚMERO da nota, não um anexo. O anexo mora em `vw_lancamento_documentos`, a mesma fonte
   * que o modal já lê.
   * ⚠ E O CUSTO É MÍNIMO, por isso entrou sem virar item próprio: são 351 documentos em todo o
   * proto, 111 lançamentos distintos, e a pergunta é um `.in()` sobre os ids JÁ visíveis — o
   * mesmo padrão do mapa de conciliação do Extrato Gerencial. Nenhum join novo.
   */
  const idsVisiveis = useMemo(() => linhas.map((l) => l.id).sort(), [linhas]);
  const { data: comAnexo } = useQuery({
    queryKey: ['cpr-anexos', clienteId, idsVisiveis.length, idsVisiveis[0] ?? ''],
    enabled: !!clienteId && idsVisiveis.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      const achados = await paginarTudo<{ lancamento_id: string | null }>(async (de, tamanho) => {
        const fatia = idsVisiveis.slice(de, de + tamanho);
        if (fatia.length === 0) return { linhas: [], brutas: 0 };
        const { data, error } = await supabase
          .from('vw_lancamento_documentos')
          .select('lancamento_id')
          .eq('cliente_id', clienteId ?? '')
          .in('lancamento_id', fatia);
        if (error) throw error;
        return { linhas: data ?? [], brutas: fatia.length };
      });
      return new Set(achados.map((d) => d.lancamento_id).filter((v): v is string => !!v));
    },
  });

  const grupos = useMemo((): Grupo[] => {
    const doSeg = (ls: readonly LinhaViewDoc[]) => ls.filter((l) => doSegmentoCpr(l, segmento));
    const mapa = new Map<string, LinhaViewDoc[]>();
    for (const l of doPeriodoNaLista) {
      const chave = (l.data_vencimento ?? '').slice(0, 10);
      const atual = mapa.get(chave);
      if (atual) atual.push(l); else mapa.set(chave, [l]);
    }
    /* TODO DIA DA SÉRIE TEM LINHA DE FECHAMENTO, mesmo sem conta listada no segmento: é ela que faz a coluna Saldo fechar
       (anterior − a pagar + a receber). Dia só com contas PAGAS repete o saldo anterior: paga aparece e não soma. */
    const passos = new Map(serie.dias.map((d) => [d.data, d]));
    let corrente = (serie.entreHojeEDe ?? serie.partida).saldo;
    const chaves = Array.from(new Set([...mapa.keys(), ...passos.keys()])).sort();
    const dias: Grupo[] = chaves.map((chave) => {
      const faixa = faixaDaData(chave, hoje);
      const p = passos.get(chave);
      if (p) corrente = p.saldo;
      return {
        chave, tipo: 'dia', titulo: faixa.dia, quando: faixa.quando, linhas: mapa.get(chave) ?? [],
        pagar: p?.pagar.valor ?? 0, receber: p?.receber.valor ?? 0, saldo: corrente,
      };
    });
    const topo: Grupo[] = [];
    if (incluirVencidos) {
      const { contam, anteriores, diasDaMaisAntiga } = recorte.vencidos;
      const nContam = contam.pagar.contas + contam.receber.contas;
      if (nContam > 0) topo.push({
        chave: 'vencidos-contam', tipo: 'vencidos_contam', quando: '',
        titulo: `Vencidos · ${contas(nContam)} · contam no saldo`,
        dica: `vencimento posterior à última conciliação da conta: saem (ou entram) hoje${diasDaMaisAntiga != null ? ` · mais antiga do cartão Vencidos há ${diasDaMaisAntiga} dias` : ''}`,
        linhas: doSeg(contam.linhas), pagar: contam.pagar.valor, receber: contam.receber.valor, saldo: serie.partida.saldo,
      });
      const nAnt = anteriores.pagar.contas + anteriores.receber.contas;
      if (nAnt > 0) {
        const ancoraDaEscolhida = contaSel != null && contaSel !== SEM_CONTA ? ancoras?.get(contaSel) : undefined;
        const de = contaSel == null ? 'anteriores à conciliação de cada conta'
          : ancoraDaEscolhida ? `anteriores à conciliação de ${format(parseISO(ancoraDaEscolhida), 'dd/MM')}`
          : contaSel === SEM_CONTA ? 'sem conta definida' : 'de conta sem saldo conferido';
        topo.push({
          chave: 'vencidos-anteriores', tipo: 'vencidos_anteriores', quando: '', dica: MOTIVO_ANTERIORES,
          titulo: `Vencidos ${de} · ${contas(nAnt)} · fora do saldo`,
          linhas: doSeg(anteriores.linhas), pagar: anteriores.pagar.valor, receber: anteriores.receber.valor, saldo: undefined,
        });
      }
    }
    if (serie.entreHojeEDe) topo.push({
      chave: 'entre', tipo: 'entre', quando: '', linhas: [],
      titulo: `Entre hoje e ${format(parseISO(periodo.de), 'dd/MM')} · ${contas(recorte.antesDoPeriodo.pagar.contas + recorte.antesDoPeriodo.receber.contas)}`,
      dica: 'contas em aberto que vencem antes do período: passam pelo saldo, não são listadas',
      pagar: serie.entreHojeEDe.pagar.valor, receber: serie.entreHojeEDe.receber.valor, saldo: serie.entreHojeEDe.saldo,
    });
    const sv = recorte.semVencimento;
    const fim: Grupo[] = sv.linhas.length === 0 ? [] : [{
      chave: 'sem-vencimento', tipo: 'sem_vencimento', quando: '', dica: 'sem data de vencimento: fora dos cartões e do saldo',
      titulo: `Sem vencimento · ${contas(sv.pagar.contas + sv.receber.contas)} · fora do saldo`,
      linhas: doSeg(sv.linhas), pagar: sv.pagar.valor, receber: sv.receber.valor, saldo: undefined,
    }];
    return [...topo, ...dias, ...fim];
  }, [doPeriodoNaLista, recorte, serie, segmento, incluirVencidos, contaSel, ancoras, periodo.de, hoje]);

  // ── Abrir o lançamento ─────────────────────────────────────────────────────
  /**
   * ⚠ A LINHA VEM DA TABELA, NÃO DA VIEW. O `LancamentoV2Dialog` não abre por id: ele pede a
   * linha inteira (`LancamentoV2`), e a view tem projeção própria — montar o modal com ela
   * entregaria um objeto parecido e incompleto. `buscarLancamentoPorId` é o mesmo
   * `select('*').eq('id',…)` que o Extrato Gerencial faz, já dentro do hook.
   */
  const abrir = async (id: string) => {
    if (!catalogosProntos) return;
    setAbrindo(true);
    try {
      const linha = await fin.buscarLancamentoPorId(id);
      if (linha) setLancEdicao(linha);
    } finally {
      setAbrindo(false);
    }
  };

  /**
   * Invalidar o que esta tela mostra — as TRÊS consultas, não só a lista.
   *
   * ⚠ O SALDO EM CAIXA MUDA quando um REALIZADO é cancelado: ele entra no roll-forward da
   * conta. Invalidar só `cpr-lancs` deixaria o topo afirmando um caixa que o próprio gesto
   * acabou de desfazer — e o operador não tem como saber que precisa de F5.
   * ⚠ E `cpr-anexos` vai junto porque a chave dela é o conjunto de ids visíveis; sem
   * invalidar, o clipe de uma linha que saiu continuaria no cache.
   */
  const invalidarTela = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['cpr-lancs'] }),
      queryClient.invalidateQueries({ queryKey: ['cpr-caixa'] }),
      queryClient.invalidateQueries({ queryKey: ['cpr-anexos'] }),
    ]);
  };

  /**
   * Cancelar — pela RPC, nunca por UPDATE.
   *
   * ⚠ `fn_cancelar_lancamento_auditoria` NÃO É SÓ UM `cancelado = true`: ela desfaz o vínculo
   * de conciliação e recalcula o status do extrato. Um UPDATE cru deixaria o item do extrato
   * apontando para um lançamento que não existe mais para a tela, e o mês continuaria dizendo
   * "conciliado" contra um saldo que mudou.
   * ⚠ O MOTIVO VAI SEMPRE PREENCHIDO. O default da RPC é `'duplicado_auditoria'`, então omitir
   * o argumento grava esse motivo em todo cancelamento — inclusive nos que não são duplicidade.
   * Quem coleta o texto é a confirmação do modal.
   * ⚠ E O ERRO DO BANCO VAI CRU PARA O TOAST: o guard do zoo devolve P0001 com uma frase que
   * nomeia o invariante ("Altere pelo Financeiro Oficial"), mais precisa que qualquer texto
   * nosso. Mesma decisão do `useConciliarMes`.
   */
  const cancelarLancamento = async (id: string, motivo?: string): Promise<boolean> => {
    const { error } = await supabase.rpc('fn_cancelar_lancamento_auditoria', {
      p_lancamento_id: id,
      ...(motivo ? { p_motivo: motivo } : {}),
    });
    if (error) {
      toast.error(error.message || 'Não foi possível cancelar o lançamento.');
      return false;
    }
    await invalidarTela();
    toast.success('Lançamento cancelado. Ele sai da lista e fica na auditoria.');
    return true;
  };

  const nomeConta = (id: string | null): string => {
    if (!id) return '—';
    if (id === SEM_CONTA) return 'Sem conta definida';
    const c = fin.contasBancarias.find((x) => x.id === id);
    /* o catálogo da tela só traz contas ATIVAS: id que não resolve é conta inativa (0 casos em aberto no proto em 05/10/2026) */
    return c ? (c.nome_exibicao || c.nome_conta || '—') : 'Conta inativa';
  };
  const alternarConta = (conta: string) => setContaSel((atual) => (atual === conta ? null : conta));

  const motivoSemSaldo = caixaDeUmaConta
    ? `${nomeConta(contaSel)} não entra no saldo em caixa (cartão ou conta sem saldo conferido)`
    : 'sem saldo em caixa conferido';
  const tituloMenorSaldo = serie.menor ? 'menor saldo previsto da conta no período' : motivoSemSaldo;
  const codigoDaSafra = (id: string | null): string => (id && fin.safras.find((x) => x.id === id)?.codigo) || '—';
  const codigoDaFazenda = (id: string | null): string => (id && fazendas.find((x) => x.id === id)?.codigo) || '—';

  const vazioTexto = segmento === 'receber'
    ? 'Nenhum recebimento previsto neste período'
    : segmento === 'pagar'
      ? 'Nenhum pagamento previsto neste período'
      : 'Nenhuma obrigação neste período';

  /* ── CPR-SALDO-DIA-01 (H) — OS CONTROLES SÃO UM NÓ SÓ, COM UM ESTADO SÓ. A tela normal e o Ampliado só os POSICIONAM:
        nenhum controle nem estado duplicado. ── */
  const ctlVisao = (
    <Segmentado
      valor={visao}
      onEscolher={setVisao}
      altura={22}
      opcoes={[
        { valor: 'lista', rotulo: 'Lista' },
        { valor: 'fluxo', rotulo: 'Fluxo' },
      ]}
    />
  );
  const ctlAtalho = (
    <Segmentado
      valor={atalho}
      onEscolher={escolherAtalho}
      altura={22}
      opcoes={ATALHOS_CPR.map((a) => ({ valor: a.valor, rotulo: a.rotulo }))}
    />
  );
  const ctlDatas = (
    <>
      <span className="text-[10px] text-muted-foreground">de</span>
      <span data-testid="cpr-de"><DatePicker size="compact" className="w-[108px]" value={periodo.de} onChange={(v) => editarData('de', v)} /></span>
      <span className="text-[10px] text-muted-foreground">até</span>
      <span data-testid="cpr-ate"><DatePicker size="compact" className="w-[108px]" value={periodo.ate} onChange={(v) => editarData('ate', v)} /></span>
    </>
  );
  const ctlIncluir = (
    <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[10px] text-foreground">
      <Checkbox data-testid="cpr-incluir-vencidos" className="h-3 w-3" checked={incluirVencidos}
        onCheckedChange={(v) => setIncluirVencidos(v === true)} />
      Incluir vencidos
    </label>
  );
  /* o seletor de conta: cada opção diz o total A PAGAR e a contagem daquela conta no recorte atual */
  const ctlConta = (
    <Select value={contaSel ?? '__todas__'} onValueChange={(v) => setContaSel(v === '__todas__' ? null : v)}>
      <SelectTrigger data-testid="cpr-conta" className="h-[22px] w-[114px] shrink-0 px-2 text-[10px]" title={contaSel == null ? 'Todas as contas' : nomeConta(contaSel)}>
        <SelectValue>{contaSel == null ? 'Todas as contas' : nomeConta(contaSel)}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="__todas__">Todas as contas · {formatMoeda(recorteDeTodas.total.pagar.valor)} · {recorteDeTodas.total.pagar.contas}</SelectItem>
        {resumoContas.map((c) => (
          <SelectItem key={c.conta} value={c.conta} data-testid={`cpr-conta-opcao-${c.conta}`}>
            {nomeConta(c.conta)} · {formatMoeda(c.pagar.valor)} · {c.pagar.contas}
          </SelectItem>
        ))}
        {contaSel != null && !resumoContas.some((c) => c.conta === contaSel) && (
          <SelectItem value={contaSel}>{nomeConta(contaSel)} · {formatMoeda(0)} · 0</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
  const ctlSegmento = (
    <Segmentado
      valor={segmento}
      onEscolher={setSegmento}
      altura={22}
      opcoes={[
        { valor: 'pagar', rotulo: 'A Pagar' },
        { valor: 'receber', rotulo: 'A Receber' },
        { valor: 'ambos', rotulo: 'Ambos' },
      ]}
    />
  );
  /* as pílulas de status NÃO cabem na barra do Ampliado (277px): lá a faixa dos cartões escreve quais estão ligadas */
  const statusLigadosTexto = STATUS_DISPONIVEIS.filter((x) => statusLigados.includes(x)).map((x) => STATUS_FILTRO_LABEL[x] ?? x);

  return (
    /* ⚠ `h-full`, E NÃO `flex-1` — a mesma lição de `V2Recorrencias`: a altura vem do pai, e
       o `/v2` só a dá porque esta seção entrou em `SECOES_APP_SHELL`. Sem isso o `sticky`
       dos grupos não gruda em nada. `max-w-5xl` para a tela não encostar na margem. */
    <div className={cn('w-full min-w-0 h-full min-h-0 flex flex-col bg-background', !ampliado && 'max-w-5xl mx-auto')}>

      {/* AMPLIADO — o modo principal: DUAS linhas fixas. (1) a barra de filtros, 26px, com os MESMOS controles e o MESMO estado da
          tela normal; (2) a faixa dos cartões, 24px. Vale para Lista e para Fluxo. As pílulas de status não cabem (a faixa
          escreve quais estão ligadas); o rótulo "Conta" sai — o seletor diz o nome. Medido a 1.126 (1.094 úteis). */}
      {ampliado && (
        <div className="shrink-0 space-y-1 px-4 pb-1 pt-1">
          <div data-testid="cpr-barra-ampliada" className="flex h-[26px] flex-nowrap items-center gap-1.5 whitespace-nowrap">
            {ctlVisao}
            {ctlAtalho}
            {ctlDatas}
            {ctlConta}
            {ctlSegmento}
            {ctlIncluir}
            <div className="min-w-0 flex-1" />
            <button type="button" data-testid="cpr-recolher" onClick={() => setAmpliado(false)} title="Voltar à tela normal"
              className="flex h-[22px] shrink-0 items-center justify-center gap-1 rounded-md border border-primary bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
              <Minimize2 className="h-3 w-3" aria-hidden />Recolher
            </button>
          </div>
          <div data-testid="cpr-faixa-recolhida"
            className="grid h-[24px] grid-cols-[148px_142px_150px_136px_132px_minmax(0,1fr)] items-center gap-2 rounded-md border bg-card px-2 text-[10px] whitespace-nowrap">
            <CelRecolhida rotulo="Vencidos" valor={formatMoeda(recorte.vencidos.pagar.valor)} classe={recorte.vencidos.pagar.valor > 0 ? COR_SINAL.neg : undefined} />
            <CelRecolhida rotulo="A pagar" valor={formatMoeda(recorte.periodoSoma.pagar.valor)} classe={COR_SINAL.neg} />
            <CelRecolhida rotulo="A receber" valor={formatMoeda(recorte.periodoSoma.receber.valor)} classe={recorte.periodoSoma.receber.valor > 0 ? COR_SINAL.pos : undefined} />
            <CelRecolhida rotulo="Mínimo" titulo={tituloMenorSaldo}
              valor={serie.menor ? moedaComSinal(serie.menor.valor) : '—'} classe={serie.menor ? (serie.menor.valor < 0 ? COR_SINAL.neg : COR_SINAL.pos) : undefined} />
            <CelRecolhida rotulo="Caixa" valor={serie.hoje != null ? moedaComSinal(serie.hoje) : '—'} titulo={serie.hoje == null ? motivoSemSaldo : undefined} />
            <span data-testid="cpr-status-ligados" className="min-w-0 truncate text-right text-muted-foreground"
              title={`Status ligados: ${statusLigadosTexto.join(', ') || 'nenhum'} — para trocar, Recolher`}>
              {isFetching ? 'carregando… · ' : ''}status: {statusLigadosTexto.join(' · ') || 'nenhum'}
            </span>
          </div>
        </div>
      )}

      {/* ── CABEÇALHO CONGELADO (A21 + A3 + A26) — `shrink-0`, fora do scrollport ── */}
      {!ampliado && (
      <div className="shrink-0 px-4 pt-2 pb-2 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <PageHeader
            titulo="Contas a Pagar e Receber"
            subtitulo="O que vence, quando, somando todas as contas — pelo vencimento, não pelo pagamento"
          />
          <div className="flex shrink-0 items-center gap-2">
            {isFetching && <span className="text-[10px] text-muted-foreground">carregando…</span>}
            {/* a conta escolhida fica escrita no cabeçalho enquanto o filtro estiver ligado ("se escolher banco, tem que aparecer ali") */}
            {contaSel != null && (
              <span data-testid="cpr-conta-no-cabecalho" title={nomeConta(contaSel)}
                className="max-w-[260px] truncate rounded-md bg-primary px-2 py-[2px] text-[11px] font-medium text-primary-foreground">
                Conta: {nomeConta(contaSel)}
              </span>
            )}
          </div>
        </div>

        {/* BARRA 1 — UMA linha, sem quebra: visão · período (atalho + as duas datas) · "Incluir vencidos" · conta. */}
        <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap" data-testid="cpr-barra-periodo">
          {ctlVisao}
          {ctlAtalho}
          {ctlDatas}
          {ctlIncluir}
          <div className="min-w-0 flex-1" />
          <span className="text-[10px] text-muted-foreground">Conta</span>
          {ctlConta}
        </div>

        {/* CARTÕES — cinco, 40px, rótulo + valor; o valor NUNCA corta. Os números saem todos de `recorte` (o dono) e não
            dependem da visão nem do segmento. ZERO É R$ 0,00, nunca "—". */}
        <div className="grid grid-cols-[1.75fr_1fr_1fr_1fr_1.94fr] gap-1.5" data-testid="cpr-cartoes">
          <CardResumo
            testId="cpr-card-vencidos"
            rotulo="Vencidos"
            contagem={`· ${contas(recorte.vencidos.pagar.contas)}`}
            titulo={`Vencidos a pagar: ${formatMoeda(recorte.vencidos.pagar.valor)} em ${contas(recorte.vencidos.pagar.contas)} · vencidos a receber: ${formatMoeda(recorte.vencidos.receber.valor)} em ${contas(recorte.vencidos.receber.contas)} · ${recorte.vencidos.contam.pagar.contas + recorte.vencidos.contam.receber.contas} contam no saldo · ${recorte.vencidos.anteriores.pagar.contas + recorte.vencidos.anteriores.receber.contas} anteriores à conciliação (fora do saldo)`}
            valor={formatMoeda(recorte.vencidos.pagar.valor)}
            classeValor={recorte.vencidos.pagar.valor > 0 ? 'text-destructive' : 'text-muted-foreground'}
            borda="border-l-destructive"
            /* os DOIS lados à vista: o valor é o vencido a pagar; à direita do rótulo, o vencido a receber (some quando é zero).
               Não depende do segmento nem da visão. */
            lado={recorte.vencidos.receber.valor > 0
              ? [{ rotulo: 'a receber', valor: '', classe: 'text-success' }, { rotulo: '', valor: formatMoeda(recorte.vencidos.receber.valor), classe: 'text-success' }]
              : undefined}
          />
          <CardResumo
            testId="cpr-card-pagar"
            rotulo="A pagar"
            contagem={`· ${recorte.periodoSoma.pagar.contas}`}
            titulo={`A pagar no período: ${contas(recorte.periodoSoma.pagar.contas)}, sem os vencidos`}
            valor={formatMoeda(recorte.periodoSoma.pagar.valor)}
            classeValor="text-destructive"
            borda="border-l-destructive"
          />
          <CardResumo
            testId="cpr-card-receber"
            rotulo="A receber"
            contagem={`· ${recorte.periodoSoma.receber.contas}`}
            titulo={`A receber no período: ${contas(recorte.periodoSoma.receber.contas)}, sem os vencidos`}
            valor={formatMoeda(recorte.periodoSoma.receber.valor)}
            classeValor={recorte.periodoSoma.receber.valor > 0 ? 'text-success' : 'text-muted-foreground'}
            borda="border-l-success"
          />
          {/* MÍNIMO — o menor saldo da série (da partida ao fim), do dono. Rótulo curto que NÃO corta: "Mínimo ▼ · DD/MM" (a data
              é número). Sem saldo em caixa: "Mínimo" e "—". */}
          <CardResumo
            testId="cpr-card-saldo"
            rotulo="Mínimo"
            contagem={serie.menor ? `${serie.menor.valor < 0 ? '▼' : '▲'} · ${serie.menor.data ? format(parseISO(serie.menor.data), 'dd/MM') : 'hoje'}` : undefined}
            classeContagem={serie.menor ? (serie.menor.valor < 0 ? COR_SINAL.neg : COR_SINAL.pos) : undefined}
            titulo={tituloMenorSaldo}
            valor={serie.menor ? moedaComSinal(serie.menor.valor) : '—'}
            classeValor={serie.menor ? (serie.menor.valor < 0 ? COR_SINAL.neg : COR_SINAL.pos) : 'text-muted-foreground'}
            borda="border-l-muted-foreground"
          />
          <CardResumo
            testId="cpr-card-caixa"
            rotulo={caixaDeUmaConta ? `Caixa · ${nomeConta(contaSel)}` : contaSel === SEM_CONTA ? 'Caixa · todas as contas' : 'Caixa'}
            titulo={caixaDeUmaConta
              ? (caixa && caixa.ancoradas > 0 ? `Saldo em caixa só de ${nomeConta(contaSel)} (âncora conferida + movimentos)` : `${nomeConta(contaSel)} não entra no saldo em caixa (cartão ou conta sem saldo conferido)`)
              : 'Saldo em caixa de todas as contas'}
            valor={caixa && caixa.ancoradas > 0 ? formatMoeda(caixa.total) : '—'}
            classeValor="text-foreground"
            borda="border-l-primary"
            /* corrente e investido em DUAS linhas pequenas à direita do total — rótulo curto + valor, nunca cortados nem só em `title` */
            lado={(naturezasDoCaixa ?? []).map((n) => ({
              rotulo: n.rotulo === 'Corrente' ? 'corr.' : 'inv.',
              valor: n.valor,
              classe: (n.aConferir?.length ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : undefined,
              title: `${n.rotulo} ${n.valor} — ${n.detalhe}${n.aConferir && n.aConferir.length > 0 ? ` · conferir: ${n.aConferir.join(', ')}` : ''}`,
            }))}
          />
        </div>

        {/* RESUMO POR CONTA — CPR-CONTA-01: UMA linha de altura fixa, que existe mesmo vazia. As contas em ordem de valor a pagar
            (do dono); clicar filtra, clicar de novo volta a "Todas". O valor nunca corta; o que não cabe vira "+N". */}
        <div data-testid="cpr-resumo-contas" className="flex h-[18px] flex-nowrap items-center gap-1 overflow-hidden whitespace-nowrap text-[10px]">
          <span className="shrink-0 text-muted-foreground">A pagar por conta</span>
          {contasNaFaixa.slice(0, MAX_CONTAS_NA_FAIXA).map((c) => (
            <button key={c.conta} type="button" data-testid={`cpr-resumo-conta-${c.conta}`} aria-pressed={contaSel === c.conta}
              onClick={() => alternarConta(c.conta)} title={`${nomeConta(c.conta)} · ${formatMoeda(c.pagar.valor)} · ${contas(c.pagar.contas)}`}
              className={cn('flex h-[16px] shrink-0 items-center gap-1 rounded px-1.5 transition-colors',
                contaSel === c.conta ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted')}>
              <span className="max-w-[96px] truncate">{nomeConta(c.conta)}</span>
              <span className="tabular-nums" data-valor-da-faixa>{formatMoeda(c.pagar.valor)}</span>
            </button>
          ))}
          {contasNaFaixa.length > MAX_CONTAS_NA_FAIXA && (
            <span className="shrink-0 text-muted-foreground" data-testid="cpr-resumo-mais"
              title={contasNaFaixa.slice(MAX_CONTAS_NA_FAIXA).map((c) => `${nomeConta(c.conta)} · ${formatMoeda(c.pagar.valor)} · ${contas(c.pagar.contas)}`).join('\n')}>
              +{contasNaFaixa.length - MAX_CONTAS_NA_FAIXA}
            </span>
          )}
        </div>

        {/* BARRA 2 — SEGMENTO + STATUS + AMPLIAR + AGRUPAMENTO */}
        <div className="flex flex-wrap items-center gap-2">
          {ctlSegmento}

          <div className="flex items-center gap-1">
            {STATUS_DISPONIVEIS.map((s) => {
              const ligado = statusLigados.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={ligado}
                  onClick={() => setStatusLigados((atual) =>
                    atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s])}
                  className={cn(
                    'h-[22px] rounded-md border px-2 text-[10px] font-medium transition-colors',
                    ligado
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground hover:bg-muted',
                  )}
                >
                  {STATUS_FILTRO_LABEL[s] ?? s}
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {/* AMPLIAR — o mesmo mecanismo da lista de Lançamentos (o shell esconde a lateral). Na barra 2: a barra 1 não tem folga a 1.126px. */}
          <button type="button" data-testid="cpr-ampliar" onClick={() => setAmpliado(true)} title="Ampliar a lista (mais colunas)"
            className="flex h-[22px] shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted">
            <Maximize2 className="h-3 w-3" aria-hidden />Ampliar
          </button>

          {/* ⚠ "Categoria" DESLIGADA E VISÍVEL — o idioma do `Segmentado`: diz para onde a
              tela vai sem fingir que já chegou. Ela entra num PR próprio. */}
          <Segmentado
            valor={agrupamento}
            onEscolher={() => { /* só há um agrupamento nesta fase */ }}
            altura={22}
            opcoes={[
              { valor: 'vencimento', rotulo: 'por vencimento' },
              { valor: 'categoria', rotulo: 'por categoria', desabilitada: true, title: 'Em breve' },
            ]}
          />
        </div>
      </div>
      )}

      {/* ── CORPO — Lista ou Fluxo, no mesmo cartão e na mesma caixa ──
          ⚠ O CARTÃO É O MESMO PARA AS DUAS VISÕES, de propósito: trocar de visão não pode
          mudar a altura nem a largura do que está em volta (A27). O que troca é o conteúdo. */}
      <div className="min-h-0 flex-1 px-4 pb-2">
        <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
          {visao === 'fluxo' ? (
            /* ⚠ AS MESMAS CONTAS EM ABERTO QUE A SÉRIE DO SALDO SOMA, dos dois lados; o segmento só escolhe as barras.
               O gráfico começa na data "de" do período. No Ampliado ele ocupa toda a área abaixo do cabeçalho. */
            <CprFluxoPrevisto
              linhas={doFluxo}
              saldoInicial={serie.hoje}
              barras={segmento}
              vencidosForaDoSaldo={recorte.vencidos.anteriores.linhas.length}
              caveat={rotuloCaixa}
              granularidade="dia"
              inicio={periodo.de}
              hoje={isoLocal(hoje)}
              passado={caixa?.passado.pontos ?? []}
              conciliadoAte={caixa?.passado.boundary ?? null}
            />
          ) : (
          <>

          {statusLigados.length === 0 ? (
            <Vazio texto="Nenhum status selecionado — ligue ao menos um acima" />
          ) : grupos.length === 0 ? (
            <Vazio texto={isFetching ? 'Carregando…' : vazioTexto} />
          ) : (
            /* ⚠ `rolagem-fina` (A24) E `rolagem-sem-tampar`: a barra grossa do sistema come
               ~15px de LARGURA DE COLUNA numa lista de 22px por linha, e o gutter estável
               impede que as linhas andem quando a rolagem aparece. Os dois utilitários já
               existem em `index.css`; aqui é só adesão. */
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rolagem-fina rolagem-sem-tampar !pb-0">
             {/* ⚠ UM SCROLLPORT SÓ, e TUDO o que é fixo mora DENTRO dele (cabeçalho, "Saldo hoje", faixas e o rodapé `sticky bottom-0`):
                 fora, o fixo teria a largura cheia e as linhas perderiam o gutter da barra — as colunas de valor desalinhariam. */}
             <div className="flex min-h-full flex-col">

              {/* CABEÇALHO DE COLUNA — navy, 22px, a régua do modo. */}
              <div data-testid="cpr-cabecalho" className={cn(
                'sticky top-0 z-20 flex h-[22px] shrink-0 items-center gap-1 px-3',
                'text-[10px] font-medium tracking-wide bg-primary text-primary-foreground',
                'border-l-[3px] border-l-transparent',
              )}>
                {regua.comp > 0 && <span style={larg(regua.comp)}>Comp.</span>}
                <span style={larg(regua.venc)}>Venc.</span>
                {regua.pgto > 0 && <span style={larg(regua.pgto)}>Pgto.</span>}
                <span className="min-w-0 flex-1" data-coluna-descricao>Descrição</span>
                <span style={larg(regua.fornecedor)}>Fornecedor</span>
                <span style={larg(regua.subcentro)}>Subcentro</span>
                {regua.safra > 0 && <span style={larg(regua.safra)}>Safra</span>}
                {regua.faz > 0 && <span style={larg(regua.faz)}>Faz.</span>}
                <span style={larg(regua.status)} className="text-center">Status</span>
                <span style={larg(regua.anexo)} aria-hidden />
                <span style={larg(regua.pagar)} className="text-right">A pagar</span>
                <span style={larg(regua.receber)} className="text-right">A receber</span>
                <span style={larg(regua.saldo)} className="text-right" title={segmento === 'ambos' ? undefined : MOTIVO_SALDO_DOIS_LADOS}>Saldo</span>
              </div>

              {/* SALDO HOJE — fixo sob o cabeçalho; é o cartão Caixa. Com "Incluir vencidos" DESLIGADA os subgrupos somem e a
                  linha mostra o saldo "após vencidos" (a partida da série): o saldo NÃO muda com a caixa (D3). */}
              <Faixa
                testId="cpr-saldo-hoje" regua={regua}
                className="sticky top-[22px] z-20 h-[20px] border-b bg-card text-foreground"
                titulo={`Saldo hoje · ${caixaDeUmaConta ? nomeConta(contaSel) : 'todas as contas'}${incluirVencidos ? '' : ' · após vencidos'}`}
                dica={serie.hoje == null ? motivoSemSaldo
                  : incluirVencidos ? 'o saldo em caixa de hoje — o mesmo número do cartão Caixa'
                  : `Caixa ${moedaComSinal(serie.hoje)} − vencidos a pagar que contam ${formatMoeda(serie.partida.pagar.valor)} + vencidos a receber que contam ${formatMoeda(serie.partida.receber.valor)}`}
                pagar={incluirVencidos ? undefined : serie.partida.pagar.valor}
                receber={incluirVencidos ? undefined : serie.partida.receber.valor}
                saldo={incluirVencidos ? serie.hoje : serie.partida.saldo}
                motivoSemSaldo={motivoSemSaldo}
              />

              {grupos.map((g) => (
                <div key={g.chave} data-testid={`cpr-grupo-${g.tipo}`} data-total={Math.round((g.receber - g.pagar) * 100) / 100}
                  data-saldo={g.saldo ?? ''}>
                  {/* O FECHAMENTO DO GRUPO — fundo OPACO e `z` acima das linhas (A21); os três valores caem nas colunas da régua. */}
                  <Faixa
                    regua={regua}
                    className={cn('sticky top-[42px] z-10',
                      g.tipo === 'dia' || g.tipo === 'entre' ? cn('h-[22px] border-t-[1.5px] border-t-primary/50 font-bold text-primary', FUNDO_DIA)
                        : g.tipo === 'vencidos_contam' ? cn('h-[22px] border-t-[1.5px] border-t-[#b91c1c]/40 font-bold', COR_SINAL.neg, FUNDO_VENCIDOS)
                        : 'h-[20px] border-b bg-muted font-medium text-muted-foreground')}
                    titulo={g.titulo} quando={g.quando} dica={g.dica}
                    pagar={g.pagar} receber={g.receber} saldo={g.saldo}
                    semSeta={g.tipo === 'vencidos_anteriores' || g.tipo === 'sem_vencimento'}
                    fundoNegativo motivoSemSaldo={motivoSemSaldo}
                  />

                  {g.linhas.map((l) => {
                    const valor = Math.abs(Number(l.valor ?? 0));
                    const receber = ehReceber(l);
                    const grande = valor >= CORTE_DESTAQUE;
                    const paga = !contaEmAberto(l);
                    const status = (l.status_transacao ?? '').toLowerCase();
                    const fornecedor = (l.favorecido_id && nomesFornecedores.get(l.favorecido_id)) || '—';
                    const anexo = comAnexo?.has(l.id) ?? false;
                    /* ⚠ Doc exige o guarda do `numero_documento`: sem número, `documento_formatado` degrada para o nome do TIPO. */
                    const doc = (l.numero_documento ?? '').trim() ? (l.documento_formatado ?? '') : '';
                    /* Origem, Doc e Conta saíram da grade: moram no `title` da Descrição. */
                    const dicaDescricao = `${l.descricao || '—'}\norigem: ${rotuloOrigem(l.origem_lancamento)} · doc: ${doc || '—'} · conta: ${nomeConta(contaDaConta(l))}`;
                    const celValor = (
                      <span data-valor-da-linha className={cn('whitespace-nowrap text-right tabular-nums', receber ? COR_SINAL.pos : COR_SINAL.neg, paga && 'opacity-50')}
                        title={paga ? 'já paga — não entra nos totais nem no saldo' : undefined}>
                        {formatMoeda(valor)}
                      </span>
                    );
                    return (
                      <button
                        key={l.id}
                        type="button"
                        disabled={!catalogosProntos || abrindo}
                        onClick={() => void abrir(l.id)}
                        title={catalogosProntos ? 'Abrir o lançamento' : 'Carregando os catálogos…'}
                        className={cn(
                          'flex h-[18px] w-full shrink-0 items-center gap-1 border-b px-3 text-left text-[10px]',
                          'transition-colors hover:bg-muted/50 disabled:cursor-default',
                          /* A faixa de 3px do destaque: `border-l-[3px]` em TODAS as linhas, transparente nas comuns (A27). */
                          'border-l-[3px]',
                          grande ? (receber ? 'border-l-success' : 'border-l-destructive') : 'border-l-transparent',
                        )}
                      >
                        {regua.comp > 0 && (
                          <span style={larg(regua.comp)} className={cn(FONTE_FINA, 'whitespace-nowrap tabular-nums text-muted-foreground')} data-celula-data>
                            {l.data_competencia ? format(parseISO(l.data_competencia), 'MM/yy') : '—'}
                          </span>
                        )}
                        <span style={larg(regua.venc)} className={cn(FONTE_FINA, 'whitespace-nowrap tabular-nums text-muted-foreground')} data-celula-data>
                          {l.data_vencimento ? format(parseISO(l.data_vencimento), 'dd/MM/yy') : '—'}
                        </span>
                        {regua.pgto > 0 && (
                          <span style={larg(regua.pgto)} className={cn(FONTE_FINA, 'whitespace-nowrap tabular-nums text-muted-foreground')} data-celula-data>
                            {paga && l.data_pagamento ? format(parseISO(l.data_pagamento), 'dd/MM/yy') : ''}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-foreground" title={dicaDescricao} data-celula-descricao>
                          {l.descricao || '—'}
                        </span>
                        <span style={larg(regua.fornecedor)} className="truncate text-muted-foreground" title={fornecedor}>
                          {fornecedor}
                        </span>
                        <span style={larg(regua.subcentro)} className={cn(FONTE_FINA, 'truncate text-muted-foreground')} title={l.subcentro ?? undefined}>
                          {l.subcentro || '—'}
                        </span>
                        {regua.safra > 0 && (
                          <span style={larg(regua.safra)} className={cn(FONTE_FINA, 'truncate text-muted-foreground')} title={codigoDaSafra(l.safra_id)}>
                            {codigoDaSafra(l.safra_id)}
                          </span>
                        )}
                        {regua.faz > 0 && (
                          <span style={larg(regua.faz)} className={cn(FONTE_FINA, 'truncate text-muted-foreground')} title={codigoDaFazenda(l.fazenda_id)}>
                            {codigoDaFazenda(l.fazenda_id)}
                          </span>
                        )}
                        {/* ⚠ PÍLULA SEM BORDA (FIN-LISTA-VISUAL-01): o mapa de COR marca o status; a palavra nunca corta. */}
                        <span style={larg(regua.status)} className="text-center" data-celula-status>
                          <span className={cn(
                            'inline-block rounded bg-muted px-0.5 whitespace-nowrap', FONTE_STATUS,
                            STATUS_FILTRO_COR[status] ?? 'text-muted-foreground',
                          )}>
                            {STATUS_FILTRO_LABEL[status] ?? (status || '—')}
                          </span>
                        </span>
                        {/* ⚠ A COLUNA DO CLIPE EXISTE EM TODA LINHA (A27); o rótulo mora no `span`, não no ícone. */}
                        <span style={larg(regua.anexo)}
                          title={anexo ? 'tem documento anexado' : undefined}
                          aria-label={anexo ? 'tem documento anexado' : undefined}>
                          {anexo && <Paperclip className="h-2.5 w-2.5 text-muted-foreground" aria-hidden />}
                        </span>
                        {/* o valor da linha cai na coluna do SEU lado, na cor do sinal, sem seta; o Saldo da linha fica vazio */}
                        <span style={larg(regua.pagar)} className="text-right">{receber ? null : celValor}</span>
                        <span style={larg(regua.receber)} className="text-right">{receber ? celValor : null}</span>
                        <span style={larg(regua.saldo)} aria-hidden />
                      </button>
                    );
                  })}
                </div>
              ))}

              <div className="min-h-0 flex-1" />
              {/* FIM DO PERÍODO — navy, FIXO no pé do scrollport. Totais a pagar e a receber da lista (vencidos, se ligados, +
                  período — a caixa decide a lista e o total) e o SALDO NO FIM, que é o último ponto da série e NÃO muda com a caixa. */}
              <Faixa
                testId="cpr-total" regua={regua} navy
                className="sticky bottom-0 z-20 h-[26px] bg-primary text-[11px] font-bold text-primary-foreground"
                titulo={`Fim do período · ${format(parseISO(periodo.ate), 'dd/MM/yyyy')} · ${contas(recorte.total.ambos.contas)}`}
                dica={`a pagar e a receber da lista (${incluirVencidos ? 'vencidos + período' : 'período, sem os vencidos'}); o saldo no fim considera sempre os vencidos que contam`}
                pagar={recorte.total.pagar.valor} receber={recorte.total.receber.valor} saldo={serie.fim}
                motivoSemSaldo={motivoSemSaldo}
              />
             </div>
            </div>
          )}
          </>
          )}
        </div>
      </div>

      <LancamentoV2Dialog
        open={!!lancEdicao}
        carregando={!catalogosProntos}
        onClose={() => setLancEdicao(null)}
        onSave={async (form, id) => {
          const ok = id ? await fin.editarLancamento(id, form) : await fin.criarLancamento(form);
          if (ok) await invalidarTela();
          return ok;
        }}
        onDelete={cancelarLancamento}
        lancamento={lancEdicao}
        fazendas={fazendas}
        contas={fin.contasBancarias}
        classificacoes={fin.classificacoes}
        fornecedores={fin.fornecedores}
        safras={fin.safras}
        onCriarFornecedor={fin.criarFornecedor}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Um slot do resumo. Largura vem do `grid-cols-3` do pai e NUNCA do conteúdo; a altura é
 * fixa para que a presença ou ausência do aviso não mexa na régua (A27).
 */
/** Uma natureza do caixa — o valor e o que explica a data dele. */
const contas = (n: number) => `${n} ${n === 1 ? 'conta' : 'contas'}`;

/**
 * O CARTÃO DO RESUMO — CPR-PERIODO-VENCIDOS-01: 40px. À esquerda o rótulo (texto: corta com o inteiro no `title`) e, embaixo,
 * o valor; à direita, até duas linhas pequenas (o "a receber" dos vencidos; corrente e investido do caixa). NENHUM VALOR CORTA
 * NEM FICA SÓ EM `title` (regra soberana): todo valor é `whitespace-nowrap`, sem `truncate`, e a coluna da esquerda é quem cede.
 * ⚠ 12px, `px-1`, `gap-1` E A GRADE 1.75fr·1fr·1fr·1fr·1.94fr SÃO MEDIDOS a 1.126px com "−R$ 99.999.999,99" em TODOS os
 * valores (os cinco totais, o "a receber" e as duas linhas do caixa). Quem mexer mede de novo. ⚠ A entrelinha é explícita (12px e 18px): com `leading-none` + `truncate` a descendente do "g" de "A pagar"
 * era cortada pela caixa do texto.
 */
function CardResumo({ rotulo, contagem, classeContagem, titulo, valor, classeValor, borda, lado, testId }: {
  rotulo: string;
  /** A contagem ("· 237") — NÚMERO: não corta; quem cede é o texto do rótulo. */
  contagem?: string;
  /** A cor da contagem (a seta do "Mínimo"). */
  classeContagem?: string;
  titulo?: string;
  valor: string;
  classeValor: string;
  borda: string;
  /** Até DUAS linhas pequenas à direita (rótulo curto + valor). Os valores nunca cortam. */
  lado?: { rotulo: string; valor: string; classe?: string; title?: string }[];
  testId?: string;
}) {
  return (
    <div data-testid={testId} className={cn('flex min-w-0 h-[40px] items-center gap-1 rounded-md border border-l-[3px] px-1 py-[3px]', borda)}>
      <div className="min-w-0 flex-1">
        <div className="flex text-[10px] leading-[12px] text-muted-foreground" title={titulo ?? rotulo}
          data-testid={testId ? `${testId}-rotulo` : undefined}>
          <span className="truncate">{rotulo}</span>
          {contagem && <span className={cn('shrink-0 whitespace-pre tabular-nums', classeContagem)} data-testid={testId ? `${testId}-contagem` : undefined}>{' '}{contagem}</span>}
        </div>
        <div data-testid={testId ? `${testId}-valor` : undefined} data-valor-do-cartao
          className={cn('whitespace-nowrap text-[12px] font-medium leading-[18px] tabular-nums', classeValor)}>
          {valor}
        </div>
      </div>
      {lado && lado.length > 0 && (
        <div className="shrink-0 text-right text-[9.5px] leading-[15px]">
          {lado.slice(0, 2).map((l, i) => (
            <div key={i} title={l.title} className={cn('whitespace-nowrap', l.classe ?? 'text-muted-foreground')}>
              {l.rotulo}{l.rotulo && l.valor ? ' ' : ''}
              {l.valor && <span data-valor-do-cartao data-testid={testId ? `${testId}-lado-${i}` : undefined} className="tabular-nums">{l.valor}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * UMA CÉLULA DE VALOR DE FAIXA — seta e número NO MESMO elemento. `undefined` = célula vazia; `null` = "—" (não há saldo).
 * ▼ a pagar (vermelho) · ▲ a receber (verde) · saldo ▲ verde se ≥ 0, ▼ vermelho se < 0, com "−" tipográfico colado.
 * Zero é R$ 0,00 (sem seta, apagado). As cores vêm de `COR_SINAL`; no rodapé navy, de `TOM_NO_NAVY`.
 */
function CelValor({ largura, tipo, valor, navy, semSeta, fundoNegativo, motivoSemSaldo }: {
  largura: number; tipo: 'pagar' | 'receber' | 'saldo'; valor: number | null | undefined;
  navy?: boolean; semSeta?: boolean; fundoNegativo?: boolean; motivoSemSaldo?: string;
}) {
  if (valor === undefined) return <span style={larg(largura)} aria-hidden />;
  if (valor === null) return <span style={larg(largura)} className="text-right font-normal opacity-70" title={motivoSemSaldo} data-celula-valor={tipo}>—</span>;
  const tom = navy ? TOM_NO_NAVY : COR_SINAL;
  const zero = tipo !== 'saldo' && valor === 0;
  const negativo = tipo === 'pagar' || (tipo === 'saldo' && valor < 0);
  const seta = semSeta || zero ? '' : negativo ? '▼ ' : '▲ ';
  return (
    <span style={larg(largura)} data-celula-valor={tipo} data-valor={valor}
      className={cn('whitespace-nowrap text-right tabular-nums',
        zero || semSeta ? 'font-normal opacity-70' : negativo ? tom.neg : tom.pos,
        fundoNegativo && tipo === 'saldo' && valor < 0 && cn('rounded-sm leading-[18px]', FUNDO_SALDO_NEGATIVO))}>
      {seta}{tipo === 'saldo' ? moedaComSinal(valor) : formatMoeda(valor)}
    </span>
  );
}

/** UMA FAIXA DA LISTA (saldo hoje, vencidos, dia, rodapé): título à esquerda (texto: corta, inteiro no `title`) + as três colunas de valor da régua. */
function Faixa({ regua, className, titulo, quando, dica, pagar, receber, saldo, navy, semSeta, fundoNegativo, motivoSemSaldo, testId }: {
  regua: Regua; className: string; titulo: string; quando?: string; dica?: string;
  pagar: number | undefined; receber: number | undefined; saldo: number | null | undefined;
  navy?: boolean; semSeta?: boolean; fundoNegativo?: boolean; motivoSemSaldo?: string; testId?: string;
}): ReactNode {
  return (
    <div data-testid={testId} data-faixa className={cn('flex shrink-0 items-center gap-1 px-3 text-[11px] border-l-[3px] border-l-transparent', className)}>
      <span className="min-w-0 flex-1 truncate tracking-wide" title={dica ? `${titulo}\n${dica}` : titulo}>
        {titulo}
        {quando && <span className={cn(FONTE_QUANDO, 'ml-1 font-normal opacity-80')}>· {quando}</span>}
      </span>
      <CelValor largura={regua.pagar} tipo="pagar" valor={pagar} navy={navy} semSeta={semSeta} />
      <CelValor largura={regua.receber} tipo="receber" valor={receber} navy={navy} semSeta={semSeta} />
      <CelValor largura={regua.saldo} tipo="saldo" valor={saldo} navy={navy} fundoNegativo={fundoNegativo} motivoSemSaldo={motivoSemSaldo} />
    </div>
  );
}

/** Uma célula da faixa recolhida (Ampliado): rótulo (texto, corta) + número (nunca corta). */
function CelRecolhida({ rotulo, valor, texto, classe, titulo }: { rotulo: string; valor?: string; texto?: string; classe?: string; titulo?: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1" title={titulo ?? `${rotulo}: ${valor ?? texto ?? ''}`}>
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      {texto != null
        ? <span className="min-w-0 truncate font-medium text-foreground">{texto}</span>
        : <span data-valor-recolhido className={cn('ml-auto shrink-0 font-medium tabular-nums', classe ?? 'text-foreground')}>{valor}</span>}
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-10">
      <p className="text-center text-[11px] text-muted-foreground">{texto}</p>
    </div>
  );
}
