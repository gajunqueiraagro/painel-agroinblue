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
import { aplicarPlanoNaView, type LinhaViewDoc } from '@/lib/financeiro/listaPaginadaV2';
import { montarPlanoBaseV2 } from '@/lib/financeiro/filtrosBaseV2';
import { paginarTudo } from '@/lib/financeiro/paginarTudo';
import {
  contaSemExtrato, estimarSaldoEmCaixa, grupoDoTipoConta,
  type ContaEmCaixa, type SaldoEmCaixa,
} from '@/lib/financeiro/saldoEmCaixa';
import { movimentoNaConta, type LinhaDaPosicao } from '@/hooks/useExtratoDaConta';
import { rotuloOrigem } from '@/v2/lib/origemLancamento';
import { STATUS_FILTRO_COR, STATUS_FILTRO_LABEL } from '@/lib/financeiro/statusFinanceiro';
import { formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário da tela
// ─────────────────────────────────────────────────────────────────────────────

type Horizonte = 'vencidos' | '7' | '30' | '60' | '90' | 'tudo';
type Segmento = 'pagar' | 'receber' | 'ambos';

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
 * Quantos meses para trás procurar a âncora conciliada de cada conta.
 *
 * ⚠ SEIS, E O NÚMERO FOI MEDIDO: nesta janela o cliente mais pesado (NJ) tem 3.155 realizados,
 * que cabem em quatro levas do PostgREST, e as 20 contas de todos os clientes do proto acharam
 * âncora dentro dela. Uma janela maior tornaria o card caro para atender a um caso que não
 * existe; uma menor deixaria conta sem âncora — e conta sem âncora fica FORA do total.
 */
const MESES_BUSCA_ANCORA = 6;

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
function ramoDoHorizonte(h: Horizonte, hoje: Date): string | null {
  if (h === 'tudo') return null;
  const hojeIso = isoLocal(hoje);
  if (h === 'vencidos') return `data_vencimento.lt.${hojeIso},data_vencimento.is.null`;
  const ate = limiteDoHorizonte(h, hoje);
  return `and(data_vencimento.gte.${hojeIso},data_vencimento.lte.${ate}),data_vencimento.is.null`;
}

/** "sexta · 19 set · em 3 dias" — a faixa que encabeça cada grupo. */
function faixaDaData(iso: string, hoje: Date): string {
  const d = parseISO(iso);
  const dia = format(d, "EEEE · dd MMM", { locale: ptBR });
  const n = diasAte(iso, hoje);
  const quando = n === 0 ? 'hoje'
    : n === 1 ? 'amanhã'
    : n === -1 ? 'ontem'
    : n > 0 ? `em ${n} dias`
    : `vencido há ${Math.abs(n)} dias`;
  return `${dia} · ${quando}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tela
// ─────────────────────────────────────────────────────────────────────────────

interface Grupo {
  chave: string;
  rotulo: string;
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

  const [horizonte, setHorizonte] = useState<Horizonte>('90');
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
    queryKey: ['cpr-lancs', clienteId, fazScope, horizonte, statusLigados.join(','), limite],
    enabled: !!clienteId && statusLigados.length > 0,
    queryFn: async (): Promise<LinhaViewDoc[]> => {
      if (!clienteId) return [];
      const plano = montarPlanoBaseV2(
        clienteId,
        fazScope ? { fazenda_id: fazScope } : {},
        { relacao: 'view', semRecorteTemporal: true },
      );
      const ramo = ramoDoHorizonte(horizonte, hoje);
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
    queryFn: async (): Promise<SaldoEmCaixa | null> => {
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
          .gte('data_pagamento', `${mesMinimo}-01`)
          .lte('data_pagamento', isoLocal(hoje))
          .order('id', { ascending: true })
          .range(de, de + tamanho - 1);
        if (error) throw error;
        const leva = data ?? [];
        return { linhas: leva, brutas: leva.length };
      });

      return estimarSaldoEmCaixa({
        contas, saldos: saldos ?? [], linhas, hoje: isoLocal(hoje), mesMinimo,
      });
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
        return {
          chave,
          rotulo: semData ? 'Sem vencimento' : faixaDaData(chave, hoje),
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
          {isFetching && (
            <span className="shrink-0 text-[10px] text-muted-foreground">carregando…</span>
          )}
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

        {/* RESUMO — três slots de LARGURA FIXA (A27). O `grid-cols-3` divide o espaço em
            partes iguais e independentes do conteúdo; `tabular-nums` + `truncate` seguram o
            valor dentro do slot. Trocar de horizonte muda os números e não move nada. */}
        <div className="grid grid-cols-3 gap-2">
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
            rotulo="Saldo em caixa (estimado)"
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

      {/* ── LISTA — o ÚNICO scrollport da tela (A21) ── */}
      <div className="min-h-0 flex-1 px-4 pb-2">
        <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
          {statusLigados.length === 0 ? (
            <Vazio texto="Nenhum status selecionado — ligue ao menos um acima" />
          ) : grupos.length === 0 ? (
            <Vazio texto={isFetching ? 'Carregando…' : vazioTexto} />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              {grupos.map((g) => (
                <div key={g.chave}>
                  {/* ⚠ FUNDO OPACO E `z` ACIMA DAS LINHAS (A21): transparente é pior que não
                      fixar — o conteúdo passa por baixo do total que se está conferindo. */}
                  <div className={cn(
                    'sticky top-0 z-10 flex items-center justify-between gap-2',
                    'border-b bg-muted px-3.5 py-1',
                  )}>
                    <span className={cn(
                      'truncate text-[10px] font-medium uppercase tracking-wide',
                      g.vencido ? 'text-destructive' : 'text-muted-foreground',
                    )}>
                      {g.rotulo}
                    </span>
                    <span className={cn(
                      'shrink-0 text-[11px] font-medium tabular-nums',
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
                    return (
                      <button
                        key={l.id}
                        type="button"
                        disabled={!catalogosProntos || abrindo}
                        onClick={() => void abrir(l.id)}
                        title={catalogosProntos ? 'Abrir o lançamento' : 'Carregando os catálogos…'}
                        className={cn(
                          'flex w-full items-center gap-3 border-b px-3.5 py-[7px] text-left leading-[1.35]',
                          'transition-colors hover:bg-muted/50 disabled:cursor-default',
                          /* A faixa de 3px do destaque. `border-l-[3px]` em TODAS as linhas,
                             transparente nas comuns: sem isso o texto andaria 3px ao cruzar
                             o corte, e a lista tremeria ao trocar de filtro (A27). */
                          'border-l-[3px]',
                          grande ? (receber ? 'border-l-success' : 'border-l-destructive') : 'border-l-transparent',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-foreground">
                            {l.descricao || '—'}
                          </span>
                          <span className="mt-px block truncate text-[10px] text-muted-foreground">
                            {nomeConta(l.conta_bancaria_id)}
                            {' · '}
                            {rotuloOrigem(l.origem_lancamento)}
                            {' · '}
                            {/* ⚠ PÍLULA SEM BORDA. A caixa com borda em toda linha já foi
                                revertida uma vez (FIN-LISTA-VISUAL-01): numa lista densa ela
                                compete com o valor. O mapa de COR ficou, e é ele que marca
                                o status aqui. */}
                            <span className={cn(
                              'rounded px-1 py-px text-[9.5px] font-medium bg-muted',
                              STATUS_FILTRO_COR[status] ?? 'text-muted-foreground',
                            )}>
                              {STATUS_FILTRO_LABEL[status] ?? (status || '—')}
                            </span>
                          </span>
                        </span>

                        {/* Coluna de valor com largura RESERVADA: dimensionada para
                            "R$ 9.999.999,99" — o valor nunca reflui a identidade (A27). */}
                        <span className={cn(
                          'w-[132px] shrink-0 text-right tabular-nums',
                          grande ? 'text-[14px] font-semibold' : 'text-[12px] font-medium',
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
        </div>
      </div>

      <LancamentoV2Dialog
        open={!!lancEdicao}
        carregando={!catalogosProntos}
        onClose={() => setLancEdicao(null)}
        onSave={async (form, id) => {
          const ok = id ? await fin.editarLancamento(id, form) : await fin.criarLancamento(form);
          if (ok) await queryClient.invalidateQueries({ queryKey: ['cpr-lancs'] });
          return ok;
        }}
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
