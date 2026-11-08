/**
 * LISTAS-DIGITAVEIS-01 — o catálogo de listas do cliente (`catalogo_itens`, 117200): a lista PADRÃO (cliente nulo) + os itens do
 * cliente, lidos por UM carregador e criados por UM escritor (`fn_catalogo_item_criar`). Hoje só a lista `motivo_morte`.
 *
 * ⚠ A TELA NUNCA GRAVA DIRETO NA TABELA (o banco recusa: só SELECT para `authenticated`). Criar é a RPC, que devolve um de três:
 *   existente (o mesmo nome ou apelido, sem acento/caixa) · parecido (até 3, a tela oferece "Usar") · criado (no grupo "Do cliente").
 * ⚠ O NOME QUE SE GRAVA É O DO BANCO (`_fn_frase_caixa`, com as siglas da casa). `fraseDoCatalogo` é só a PRÉVIA do "+ Criar".
 */
import { supabase } from '@/integrations/supabase/client';
import { normalizarParaBusca } from '@/lib/texto/busca';

export type ListaDoCatalogo = 'motivo_morte' | 'forrageira' | 'relevo' | 'textura_solo' | 'drenagem' | 'sombra' | 'sistema_pasto';

export interface ItemDoCatalogo {
  id: string;
  clienteId: string | null;
  grupo: string;
  nome: string;
  /** os termos do campo, já normalizados ("curso" → Diarreia) */
  apelidos: string[];
  ordem: number;
}

/** O que o campo escolheu: o item, ou — num lançamento antigo — só o texto gravado antes (sem item). */
export interface EscolhaDoCatalogo {
  itemId: string | null;
  nome: string;
}

export const ESCOLHA_VAZIA: EscolhaDoCatalogo = { itemId: null, nome: '' };

export const GRUPO_DO_CLIENTE = 'Do cliente';

/** A ordem da lista: o padrão pela `ordem` da semente (que já agrupa), os do cliente no fim, por nome. */
export function ordenarItens(itens: ItemDoCatalogo[]): ItemDoCatalogo[] {
  return [...itens].sort((a, b) => {
    const ca = a.clienteId ? 1 : 0;
    const cb = b.clienteId ? 1 : 0;
    if (ca !== cb) return ca - cb;
    if (ca === 1) return a.nome.localeCompare(b.nome, 'pt-BR');
    return a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

/** O item com este nome ou apelido (sem acento/caixa), como o banco decide o "existente". Padrão vence o do cliente. */
export function itemExato(itens: ItemDoCatalogo[], texto: string): ItemDoCatalogo | null {
  const k = normalizarParaBusca(texto);
  if (!k) return null;
  const casam = itens.filter((i) => normalizarParaBusca(i.nome) === k || i.apelidos.includes(k));
  return casam.find((i) => !i.clienteId) ?? casam[0] ?? null;
}

/** A prévia do nome do "+ Criar": espaços juntados, primeira maiúscula e o resto minúsculo (o banco ainda mantém as siglas). */
export function fraseDoCatalogo(texto: string): string {
  const v = (texto ?? '').trim().replace(/\s+/g, ' ');
  return v ? v[0].toLocaleUpperCase('pt-BR') + v.slice(1).toLocaleLowerCase('pt-BR') : '';
}

/**
 * O MOTIVO DA MORTE DE UM LANÇAMENTO — o leitor ÚNICO (detalhe, lista e edição).
 * ⚠ DUAS COLUNAS, CONFORME QUEM GRAVOU: a tela grava em `fazenda_destino`; a importação do histórico, em `motivo` (336 mortes do
 *   Agnaldo, RRCC e Raul abriam SEM motivo na edição e no detalhe, que só liam a primeira). Desde o PR 2 a tela grava o item
 *   (`motivo_item_id`) e o nome nas duas. `motivo` vem primeiro: é a coluna do motivo; `fazenda_destino` é a herança.
 */
export function motivoDaMorte(l: { motivo?: string | null; fazendaDestino?: string | null }): string {
  return (l.motivo ?? '').trim() || (l.fazendaDestino ?? '').trim();
}

/** A escolha gravada num lançamento de morte: o item (quando há) e o nome que o leitor único devolve. */
export function escolhaDoLancamento(l: { motivo?: string | null; fazendaDestino?: string | null; motivoItemId?: string | null }): EscolhaDoCatalogo {
  return { itemId: l.motivoItemId ?? null, nome: motivoDaMorte(l) };
}

/** A escolha mudou em relação à gravada? Só então a edição manda os campos do motivo (omitir PRESERVA o gravado). */
export function escolhaMudou(antes: EscolhaDoCatalogo, depois: EscolhaDoCatalogo): boolean {
  return (antes.itemId ?? null) !== (depois.itemId ?? null) || antes.nome.trim() !== depois.nome.trim();
}

/**
 * Os campos que a gravação manda para uma escolha (criação e edição).
 * ⚠ `fazendaDestino` CONTINUA COM O NOME NA TRANSIÇÃO: mais de dez leitores (lista do rebanho, exportação, confirmação, resumo)
 *   ainda leem o motivo da morte de lá. Sair dela é passo próprio, depois do mapeamento (PR 3).
 */
export function camposDaEscolha(e: EscolhaDoCatalogo): { motivoItemId: string | null; motivo: string | undefined; fazendaDestino: string | undefined } {
  const nome = e.nome.trim();
  return { motivoItemId: e.itemId, motivo: nome || undefined, fazendaDestino: nome || undefined };
}

interface LinhaDoCatalogo {
  id: string; cliente_id: string | null; grupo: string; nome: string; apelidos: string[] | null; ordem: number;
}

/** O carregador: o padrão + os do cliente, só os ativos. "Falhou" nunca vira lista vazia (P146): devolve o erro. */
export async function carregarCatalogo(lista: ListaDoCatalogo, clienteId: string):
  Promise<{ ok: true; valor: ItemDoCatalogo[] } | { ok: false; motivo: string }> {
  let data: LinhaDoCatalogo[] | null = null;
  try {
    const r = await (supabase as any).from('catalogo_itens')
      .select('id, cliente_id, grupo, nome, apelidos, ordem')
      .eq('lista', lista).eq('ativo', true)
      .or(`cliente_id.is.null,cliente_id.eq.${clienteId}`)
      .order('ordem');
    if (r.error) throw r.error;
    data = r.data;
  } catch (e) {
    /* a frase pronta na tela, o texto no console (OC-ABRIR-LENTO-01) */
    console.error('[catalogo] leitura', e);
    return { ok: false, motivo: 'Não consegui carregar a lista.' };
  }
  const linhas: LinhaDoCatalogo[] = data ?? [];
  return {
    ok: true,
    valor: ordenarItens(linhas
      .filter((l) => l.cliente_id === null || l.cliente_id === clienteId)
      .map((l) => ({ id: l.id, clienteId: l.cliente_id, grupo: l.grupo, nome: l.nome, apelidos: l.apelidos ?? [], ordem: l.ordem }))),
  };
}

export type ResultadoDoCriar =
  | { tipo: 'item'; item: { id: string; nome: string; grupo: string }; criado: boolean }
  | { tipo: 'parecido'; nome: string; parecidos: { id: string; nome: string; grupo: string }[] }
  | { tipo: 'recusa'; mensagem: string };

/** Interpreta a resposta do escritor. Só três desfechos; qualquer outra coisa é recusa com frase pronta. */
export function lerRespostaDoCriar(r: unknown): ResultadoDoCriar {
  const ok = campo(r, 'ok');
  const id = campo(r, 'id');
  const nome = campo(r, 'nome');
  const grupo = campo(r, 'grupo');
  if (ok === true && typeof id === 'string' && typeof nome === 'string') {
    return { tipo: 'item', item: { id, nome, grupo: typeof grupo === 'string' ? grupo : GRUPO_DO_CLIENTE }, criado: campo(r, 'criado') === true };
  }
  const lista = campo(r, 'parecidos');
  if (campo(r, 'motivo') === 'parecido' && Array.isArray(lista)) {
    const parecidos: { id: string; nome: string; grupo: string }[] = [];
    for (const p of lista) {
      const pid = campo(p, 'id');
      const pnome = campo(p, 'nome');
      const pgrupo = campo(p, 'grupo');
      if (typeof pid === 'string' && typeof pnome === 'string') parecidos.push({ id: pid, nome: pnome, grupo: typeof pgrupo === 'string' ? pgrupo : '' });
    }
    /* até 3: a 117200 agrega todos os parecidos (o `limit 3` cai depois do `jsonb_agg`); a tela corta */
    return { tipo: 'parecido', nome: typeof nome === 'string' ? nome : '', parecidos: parecidos.slice(0, 3) };
  }
  const mensagem = campo(r, 'mensagem');
  return { tipo: 'recusa', mensagem: typeof mensagem === 'string' ? mensagem : 'Não consegui criar o item.' };
}

/** Um campo de um objeto que veio do banco, sem cast. */
function campo(r: unknown, k: string): unknown {
  return r !== null && typeof r === 'object' ? Reflect.get(r, k) : undefined;
}

/** O escritor único. `ignorarParecidos` = o "Criar mesmo assim". Erro do banco vira frase pronta (o texto vai ao console). */
export async function criarItemDoCatalogo(lista: ListaDoCatalogo, clienteId: string, nome: string, ignorarParecidos: boolean): Promise<ResultadoDoCriar> {
  try {
    const { data, error } = await (supabase as any).rpc('fn_catalogo_item_criar', {
      p_cliente_id: clienteId, p_lista: lista, p_nome: nome, p_simular: false, p_ignorar_parecidos: ignorarParecidos,
    });
    if (error) {
      console.error('[catalogo] criar', error);
      return { tipo: 'recusa', mensagem: error.code === '42501' ? 'Sem acesso para criar itens neste cliente.' : 'Não consegui criar o item. Tente de novo.' };
    }
    return lerRespostaDoCriar(data);
  } catch (e) {
    console.error('[catalogo] criar', e);
    return { tipo: 'recusa', mensagem: 'Não consegui criar o item. Tente de novo.' };
  }
}
