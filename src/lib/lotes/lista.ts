/**
 * LOTES-03 F1 — a lógica da lista Produção › Lotes e do Histórico da ficha, pura (sem React, sem banco).
 * Cab., peso, GMD e pasto vêm do fechamento (`fn_lotes_da_fazenda`); aqui só se lê, filtra, ordena e soma.
 */
import { casaNaBusca } from '@/lib/texto/busca';
import type { ColunaOrdenavel } from '@/hooks/useOrdenacaoTabela';
import { codigoAoLado, type CadastroDoLote, type CamposDoLote, type LoteDaLista, type SituacaoDoLote } from '@/lib/lotes/tipos';

/* ── leitura sem cast ─────────────────────────────────────────────────────────────────────────── */
const campo = (o: object, k: string): unknown => Reflect.get(o, k);
const texto = (o: object, k: string): string | null => { const v = campo(o, k); return typeof v === 'string' && v !== '' ? v : null; };
const numero = (o: object, k: string): number | null => {
  const v = campo(o, k);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const textos = (o: object, k: string): string[] => { const v = campo(o, k); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; };
const ehObjeto = (v: unknown): v is object => typeof v === 'object' && v !== null && !Array.isArray(v);
const SITUACOES: readonly SituacaoDoLote[] = ['ativo', 'encerrado', 'cancelado'];
const situacao = (v: string | null): SituacaoDoLote | null => SITUACOES.find(s => s === v) ?? null;

/** Uma linha de `fn_lotes_da_fazenda` → `LoteDaLista`; linha sem id/código/situação/identidade = nula (fica fora). */
export function loteDaLinha(r: unknown): LoteDaLista | null {
  if (!ehObjeto(r)) return null;
  const id = texto(r, 'id'); const codigo = texto(r, 'codigo'); const sit = situacao(texto(r, 'situacao'));
  const cat = texto(r, 'categoria_id'); const raca = texto(r, 'raca_id'); const ativ = texto(r, 'atividade_id');
  const num = numero(r, 'numero'); const versao = numero(r, 'versao'); const formado = texto(r, 'formado_em');
  if (!id || !codigo || !sit || !cat || !raca || !ativ || num == null || versao == null || !formado) return null;
  return {
    id, codigo, codigosAntigos: textos(r, 'codigos_antigos'), nomeCampeiro: texto(r, 'nome_campeiro'), situacao: sit,
    formadoEm: formado, encerradoEm: texto(r, 'encerrado_em'), categoriaId: cat, racaId: raca, atividadeId: ativ, numero: num,
    sistemaId: texto(r, 'sistema_id'), programaId: texto(r, 'programa_id'), destinoId: texto(r, 'destino_id'), safra: texto(r, 'safra'),
    carimbo: texto(r, 'carimbo'), idadeMediaMeses: numero(r, 'idade_media_meses'), metaPesoKg: numero(r, 'meta_peso_kg'),
    metaGmdKg: numero(r, 'meta_gmd_kg'), metaData: texto(r, 'meta_data'), versao,
    anoMesDado: texto(r, 'ano_mes_dado'), cabecas: numero(r, 'cabecas'), pesoMedioKg: numero(r, 'peso_medio_kg'), gmdKg: numero(r, 'gmd_kg'),
    pastos: textos(r, 'pastos'), lancamentos: numero(r, 'lancamentos') ?? 0,
    conferir: texto(r, 'conferir'),
  };
}

/** Os nomes do cadastro por id (atividade, sistema…); id sem nome = "—". */
export type NomesDoCadastro = ReadonlyMap<string, CadastroDoLote>;
export const mapaDoCadastro = (lista: readonly CadastroDoLote[]): NomesDoCadastro => new Map(lista.map(c => [c.id, c]));
export const nomeDe = (nomes: NomesDoCadastro, id: string | null): string | null => (id ? nomes.get(id)?.nome ?? null : null);

/* ── filtro ───────────────────────────────────────────────────────────────────────────────────── */
export type FiltroDeSituacao = 'ativo' | 'encerrado';
export interface FiltroDosLotes { situacao: FiltroDeSituacao; atividadeId: string | null; busca: string }

/** Situação (o cancelado nunca vem da RPC), atividade e busca sem acento em código, nome do campeiro, pasto e códigos ANTIGOS (D1). */
export function filtrarLotes(lotes: readonly LoteDaLista[], f: FiltroDosLotes): LoteDaLista[] {
  const termo = f.busca.trim();
  return lotes.filter(l => l.situacao === f.situacao
    && (!f.atividadeId || l.atividadeId === f.atividadeId)
    && (!termo || [l.codigo, l.carimbo, l.nomeCampeiro, ...l.pastos, ...l.codigosAntigos].some(t => casaNaBusca(t, termo))));
}

/* ── ordenação: todas as colunas ──────────────────────────────────────────────────────────────── */
export type ColunaDosLotes = 'codigo' | 'categoria' | 'raca' | 'programa' | 'cab' | 'peso' | 'gmd' | 'pasto';

/** Carimbo "mês.lote" ordena pelo mês e depois pelo lote (7.2 antes de 10.1); a ressinc. do mês vem depois dos lotes dele
 *  (7.2 < 7R < 7R.2 < 8.1, LOTES-05); sem carimbo = fim. */
export function chaveDoCarimbo(c: string | null): number | null {
  const m = c ? /^(\d{1,2})(R)?(?:\.(\d{1,2}))?$/.exec(c) : null;
  if (!m || (!m[2] && !m[3])) return null;
  return Number(m[1]) * 1000 + (m[2] ? 100 : 0) + Number(m[3] ?? 1);
}

/** LOTES-04 (mock lotes-codigo-lista.html) — as colunas da lista: Nome, Sistema, Destino e Carimbo ficam na ficha. */
export function colunasDosLotes(nomes: NomesDoCadastro): ColunaOrdenavel<LoteDaLista, ColunaDosLotes>[] {
  return [
    /* LOTES-05: o lote de cria com carimbo aparece e ordena pelo carimbo (7.1 … 7R … 10.1), antes dos que têm só o código */
    { coluna: 'codigo', tipo: 'texto', valor: l => { const k = chaveDoCarimbo(l.carimbo); return k == null ? `1 ${l.codigo}` : `0 ${String(k).padStart(5, '0')}`; } },
    { coluna: 'categoria', tipo: 'texto', valor: l => nomeDe(nomes, l.categoriaId) },
    { coluna: 'raca', tipo: 'texto', valor: l => nomeDe(nomes, l.racaId) },
    { coluna: 'programa', tipo: 'texto', valor: l => nomeDe(nomes, l.programaId) },
    { coluna: 'cab', tipo: 'numero', valor: l => l.cabecas },
    { coluna: 'peso', tipo: 'numero', valor: l => l.pesoMedioKg },
    { coluna: 'gmd', tipo: 'numero', valor: l => l.gmdKg },
    { coluna: 'pasto', tipo: 'texto', valor: l => textoDosPastos(l.pastos) },
  ];
}

/* ── grupos por atividade (LOTES-04) ──────────────────────────────────────────────────────────── */
export interface GrupoDaAtividade { atividadeId: string; nome: string; lotes: LoteDaLista[]; total: TotalDosLotes }

/** A fase na ordem do rebanho: cria, recria, engorda; as outras atividades depois, pelo nome. */
const ORDEM_DA_FASE: Readonly<Record<string, number>> = { CRI: 0, CR: 0, REC: 1, RC: 1, ENG: 2, EG: 2 };

export const faseDaAtividade = (sigla: string | null): number => ORDEM_DA_FASE[sigla ?? ''] ?? 3;

/** Os lotes (já ordenados pela coluna escolhida) em grupos por atividade, com subtotal; a ordem dentro do grupo é a de entrada. */
export function gruposPorAtividade(lotes: readonly LoteDaLista[], nomes: NomesDoCadastro): GrupoDaAtividade[] {
  const grupos = new Map<string, LoteDaLista[]>();
  for (const l of lotes) grupos.set(l.atividadeId, [...(grupos.get(l.atividadeId) ?? []), l]);
  const fase = (id: string) => faseDaAtividade(nomes.get(id)?.sigla ?? null);
  return [...grupos.entries()]
    .map(([atividadeId, ls]) => ({ atividadeId, nome: nomeDe(nomes, atividadeId) ?? '—', lotes: ls, total: totalDosLotes(ls) }))
    .sort((a, b) => fase(a.atividadeId) - fase(b.atividadeId) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** LOTES-LISTA-ALINHAR-01 — o nº de lotes na coluna Categoria do subtotal e do total: "1 lote", "6 lotes" (os números ficam nas colunas deles). */
export const textoDosLotes = (n: number): string => `${n} ${n === 1 ? 'lote' : 'lotes'}`;

/** O pasto na célula: um = o nome; vários = "N pastos" (o inteiro vai no `title`). */
export const textoDosPastos = (p: readonly string[]): string | null => (p.length === 0 ? null : p.length === 1 ? p[0] : `${p.length} pastos`);

/** LOTES-04 — os códigos antigos numa linha, sem cortar: o mais recente (o último guardado) e "+N" (a lista inteira vai no `title`). */
/** LOTES-05 — o title do nome na lista: o código (quando aparece o carimbo) e os de antes. */
export function tituloDoCodigo(l: Pick<LoteDaLista, 'codigo' | 'carimbo' | 'codigosAntigos' | 'daCria'>): string | undefined {
  const partes = [codigoAoLado(l), l.codigosAntigos.length ? `antes: ${l.codigosAntigos.join(' · ')}` : null].filter(Boolean);
  return partes.length ? partes.join(' · ') : undefined;
}

export function antigosCurto(antigos: readonly string[]): string {
  if (antigos.length === 0) return '—';
  const ultimo = antigos[antigos.length - 1];
  return antigos.length > 1 ? `${ultimo} · +${antigos.length - 1}` : ultimo;
}

/* ── total ────────────────────────────────────────────────────────────────────────────────────── */
export interface TotalDosLotes { lotes: number; cabecas: number | null; pesoMedioKg: number | null; gmdKg: number | null }

/** Cab. somada; peso e GMD PONDERADOS pelas cabeças dos lotes que têm o número (o lote sem peso não puxa a média para zero). */
export function totalDosLotes(lotes: readonly LoteDaLista[]): TotalDosLotes {
  let cab = 0; let algum = false; let kg = 0; let cabPeso = 0; let gmd = 0; let cabGmd = 0;
  for (const l of lotes) {
    if (l.cabecas == null) continue;
    algum = true; cab += l.cabecas;
    if (l.pesoMedioKg != null) { kg += l.cabecas * l.pesoMedioKg; cabPeso += l.cabecas; }
    if (l.gmdKg != null) { gmd += l.cabecas * l.gmdKg; cabGmd += l.cabecas; }
  }
  return { lotes: lotes.length, cabecas: algum ? cab : null, pesoMedioKg: cabPeso > 0 ? kg / cabPeso : null, gmdKg: cabGmd > 0 ? gmd / cabGmd : null };
}

/* ── histórico (audit_log) ────────────────────────────────────────────────────────────────────── */
export interface LinhaDaTrilha {
  id: string; criadoEm: string; usuarioId: string | null; via: string | null; acao: string; resumo: string | null;
  antes: object | null; depois: object | null;
}

export function trilhaDaLinha(r: unknown): LinhaDaTrilha | null {
  if (!ehObjeto(r)) return null;
  const id = texto(r, 'id'); const criado = texto(r, 'created_at'); const acao = texto(r, 'acao');
  if (!id || !criado || !acao) return null;
  const a = campo(r, 'dados_anteriores'); const d = campo(r, 'dados_novos');
  return { id, criadoEm: criado, usuarioId: texto(r, 'usuario_id'), via: texto(r, 'via'), acao, resumo: texto(r, 'resumo'),
    antes: ehObjeto(a) ? a : null, depois: ehObjeto(d) ? d : null };
}

/** Os campos que o Histórico mostra, com o rótulo; o resto (versão, datas técnicas, id) fica de fora. */
export const ROTULO_DO_CAMPO: Readonly<Record<string, string>> = {
  codigo: 'Código', nome_campeiro: 'Nome do campeiro', situacao: 'Situação', formado_em: 'Formado em', sistema_id: 'Sistema',
  programa_id: 'Programa', destino_id: 'Destino', safra: 'Safra', carimbo: 'Carimbo', idade_media_meses: 'Idade média',
  meta_peso_kg: 'Peso meta', meta_gmd_kg: 'GMD meta', meta_data: 'Data alvo',
};
const CAMPOS_DE_CADASTRO = new Set(['sistema_id', 'programa_id', 'destino_id']);
const CAMPOS_DE_DATA = new Set(['formado_em', 'meta_data']);
const ROTULO_DA_SITUACAO: Readonly<Record<string, string>> = { ativo: 'Ativo', encerrado: 'Encerrado', cancelado: 'Cancelado' };

/** "aaaa-mm-dd" → "dd/mm/aaaa"; outro texto volta igual. */
export const dataBr = (iso: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

function valorLegivel(chave: string, v: unknown, nomes: NomesDoCadastro): string {
  if (v == null || v === '') return '—';
  const s = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : JSON.stringify(v);
  if (CAMPOS_DE_CADASTRO.has(chave)) return nomes.get(s)?.nome ?? '—';
  if (CAMPOS_DE_DATA.has(chave)) return dataBr(s);
  if (chave === 'situacao') return ROTULO_DA_SITUACAO[s] ?? s;
  if (chave === 'idade_media_meses') return `${s} meses`;
  if (chave === 'meta_peso_kg') return `${Number(s).toLocaleString('pt-BR')} kg`;
  if (chave === 'meta_gmd_kg') return `${Number(s).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg/dia`;
  return s;
}

export interface MudancaDoHistorico {
  chave: string; campo: string; antes: string; depois: string;
  /** o que o Desfazer manda à RPC: o valor de ANTES (nulo = não dá para desfazer este campo por aqui) */
  desfazer: { tipo: 'campos'; campos: CamposDoLote } | { tipo: 'situacao'; situacao: SituacaoDoLote } | null;
}

/** Os campos que mudaram numa linha da trilha. Criação = uma linha "Lote criado" com o código. A identidade (categoria, raça,
 *  atividade, número) vem junta na mudança de "Código", e o Desfazer dela manda as três + o número antigo (o banco só aceita um
 *  número que já foi deste lote). */
export function mudancasDaTrilha(t: LinhaDaTrilha, nomes: NomesDoCadastro): MudancaDoHistorico[] {
  if (!t.antes && t.depois) {
    return [{ chave: 'codigo', campo: 'Código', antes: '—', depois: valorLegivel('codigo', campo(t.depois, 'codigo'), nomes), desfazer: null }];
  }
  if (!t.antes || !t.depois) return [];
  const a = t.antes; const d = t.depois;
  const out: MudancaDoHistorico[] = [];
  for (const chave of Object.keys(ROTULO_DO_CAMPO)) {
    const va = campo(a, chave); const vd = campo(d, chave);
    if (JSON.stringify(va ?? null) === JSON.stringify(vd ?? null)) continue;
    let desfazer: MudancaDoHistorico['desfazer'] = null;
    if (chave === 'codigo') {
      const cat = texto(a, 'categoria_id'); const raca = texto(a, 'raca_id'); const ativ = texto(a, 'atividade_id'); const num = numero(a, 'numero');
      if (cat && raca && ativ && num != null) desfazer = { tipo: 'campos', campos: { categoria_id: cat, raca_id: raca, atividade_id: ativ, numero: num } };
    } else if (chave === 'situacao') {
      const s = situacao(texto(a, 'situacao'));
      if (s) desfazer = { tipo: 'situacao', situacao: s };
    } else {
      desfazer = { tipo: 'campos', campos: { [chave]: va == null ? '' : String(va) } };
    }
    out.push({ chave, campo: ROTULO_DO_CAMPO[chave], antes: valorLegivel(chave, va, nomes), depois: valorLegivel(chave, vd, nomes), desfazer });
  }
  return out;
}

/** "O que": o motivo gravado ("motivo: lote encerrado" → "Lote encerrado"); sem motivo, pela ação. */
export function oQueDaTrilha(t: LinhaDaTrilha): string {
  const m = t.resumo?.replace(/^motivo:\s*/, '').trim();
  if (m) return m.charAt(0).toUpperCase() + m.slice(1);
  return t.acao === 'criou' ? 'Lote criado' : t.acao === 'excluiu' ? 'Lote excluído' : 'Lote editado';
}

/** A frase do Desfazer na trilha ("desfazer: Sistema"). */
export const motivoDoDesfazer = (m: MudancaDoHistorico): string => `desfazer: ${m.campo.toLowerCase()}`;
