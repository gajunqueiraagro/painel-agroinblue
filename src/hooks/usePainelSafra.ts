/**
 * O PAINEL DA SAFRA — o raio-x do ciclo (PR-PAINEL-SAFRA-A).
 *
 * ⚠ UMA CHAMADA, ZERO CONTA NO FRONT. `fn_painel_safra` já devolve tudo somado, e ela própria lê
 * `fn_dre_agricola_por_safra` como fonte única — a mesma que alimenta o "DRE por cultura". Somar
 * qualquer coisa aqui criaria uma segunda verdade sobre o mesmo ciclo, e o operador não teria
 * como saber qual das duas telas está certa.
 * ⚠ O QUE O FRONT DERIVA SÃO SÓ RAZÕES — R$/ha e R$/saca —, e mesmo essas partem dos números da
 * RPC. Elas não são dado novo: são o mesmo dado dividido pela área e pela produção que vieram
 * junto, e por isso não podem divergir da fonte.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Uma linha do desdobramento por centro de custo. */
export interface NaturezaCusto {
  centro: string;
  /** Quantos lançamentos formam a linha — o drill da fatia B vai precisar. */
  n: number;
  valor: number;
}

/** Uma fatia do investimento, por subcentro. */
export interface InvestimentoTipo {
  tipo: string;
  valor: number;
  valor_ha: number;
}

/**
 * A produtividade de um talhão.
 *
 * ⚠ A CHAVE É TALHÃO + VARIEDADE, não só o talhão: o mesmo pasto pode ter duas variedades na
 * mesma safra, e desde o AGRI-AREA-VARIEDADE-NA-CHAVE elas são duas linhas de `agri_safra_area`.
 * ⚠ SÓ A PRODUTIVIDADE É REAL AQUI. Custo não liga a talhão — `financeiro_lancamentos_v2` guarda
 * safra e cultura, nunca a área plantada —, e a tela diz isso por escrito em vez de dividir o
 * custo pela área e fingir que sabe de onde ele veio.
 */
export interface TalhaoProdutividade {
  talhao: string;
  variedade: string | null;
  area_ha: number;
  sacas: number;
  /** Só o grão que vale preço — `sacas` menos a roça. */
  sacas_boas: number;
  /** O refugo, em sacas. */
  roca_sacas: number;
  /**
   * Quanto das SACAS BOAS saiu acima de 20 ppb de aflatoxina, em %.
   *
   * ⚠ A BASE É O GRÃO BOM, não a produção total: o corte de 20 ppb é o que a cooperativa aplica
   * ao lote que ela compra, e a roça já está fora dessa conversa. Dividir pelo total diluiria o
   * problema justamente no talhão que mais refugou.
   * ⚠ ZERO É RESPOSTA, não ausência: 0,0% quer dizer "nenhuma carga acima do corte" — um
   * resultado bom, e a tela o escreve em vez de mostrar "—".
   */
  pct_afla20: number;
  sacas_ha: number;
  cargas: number;
}

/**
 * UMA NOTA DE ENTREGA DIRETA — uma linha de `entrega.por_nf`.
 *
 * ⚠ O COMPRADOR PASSOU A VIR DA RPC (01d). No 01c ele não existia aqui, e a coluna ficou fora da
 * tabela "Por nota" de propósito: preenchê-la casando a NF com a carga no front criaria um segundo
 * caminho para a mesma pergunta, e os dois discordariam no dia em que uma nota tivesse duas
 * indústrias. Agora quem responde é o banco — `max(comprador)` dentro do grupo da nota.
 */
export interface NotaDeEntrega {
  nf: string;
  data: string | null;
  cargas: number;
  toneladas: number;
  rendimento_g: number | null;
  valor: number;
  /** `null` quando a carga não tem indústria gravada. */
  comprador: string | null;
}

/**
 * A PONTA DE UMA FAIXA DE RENDIMENTO — a carga que rendeu menos, e a que rendeu mais.
 *
 * ⚠ ELA CARREGA DATA E NF porque o número sozinho não serve: "469 g" não diz nada; "469 g em 28/08,
 * NF 9310349" manda o produtor olhar aquele arranquio.
 * ⚠ A RPC A TIRA DE `col`, QUE É POR COLHEITA, não por carga — e nesta base dá no mesmo, porque as
 * duas metades de uma carga do backfill têm o MESMO `rendimento_g`. Anotado na migration.
 */
export interface PontaRendimento {
  g: number | null;
  data: string | null;
  nf: string | null;
}

/**
 * O BLOCO DA ENTREGA DIRETA — `fn_painel_safra_entrega`, filha de `fn_painel_safra`.
 *
 * ⚠ `null` NO BLOCO INTEIRO quando a cultura não tem carga com tonelada: a RPC devolve
 * `case when (select t from tot) is null then null`. Ausência é ausência; um objeto zerado diria
 * "entreguei nada" onde o certo é "não há entrega aqui".
 * ⚠ E OS CAMPOS DE RAZÃO SÃO `number | null` DE PROPÓSITO — `preco_t`, `servicos_t` e
 * `rendimento_medio_g` saem `null` quando não há tonelada para dividir. Lê-los com o `num()` desta
 * casa (que devolve 0) apagaria a diferença entre "R$ 0,00 por tonelada" e "ainda não sei" — foi
 * exatamente o defeito do `equilibrio` no PR-DRE-LAVOURA-03.
 */
export interface EntregaDireta {
  toneladas_bruto: number;
  desconto_t: number;
  toneladas: number;
  rendimento_medio_g: number | null;
  receita_bruta: number;
  deducoes: number;
  a_receber: number;
  preco_t: number | null;
  servicos_total: number;
  servicos_t: number | null;
  cargas: number;
  por_nf: NotaDeEntrega[];
  /** `null` quando a safra não tem carga com tonelada — a RPC nem monta o objeto. */
  rendimento_min: PontaRendimento | null;
  rendimento_max: PontaRendimento | null;
}

export interface PainelSafra {
  area_ha: number;
  /** Sacas boas + grão de roça — é o que a RPC soma. */
  total_sacas: number;
  sacas_ha: number;
  faturamento: number;
  deducoes: number;
  custo_variavel: number;
  custo_fixo: number;
  juros: number;
  rateio_compartilhado: number;
  /** Rateado por janela de datas e peso da cultura — ESTIMADO, e a tela diz isso. */
  rateio_admin: number;
  /** `resultado_caixa` do DRE — não recalculado aqui. */
  saldo: number;
  /** Fora do resultado, por decisão de modelo. Detalhe é a fatia B. */
  investimento: number;
  /** O investimento quebrado por subcentro — Formação de Área, Máquinas. */
  investimento_tipos: InvestimentoTipo[];
  /** Produtividade por talhão+variedade, do melhor para o pior. */
  talhoes: TalhaoProdutividade[];
  natureza: NaturezaCusto[];
  /** Saídas da safra que NÃO compõem DRE — existem e o operador precisa saber. */
  fora_do_custeio: number;
  /** `null` na cultura que estoca em saca — ver `EntregaDireta`. */
  entrega: EntregaDireta | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};

/**
 * ⚠ O IRMÃO QUE NÃO INVENTA ZERO. `num()` devolve 0 para `null`, e isso é o certo num total; num
 * campo que a RPC deixa nulo de propósito é o defeito do `equilibrio` (PR-DRE-LAVOURA-03): a tela
 * checava `== null` e a checagem nunca disparava, porque o parser já havia decidido por ela.
 */
/**
 * Um objeto do JSON da RPC, estreitado SEM `as` (zero-cast é regra do CLAUDE.md).
 *
 * ⚠ `Object.entries` É O ESTREITAMENTO: ele aceita o `object` que o `typeof` já provou e devolve
 * pares tipados, então a cópia nasce `Record<string, unknown>` por construção. Um `as` aqui
 * afirmaria a forma; isto a verifica.
 */
/** Uma ponta da faixa de rendimento, ou `null` quando a RPC não a montou. */
function lerPonta(v: unknown): PontaRendimento | null {
  if (v == null) return null;
  const o = objeto(v);
  return {
    g: numOuNulo(o.g),
    data: o.data == null ? null : String(o.data),
    nf: o.nf == null ? null : String(o.nf),
  };
}

function objeto(v: unknown): Record<string, unknown> {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return {};
  const saida: Record<string, unknown> = {};
  for (const [k, valor] of Object.entries(v)) saida[k] = valor;
  return saida;
}

const numOuNulo = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

export function usePainelSafra(
  clienteId: string | null | undefined,
  safraId: string | null,
  cultura: string | null,
) {
  const queryClient = useQueryClient();
  /* ⚠ A CHAVE NUMA CONSTANTE, e não repetida no `invalidateQueries`: duas listas iguais
     escritas em lugares diferentes é como nasce um recarregar que não recarrega nada — ele
     invalida uma chave que ninguém usa, sem erro e sem efeito. */
  const chave = ['painel-safra', clienteId ?? '', safraId ?? '', cultura ?? ''];
  const { data, isLoading, error } = useQuery({
    queryKey: chave,
    enabled: !!clienteId && !!safraId && !!cultura,
    queryFn: async (): Promise<PainelSafra> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_painel_safra', {
        p_cliente: clienteId,
        p_safra_id: safraId,
        p_cultura: cultura,
      });
      if (err) throw err;
      const j = (r ?? {}) as Record<string, unknown>;
      /**
       * ⚠ TUDO PASSA POR `Number`, e não é paranoia: `numeric` do Postgres chega como STRING no
       * JSON do PostgREST — "873663.36", não 873663.36. Sem a conversão, `a + b` concatenaria os
       * dois textos e o total do painel seria um número absurdo que ninguém entenderia de onde
       * veio. É o mesmo cuidado que os hooks do barter tomam nos valores.
       */
      return {
        area_ha: num(j.area_ha),
        total_sacas: num(j.total_sacas),
        sacas_ha: num(j.sacas_ha),
        faturamento: num(j.faturamento),
        deducoes: num(j.deducoes),
        custo_variavel: num(j.custo_variavel),
        custo_fixo: num(j.custo_fixo),
        juros: num(j.juros),
        rateio_compartilhado: num(j.rateio_compartilhado),
        rateio_admin: num(j.rateio_admin),
        saldo: num(j.saldo),
        investimento: num(j.investimento),
        investimento_tipos: (Array.isArray(j.investimento_tipos) ? j.investimento_tipos : [])
          .map((x: Record<string, unknown>) => ({
            tipo: String(x?.tipo ?? '—'),
            valor: num(x?.valor),
            valor_ha: num(x?.valor_ha),
          })),
        talhoes: (Array.isArray(j.talhoes) ? j.talhoes : []).map((x: Record<string, unknown>) => ({
          talhao: String(x?.talhao ?? '—'),
          /* ⚠ `null` FICA `null`, não vira '—': o traço é decisão de EXIBIÇÃO e mora na tela.
             Convertê-lo aqui faria uma variedade chamada "—" existir no dado. */
          variedade: x?.variedade == null ? null : String(x.variedade),
          area_ha: num(x?.area_ha),
          sacas: num(x?.sacas),
          sacas_ha: num(x?.sacas_ha),
          sacas_boas: num(x?.sacas_boas),
          roca_sacas: num(x?.roca_sacas),
          pct_afla20: num(x?.pct_afla20),
          cargas: num(x?.cargas),
        })),
        natureza: (Array.isArray(j.natureza) ? j.natureza : []).map((x: Record<string, unknown>) => ({
          centro: String(x?.centro ?? '—'),
          n: num(x?.n),
          valor: num(x?.valor),
        })),
        fora_do_custeio: num(j.fora_do_custeio),
        /* ⚠ O BLOCO INTEIRO PODE SER NULO, e o `&&` guarda os dois casos: cultura de saca (a RPC
           nem monta o objeto) e cultura de entrega sem nenhuma carga com tonelada. */
        entrega: j.entrega == null ? null : (() => {
          const e = objeto(j.entrega);
          return {
            toneladas_bruto: num(e.toneladas_bruto),
            desconto_t: num(e.desconto_t),
            toneladas: num(e.toneladas),
            rendimento_medio_g: numOuNulo(e.rendimento_medio_g),
            receita_bruta: num(e.receita_bruta),
            deducoes: num(e.deducoes),
            a_receber: num(e.a_receber),
            preco_t: numOuNulo(e.preco_t),
            servicos_total: num(e.servicos_total),
            servicos_t: numOuNulo(e.servicos_t),
            cargas: num(e.cargas),
            por_nf: (Array.isArray(e.por_nf) ? e.por_nf : []).map((x: Record<string, unknown>) => ({
              nf: String(x?.nf ?? '—'),
              data: x?.data == null ? null : String(x.data),
              cargas: num(x?.cargas),
              toneladas: num(x?.toneladas),
              rendimento_g: numOuNulo(x?.rendimento_g),
              valor: num(x?.valor),
              /* ⚠ `null` FICA `null`, não vira '—': o traço é decisão de EXIBIÇÃO. A mesma regra
                 da `variedade` do talhão, logo acima neste arquivo. */
              comprador: x?.comprador == null ? null : String(x.comprador),
            })),
            rendimento_min: lerPonta(e.rendimento_min),
            rendimento_max: lerPonta(e.rendimento_max),
          };
        })(),
      };
    },
  });

  /**
   * ⚠ EXPOSTO PARA A EDIÇÃO DENTRO DO DRILL — o mesmo idioma de `useLancamentosDaSafra` e de
   * `useDreAgricola`, que já devolvem o seu `recarregar`. Editar um lançamento pelo drawer muda
   * o número que a RPC soma; sem esta porta, o painel continuaria mostrando o valor velho com o
   * detalhe já corrigido logo ao lado — na mesma tela, ao mesmo tempo.
   */
  const recarregar = () => queryClient.invalidateQueries({ queryKey: chave });

  return { painel: data ?? null, carregando: isLoading, erro: error as Error | null, recarregar };
}

/**
 * O custeio total do ciclo.
 *
 * ⚠ NÃO É A SOMA DAS NATUREZAS, e é o ponto que mais confunde nesta tela. O array `natureza`
 * traz só o custeio DIRETO — o que está lançado com `safra_id` e tem centro de custo. O rateio
 * administrativo vem do DRE, por janela de datas e peso da cultura, e não tem centro nenhum.
 * Medido na 23/24: 561.069,03 de naturezas + 104.675,83 de rateio = 665.744,86.
 * ⚠ POR ISSO A TELA MOSTRA O RATEIO COMO LINHA PRÓPRIA, marcada "estimado": embutido nas
 * naturezas ele viraria um centro de custo que não existe; fora da conta, o custeio não fecharia
 * com o DRE.
 */
export function custeioTotal(p: PainelSafra): number {
  return p.custo_variavel + p.custo_fixo + p.juros
    + p.rateio_compartilhado + p.rateio_admin;
}

/** Por hectare — zero quando não há área, nunca `Infinity`. */
export function porHa(valor: number, areaHa: number): number {
  return areaHa > 0 ? valor / areaHa : 0;
}

/** Por saca — zero sem produção. É o que impede "R$ Infinity/sc" numa safra sem colheita. */
export function porSaca(valor: number, sacas: number): number {
  return sacas > 0 ? valor / sacas : 0;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
   O COMPARATIVO ENTRE SAFRAS — fatia C.
   ──────────────────────────────────────────────────────────────────────────────────────────── */

export interface SafraComparada {
  codigo: string;
  safra_id: string;
  area_ha: number;
  total_sacas: number;
  sacas_ha: number;
  sacas_boas: number;
  sacas_roca: number;
  /** Percentual da produção que saiu como roça — a régua de qualidade. */
  pct_roca: number;
  receita: number;
  /**
   * ⚠ É O CUSTEIO *DIRETO*, não o total. Só o que tem `safra_id`; o rateio administrativo fica
   * fora, porque ele é por janela de datas e não por safra. Somar `receita − custeio_direto` e
   * chamar de saldo daria um número DIFERENTE do que o DRE e a fatia A mostram para a mesma
   * safra — e a tela não faz essa conta por isso.
   */
  custeio_direto: number;
  receita_ha: number;
  /**
   * O custeio TOTAL da safra — as seis linhas de saída do DRE, rateio administrativo incluído.
   *
   * ⚠ É OUTRO NÚMERO, NÃO UM APELIDO DO `custeio_direto`. Aquele é só o que tem `safra_id`; este
   * soma deduções, custo variável, custo fixo, juros e os dois rateios. Foi por isso que a tabela
   * podia dizer "não subtraia daqui": com o direto, receita − custeio dava um saldo diferente do
   * DRE. Com o total, a margem abaixo fecha — e a ressalva deixou de ser necessária.
   */
  custeio_total: number;
  custeio_ha: number;
  /** `receita − custeio_total`, por hectare. Negativa é prejuízo — salvo receita incompleta. */
  margem_ha: number;
  /**
   * Heurística do banco: há produção mas a receita não chega a R$ 40/saca.
   * ⚠ AVISA, NUNCA CORRIGE. É o caso da 24/25, cuja venda ainda não foi lançada.
   */
  receita_incompleta: boolean;
}

export function useComparativoSafras(
  clienteId: string | null | undefined, cultura: string | null,
) {
  const queryClient = useQueryClient();
  const chave = ['painel-safra-comparativo', clienteId ?? '', cultura ?? ''];
  const { data, isLoading } = useQuery({
    queryKey: chave,
    enabled: !!clienteId && !!cultura,
    queryFn: async (): Promise<SafraComparada[]> => {
      const { data: r, error } = await (supabase as any).rpc('fn_painel_safra_comparativo', {
        p_cliente: clienteId,
        p_cultura: cultura,
      });
      if (error) throw error;
      const lista = (r as Record<string, unknown> | null)?.safras;
      return (Array.isArray(lista) ? lista : []).map((x: Record<string, unknown>) => ({
        codigo: String(x?.codigo ?? '—'),
        safra_id: String(x?.safra_id ?? ''),
        area_ha: num(x?.area_ha),
        total_sacas: num(x?.total_sacas),
        sacas_ha: num(x?.sacas_ha),
        sacas_boas: num(x?.sacas_boas),
        sacas_roca: num(x?.sacas_roca),
        pct_roca: num(x?.pct_roca),
        receita: num(x?.receita),
        custeio_direto: num(x?.custeio_direto),
        receita_ha: num(x?.receita_ha),
        custeio_total: num(x?.custeio_total),
        custeio_ha: num(x?.custeio_ha),
        margem_ha: num(x?.margem_ha),
        /* ⚠ `=== true` e não truthy: o JSON pode trazer a string "false", que é truthy e marcaria
           TODA safra como venda parcial — o aviso viraria ruído e ninguém mais o leria. */
        receita_incompleta: x?.receita_incompleta === true || x?.receita_incompleta === 'true',
      }));
    },
  });
  /* ⚠ O HISTÓRICO TAMBÉM MUDA: o lançamento editado entra no custeio direto da safra dele, que
     é coluna da tabela de baixo. Recarregar só o painel deixaria as duas discordando. */
  const recarregar = () => queryClient.invalidateQueries({ queryKey: chave });

  return { safras: data ?? [], carregando: isLoading, recarregar };
}

/**
 * A safra COLHEU?
 *
 * ⚠ É A PERGUNTA QUE SEPARA "—" DE "ZERO". A 26/27 tem 279,30 ha plantados e nenhuma carga: a
 * produtividade dela não é zero, é DESCONHECIDA — o grão ainda está no chão. Zero afirmaria
 * fracasso sobre uma safra que nem terminou.
 */
export function colheu(s: SafraComparada): boolean {
  return s.total_sacas > 0;
}
