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

export interface BuscaNoContrato {
  alvo: 'liberacao' | 'parcela'; de: string | null; ate: string | null; saldoALiberar: number | null; linhas: Candidata[];
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

/** o envelope de `fn_financiamento_candidatas`; qualquer peça torta = nulo (a tela diz que não leu) */
export function lerBuscaNoContrato(r: unknown): BuscaNoContrato | null {
  if (!ehObj(r) || (r.alvo !== 'liberacao' && r.alvo !== 'parcela') || !Array.isArray(r.linhas)) return null;
  const linhas: Candidata[] = [];
  for (const l of r.linhas) {
    if (!ehObj(l) || !txt(l.lancamento_id)) return null;
    const valor = numOuNulo(l.valor); const outro = lerOutro(l.outro);
    if (valor === null || outro === undefined || !Array.isArray(l.motivos)) return null;
    linhas.push({
      lancamentoId: String(l.lancamento_id), data: txt(l.data), valor, descricao: txt(l.descricao), conta: txt(l.conta), favorecido: txt(l.favorecido),
      extrato: l.extrato === true, dias: numOuNulo(l.dias) ?? 0, pontos: numOuNulo(l.pontos) ?? 0,
      motivos: l.motivos.filter((m): m is string => typeof m === 'string'), status: txt(l.status_transacao),
      papelSugerido: papel(l.papel_sugerido), previsto: numOuNulo(l.previsto), diferenca: numOuNulo(l.diferenca), outro,
    });
  }
  return { alvo: r.alvo, de: txt(r.de), ate: txt(r.ate), saldoALiberar: numOuNulo(r.saldo_a_liberar), linhas };
}

export interface ResultadoDoVinculo {
  simulado: boolean; recusa: string | null; avisos: string[]; cancelados: number; movido: boolean; paga: boolean;
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

/** o retorno do vincular / desvincular (simulado ou gravado); nulo = peça torta */
export function lerResultadoDoVinculo(r: unknown): ResultadoDoVinculo | null {
  if (!ehObj(r)) return null;
  const recusa = ehObj(r.recusa) ? txt(r.recusa.frase) : null;
  const avisos = Array.isArray(r.avisos) ? r.avisos.map(fraseDoAviso).filter((f): f is string => !!f) : [];
  return {
    simulado: r.simulado === true, recusa, avisos,
    cancelados: Array.isArray(r.cancelados) ? r.cancelados.length : 0, movido: ehObj(r.movido), paga: r.paga === true,
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
