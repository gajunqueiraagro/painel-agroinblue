/**
 * Dynamic Plano de Contas Builder
 * 
 * Merges the global plano de contas with client-specific dividendos
 * at runtime. Dividendos are injected under:
 *   Tipo: 2-Saídas > Macro: Distribuição > Grupo: Dividendos > Centro: Pessoas
 *   Subcentro: "Dividendos {nome}"
 *
 * REGRA CANÔNICA: Toda resolução de dividendos DEVE usar buildSubcentroDividendo()
 * para gerar o subcentro canônico. Nenhum outro ponto do sistema pode montar
 * o texto "Dividendos ..." manualmente.
 */

import { supabase } from '@/integrations/supabase/client';

// ── Constantes canônicas para dividendos ──

export const DIVIDENDO_TIPO = '2-Saídas';
export const DIVIDENDO_MACRO = 'Dividendos';
export const DIVIDENDO_GRUPO = 'Dividendos';
export const DIVIDENDO_CENTRO = 'Dividendos';
/**
 * ⚠ ERA `'pecuaria'`, E ERA UM VALOR ERRADO — NÃO UMA AUSÊNCIA (FIN-DIVIDENDO-ESCOPO-01).
 *
 * Dividendo é distribuição ao produtor: não é custo de pecuária, de lavoura nem de
 * silvicultura. O PLANO sempre soube disso — as 23 linhas de `macro_custo = 'Dividendos'` do
 * proto são `administrativo`, sem uma exceção —, mas o front nunca as lê: o
 * `loadPlanoContasCompleto` EXCLUI o macro 'Dividendos' do `select` (para não vazar o
 * dividendo de um cliente no seletor de outro) e as repõe sintetizadas a partir de
 * `financeiro_dividendos`, com estas constantes. Era aqui, e só aqui, que o escopo virava
 * pecuária.
 * ⚠ O EFEITO ERA CALADO E ERRADO NOS DOIS SENTIDOS: abrir um lançamento de dividendo marcava
 * o card Pecuária, sugeria safra de pecuária e não mostrava o aviso de safra administrativa —
 * enquanto o banco, a lista e o fechamento diziam administrativo. A tela discordava de tudo.
 * ⚠ CONSUMIDOR ÚNICO: `buildDividendoEntries`. Trocar aqui não alcança nada além do catálogo
 * do front — nenhum dado gravado muda.
 */
export const DIVIDENDO_ESCOPO = 'administrativo';

/** Prefixo NOVO (padrão oficial) */
export const DIVIDENDO_SUBCENTRO_PREFIX = 'Dividendos';

/** Prefixo LEGADO — usado apenas para compatibilidade de leitura */
export const DIVIDENDO_SUBCENTRO_PREFIX_LEGACY = 'Distribuição de Dividendos';

/** Prefixo LEGADO slash — usado apenas para compatibilidade de leitura */
export const DIVIDENDO_SUBCENTRO_PREFIX_SLASH = 'DIVIDENDOS/DIVIDENDOS/';

/**
 * Gera o subcentro canônico para um dividendo.
 * FONTE ÚNICA — todo o sistema deve usar esta função.
 * Formato oficial: "Dividendos {nome}"
 */
export function buildSubcentroDividendo(nomeDividendo: string): string {
  return `${DIVIDENDO_SUBCENTRO_PREFIX} ${nomeDividendo.trim()}`;
}

/**
 * Verifica se um subcentro pertence à família de dividendos dinâmicos.
 * Reconhece todos os formatos (novo + legados) para compatibilidade de leitura.
 */
export function isDividendoSubcentro(subcentro: string | null | undefined): boolean {
  if (!subcentro) return false;
  const s = subcentro.trim();
  // Novo padrão: "Dividendos X"
  if (s.startsWith(DIVIDENDO_SUBCENTRO_PREFIX + ' ')) return true;
  // Legado: "Distribuição de Dividendos X"
  if (s.startsWith(DIVIDENDO_SUBCENTRO_PREFIX_LEGACY + ' ')) return true;
  if (s.toUpperCase().startsWith(DIVIDENDO_SUBCENTRO_PREFIX_LEGACY.toUpperCase() + ' ')) return true;
  // Legado slash: "DIVIDENDOS/DIVIDENDOS/X"
  if (s.toUpperCase().startsWith(DIVIDENDO_SUBCENTRO_PREFIX_SLASH)) return true;
  return false;
}

/**
 * Extrai o nome do dividendo de qualquer formato de subcentro.
 * Retorna null se não for dividendo.
 */
export function extractDividendoNome(subcentro: string | null | undefined): string | null {
  if (!subcentro) return null;
  const s = subcentro.trim();
  const sUpper = s.toUpperCase();

  // Novo padrão: "Dividendos X"
  if (s.startsWith(DIVIDENDO_SUBCENTRO_PREFIX + ' ')) {
    return s.substring(DIVIDENDO_SUBCENTRO_PREFIX.length + 1).trim();
  }
  // Legado: "Distribuição de Dividendos X"
  if (s.startsWith(DIVIDENDO_SUBCENTRO_PREFIX_LEGACY + ' ')) {
    return s.substring(DIVIDENDO_SUBCENTRO_PREFIX_LEGACY.length + 1).trim();
  }
  if (sUpper.startsWith(DIVIDENDO_SUBCENTRO_PREFIX_LEGACY.toUpperCase() + ' ')) {
    return s.substring(DIVIDENDO_SUBCENTRO_PREFIX_LEGACY.length + 1).trim();
  }
  // Legado slash: "DIVIDENDOS/DIVIDENDOS/X"
  if (sUpper.startsWith(DIVIDENDO_SUBCENTRO_PREFIX_SLASH)) {
    const raw = s.substring(DIVIDENDO_SUBCENTRO_PREFIX_SLASH.length).trim();
    // Convert from UPPERCASE to Title Case
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }
  return null;
}

/**
 * Converte qualquer formato de subcentro de dividendo para o padrão canônico.
 * Retorna o subcentro inalterado se não for dividendo.
 */
export function normalizeDividendoSubcentro(subcentro: string | null | undefined): string | null {
  if (!subcentro) return null;
  const nome = extractDividendoNome(subcentro);
  if (nome) return buildSubcentroDividendo(nome);
  return subcentro;
}

export interface PlanoContasItem {
  id: string;
  tipo_operacao: string;
  macro_custo: string;
  grupo_custo: string | null;
  centro_custo: string;
  subcentro: string | null;
  escopo_negocio?: string | null;
  ativo: boolean;
  ordem_exibicao: number;
  /**
   * ⚠ ADITIVO — PR-FIN-DRE-BADGE-01. O modal mostra "Compõe DRE", e enquanto a coluna não
   * chegava aqui ele só sabia o que estava GRAVADO no lançamento: trocar o subcentro na
   * sessão não mexia no badge, e o operador via "Sim" depois de escolher uma conta que não
   * compõe. Opcional porque as linhas legadas que o hook acrescenta a partir dos
   * lançamentos não têm linha no plano — e `undefined` ali é a verdade, não uma falta.
   */
  compoe_dre?: boolean | null;
  is_dividendo?: boolean;
}

export interface Dividendo {
  id: string;
  cliente_id: string;
  nome: string;
  ativo: boolean;
  ordem_exibicao: number;
}

/**
 * Load dividendos for a specific client
 */
export async function loadDividendos(clienteId: string): Promise<Dividendo[]> {
  const { data } = await supabase
    .from('financeiro_dividendos')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('ativo', true)
    .order('ordem_exibicao');
  return (data as Dividendo[]) || [];
}

/**
 * UMA CONTA DO PLANO QUE O CLIENTE ENXERGA: a DELE (`cliente_id` = o cliente) ou uma global (`cliente_id` nulo). É a linha crua
 * de `financeiro_plano_contas`, com a ordem real — o que `loadContasDoPlanoDoCliente` devolve.
 */
export interface ContaDoPlano {
  id: string;
  cliente_id: string | null;
  tipo_operacao: string;
  macro_custo: string;
  grupo_custo: string | null;
  centro_custo: string;
  subcentro: string | null;
  escopo_negocio?: string | null;
  ativo: boolean;
  ordem_exibicao: number;
  compoe_dre?: boolean | null;
}

/** O que a regra do nome precisa de uma conta (a `ContaDoPlano` inteira serve). */
export type ContaDeDividendo = Pick<ContaDoPlano, 'id' | 'cliente_id' | 'tipo_operacao' | 'subcentro' | 'compoe_dre'>;

/** O banco trata '3-Transferência' e '3-Transferências' como o mesmo tipo; o espelho também. */
const tipoCanonico = (tipo: string) => (tipo === '3-Transferência' ? '3-Transferências' : tipo);

/**
 * A CONTA DO PLANO PELO NOME — A REGRA ÚNICA (PLANO-LEITOR-POR-CLIENTE-01, Gabriel 09/10/2026). Espelho declarado de
 * `fn_plano_conta_do_texto(cliente, subcentro, tipo)` do banco: UMA conta do cliente com aquele nome (e tipo, quando informado):
 * é ela; DUAS do cliente: nenhuma (o banco também não escolhe); nenhuma do cliente: a global, se for única. Conta de OUTRO
 * cliente nunca é lida — nem que a lista a traga. Quem procura conta do plano pelo nome, no front, pergunta aqui.
 * Sem `tipo`, vale qualquer tipo (o "existe em qualquer tipo" do banco): homônimo em dois tipos não resolve.
 */
export function contaDoPlanoPeloNome<C extends ContaDeDividendo>(
  contas: readonly C[],
  clienteId: string,
  subcentro: string,
  tipo?: string,
): C | null {
  const doNome = contas.filter(c => c.subcentro === subcentro
    && (tipo === undefined || tipoCanonico(c.tipo_operacao) === tipoCanonico(tipo)));
  const doCliente = doNome.filter(c => c.cliente_id === clienteId);
  if (doCliente.length === 1) return doCliente[0];
  if (doCliente.length > 1) return null;
  const globais = doNome.filter(c => c.cliente_id === null);
  return globais.length === 1 ? globais[0] : null;
}

/**
 * O MAPA nome → id QUE OS IMPORTADORES USAM, pela regra única: cada nome de subcentro que o cliente enxerga aponta para a conta
 * que `contaDoPlanoPeloNome` resolve (a do cliente vence a global); nome que não resolve fica FORA do mapa — acabou o
 * "o primeiro vence" sobre o plano de todos os clientes.
 */
export function mapaDeContasPeloNome(contas: readonly ContaDoPlano[], clienteId: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const nomes = new Set<string>();
  for (const c of contas) {
    if (c.subcentro && (c.cliente_id === null || c.cliente_id === clienteId)) nomes.add(c.subcentro);
  }
  for (const nome of nomes) {
    const conta = contaDoPlanoPeloNome(contas, clienteId, nome);
    if (conta) mapa.set(nome, conta.id);
  }
  return mapa;
}

/**
 * A CONTA DO PLANO DE UM DIVIDENDO DO CADASTRO — CONC-DIVIDENDOS-PLANO-01 (Gabriel, 09/10/2026).
 * O cadastro de dividendos é a aprovação: o nome do cadastro tem conta no plano do cliente, com o MESMO nome. É a regra única
 * (`contaDoPlanoPeloNome`), com o tipo do dividendo.
 */
export function contaDoDividendo(
  subcentro: string,
  clienteId: string,
  contas: readonly ContaDeDividendo[],
): ContaDeDividendo | null {
  return contaDoPlanoPeloNome(contas, clienteId, subcentro, DIVIDENDO_TIPO);
}

/**
 * A LEITURA BASE DO PLANO, UMA SÓ: as contas ATIVAS que o cliente enxerga — as dele e as globais —, na ordem do plano. Toda
 * lista de contas e todo mapa por nome do front saem daqui (`loadPlanoContasCompleto`, os importadores, o Fluxo). O filtro de
 * cliente vai NA CONSULTA: o admin enxerga, pela RLS, as contas de todos os clientes.
 */
export async function loadContasDoPlanoDoCliente(clienteId: string): Promise<ContaDoPlano[]> {
  const { data, error } = await supabase
    .from('financeiro_plano_contas')
    .select('id, cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao, compoe_dre')
    .eq('ativo', true)
    .or(`cliente_id.is.null,cliente_id.eq.${clienteId}`)
    .order('ordem_exibicao');
  if (error) throw error;
  return data ?? [];
}

/**
 * Generate dynamic subcentro entries for dividendos.
 *
 * ⚠ UMA ENTRADA POR NOME DO CADASTRO, E ELA É A DO PLANO QUANDO A CONTA EXISTE (CONC-DIVIDENDOS-PLANO-01): com conta, a
 * entrada leva o `id` da conta (uuid de verdade) e deixa de ser sintética — a Conciliação › Sem classificação a encontra e
 * o save manda a chave. Sem conta (dividendo cadastrado depois do backfill, enquanto o escritor único do cadastro não
 * existe), sobra a sintética `dividendo-<uuid>`, sem chave, como sempre. Nunca as duas: o nome não aparece em dobro.
 * A posição na lista (`ordem_exibicao`) é a de sempre, a do cadastro — a lista das telas não muda de ordem.
 */
export function buildDividendoEntries(
  dividendos: Dividendo[],
  baseOrdem: number = 9000,
  contas: readonly ContaDeDividendo[] = [],
): PlanoContasItem[] {
  return dividendos.map((d, i) => {
    const subcentro = buildSubcentroDividendo(d.nome);
    const conta = contaDoDividendo(subcentro, d.cliente_id, contas);
    return {
      id: conta ? conta.id : `dividendo-${d.id}`,
      tipo_operacao: DIVIDENDO_TIPO,
      macro_custo: DIVIDENDO_MACRO,
      grupo_custo: DIVIDENDO_GRUPO,
      centro_custo: DIVIDENDO_CENTRO,
      subcentro,
      escopo_negocio: DIVIDENDO_ESCOPO,
      ativo: true,
      ordem_exibicao: baseOrdem + i,
      ...(conta ? { compoe_dre: conta.compoe_dre } : { is_dividendo: true }),
    };
  });
}

/**
 * Load the full plano de contas (global) merged with client dividendos.
 *
 * FONTE ÚNICA da LISTA de dividendos é `financeiro_dividendos` filtrada por cliente.
 * Qualquer entrada com macro_custo='Dividendos' no plano é EXCLUÍDA da lista geral — evita vazar dividendos de
 * outros clientes nos seletores de subcentro (as 15 contas globais de macro Dividendos são nomes de cadastros de
 * clientes específicos). As contas de Dividendos servem SÓ para dar a chave ao nome que o cadastro do cliente já tem
 * (`contaDoDividendo`) — nenhuma conta entra na lista por si.
 * A LEITURA É UMA (`loadContasDoPlanoDoCliente`, cliente ou global): a lista geral deixou de ler o plano de todos os clientes.
 */
export async function loadPlanoContasCompleto(clienteId: string): Promise<PlanoContasItem[]> {
  const [contas, dividendos] = await Promise.all([
    loadContasDoPlanoDoCliente(clienteId).catch((): ContaDoPlano[] => []),
    loadDividendos(clienteId),
  ]);

  const items: PlanoContasItem[] = contas
    .filter(c => c.macro_custo !== DIVIDENDO_MACRO)
    .map(c => ({
      id: c.id,
      tipo_operacao: c.tipo_operacao,
      macro_custo: c.macro_custo,
      grupo_custo: c.grupo_custo,
      centro_custo: c.centro_custo,
      subcentro: c.subcentro,
      escopo_negocio: c.escopo_negocio,
      ativo: c.ativo,
      ordem_exibicao: c.ordem_exibicao,
      compoe_dre: c.compoe_dre,
    }));

  if (dividendos.length > 0) {
    const maxOrdem = items.reduce((max, i) => Math.max(max, i.ordem_exibicao), 0);
    const divEntries = buildDividendoEntries(dividendos, maxOrdem + 100, contas.filter(c => c.macro_custo === DIVIDENDO_MACRO));
    items.push(...divEntries);
  }

  return items;
}

/**
 * Build ClassificacaoItem[] compatible with useFinanceiroV2 from the merged plano
 */
export function planoToClassificacoes(items: PlanoContasItem[]) {
  return items
    .filter(i => i.subcentro)
    .map(i => ({
      /* ⚠ A CHAVE DO PLANO VEM JUNTO — PR-FIN-PLANO-CHAVE-02 (front). O `select` de
         `loadPlanoContasCompleto` sempre trouxe `id`; era descartado aqui, e por isso o
         modal só sabia o texto. Com ela o payload manda a chave, que o trigger
         `resolve_classificacao_from_plano` trata como fonte.
         ⚠ DIVIDENDO SEM CONTA NO PLANO NÃO TEM CHAVE, E MANDAR A DELE QUEBRARIA O SAVE (o com conta
         chega aqui com o uuid da conta e sem `is_dividendo` — CONC-DIVIDENDOS-PLANO-01). As entradas de
         dividendo são SINTETIZADAS por `buildDividendoEntries` a partir de
         `financeiro_dividendos`: o `id` delas é a string `dividendo-<uuid>`, que não é
         linha de `financeiro_plano_contas` nem sequer um uuid válido — e
         `financeiro_lancamentos_v2.plano_conta_id` é `uuid`. `undefined` aqui é a verdade,
         e o trigger resolve dividendo pelo texto (ele isenta `macro_custo = 'Dividendos'`
         do bloqueio de subcentro fora do plano). */
      id: i.is_dividendo ? undefined : i.id,
      subcentro: i.subcentro!,
      centro_custo: i.centro_custo,
      grupo_custo: i.grupo_custo || '',
      macro_custo: i.macro_custo,
      tipo_operacao: i.tipo_operacao,
      escopo_negocio: i.escopo_negocio || '',
      /* ⚠ NÃO É `|| false`: `undefined` significa "esta linha não sabe", e o badge mostra
         traço. Um `false` inventado diria "não compõe" sobre uma conta que ninguém
         classificou — que é a mentira mais fácil de acreditar. */
      compoe_dre: i.compoe_dre,
      /* ⚠ A ORDEM VEM JUNTO — PR-MESA-TRANSF-01. Ela é a IDENTIDADE de uma linha do plano
         para quem precisa achar uma conta específica sem depender do texto: a
         "Transferência entre Contas Bancárias" é a de `ordem_exibicao` 18010, e resolvê-la
         pelo nome quebraria no dia em que alguém corrigisse um acento. A coluna já vinha
         no `select` de `loadPlanoContasCompleto`; só era descartada aqui.
         ⚠ OPCIONAL PORQUE NEM TODA `ClassificacaoItem` NASCE DO PLANO: o
         `useFinanceiroV2` acrescenta as combinações vivas dos lançamentos legados, que não
         têm linha no plano e portanto não têm ordem. `undefined` ali é a verdade. */
      ordem_exibicao: i.ordem_exibicao,
    }));
}
