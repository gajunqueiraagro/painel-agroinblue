/**
 * O ACESSO A TELA TEM UM DONO — ACESSOS-02a (piloto do financeiro, Gabriel 04/10/2026).
 *
 * A pergunta "esta pessoa acessa esta tela?" se responde AQUI, por `nivelDaTela`, e so' aqui: a lateral, o drawer, a barra do
 * celular e a rota do `V2Index` consultam; nenhum componente decide por conta propria.
 *
 * DUAS CAMADAS, nesta ordem:
 *   1. A MARCA `liberadaClientes` do item em `NAV_GRUPOS` (`navGrupos.ts`, a lista unica de telas). Sem ela, quem nao e' admin
 *      do AGROinBLUE NAO ve^ e NAO abre a tela, qualquer que seja o perfil. O piloto comeca com o minimo e libera aos poucos.
 *   2. A MATRIZ perfil × grupo (aprovada em 16/09/2026): tres niveis — nao ve^ · ve^ · edita.
 *
 * ⚠ VISIBILIDADE NAO E' PERMISSAO (o mesmo aviso do `soAdmin`): isto decide o que se OFERECE e o que a rota ABRE. O que se pode
 *   ler e gravar e' do banco (RLS, e a trava por perfil do 01F, que ainda nao existe).
 * ⚠ 'ver' x 'editar' AINDA NAO TEM EFEITO NAS TELAS: nenhuma delas tem modo somente leitura por perfil. A funcao ja' devolve o
 *   nivel; o efeito e' PR seguinte. No piloto as tres telas liberadas sao 'editar' para gestor e financeiro.
 */
import {
  HOME_LIBERADA_CLIENTES, NAV_GRUPOS, OPERACAO_COMERCIAL_LIBERADA_CLIENTES, TELA_OPERACAO_COMERCIAL,
  type NavGrupo, type NavItem, type V2Section,
} from './navGrupos';

export type NivelTela = 'nao' | 'ver' | 'editar';

/** Os perfis de membro de cliente (`cliente_membros.perfil`). O admin do AGROinBLUE nao entra na matriz: ele edita tudo. */
export type PerfilCliente = 'gestor_cliente' | 'financeiro' | 'campo' | 'leitura';

/** Os grupos da matriz: os `id` de `NAV_GRUPOS` mais a 'home' (a Visao Geral, que nao e' grupo do menu). */
export type GrupoAcesso = 'home' | 'rebanho' | 'financeiro' | 'planejamento' | 'executivo' | 'auditoria' | 'cadastros' | 'validar';

/**
 * A MATRIZ, num lugar so'. Linha = grupo do menu; coluna = perfil.
 * ⚠ "leitura" nao estava na matriz aprovada em 16/09: decisao do arquiteto, 'ver' onde o gestor tem acesso.
 * ⚠ 'validar' e' a bancada do admin: 'nao' para todo perfil de cliente.
 */
export const MATRIZ_ACESSO: Record<GrupoAcesso, Record<PerfilCliente, NivelTela>> = {
  home:         { gestor_cliente: 'ver',    financeiro: 'ver',    campo: 'ver',    leitura: 'ver' },
  rebanho:      { gestor_cliente: 'editar', financeiro: 'ver',    campo: 'editar', leitura: 'ver' },
  financeiro:   { gestor_cliente: 'editar', financeiro: 'editar', campo: 'nao',    leitura: 'ver' },
  planejamento: { gestor_cliente: 'editar', financeiro: 'editar', campo: 'nao',    leitura: 'ver' },
  executivo:    { gestor_cliente: 'ver',    financeiro: 'ver',    campo: 'nao',    leitura: 'ver' },
  auditoria:    { gestor_cliente: 'ver',    financeiro: 'ver',    campo: 'nao',    leitura: 'ver' },
  cadastros:    { gestor_cliente: 'editar', financeiro: 'editar', campo: 'nao',    leitura: 'ver' },
  validar:      { gestor_cliente: 'nao',    financeiro: 'nao',    campo: 'nao',    leitura: 'nao' },
};

/**
 * A EXCECAO POR TELA — ACESSOS-OC-01. Consultada ANTES da matriz do grupo, e so' para tela LIBERADA: da' a uma tela um nivel
 * diferente do grupo dela, sem mexer no resto do grupo. Nasce com a Operacao Comercial, que mora no grupo `rebanho` (onde o
 * financeiro so' ve^ e o campo edita) mas e' trabalho comercial e financeiro.
 * ⚠ GESTOR E FINANCEIRO (ACESSOS-OC-03a, Gabriel 05/10/2026): os dois abrem a lista e a OC. O que o financeiro NAO faz dentro
 *   dela (mover gado; mexer no combinado fisico depois do primeiro movimento; abate e boitel, ate' o 03b) e' do dono de
 *   CAPACIDADE, `podeNaOperacao` (`acessoOperacao.ts`) — aqui so' se decide quem ABRE. Campo e leitura: fora.
 * ⚠ A lista (`operacoes-comerciais`) e a tela da operacao andam JUNTAS: quem ve^ a lista abre a OC.
 */
const GESTOR_E_FINANCEIRO: Record<PerfilCliente, NivelTela> = { gestor_cliente: 'editar', financeiro: 'editar', campo: 'nao', leitura: 'nao' };
export const NIVEL_POR_TELA: Partial<Record<V2Section, Record<PerfilCliente, NivelTela>>> = {
  'operacoes-comerciais': GESTOR_E_FINANCEIRO,
  [TELA_OPERACAO_COMERCIAL]: GESTOR_E_FINANCEIRO,
};

const PERFIS: readonly string[] = ['gestor_cliente', 'financeiro', 'campo', 'leitura'];
function ehPerfilCliente(p: string | null | undefined): p is PerfilCliente {
  return !!p && PERFIS.includes(p);
}
function ehGrupoAcesso(g: string): g is GrupoAcesso {
  return Object.prototype.hasOwnProperty.call(MATRIZ_ACESSO, g);
}

/* Onde cada tela mora e se esta' liberada — lido do PROPRIO menu (nenhuma segunda lista). Tela que nao e' item de menu (rota
   interna, legado, drill) NAO tem marca: so' o admin a abre. */
let indice: Map<V2Section, { grupo: GrupoAcesso; liberada: boolean }> | null = null;
function infoDaTela(tela: V2Section): { grupo: GrupoAcesso; liberada: boolean } | null {
  if (!indice) {
    const m = new Map<V2Section, { grupo: GrupoAcesso; liberada: boolean }>();
    m.set('home', { grupo: 'home', liberada: HOME_LIBERADA_CLIENTES });
    m.set(TELA_OPERACAO_COMERCIAL, { grupo: 'rebanho', liberada: OPERACAO_COMERCIAL_LIBERADA_CLIENTES });
    for (const g of NAV_GRUPOS) {
      if (!ehGrupoAcesso(g.id)) continue;
      for (const sec of g.drawer) for (const item of sec.itens) m.set(item.id, { grupo: g.id, liberada: item.liberadaClientes === true });
    }
    indice = m;
  }
  return indice.get(tela) ?? null;
}

/**
 * O NIVEL DE ACESSO de uma pessoa a uma tela.
 * - admin do AGROinBLUE: 'editar' em tudo, como sempre (inclusive `validar` e as telas fora do menu).
 * - nao admin: tela sem a marca `liberadaClientes` -> 'nao', qualquer que seja o perfil; liberada -> a excecao da tela
 *   (`NIVEL_POR_TELA`), se houver; senao a matriz perfil × grupo.
 * - perfil desconhecido ou nulo -> 'nao' em tudo.
 */
export function nivelDaTela(perfil: string | null | undefined, isAdmin: boolean, tela: V2Section): NivelTela {
  if (isAdmin) return 'editar';
  const info = infoDaTela(tela);
  if (!info || !info.liberada) return 'nao';
  if (!ehPerfilCliente(perfil)) return 'nao';
  return NIVEL_POR_TELA[tela]?.[perfil] ?? MATRIZ_ACESSO[info.grupo][perfil];
}

/** A pessoa ve^ este item do menu? (o item anunciado e ainda nao construido segue a mesma regra: so' aparece se a tela for dela) */
export const itemVisivel = (perfil: string | null | undefined, isAdmin: boolean, item: NavItem): boolean =>
  nivelDaTela(perfil, isAdmin, item.id) !== 'nao';

/** As secoes do drawer de um grupo, so' com os itens visiveis; a secao sem item some. */
export function secoesVisiveis(perfil: string | null | undefined, isAdmin: boolean, grupo: NavGrupo): NavGrupo['drawer'] {
  return grupo.drawer
    .map((sec) => ({ ...sec, itens: sec.itens.filter((i) => itemVisivel(perfil, isAdmin, i)) }))
    .filter((sec) => sec.itens.length > 0);
}

/** Os grupos da lateral: o grupo sem nenhum item visivel some. `soAdmin` continua valendo (o grupo Validar). */
export function gruposVisiveis(perfil: string | null | undefined, isAdmin: boolean): NavGrupo[] {
  return NAV_GRUPOS.filter((g) => (!g.soAdmin || isAdmin) && secoesVisiveis(perfil, isAdmin, g).length > 0);
}

/** ACESSOS-OC-01 — a tela de ENTRADA de quem nao tem a 'home': Lançamentos Financeiros, para quem a tem. Liberar uma tela
 *  que vem antes dela no menu (a lista de Operações Comerciais) nao muda onde a pessoa entra; so' na falta dela vale a
 *  primeira permitida na ordem do menu. */
export const TELA_DE_ENTRADA_PREFERIDA: V2Section = 'financeiro-lanc';

/**
 * A PRIMEIRA TELA PERMITIDA, na ordem do menu: a Visao Geral, depois os grupos de cima para baixo. E' onde cai quem nao tem a
 * 'home' (no piloto, o financeiro cai em Lancamentos Financeiros). `null` = nenhuma tela liberada para o perfil.
 * Item "em construção" nao conta: ele nao tem tela.
 */
export function primeiraTelaPermitida(
  perfil: string | null | undefined,
  isAdmin: boolean,
  preferida: V2Section = TELA_DE_ENTRADA_PREFERIDA,
): V2Section | null {
  if (nivelDaTela(perfil, isAdmin, 'home') !== 'nao') return 'home';
  if (nivelDaTela(perfil, isAdmin, preferida) !== 'nao') return preferida;
  for (const g of gruposVisiveis(perfil, isAdmin)) {
    for (const sec of secoesVisiveis(perfil, isAdmin, g)) {
      const item = sec.itens.find((i) => !i.emConstrucao);
      if (item) return item.id;
    }
  }
  return null;
}
