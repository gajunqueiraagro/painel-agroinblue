/**
 * FIN-CONSORCIO-02 — o consórcio universal na tela. Puro: o leitor da tela do banco (`fn_consorcio_tela`) e do gerador
 * (`fn_consorcio_cronograma`), sem cast; o formulário ↔ as regras; os textos. A conta é do banco: a tela não soma componente nem
 * calcula faixa — lê o que o gerador e a tela devolvem.
 */

export type ModoDoComponente = 'pct_parcela' | 'pct_total' | 'valor';
export type Transcorridas = 'diluidas' | 'adiadas' | 'adesao';
export type FormaDaTaxa = 'igual' | 'antecipada' | 'manual';
export type BaseDoSeguro = 'credito' | 'credito_e_taxas' | 'saldo_devedor';
export type InicioDoSeguro = 'primeira' | 'contemplacao';
export type Indice = 'ipca' | 'incc' | 'igpm' | 'preco_do_bem' | 'nenhum';
export type SituacaoDaParcela = 'paga' | 'a_ligar' | 'a_vencer' | 'adiada';

export interface Componente { modo: ModoDoComponente | 'auto'; valor: number | null; totalPct?: number | null }

/** O formulário do consórcio (o que o banco grava em `regras` + o cadastro). */
export interface FormDoConsorcio {
  descricao: string; credorId: string | null; grupo: string; cota: string; tipoBem: string; atividade: 'pecuaria' | 'agricultura';
  fazendaId: string | null; contaId: string | null; planoJurosId: string | null; dataAdesao: string | null;
  carta: number | null; primeiraParcela: string | null; indice: Indice; tetoPct: number | null; mesReajuste: number | null;
  prazoGrupo: number | null; jaTranscorridas: number | null; transcorridas: Transcorridas;
  taxaTotalPct: number | null; formaTaxa: FormaDaTaxa; taxaPctParcela: number | null; taxaPrimeiras: number | null; taxaAdesaoPct: number | null;
  fundoComum: Componente; reserva: Componente;
  seguroModo: 'pct_mes' | 'valor'; seguroValor: number | null; seguroBase: BaseDoSeguro; seguroInicio: InicioDoSeguro;
}

export const FORM_VAZIO: FormDoConsorcio = {
  descricao: '', credorId: null, grupo: '', cota: '', tipoBem: '', atividade: 'pecuaria', fazendaId: null, contaId: null, planoJurosId: null,
  dataAdesao: null, carta: null, primeiraParcela: null, indice: 'nenhum', tetoPct: null, mesReajuste: null, prazoGrupo: null, jaTranscorridas: 0,
  transcorridas: 'diluidas', taxaTotalPct: null, formaTaxa: 'igual', taxaPctParcela: null, taxaPrimeiras: null, taxaAdesaoPct: null,
  fundoComum: { modo: 'auto', valor: null }, reserva: { modo: 'pct_total', valor: null },
  seguroModo: 'pct_mes', seguroValor: null, seguroBase: 'credito_e_taxas', seguroInicio: 'primeira',
};

const numOuNulo = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** O formulário → as regras do gerador (as chaves que o banco lê). */
export function regrasDoForm(f: FormDoConsorcio): Record<string, unknown> {
  const comp = (c: Componente, comTotal: boolean) => (c.modo === 'auto' ? { modo: 'auto' }
    : { modo: c.modo, valor: numOuNulo(c.valor), ...(comTotal && c.totalPct != null ? { total_pct: c.totalPct } : {}) });
  return {
    carta: numOuNulo(f.carta), primeira_parcela: f.primeiraParcela, prazo_grupo: numOuNulo(f.prazoGrupo),
    ja_transcorridas: numOuNulo(f.jaTranscorridas) ?? 0, transcorridas: f.transcorridas, data_adesao: f.dataAdesao,
    fundo_comum: comp(f.fundoComum, false),
    taxa_adm: { total_pct: numOuNulo(f.taxaTotalPct), forma: f.formaTaxa, pct_parcela: numOuNulo(f.taxaPctParcela), primeiras: numOuNulo(f.taxaPrimeiras) },
    taxa_adesao_pct: numOuNulo(f.taxaAdesaoPct),
    fundo_reserva: comp(f.reserva, true),
    seguro: { modo: f.seguroModo, valor: numOuNulo(f.seguroValor), base: f.seguroBase, inicio: f.seguroInicio },
    reajuste: { indice: f.indice, teto_pct: numOuNulo(f.tetoPct), mes: numOuNulo(f.mesReajuste) },
  };
}

/** O que vai ao banco (`fn_consorcio_salvar`). */
export function dadosDoForm(f: FormDoConsorcio, clienteId: string): Record<string, unknown> {
  return {
    cliente_id: clienteId, descricao: f.descricao, credor_id: f.credorId, grupo: f.grupo, cota: f.cota, tipo_bem: f.tipoBem,
    atividade: f.atividade, fazenda_id: f.fazendaId, conta_bancaria_id: f.contaId, plano_juros_id: f.planoJurosId,
    data_adesao: f.dataAdesao, regras: regrasDoForm(f),
  };
}

/* ── leitores sem cast ─────────────────────────────────────────────────────────────────────────────────────────────── */
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const bool = (v: unknown): boolean => v === true;
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export interface Faixa { faixa: number; de: number; ate: number; parcelas: number; adiada: boolean; fundoComum: number; taxaAdm: number; reserva: number; seguro: number; total: number;
  /** FIN-CONSORCIO-03b: os centavos do fundo comum que o gerador pôs nesta faixa (a última do grupo que recebe o resto); nulo sem ajuste */
  ajusteArredondamento: number | null }
export interface Totais { fundoComum: number; taxaAdm: number; reserva: number; seguro: number; total: number }
export interface Cronograma { faixas: Faixa[]; totais: Totais | null; avisos: string[]; recusa: string | null; parcelas: number; aPagarAgora: number | null; adiadas: number | null; vencimentoFinal: string | null }

function lerFaixa(v: unknown): Faixa | null {
  const o = obj(v); if (!o) return null;
  const faixa = num(o.faixa), de = num(o.de), ate = num(o.ate);
  if (faixa === null || de === null || ate === null) return null;
  return { faixa, de, ate, parcelas: num(o.parcelas) ?? 0, adiada: bool(o.adiada), fundoComum: num(o.fundo_comum) ?? 0, taxaAdm: num(o.taxa_adm) ?? 0,
    reserva: num(o.fundo_reserva) ?? 0, seguro: num(o.seguro) ?? 0, total: num(o.total) ?? 0, ajusteArredondamento: num(o.ajuste_arredondamento) };
}
export function lerCronograma(v: unknown): Cronograma | null {
  const o = obj(v); if (!o) return null;
  const faixas: Faixa[] = [];
  for (const f of lista(o.faixas)) { const x = lerFaixa(f); if (!x) return null; faixas.push(x); }
  const t = obj(o.totais);
  return { faixas, avisos: lista(o.avisos).map((a) => txt(a)).filter((a): a is string => !!a), recusa: txt(o.recusa),
    totais: t ? { fundoComum: num(t.fundo_comum) ?? 0, taxaAdm: num(t.taxa_adm) ?? 0, reserva: num(t.fundo_reserva) ?? 0, seguro: num(t.seguro) ?? 0, total: num(t.total) ?? 0 } : null,
    parcelas: num(o.parcelas) ?? 0, aPagarAgora: num(o.a_pagar_agora), adiadas: num(o.adiadas), vencimentoFinal: txt(o.vencimento_final) };
}

export interface ParcelaDoConsorcio {
  id: string; numero: number; vencimento: string | null; fundoComum: number; taxaAdm: number; reserva: number; seguro: number; total: number;
  faixa: number | null; adiada: boolean; ajustada: boolean; situacao: SituacaoDaParcela; trava: string | null;
  /** FIN-CONSORCIO-03b: o ajuste de arredondamento do gerador, quando o fundo comum gravado é o dele */
  ajusteArredondamento: number | null;
  lancamentoId: string | null; pago: number | null; devolvido: number | null; liquido: number | null;
}
export interface SaldoDoConsorcio {
  carta: number; fundoComumPago: number; fundoComumAPagar: number; fundoComumAdiado: number; aPagar: number; custo: number; total: number;
  taxaAdm: number; reserva: number; seguro: number;
  ultimaAPagar: string | null; pagas: number; parcelas: number; adiadasSemData: number;
}
export interface TelaDoConsorcio {
  contrato: { id: string; status: string; descricao: string; credorId: string | null; credorNome: string | null; fazendaId: string | null; contaId: string | null;
    planoJurosId: string | null; atividade: string | null; carta: number; primeiraParcela: string | null; dataAdesao: string | null; grupo: string | null; cota: string | null;
    tipoBem: string | null; regras: Obj; contemplado: boolean; dataContemplacao: string | null; formaContemplacao: string | null; lanceTipo: string | null;
    lanceValor: number | null; cartaRecebida: number | null };
  parcelas: ParcelaDoConsorcio[]; faixas: Faixa[]; saldo: SaldoDoConsorcio; cronograma: Cronograma | null;
  ultimaOperacao: { id: string; tipo: string } | null; documentos: number;
}
const SITUACOES: readonly SituacaoDaParcela[] = ['paga', 'a_ligar', 'a_vencer', 'adiada'];
const INDICES: readonly Indice[] = ['ipca', 'incc', 'igpm', 'preco_do_bem', 'nenhum'];
const TRANSCORRIDAS: readonly Transcorridas[] = ['diluidas', 'adiadas', 'adesao'];
const FORMAS: readonly FormaDaTaxa[] = ['igual', 'antecipada', 'manual'];
const BASES: readonly BaseDoSeguro[] = ['credito', 'credito_e_taxas', 'saldo_devedor'];
const ehSituacao = (v: unknown): v is SituacaoDaParcela => typeof v === 'string' && SITUACOES.some((s) => s === v);

export function lerTelaDoConsorcio(v: unknown): TelaDoConsorcio | null {
  const o = obj(v); if (!o) return null;
  const c = obj(o.contrato); const s = obj(o.saldo);
  if (!c || !s || !txt(c.id)) return null;
  const parcelas: ParcelaDoConsorcio[] = [];
  for (const p of lista(o.parcelas)) {
    const q = obj(p); if (!q || !txt(q.id) || num(q.numero) === null || !ehSituacao(q.situacao)) return null;
    parcelas.push({ id: String(q.id), numero: num(q.numero) ?? 0, vencimento: txt(q.vencimento), fundoComum: num(q.fundo_comum) ?? 0,
      taxaAdm: num(q.taxa_adm) ?? 0, reserva: num(q.fundo_reserva) ?? 0, seguro: num(q.seguro) ?? 0, total: num(q.total) ?? 0, faixa: num(q.faixa),
      adiada: bool(q.adiada), ajustada: bool(q.ajustada), situacao: q.situacao, trava: txt(q.trava), ajusteArredondamento: num(q.ajuste_arredondamento),
      lancamentoId: txt(q.lancamento_id),
      pago: num(q.pago), devolvido: num(q.devolvido), liquido: num(q.liquido) });
  }
  const faixas: Faixa[] = [];
  for (const f of lista(o.faixas)) { const x = lerFaixa(f); if (!x) return null; faixas.push(x); }
  const op = obj(o.ultima_operacao);
  return {
    contrato: { id: String(c.id), status: txt(c.status) ?? '', descricao: txt(c.descricao) ?? '', credorId: txt(c.credor_id), credorNome: txt(c.credor_nome),
      fazendaId: txt(c.fazenda_id), contaId: txt(c.conta_bancaria_id), planoJurosId: txt(c.plano_juros_id), atividade: txt(c.atividade),
      carta: num(c.carta) ?? 0, primeiraParcela: txt(c.primeira_parcela), dataAdesao: txt(c.data_adesao), grupo: txt(c.grupo), cota: txt(c.cota),
      tipoBem: txt(c.tipo_bem), regras: obj(c.regras) ?? {}, contemplado: bool(c.contemplado), dataContemplacao: txt(c.data_contemplacao),
      formaContemplacao: txt(c.forma_contemplacao), lanceTipo: txt(c.lance_tipo), lanceValor: num(c.lance_valor), cartaRecebida: num(c.carta_recebida) },
    parcelas, faixas,
    saldo: { carta: num(s.carta) ?? 0, fundoComumPago: num(s.fundo_comum_pago) ?? 0, fundoComumAPagar: num(s.fundo_comum_a_pagar) ?? 0,
      fundoComumAdiado: num(s.fundo_comum_adiado) ?? 0, aPagar: num(s.a_pagar) ?? 0, custo: num(s.custo) ?? 0, total: num(s.total) ?? 0,
      taxaAdm: num(s.taxa_adm) ?? 0, reserva: num(s.fundo_reserva) ?? 0, seguro: num(s.seguro) ?? 0,
      ultimaAPagar: txt(s.ultima_a_pagar), pagas: num(s.pagas) ?? 0, parcelas: num(s.parcelas) ?? 0, adiadasSemData: num(s.adiadas_sem_data) ?? 0 },
    cronograma: lerCronograma(o.cronograma),
    ultimaOperacao: op && txt(op.id) ? { id: String(op.id), tipo: txt(op.tipo) ?? '' } : null,
    documentos: num(o.documentos) ?? 0,
  };
}

/** As regras gravadas → o formulário (a volta de `regrasDoForm`). */
export function formDaTela(t: TelaDoConsorcio): FormDoConsorcio {
  const r = t.contrato.regras;
  const o = (k: string) => obj(r[k]) ?? {};
  const comp = (x: Obj): Componente => {
    const modo = txt(x.modo);
    return { modo: modo === 'pct_parcela' || modo === 'pct_total' || modo === 'valor' ? modo : 'auto', valor: num(x.valor), totalPct: num(x.total_pct) };
  };
  const taxa = o('taxa_adm'), seg = o('seguro'), rea = o('reajuste');
  const um = <T extends string>(v: unknown, ok: readonly T[], padrao: T): T => (typeof v === 'string' && ok.some((x) => x === v) ? ok.find((x) => x === v) ?? padrao : padrao);
  return {
    descricao: t.contrato.descricao, credorId: t.contrato.credorId, grupo: t.contrato.grupo ?? '', cota: t.contrato.cota ?? '', tipoBem: t.contrato.tipoBem ?? '',
    atividade: t.contrato.atividade === 'agricultura' ? 'agricultura' : 'pecuaria', fazendaId: t.contrato.fazendaId, contaId: t.contrato.contaId,
    planoJurosId: t.contrato.planoJurosId, dataAdesao: txt(r.data_adesao) ?? t.contrato.dataAdesao, carta: t.contrato.carta, primeiraParcela: t.contrato.primeiraParcela,
    indice: um(rea.indice, INDICES, 'nenhum'), tetoPct: num(rea.teto_pct), mesReajuste: num(rea.mes),
    prazoGrupo: num(r.prazo_grupo), jaTranscorridas: num(r.ja_transcorridas) ?? 0,
    transcorridas: um(r.transcorridas, TRANSCORRIDAS, 'diluidas'),
    taxaTotalPct: num(taxa.total_pct), formaTaxa: um(taxa.forma, FORMAS, 'igual'), taxaPctParcela: num(taxa.pct_parcela),
    taxaPrimeiras: num(taxa.primeiras), taxaAdesaoPct: num(r.taxa_adesao_pct), fundoComum: comp(o('fundo_comum')), reserva: comp(o('fundo_reserva')),
    seguroModo: seg.modo === 'valor' ? 'valor' : 'pct_mes', seguroValor: num(seg.valor),
    seguroBase: um(seg.base, BASES, 'credito_e_taxas'),
    seguroInicio: seg.inicio === 'contemplacao' ? 'contemplacao' : 'primeira',
  };
}

/** FIN-CONSORCIO-03b — a marca do ajuste de arredondamento (o `title` da célula e da faixa); o número é do gerador */
export const ROTULO_AJUSTE = 'ajuste';
export const tituloDoAjuste = (v: number) =>
  `ajuste de arredondamento: ${v < 0 ? '−' : '+'}R$ ${brl(Math.abs(v))} — os centavos da divisão da carta ficam na última parcela do grupo`;

/* ── FIN-CONSORCIO-03 — o que falta para o gerador, e a dica do fundo comum ─────────────────────────────────────────── */
export type CampoQueFalta = 'carta' | 'primeiraParcela' | 'prazoGrupo';
export interface ItemQueFalta { campo: CampoQueFalta; rotulo: string; aba: 'consorcio' | 'custos' }
/** Só o que falta (a regra de entrada de `fn_consorcio_cronograma`: carta > 0, 1ª parcela, prazo de 1 a 600) — nunca a lista inteira. */
export function faltaParaGerar(f: FormDoConsorcio): ItemQueFalta[] {
  const falta: ItemQueFalta[] = [];
  if (!(typeof f.carta === 'number' && f.carta > 0)) falta.push({ campo: 'carta', rotulo: 'valor da carta de crédito', aba: 'consorcio' });
  if (!f.primeiraParcela) falta.push({ campo: 'primeiraParcela', rotulo: '1ª parcela', aba: 'consorcio' });
  if (!(typeof f.prazoGrupo === 'number' && f.prazoGrupo >= 1 && f.prazoGrupo <= 600)) falta.push({ campo: 'prazoGrupo', rotulo: 'prazo do grupo (1 a 600 meses)', aba: 'custos' });
  return falta;
}

/** A dica cinza ao lado do fundo comum: os números são do gerador (a tela não divide a carta). */
export function dicaDoFundoComum(f: FormDoConsorcio, c: Cronograma | null): string {
  const pagas = c?.faixas.find((x) => !x.adiada) ?? null;
  if (f.fundoComum.modo === 'auto') {
    const base = f.transcorridas === 'diluidas' ? 'carta ÷ parcelas a pagar' : 'carta ÷ prazo';
    return pagas ? `automático: ${base} = R$ ${brl(pagas.fundoComum)}` : `automático: ${base}`;
  }
  const adiada = c?.faixas.find((x) => x.adiada) ?? null;
  /* FIN-CONSORCIO-03b: a última adiada pode ser faixa própria (os centavos do arredondamento): a contagem é a do gerador (`adiadas`) */
  const ajustada = c?.faixas.find((x) => x.adiada && x.ajusteArredondamento != null) ?? null;
  if (adiada) return `restante nas ${c?.adiadas ?? adiada.parcelas} adiadas · R$ ${brl(adiada.fundoComum)} cada`
    + (ajustada && ajustada !== adiada ? ` (a última R$ ${brl(ajustada.fundoComum)})` : '');
  if (f.transcorridas === 'adesao') return 'restante da carta pago na adesão';
  return '';
}

/* ── textos ────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const ROTULO_SITUACAO: Record<SituacaoDaParcela, string> = { paga: 'Paga', a_ligar: 'A ligar', a_vencer: 'A vencer', adiada: 'Adiada' };
export const TITULO_SITUACAO: Record<SituacaoDaParcela, string> = {
  paga: 'paga: o lançamento da parcela está realizado',
  a_ligar: 'vencida sem pagamento ligado: ligue o pagamento do banco à parcela',
  a_vencer: 'a vencer',
  adiada: 'adiada até a contemplação: o vencimento nasce quando a cota for contemplada',
};
export const ROTULO_INDICE: Record<Indice, string> = { ipca: 'IPCA', incc: 'INCC', igpm: 'IGP-M', preco_do_bem: 'Preço do bem', nenhum: 'Nenhum' };
export const TEXTO_PLANO_FIXO = 'Consórcio a contemplar · fora do DRE';
export const TITULO_PLANO_FIXO = 'fundo comum e fundo de reserva não são despesa: viram crédito acumulado na carta';

/** dd/mm/aaaa; a parcela adiada vence "na contemplação". */
export function textoDoVencimento(v: string | null): string {
  if (!v) return 'contemplação';
  return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
}
export const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** A linha curta do cabeçalho: administradora · grupo · cota · situação. */
export function linhaCurta(t: Pick<TelaDoConsorcio['contrato'], 'credorNome' | 'grupo' | 'cota' | 'contemplado' | 'dataContemplacao'>): string {
  return [t.credorNome, t.grupo ? `grupo ${t.grupo}` : null, t.cota ? `cota ${t.cota}` : null,
    t.contemplado ? `contemplado em ${textoDoVencimento(t.dataContemplacao)}` : 'não contemplado'].filter(Boolean).join(' · ');
}

/** As linhas do resumo lateral (só leitura do banco). */
/** "47–79" ou, na faixa de uma parcela só (a última adiada com os centavos), "80" */
export const intervaloDaFaixa = (f: { de: number; ate: number }) => (f.de === f.ate ? String(f.de) : `${f.de}–${f.ate}`);

export function linhasDoResumo(t: TelaDoConsorcio): { rotulo: string; valor: string }[] {
  const s = t.saldo;
  return [
    { rotulo: 'Carta', valor: brl(s.carta) },
    ...(t.faixas.length ? t.faixas.map((f) => ({ rotulo: `Faixa ${intervaloDaFaixa(f)}${f.adiada ? ' adiada' : ''}`, valor: brl(f.total) })) : [{ rotulo: 'Faixas', valor: '—' }]),
    { rotulo: 'Última a pagar', valor: s.ultimaAPagar ? textoDoVencimento(s.ultimaAPagar) : '—' },
    { rotulo: 'Custo', valor: brl(s.custo) },
    { rotulo: 'Andamento', valor: `${s.pagas} de ${s.parcelas} pagas` },
    { rotulo: 'Fundo comum pago', valor: brl(s.fundoComumPago) },
    { rotulo: 'A pagar', valor: brl(s.aPagar) },
    { rotulo: s.adiadasSemData ? `Adiado · ${s.adiadasSemData} parc.` : 'Adiado', valor: s.adiadasSemData ? brl(s.fundoComumAdiado) : '—' },
  ];
}

/** O resumo lateral só aparece com janela de 900px ou mais. */
export const LARGURA_MINIMA_DO_RESUMO = 900;
export const mostraResumo = (larguraDaJanela: number) => larguraDaJanela >= LARGURA_MINIMA_DO_RESUMO;

/** O fundo comum do contrato inteiro = pago + a pagar + adiado (as três partes que o banco separa; nenhuma conta nova). */
export const fundoComumDoContrato = (s: SaldoDoConsorcio) => s.fundoComumPago + s.fundoComumAPagar + s.fundoComumAdiado;
