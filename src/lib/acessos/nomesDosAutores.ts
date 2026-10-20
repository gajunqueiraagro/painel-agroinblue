/**
 * O NOME DE QUEM FEZ — ACESSOS-PERFIL-01 (Gabriel, 20/10/2026). Puro: sem React e sem rede.
 *
 * A FONTE E' UMA, NO BANCO: `fn_nomes_dos_autores(cliente, ids)` (perfil.nome -> e-mail -> "usuário removido (id)"), com a
 * guarda do cliente. A tela de Acessos, a aba Auditoria do lancamento e a da OC leem SO' dela; o "nome da sessao" (o
 * `user_metadata` de quem esta' logado) saiu das tres.
 */
import { primeiroNome } from '@/components/ui/trilha-auditoria';

export type SituacaoDoAutor = 'membro ativo' | 'ex-membro' | 'consultor' | 'removido';

export interface NomeDoAutor {
  userId: string;
  nome: string;
  email: string | null;
  situacao: SituacaoDoAutor;
}

const SITUACOES: readonly string[] = ['membro ativo', 'ex-membro', 'consultor', 'removido'];
const ehSituacao = (s: string): s is SituacaoDoAutor => SITUACOES.includes(s);

/** As linhas que a RPC devolveu. Uma peca torta invalida a leitura inteira (nulo) — nunca nome inventado. */
export function lerNomesDosAutores(dado: unknown): NomeDoAutor[] | null {
  if (!Array.isArray(dado)) return null;
  const lista: NomeDoAutor[] = [];
  for (const linha of dado) {
    if (linha == null || typeof linha !== 'object') return null;
    const userId: unknown = Reflect.get(linha, 'user_id');
    const nome: unknown = Reflect.get(linha, 'nome');
    const email: unknown = Reflect.get(linha, 'email');
    const situacao: unknown = Reflect.get(linha, 'situacao');
    if (typeof userId !== 'string' || typeof nome !== 'string' || typeof situacao !== 'string' || !ehSituacao(situacao)) return null;
    if (email != null && typeof email !== 'string') return null;
    lista.push({ userId, nome, email: typeof email === 'string' ? email : null, situacao });
  }
  return lista;
}

export const mapaDosNomes = (lista: readonly NomeDoAutor[]) => new Map(lista.map((n) => [n.userId, n]));

export const FRASE_SEM_AUTOR = 'sem autor registrado';

/**
 * O AUTOR NA TRILHA. Sem autor: "sistema · <via>" quando o evento diz por onde entrou (a coluna `via` do `audit_log`,
 * AUDIT-SEG-01), senao "sem autor registrado" (evento antigo) — nunca "sistema" por conta propria. Com autor: o primeiro nome
 * da fonte unica ("usuário removido (…)" inteiro); sem resposta dela, nulo (a trilha escreve "—").
 */
export function autorNaTrilha(autorId: string | null, nomes: ReadonlyMap<string, NomeDoAutor>, via?: string | null): string | null {
  if (autorId == null) {
    const v = typeof via === 'string' ? via.trim() : '';
    if (!v) return FRASE_SEM_AUTOR;
    return v.startsWith('sistema') ? v.replace(/^sistema:?/, 'sistema · ').replace(/ · $/, '') : `sistema · ${v}`;
  }
  const n = nomes.get(autorId);
  if (!n) return null;
  return n.situacao === 'removido' ? n.nome : primeiroNome(n.nome);
}
