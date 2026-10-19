/**
 * FIN-FINANC-28 · PASSO 4b — o dono puro da BUSCA no contrato de crédito: o leitor do envelope de `fn_financiamento_candidatas`
 * (sem cast; peça torta = nulo inteiro, nunca lista vazia inventada), o leitor do retorno do vincular / desvincular (com a
 * simulação), as frases dos avisos e o recorte dos encargos "perto da liberação".
 *
 * ⚠ QUEM DECIDE É O BANCO: pontos, motivos, papel sugerido, "outro contrato" e as recusas vêm prontos. Aqui só se lê e se escreve
 *   em português. Nenhuma soma de dinheiro.
 */

export type PapelDoPagamento = 'principal' | 'juros' | 'total';
export const PAPEIS: readonly PapelDoPagamento[] = ['principal', 'juros', 'total'];
export const ROTULO_DO_PAPEL: Record<PapelDoPagamento, string> = { principal: 'principal', juros: 'juros', total: 'parcela inteira' };

export interface OutroDono {
  tipo: 'parcela_vinculada' | 'encargo' | 'parcela_do_contrato' | 'outro_contrato';
  numeroContrato: string | null; descricao: string | null; parcela: number | null; movivel: boolean;
}

export interface Candidata {
  lancamentoId: string; data: string | null; valor: number; descricao: string | null; conta: string | null; favorecido: string | null;
  extrato: boolean; dias: number; pontos: number; motivos: string[]; status: string | null;
  papelSugerido: PapelDoPagamento | null; previsto: number | null; diferenca: number | null; outro: OutroDono | null;
}

/** FIX 4b — o que a busca procurou (o banco devolve; a tela escreve no vazio e marca os controles). */
export interface OQueFoiBuscado { faixa: 'pct10' | 'qualquer'; de: string | null; ate: string | null; texto: string | null; todas: boolean; semPrevisto: boolean }

export interface BuscaNoContrato {
  alvo: 'liberacao' | 'parcela'; de: string | null; ate: string | null; saldoALiberar: number | null; linhas: Candidata[];
  buscado: OQueFoiBuscado | null;
}

/** FIX 4b — as opções que a tela manda (`p_opcoes`). Ausente = o padrão do banco. */
export interface OpcoesDaBusca { faixa?: 'pct10' | 'qualquer'; de?: string; ate?: string; busca?: string; todas?: boolean }
export const opcoesParaOBanco = (o: OpcoesDaBusca): Record<string, unknown> => ({
  ...(o.faixa ? { faixa: o.faixa === 'pct10' ? '10pct' : 'qualquer' } : {}),
  ...(o.de ? { de: o.de } : {}), ...(o.ate ? { ate: o.ate } : {}),
  ...(o.busca && o.busca.trim() ? { busca: o.busca.trim() } : {}), ...(o.todas ? { todas: true } : {}),
});

/** FIX 4b — a janela de datas: em torno da data-base (vencimento da parcela, ou data do contrato), o ano dela, ou um intervalo. */
export type Janela = 'padrao' | 'd90' | 'd180' | 'ano' | 'intervalo';
const somarDias = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
export function datasDaJanela(base: string | null, janela: Janela, intervalo: { de: string | null; ate: string | null }): { de?: string; ate?: string } {
  if (janela === 'padrao' || !base) return janela === 'intervalo' ? { de: intervalo.de ?? undefined, ate: intervalo.ate ?? undefined } : {};
  if (janela === 'd90') return { de: somarDias(base, -90), ate: somarDias(base, 90) };
  if (janela === 'd180') return { de: somarDias(base, -180), ate: somarDias(base, 180) };
  if (janela === 'ano') return { de: `${base.slice(0, 4)}-01-01`, ate: `${base.slice(0, 4)}-12-31` };
  return { de: intervalo.de ?? undefined, ate: intervalo.ate ?? undefined };
}

function lerBuscado(v: unknown): OQueFoiBuscado | null {
  if (!ehObj(v)) return null;
  return { faixa: v.faixa === '10pct' ? 'pct10' : 'qualquer', de: txt(v.de), ate: txt(v.ate), texto: txt(v.texto), todas: v.todas === true, semPrevisto: v.sem_previsto === true };
}

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const numOuNulo = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const papel = (v: unknown): PapelDoPagamento | null => PAPEIS.find((p) => p === v) ?? null;
const TIPOS_DO_OUTRO: readonly OutroDono['tipo'][] = ['parcela_vinculada', 'encargo', 'parcela_do_contrato', 'outro_contrato'];

function lerOutro(v: unknown): OutroDono | null | undefined {
  if (v === null || v === undefined) return null;
  if (!ehObj(v)) return undefined;
  const tipo = TIPOS_DO_OUTRO.find((t) => t === v.tipo);
  if (!tipo) return undefined;
  return { tipo, numeroContrato: txt(v.numero_contrato), descricao: txt(v.descricao), parcela: numOuNulo(v.parcela), movivel: v.movivel === true };
}

/** uma linha de candidata (a do 4b, e a da leitura "ao contrário" do passo 6); peça torta = nulo */
export function lerCandidata(l: unknown): Candidata | null {
  if (!ehObj(l) || !txt(l.lancamento_id)) return null;
  const valor = numOuNulo(l.valor); const outro = lerOutro(l.outro);
  if (valor === null || outro === undefined || !Array.isArray(l.motivos)) return null;
  return {
    lancamentoId: String(l.lancamento_id), data: txt(l.data), valor, descricao: txt(l.descricao), conta: txt(l.conta), favorecido: txt(l.favorecido),
    extrato: l.extrato === true, dias: numOuNulo(l.dias) ?? 0, pontos: numOuNulo(l.pontos) ?? 0,
    motivos: l.motivos.filter((m): m is string => typeof m === 'string'), status: txt(l.status_transacao),
    papelSugerido: papel(l.papel_sugerido), previsto: numOuNulo(l.previsto), diferenca: numOuNulo(l.diferenca), outro,
  };
}

/** o envelope de `fn_financiamento_candidatas`; qualquer peça torta = nulo (a tela diz que não leu) */
export function lerBuscaNoContrato(r: unknown): BuscaNoContrato | null {
  if (!ehObj(r) || (r.alvo !== 'liberacao' && r.alvo !== 'parcela') || !Array.isArray(r.linhas)) return null;
  const linhas: Candidata[] = [];
  for (const l of r.linhas) {
    const c = lerCandidata(l);
    if (!c) return null;
    linhas.push(c);
  }
  return { alvo: r.alvo, de: txt(r.de), ate: txt(r.ate), saldoALiberar: numOuNulo(r.saldo_a_liberar), linhas, buscado: lerBuscado(r.busca) };
}

/* ═══ passo 6 — a leitura "ao contrário": do lançamento para o contrato (`fn_lancamento_financiamento`) ═══ */
export interface ContratoDaCandidata { financiamentoId: string; numeroContrato: string | null; descricaoContrato: string | null; credor: string | null }
export interface ParcelaCandidata extends Candidata, ContratoDaCandidata { parcelaId: string; parcela: number | null; vencimento: string | null }
export interface LiberacaoCandidata extends Candidata, ContratoDaCandidata { saldoALiberar: number | null }
/* `contrato` = nº, senão a descrição (a frase longa, no `title` e nos diálogos); `numeroContrato` = só o nº (a origem curta) */
export type OndeEsta =
  | { tipo: 'parcela'; financiamentoId: string; contrato: string; numeroContrato?: string | null; parcela: number | null; papel: string; vinculoId: string | null }
  | { tipo: 'liberacao'; financiamentoId: string; contrato: string; numeroContrato?: string | null; liberacaoId: string }
  | { tipo: 'encargo'; financiamentoId: string; contrato: string; numeroContrato?: string | null; encargoId: string; papel: string }
  | { tipo: 'captacao'; financiamentoId: string; contrato: string; numeroContrato?: string | null };
export interface LancamentoNoFinanciamento {
  tipoOperacao: string | null; data: string | null; valor: number; descricao: string | null;
  atual: OndeEsta | null; parcelas: ParcelaCandidata[]; liberacoes: LiberacaoCandidata[];
}

const contratoDe = (o: Obj): ContratoDaCandidata | null => {
  const id = txt(o.financiamento_id);
  return id ? { financiamentoId: id, numeroContrato: txt(o.numero_contrato), descricaoContrato: txt(o.descricao_contrato), credor: txt(o.credor) } : null;
};
const nomeDoContrato = (o: Obj) => txt(o.numero_contrato) || txt(o.descricao) || 'contrato';

function lerOndeEsta(v: unknown): OndeEsta | null | undefined {
  if (v === null || v === undefined) return null;
  if (!ehObj(v)) return undefined;
  const fin = txt(v.financiamento_id); if (!fin) return undefined;
  const contrato = nomeDoContrato(v);
  const numeroContrato = txt(v.numero_contrato);
  if (v.tipo === 'parcela') return { tipo: 'parcela', financiamentoId: fin, contrato, numeroContrato, parcela: numOuNulo(v.parcela), papel: txt(v.papel) ?? 'principal', vinculoId: txt(v.vinculo_id) };
  if (v.tipo === 'liberacao' && txt(v.liberacao_id)) return { tipo: 'liberacao', financiamentoId: fin, contrato, numeroContrato, liberacaoId: String(v.liberacao_id) };
  if (v.tipo === 'encargo' && txt(v.encargo_id)) return { tipo: 'encargo', financiamentoId: fin, contrato, numeroContrato, encargoId: String(v.encargo_id), papel: txt(v.papel) ?? 'outro' };
  if (v.tipo === 'captacao') return { tipo: 'captacao', financiamentoId: fin, contrato, numeroContrato };
  return undefined;
}

export function lerLancamentoNoFinanciamento(r: unknown): LancamentoNoFinanciamento | null {
  if (!ehObj(r) || !ehObj(r.lancamento) || !Array.isArray(r.parcelas) || !Array.isArray(r.liberacoes)) return null;
  const atual = lerOndeEsta(r.atual);
  if (atual === undefined) return null;
  const parcelas: ParcelaCandidata[] = [];
  for (const p of r.parcelas) {
    const c = lerCandidata(p); const k = ehObj(p) ? contratoDe(p) : null;
    if (!c || !k || !ehObj(p) || !txt(p.parcela_id)) return null;
    parcelas.push({ ...c, ...k, parcelaId: String(p.parcela_id), parcela: numOuNulo(p.parcela), vencimento: txt(p.vencimento) });
  }
  const liberacoes: LiberacaoCandidata[] = [];
  for (const p of r.liberacoes) {
    const c = lerCandidata(p); const k = ehObj(p) ? contratoDe(p) : null;
    if (!c || !k || !ehObj(p)) return null;
    liberacoes.push({ ...c, ...k, saldoALiberar: numOuNulo(p.saldo_a_liberar) });
  }
  const l = r.lancamento;
  return { tipoOperacao: txt(l.tipo_operacao), data: txt(l.data), valor: numOuNulo(l.valor) ?? 0, descricao: txt(l.descricao), atual, parcelas, liberacoes };
}

/** onde o lançamento já está, numa frase curta (o rodapé do modal) */
export function fraseDoOndeEsta(a: OndeEsta): string {
  if (a.tipo === 'parcela') return `${a.contrato} · parcela ${a.parcela ?? '?'} (${a.papel})`;
  if (a.tipo === 'liberacao') return `${a.contrato} · liberação`;
  if (a.tipo === 'encargo') return `${a.contrato} · encargo (${a.papel})`;
  return `${a.contrato} · captação`;
}

/** A parcela de COMPRA PARCELADA vista pelo modal (a posição e o total das parcelas vivas, do dono da situação). */
export interface ParcelaDaCompraNoModal { numero: number; total: number }

/**
 * UI-TEXTO-LONGO-01 — a ORIGEM CURTA do lançamento no rodapé do modal: "Parcela 3/5 · Compra 1234", "Parcela 2 · Contrato
 * PR-78.179", "Liberação · Contrato X". NUNCA a descrição do contrato (a de uma compra parcelada pode ter 300 caracteres e
 * cortava com "…"): sem número, o tipo ("Compra parcelada", "Contrato"). A frase longa fica no `title`.
 */
export function origemCurtaDoLancamento(a: OndeEsta, compra?: ParcelaDaCompraNoModal | null): string {
  const n = a.numeroContrato ?? null;
  if (a.tipo === 'parcela') {
    const juros = a.papel === 'juros' ? ' (juros)' : '';
    if (compra) return `Parcela ${compra.numero}/${compra.total}${juros} · ${n ? `Compra ${n}` : 'Compra parcelada'}`;
    return `Parcela ${a.parcela ?? '?'}${juros} · ${n ? `Contrato ${n}` : 'Contrato'}`;
  }
  const doContrato = n ? `Contrato ${n}` : 'Contrato';
  if (a.tipo === 'liberacao') return `Liberação · ${doContrato}`;
  if (a.tipo === 'encargo') return `Encargo · ${doContrato}`;
  return `Captação · ${doContrato}`;
}

/** o gesto contrário de cada vínculo — nulo quando não se desfaz por aqui (parcela gerada pelo contrato; captação) */
export function desfazivelPorAqui(a: OndeEsta): boolean {
  return (a.tipo === 'parcela' && !!a.vinculoId) || a.tipo === 'liberacao' || a.tipo === 'encargo';
}

export interface ResultadoDoVinculo {
  simulado: boolean; recusa: string | null; avisos: string[]; cancelados: number; movido: boolean; paga: boolean;
  /** FIX 4b — a parcela estava zerada, e o valor dela veio do pagamento (com o SIM do operador) */
  parcelaZerada: boolean; valorAtualizado: boolean;
}

const FRASE_DO_AVISO: Record<string, string> = {
  valor_diferente: 'valor diferente do previsto',
  favorecido_diferente: 'favorecido não é o credor do contrato',
  nao_realizado: 'o lançamento ainda não está realizado',
  data_longe_do_vencimento: 'data longe do vencimento (mais de 45 dias)',
};

const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** um aviso do banco em português; o valor diferente leva os dois números */
export function fraseDoAviso(a: unknown): string | null {
  if (!ehObj(a) || typeof a.aviso !== 'string') return null;
  if (a.aviso === 'valor_diferente') {
    const prev = numOuNulo(a.previsto); const lanc = numOuNulo(a.lancamento);
    if (prev !== null && lanc !== null) return `valor ${reais(lanc)} · previsto ${reais(prev)}`;
  }
  return FRASE_DO_AVISO[a.aviso] ?? a.aviso;
}

/** FIX 4b — o vazio nunca é beco sem saída: diz o que foi procurado. */
export function fraseDoVazio(b: OQueFoiBuscado | null, oQue: 'pagamento' | 'entrada'): string {
  if (!b) return `Nenhum${oQue === 'entrada' ? 'a entrada' : ' pagamento'} candidato.`;
  const partes = [b.texto ? `“${b.texto}” em todas as ${oQue === 'entrada' ? 'entradas' : 'saídas'} do cliente`
    : `${b.de ? br(b.de) : '—'} a ${b.ate ? br(b.ate) : '—'}`,
    b.texto ? null : b.todas ? `todas as ${oQue === 'entrada' ? 'entradas' : 'saídas'}` : 'credor, nº do contrato ou conta de financiamento',
    b.texto ? null : b.faixa === 'pct10' ? 'valor ±10% do previsto' : 'qualquer valor'].filter(Boolean);
  return `Nenhum${oQue === 'entrada' ? 'a entrada' : ' pagamento'} encontrado · procurado: ${partes.join(' · ')}.`;
}
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

/** o retorno do vincular / desvincular (simulado ou gravado); nulo = peça torta */
export function lerResultadoDoVinculo(r: unknown): ResultadoDoVinculo | null {
  if (!ehObj(r)) return null;
  const recusa = ehObj(r.recusa) ? txt(r.recusa.frase) : null;
  const avisos = Array.isArray(r.avisos) ? r.avisos.map(fraseDoAviso).filter((f): f is string => !!f) : [];
  return {
    simulado: r.simulado === true, recusa, avisos,
    cancelados: Array.isArray(r.cancelados) ? r.cancelados.length : 0, movido: ehObj(r.movido), paga: r.paga === true,
    parcelaZerada: r.parcela_zerada === true, valorAtualizado: r.valor_atualizado === true,
  };
}

/** onde o lançamento já está, numa frase curta */
export function fraseDoOutro(o: OutroDono): string {
  const ctr = o.numeroContrato || o.descricao || 'outro contrato';
  if (o.tipo === 'parcela_vinculada') return `já paga a parcela ${o.parcela ?? '?'} do contrato ${ctr}`;
  if (o.tipo === 'encargo') return `é encargo do contrato ${ctr}`;
  if (o.tipo === 'parcela_do_contrato') return `é a parcela ${o.parcela ?? '?'} do contrato ${ctr}`;
  return `pertence ao contrato ${ctr}`;
}

export interface EncargoSugerido { lancamentoId: string; data: string | null; descricao: string | null; valor: number; papel: string }
const PAPEIS_PERTO_DA_LIBERACAO = ['iof', 'tarifa', 'seguro'];
export const JANELA_DO_ENCARGO_DIAS = 15;

const diasEntre = (a: string, b: string) => Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

/**
 * Os encargos soltos do credor (IOF, tarifa/TAC, seguro) a até 15 dias de alguma liberação — a sugestão do passo 4b. A lista vem
 * de `fn_contrato_encargos_vinculaveis` (o dono de "elegível a encargo"); aqui só o recorte pela data e pelo papel sugerido.
 */
export function encargosPertoDasLiberacoes(linhas: unknown, datasDasLiberacoes: readonly string[]): EncargoSugerido[] {
  if (!Array.isArray(linhas) || datasDasLiberacoes.length === 0) return [];
  const out: EncargoSugerido[] = [];
  for (const l of linhas) {
    if (!ehObj(l) || !txt(l.lancamento_id)) continue;
    const p = txt(l.papel_sugerido) ?? 'outro'; const data = txt(l.data); const valor = numOuNulo(l.valor);
    if (!PAPEIS_PERTO_DA_LIBERACAO.includes(p) || !data || valor === null) continue;
    if (!datasDasLiberacoes.some((d) => diasEntre(d, data) <= JANELA_DO_ENCARGO_DIAS)) continue;
    out.push({ lancamentoId: String(l.lancamento_id), data, descricao: txt(l.descricao), valor, papel: p });
  }
  return out;
}

/** a janela de busca dos encargos: da 1ª liberação − 15 dias à última + 15 */
export function janelaDosEncargos(datas: readonly string[]): { de: string; ate: string } | null {
  if (datas.length === 0) return null;
  const ord = [...datas].sort();
  const mover = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
  return { de: mover(ord[0], -JANELA_DO_ENCARGO_DIAS), ate: mover(ord[ord.length - 1], JANELA_DO_ENCARGO_DIAS) };
}
