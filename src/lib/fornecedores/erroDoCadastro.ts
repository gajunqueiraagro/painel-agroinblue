/**
 * FORN-CRIAR-DA-NOTA-ERRO (Gabriel 24/11 07:02) — REGRA: o erro de FORMATO ao criar/salvar um fornecedor diz QUAL campo e o VALOR
 * enviado; nunca o genérico "Um dos campos está em formato inválido" nem "Erro ao salvar fornecedor". Toda escrita em
 * `financeiro_fornecedores` passa a frase por aqui (`fornecedorErroUnico.test.ts` trava).
 *
 * O texto do Postgres NUNCA vai à tela (pode trazer dado): só serve para achar a coluna entre as que ESTA tela enviou; o valor que a
 * frase mostra é o NOSSO (o que foi enviado). A frase pronta do banco (P0001 / 23505 em português, "Este CPF/CNPJ já é de …") passa como
 * está. O resto cai na mensagem segura do `normalizarErro`. PURO.
 */
import { normalizarErro } from '@/lib/erroOperacional';

/** A coluna do cadastro → o rótulo da tela (o que a frase nomeia). Coluna fora daqui sai pelo nome dela. */
const ROTULO_DA_COLUNA: Readonly<Record<string, string>> = {
  cliente_id: 'Cliente', fazenda_id: 'Fazenda', nome: 'Nome', cpf_cnpj: 'CPF/CNPJ', nome_fantasia: 'Nome fantasia',
  inscricao_estadual: 'Inscrição estadual', inscricao_municipal: 'Inscrição municipal', tipo_pessoa: 'Tipo de pessoa',
  logradouro: 'Endereço', numero: 'Número', complemento: 'Complemento', bairro: 'Bairro', municipio: 'Município', uf: 'UF', cep: 'CEP',
  telefone: 'Telefone', email: 'E-mail', ativo: 'Ativo', aliases: 'Apelidos', pix_chave: 'Chave PIX', banco: 'Banco', agencia: 'Agência',
  conta: 'Conta', tipo_recebimento: 'Forma de recebimento',
};
/** os SQLSTATE de "o valor não cabe no tipo da coluna" */
const DE_FORMATO = new Set(['22P02', '22007', '22008', '22003', '22001']);

const rotulo = (coluna: string) => ROTULO_DA_COLUNA[coluna] ?? coluna;
const mostrar = (v: unknown) => (v === '' ? 'vazio' : `"${String(v)}"`);

function campoDoErro(codigo: string, mensagem: string, enviado: Readonly<Record<string, unknown>>): string | null {
  const citado = /: "(.*)"$/.exec(mensagem)?.[1];
  if (citado !== undefined) {
    const coluna = Object.keys(enviado).find((k) => enviado[k] != null && String(enviado[k]) === citado);
    if (coluna) return `${rotulo(coluna)}: formato inválido (valor ${mostrar(enviado[coluna])}). Nada foi gravado.`;
  }
  /* 22001 "value too long for type character varying(N)": o campo de texto que passa de N */
  const n = codigo === '22001' ? Number(/\((\d+)\)/.exec(mensagem)?.[1]) : NaN;
  if (Number.isFinite(n)) {
    /* o Postgres não diz a coluna: os campos de texto que passam de N (um = ele; vários = todos, cada um com o valor) */
    const longos = Object.keys(enviado).filter((k) => !k.endsWith('_id') && typeof enviado[k] === 'string' && String(enviado[k]).length > n);
    if (longos.length === 1) return `${rotulo(longos[0])}: até ${n} caracteres (enviado ${mostrar(enviado[longos[0]])}). Nada foi gravado.`;
    if (longos.length > 1) return `Um destes passa de ${n} caracteres: ${longos.map((k) => `${rotulo(k)} (${mostrar(enviado[k])})`).join(', ')}. Nada foi gravado.`;
  }
  return null;
}

/** A frase do erro ao gravar `enviado` no cadastro do fornecedor. `acao` = o que a tela tentava ("criar o fornecedor", "reativar o fornecedor"…). */
export function fraseDoErroDoFornecedor(e: unknown, enviado: Readonly<Record<string, unknown>>, acao = 'gravar o fornecedor'): string {
  const codigo = typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : '';
  const mensagem = typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string' ? e.message : '';
  if (DE_FORMATO.has(codigo)) {
    return campoDoErro(codigo, mensagem, enviado)
      ?? `Formato inválido num destes campos: ${Object.keys(enviado).filter((k) => k !== 'cliente_id').map(rotulo).join(', ')}. Nada foi gravado.`;
  }
  /* a frase pronta do banco (as travas do cadastro escrevem em português, com "Nada foi gravado") */
  if ((codigo === 'P0001' || codigo === '23505') && /[ãçéêíóúâô]|Nada foi gravado/i.test(mensagem)) return mensagem;
  return `Não foi possível ${acao}: ${normalizarErro(e, 'fornecedor').mensagem}`;
}
