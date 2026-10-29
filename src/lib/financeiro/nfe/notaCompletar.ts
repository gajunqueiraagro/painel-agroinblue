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

/** Um lançamento da prévia, na ordem das parcelas (1..N); `programada` = pode receber valor e vencimento da nota (caminho 2).
 *  P163-v4: `pagamento` (a data, a coluna Pgto.) só para mostrar. */
export interface AlvoDaPrevia { id: string; programada: boolean; notaValorCent: number | null; notaVencimento: string | null; pagamento?: string | null;
  /** A descrição de HOJE (com a coluna Descrição desmarcada ela fica e ganha só o "i/N"). */
  descricaoHoje?: string | null;
  /** Caso 3 (o cartão, 29/10) — a POSIÇÃO desta parcela na nota ("6/10"): o "k/N" da descrição sai dela, nunca da ordem das achadas ("1/3") */
  posicao?: { k: number; n: number } }
/** o "k/N" desta parcela: a posição na nota quando se sabe; senão a ordem na prévia */
const numeroDe = (a: AlvoDaPrevia, k: number, n: number): [number, number] => (a.posicao ? [a.posicao.k, a.posicao.n] : [k + 1, n]);

/* ── P163 v4 (o mock aprovado pelo Gabriel 29/10 06:43) — A GRADE: uma linha por parcela, TODA célula que pode mudar é um campo; a 1ª linha
   "Para todas" aplica a coluna inteira (a caixinha do cabeçalho marcada); a célula editada vale SÓ naquela parcela (marcada ou não). ─────── */
/** As colunas que só aparecem quando MUDAM ou DIFEREM entre as parcelas, na ordem da casa (antes do Valor). */
export const COLUNAS_OPCIONAIS: readonly ColunaCompletar[] = ['favorecido', 'fazenda', 'conta', 'subcentro', 'safra'];
/** As células de vencimento e valor (só nas programadas; nas pagas/conciliadas, 🔒) */
export type CelulaDinheiro = 'vencimento' | 'valor';
export const chaveDaGrade = (id: string, c: ColunaCompletar | CelulaDinheiro) => `${id}:${c}`;

/** O valor "para todas" da coluna, na parcela k (de n). A conta só vai às programadas (nas pagas ela nunca muda). */
export function valorParaTodas(c: ColunaCompletar, todas: ValoresParaTodas, k: number, n: number, a: AlvoDaPrevia): string | null {
  if (c === 'descricao') return todas.descricaoBase.trim() ? descricaoPadronizada(todas.descricaoBase, ...numeroDe(a, k, n)) : null;
  if (c === 'favorecido') return todas.favorecidoId;
  if (c === 'fazenda') return todas.fazendaId;
  if (c === 'conta') return a.programada ? todas.contaId : null;
  if (c === 'subcentro') return todas.planoContaId;
  if (c === 'documento') return todas.numeroDocumento.trim() || null;
  if (c === 'competencia') return todas.competencia;
  return todas.safraId;
}

/**
 * O PEDIDO da grade: por parcela, a célula EDITADA (só nela) ou, na coluna marcada, o valor para todas. O nº vai com o tipo (Nota Fiscal).
 * Vencimento e valor: a célula editada da programada; com "atualizar as não pagas", o da nota nas programadas não editadas. Célula vazia não vai.
 */
export function pedidoDaGrade(alvos: readonly AlvoDaPrevia[], todas: ValoresParaTodas, marcadas: ReadonlySet<ColunaCompletar>,
  celulas: ReadonlyMap<string, string | number>, atualizarNaoPagas: boolean): Record<string, unknown>[] {
  const n = alvos.length;
  return alvos.map((a, k) => {
    const p: Record<string, unknown> = { id: a.id };
    for (const c of COLUNAS_COMPLETAR) {
      const editada = celulas.get(chaveDaGrade(a.id, c));
      /* a descrição SEM INFORMAÇÃO ("Parcela 3 - None") vem trocada pela da nota mesmo com a coluna desmarcada (Gabriel 29/10 08:26) */
      const usaTodas = marcadas.has(c) || (c === 'descricao' && descricaoSemInformacao(a.descricaoHoje) && a.descricaoHoje !== undefined);
      const v = editada !== undefined ? editada : usaTodas ? valorParaTodas(c, todas, k, n, a) : null;
      if (v === null || v === '') continue;
      if (c === 'conta' && !a.programada) continue;
      p[CAMPO_DA_COLUNA[c]] = v;
    }
    /* URGENTE 29/10 (o Azulão: "Reforma Ponte" virou o nome dos itens) — a Descrição DESMARCADA nunca troca o texto do usuário: a de hoje
       fica e ganha só o "i/N" (com N > 1; a célula editada vale o que a pessoa escreveu) */
    if (!('descricao' in p) && !marcadas.has('descricao') && !celulas.has(chaveDaGrade(a.id, 'descricao')) && numeroDe(a, k, n)[1] > 1 && a.descricaoHoje?.trim()) {
      const comNumero = descricaoPadronizada(a.descricaoHoje, ...numeroDe(a, k, n));
      if (comNumero !== a.descricaoHoje) p.descricao = comNumero;
    }
    if (p.numero_documento) p.tipo_documento = 'Nota Fiscal';
    if (a.programada) {
      const venc = celulas.get(chaveDaGrade(a.id, 'vencimento'));
      const valor = celulas.get(chaveDaGrade(a.id, 'valor'));
      if (venc !== undefined && venc !== '') p.data_vencimento = venc;
      else if (atualizarNaoPagas && a.notaVencimento) p.data_vencimento = a.notaVencimento;
      if (valor !== undefined && valor !== '') p.valor = valor;
      else if (atualizarNaoPagas && a.notaValorCent !== null) p.valor = a.notaValorCent / 100;
    }
    return p;
  });
}

/**
 * Quais colunas OPCIONAIS aparecem: a que MUDA (o banco disse, numa parcela), a que DIFERE entre as parcelas hoje, ou a que o valor para
 * todas mudaria. Igual em todas e sem mudança = não aparece (a legenda diz). As linhas são as da resposta do banco (o hoje de cada uma).
 */
export function colunasQueAparecem(linhas: readonly LinhaDaPrevia[], todas: ValoresParaTodas, alvos: readonly AlvoDaPrevia[]): ColunaCompletar[] {
  if (!linhas.length) return [];
  return COLUNAS_OPCIONAIS.filter((c) => {
    const campo = CAMPO_DA_COLUNA[c];
    const hoje = linhas.map((l) => { const v = l.campos[campo]?.hoje; return v === null || v === undefined || v === '' ? '' : String(v); });
    if (linhas.some((l) => l.campos[campo]?.muda)) return true;
    if (new Set(hoje).size > 1) return true;
    return alvos.some((a, k) => {
      const proposta = valorParaTodas(c, todas, k, alvos.length, a);
      return proposta !== null && proposta !== '' && hoje[k] !== undefined && hoje[k] !== proposta;
    });
  });
}

/** A descrição padronizada: "<base> i/N" (a base sem um "k/N" no fim). */
/**
 * Gabriel 29/10 08:26 — a descrição SEM INFORMAÇÃO (a que o LR/Excel trouxe: "Parcela 3 - None", "-", vazia) é a ÚNICA que a nota troca sem a
 * coluna marcada. "Parcela N - <texto>" TEM informação (no NJ: "Parcela 4 - hilux Carlos", "Parcela 2 - F2 - REFORMA PONTE"): fica e ganha só o "i/N".
 */
export function descricaoSemInformacao(descricao: string | null | undefined): boolean {
  /* o "k/N" que um completar anterior pôs no fim não dá informação ("Parcela 8 - None 3/3" segue sem informação) */
  const d = baseDaDescricao(descricao ?? '');
  return /^(parcela\s*\d+(\s*\/\s*\d+)?)?\s*(-\s*)?(none|null|nan|-)?$/i.test(d);
}

/** A base da descrição: sem o "k/N" do fim (a que a parcela aberta traz, "… - 2/5", vira "…"). */
export function baseDaDescricao(descricao: string): string {
  return descricao.replace(/\s*[-–]?\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/, '').trim();
}

export function descricaoPadronizada(base: string, i: number, n: number): string {
  const limpa = baseDaDescricao(base);
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
    const semInformacao = a.descricaoHoje !== undefined && descricaoSemInformacao(a.descricaoHoje) && !mantidas.has(chaveDaCelula(a.id, 'descricao'));
    if ((usa('descricao') || semInformacao) && todas.descricaoBase.trim()) p.descricao = descricaoPadronizada(todas.descricaoBase, ...numeroDe(a, k, n));
    /* URGENTE 29/10 (o Azulão: "Reforma Ponte" virou o nome dos itens) — a Descrição DESMARCADA nunca troca o texto do usuário: a de hoje
       fica e ganha só o "i/N" (com N > 1; a célula mantida pelo ✎ fica como está) */
    else if (!marcadas.has('descricao') && !mantidas.has(chaveDaCelula(a.id, 'descricao')) && numeroDe(a, k, n)[1] > 1 && a.descricaoHoje?.trim()) {
      const comNumero = descricaoPadronizada(a.descricaoHoje, ...numeroDe(a, k, n));
      if (comNumero !== a.descricaoHoje) p.descricao = comNumero;
    }
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
  /* P163 v4 (o mock 29/10): "DRE: …" numa linha do rodapé */
  return `DRE: ${efeito.map((e) => {
    /* P163-1 — o mesmo subcentro (a coluna Subcentro desmarcada): só o MÊS muda; nunca "sai de X e vai para X" */
    if ((e.subcentroDe ?? null) === (e.subcentroPara ?? null)) {
      return `R$ ${reais(Math.round(e.valor * 100))} passam de ${mesBr(e.mesDe)} para ${mesBr(e.mesPara)}`;
    }
    const de = `"${e.subcentroDe ?? 'sem subcentro'}" (${mesBr(e.mesDe)})`;
    const para = `"${e.subcentroPara ?? 'sem subcentro'}" (${mesBr(e.mesPara)})`;
    return `R$ ${reais(Math.round(e.valor * 100))} saem de ${de} e vão para ${para}`;
  }).join('; ')}`;
}
