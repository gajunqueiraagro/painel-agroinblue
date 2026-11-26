/**
 * FOLHA-FUNC-CADASTRO-01 (Gabriel 25/11/2026 09:06, mock aprovado `folha-funcionario-cadastro-ref`) — a aba Cadastro COMPLETA do
 * funcionário, em blocos com selo: Dados pessoais · Contrato · Documentos · Contato e endereço · Pagamento. Só regra (sem React).
 * ⚠ PAGAMENTO E CONTATO MORAM NO FAVORECIDO (financeiro_fornecedores, fonte única): a ficha os EDITA, mas grava pelo gravador de campo
 *   do favorecido (`fn_fornecedor_atualizar_campos`: prévia, trilha por campo, desfazer) — e manda só o que MUDOU (`camposQueMudaram`).
 * ⚠ Arquivo PRÓPRIO (e não o `folhaTela.ts`): aquele é alcançado pelo lançamento em 17 telas fora da Folha, e o gate de tela põe sob a
 *   régua de fonte toda tela que o diff alcança.
 */
import { cpfBR, ehLinha, numOuNulo, txt, type CadastroFuncionario, type FormFuncionario, type Linha } from '@/lib/folha/folhaTela';
import { aAtualizarDe } from '@/lib/folha/admissao';

/* ── as opções (os valores são os que o banco aceita: CHECK do lote 118720 e os de sempre do cadastro do fornecedor) ── */
export const SEXOS: ReadonlyArray<{ valor: string; rotulo: string }> = [{ valor: 'F', rotulo: 'Feminino' }, { valor: 'M', rotulo: 'Masculino' }];
export const ESTADOS_CIVIS: ReadonlyArray<{ valor: string; rotulo: string }> = [
  { valor: 'solteiro', rotulo: 'Solteiro(a)' }, { valor: 'casado', rotulo: 'Casado(a)' }, { valor: 'uniao_estavel', rotulo: 'União estável' },
  { valor: 'divorciado', rotulo: 'Divorciado(a)' }, { valor: 'separado', rotulo: 'Separado(a)' }, { valor: 'viuvo', rotulo: 'Viúvo(a)' },
];
export const JORNADAS: ReadonlyArray<{ valor: string; rotulo: string }> = [
  { valor: '44h', rotulo: '44 h semanais' }, { valor: '40h', rotulo: '40 h semanais' }, { valor: '36h', rotulo: '36 h semanais' },
  { valor: '30h', rotulo: '30 h semanais' }, { valor: '25h', rotulo: '25 h semanais' }, { valor: '20h', rotulo: '20 h semanais' },
  { valor: '12x36', rotulo: '12 × 36' }, { valor: 'outra', rotulo: 'Outra' },
];
export const CNH_CATEGORIAS: ReadonlyArray<string> = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'];
/** a forma: os valores GRAVADOS de sempre do favorecido (`tipo_recebimento`); "Dinheiro" é nova (a folha paga em espécie) */
export const FORMA_PIX = 'PIX';
export const FORMA_TED = 'Transferência Bancária';
export const FORMA_DINHEIRO = 'Dinheiro';
export const FORMAS_DA_FICHA: ReadonlyArray<{ valor: string; rotulo: string }> = [
  { valor: FORMA_PIX, rotulo: 'Pix' }, { valor: FORMA_TED, rotulo: 'TED' }, { valor: FORMA_DINHEIRO, rotulo: 'Dinheiro' },
];
export const TIPOS_CHAVE_PIX: ReadonlyArray<string> = ['CPF', 'CNPJ', 'Telefone', 'E-mail', 'Aleatória'];
export const TIPOS_CONTA: ReadonlyArray<string> = ['Salário', 'Corrente', 'Poupança'];
/** o dia do pagamento: "5u" = 5º dia útil; "10" = dia 10 */
export const DIAS_DE_PAGAMENTO: ReadonlyArray<{ valor: string; rotulo: string }> = [
  ...Array.from({ length: 10 }, (_, i) => ({ valor: `${i + 1}u`, rotulo: `${i + 1}º dia útil` })),
  ...Array.from({ length: 31 }, (_, i) => ({ valor: String(i + 1), rotulo: `dia ${i + 1}` })),
];

/* ── o que vem do banco ── */
export interface ExtrasDoFuncionario {
  sexo: string | null; estado_civil: string | null; dependentes: number | null; jornada: string | null; fazenda_registro_id: string | null;
  experiencia_ate: string | null; rg: string | null; cnh_categoria: string | null; cnh_validade: string | null; contato_emergencia: string | null;
  dia_pagamento: number | null; dia_pagamento_util: boolean;
}
/** os campos do favorecido que a ficha EDITA (todos aceitos pelo `fn_fornecedor_atualizar_campos` desde o lote 118720) */
export type CampoDoFavorecido = 'tipo_recebimento' | 'pix_tipo_chave' | 'pix_chave' | 'banco' | 'agencia' | 'conta' | 'tipo_conta'
  | 'cpf_cnpj_pagamento' | 'celular' | 'email' | 'logradouro' | 'cep';
export const CAMPOS_DO_FAVORECIDO: ReadonlyArray<CampoDoFavorecido> = [
  'tipo_recebimento', 'pix_tipo_chave', 'pix_chave', 'banco', 'agencia', 'conta', 'tipo_conta', 'cpf_cnpj_pagamento', 'celular', 'email', 'logradouro', 'cep',
];
export type FavorecidoDaFicha = { id: string; nome: string } & Record<CampoDoFavorecido, string | null>;

export function extrasDaLinha(r: Linha): ExtrasDoFuncionario {
  return {
    sexo: txt(r.sexo), estado_civil: txt(r.estado_civil), dependentes: numOuNulo(r.dependentes), jornada: txt(r.jornada),
    fazenda_registro_id: txt(r.fazenda_registro_id), experiencia_ate: txt(r.experiencia_ate), rg: txt(r.rg), cnh_categoria: txt(r.cnh_categoria),
    cnh_validade: txt(r.cnh_validade), contato_emergencia: txt(r.contato_emergencia), dia_pagamento: numOuNulo(r.dia_pagamento),
    dia_pagamento_util: r.dia_pagamento_util === true,
  };
}
export function favorecidoDaLinha(r: unknown): FavorecidoDaFicha | null {
  if (!ehLinha(r) || typeof r.id !== 'string') return null;
  const f: FavorecidoDaFicha = {
    id: r.id, nome: txt(r.nome) ?? '', tipo_recebimento: null, pix_tipo_chave: null, pix_chave: null, banco: null, agencia: null, conta: null,
    tipo_conta: null, cpf_cnpj_pagamento: null, celular: null, email: null, logradouro: null, cep: null,
  };
  for (const c of CAMPOS_DO_FAVORECIDO) f[c] = txt(r[c]);
  return f;
}

/* ── o formulário (texto de tela) ── */
export type FormFavorecido = Record<CampoDoFavorecido, string>;
export interface FormExtras {
  sexo: string; estado_civil: string; dependentes: string; jornada: string; fazenda_registro_id: string; experiencia_ate: string; rg: string;
  cnh_categoria: string; cnh_validade: string; contato_emergencia: string; dia: string;
}
export const EXTRAS_VAZIO: FormExtras = {
  sexo: '', estado_civil: '', dependentes: '', jornada: '', fazenda_registro_id: '', experiencia_ate: '', rg: '', cnh_categoria: '', cnh_validade: '',
  contato_emergencia: '', dia: '',
};
export const FAVORECIDO_VAZIO: FormFavorecido = {
  tipo_recebimento: '', pix_tipo_chave: '', pix_chave: '', banco: '', agencia: '', conta: '', tipo_conta: '', cpf_cnpj_pagamento: '', celular: '', email: '',
  logradouro: '', cep: '',
};
export const diaDoForm = (dia: number | null, util: boolean): string => (dia == null ? '' : `${dia}${util ? 'u' : ''}`);
export function formDosExtras(e: ExtrasDoFuncionario): FormExtras {
  return {
    sexo: e.sexo ?? '', estado_civil: e.estado_civil ?? '', dependentes: e.dependentes == null ? '' : String(e.dependentes), jornada: e.jornada ?? '',
    fazenda_registro_id: e.fazenda_registro_id ?? '', experiencia_ate: e.experiencia_ate ?? '', rg: e.rg ?? '', cnh_categoria: e.cnh_categoria ?? '',
    cnh_validade: e.cnh_validade ?? '', contato_emergencia: e.contato_emergencia ?? '', dia: diaDoForm(e.dia_pagamento, e.dia_pagamento_util),
  };
}
export function formDoFavorecido(f: FavorecidoDaFicha | null): FormFavorecido {
  const out: FormFavorecido = { ...FAVORECIDO_VAZIO };
  if (!f) return out;
  for (const c of CAMPOS_DO_FAVORECIDO) out[c] = c === 'cpf_cnpj_pagamento' && f[c] && f[c]?.length === 11 ? cpfBR(f[c]) : f[c] ?? '';
  return out;
}

/** o pedido do funcionário: as chaves novas (o resto vem do `pedidoDoFuncionario` de sempre) */
export function pedidoDosExtras(x: FormExtras): Linha {
  const m = /^(\d{1,2})(u?)$/.exec(x.dia);
  const vazio = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    sexo: vazio(x.sexo), estado_civil: vazio(x.estado_civil), dependentes: x.dependentes.trim() === '' ? null : Number(x.dependentes),
    jornada: vazio(x.jornada), fazenda_registro_id: vazio(x.fazenda_registro_id), experiencia_ate: vazio(x.experiencia_ate), rg: vazio(x.rg),
    cnh_categoria: vazio(x.cnh_categoria), cnh_validade: vazio(x.cnh_validade), contato_emergencia: vazio(x.contato_emergencia),
    dia_pagamento: m ? Number(m[1]) : null, dia_pagamento_util: !!m && m[2] === 'u',
  };
}
/** só o que MUDOU no favorecido (o gravador de campo grava e trilha campo a campo; mandar o igual seria ruído na trilha). CPF do titular
 *  e CEP vão só com os dígitos. */
export function camposQueMudaram(antes: FavorecidoDaFicha | null, form: FormFavorecido): Partial<Record<CampoDoFavorecido, string>> {
  const out: Partial<Record<CampoDoFavorecido, string>> = {};
  for (const c of CAMPOS_DO_FAVORECIDO) {
    const v = c === 'cpf_cnpj_pagamento' || c === 'cep' ? form[c].replace(/\D/g, '') : form[c].trim();
    const era = antes?.[c] ?? '';
    const eraLimpo = c === 'cpf_cnpj_pagamento' || c === 'cep' ? era.replace(/\D/g, '') : era;
    if (v !== eraLimpo) out[c] = v;
  }
  return out;
}

/* ── o titular da conta confere o CPF do funcionário (art. 464 CLT: pagar na conta do próprio vale como recibo) ── */
export type Titular = 'vazio' | 'proprio' | 'outro';
export function titularDaConta(cpfFuncionario: string, cpfTitular: string): Titular {
  const t = cpfTitular.replace(/\D/g, '');
  if (!t) return 'vazio';
  return t === cpfFuncionario.replace(/\D/g, '') ? 'proprio' : 'outro';
}

/* ── os selos por bloco e o "a atualizar" do topo (junta o que falta de todos) ── */
export type Bloco = 'pessoais' | 'contrato' | 'documentos' | 'contato' | 'pagamento';
export function oQueFaltaPorBloco(form: FormFuncionario, x: FormExtras, p: FormFavorecido, temFavorecido: boolean): Record<Bloco, string[]> {
  const vazio = (s: string) => s.trim() === '';
  const f: Record<Bloco, string[]> = { pessoais: [], contrato: [], documentos: [], contato: [], pagamento: [] };
  if (vazio(form.cpf)) f.pessoais.push('CPF');
  if (vazio(form.nascimento)) f.pessoais.push('nascimento');
  if (vazio(x.sexo)) f.pessoais.push('sexo');
  if (vazio(x.estado_civil)) f.pessoais.push('estado civil');
  if (vazio(form.admissao)) f.contrato.push('admissão');
  if (vazio(form.cargo)) f.contrato.push('cargo');
  if (vazio(x.jornada)) f.contrato.push('jornada');
  if (vazio(x.fazenda_registro_id)) f.contrato.push('fazenda do registro');
  if (vazio(form.pis)) f.documentos.push('PIS');
  if (vazio(form.ctps)) f.documentos.push('CTPS');
  if (vazio(x.rg)) f.documentos.push('RG');
  if (!temFavorecido) { f.contato.push('favorecido'); f.pagamento.push('favorecido'); return f; }
  if (vazio(p.celular)) f.contato.push('celular');
  if (vazio(p.logradouro)) f.contato.push('endereço');
  if (vazio(p.tipo_recebimento)) f.pagamento.push('forma de pagamento');
  else if (p.tipo_recebimento === FORMA_PIX && vazio(p.pix_chave)) f.pagamento.push('chave Pix');
  else if (p.tipo_recebimento === FORMA_TED && (vazio(p.banco) || vazio(p.agencia) || vazio(p.conta))) f.pagamento.push('conta bancária');
  if (vazio(x.dia)) f.pagamento.push('dia do pagamento');
  return f;
}
/** o selo do bloco: "Completa" ou "Falta X, Y" */
export const seloDoBloco = (falta: readonly string[]): string => (falta.length === 0 ? 'Completa' : `Falta ${falta.join(', ')}`);
/** o "a atualizar" do topo: o que falta em todos os blocos + as marcas gravadas que o dado ainda não resolveu (sem repetir) */
export function aAtualizarDoTopo(faltas: Record<Bloco, string[]>, f: CadastroFuncionario, temSalario: boolean, rotular: (c: string) => string): string[] {
  const todos = [...faltas.pessoais, ...faltas.contrato, ...faltas.documentos, ...faltas.contato, ...faltas.pagamento];
  const marcas = aAtualizarDe(f, temSalario).map(rotular).filter(m => !todos.includes(m));
  return [...new Set([...todos, ...marcas])];
}
