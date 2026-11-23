/**
 * ACESSO-CONVITE-01 PR 1 (Gabriel 03/11 10:24, D1–D7) — as regras PURAS da entrada no sistema: a senha nova, o link que chega por
 * e-mail (convite, recuperação, troca de e-mail) e as frases. A tela só desenha; nada aqui fala com o Supabase.
 *   · o link do e-mail traz `token_hash` + `type` (os templates do PR 0 apontam para `/definir-senha`) — a página nossa só VERIFICA
 *     quando a pessoa clica: o leitor de segurança do Outlook/Gmail que "abre" o link antes não queima o convite;
 *   · senha nova: a regra ÚNICA da senha (SEG-SENHA-01, `supabase/functions/_shared/regraDaSenha.ts`: 8+, com letras e números — a
 *     mesma do painel do Auth e das funções do admin; a senha provisória do Acessos também);
 *   · "Esqueci minha senha" responde SEMPRE a mesma frase (não revela quem tem login).
 */
import { FRASE_SENHA_FRACA, SENHA_MINIMA, problemaDaSenha } from '../../../supabase/functions/_shared/regraDaSenha';

/** A página que recebe o link do e-mail (fora da guarda de login; ver o `AppRouter`). */
export const CAMINHO_DEFINIR_SENHA = '/definir-senha';

/** D5 — a senha que a pessoa cria (convite, recuperação, trocar senha): a regra única. */
export const SENHA_MINIMA_NOVA = SENHA_MINIMA;

export type TipoDoLink = 'invite' | 'recovery' | 'email_change';
const TIPOS: readonly TipoDoLink[] = ['invite', 'recovery', 'email_change'];

export interface LinkDoEmail { tokenHash: string; tipo: TipoDoLink }

/** O `?token_hash=…&type=…` do link. Tipo fora dos três ou token vazio = null (a página diz "link incompleto"). */
export function lerLinkDoEmail(search: string): LinkDoEmail | null {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const tokenHash = (q.get('token_hash') ?? '').trim();
  const tipo = (q.get('type') ?? '').trim();
  if (!tokenHash || !TIPOS.some((t) => t === tipo)) return null;
  return { tokenHash, tipo: TIPOS.find((t) => t === tipo) ?? 'recovery' };
}

/** Para onde o e-mail manda a pessoa (o `redirectTo` do Supabase): a página nossa, no endereço em que o sistema está aberto. */
export function enderecoDeVolta(origem: string): string {
  return `${origem.replace(/\/+$/, '')}${CAMINHO_DEFINIR_SENHA}`;
}

export interface PendenciasDaSenha { atual?: string; nova?: string; confirmar?: string }

/** As pendências do formulário de senha nova (o erro fica NO CAMPO, nunca em toast). `pedirAtual` = o "Trocar senha" logado. */
export function pendenciasDaSenhaNova(v: { atual?: string; nova: string; confirmar: string }, pedirAtual = false): PendenciasDaSenha {
  const p: PendenciasDaSenha = {};
  if (pedirAtual && !(v.atual ?? '')) p.atual = 'Digite a sua senha atual.';
  const fraca = problemaDaSenha(v.nova);
  if (fraca) p.nova = fraca;
  else if (pedirAtual && v.nova === v.atual) p.nova = 'A senha nova precisa ser diferente da atual.';
  if (!p.nova && v.confirmar !== v.nova) p.confirmar = 'As duas senhas não são iguais.';
  return p;
}

export const temPendencia = (p: PendenciasDaSenha): boolean => !!(p.atual || p.nova || p.confirmar);

/** O título e o botão da página do link, pelo tipo. */
export function textosDoLink(tipo: TipoDoLink | null): { titulo: string; botao: string } {
  if (tipo === 'invite') return { titulo: 'Crie a sua senha', botao: 'Criar senha e entrar' };
  if (tipo === 'email_change') return { titulo: 'Confirme o seu novo e-mail', botao: 'Confirmar e-mail' };
  return { titulo: 'Crie uma nova senha', botao: 'Salvar senha e entrar' };
}

export const FRASE_LINK_INCOMPLETO = 'Este link está incompleto. Abra de novo o link do e-mail ou peça um novo em "Esqueci minha senha".';
export const FRASE_LINK_VENCIDO = 'Este link venceu ou já foi usado. Peça um novo em "Esqueci minha senha" na tela de entrada (ou ao administrador, se for um convite).';
export const FRASE_ESQUECI_ENVIADO = 'Se este e-mail estiver cadastrado, enviamos um link para criar uma nova senha. Confira a caixa de entrada e o spam.';
export const FRASE_SENHA_ALTERADA = 'Senha alterada.';
export const FRASE_SENHA_ATUAL_ERRADA = 'A senha atual não confere.';
export const FRASE_SENHA_VAZADA = 'Esta senha aparece em listas de senhas vazadas na internet: escolha outra.';

/** A frase do erro do Supabase ao VERIFICAR o link (venceu, já usado, inválido). O texto cru vai para o console, nunca para a tela. */
export function fraseDoErroDoLink(mensagem: string | null | undefined): string {
  const m = (mensagem ?? '').toLowerCase();
  if (/expired|invalid|not found|already|used|otp/.test(m)) return FRASE_LINK_VENCIDO;
  return 'Não consegui confirmar o link agora. Tente de novo em instantes.';
}

/** A frase do erro ao ENTRAR (e-mail + senha). */
export function fraseDoErroDoLogin(mensagem: string | null | undefined): string {
  const m = (mensagem ?? '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Este e-mail ainda não foi confirmado. Abra o link do convite que chegou por e-mail.';
  if (m.includes('banned') || m.includes('user is banned')) return 'Este acesso está desativado. Fale com o administrador.';
  return 'Não consegui entrar agora. Tente de novo em instantes.';
}

/** A frase do erro ao GRAVAR a senha nova (o Supabase recusa senha fraca ou igual à anterior). */
export function fraseDoErroDaSenha(mensagem: string | null | undefined): string {
  const m = (mensagem ?? '').toLowerCase();
  if (m.includes('should be different') || m.includes('same')) return 'A senha nova precisa ser diferente da atual.';
  /* senha vazada (HaveIBeenPwned, ligado no painel 23/11): o Supabase diz "Password is known to be weak and easy to guess…" */
  if (m.includes('easy to guess') || m.includes('known to be weak') || m.includes('pwned')) return FRASE_SENHA_VAZADA;
  if (m.includes('weak') || m.includes('at least') || m.includes('characters')) return FRASE_SENHA_FRACA;
  return 'Não consegui gravar a senha agora. Tente de novo em instantes.';
}
