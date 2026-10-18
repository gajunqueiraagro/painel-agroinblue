/**
 * FORN-CADASTRO-02 (Gabriel 18/10/2026, mock "Cadastro de Fornecedor") — o dono puro do cadastro completo: os campos do formulário,
 * o que o banco recebe, "O que falta" e as pendências por aba, e o que o XML da NF-e completa (só campo vazio, nunca sobrescreve).
 * `nome` é a RAZÃO SOCIAL. Reusadas (nada duplicado): forma preferida = `tipo_recebimento`, titular = `nome_favorecido`, documento
 * do titular = `cpf_cnpj_pagamento`.
 */
import type { EmitenteNFe } from '@/lib/financeiro/nfe/tipos';

export interface DadosDoFornecedor {
  nome: string; nome_fantasia: string; tipo_pessoa: '' | 'PJ' | 'PF'; cpf_cnpj: string; ativo: boolean;
  inscricao_estadual: string; inscricao_municipal: string;
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string; municipio: string; uf: string;
  email: string; telefone: string; celular: string; contato_nome: string;
  tipo_recebimento: string; pix_tipo_chave: string; pix_chave: string; banco: string; agencia: string; conta: string; tipo_conta: string;
  nome_favorecido: string; cpf_cnpj_pagamento: string; observacao_pagamento: string;
  fazenda_id: string; plano_padrao_id: string; observacao: string;
}
export type CampoDoFornecedor = keyof DadosDoFornecedor;
const TEXTOS: CampoDoFornecedor[] = ['nome', 'nome_fantasia', 'cpf_cnpj', 'inscricao_estadual', 'inscricao_municipal', 'cep', 'logradouro', 'numero',
  'complemento', 'bairro', 'municipio', 'uf', 'email', 'telefone', 'celular', 'contato_nome', 'tipo_recebimento', 'pix_tipo_chave', 'pix_chave',
  'banco', 'agencia', 'conta', 'tipo_conta', 'nome_favorecido', 'cpf_cnpj_pagamento', 'observacao_pagamento', 'fazenda_id', 'plano_padrao_id', 'observacao'];

export const VAZIO: DadosDoFornecedor = {
  nome: '', nome_fantasia: '', tipo_pessoa: '', cpf_cnpj: '', ativo: true, inscricao_estadual: '', inscricao_municipal: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '', email: '', telefone: '', celular: '', contato_nome: '',
  tipo_recebimento: '', pix_tipo_chave: '', pix_chave: '', banco: '', agencia: '', conta: '', tipo_conta: '', nome_favorecido: '',
  cpf_cnpj_pagamento: '', observacao_pagamento: '', fazenda_id: '', plano_padrao_id: '', observacao: '',
};

const txt = (v: unknown): string => (typeof v === 'string' ? v : '');
/** A linha do banco (ou o que o hospedeiro entregou) -> o formulário. Campo ausente = vazio. */
export function dadosDaLinha(l: Record<string, unknown>): DadosDoFornecedor {
  const d: DadosDoFornecedor = { ...VAZIO };
  for (const c of TEXTOS) Object.assign(d, { [c]: txt(l[c]) });
  d.tipo_pessoa = l.tipo_pessoa === 'PJ' || l.tipo_pessoa === 'PF' ? l.tipo_pessoa : '';
  d.ativo = l.ativo !== false;
  return d;
}

/** O que o banco recebe: texto aparado, vazio = nulo; UF em maiúsculas. O documento vem PRONTO do validador único (quem chama). */
export function payloadDoFornecedor(d: DadosDoFornecedor, documento: string | null): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const c of TEXTOS) p[c] = String(d[c] ?? '').trim() || null;
  p.cpf_cnpj = documento;
  p.uf = d.uf.trim().toUpperCase() || null;
  p.tipo_pessoa = d.tipo_pessoa || null;
  p.ativo = d.ativo;
  return p;
}

/* ── formas de pagamento: os valores GRAVADOS de sempre (`tipo_recebimento`), com o rótulo do mock ── */
export const FORMA_PIX = 'PIX';
export const FORMA_TED = 'Transferência Bancária';
export const FORMA_BOLETO = 'Boleto';
export const FORMAS_PREFERIDAS: { valor: string; rotulo: string }[] = [
  { valor: FORMA_PIX, rotulo: 'Pix' }, { valor: FORMA_TED, rotulo: 'TED' }, { valor: FORMA_BOLETO, rotulo: 'Boleto' },
];
export const rotuloDaForma = (v: string): string => FORMAS_PREFERIDAS.find((f) => f.valor === v)?.rotulo ?? v;

/* ── "O que falta" e as pendências por aba ── */
export type AbaDoFornecedor = 'dados' | 'endereco' | 'pagamento' | 'padroes' | 'uso';
export interface Falta { aba: AbaDoFornecedor; texto: string }

export function oQueFalta(d: DadosDoFornecedor, opcoes: { documentoInvalido: boolean; duplicadoCom: string | null }): Falta[] {
  const f: Falta[] = [];
  if (!d.nome.trim()) f.push({ aba: 'dados', texto: 'razão social' });
  if (!d.cpf_cnpj.trim()) f.push({ aba: 'dados', texto: 'CNPJ/CPF' });
  else if (opcoes.documentoInvalido) f.push({ aba: 'dados', texto: 'CNPJ/CPF inválido' });
  if (opcoes.duplicadoCom) f.push({ aba: 'dados', texto: `CNPJ duplicado (${opcoes.duplicadoCom})` });
  if (!d.contato_nome.trim()) f.push({ aba: 'endereco', texto: 'pessoa de contato' });
  if (d.tipo_recebimento === FORMA_TED && (!d.banco.trim() || !d.agencia.trim() || !d.conta.trim())) f.push({ aba: 'pagamento', texto: 'banco, agência e conta (TED)' });
  if (d.tipo_recebimento === FORMA_PIX && !d.pix_chave.trim()) f.push({ aba: 'pagamento', texto: 'chave Pix' });
  return f;
}
export const abasComPendencia = (faltas: readonly Falta[]): Set<AbaDoFornecedor> => new Set(faltas.map((x) => x.aba));

/* ── o XML da NF-e completa o cadastro: só campo VAZIO, nunca sobrescreve ── */
export type CampoDoEmitente = 'nome_fantasia' | 'inscricao_estadual' | 'tipo_pessoa' | 'logradouro' | 'numero' | 'complemento' | 'bairro'
  | 'municipio' | 'uf' | 'cep' | 'telefone';
export type PatchDoEmitente = Partial<Record<CampoDoEmitente, string>>;
export function completarPeloEmitente(atual: Partial<Record<CampoDoFornecedor, unknown>>, e: EmitenteNFe): PatchDoEmitente {
  const vazio = (c: CampoDoFornecedor) => txt(atual[c]).trim() === '';
  const p: PatchDoEmitente = {};
  const poe = (c: CampoDoEmitente, v: string | null | undefined) => { if (v && v.trim() && vazio(c)) p[c] = v.trim(); };
  poe('nome_fantasia', e.fantasia);
  poe('inscricao_estadual', e.ie);
  if (vazio('tipo_pessoa')) p.tipo_pessoa = e.documento.length === 11 ? 'PF' : 'PJ';
  const end = e.endereco;
  if (end) {
    poe('logradouro', end.logradouro); poe('numero', end.numero); poe('complemento', end.complemento); poe('bairro', end.bairro);
    poe('municipio', end.municipio); poe('uf', end.uf?.toUpperCase() ?? null); poe('telefone', end.telefone);
    poe('cep', end.cep && end.cep.length === 8 ? `${end.cep.slice(0, 5)}-${end.cep.slice(5)}` : end.cep);
  }
  return p;
}

/* ── catálogo curto dos bancos (o seletor com busca); valor gravado = o texto, como sempre ── */
export const BANCOS: string[] = [
  '001 · Banco do Brasil', '033 · Santander', '041 · Banrisul', '070 · BRB', '077 · Inter', '104 · Caixa Econômica Federal',
  '133 · Cresol', '136 · Unicred', '208 · BTG Pactual', '212 · Banco Original', '237 · Bradesco', '260 · Nubank', '290 · PagBank',
  '323 · Mercado Pago', '336 · C6 Bank', '341 · Itaú', '380 · PicPay', '389 · Mercantil do Brasil', '422 · Safra', '748 · Sicredi',
  '756 · Sicoob', '745 · Citibank', '655 · Votorantim', '197 · Stone',
];
