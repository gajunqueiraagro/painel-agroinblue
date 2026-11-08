/**
 * PASTO-FICHA-01 PR B (Gabriel 09:36) — a FICHA do pasto: o mesmo modal no "+ Novo" e no lápis. Aqui moram o formulário (puro) e as
 * chamadas ao banco; a tela (`FichaDoPasto.tsx`) só desenha.
 *
 * Os escritores são os do banco, cada um com prévia (`p_simular`):
 *   · cadastro → `fn_pasto_ficha_salvar(pasto, versão, campos, motivo)` — manda SÓ os campos que mudaram (omitir preserva);
 *   · área     → `fn_pasto_area_editar(pasto, área, a partir de, motivo)` — nunca junto do cadastro (o banco recusa);
 *   · novo     → `fn_pasto_criar(fazenda, campos, área)` — a área nasce com vigência desde o "em uso desde";
 *   · avaliação → `fn_pasto_avaliacao_salvar` / `_desfazer` (nada se apaga: desfazer = cancelar com motivo).
 * As recusas vêm prontas do banco (frase inteira na faixa do modal, nunca toast).
 */
import { supabase } from '@/integrations/supabase/client';
import type { EscolhaDoCatalogo } from '@/lib/catalogo/catalogo';
import { ESCOLHA_VAZIA } from '@/lib/catalogo/catalogo';

export type Posse = 'propria' | 'arrendada_de_terceiro' | 'cedida_a_terceiro';
export type Manejo = 'continuo' | 'rotacionado';
export type CoberturaSombra = 'insuficiente' | 'parcial' | 'suficiente';

/** O formulário da aba Cadastro (e o que a aba Infraestrutura edita: sombra e manejo). Mês = 'AAAA-MM'. */
export interface FormDaFicha {
  nome: string;
  tipoUso: string;
  observacoes: string;
  mesInicio: string | null;
  mesFim: string | null;
  posse: Posse | null;
  /** PASTO-FICHA-01 (09:36) — de quem é arrendado / a quem é cedido, e o período da posse (migration 117250, com o GO) */
  posseContraparteId: string;
  posseDesde: string | null;
  posseAte: string | null;
  sistema: EscolhaDoCatalogo;
  forrageiraPrincipal: EscolhaDoCatalogo;
  forrageiraSecundaria: EscolhaDoCatalogo;
  implantadaEm: string | null;
  relevo: EscolhaDoCatalogo;
  textura: EscolhaDoCatalogo;
  drenagem: EscolhaDoCatalogo;
  sombra: EscolhaDoCatalogo;
  sombraCobertura: CoberturaSombra | null;
  manejo: Manejo | null;
  /** a área digitada (ha) e o mês de onde ela vale */
  area: number | null;
  areaDesde: string | null;
}

export const FORM_VAZIO: FormDaFicha = {
  nome: '', tipoUso: 'recria', observacoes: '', mesInicio: null, mesFim: null, posse: 'propria',
  posseContraparteId: '', posseDesde: null, posseAte: null,
  sistema: ESCOLHA_VAZIA, forrageiraPrincipal: ESCOLHA_VAZIA, forrageiraSecundaria: ESCOLHA_VAZIA, implantadaEm: null,
  relevo: ESCOLHA_VAZIA, textura: ESCOLHA_VAZIA, drenagem: ESCOLHA_VAZIA, sombra: ESCOLHA_VAZIA, sombraCobertura: null, manejo: null,
  area: null, areaDesde: null,
};

/* ── leitura da resposta do banco (jsonb), sem `as` ──────────────────────────────────────────────────────────────────────── */
const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v
  : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const mes = (v: unknown): string | null => { const t = txt(v); return t ? t.slice(0, 7) : null; };
const umDe = <T extends string>(v: unknown, ok: readonly T[]): T | null => ok.find(o => o === v) ?? null;
const POSSES: readonly Posse[] = ['propria', 'arrendada_de_terceiro', 'cedida_a_terceiro'];
const COBERTURAS: readonly CoberturaSombra[] = ['insuficiente', 'parcial', 'suficiente'];
const MANEJOS: readonly Manejo[] = ['continuo', 'rotacionado'];
const escolha = (id: unknown, nome: unknown): EscolhaDoCatalogo => {
  const i = txt(id); return i ? { itemId: i, nome: txt(nome) ?? '' } : ESCOLHA_VAZIA;
};

export interface FichaLida {
  form: FormDaFicha;
  versao: number;
  /** a área oficial do mês e a do mapa (a faixa e o "usar a do mapa") */
  areaOficial: number | null;
  areaMapa: number | null;
  /** o mês travado (área não muda nele): a frase do banco */
  travaDaArea: string | null;
  anoMes: string;
  resumo: {
    forrageira: string | null;
    reforma: { data: string; idadeAnos: number | null } | null;
    avaliacao: { data: string; degradacao: string | null } | null;
    suporte: number | null;
    epoca: string | null;
  };
}

/** `fn_pasto_ficha` → o formulário e a faixa. Sem `pasto` não é ficha: recusa, nunca formulário vazio. */
export function lerFicha(dados: unknown): FichaLida | null {
  if (!ehObj(dados) || !ehObj(dados.pasto)) return null;
  const p = dados.pasto; const n = ehObj(dados.nomes) ? dados.nomes : {};
  const a = ehObj(dados.area) ? dados.area : {};
  const av = ehObj(dados.ultima_avaliacao) ? dados.ultima_avaliacao : null;
  const pot = ehObj(dados.potencial) ? dados.potencial : null;
  const ref = ehObj(dados.ultima_reforma) ? dados.ultima_reforma : null;
  const anoMes = txt(dados.ano_mes) ?? '';
  const oficial = num(a.oficial_ha);
  return {
    versao: num(p.ficha_versao) ?? 1,
    areaOficial: oficial,
    areaMapa: num(a.mapa_ha),
    travaDaArea: txt(a.trava),
    anoMes,
    form: {
      nome: txt(p.nome) ?? '',
      tipoUso: txt(p.tipo_uso) ?? 'recria',
      observacoes: txt(p.observacoes) ?? '',
      mesInicio: mes(p.data_inicio),
      mesFim: mes(p.data_fim),
      posse: umDe(p.posse, POSSES),
      posseContraparteId: txt(p.posse_contraparte_id) ?? '',
      posseDesde: mes(p.posse_desde),
      posseAte: mes(p.posse_ate),
      sistema: escolha(p.sistema_id, n.sistema),
      forrageiraPrincipal: escolha(p.forrageira_principal_id, n.forrageira_principal),
      forrageiraSecundaria: escolha(p.forrageira_secundaria_id, n.forrageira_secundaria),
      implantadaEm: mes(p.forrageira_implantada_em),
      relevo: escolha(p.relevo_id, n.relevo),
      textura: escolha(p.textura_id, n.textura),
      drenagem: escolha(p.drenagem_id, n.drenagem),
      sombra: escolha(p.sombra_id, n.sombra),
      sombraCobertura: umDe(p.sombra_cobertura, COBERTURAS),
      manejo: umDe(p.manejo, MANEJOS),
      area: oficial,
      areaDesde: anoMes || null,
    },
    resumo: {
      forrageira: txt(n.forrageira_principal),
      reforma: ref && txt(ref.data) ? { data: txt(ref.data) ?? '', idadeAnos: num(ref.idade_anos) } : null,
      avaliacao: av && txt(av.data_avaliacao) ? { data: txt(av.data_avaliacao) ?? '', degradacao: txt(av.degradacao) } : null,
      suporte: pot ? num(pot.potencial_ua_ha) : null,
      epoca: pot ? txt(pot.epoca) : null,
    },
  };
}

/* ── o que vai ao banco ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Os campos do cadastro como o banco os chama (`_fn_pasto_ficha_aplicar`). */
export function camposDoForm(f: FormDaFicha): Record<string, string | null> {
  const arrendado = f.posse === 'arrendada_de_terceiro' || f.posse === 'cedida_a_terceiro';
  return {
    nome: f.nome.trim(),
    tipo_uso: f.tipoUso,
    observacoes: f.observacoes.trim() || null,
    mes_inicio: f.mesInicio,
    mes_fim: f.mesFim,
    posse: f.posse,
    posse_contraparte_id: arrendado ? (f.posseContraparteId || null) : null,
    posse_desde: arrendado ? f.posseDesde : null,
    posse_ate: arrendado ? f.posseAte : null,
    sistema_id: f.sistema.itemId,
    forrageira_principal_id: f.forrageiraPrincipal.itemId,
    forrageira_secundaria_id: f.forrageiraSecundaria.itemId,
    forrageira_implantada_em: f.implantadaEm,
    relevo_id: f.relevo.itemId,
    textura_id: f.textura.itemId,
    drenagem_id: f.drenagem.itemId,
    sombra_id: f.sombra.itemId,
    sombra_cobertura: f.sombraCobertura,
    manejo: f.manejo,
  };
}

/** SÓ os campos que mudaram (omitir preserva no banco). Vazio = nada a gravar no cadastro. */
export function camposQueMudaram(antes: FormDaFicha, depois: FormDaFicha): Record<string, string | null> {
  const a = camposDoForm(antes); const d = camposDoForm(depois);
  return Object.fromEntries(Object.entries(d).filter(([k, v]) => (a[k] ?? null) !== (v ?? null)));
}

/** A área mudou (número ou mês de onde vale)? Área igual com outro mês não é mudança. */
export const areaMudou = (antes: FormDaFicha, depois: FormDaFicha): boolean =>
  depois.area != null && Math.round((depois.area - (antes.area ?? 0)) * 100) !== 0;

/** As pendências do Salvar (UX-OBRIGATORIOS-01): o campo fica vermelho com a frase; nada grava. */
export function pendencias(f: FormDaFicha, novo: boolean): Partial<Record<keyof FormDaFicha, string>> {
  const p: Partial<Record<keyof FormDaFicha, string>> = {};
  if (!f.nome.trim()) p.nome = 'Digite o nome do pasto.';
  if (!f.tipoUso) p.tipoUso = 'Escolha o destino.';
  if (f.area == null || !(f.area > 0)) p.area = 'Maior que zero.';
  if (novo && !f.mesInicio) p.mesInicio = 'Escolha o mês e o ano.';
  if (f.mesInicio && f.mesFim && f.mesFim < f.mesInicio) p.mesFim = 'O fim não pode ser antes do início.';
  if ((f.posse === 'arrendada_de_terceiro' || f.posse === 'cedida_a_terceiro') && f.posseDesde && f.posseAte && f.posseAte < f.posseDesde) {
    p.posseAte = 'O fim não pode ser antes do início.';
  }
  if (f.forrageiraSecundaria.itemId && f.forrageiraSecundaria.itemId === f.forrageiraPrincipal.itemId) {
    p.forrageiraSecundaria = 'Tem de ser outra que não a principal.';
  }
  return p;
}

/* ── o banco ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

export type Resultado<T> = { ok: true; dados: T; erro?: undefined } | { ok: false; erro: string; dados?: undefined };

/** a frase do banco inteira (ela já vem pronta); sem frase, a genérica — o texto cru vai ao console, nunca à tela */
function fraseDoErro(e: unknown): string {
  const m = ehObj(e) ? txt(e.message) : null;
  if (ehObj(e) && txt(e.code) === '40001') return m ?? 'Outra pessoa salvou este pasto antes. Feche e abra de novo.';
  if (m && !/^(JWT|permission|violates|syntax|column)/i.test(m)) return m.replace(/^[A-Z0-9]{5}: /, '');
  console.error('ficha do pasto', e);
  return 'Não consegui falar com o banco. Nada foi gravado.';
}

const semTipo = supabase as any;
async function rpc(fn: string, args: Record<string, unknown>): Promise<Resultado<unknown>> {
  const { data, error } = await semTipo.rpc(fn, args);
  return error ? { ok: false, erro: fraseDoErro(error) } : { ok: true, dados: data };
}

/** Uma diferença da prévia do banco ("Forrageira: Marandu → Mombaça"). */
export interface MudancaDaPrevia { campo: string; antes: string | null; depois: string | null }
export function lerMudancas(v: unknown): MudancaDaPrevia[] {
  const lista = ehObj(v) && Array.isArray(v.muda) ? v.muda : [];
  /* `_fn_pasto_ficha_diferencas`: campo, antes, depois e, nos itens do catálogo, o NOME (antes_nome/depois_nome) — o id nunca vai à tela */
  const valor = (nome: unknown, v: unknown) => txt(nome) ?? txt(v) ?? (v == null ? null : String(v));
  return lista.flatMap((m) => (ehObj(m) ? [{ campo: txt(m.campo) ?? '', antes: valor(m.antes_nome, m.antes), depois: valor(m.depois_nome, m.depois) }] : []));
}

export interface AvaliacaoDoPasto {
  id: string; data: string; cercas: string | null; agua: string | null; cochos: string | null; invasoras: string | null; cupins: string | null;
  erosao: string | null; degradacao: string | null; cobertura: number | null; suporteAguas: number | null; suporteSeca: number | null;
  avaliador: string | null; observacoes: string | null;
}
export interface ReformaDoPasto { bemId: string; data: string | null; descricao: string | null; areaHa: number | null; custo: number | null; rsHa: number | null; contabil: number | null }
export interface LotacaoDoMes { anoMes: string; epoca: string | null; cabecas: number | null; ua: number | null; uaHa: number | null; suporte: number | null; acima: boolean }
export interface InfraDoPasto { id: string; tipo: string; nome: string | null; observacao: string | null }

export const API_FICHA_DO_PASTO = {
  ler: async (pastoId: string, anoMes: string): Promise<Resultado<FichaLida>> => {
    const r = await rpc('fn_pasto_ficha', { p_pasto: pastoId, p_ano_mes: anoMes });
    if (!r.ok) return { ok: false, erro: r.erro ?? 'Não consegui falar com o banco.' };
    const f = lerFicha(r.dados);
    return f ? { ok: true, dados: f } : { ok: false, erro: 'Não consegui ler a ficha do pasto. Nada foi mudado.' };
  },
  salvar: (pastoId: string, versao: number, campos: Record<string, string | null>, motivo: string | null, simular: boolean) =>
    rpc('fn_pasto_ficha_salvar', { p_pasto: pastoId, p_versao: versao, p_campos: campos, p_motivo: motivo, p_simular: simular }),
  area: (pastoId: string, area: number, desde: string, motivo: string, simular: boolean) =>
    rpc('fn_pasto_area_editar', { p_pasto: pastoId, p_area_ha: area, p_vigente_desde: `${desde}-01`, p_motivo: motivo, p_simular: simular }),
  criar: (fazendaId: string, campos: Record<string, string | null>, area: number, simular: boolean) =>
    rpc('fn_pasto_criar', { p_fazenda: fazendaId, p_campos: campos, p_area_ha: area, p_simular: simular }),
  avaliacoes: async (pastoId: string): Promise<Resultado<AvaliacaoDoPasto[]>> => {
    const { data, error } = await semTipo.from('pasto_condicoes').select('*').eq('pasto_id', pastoId).eq('cancelado', false)
      .order('data_avaliacao', { ascending: false });
    if (error) return { ok: false, erro: fraseDoErro(error) };
    const lista: unknown[] = Array.isArray(data) ? data : [];
    return { ok: true, dados: lista.flatMap((a) => (ehObj(a) && txt(a.id) && txt(a.data_avaliacao) ? [{
      id: txt(a.id) ?? '', data: txt(a.data_avaliacao) ?? '', cercas: txt(a.cercas), agua: txt(a.agua), cochos: txt(a.cochos), invasoras: txt(a.invasoras),
      cupins: txt(a.cupins), erosao: txt(a.erosao), degradacao: txt(a.degradacao), cobertura: num(a.cobertura_pct), suporteAguas: num(a.suporte_aguas_ua_ha),
      suporteSeca: num(a.suporte_seca_ua_ha), avaliador: txt(a.avaliador), observacoes: txt(a.observacoes),
    }] : [])) };
  },
  salvarAvaliacao: (pastoId: string, avaliacao: Record<string, string | number | null>, simular: boolean) =>
    rpc('fn_pasto_avaliacao_salvar', { p_pasto: pastoId, p_avaliacao: avaliacao, p_id: null, p_motivo: null, p_simular: simular }),
  desfazerAvaliacao: (id: string, motivo: string, simular: boolean) =>
    rpc('fn_pasto_avaliacao_desfazer', { p_id: id, p_motivo: motivo, p_simular: simular }),
  reformas: async (pastoId: string): Promise<Resultado<ReformaDoPasto[]>> => {
    const r = await rpc('fn_pasto_reformas', { p_pasto: pastoId });
    if (!r.ok) return { ok: false, erro: r.erro ?? 'Não consegui falar com o banco.' };
    const lista: unknown[] = Array.isArray(r.dados) ? r.dados : [];
    return { ok: true, dados: lista.flatMap((x) => (ehObj(x) && txt(x.bem_id) ? [{ bemId: txt(x.bem_id) ?? '', data: txt(x.data), descricao: txt(x.descricao),
      areaHa: num(x.area_no_pasto_ha), custo: num(x.custo_rs), rsHa: num(x.rs_ha), contabil: num(x.contabil_rs) }] : [])) };
  },
  lotacao: async (pastoId: string, ate: string): Promise<Resultado<LotacaoDoMes[]>> => {
    const r = await rpc('fn_pasto_lotacao_meses', { p_pasto: pastoId, p_ate: ate, p_meses: 12 });
    if (!r.ok) return { ok: false, erro: r.erro ?? 'Não consegui falar com o banco.' };
    const lista: unknown[] = Array.isArray(r.dados) ? r.dados : [];
    return { ok: true, dados: lista.flatMap((x) => (ehObj(x) && txt(x.ano_mes) ? [{ anoMes: txt(x.ano_mes) ?? '', epoca: txt(x.epoca), cabecas: num(x.cabecas),
      ua: num(x.ua), uaHa: num(x.ua_ha), suporte: num(x.suporte_ua_ha), acima: x.acima === true }] : [])) };
  },
  infra: async (pastoId: string): Promise<Resultado<InfraDoPasto[]>> => {
    const { data, error } = await semTipo.from('fazenda_infraestruturas').select('id, tipo, nome, observacao').eq('pasto_id', pastoId).eq('ativo', true);
    if (error) return { ok: false, erro: fraseDoErro(error) };
    const lista: unknown[] = Array.isArray(data) ? data : [];
    return { ok: true, dados: lista.flatMap((x) => (ehObj(x) && txt(x.id) && txt(x.tipo) ? [{ id: txt(x.id) ?? '', tipo: txt(x.tipo) ?? '', nome: txt(x.nome), observacao: txt(x.observacao) }] : [])) };
  },
};
export type ApiFichaDoPasto = typeof API_FICHA_DO_PASTO;
