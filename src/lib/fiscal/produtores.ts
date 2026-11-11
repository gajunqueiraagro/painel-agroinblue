/**
 * FISCAL onda 1 (a) · CADASTROS › PRODUTORES — as regras puras da tela (gabarito: ui-validar/cadastro-produtor-mock.html, aprovado C1–C3
 * em 05/11 11:53; onda 1 aprovada pelo Gabriel em 09/11 10:36).
 *
 * ⚠ NENHUMA REGRA FISCAL NASCE AQUI. Quem valida CPF/CNPJ (inclusive o alfanumérico), IE, UF, CEP, regime, papel, soma das participações e
 * "cadastro incompleto" é o banco (117290: `fn_fiscal_titular_gravar`, `_fn_fiscal_titular_pendencias` …). Esta lib só LÊ o que as funções
 * devolvem (sem cast: o que não é do tipo vira nulo/vazio), monta o que a tela mostra e o payload do Salvar (só o que mudou: chave ausente
 * = o banco mantém).
 * ⚠ A COMPOSIÇÃO DA FAZENDA ("com quem divide") sai da MESMA lista (`fn_fiscal_titulares_lista` → `fazendas` de cada titular, a versão
 * vigente hoje): `composicaoPorFazenda` só agrupa.
 */
import { dataBR } from '@/lib/datas/dataBR';

export type Papel = 'produtor' | 'terceiro';
export type Tipo = 'PF' | 'PJ';
export type CondicaoImovel = 'proprietario' | 'condomino' | 'arrendatario' | 'parceiro' | 'comodatario';
export type Registra = 'total' | 'so_a_parte';
export type CondicaoIbs = 'nao_contribuinte' | 'contribuinte_pelo_limite' | 'optante' | 'integrado';
export type RegimeIr = 'pf_atividade_rural' | 'pj_presumido' | 'pj_real' | 'pj_simples';
export type DocumentoEm = 'produtor' | 'terceiro' | 'alterna';
export type ComoPaga = 'transfere_ao_terceiro' | 'direto';

export interface IeDoTitular { uf: string; ie: string; fazenda_id: string | null }
export interface ParticipacaoDoTitular {
  fazenda_id: string; fazenda: string; participacao: number; condicao: CondicaoImovel; registra: Registra; desde: string | null; ate: string | null;
}
export interface EmpresaDoGrupo { empresa_id: string; empresa: string; participacao: number; atividade: string | null; entra_no_limite: boolean }
export interface Titular {
  id: string; nome: string; documento: string; documento_formatado: string; tipo: Tipo; papel: Papel; cnpj_produtor: string | null;
  nascimento: string | null; email_fiscal: string | null; endereco: string | null; municipio: string | null; uf: string | null; cep: string | null;
  regime_ir: RegimeIr | null; ativo: boolean; ies: IeDoTitular[]; fazendas: ParticipacaoDoTitular[];
  condicao_ibs: { condicao: CondicaoIbs; desde: string | null; motivo: string | null } | null;
  grupo: EmpresaDoGrupo[]; contas: Array<{ conta_id: string; conta: string }>; acordos: number; pendencias: string[];
}
export interface Acordo {
  acordo_id: string; nome: string; produtor_id: string; produtor: string; terceiro_id: string; terceiro: string; fazenda_id: string | null;
  fazenda: string | null; parte_produtor: number | null; documento_em: DocumentoEm; como_paga: ComoPaga; palavras: string[];
  vigencia_inicio: string | null; vigencia_fim: string | null; ativo: boolean; observacao: string | null; ligados: number; soma_ligados: number;
  a_confirmar: number;
}

/* ── leitores sem cast ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
type Linha = Record<string, unknown>;
export const ehLinha = (v: unknown): v is Linha => typeof v === 'object' && v !== null && !Array.isArray(v);
export const linhas = (v: unknown): Linha[] => (Array.isArray(v) ? v.filter(ehLinha) : []);
export const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
export const num = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : 0;
const numOuNulo = (v: unknown): number | null => (v == null || v === '' ? null : num(v));
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
function umDe<T extends string>(lista: readonly T[], v: unknown): T | null { return lista.find(x => x === v) ?? null; }

export const CONDICOES_IMOVEL: readonly CondicaoImovel[] = ['proprietario', 'condomino', 'arrendatario', 'parceiro', 'comodatario'];
export const CONDICOES_IBS: readonly CondicaoIbs[] = ['nao_contribuinte', 'contribuinte_pelo_limite', 'optante', 'integrado'];
const REGIMES: readonly RegimeIr[] = ['pf_atividade_rural', 'pj_presumido', 'pj_real', 'pj_simples'];
const DOC_EM: readonly DocumentoEm[] = ['produtor', 'terceiro', 'alterna'];
const COMO: readonly ComoPaga[] = ['transfere_ao_terceiro', 'direto'];

export function titularDaLinha(r: Linha): Titular {
  const c = ehLinha(r.condicao_ibs) ? r.condicao_ibs : null;
  const condicao = c ? umDe(CONDICOES_IBS, c.condicao) : null;
  return {
    id: String(r.id ?? ''), nome: txt(r.nome) ?? '', documento: txt(r.documento) ?? '', documento_formatado: txt(r.documento_formatado) ?? txt(r.documento) ?? '',
    tipo: r.tipo === 'PJ' ? 'PJ' : 'PF', papel: r.papel === 'terceiro' ? 'terceiro' : 'produtor', cnpj_produtor: txt(r.cnpj_produtor),
    nascimento: txt(r.nascimento), email_fiscal: txt(r.email_fiscal), endereco: txt(r.endereco), municipio: txt(r.municipio), uf: txt(r.uf),
    cep: txt(r.cep), regime_ir: umDe(REGIMES, r.regime_ir), ativo: r.ativo !== false,
    ies: linhas(r.ies).map(i => ({ uf: txt(i.uf) ?? '', ie: txt(i.ie) ?? '', fazenda_id: txt(i.fazenda_id) })),
    fazendas: linhas(r.fazendas).map(f => ({
      fazenda_id: String(f.fazenda_id ?? ''), fazenda: txt(f.fazenda) ?? '', participacao: num(f.participacao),
      condicao: umDe(CONDICOES_IMOVEL, f.condicao) ?? 'proprietario', registra: f.registra === 'so_a_parte' ? 'so_a_parte' : 'total',
      desde: txt(f.desde), ate: txt(f.ate),
    })),
    condicao_ibs: c && condicao ? { condicao, desde: txt(c.desde), motivo: txt(c.motivo) } : null,
    grupo: linhas(r.grupo).map(g => ({
      empresa_id: String(g.empresa_id ?? ''), empresa: txt(g.empresa) ?? '', participacao: num(g.participacao), atividade: txt(g.atividade),
      entra_no_limite: g.entra_no_limite !== false,
    })),
    contas: linhas(r.contas).map(k => ({ conta_id: String(k.conta_id ?? ''), conta: txt(k.conta) ?? '' })),
    acordos: num(r.acordos), pendencias: textos(r.pendencias),
  };
}

export function acordoDaLinha(r: Linha): Acordo {
  return {
    acordo_id: String(r.acordo_id ?? ''), nome: txt(r.nome) ?? '', produtor_id: String(r.produtor_id ?? ''), produtor: txt(r.produtor) ?? '',
    terceiro_id: String(r.terceiro_id ?? ''), terceiro: txt(r.terceiro) ?? '', fazenda_id: txt(r.fazenda_id), fazenda: txt(r.fazenda),
    parte_produtor: numOuNulo(r.parte_produtor), documento_em: umDe(DOC_EM, r.documento_em) ?? 'produtor', como_paga: umDe(COMO, r.como_paga) ?? 'direto',
    palavras: textos(r.palavras), vigencia_inicio: txt(r.vigencia_inicio), vigencia_fim: txt(r.vigencia_fim), ativo: r.ativo !== false,
    observacao: txt(r.observacao), ligados: num(r.ligados), soma_ligados: num(r.soma_ligados), a_confirmar: num(r.a_confirmar),
  };
}

/* ── rótulos ───────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const ROTULO_CONDICAO_IMOVEL: Record<CondicaoImovel, string> = {
  proprietario: 'Proprietário', condomino: 'Condômino', arrendatario: 'Arrendatário', parceiro: 'Parceiro', comodatario: 'Comodatário',
};
export const ROTULO_CONDICAO_IBS: Record<CondicaoIbs, string> = {
  nao_contribuinte: 'Não contribuinte', contribuinte_pelo_limite: 'Contribuinte (limite)', optante: 'Optante', integrado: 'Integrado',
};
/** O selo curto da lista (mock: "não contribuinte", "contribuinte", "terceiro"). */
export function seloDoTitular(t: Titular): { texto: string; tom: 'verde' | 'ambar' | 'cinza' } {
  if (!t.ativo) return { texto: 'inativo', tom: 'cinza' };
  if (t.papel === 'terceiro') return { texto: 'terceiro', tom: 'ambar' };
  if (!t.condicao_ibs) return { texto: 'sem condição', tom: 'cinza' };
  return t.condicao_ibs.condicao === 'nao_contribuinte' ? { texto: 'não contribuinte', tom: 'verde' } : { texto: 'contribuinte', tom: 'ambar' };
}
export const ROTULO_REGIME: Record<RegimeIr, string> = {
  pf_atividade_rural: 'PF · livro caixa', pj_presumido: 'PJ · presumido', pj_real: 'PJ · real', pj_simples: 'PJ · Simples',
};
export const ROTULO_DOC_EM: Record<DocumentoEm, string> = { produtor: 'do produtor', terceiro: 'do terceiro', alterna: 'um ou outro' };
export const ROTULO_COMO_PAGA: Record<ComoPaga, string> = { transfere_ao_terceiro: 'transfere ao terceiro', direto: 'paga direto' };

/** A segunda linha da lista (mock: "CPF •••-12 · 3 fazendas" / "parceiro de rateio · não é cliente" / "CNPJ … · grupo"). */
export function linhaDoTitular(t: Titular): string {
  if (t.papel === 'terceiro') return `${t.tipo === 'PF' ? 'CPF' : 'CNPJ'} ${t.documento_formatado} · parceiro de rateio`;
  const partes = [`${t.tipo === 'PF' ? 'CPF' : 'CNPJ'} ${t.documento_formatado}`];
  if (t.fazendas.length) partes.push(t.fazendas.length === 1 ? '1 fazenda' : `${t.fazendas.length} fazendas`);
  return partes.join(' · ');
}

export const pct = (v: number | null | undefined): string =>
  v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
export const mesBR = (iso: string | null | undefined): string => (iso && /^\d{4}-\d{2}/.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
export const brl = (v: number): string => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ── a composição de cada fazenda (todos os titulares, versão vigente hoje) ─────────────────────────────────────────────── */
export interface ParteNaFazenda { titular_id: string; nome: string; papel: Papel; participacao: number; condicao: CondicaoImovel; registra: Registra; desde: string | null }
export function composicaoPorFazenda(titulares: readonly Titular[]): Map<string, ParteNaFazenda[]> {
  const m = new Map<string, ParteNaFazenda[]>();
  for (const t of titulares) for (const f of t.fazendas) {
    const lista = m.get(f.fazenda_id) ?? [];
    lista.push({ titular_id: t.id, nome: t.nome, papel: t.papel, participacao: f.participacao, condicao: f.condicao, registra: f.registra, desde: f.desde });
    m.set(f.fazenda_id, lista);
  }
  for (const lista of m.values()) lista.sort((a, b) => b.participacao - a.participacao || a.nome.localeCompare(b.nome, 'pt-BR'));
  return m;
}
/** "Com quem divide" da linha do titular: os OUTROS da mesma fazenda, "Higino 50%" (ou "—"). */
export function comQuemDivide(fazendaId: string, titularId: string, composicao: Map<string, ParteNaFazenda[]>): string {
  const outros = (composicao.get(fazendaId) ?? []).filter(p => p.titular_id !== titularId);
  return outros.length ? outros.map(p => `${p.nome} ${pct(p.participacao)}`).join(' · ') : '—';
}
export const somaDaFazenda = (partes: ReadonlyArray<{ participacao: number }>): number =>
  Math.round(partes.reduce((s, p) => s + p.participacao, 0) * 10000) / 10000;

/* ── o formulário da ficha (Identificação + regime do IR) ─────────────────────────────────────────────────────────────────── */
export interface FormTitular {
  nome: string; documento: string; papel: Papel; cnpj_produtor: string; nascimento: string; email_fiscal: string; endereco: string;
  municipio: string; uf: string; cep: string; regime_ir: RegimeIr | ''; ies: IeDoTitular[];
}
export const FORM_VAZIO: FormTitular = {
  nome: '', documento: '', papel: 'produtor', cnpj_produtor: '', nascimento: '', email_fiscal: '', endereco: '', municipio: '', uf: '', cep: '',
  regime_ir: '', ies: [],
};
export function formDoTitular(t: Titular | null): FormTitular {
  if (!t) return { ...FORM_VAZIO, ies: [] };
  return {
    nome: t.nome, documento: t.documento_formatado, papel: t.papel, cnpj_produtor: t.cnpj_produtor ?? '', nascimento: t.nascimento ?? '',
    email_fiscal: t.email_fiscal ?? '', endereco: t.endereco ?? '', municipio: t.municipio ?? '', uf: t.uf ?? '', cep: t.cep ?? '',
    regime_ir: t.regime_ir ?? '', ies: t.ies.map(i => ({ ...i })),
  };
}
/** Só dígitos e letras, maiúsculas — a mesma normalização do banco, para COMPARAR (quem grava normaliza de novo). */
export const soDocumento = (s: string): string => s.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
/** Tipo pelo que foi digitado (11 = PF, 14 = PJ); o banco decide de novo. */
export const tipoDoDocumento = (s: string): Tipo | null => (soDocumento(s).length === 11 ? 'PF' : soDocumento(s).length === 14 ? 'PJ' : null);

const iesIguais = (a: readonly IeDoTitular[], b: readonly IeDoTitular[]): boolean => {
  const k = (l: readonly IeDoTitular[]) => l.map(i => `${i.uf}|${soDocumento(i.ie)}|${i.fazenda_id ?? ''}`).sort().join(';');
  return k(a) === k(b);
};
/** O `p_dados` da `fn_fiscal_titular_gravar`: no NOVO, tudo; na edição, só o que mudou (chave ausente = o banco mantém; vazio = limpa). */
export function dadosDoForm(antes: FormTitular | null, depois: FormTitular): Record<string, unknown> {
  const campos: Array<keyof Omit<FormTitular, 'ies'>> = ['nome', 'documento', 'papel', 'cnpj_produtor', 'nascimento', 'email_fiscal', 'endereco',
    'municipio', 'uf', 'cep', 'regime_ir'];
  const d: Record<string, unknown> = {};
  for (const c of campos) {
    const v = depois[c].trim();
    const igual = antes != null && (c === 'documento' || c === 'cnpj_produtor' ? soDocumento(antes[c]) === soDocumento(v) : antes[c].trim() === v);
    if (antes == null ? v !== '' : !igual) d[c] = v;
  }
  if (antes == null ? depois.ies.length > 0 : !iesIguais(antes.ies, depois.ies)) {
    d.ies = depois.ies.filter(i => i.ie.trim() !== '').map(i => ({ uf: i.uf, ie: i.ie.trim(), fazenda_id: i.fazenda_id ?? '' }));
  }
  return d;
}
/** O que falta ANTES de ir ao banco (só o que o próprio banco também recusa: nome e documento; o resto é aviso dele). */
export function pendenciasDoForm(f: FormTitular): Partial<Record<'nome' | 'documento' | 'ies', string>> {
  const p: Partial<Record<'nome' | 'documento' | 'ies', string>> = {};
  if (!f.nome.trim()) p.nome = 'Informe o nome do titular.';
  if (!soDocumento(f.documento)) p.documento = 'Informe o CPF ou o CNPJ do titular.';
  if (f.ies.some(i => i.ie.trim() !== '' && !i.uf)) p.ies = 'Informe a UF de cada inscrição estadual.';
  return p;
}

/* ── a prévia do banco (as funções devolvem formatos parecidos; a tela mostra uma lista de frases) ───────────────────────── */
export interface Previa { frase: string; linhas: string[]; avisos: string[]; nadaMuda: boolean }
const ROTULO_CAMPO: Record<string, string> = {
  nome: 'Nome', documento: 'CPF/CNPJ', papel: 'Papel', cnpj_produtor: 'CNPJ do produtor PF', nascimento: 'Nascimento', email_fiscal: 'E-mail fiscal',
  endereco: 'Endereço', municipio: 'Município', uf: 'UF', cep: 'CEP', regime_ir: 'Regime do IR', ativo: 'Ativo', ies: 'Inscrições estaduais',
  produtor_id: 'Produtor', terceiro_id: 'Terceiro', fazenda_id: 'Fazenda', parte_produtor: 'Parte do produtor', documento_em: 'Documento em nome de',
  como_paga: 'Como paga', palavras: 'Palavras da sugestão', vigencia_inicio: 'Início', vigencia_fim: 'Fim', observacao: 'Observação',
};
function valorLegivel(campo: string, v: unknown, nomes: ReadonlyMap<string, string>): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (campo === 'ies') return linhas(v).map(i => `${txt(i.uf) ?? ''} ${txt(i.ie) ?? ''}`.trim()).join(', ') || '—';
  if (campo === 'palavras') return textos(v).join(', ') || '—';
  if (typeof v === 'string') {
    const regime = campo === 'regime_ir' ? umDe(REGIMES, v) : null;
    if (regime) return ROTULO_REGIME[regime];
    const docEm = campo === 'documento_em' ? umDe(DOC_EM, v) : null;
    if (docEm) return ROTULO_DOC_EM[docEm];
    const como = campo === 'como_paga' ? umDe(COMO, v) : null;
    if (como) return ROTULO_COMO_PAGA[como];
    if (campo === 'papel') return v === 'terceiro' ? 'terceiro (parceiro de rateio)' : 'produtor';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return dataBR(v);
    return nomes.get(v) ?? v;
  }
  if (typeof v === 'number') return campo === 'parte_produtor' ? pct(v) : v.toLocaleString('pt-BR');
  return '—';
}
function partesLegiveis(v: unknown): string {
  const l = linhas(v);
  if (!l.length) return 'ninguém';
  return l.map(p => `${txt(p.nome) ?? ''} ${pct(numOuNulo(p.participacao))}${p.registra === 'so_a_parte' ? ' (só a parte)' : ''}`.trim()).join(' · ');
}
/** Lê a prévia de qualquer escritor fiscal (`p_simular = true`). `nomes` = id → nome (titulares, fazendas) para não mostrar id. */
export function lerPrevia(r: unknown, nomes: ReadonlyMap<string, string> = new Map()): Previa {
  const o = ehLinha(r) ? r : {};
  const linhasDaPrevia: string[] = [];
  for (const d of linhas(o.diferencas)) {
    const campo = txt(d.campo) ?? '';
    linhasDaPrevia.push(`${ROTULO_CAMPO[campo] ?? campo}: ${valorLegivel(campo, d.antes, nomes)} → ${valorLegivel(campo, d.depois, nomes)}`);
  }
  if (Array.isArray(o.antes) || Array.isArray(o.depois)) {
    linhasDaPrevia.push(`Antes: ${partesLegiveis(o.antes)}`, `Depois: ${partesLegiveis(o.depois)}`);
  } else if (ehLinha(o.depois) && !o.diferencas) {
    const a = ehLinha(o.antes) ? o.antes : null;
    const dep = o.depois;
    if ('condicao' in dep) {
      const rot = (x: unknown) => { const c = umDe(CONDICOES_IBS, x); return c ? ROTULO_CONDICAO_IBS[c] : '—'; };
      linhasDaPrevia.push(`Condição: ${a ? `${rot(a.condicao)} (desde ${mesBR(txt(a.inicio))})` : '—'} → ${rot(dep.condicao)} (desde ${mesBR(txt(dep.inicio))})`);
    } else if ('titular_nome' in dep) {
      linhasDaPrevia.push(`Titular da conta: ${(a && txt(a.titular_nome)) ?? '—'} → ${txt(dep.titular_nome) ?? '—'}`);
    }
  }
  if (o.corrige_a_versao === true) linhasDaPrevia.push('Corrige a versão desta data (a de antes fica no histórico).');
  const termina = txt(o.anterior_termina);
  if (termina) linhasDaPrevia.push(`A versão anterior termina em ${dataBR(termina)}.`);
  const avisos = [...textos(o.avisos), ...textos(o.pendencias).map(p => `Cadastro incompleto: ${p}`)];
  const frase = txt(o.frase) ?? '';
  const nadaMuda = /nada muda|não muda/.test(frase) || (Array.isArray(o.diferencas) && o.diferencas.length === 0);
  return { frase, linhas: linhasDaPrevia, avisos, nadaMuda };
}

/** As UFs que o banco aceita (a mesma lista de `fn_fiscal_titular_gravar`). */
export const UFS: readonly string[] = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN',
  'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
/** Os anos do campo de mês das versões (composição, condição, grupo): de 2000 até o ano que vem. */
export function anosDasVersoes(hoje: string): number[] {
  const fim = Number(hoje.slice(0, 4)) + 1;
  return Array.from({ length: fim - 1999 }, (_, i) => 2000 + i);
}

/** O primeiro dia do mês do campo de mês ('AAAA-MM' → 'AAAA-MM-01'); as versões (composição, condição, grupo) começam no mês. */
export const inicioDoMes = (anoMes: string): string => `${anoMes.slice(0, 7)}-01`;
