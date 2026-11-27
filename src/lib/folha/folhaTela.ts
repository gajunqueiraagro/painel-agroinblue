/**
 * FOLHA-01 · PR B (telas) — as REGRAS da tela Financeiro › Folha de pagamento: os leitores do jsonb do banco (sem cast: o que não é do
 * tipo vira nulo), os filtros, os rótulos e as frases. Gabarito: mock-folha-01-v1.html (aprovado 19/11 07:07, D1–D5 "a") + as medidas
 * fixas do contrato §6 (UI-LARGURA-FIXA-01).
 * ⚠ NENHUM NÚMERO NASCE AQUI: contagens, tipo do pagamento, "pago a outro", dias para vencer e pendências vêm prontos do banco
 *   (`fn_folha_*`, lote 118420 do Code 6). A tela só FILTRA o que recebeu e escreve o rótulo.
 * ⚠ "—" = dado ausente (salário, admissão, cargo que o contador ainda não mandou); nunca zero.
 */
import { casaNaBusca } from '@/lib/texto/busca';

/* ── leitores (sem cast) ─────────────────────────────────────────────────────────────────────────────────────────────────── */
export type Linha = Record<string, unknown>;
export const ehLinha = (v: unknown): v is Linha => typeof v === 'object' && v !== null && !Array.isArray(v);
export const linhas = (v: unknown): Linha[] => (Array.isArray(v) ? v.filter(ehLinha) : []);
export const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
export const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : 0);
export const numOuNulo = (v: unknown): number | null => (v == null || v === '' ? null : num(v));
const bool = (v: unknown): boolean => v === true;
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/* ── o funcionário ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
export type Situacao = 'ativo' | 'afastado' | 'desligado';
const SITUACOES: readonly Situacao[] = ['ativo', 'afastado', 'desligado'];
const situacao = (v: unknown): Situacao => SITUACOES.find(s => s === v) ?? 'ativo';

export interface Atuacao { fazenda_id: string | null; fazenda: string | null; atividade: string | null; pct: number }
export interface FuncionarioDaLista {
  id: string; nome: string; cpf: string | null; cargo: string | null; vinculo: string | null; empregador_registro: string | null;
  codigo_contador: string | null; admissao: string | null; situacao: Situacao; desligamento: string | null; a_atualizar: string[];
  a_confirmar: boolean; favorecido_id: string | null; favorecido: string | null; salario: number | null; salario_desde: string | null;
  atuacao: Atuacao[]; lancamentos: number; ultimo_pagamento: string | null; documentos: number; documentos_vencendo: number;
}
export interface ContagemFuncionarios { ativos: number; desligados: number; a_confirmar: number; todos: number }
export interface ListaFuncionarios { funcionarios: FuncionarioDaLista[]; contagem: ContagemFuncionarios }

const atuacaoDaLinha = (a: Linha): Atuacao => ({ fazenda_id: txt(a.fazenda_id), fazenda: txt(a.fazenda), atividade: txt(a.atividade), pct: num(a.pct) });

export function funcionarioDaLinha(r: Linha): FuncionarioDaLista {
  return {
    id: String(r.id), nome: txt(r.nome) ?? '', cpf: txt(r.cpf), cargo: txt(r.cargo), vinculo: txt(r.vinculo),
    empregador_registro: txt(r.empregador_registro), codigo_contador: txt(r.codigo_contador), admissao: txt(r.admissao),
    situacao: situacao(r.situacao), desligamento: txt(r.desligamento), a_atualizar: textos(r.a_atualizar), a_confirmar: bool(r.a_confirmar),
    favorecido_id: txt(r.favorecido_id), favorecido: txt(r.favorecido), salario: numOuNulo(r.salario), salario_desde: txt(r.salario_desde),
    atuacao: linhas(r.atuacao).map(atuacaoDaLinha), lancamentos: num(r.lancamentos), ultimo_pagamento: txt(r.ultimo_pagamento),
    documentos: num(r.documentos), documentos_vencendo: num(r.documentos_vencendo),
  };
}

export function listaDoBanco(v: unknown): ListaFuncionarios {
  const r = ehLinha(v) ? v : {};
  const c = ehLinha(r.contagem) ? r.contagem : {};
  return {
    funcionarios: linhas(r.funcionarios).map(funcionarioDaLinha),
    contagem: { ativos: num(c.ativos), desligados: num(c.desligados), a_confirmar: num(c.a_confirmar), todos: num(c.todos) },
  };
}

/* ── a ficha ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface CadastroFuncionario {
  id: string; nome: string; cpf: string | null; favorecido_id: string | null; codigo_contador: string | null; cargo: string | null; cbo: string | null;
  vinculo: string | null; empregador_registro: string | null; admissao: string | null; a_atualizar: string[]; observacao: string | null;
  nascimento: string | null; pis: string | null; ctps: string | null; situacao: Situacao; desligamento: string | null; desligamento_motivo: string | null;
  /** ⚠ O GRAVADOR SOBRESCREVE (chave ausente = nulo): o pedido de edição tem de levar o que veio, ou o elo com a recorrência se perde */
  recorrencia_origem_id: string | null;
}
export interface PagamentoDoFavorecido {
  favorecido_id: string | null; favorecido: string | null; tipo_recebimento: string | null; pix_tipo_chave: string | null; pix_chave: string | null;
  banco: string | null; agencia: string | null; conta: string | null; tipo_conta: string | null; telefone: string | null; celular: string | null; email: string | null;
}
export interface SalarioDoFuncionario { desde: string | null; salario: number | null; parte_pct: number | null; motivo: string | null }
export interface AtuacaoDesde extends Atuacao { desde: string | null }
export type EspecieDocumento =
  | 'holerite' | 'recibo_13' | 'guia_inss' | 'guia_fgts' | 'escala_ferias' | 'recibo_ferias' | 'rescisao' | 'contrato' | 'ctps' | 'aso' | 'epi'
  | 'atestado' | 'outro';
export interface DocumentoDoFuncionario {
  id: string; especie: string; nome: string; bucket: string; storage_path: string | null; tipo: string | null; tamanho_bytes: number | null;
  data_documento: string | null; vencimento: string | null; dias: number | null; lancamento_id: string | null; criado_em: string | null;
}
export interface PagamentoLigado { lancamento_id: string; descricao: string | null; valor: number; status: string | null; data: string | null; competencia: string | null }
export interface Ficha {
  funcionario: CadastroFuncionario; pagamento: PagamentoDoFavorecido | null; salarios: SalarioDoFuncionario[]; atuacoes: AtuacaoDesde[];
  documentos: DocumentoDoFuncionario[];
  /** FOLHA-REGUA-01: os REALIZADOS até hoje, do mais recente para trás (5) — e os PREVISTOS de hoje em diante, do mais perto (3). A regra é do
   *  banco (`fn_folha_funcionario_ficha`, lote 118750); sem a chave nova (banco antes do lote) os próximos vêm vazios. */
  ultimos_pagamentos: PagamentoLigado[]; proximos_pagamentos: PagamentoLigado[];
}

const pagamentoLigadoDaLinha = (u: Linha): PagamentoLigado => ({
  lancamento_id: String(u.lancamento_id), descricao: txt(u.descricao), valor: num(u.valor), status: txt(u.status), data: txt(u.data), competencia: txt(u.competencia),
});

export function documentoDaLinha(d: Linha): DocumentoDoFuncionario {
  return {
    id: String(d.id), especie: txt(d.especie) ?? 'outro', nome: txt(d.nome) ?? '', bucket: txt(d.bucket) ?? 'folha-documentos',
    storage_path: txt(d.storage_path), tipo: txt(d.tipo), tamanho_bytes: numOuNulo(d.tamanho_bytes), data_documento: txt(d.data_documento),
    vencimento: txt(d.vencimento), dias: numOuNulo(d.dias), lancamento_id: txt(d.lancamento_id), criado_em: txt(d.criado_em),
  };
}

export function fichaDoBanco(v: unknown): Ficha | null {
  if (!ehLinha(v) || !ehLinha(v.funcionario)) return null;
  const f = v.funcionario;
  const p = ehLinha(v.pagamento) ? v.pagamento : null;
  return {
    funcionario: {
      id: String(f.id), nome: txt(f.nome) ?? '', cpf: txt(f.cpf), favorecido_id: txt(f.favorecido_id), codigo_contador: txt(f.codigo_contador),
      cargo: txt(f.cargo), cbo: txt(f.cbo), vinculo: txt(f.vinculo), empregador_registro: txt(f.empregador_registro), admissao: txt(f.admissao),
      a_atualizar: textos(f.a_atualizar), observacao: txt(f.observacao), nascimento: txt(f.nascimento), pis: txt(f.pis), ctps: txt(f.ctps),
      situacao: situacao(f.situacao), desligamento: txt(f.desligamento), desligamento_motivo: txt(f.desligamento_motivo),
      recorrencia_origem_id: txt(f.recorrencia_origem_id),
    },
    pagamento: p ? {
      favorecido_id: txt(p.favorecido_id), favorecido: txt(p.favorecido), tipo_recebimento: txt(p.tipo_recebimento), pix_tipo_chave: txt(p.pix_tipo_chave),
      pix_chave: txt(p.pix_chave), banco: txt(p.banco), agencia: txt(p.agencia), conta: txt(p.conta), tipo_conta: txt(p.tipo_conta),
      telefone: txt(p.telefone), celular: txt(p.celular), email: txt(p.email),
    } : null,
    salarios: linhas(v.salarios).map(s => ({ desde: txt(s.desde), salario: numOuNulo(s.salario), parte_pct: numOuNulo(s.parte_pct), motivo: txt(s.motivo) })),
    atuacoes: linhas(v.atuacoes).map(a => ({ ...atuacaoDaLinha(a), desde: txt(a.desde) })),
    documentos: linhas(v.documentos).map(documentoDaLinha),
    ultimos_pagamentos: linhas(v.ultimos_pagamentos).map(pagamentoLigadoDaLinha),
    proximos_pagamentos: linhas(v.proximos_pagamentos).map(pagamentoLigadoDaLinha),
  };
}

/* ── o histórico ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface DocumentoDoPagamento { origem: 'folha' | 'lancamento'; id: string; nome: string; especie: string | null; bucket: string; storage_path: string | null }
export interface ItemDoHistorico {
  lancamento_id: string; competencia: string | null; data: string | null; data_pagamento: string | null; tipo: string; descricao: string | null;
  favorecido_id: string | null; favorecido: string | null; pago_a_outro: boolean; valor: number; status: string | null; conciliado: boolean;
  documentos: DocumentoDoPagamento[];
}
export interface Historico {
  funcionario: { id: string; nome: string; situacao: Situacao; admissao: string | null; desligamento: string | null; favorecido_id: string | null } | null;
  itens: ItemDoHistorico[]; n: number; total: number; pagos_a_outro: number; por_tipo: Record<string, number>;
}

export function historicoDoBanco(v: unknown): Historico {
  const r = ehLinha(v) ? v : {};
  const f = ehLinha(r.funcionario) ? r.funcionario : null;
  const pt = ehLinha(r.por_tipo) ? r.por_tipo : {};
  return {
    funcionario: f ? { id: String(f.id), nome: txt(f.nome) ?? '', situacao: situacao(f.situacao), admissao: txt(f.admissao), desligamento: txt(f.desligamento), favorecido_id: txt(f.favorecido_id) } : null,
    itens: linhas(r.itens).map(i => ({
      lancamento_id: String(i.lancamento_id), competencia: txt(i.competencia), data: txt(i.data), data_pagamento: txt(i.data_pagamento),
      tipo: txt(i.tipo) ?? 'Outro', descricao: txt(i.descricao), favorecido_id: txt(i.favorecido_id), favorecido: txt(i.favorecido),
      pago_a_outro: bool(i.pago_a_outro), valor: num(i.valor), status: txt(i.status), conciliado: bool(i.conciliado),
      documentos: linhas(i.documentos).map(d => ({
        origem: d.origem === 'lancamento' ? 'lancamento' : 'folha', id: String(d.id), nome: txt(d.nome) ?? '', especie: txt(d.especie),
        bucket: txt(d.bucket) ?? 'folha-documentos', storage_path: txt(d.storage_path),
      })),
    })),
    n: num(r.n), total: num(r.total), pagos_a_outro: num(r.pagos_a_outro),
    por_tipo: Object.fromEntries(Object.entries(pt).map(([k, x]) => [k, num(x)])),
  };
}

/* ── as pendências ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
export type TipoPendencia = 'favorecido_sem_funcionario' | 'rescisao_a_conferir' | 'sugestao_descricao' | 'sem_recibo' | 'documento_vence';
export const TIPOS_DE_PENDENCIA: readonly TipoPendencia[] = ['favorecido_sem_funcionario', 'rescisao_a_conferir', 'sugestao_descricao', 'sem_recibo', 'documento_vence'];
const tipoPendencia = (v: unknown): TipoPendencia | null => TIPOS_DE_PENDENCIA.find(t => t === v) ?? null;

export interface Sugestao { funcionario_id: string; funcionario: string }
export interface Pendencia {
  tipo: TipoPendencia; chave: string;
  /* favorecido_sem_funcionario · rescisao_a_conferir */
  favorecido_id: string | null; favorecido: string | null; n: number; total: number; desde: string | null; ate: string | null; ids: string[];
  tem_rescisao: boolean;
  /* sugestao_descricao · sem_recibo */
  lancamento_id: string | null; descricao: string | null; valor: number | null; data: string | null;
  /* sem_recibo · documento_vence */
  funcionario_id: string | null; funcionario: string | null;
  /* documento_vence */
  documento_id: string | null; especie: string | null; nome: string | null; vencimento: string | null; dias: number | null;
  sugestao: Sugestao | null;
}
export interface Pendencias { itens: Pendencia[]; descartadas: number }

export function pendenciasDoBanco(v: unknown): Pendencias {
  const r = ehLinha(v) ? v : {};
  const itens: Pendencia[] = [];
  for (const p of linhas(r.itens)) {
    const tipo = tipoPendencia(p.tipo);
    if (!tipo) continue;   /* tipo novo do banco que a tela ainda não conhece: fica fora (nunca vira outro tipo) */
    const s = ehLinha(p.sugestao) && txt(p.sugestao.funcionario_id) ? { funcionario_id: String(p.sugestao.funcionario_id), funcionario: txt(p.sugestao.funcionario) ?? '' } : null;
    itens.push({
      tipo, chave: txt(p.chave) ?? `${tipo}:${itens.length}`,
      favorecido_id: txt(p.favorecido_id), favorecido: txt(p.favorecido), n: num(p.n), total: num(p.total), desde: txt(p.desde), ate: txt(p.ate),
      ids: textos(p.ids), tem_rescisao: bool(p.tem_rescisao),
      lancamento_id: txt(p.lancamento_id), descricao: txt(p.descricao), valor: numOuNulo(p.valor), data: txt(p.data),
      funcionario_id: txt(p.funcionario_id), funcionario: txt(p.funcionario),
      documento_id: txt(p.documento_id), especie: txt(p.especie), nome: txt(p.nome), vencimento: txt(p.vencimento), dias: numOuNulo(p.dias),
      sugestao: s,
    });
  }
  return { itens, descartadas: num(r.descartadas) };
}

/* ── formatos ────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const n2 = (v: number): string => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const brl = (v: number): string => `R$ ${n2(v)}`;
/** dd/mm/aaaa; ausente = "—" */
export function dataBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}
/** a competência "2026-10" (ou "2026-10-01") como "10/2026" */
export function competenciaBR(c: string | null | undefined): string {
  if (!c) return '—';
  const m = /^(\d{4})-(\d{2})/.exec(c);
  return m ? `${m[2]}/${m[1]}` : c;
}
/** o CPF com pontos e traço (11 dígitos); outro formato fica como veio */
export function cpfBR(cpf: string | null | undefined): string {
  if (!cpf) return '—';
  const d = cpf.replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}

/** os vínculos que o banco aceita (`folha_funcionarios_vinculo_check`) */
export const VINCULOS: ReadonlyArray<{ valor: string; rotulo: string }> = [
  { valor: 'clt', rotulo: 'CLT' }, { valor: 'domestico', rotulo: 'Doméstico' }, { valor: 'diarista', rotulo: 'Diarista' },
  { valor: 'pro_labore', rotulo: 'Pró-labore' }, { valor: 'autonomo', rotulo: 'Autônomo' }, { valor: 'outro', rotulo: 'Outro' },
];
export const rotuloVinculo = (v: string | null): string => (v ? VINCULOS.find(x => x.valor === v)?.rotulo ?? v : '—');
/** as atividades que o gravador da atuação aceita (`fn_folha_atuacao_gravar`) */
export const ATIVIDADES: ReadonlyArray<{ valor: string; rotulo: string }> = [
  { valor: 'pecuaria', rotulo: 'Pecuária' }, { valor: 'agricultura', rotulo: 'Agricultura' }, { valor: 'silvicultura', rotulo: 'Silvicultura' },
  { valor: 'administrativo', rotulo: 'Administrativo' },
];
export const rotuloAtividade = (v: string | null): string => (v ? ATIVIDADES.find(x => x.valor === v)?.rotulo ?? v : '—');

export function rotuloSituacao(f: { situacao: Situacao; desligamento: string | null }): string {
  if (f.situacao === 'desligado') return f.desligamento ? `Desligado ${dataBR(f.desligamento)}` : 'Desligado';
  return f.situacao === 'afastado' ? 'Afastado' : 'Ativo';
}

/** a atuação na lista: "Fazenda · Atividade" (uma só, 100%) ou "Fazenda 60% +1" — o inteiro no `title` (`tituloDaAtuacao`) */
export function rotuloAtuacao(a: readonly Atuacao[]): string {
  if (a.length === 0) return '—';
  const p = a[0];
  const nome = [p.fazenda, p.atividade && rotuloAtividade(p.atividade)].filter(Boolean).join(' · ') || '—';
  return a.length === 1 ? nome : `${nome} ${n0(p.pct)}% +${a.length - 1}`;
}
export const tituloDaAtuacao = (a: readonly Atuacao[]): string =>
  a.map(x => `${[x.fazenda, x.atividade && rotuloAtividade(x.atividade)].filter(Boolean).join(' · ')} ${n0(x.pct)}%`).join(' · ');
const n0 = (v: number): string => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/* ── "a atualizar": os chips da coluna (150px, uma linha) ───────────────────────────────────────────────────────────────── */
const A_ATUALIZAR: Record<string, string> = {
  salario: 'salário', admissao: 'admissão', cargo: 'cargo', cpf: 'CPF', desligamento: 'desligamento', nome_completo: 'nome',
  situacao: 'situação', recorrencias_extras: 'recorrências',
};
export const rotuloAAtualizar = (c: string): string => A_ATUALIZAR[c] ?? c;

/** A LARGURA de um chip a 9,5px (média medida de 5,4px por letra + 8 de padding + 3 de folga entre chips). Conta de régua, não de pixel
 *  exato: o que passa vai para o "+N" (o `title` da célula lista todos). */
export const larguraDoChip = (rotulo: string): number => Math.ceil(rotulo.length * 5.4) + 8 + 3;
const LARGURA_DO_MAIS = 22;
/** os chips que cabem INTEIROS em `largura` px (com o "+N" reservado quando sobra algum) e quantos ficam escondidos */
export function chipsQueCabem(rotulos: readonly string[], largura: number): { vistos: string[]; escondidos: number } {
  const total = rotulos.reduce((s, r) => s + larguraDoChip(r), 0);
  if (total <= largura) return { vistos: [...rotulos], escondidos: 0 };
  const vistos: string[] = [];
  let soma = LARGURA_DO_MAIS;
  for (const r of rotulos) {
    const w = larguraDoChip(r);
    if (soma + w > largura) break;
    soma += w; vistos.push(r);
  }
  return { vistos, escondidos: rotulos.length - vistos.length };
}

/* ── os filtros da aba Funcionários (D2: "A confirmar" é filtro) ──────────────────────────────────────────────────────────── */
export type FiltroFuncionarios = 'ativos' | 'desligados' | 'a_confirmar' | 'todos';
export function filtrarFuncionarios(lista: readonly FuncionarioDaLista[], filtro: FiltroFuncionarios, busca: string): FuncionarioDaLista[] {
  const digitos = busca.replace(/\D/g, '');
  return lista.filter(f => {
    if (filtro === 'ativos' && f.situacao === 'desligado') return false;
    if (filtro === 'desligados' && f.situacao !== 'desligado') return false;
    if (filtro === 'a_confirmar' && !f.a_confirmar) return false;
    if (!busca.trim()) return true;
    /* pelo nome (sem acento/caixa, `casaNaBusca`) ou pelos dígitos do CPF (3 ou mais, para "123" não casar com tudo) */
    return casaNaBusca(f.nome, busca) || (digitos.length >= 3 && (f.cpf ?? '').replace(/\D/g, '').includes(digitos));
  });
}

/* ── o aviso do vencimento do documento (contrato §3.1) ──────────────────────────────────────────────────────────────────── */
export type TomDoAviso = 'ambar' | 'vermelho';
/** `dias` ≤ 30 em âmbar ("vence em N dias"); abaixo de 0 em vermelho ("vencido há N dias"); sem vencimento ou longe = nada */
export function avisoDoVencimento(dias: number | null): { tom: TomDoAviso; texto: string } | null {
  if (dias == null || dias > 30) return null;
  if (dias < 0) return { tom: 'vermelho', texto: `vencido há ${-dias} ${-dias === 1 ? 'dia' : 'dias'}` };
  if (dias === 0) return { tom: 'ambar', texto: 'vence hoje' };
  return { tom: 'ambar', texto: `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}` };
}

export const ESPECIES_DE_DOCUMENTO: ReadonlyArray<{ valor: EspecieDocumento; rotulo: string }> = [
  { valor: 'contrato', rotulo: 'Contrato' }, { valor: 'ctps', rotulo: 'CTPS' }, { valor: 'aso', rotulo: 'ASO' }, { valor: 'epi', rotulo: 'Ficha de EPI' },
  { valor: 'atestado', rotulo: 'Atestado' }, { valor: 'holerite', rotulo: 'Holerite' }, { valor: 'recibo_13', rotulo: 'Recibo do 13º' },
  { valor: 'recibo_ferias', rotulo: 'Recibo de férias' }, { valor: 'escala_ferias', rotulo: 'Escala de férias' }, { valor: 'rescisao', rotulo: 'Rescisão (TRCT)' },
  { valor: 'guia_inss', rotulo: 'Guia INSS' }, { valor: 'guia_fgts', rotulo: 'Guia FGTS' }, { valor: 'outro', rotulo: 'Outro' },
];
export const rotuloEspecie = (e: string | null): string => ESPECIES_DE_DOCUMENTO.find(x => x.valor === e)?.rotulo ?? (e ?? '—');
export const ehEspecie = (v: string): v is EspecieDocumento => ESPECIES_DE_DOCUMENTO.some(e => e.valor === v);

/* ── o histórico: o filtro por tipo (o `tipo` vem do banco, regra única) ─────────────────────────────────────────────────── */
export type FiltroTipo = 'tudo' | 'salario' | '13' | 'ferias' | 'rescisao' | 'beneficios';
/** quais `tipo` do banco cada botão junta. "Salário" leva o Adiantamento (é adiantamento do salário); "Rescisão", a multa rescisória;
 *  "Outro" só aparece em "Tudo". */
export const TIPOS_DO_FILTRO: Record<Exclude<FiltroTipo, 'tudo'>, readonly string[]> = {
  salario: ['Salário', 'Adiantamento'], '13': ['13º'], ferias: ['Férias'], rescisao: ['Rescisão', 'Multa rescisória'], beneficios: ['Benefício'],
};
export const doFiltroTipo = (tipo: string, filtro: FiltroTipo): boolean => filtro === 'tudo' || TIPOS_DO_FILTRO[filtro].includes(tipo);
export function contagemDoFiltroTipo(porTipo: Readonly<Record<string, number>>, filtro: FiltroTipo): number {
  if (filtro === 'tudo') return Object.values(porTipo).reduce((s, n) => s + n, 0);
  return TIPOS_DO_FILTRO[filtro].reduce((s, t) => s + (porTipo[t] ?? 0), 0);
}

const STATUS: Record<string, string> = {
  realizado: 'Realizado', conciliado: 'Conciliado', previsto: 'Previsto', programado: 'Programado', agendado: 'Agendado', cancelado: 'Cancelado',
};
/** "Conciliado" quando o banco diz que está conciliado; senão o status do lançamento */
export const rotuloStatus = (status: string | null, conciliado: boolean): string => (conciliado ? 'Conciliado' : status ? STATUS[status] ?? status : '—');

/* ── as pendências: o rótulo do tipo, a frase e a data da coluna "Desde" ─────────────────────────────────────────────────── */
export const ROTULO_PENDENCIA: Record<TipoPendencia, string> = {
  favorecido_sem_funcionario: 'Sem cadastro', rescisao_a_conferir: 'Rescisão a conferir', sugestao_descricao: 'Sugestão (descrição)',
  sem_recibo: 'Sem recibo', documento_vence: 'Documento vence',
};
/** "Mesmo funcionário?" quando o banco achou um parecido; senão "Sem cadastro" */
export const rotuloDaPendencia = (p: Pendencia): string =>
  p.tipo === 'favorecido_sem_funcionario' && p.sugestao ? 'Mesmo funcionário?' : ROTULO_PENDENCIA[p.tipo];

export const quemDaPendencia = (p: Pendencia): string =>
  (p.tipo === 'sem_recibo' || p.tipo === 'documento_vence' ? p.funcionario : p.tipo === 'sugestao_descricao' ? p.favorecido : p.favorecido) ?? '—';

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
export function fraseDaPendencia(p: Pendencia): string {
  switch (p.tipo) {
    case 'favorecido_sem_funcionario':
      return p.sugestao
        ? `${plural(p.n, 'lançamento', 'lançamentos')} de folha (${brl(p.total)}); parece ser ${p.sugestao.funcionario}`
        : `${plural(p.n, 'lançamento', 'lançamentos')} de folha (${brl(p.total)}) sem funcionário no cadastro`;
    case 'rescisao_a_conferir':
      return `rescisão paga e sem cadastro: ${plural(p.n, 'lançamento', 'lançamentos')} até ${dataBR(p.ate)} (${brl(p.total)})`;
    case 'sugestao_descricao':
      return `"${p.descricao ?? ''}" · ${p.valor != null ? n2(p.valor) : '—'} · ${dataBR(p.data)}${p.sugestao ? ` → parece ser de ${p.sugestao.funcionario}` : ''}`;
    case 'sem_recibo':
      return `${p.descricao ?? 'pagamento'} · ${p.valor != null ? n2(p.valor) : '—'} lançado, sem o recibo`;
    case 'documento_vence': {
      const aviso = avisoDoVencimento(p.dias);
      return `${rotuloEspecie(p.especie)} "${p.nome ?? ''}" ${aviso ? aviso.texto : `vence em ${dataBR(p.vencimento)}`}`;
    }
  }
}
export const desdeDaPendencia = (p: Pendencia): string | null =>
  p.tipo === 'documento_vence' ? p.vencimento : p.tipo === 'sugestao_descricao' || p.tipo === 'sem_recibo' ? p.data : p.desde;

export type FiltroPendencia = 'todas' | TipoPendencia;
export function contarPendencias(itens: readonly Pendencia[]): Record<FiltroPendencia, number> {
  const c: Record<FiltroPendencia, number> = { todas: itens.length, favorecido_sem_funcionario: 0, rescisao_a_conferir: 0, sugestao_descricao: 0, sem_recibo: 0, documento_vence: 0 };
  for (const p of itens) c[p.tipo] += 1;
  return c;
}

/* ── o erro do banco (contrato: P0001 = a frase pronta, para a faixa, nunca toast; 42501 = sem a folha) ──────────────────── */
export function fraseDoErro(error: { code?: string; message?: string } | null | undefined, padrao = 'Não consegui gravar. Tente de novo.'): string {
  if (!error) return padrao;
  if (error.code === 'P0001' || error.code === '40001') return error.message ?? padrao;
  if (error.code === '42501') return 'Sem acesso à folha deste cliente.';
  console.error('[folha]', error);
  return padrao;
}

/* ── o cadastro: o formulário e o pedido do gravador ─────────────────────────────────────────────────────────────────────── */
export interface FormFuncionario {
  nome: string; cpf: string; favorecido_id: string; codigo_contador: string; cargo: string; cbo: string; vinculo: string;
  empregador_registro: string; admissao: string; nascimento: string; pis: string; ctps: string; observacao: string;
}
export const FORM_VAZIO: FormFuncionario = {
  nome: '', cpf: '', favorecido_id: '', codigo_contador: '', cargo: '', cbo: '', vinculo: 'clt', empregador_registro: '', admissao: '',
  nascimento: '', pis: '', ctps: '', observacao: '',
};
export function formDoCadastro(f: CadastroFuncionario): FormFuncionario {
  return {
    nome: f.nome, cpf: f.cpf ? cpfBR(f.cpf) : '', favorecido_id: f.favorecido_id ?? '', codigo_contador: f.codigo_contador ?? '', cargo: f.cargo ?? '',
    cbo: f.cbo ?? '', vinculo: f.vinculo ?? 'clt', empregador_registro: f.empregador_registro ?? '', admissao: f.admissao ?? '',
    nascimento: f.nascimento ?? '', pis: f.pis ?? '', ctps: f.ctps ?? '', observacao: f.observacao ?? '',
  };
}
/** o "a atualizar" DEPOIS de salvar: sai a marca do campo que agora está preenchido (cpf, cargo, admissão); as outras ficam como vieram */
export function aAtualizarDepois(antes: readonly string[], form: FormFuncionario): string[] {
  const preenchido: Record<string, boolean> = { cpf: form.cpf.trim() !== '', cargo: form.cargo.trim() !== '', admissao: form.admissao !== '' };
  return antes.filter(c => !preenchido[c]);
}
/** os campos obrigatórios que faltam (UX-OBRIGATORIOS-01: o campo fica vermelho com a frase; nada vai ao banco) */
export function pendenciasDoForm(form: FormFuncionario): Partial<Record<keyof FormFuncionario, string>> {
  const p: Partial<Record<keyof FormFuncionario, string>> = {};
  if (!form.nome.trim()) p.nome = 'Informe o nome.';
  const cpf = form.cpf.replace(/\D/g, '');
  if (cpf && cpf.length !== 11) p.cpf = 'O CPF tem 11 dígitos.';
  const pis = form.pis.replace(/\D/g, '');
  if (pis && pis.length !== 11) p.pis = 'O PIS tem 11 dígitos.';
  return p;
}
/** O PEDIDO INTEIRO do `fn_folha_funcionario_gravar` (ele sobrescreve toda chave, menos nascimento/PIS/CTPS — que vão também, porque o
 *  formulário os mostra). `recorrencia_origem_id` vai como veio: a tela não o edita, mas sem ele o banco o apagaria. */
export function pedidoDoFuncionario(form: FormFuncionario, antes: CadastroFuncionario | null): Linha {
  const vazio = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    ...(antes ? { id: antes.id, recorrencia_origem_id: antes.recorrencia_origem_id } : {}),
    nome: form.nome.trim(), cpf: vazio(form.cpf.replace(/\D/g, '')), favorecido_id: vazio(form.favorecido_id), codigo_contador: vazio(form.codigo_contador),
    cargo: vazio(form.cargo), cbo: vazio(form.cbo), vinculo: form.vinculo || 'clt', empregador_registro: vazio(form.empregador_registro),
    admissao: form.admissao || null, a_atualizar: aAtualizarDepois(antes?.a_atualizar ?? [], form), observacao: vazio(form.observacao),
    nascimento: form.nascimento || null, pis: vazio(form.pis.replace(/\D/g, '')), ctps: vazio(form.ctps),
  };
}

/** a atuação: cada linha com fazenda, atividade e % > 0, e a soma 100 (a mesma recusa do banco, dita antes) */
export function problemaDaAtuacao(itens: ReadonlyArray<{ fazenda_id: string; atividade: string; pct: number | null }>): string | null {
  if (itens.length === 0) return 'Inclua ao menos uma fazenda.';
  if (itens.some(i => !i.fazenda_id || !i.atividade || !i.pct || i.pct <= 0)) return 'Cada linha precisa de fazenda, atividade e %.';
  const soma = Math.round(itens.reduce((s, i) => s + (i.pct ?? 0), 0) * 100) / 100;
  return soma === 100 ? null : `A atuação soma ${soma.toLocaleString('pt-BR')}% (tem de dar 100%).`;
}

/* ── as pendências: as ações de cada tipo (contrato §3.3) ────────────────────────────────────────────────────────────────── */
export type AcaoPendencia = 'ligar_sugestao' | 'outro' | 'cadastrar' | 'cadastrar_desligado' | 'descartar' | 'recibo' | 'novo_documento';
/** as ações NA ORDEM: as 3 primeiras ficam à vista (botões de largura fixa), o resto vai para o "⋯" */
export function acoesDaPendencia(p: Pendencia): Array<{ acao: AcaoPendencia; rotulo: string; titulo?: string }> {
  /* FOLHA-REGUA-01 (Gabriel 26/11): o rótulo INTEIRO, sem "…", num botão pequeno de largura fixa; a frase longa vai no `titulo` (o `title`) */
  const ligar = (r: string) => ({ acao: 'ligar_sugestao' as const, rotulo: r });
  const naoE = (titulo: string) => ({ acao: 'descartar' as const, rotulo: 'Não é', titulo });
  switch (p.tipo) {
    case 'favorecido_sem_funcionario':
      return p.sugestao
        ? [ligar(`É o mesmo · ligar ${p.n.toLocaleString('pt-BR')}`), { acao: 'cadastrar', rotulo: 'Cadastrar' }, naoE('não é pagamento de funcionário'), { acao: 'outro', rotulo: 'É de outro funcionário' }]
        : [{ acao: 'cadastrar', rotulo: 'Cadastrar' }, { acao: 'outro', rotulo: 'É de alguém', titulo: 'é de um funcionário já cadastrado: escolher qual' }, naoE('não é pagamento de funcionário')];
    case 'rescisao_a_conferir':
      return [{ acao: 'cadastrar_desligado', rotulo: 'Cadastrar desligado' }, { acao: 'cadastrar', rotulo: 'Cadastrar ativo' }, naoE('não é rescisão de funcionário'),
        { acao: 'outro', rotulo: 'É de um funcionário' }];
    case 'sugestao_descricao':
      return p.sugestao
        ? [ligar('Ligar'), { acao: 'outro', rotulo: 'Outro', titulo: 'é de outro funcionário: escolher qual' }, naoE('não é de funcionário')]
        : [{ acao: 'outro', rotulo: 'Escolher', titulo: 'escolher o funcionário' }, naoE('não é de funcionário')];
    case 'sem_recibo':
      return [{ acao: 'recibo', rotulo: 'Anexar recibo' }, { acao: 'descartar', rotulo: 'Baixa sem recibo', titulo: 'dar baixa sem recibo' }];
    case 'documento_vence':
      return [{ acao: 'novo_documento', rotulo: 'Novo documento' }, { acao: 'descartar', rotulo: 'Já resolvido' }];
  }
}
/** os lançamentos que a ação liga: os do favorecido, ou o lançamento da pendência */
export const lancamentosDaPendencia = (p: Pendencia): string[] => (p.ids.length ? p.ids : p.lancamento_id ? [p.lancamento_id] : []);

/** a prévia do `fn_lancamento_funcionario_ligar` (simular): "Liga 35 lançamentos a Fulano" / "nenhum muda" */
export function fraseDaPreviaLigar(d: Linha): string {
  const n = num(d.lancamentos); const mudam = num(d.mudam); const quem = txt(d.funcionario);
  if (mudam === 0) return `Nenhum dos ${n.toLocaleString('pt-BR')} muda: já estão com ${quem ?? 'este funcionário'}.`;
  const base = `Liga ${mudam.toLocaleString('pt-BR')} ${mudam === 1 ? 'lançamento' : 'lançamentos'} a ${quem ?? 'o funcionário'}`;
  return mudam === n ? `${base}.` : `${base} (${(n - mudam).toLocaleString('pt-BR')} já estavam).`;
}
/** a frase do descarte, pelo tipo (o motivo é obrigatório no banco) */
export const tituloDoDescarte = (p: Pendencia): string =>
  p.tipo === 'sem_recibo' ? 'Dar baixa sem recibo' : p.tipo === 'documento_vence' ? 'Já resolvido' : p.tipo === 'sugestao_descricao' ? 'Não é de funcionário' : 'Não é funcionário';
