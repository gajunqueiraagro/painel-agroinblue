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
import { useEffect, useMemo, useState } from 'react';
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
import { Paperclip } from 'lucide-react';
import { STATUS_FILTRO_COR, STATUS_FILTRO_LABEL } from '@/lib/financeiro/statusFinanceiro';
import { formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário da tela
// ─────────────────────────────────────────────────────────────────────────────

type Horizonte = 'vencidos' | '7' | '30' | '60' | '90' | 'tudo';
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

const HORIZONTES: { valor: Horizonte; rotulo: string }[] = [
  { valor: 'vencidos', rotulo: 'Vencidos' },
  { valor: '7', rotulo: '7 dias' },
  { valor: '30', rotulo: '30 dias' },
  { valor: '60', rotulo: '60 dias' },
  { valor: '90', rotulo: '90 dias' },
  { valor: 'tudo', rotulo: 'Tudo' },
];

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
const COL = {
  vencimento: 'w-[42px]',
  fornecedor: 'w-[144px]',
  banco: 'w-[88px]',
  origem: 'w-[100px]',
  status: 'w-[72px]',
  anexo: 'w-[12px]',
  doc: 'w-[62px]',
  valor: 'w-[104px]',
} as const;

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
const FONTE_DOC = 'text-[8px]';
const FONTE_STATUS = 'text-[9px]';
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

function somarDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Dias entre duas datas locais (positivo = no futuro). */
function diasAte(iso: string, hoje: Date): number {
  const alvo = parseISO(iso);
  const base = new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate());
  return Math.round((base.getTime() - hoje.getTime()) / 86_400_000);
}

/** O limite do horizonte, em ISO local. `null` = sem limite ("Tudo" e "Vencidos"). */
function limiteDoHorizonte(h: Horizonte, hoje: Date): string | null {
  if (h === 'tudo' || h === 'vencidos') return null;
  return isoLocal(somarDias(hoje, Number(h)));
}

/**
 * O ramo temporal da consulta, no dialeto do PostgREST.
 *
 * ⚠ O `data_vencimento.is.null` ENTRA EM TODOS OS HORIZONTES, e não é zelo: uma obrigação
 * sem data de vencimento é justamente a que não se pode perder de vista. Sem este termo ela
 * não cairia em janela nenhuma e sumiria da tela em silêncio — o defeito que a lista
 * paginada já fecha com o seu `RAMO_SEM_VENCIMENTO`. Aqui elas vão para um grupo próprio,
 * no fim.
 */
function ramoDoHorizonte(h: Horizonte, hoje: Date, apenasFuturo = false): string | null {
  const hojeIso = isoLocal(hoje);
  /**
   * ⚠ NO FLUXO O RECORTE É SEMPRE PARA A FRENTE — PR-CPR-2B.2. O horizonte passa a dizer só
   * ATÉ ONDE ir, nunca o quanto voltar: "Vencidos" projeta de hoje em diante (vencido é
   * assunto da Lista) e "Tudo" deixa de começar em jul/2025.
   * ⚠ E O BOTÃO CONTINUA ATIVO em "Vencidos": desabilitá-lo faria o operador achar que o
   * Fluxo quebrou. Ele mostra a projeção e o subtítulo diz quantos vencidos ficaram fora.
   */
  if (apenasFuturo) {
    /**
     * ⚠ O FLUXO VOLTOU A OLHAR PARA TRÁS — mas só até o começo do desenho, PR-CPR-2B.3.2. O
     * gráfico passou a mostrar o que VENCEU E NÃO FOI PAGO, e isso é, por definição, um
     * vencimento anterior a hoje. Sem estender o recorte, esses lançamentos não chegavam à
     * tela e o trecho tracejado nasceria vazio.
     * ⚠ E O PISO É O INÍCIO DO DESENHO, não "tudo": o gráfico começa em 01 do mês anterior, e
     * trazer vencidos de 2020 encheria a memória sem desenhar um pixel a mais.
     */
    const inicioDoDesenho = `${mesRelativoAoHoje(hoje, -1)}-01`;
    if (h === 'tudo' || h === 'vencidos') return `data_vencimento.gte.${inicioDoDesenho}`;
    return `and(data_vencimento.gte.${inicioDoDesenho},data_vencimento.lte.${limiteDoHorizonte(h, hoje)})`;
  }
  if (h === 'tudo') return null;
  if (h === 'vencidos') return `data_vencimento.lt.${hojeIso},data_vencimento.is.null`;
  const ate = limiteDoHorizonte(h, hoje);
  return `and(data_vencimento.gte.${hojeIso},data_vencimento.lte.${ate}),data_vencimento.is.null`;
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
  dia: string;
  /** O sufixo de contagem ("em 3 dias"). Vazio no grupo "Sem vencimento", que não tem data. */
  quando: string;
  vencido: boolean;
  linhas: LinhaViewDoc[];
  total: number;
}

export function ContasPagarReceberTab() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { fazendaAtual, fazendas } = useFazenda();
  const fazScope = fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null;
  const queryClient = useQueryClient();
  const fin = useFinanceiroV2();

  const [visao, setVisao] = useState<Visao>('lista');
  /* ⚠ 30 DIAS É O DEFAULT — PR-CPR-2B.3.6. A tela responde "o que vence e quando"; um mês é o
     alcance em que o produtor de fato decide pagamento. Noventa dias abriam a lista com o
     trimestre inteiro e o que vence esta semana chegava misturado ao que vence em dezembro. */
  const [horizonte, setHorizonte] = useState<Horizonte>('30');
  const [segmento, setSegmento] = useState<Segmento>('pagar');
  const [statusLigados, setStatusLigados] = useState<string[]>(STATUS_INICIAIS);
  const [lancEdicao, setLancEdicao] = useState<LancamentoV2 | null>(null);
  const [abrindo, setAbrindo] = useState(false);

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

  /**
   * ⚠ O FLUXO ABRE EM "AMBOS" — PR-CPR-2B.2. Fluxo de caixa é entrada E saída; com o segmento
   * em "A Pagar" (o default da Lista) o gráfico mostrava metade do fluxo e a linha só descia.
   * ⚠ E FORÇA SÓ NA ENTRADA DA VISÃO: a dependência é `[visao]`, então trocar o segmento com o
   * Fluxo aberto é respeitado. Um efeito que olhasse `segmento` também o puxaria de volta a
   * cada clique, e o operador não conseguiria ver só o que recebe.
   */
  useEffect(() => {
    if (visao === 'fluxo') setSegmento('ambos');
  }, [visao]);

  const hoje = useMemo(() => hojeLocal(), []);
  const limite = limiteDoHorizonte(horizonte, hoje);

  // ── Leitura ────────────────────────────────────────────────────────────────
  /**
   * ⚠ UMA CONSULTA SERVE OS TRÊS SEGMENTOS E OS DOIS NÚMEROS DO TOPO. O recorte por
   * pagar/receber acontece em memória, e não na ida: o card "A receber" tem de mostrar o
   * seu total mesmo com o segmento em "A Pagar". Filtrar por segmento no servidor obrigaria
   * a duas consultas para pintar a mesma barra.
   */
  const { data: linhas = [], isFetching } = useQuery({
    queryKey: ['cpr-lancs', clienteId, fazScope, horizonte, statusLigados.join(','), limite, visao],
    enabled: !!clienteId && statusLigados.length > 0,
    queryFn: async (): Promise<LinhaViewDoc[]> => {
      if (!clienteId) return [];
      const plano = montarPlanoBaseV2(
        clienteId,
        fazScope ? { fazenda_id: fazScope } : {},
        { relacao: 'view', semRecorteTemporal: true },
      );
      const ramo = ramoDoHorizonte(horizonte, hoje, visao === 'fluxo');
      return paginarTudo<LinhaViewDoc>(async (de, tamanho) => {
        let q = aplicarPlanoNaView(fin.abrirView('*'), plano)
          .in('status_transacao', statusLigados)
          /* Transferência não é conta a pagar nem a receber: é dinheiro trocando de bolso.
             São DUAS grafias no banco ('3-Transferência' e '3-Transferências'), então o
             corte é pelo prefixo — igualdade deixaria as seis linhas do singular passarem. */
          .or('tipo_operacao.not.like.3-*');
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
  const { data: caixa } = useQuery({
    queryKey: ['cpr-caixa', clienteId, isoLocal(hoje)],
    enabled: !!clienteId,
    queryFn: async (): Promise<(SaldoEmCaixa & { passado: SeriePassado }) | null> => {
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
        /* A fronteira do verde é o MESMO "conciliado até" que o rótulo do card mostra — uma
           regra, dois lugares. */
        passado: serieDoSaldoPassado({ ...argumentos, conciliadoAte: card.ancoraMaisAtrasada }),
      };
    },
  });

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

  // ── Recortes em memória ────────────────────────────────────────────────────
  const ehPagar = (l: LinhaViewDoc) => (l.tipo_operacao ?? '').startsWith('2-');
  const ehReceber = (l: LinhaViewDoc) => (l.tipo_operacao ?? '').startsWith('1-');

  const totalPagar = useMemo(
    () => linhas.filter(ehPagar).reduce((s, l) => s + Math.abs(Number(l.valor ?? 0)), 0), [linhas]);
  const totalReceber = useMemo(
    () => linhas.filter(ehReceber).reduce((s, l) => s + Math.abs(Number(l.valor ?? 0)), 0), [linhas]);

  const doSegmento = useMemo(() => linhas.filter(
    (l) => segmento === 'ambos' || (segmento === 'pagar' ? ehPagar(l) : ehReceber(l)),
  ), [linhas, segmento]);

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
    const mapa = new Map<string, LinhaViewDoc[]>();
    for (const l of doSegmento) {
      const chave = l.data_vencimento ?? '9999-99-99';
      const atual = mapa.get(chave);
      if (atual) atual.push(l); else mapa.set(chave, [l]);
    }
    return Array.from(mapa.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([chave, itens]) => {
        /* No segmento "Ambos" o total do grupo é o LÍQUIDO (entradas − saídas): somar as
           magnitudes daria um número que não é dinheiro nenhum. Nos outros dois o líquido
           coincide com a soma, porque só há um sentido. */
        const total = itens.reduce((s, l) => {
          const v = Math.abs(Number(l.valor ?? 0));
          return s + (ehReceber(l) ? v : -v);
        }, 0);
        const semData = chave === '9999-99-99';
        const faixa = semData ? { dia: 'Sem vencimento', quando: '' } : faixaDaData(chave, hoje);
        return {
          chave,
          dia: faixa.dia,
          quando: faixa.quando,
          vencido: !semData && diasAte(chave, hoje) < 0,
          linhas: itens,
          total,
        };
      });
  }, [doSegmento, hoje]);

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
    const c = fin.contasBancarias.find((x) => x.id === id);
    return c?.nome_exibicao || c?.nome_conta || '—';
  };

  const rotuloJanela = horizonte === 'tudo' ? 'tudo'
    : horizonte === 'vencidos' ? 'vencidos'
    : `${horizonte}d`;

  const vazioTexto = segmento === 'receber'
    ? 'Nenhum recebimento previsto neste período'
    : segmento === 'pagar'
      ? 'Nenhum pagamento previsto neste período'
      : 'Nenhuma obrigação neste período';

  return (
    /* ⚠ `h-full`, E NÃO `flex-1` — a mesma lição de `V2Recorrencias`: a altura vem do pai, e
       o `/v2` só a dá porque esta seção entrou em `SECOES_APP_SHELL`. Sem isso o `sticky`
       dos grupos não gruda em nada. `max-w-5xl` para a tela não encostar na margem. */
    <div className="w-full min-w-0 h-full min-h-0 flex flex-col bg-background max-w-5xl mx-auto">

      {/* ── CABEÇALHO CONGELADO (A21 + A3 + A26) — `shrink-0`, fora do scrollport ── */}
      <div className="shrink-0 px-4 pt-2 pb-2 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <PageHeader
            titulo="Contas a Pagar e Receber"
            subtitulo="O que vence, quando, somando todas as contas — pelo vencimento, não pelo pagamento"
          />
          <div className="flex shrink-0 items-center gap-2">
            {isFetching && (
              <span className="text-[10px] text-muted-foreground">carregando…</span>
            )}
            {/* ⚠ NO CABEÇALHO CONGELADO, ao lado do título: é a pergunta mais alta da tela
                ("como eu quero ver isto?") e fica acima do horizonte e do segmento, que são
                recortes de dentro de qualquer uma das duas visões. */}
            <Segmentado
              valor={visao}
              onEscolher={setVisao}
              altura={22}
              opcoes={[
                { valor: 'lista', rotulo: 'Lista' },
                { valor: 'fluxo', rotulo: 'Fluxo' },
              ]}
            />
          </div>
        </div>

        {/* HORIZONTE — navy no selecionado. O verde do mock contraria a regra da casa
            (CLAUDE.md, seção UI): seleção se marca com `bg-primary` + texto branco, e um
            segundo idioma de seleção a dez pixels do segmento abaixo é exatamente o que a
            regra nasceu para impedir. */}
        <div className="flex flex-wrap items-center gap-2">
          <Segmentado
            valor={horizonte}
            onEscolher={setHorizonte}
            altura={22}
            opcoes={HORIZONTES.map((h) => ({ valor: h.valor, rotulo: h.rotulo }))}
          />
          <span className="text-[10px] text-muted-foreground">
            {limite ? `até ${format(parseISO(limite), "dd/MMM/yyyy", { locale: ptBR })}`
              : horizonte === 'vencidos' ? `até ${format(somarDias(hoje, -1), "dd/MMM/yyyy", { locale: ptBR })}`
              : 'sem limite de data'}
          </span>
        </div>

        {/* RESUMO — três slots de largura FIXA (A27), agora em PROPORÇÕES diferentes.
            ⚠ IGUAIS NÃO SERVIAM: "A pagar" e "A receber" têm um rótulo e um número; o Saldo tem
            três linhas, e a do meio carrega "disponível R$ 9.999.999,99 · aplicado
            R$ 9.999.999,99" mais o âmbar. Com um terço da largura ela quebrava e o "aplicado"
            saía cortado — o defeito que este PR conserta. As proporções são FIXAS e não
            dependem do conteúdo, então trocar de cliente ou de filtro continua não movendo
            nada: o que muda é a divisão, não a regra. */}
        <div className="grid grid-cols-[1fr_1fr_2fr] gap-2">
          <CardResumo
            rotulo={`A pagar · ${rotuloJanela}`}
            valor={formatMoeda(totalPagar)}
            classeValor="text-destructive"
            borda="border-l-destructive"
          />
          {/* ⚠ ZERO É R$ 0,00, NUNCA "—". A sentinela da casa é explícita: "—" significa dado
              ausente ou desconhecido, e zero é valor real que nunca o substitui. Aqui a tela
              SABE que não há recebimento na janela — isso é um zero medido, não uma lacuna.
              O "vazio" que a homologação pede é o da LISTA, e é lá que ele está. */}
          <CardResumo
            rotulo={`A receber · ${rotuloJanela}`}
            valor={formatMoeda(totalReceber)}
            classeValor={totalReceber > 0 ? 'text-success' : 'text-muted-foreground'}
            borda="border-l-success"
          />
          <CardResumo
            rotulo="Saldo em caixa"
            valor={caixa && caixa.ancoradas > 0 ? formatMoeda(caixa.total) : '—'}
            classeValor="text-foreground"
            borda="border-l-primary"
            quebra={caixa && caixa.ancoradas > 0
              ? { disponivel: caixa.disponivel, aplicado: caixa.aplicado, aConferir: caixa.aConferir }
              : undefined}
            nota={rotuloCaixa ?? undefined}
          />
        </div>

        {/* SEGMENTO + STATUS + AGRUPAMENTO */}
        <div className="flex flex-wrap items-center gap-2">
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

      {/* ── CORPO — Lista ou Fluxo, no mesmo cartão e na mesma caixa ──
          ⚠ O CARTÃO É O MESMO PARA AS DUAS VISÕES, de propósito: trocar de visão não pode
          mudar a altura nem a largura do que está em volta (A27). O que troca é o conteúdo. */}
      <div className="min-h-0 flex-1 px-4 pb-2">
        <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
          {visao === 'fluxo' ? (
            /* ⚠ AS MESMAS `doSegmento` QUE A LISTA DESENHA, não `linhas`: o gráfico obedece ao
               segmento (A Pagar / A Receber / Ambos) como tudo o mais na tela. E o saldo é o
               mesmo objeto do card — uma fonte, dois desenhos. */
            <CprFluxoPrevisto
              linhas={doSegmento}
              saldoInicial={caixa && caixa.ancoradas > 0 ? caixa.total : null}
              caveat={rotuloCaixa}
              /* ⚠ DIÁRIO NOS HORIZONTES CURTOS, MENSAL SÓ NO "TUDO" — decisão do Gabriel:
                 agrupar por semana esconderia o dia exato do aperto, que é o que a tela
                 existe para mostrar. Em "Vencidos" o span pode ser de anos (2.420 dias no
                 Agnaldo Cedenho), e aí a própria lib rebaixa para mensal e avisa. */
              granularidade={horizonte === 'tudo' ? 'mes' : 'dia'}
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
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rolagem-fina rolagem-sem-tampar">

              {/* CABEÇALHO DE COLUNA — UMA vez, e DENTRO do scrollport.
                  ⚠ DENTRO, E NÃO ACIMA, POR CAUSA DA BARRA DE ROLAGEM. Fora do scrollport ele
                  teria a largura cheia enquanto as linhas perdem o gutter da barra, e as oito
                  colunas nasceriam desalinhadas do cabeçalho por alguns pixels — em overlay
                  (macOS) e clássica (Windows) por medidas DIFERENTES, o que nenhum padding fixo
                  resolve. Dentro, ele encolhe junto com as linhas por construção.
                  ⚠ E É POR ISSO QUE A FAIXA DE GRUPO GRUDA EM `top-[22px]`: as duas são sticky
                  no MESMO scrollport, e a faixa tem de parar embaixo do cabeçalho em vez de por
                  cima dele. O 22 é a altura do cabeçalho, declarada logo abaixo. */}
              {/* ⚠ NAVY, E NÃO MUTED — PR-CPR-2A.3.2. Em `text-muted-foreground` o cabeçalho
                  tinha a MESMA cor do contexto das linhas e brigava com elas: o olho não achava
                  onde a grade começa. O navy (`bg-primary`) é o tratamento que 5 telas da casa
                  já dão ao cabeçalho de lista densa dentro de um cartão — `V2Recorrencias`,
                  `FinanciamentosListaPage`, `FinanciamentoDetalhe`, `ObrigacaoDialog` e a
                  `CentralOperacoesComerciais` —, e é o mesmo `bg-primary` do `<Segmentado>` e do
                  item ativo do menu. Copiado dali, não inventado.
                  ⚠ AS DUAS TELAS QUE O BRIEFING CITOU NÃO SERVIAM DE FONTE: o `ExtratoListaTab`
                  usa `bg-background` e o `LancamentosTab` usa muted — as duas são exatamente o
                  caso que este item conserta.
                  ⚠ PRIMEIRA-MAIÚSCULA, sem `uppercase`: os rótulos já vêm escritos como se lê. */}
              <div className={cn(
                'sticky top-0 z-20 flex h-[22px] items-center gap-1.5 px-3',
                'text-[10px] font-medium tracking-wide bg-primary text-primary-foreground',
                'border-l-[3px] border-l-transparent',
              )}>
                <span className={cn(COL.vencimento, 'shrink-0')}>Venc.</span>
                <span className="min-w-0 flex-1">Descrição</span>
                <span className={cn(COL.fornecedor, 'shrink-0')}>Fornecedor</span>
                <span className={cn(COL.banco, 'shrink-0')}>Banco</span>
                <span className={cn(COL.origem, 'shrink-0')}>Origem</span>
                <span className={cn(COL.status, 'shrink-0 text-center')}>Status</span>
                <span className={cn(COL.anexo, 'shrink-0')} aria-hidden />
                <span className={cn(COL.doc, 'shrink-0')}>Doc</span>
                <span className={cn(COL.valor, 'shrink-0 text-right')}>Valor</span>
              </div>

              {grupos.map((g) => (
                <div key={g.chave}>
                  {/* ⚠ FUNDO OPACO E `z` ACIMA DAS LINHAS (A21): transparente é pior que não
                      fixar — o conteúdo passa por baixo do total que se está conferindo.
                      ⚠ E O TOTAL CAI NA COLUNA VALOR, pela mesma régua `COL` das linhas: é o
                      alinhamento que faz o total do grupo ser lido como soma da coluna, e não
                      como mais um número solto à direita. */}
                  <div className={cn(
                    'sticky top-[22px] z-10 flex h-[20px] items-center gap-1.5 border-b bg-muted px-3',
                    'border-l-[3px] border-l-transparent',
                  )}>
                    <span className={cn(
                      'min-w-0 flex-1 truncate text-[11px] font-medium tracking-wide',
                      g.vencido ? 'text-destructive' : 'text-muted-foreground',
                    )}>
                      {g.dia}
                      {/* O sufixo de contagem é contexto, não identidade do grupo: 9px. */}
                      {g.quando && (
                        <span className={cn(FONTE_QUANDO, 'ml-1 font-normal opacity-80')}>
                          · {g.quando}
                        </span>
                      )}
                    </span>
                    <span className={cn(
                      COL.valor, 'shrink-0 text-right text-[11px] font-semibold tabular-nums',
                      g.total < 0 ? 'text-destructive' : 'text-success',
                    )}>
                      {formatMoeda(Math.abs(g.total))}
                    </span>
                  </div>

                  {g.linhas.map((l) => {
                    const valor = Math.abs(Number(l.valor ?? 0));
                    const receber = ehReceber(l);
                    const grande = valor >= CORTE_DESTAQUE;
                    const status = (l.status_transacao ?? '').toLowerCase();
                    const fornecedor = (l.favorecido_id && nomesFornecedores.get(l.favorecido_id)) || '—';
                    const anexo = comAnexo?.has(l.id) ?? false;
                    const doc = (l.numero_documento ?? '').trim() ? (l.documento_formatado ?? '') : '';
                    return (
                      <button
                        key={l.id}
                        type="button"
                        disabled={!catalogosProntos || abrindo}
                        onClick={() => void abrir(l.id)}
                        title={catalogosProntos ? 'Abrir o lançamento' : 'Carregando os catálogos…'}
                        className={cn(
                          'flex h-[18px] w-full items-center gap-1.5 border-b px-3 text-left text-[10px]',
                          'transition-colors hover:bg-muted/50 disabled:cursor-default',
                          /* A faixa de 3px do destaque. `border-l-[3px]` em TODAS as linhas,
                             transparente nas comuns: sem isso o texto andaria 3px ao cruzar
                             o corte, e a lista tremeria ao trocar de filtro (A27).
                             ⚠ E A LISTRA É O DESTAQUE INTEIRO — PR-CPR-2A.3.1. Antes ela vinha
                             acompanhada de fonte maior e peso no Valor, e o efeito era o oposto
                             do pretendido: os Juros e a Amortização do Sicredi pareciam linhas
                             de outra categoria, e o olho lia TAMANHO como hierarquia numa lista
                             onde quem manda é a faixa do dia. Agora a linha do grande é
                             visualmente idêntica às outras — muda só a listra. */
                          'border-l-[3px]',
                          grande ? (receber ? 'border-l-success' : 'border-l-destructive') : 'border-l-transparent',
                        )}
                      >
                        <span className={cn(COL.vencimento, 'shrink-0 tabular-nums text-muted-foreground')}>
                          {l.data_vencimento ? format(parseISO(l.data_vencimento), 'dd/MM') : '—'}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-foreground"
                          title={l.descricao ?? undefined}>
                          {l.descricao || '—'}
                        </span>
                        <span className={cn(COL.fornecedor, 'shrink-0 truncate text-muted-foreground')}
                          title={fornecedor}>
                          {fornecedor}
                        </span>
                        <span className={cn(COL.banco, 'shrink-0 truncate text-muted-foreground')}
                          title={nomeConta(l.conta_bancaria_id)}>
                          {nomeConta(l.conta_bancaria_id)}
                        </span>
                        {/* ⚠ COM `title`: os rótulos de origem são longos de propósito
                            ("Parcela de financiamento", a 2ª mais comum, tem 24 caracteres) e
                            truncam mesmo com a coluna mais larga. Truncar sem `title` esconderia
                            o dado; com ele, o texto inteiro está a um passar de mouse. */}
                        <span className={cn(COL.origem, 'shrink-0 truncate text-muted-foreground')}
                          title={rotuloOrigem(l.origem_lancamento)}>
                          {rotuloOrigem(l.origem_lancamento)}
                        </span>
                        {/* ⚠ PÍLULA SEM BORDA. A caixa com borda em toda linha já foi revertida
                            uma vez (FIN-LISTA-VISUAL-01): numa lista densa ela compete com o
                            valor. O mapa de COR ficou, e é ele que marca o status aqui. */}
                        <span className={cn(COL.status, 'shrink-0 text-center')}>
                          <span className={cn(
                            'inline-block rounded bg-muted px-1 whitespace-nowrap', FONTE_STATUS,
                            STATUS_FILTRO_COR[status] ?? 'text-muted-foreground',
                          )}>
                            {STATUS_FILTRO_LABEL[status] ?? (status || '—')}
                          </span>
                        </span>
                        {/* ⚠ A COLUNA EXISTE EM TODA LINHA, com ou sem clipe — é ela que impede
                            o Valor de andar 14px conforme o anexo apareça ou não (A27). */}
                        {/* ⚠ O RÓTULO MORA NO `span`, NÃO NO ÍCONE: `title` não está no tipo de
                            props do lucide, e pendurá-lo no SVG reprovaria o gate de tipos. O
                            elemento que carrega a coluna é quem descreve o que ela diz.
                            Só leitura nesta fase: o clique continua sendo o da LINHA, e abre o
                            lançamento — não o anexo. */}
                        <span className={cn(COL.anexo, 'shrink-0')}
                          title={anexo ? 'tem documento anexado' : undefined}
                          aria-label={anexo ? 'tem documento anexado' : undefined}>
                          {anexo && <Paperclip className="h-2.5 w-2.5 text-muted-foreground" aria-hidden />}
                        </span>
                        {/* ⚠ Doc É O NÚMERO DA NOTA, NÃO O ANEXO, e os dois convivem: o clipe diz
                            "tem arquivo", esta coluna diz "tem nota lançada".
                            ⚠ E O CAMPO EXIGE O GUARDA DO `numero_documento` — medido: quando não
                            há número, `documento_formatado` degrada para o nome do TIPO
                            ("Fatura", "Contrato", "Nota Fiscal") ou para "-". Imprimi-lo cru
                            encheria 1.098 das 1.144 linhas visíveis com rótulos que não são
                            número nenhum. Só 46 têm documento de verdade. */}
                        <span className={cn(COL.doc, 'shrink-0 truncate text-muted-foreground', FONTE_DOC)}
                          title={doc || undefined}>
                          {doc}
                        </span>
                        <span className={cn(
                          COL.valor, 'shrink-0 text-right tabular-nums',
                          receber ? 'text-success' : 'text-destructive',
                        )}>
                          {formatMoeda(valor)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
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
function CardResumo({ rotulo, valor, classeValor, borda, quebra, nota }: {
  rotulo: string;
  valor: string;
  classeValor: string;
  borda: string;
  /**
   * A segunda linha do slot — a quebra do caixa em disponível e aplicado.
   *
   * ⚠ "APLICADO" JUNTA INVESTIMENTO E PERMUTA, e o nome é a informação: os dois são dinheiro
   * que existe e não está livre. Separá-los em duas linhas faria o operador somar de cabeça
   * para responder a única pergunta que ele tem aqui — "quanto disso paga boleto amanhã?".
   */
  quebra?: { disponivel: number; aplicado: number; aConferir: string[] };
  /**
   * A terceira linha do slot.
   * ⚠ ELA É MUTED, E NUNCA VERMELHA — decisão do PR-CPR-2A.1. O rótulo do caixa diz
   * "conciliado até 31/ago · inclui setembro não conciliado", que é INFORMAÇÃO sobre até onde
   * o número está conferido, não um defeito a corrigir. Um alarme que aparece todo mês, por
   * construção, é um alarme que o operador aprende a não ler.
   */
  nota?: string;
}) {
  return (
    <div className={cn('min-w-0 h-[76px] rounded-md border border-l-[3px] px-3 py-1.5', borda)}>
      <div className="truncate text-[11px] leading-none text-muted-foreground">{rotulo}</div>
      {/* 20px/500 — o "número de topo" do A18, que a régua da casa não negocia. */}
      <div className={cn('mt-1 truncate text-[20px] font-medium leading-none tabular-nums', classeValor)}>
        {valor}
      </div>
      {/* ⚠ A LINHA EXISTE MESMO SEM QUEBRA (`&nbsp;`), e é o que segura o A27: os três slots do
          resumo têm a MESMA altura, com ou sem conteúdo, então trocar de cliente não move o
          bloco vizinho. */}
      <div className="mt-1 flex items-baseline gap-1.5 truncate text-[9.5px] leading-none">
        {quebra ? (
          <>
            <span className="truncate text-muted-foreground">
              disponível <span className="tabular-nums text-foreground">{formatMoeda(quebra.disponivel)}</span>
              {' · '}
              aplicado <span className={cn('tabular-nums',
                quebra.aplicado < 0 ? 'text-destructive' : 'text-foreground')}>
                {formatMoeda(quebra.aplicado)}
              </span>
            </span>
            {/* ⚠ ÂMBAR, NUNCA VERMELHO, E NUNCA ESCONDER O NÚMERO. Saldo de permuta negativo —
                ou declarado que não explica os movimentos da conta — é erro de lançamento, não
                estado válido. O conserto é frente da Conciliação; daqui sai só a visibilidade. */}
            {quebra.aConferir.length > 0 && (
              <span className="shrink-0 text-amber-600 dark:text-amber-400"
                title={`Conferir: ${quebra.aConferir.join(', ')}`}>
                ⚠ confira permuta
              </span>
            )}
          </>
        ) : <span>&nbsp;</span>}
      </div>
      <div className="mt-1 truncate text-[9.5px] leading-none text-muted-foreground" title={nota}>
        {nota ?? '\u00a0'}
      </div>
    </div>
  );
}

/** Vazio com texto, nunca área em branco. */
function Vazio({ texto }: { texto: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-10">
      <p className="text-center text-[11px] text-muted-foreground">{texto}</p>
    </div>
  );
}
