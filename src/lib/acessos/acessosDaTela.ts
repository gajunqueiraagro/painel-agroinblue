/**
 * O QUE A TELA DE ACESSOS OFERECE E COMO ELA LE A RESPOSTA DAS EDGE FUNCTIONS — ACESSOS-TELA-01 (Gabriel, 06/10/2026).
 * Puro: sem React e sem rede.
 */

/** O motivo dos perfis que a tela ainda nao cria (o item fica na lista, APAGADO, com ele). */
export const MOTIVO_PERFIL_AGUARDA = 'aguarda a trava de gravação no banco';

export interface PerfilDaTela {
  valor: string;
  rotulo: string;
  /** Preenchido = nao se cria por esta tela no piloto. */
  motivo: string | null;
}

/**
 * NO PILOTO SO' SE CRIAM "Gestor do Cliente" E "Financeiro". Campo e Leitura esperam a trava de gravacao por perfil no banco
 * (01F): hoje `tenant_ok` nao distingue leitura de escrita, e um login de leitura GRAVARIA. Admin do AGROinBLUE nao e' criavel.
 */
export const PERFIS_DA_TELA: readonly PerfilDaTela[] = [
  { valor: 'gestor_cliente', rotulo: 'Gestor do Cliente', motivo: null },
  { valor: 'financeiro', rotulo: 'Financeiro', motivo: null },
  { valor: 'campo', rotulo: 'Campo', motivo: MOTIVO_PERFIL_AGUARDA },
  { valor: 'leitura', rotulo: 'Leitura', motivo: MOTIVO_PERFIL_AGUARDA },
];
export const PERFIL_INICIAL = 'financeiro';

export const ROTULO_PERFIL: Record<string, string> = {
  admin_agroinblue: 'Administrador', gestor_cliente: 'Gestor do Cliente', financeiro: 'Financeiro', campo: 'Campo', leitura: 'Leitura',
};
export const ehAdminAgroinblue = (perfil: string | null | undefined) => perfil === 'admin_agroinblue';
export const MOTIVO_LINHA_ADMIN = 'administrador · gerenciado fora desta tela';
export const MOTIVO_LINHA_PROPRIA = 'você · ninguém altera o próprio acesso';

export const FRASE_CRIADO = 'Usuário criado. Passe o e-mail e a senha provisória à pessoa por canais separados.';
export const FRASE_LOGIN_EXISTENTE = 'Este e-mail já tinha login: o acesso ao cliente foi criado e a senha dele NÃO mudou.';
export const FRASE_SEM_CLIENTE = 'Escolha um cliente no topo para gerenciar os acessos.';
export const FRASE_SO_ADMIN_NA_TELA = 'Só o administrador do AGROinBLUE gerencia acessos por enquanto.';
export const SENHA_MINIMA = 6;

/** Os campos do formulario de criacao que faltam — a mensagem vai embaixo de cada um (UX-OBRIGATORIOS-01). */
export function pendenciasDoNovoAcesso(f: { nome: string; email: string; senha: string; perfil: string; fazendas: readonly string[] }) {
  const p: Partial<Record<'nome' | 'email' | 'senha' | 'perfil' | 'fazendas', string>> = {};
  if (!f.nome.trim()) p.nome = 'Informe o nome.';
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) p.email = 'Informe um e-mail válido.';
  if (f.senha.length < SENHA_MINIMA) p.senha = `Mínimo de ${SENHA_MINIMA} caracteres.`;
  if (!PERFIS_DA_TELA.some(x => x.valor === f.perfil && x.motivo == null)) p.perfil = 'Escolha um perfil.';
  if (f.fazendas.length === 0) p.fazendas = 'Marque ao menos uma fazenda.';
  return p;
}

const ROTULO_ETAPA: Record<string, string> = {
  validacao: 'validação', permissao: 'permissão', alvo: 'permissão', login: 'criação do login',
  vinculo_cliente: 'vínculo com o cliente', inesperado: 'erro inesperado',
};

function campoDeTexto(v: unknown, chave: string): string | null {
  if (v == null || typeof v !== 'object') return null;
  const x: unknown = Reflect.get(v, chave);
  return typeof x === 'string' && x.trim() !== '' ? x : null;
}

/** O resultado de `supabase.functions.invoke`, na forma que a tela escreve. */
export type RespostaDaFuncao =
  | { ok: true; loginExistente: boolean }
  | { ok: false; frase: string };

/**
 * LE O QUE A FUNCAO DEVOLVEU. ⚠ Em resposta nao-2xx o `supabase-js` poe o corpo em `error.context` (um `Response`), e
 * `data` vem nulo: a tela antiga lia so' `data.error` e por isso mostrava sempre a frase generica. Aqui a frase e' a do
 * BANCO, com a etapa em que parou ("vínculo com o cliente: …"); so' na falta dela, a generica.
 */
export async function lerRespostaDaFuncao(
  res: { data: unknown; error: unknown }, generica: string,
): Promise<RespostaDaFuncao> {
  let corpo: unknown = res.data;
  if (res.error != null) {
    const contexto: unknown = typeof res.error === 'object' ? Reflect.get(res.error, 'context') : null;
    if (contexto instanceof Response) {
      try { corpo = await contexto.clone().json(); } catch { corpo = null; }
    }
  }
  const erro = campoDeTexto(corpo, 'error');
  if (res.error == null && erro == null) {
    return { ok: true, loginExistente: corpo != null && typeof corpo === 'object' && Reflect.get(corpo, 'login_existente') === true };
  }
  const etapa = campoDeTexto(corpo, 'etapa');
  const rotulo = etapa ? ROTULO_ETAPA[etapa] ?? etapa : null;
  const frase = erro ?? campoDeTexto(res.error, 'message') ?? generica;
  return { ok: false, frase: rotulo && rotulo !== 'validação' && rotulo !== 'permissão' ? `${frase} (etapa: ${rotulo})` : frase };
}
