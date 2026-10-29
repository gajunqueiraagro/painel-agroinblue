/**
 * P128b (NOTA-JA-LANCADA; decisões (a)–(d) do Gabriel, 28/10/2026) — COMPLETAR COM A NOTA: a prévia campo a campo e a gravação única.
 * A REGRA mora no banco (`fn_nota_completar`): a prévia é a própria função com `p_simular` — ela devolve, por lançamento e por campo, o de
 * hoje → o que fica, o cadeado e o efeito no DRE. Aqui (PURO) só se monta o PEDIDO a partir do que a pessoa marcou e se lê a resposta.
 */
import { reais } from '@/lib/financeiro/nfe/formatos';

/** As colunas da prévia (uma caixa "atualizar em todas" por coluna; o mock 1b/3). */
export type ColunaCompletar = 'descricao' | 'favorecido' | 'fazenda' | 'conta' | 'subcentro' | 'documento' | 'competencia' | 'safra';
export const COLUNAS_COMPLETAR: readonly ColunaCompletar[] = ['descricao', 'favorecido', 'fazenda', 'conta', 'subcentro', 'documento', 'competencia', 'safra'];
export const ROTULO_DA_COLUNA: Record<ColunaCompletar, string> = {
  descricao: 'Descrição', favorecido: 'Fornecedor', fazenda: 'Fazenda', conta: 'Conta', subcentro: 'Subcentro', documento: 'Nº documento',
  competencia: 'Competência', safra: 'Safra',
};
/** O campo do banco de cada coluna. */
export type CampoCompletar = 'descricao' | 'favorecido_id' | 'fazenda_id' | 'conta_bancaria_id' | 'plano_conta_id' | 'numero_documento'
  | 'tipo_documento' | 'data_competencia' | 'safra_id' | 'valor' | 'data_vencimento';
export const CAMPO_DA_COLUNA: Record<ColunaCompletar, CampoCompletar> = {
  descricao: 'descricao', favorecido: 'favorecido_id', fazenda: 'fazenda_id', conta: 'conta_bancaria_id', subcentro: 'plano_conta_id',
  documento: 'numero_documento', competencia: 'data_competencia', safra: 'safra_id',
};

/** O "valor para todas" (a linha de cima da prévia). `null` = a coluna não tem valor escolhido (não entra no pedido). */
export interface ValoresParaTodas {
  descricaoBase: string;
  favorecidoId: string | null;
  fazendaId: string | null;
  contaId: string | null;
  planoContaId: string | null;
  numeroDocumento: string;
  competencia: string | null;
  /** `null` = a safra da competência (o banco decide, P138). */
  safraId: string | null;
}

/** Um lançamento da prévia, na ordem das parcelas (1..N); `programada` = pode receber valor e vencimento da nota (caminho 2). */
export interface AlvoDaPrevia { id: string; programada: boolean; notaValorCent: number | null; notaVencimento: string | null }

/** A descrição padronizada: "<base> i/N" (a base sem um "k/N" no fim). */
export function descricaoPadronizada(base: string, i: number, n: number): string {
  const limpa = base.replace(/\s*[-–]?\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/, '').trim();
  return n > 1 ? `${limpa} ${i}/${n}` : limpa;
}

/**
 * O PEDIDO ao banco: por lançamento, só os campos das colunas MARCADAS (e não mantidas naquela parcela pelo ✎). Na programada, com o caminho
 * "Completar e atualizar as não pagas", também valor e vencimento da nota. Coluna marcada sem valor escolhido não entra.
 */
export function pedidoDeCompletar(alvos: readonly AlvoDaPrevia[], todas: ValoresParaTodas, marcadas: ReadonlySet<ColunaCompletar>,
  mantidas: ReadonlySet<string>, atualizarNaoPagas: boolean): Record<string, unknown>[] {
  const n = alvos.length;
  return alvos.map((a, k) => {
    const p: Record<string, unknown> = { id: a.id };
    const usa = (c: ColunaCompletar) => marcadas.has(c) && !mantidas.has(chaveDaCelula(a.id, c));
    if (usa('descricao') && todas.descricaoBase.trim()) p.descricao = descricaoPadronizada(todas.descricaoBase, k + 1, n);
    if (usa('favorecido') && todas.favorecidoId) p.favorecido_id = todas.favorecidoId;
    if (usa('fazenda') && todas.fazendaId) p.fazenda_id = todas.fazendaId;
    if (usa('conta') && todas.contaId && a.programada) p.conta_bancaria_id = todas.contaId;
    if (usa('subcentro') && todas.planoContaId) p.plano_conta_id = todas.planoContaId;
    /* P164 — o nº da nota vai com o TIPO ("000.009.952" + Nota Fiscal: o tipo diz que é nota, o nº não leva "NF") */
    if (usa('documento') && todas.numeroDocumento.trim()) { p.numero_documento = todas.numeroDocumento.trim(); p.tipo_documento = 'Nota Fiscal'; }
    if (usa('competencia') && todas.competencia) p.data_competencia = todas.competencia;
    if (usa('safra') && todas.safraId) p.safra_id = todas.safraId;
    if (atualizarNaoPagas && a.programada) {
      if (a.notaValorCent !== null) p.valor = a.notaValorCent / 100;
      if (a.notaVencimento) p.data_vencimento = a.notaVencimento;
    }
    return p;
  });
}
export const chaveDaCelula = (id: string, c: ColunaCompletar) => `${id}:${c}`;

/* ── a resposta do banco ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface CampoDaPrevia { hoje: unknown; fica: unknown; muda: boolean; hojeNome: string | null; ficaNome: string | null; cadeado: string | null }
export interface LinhaDaPrevia { id: string; descricao: string | null; situacao: 'conciliada' | 'realizada' | 'programada'; parcelaN: number | null;
  campos: Partial<Record<CampoCompletar, CampoDaPrevia>> }
export interface EfeitoNoDre { mesDe: string; subcentroDe: string | null; mesPara: string; subcentroPara: string | null; valor: number; lancamentos: number }
export interface ResultadoCompletar { ok: boolean; recusas: string[]; linhas: LinhaDaPrevia[]; efeitoDre: EfeitoNoDre[]; operacao: string | null;
  financiamentoId: string | null }

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x)) : {});
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const texto = (x: unknown): string | null => (typeof x === 'string' ? x : null);
const SITUACOES: readonly LinhaDaPrevia['situacao'][] = ['conciliada', 'realizada', 'programada'];
const CAMPOS: readonly CampoCompletar[] = ['descricao', 'favorecido_id', 'fazenda_id', 'conta_bancaria_id', 'plano_conta_id', 'numero_documento',
  'tipo_documento', 'data_competencia', 'safra_id', 'valor', 'data_vencimento'];

export function lerResultadoCompletar(r: unknown): ResultadoCompletar {
  const o = obj(r);
  const linhas: LinhaDaPrevia[] = lista(o.linhas).map((x) => {
    const l = obj(x); const c = obj(l.campos);
    const campos: Partial<Record<CampoCompletar, CampoDaPrevia>> = {};
    for (const k of CAMPOS) {
      const v = obj(c[k]);
      if (!(k in c)) continue;
      campos[k] = { hoje: v.hoje ?? null, fica: v.fica ?? null, muda: v.muda === true, hojeNome: texto(v.hoje_nome), ficaNome: texto(v.fica_nome),
        cadeado: texto(v.cadeado) };
    }
    const sit = SITUACOES.find((s) => s === l.situacao) ?? 'programada';
    return { id: String(l.id ?? ''), descricao: texto(l.descricao), situacao: sit,
      parcelaN: typeof l.parcela_n === 'number' ? l.parcela_n : null, campos };
  });
  return {
    ok: o.ok === true,
    recusas: lista(o.recusas).map((x) => texto(obj(x).frase)).filter((x): x is string => !!x),
    linhas,
    efeitoDre: lista(o.efeito_dre).map((x) => { const e = obj(x); return { mesDe: String(e.mes_de ?? ''), subcentroDe: texto(e.subcentro_de),
      mesPara: String(e.mes_para ?? ''), subcentroPara: texto(e.subcentro_para), valor: Number(e.valor) || 0, lancamentos: Number(e.lancamentos) || 0 }; }),
    operacao: texto(o.operacao),
    financiamentoId: texto(o.financiamento_id),
  };
}

const mesBr = (m: string) => (/^\d{4}-\d{2}$/.test(m) ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : m);
/** A frase do DRE (o mock): "R$ 110.000,00 saem de "Máquinas" (05/2026) e vão para "Investimento…" (05/2026)". Sem efeito: `null`. */
export function fraseDoEfeitoNoDre(efeito: readonly EfeitoNoDre[]): string | null {
  if (!efeito.length) return null;
  return `O DRE muda: ${efeito.map((e) => {
    const de = `"${e.subcentroDe ?? 'sem subcentro'}" (${mesBr(e.mesDe)})`;
    const para = `"${e.subcentroPara ?? 'sem subcentro'}" (${mesBr(e.mesPara)})`;
    return `R$ ${reais(Math.round(e.valor * 100))} saem de ${de} e vão para ${para}`;
  }).join('; ')}.`;
}
