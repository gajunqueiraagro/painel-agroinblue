/**
 * AS REGRAS DE "QUEM GERENCIA ACESSOS" — ACESSOS-TELA-01 (Gabriel, 06/10/2026).
 *
 * Funcoes PURAS, sem Deno e sem rede: as tres edge functions (`criar-usuario`, `redefinir-senha`, `remover-membro`) as
 * consultam, e o vitest as testa do lado do front (`src/lib/acessos/regrasDeAcesso.test.ts`). Aqui se DECIDE; quem le o
 * banco (quem e' admin, quem e' gestor de qual cliente) e' a funcao que chama.
 *
 * NO PILOTO SO' O ADMIN DO AGROinBLUE GERENCIA ACESSOS. O ramo do gestor NAO foi apagado: cada funcao tem a constante
 * `GESTOR_GERENCIA_ACESSOS` (false) e a entrega aqui. ⚠ RELIGAR EXIGE A REGRA DO ALVO (`alvoPermitido`): sem ela, um gestor
 * redefinia a senha de um admin que tivesse linha em `cliente_membros` do cliente dele.
 */

export const FRASE_SO_ADMIN = "Só o administrador do AGROinBLUE gerencia acessos por enquanto.";
export const FRASE_ALVO_ADMIN = "Administrador do AGROinBLUE não é gerenciado por esta tela.";
export const FRASE_ALVO_E_O_PROPRIO = "Ninguém altera o próprio acesso por esta tela.";

/** Os perfis que esta via cria. Admin do AGROinBLUE NAO e' criavel por aqui. */
export const PERFIS_CRIAVEIS: readonly string[] = ["gestor_cliente", "financeiro", "campo", "leitura"];

export type Veredito = { ok: true } | { ok: false; status: 403; erro: string };

/**
 * QUEM PODE CHAMAR. Admin, sempre. Gestor do cliente, so' com a constante da funcao ligada E sendo gestor do cliente em
 * questao (`chamadorGestorDoCliente` — quem chama ja' conferiu no banco).
 */
export function podeGerenciarAcessos(o: {
  chamadorAdmin: boolean;
  chamadorGestorDoCliente: boolean;
  gestorGerencia: boolean;
  /** A frase de quando o gestor esta' ligado mas este chamador nao e' gestor do cliente. */
  fraseSemPermissao: string;
}): Veredito {
  if (o.chamadorAdmin) return { ok: true };
  if (!o.gestorGerencia) return { ok: false, status: 403, erro: FRASE_SO_ADMIN };
  if (o.chamadorGestorDoCliente) return { ok: true };
  return { ok: false, status: 403, erro: o.fraseSemPermissao };
}

/**
 * O ALVO. Admin do AGROinBLUE nunca e' alvo, QUEM QUER QUE CHAME (nem outro admin); e ninguem e' alvo de si mesmo
 * (nao se redefine a propria senha nem se remove por esta via).
 */
export function alvoPermitido(o: { alvoAdmin: boolean; alvoId: string; chamadorId: string }): Veredito {
  if (o.alvoId === o.chamadorId) return { ok: false, status: 403, erro: FRASE_ALVO_E_O_PROPRIO };
  if (o.alvoAdmin) return { ok: false, status: 403, erro: FRASE_ALVO_ADMIN };
  return { ok: true };
}

/** O e-mail como se compara: sem espacos nas pontas e em minusculas. */
export function normalizarEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/**
 * ACHA UM LOGIN PELO E-MAIL PERCORRENDO TODAS AS PAGINAS. `listUsers()` sem argumentos devolve so' a primeira pagina: com
 * mais usuarios que ela, o e-mail existente nao era achado e o vinculo a um segundo cliente falhava com "ja' cadastrado".
 * ⚠ A API admin do supabase-js v2 NAO tem busca por e-mail; por isso a paginacao. `listar` e' injetada (teste sem rede).
 * Para quando a pagina vem menor que o pedido, ou no teto de paginas (defesa contra laco).
 */
export async function acharLoginPorEmail<U extends { id: string; email?: string | null }>(
  email: string,
  listar: (pagina: number, porPagina: number) => Promise<U[]>,
  porPagina = 1000,
  tetoDePaginas = 200,
): Promise<U | null> {
  const alvo = normalizarEmail(email);
  if (!alvo) return null;
  for (let pagina = 1; pagina <= tetoDePaginas; pagina += 1) {
    const usuarios = await listar(pagina, porPagina);
    const achado = usuarios.find((u) => normalizarEmail(u.email) === alvo);
    if (achado) return achado;
    if (usuarios.length < porPagina) return null;
  }
  return null;
}
