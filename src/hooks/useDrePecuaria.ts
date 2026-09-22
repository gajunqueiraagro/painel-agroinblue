/**
 * O DRE DA PECUÁRIA — por fazenda, num período de meses.
 *
 * ⚠⚠ NENHUM CÁLCULO AQUI. `fn_dre_pecuaria` devolve cada linha já arredondada, por fazenda e no
 * total, e a tela RENDERIZA. A única divisão que fica com o consumidor é `valor / cab_media`, e
 * ela é de apresentação.
 * ⚠ DUAS VARIAÇÕES, E ELAS NÃO SE SOMAM. `vpb_operacional` = o rebanho mudou, a preço CONGELADO
 * do fechamento anterior; `efeito_mercado` = o preço mudou, rebanho congelado. Fundi-las numa
 * "variação de patrimônio" esconderia qual das duas respondeu pelo resultado — que é a pergunta
 * que o produtor faz quando o número sobe sem ele ter vendido nada.
 * ⚠ `sem_p0` / `sem_p1` SÃO DADO: fazenda sem fechamento numa das pontas vem com as duas
 * variações NULAS, e a tela mostra "—". Zero ali afirmaria que o rebanho não mudou.
 */
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** As 18 linhas da cascata, na ordem em que a RPC as nomeia. */
export interface DrePecLinhas {
  vendas: number;
  outras_receitas: number;
  receita_bruta: number;
  deducoes: number;
  receita_liquida: number;
  /** `null` sem fechamento numa das pontas. */
  vpb_operacional: number | null;
  reposicao: number;
  vbp: number;
  custo_variavel: number;
  margem: number;
  custo_fixo: number;
  rateio_adm: number;
  resultado_operacional: number;
  /**
   * ⚠ `null` NAS FAZENDAS, número só no TOTAL — DRE-PEC-RPC-02. Juros são da atividade, não de uma
   * fazenda: a RPC os soma sem filtro de fazenda e devolve `null` em cada coluna. `num()` faria o
   * `null` virar 0, e 0 afirmaria "esta fazenda não pagou juros", que é outra frase.
   */
  juros: number | null;
  resultado_periodo: number;
  /** `null` sem fechamento numa das pontas. */
  efeito_mercado: number | null;
  resultado_com_mercado: number;
  investimento: number;
  a_pagar: number;
  patrimonio: {
    v_ini_p0: number; v_fim_p0: number; v_fim_p1: number;
    cab_ini: number; cab_fim: number;
    /**
     * A MÉDIA DOS FECHAMENTOS MENSAIS de P0 até o fim, arredondada a 0 casas — o denominador do
     * R$/cab e do rateio administrativo (a regra do PC-100). No total, a soma das médias.
     */
    cab_media: number;
  };
  sem_p0: boolean;
  sem_p1: boolean;
  /** Os centros de custo de TODOS os blocos desta coluna — a tela filtra por bloco. */
  centros: CentroPec[];
  /**
   * Os centros do bloco 'juros' — só o TOTAL os tem (`total.centros_juros`); nas fazendas vem
   * vazio. São eles que as filhas da linha de juros leem.
   */
  centros_juros: CentroPec[];
}

/**
 * UM CENTRO DE CUSTO DENTRO DE UM BLOCO — PR-DRE-PECUARIA-02 §4.
 *
 * ⚠ A CHAVE É O PAR `bloco + centro`, nunca o centro sozinho: "Transferências" existe em mais de
 * um bloco, e agrupar só pelo nome somaria uma despesa de custo variável com uma de investimento.
 * ⚠ `'(sem)'` É VALOR, NÃO AUSÊNCIA — a RPC escreve `coalesce(p.centro_custo,'(sem)')`, e é o que
 * a tela tem de repassar ao filtrar a lista: mandar `null` traria o bloco inteiro.
 */
export interface CentroPec {
  bloco: string;
  centro: string;
  valor: number;
  a_pagar: number;
}

export type ChaveLinhaPec = keyof DrePecLinhas;

/**
 * O BLOCO DA RPC POR TRÁS DE CADA LINHA QUE EXPANDE.
 *
 * ⚠ SÃO NOMES DO BANCO, não rótulos: `p.bloco_dre` guarda 'venda', 'receita', 'deducao',
 * 'reposicao', 'variavel', 'fixo', 'juros' e 'investimento'. O mapa vive aqui, ao lado do parser,
 * porque quem o lê é a mesma consulta que filtra `fn_dre_pecuaria_lancamentos`.
 */
export const BLOCO_DA_LINHA: Partial<Record<ChaveLinhaPec, string>> = {
  vendas: 'venda',
  outras_receitas: 'receita',
  deducoes: 'deducao',
  reposicao: 'reposicao',
  custo_variavel: 'variavel',
  custo_fixo: 'fixo',
  juros: 'juros',
  investimento: 'investimento',
};

export interface DrePecFazenda {
  fazenda_id: string;
  nome: string;
  linhas: DrePecLinhas;
}

export interface DrePecuaria {
  periodo: { de: string; ate: string; p0: string; meses: number };
  rateio_adm: { pool: number; bruto: number; criterio: string };
  fazendas: DrePecFazenda[];
  total: DrePecLinhas;
}

/* ⚠ O POSTGREST DEVOLVE `numeric` COMO STRING. `num` normaliza; `numOuNulo` preserva o `null`,
   porque aqui ele é dado — a fazenda sem fechamento não tem variação, e isso não é zero. */
const num = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};
const numOuNulo = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

/**
 * ⚠ ESTREITAMENTO SEM `as` — zero-cast é regra do CLAUDE.md, e `Object.entries` verifica o que um
 * cast apenas afirmaria. O arquivo tem `as` antigos; código novo não acrescenta mais nenhum.
 */
function objeto(v: unknown): Record<string, unknown> {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return {};
  const saida: Record<string, unknown> = {};
  for (const [k, valor] of Object.entries(v)) saida[k] = valor;
  return saida;
}

function lerCentros(v: unknown): CentroPec[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => {
    const o = objeto(x);
    return {
      bloco: String(o.bloco ?? ''),
      centro: String(o.centro ?? '(sem)'),
      valor: num(o.valor),
      a_pagar: num(o.a_pagar),
    };
  });
}

function lerLinhas(x: unknown): DrePecLinhas {
  const o = (x ?? {}) as Record<string, unknown>;
  const p = (o.patrimonio ?? {}) as Record<string, unknown>;
  return {
    vendas: num(o.vendas),
    outras_receitas: num(o.outras_receitas),
    receita_bruta: num(o.receita_bruta),
    deducoes: num(o.deducoes),
    receita_liquida: num(o.receita_liquida),
    vpb_operacional: numOuNulo(o.vpb_operacional),
    reposicao: num(o.reposicao),
    vbp: num(o.vbp),
    custo_variavel: num(o.custo_variavel),
    margem: num(o.margem),
    custo_fixo: num(o.custo_fixo),
    rateio_adm: num(o.rateio_adm),
    resultado_operacional: num(o.resultado_operacional),
    juros: numOuNulo(o.juros),
    resultado_periodo: num(o.resultado_periodo),
    efeito_mercado: numOuNulo(o.efeito_mercado),
    resultado_com_mercado: num(o.resultado_com_mercado),
    investimento: num(o.investimento),
    a_pagar: num(o.a_pagar),
    patrimonio: {
      v_ini_p0: num(p.v_ini_p0), v_fim_p0: num(p.v_fim_p0), v_fim_p1: num(p.v_fim_p1),
      cab_ini: num(p.cab_ini), cab_fim: num(p.cab_fim), cab_media: num(p.cab_media),
    },
    sem_p0: o.sem_p0 === true,
    sem_p1: o.sem_p1 === true,
    centros: lerCentros(o.centros),
    centros_juros: lerCentros(o.centros_juros),
  };
}

/**
 * O CENÁRIO DO DRE — DRE-PEC-RPC-02. `realizado` é o padrão da RPC e daqui; `meta` é o mesmo DRE
 * sobre os lançamentos de meta. ⚠ Os dois nunca se somam: cada um é uma leitura inteira.
 */
export type CenarioPec = 'realizado' | 'meta';

/** A chave de cache de uma leitura do DRE — a mesma em `useDrePecuaria` e em `useDrePecuariaLista`,
    para que o ano anterior buscado pelo card seja o mesmo que a visão x Anos lê. */
const chaveDre = (clienteId: string | null | undefined, de: string | null, ate: string | null, cenario: CenarioPec) =>
  ['dre-pecuaria', clienteId ?? '', de ?? '', ate ?? '', cenario];

async function buscarDrePecuaria(
  clienteId: string | null | undefined, de: string | null, ate: string | null, cenario: CenarioPec,
): Promise<DrePecuaria | null> {
  const { data: r, error: err } = await (supabase as any).rpc('fn_dre_pecuaria', {
    p_cliente: clienteId, p_de: de, p_ate: ate, p_cenario: cenario,
  });
  if (err) throw err;
  const o = (r ?? null) as Record<string, unknown> | null;
  if (!o) return null;
  const per = (o.periodo ?? {}) as Record<string, unknown>;
  const ra = (o.rateio_adm ?? {}) as Record<string, unknown>;
  return {
    periodo: {
      de: String(per.de ?? ''), ate: String(per.ate ?? ''),
      p0: String(per.p0 ?? ''), meses: num(per.meses),
    },
    rateio_adm: {
      pool: num(ra.pool), bruto: num(ra.bruto), criterio: String(ra.criterio ?? ''),
    },
    fazendas: (Array.isArray(o.fazendas) ? o.fazendas : []).map((f: Record<string, unknown>) => ({
      fazenda_id: String(f?.fazenda_id ?? ''),
      nome: String(f?.nome ?? '—'),
      linhas: lerLinhas(f?.linhas),
    })),
    total: lerLinhas(o.total),
  };
}

export function useDrePecuaria(
  clienteId: string | null | undefined, de: string | null, ate: string | null,
  cenario: CenarioPec = 'realizado',
) {
  const queryClient = useQueryClient();
  /* ⚠ O CENÁRIO ENTRA NA CHAVE: sem ele, trocar para meta mostraria o realizado em cache. */
  const chave = chaveDre(clienteId, de, ate, cenario);
  const { data, isLoading, error } = useQuery({
    queryKey: chave,
    enabled: !!clienteId && !!de && !!ate,
    queryFn: () => buscarDrePecuaria(clienteId, de, ate, cenario),
  });

  /* ⚠ O PREFIXO, NÃO A `chave`: realizado, meta e os anos anteriores (`useDrePecuariaLista`) são
     todos 'dre-pecuaria'. Invalidar só a chave exata derrubava o realizado corrente e deixava meta
     e anos com o número velho até o F5 (DRE-REFRESH-01). */
  const recarregar = () => queryClient.invalidateQueries({ queryKey: ['dre-pecuaria'] });
  return { dre: data ?? null, carregando: isLoading, erro: error as Error | null, recarregar };
}

/** Um recorte de tempo e cenário que vira uma coluna — a visão x Anos pede N deles. */
export interface PeriodoPec {
  de: string;
  ate: string;
  cenario: CenarioPec;
}

/**
 * N LEITURAS DO DRE EM PARALELO — DRE-PEC-TELA-02, visão x Anos.
 *
 * ⚠ `useQueries` E NÃO N `useQuery`: o número de anos muda (1 a 5) e um hook não pode ser chamado
 * um número variável de vezes. Quem varia é a LISTA, nunca a quantidade de chamadas de hook.
 * ⚠ Cada item carrega sozinho: a coluna que falta mostra esqueleto e as outras já aparecem.
 */
export function useDrePecuariaLista(clienteId: string | null | undefined, periodos: readonly PeriodoPec[]) {
  const resultados = useQueries({
    queries: periodos.map(p => ({
      queryKey: chaveDre(clienteId, p.de, p.ate, p.cenario),
      enabled: !!clienteId,
      queryFn: () => buscarDrePecuaria(clienteId, p.de, p.ate, p.cenario),
    })),
  });
  return resultados.map((r, i) => ({
    periodo: periodos[i],
    dre: r.data ?? null,
    carregando: r.isLoading,
    erro: r.error as Error | null,
  }));
}

/**
 * O MESMO RECORTE, k ANOS ANTES — `'2026-08'` com k=2 → `'2024-08'`.
 *
 * ⚠ É −12·k MESES, e em ano-mês isso é só o ano: o mês não muda, então Mês, Ano, Safra (jul→jun)
 * e Personalizado deslocam do mesmo jeito, sem caso especial.
 */
export function anoMesAntes(am: string, k: number): string {
  return `${Number(am.slice(0, 4)) - k}${am.slice(4)}`;
}

const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * O RÓTULO CURTO DE UMA COLUNA DE ANO — "jan-ago/26", "ago/26", "jul/25-jun/26".
 *
 * ⚠ CURTO PORQUE É CABEÇALHO: a coluna tem a largura de um número. O ano aparece uma vez quando as
 * duas pontas são do mesmo ano, e nas duas quando não são (a safra jul→jun).
 */
export function rotuloCurtoPeriodo(de: string, ate: string): string {
  const m = (am: string) => MES3[Number(am.slice(5, 7)) - 1] ?? '?';
  const a = (am: string) => am.slice(2, 4);
  if (de === ate) return `${m(de)}/${a(de)}`;
  if (de.slice(0, 4) === ate.slice(0, 4)) return `${m(de)}-${m(ate)}/${a(ate)}`;
  return `${m(de)}/${a(de)}-${m(ate)}/${a(ate)}`;
}

/* ══════════════ AS LISTAS POR TRÁS DE CADA CÉLULA — §5 ══════════════ */

/**
 * Um lançamento como `fn_dre_pecuaria_lancamentos` o devolve.
 *
 * ⚠ `id` É O QUE IMPORTA MAIS: é por ele que a linha abre o Editar Lançamento, e é lá que o
 * Gabriel corrige a fazenda ou o plano — o gesto que faz a coluna errada devolver o valor.
 */
export interface LancamentoPec {
  id: string;
  data: string | null;
  descricao: string | null;
  favorecido: string | null;
  valor: number;
  status: string | null;
  fazenda: string | null;
  fazenda_id: string | null;
  centro: string | null;
  subcentro: string | null;
  bloco: string | null;
  documento: string | null;
}

/** O recorte que a célula clicada representa. `null` em fazenda = a coluna Total. */
export interface RecortePec {
  fazendaId: string | null;
  fazendaNome: string;
  bloco: string;
  /** `null` = o bloco inteiro; `'(sem)'` é um centro de verdade, não ausência. */
  centro: string | null;
  rotulo: string;
  /**
   * O PERÍODO E O CENÁRIO DA COLUNA CLICADA — DRE-PEC-TELA-02. Na visão x Anos a coluna de 2024
   * tem de abrir os lançamentos de 2024, e a coluna Meta os de meta. Ausentes, vale o período da
   * tela e o realizado — o comportamento de antes.
   */
  de?: string;
  ate?: string;
  cenario?: CenarioPec;
}

export function useDrePecuariaLancamentos(
  clienteId: string | null | undefined,
  recorte: RecortePec | null,
  de: string | null,
  ate: string | null,
  cenario: CenarioPec = 'realizado',
) {
  /* ⚠ A COLUNA MANDA: se o recorte traz período e cenário, são eles que a lista lê. */
  const deEf = recorte?.de ?? de;
  const ateEf = recorte?.ate ?? ate;
  const cenarioEf = recorte?.cenario ?? cenario;
  const { data, isLoading, error, refetch } = useQuery({
    /* ⚠ O RECORTE INTEIRO ENTRA NA CHAVE: duas células diferentes do mesmo bloco (Total e uma
       fazenda) são duas listas, e uma chave só faria a segunda mostrar a primeira. */
    queryKey: ['dre-pec-lancamentos', clienteId ?? '', recorte?.fazendaId ?? '',
      recorte?.bloco ?? '', recorte?.centro ?? '', deEf ?? '', ateEf ?? '', cenarioEf],
    enabled: !!clienteId && !!recorte && !!deEf && !!ateEf,
    queryFn: async (): Promise<LancamentoPec[]> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_dre_pecuaria_lancamentos', {
        p_cliente: clienteId,
        p_fazenda: recorte?.fazendaId ?? null,
        p_bloco: recorte?.bloco ?? null,
        p_centro: recorte?.centro ?? null,
        p_de: deEf,
        p_ate: ateEf,
        p_cenario: cenarioEf,
      });
      if (err) throw err;
      return (Array.isArray(r) ? r : []).map((x: unknown) => {
        const o = objeto(x);
        return {
          id: String(o.id ?? ''),
          data: o.data == null ? null : String(o.data),
          descricao: o.descricao == null ? null : String(o.descricao),
          favorecido: o.favorecido == null ? null : String(o.favorecido),
          valor: num(o.valor),
          status: o.status == null ? null : String(o.status),
          fazenda: o.fazenda == null ? null : String(o.fazenda),
          fazenda_id: o.fazenda_id == null ? null : String(o.fazenda_id),
          centro: o.centro == null ? null : String(o.centro),
          subcentro: o.subcentro == null ? null : String(o.subcentro),
          bloco: o.bloco == null ? null : String(o.bloco),
          documento: o.documento == null ? null : String(o.documento),
        };
      });
    },
  });
  return { lancamentos: data ?? [], carregando: isLoading, erro: error as Error | null, recarregar: refetch };
}

/* ══════════════ O PATRIMÔNIO POR CATEGORIA — §6 ══════════════ */

/**
 * Uma categoria do rebanho nas duas pontas.
 *
 * ⚠ TRÊS VALORES PARA DUAS DATAS, e é essa a chave da leitura: `v0` é o início a preço do início;
 * `v1_p0` é o FIM a preço do INÍCIO (o rebanho mudou, o preço não); `v1_p1` é o fim a preço do
 * fim. A VPB é `v1_p0 − v0` e o efeito é `v1_p1 − v1_p0`. Sem o valor do meio as duas variações
 * seriam indistinguíveis — e é justamente separá-las que o modal existe para fazer.
 */
export interface CategoriaPatrimonio {
  categoria: string;
  q0: number; pm0: number | null; pk0: number | null; v0: number;
  q1: number; pm1: number | null; pk1: number | null;
  v1_p0: number; v1_p1: number;
  vpb: number; efeito: number;
}

export interface PatrimonioPec {
  p0: string;
  p1: string;
  categorias: CategoriaPatrimonio[];
  total: {
    q0: number; v0: number; q1: number;
    v1_p0: number; v1_p1: number; vpb: number; efeito: number;
  };
}

export function useDrePecuariaPatrimonio(
  clienteId: string | null | undefined,
  fazendaId: string | null,
  de: string | null,
  ate: string | null,
  ativo: boolean,
) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dre-pec-patrimonio', clienteId ?? '', fazendaId ?? '', de ?? '', ate ?? ''],
    /* ⚠ SÓ COM O MODAL ABERTO: é uma leitura por fazenda × período, e buscá-la ao montar a grade
       daria uma ida ao banco por coluna sem ninguém para ler. */
    enabled: !!clienteId && !!de && !!ate && ativo,
    queryFn: async (): Promise<PatrimonioPec> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_dre_pecuaria_patrimonio', {
        p_cliente: clienteId, p_fazenda: fazendaId, p_de: de, p_ate: ate,
      });
      if (err) throw err;
      const o = objeto(r);
      const t = objeto(o.total);
      return {
        p0: String(o.p0 ?? ''),
        p1: String(o.p1 ?? ''),
        categorias: (Array.isArray(o.categorias) ? o.categorias : []).map((x: unknown) => {
          const c = objeto(x);
          return {
            categoria: String(c.categoria ?? '—'),
            q0: num(c.q0), pm0: numOuNulo(c.pm0), pk0: numOuNulo(c.pk0), v0: num(c.v0),
            q1: num(c.q1), pm1: numOuNulo(c.pm1), pk1: numOuNulo(c.pk1),
            v1_p0: num(c.v1_p0), v1_p1: num(c.v1_p1),
            vpb: num(c.vpb), efeito: num(c.efeito),
          };
        }),
        total: {
          q0: num(t.q0), v0: num(t.v0), q1: num(t.q1),
          v1_p0: num(t.v1_p0), v1_p1: num(t.v1_p1), vpb: num(t.vpb), efeito: num(t.efeito),
        },
      };
    },
  });
  return { patrimonio: data ?? null, carregando: isLoading, erro: error as Error | null };
}
