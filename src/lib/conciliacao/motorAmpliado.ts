/**
 * CONC-SUGESTOES-V2 (mock aprovado 25/11 17:19) — o motor AMPLIADO das Sugestões e as regras que as 3 telas leem dele.
 *
 * O MOTOR É O DO BANCO (`fn_candidatos_conciliacao` com `p_ampliado`, lote 114380): todos os bancos (o em aberto), o fornecedor pelo
 * CNPJ do texto do banco (o mesmo ou a raiz) e as notas sem lançamento; `exata` = valor igual + documento. A tela não decide nada disso:
 * só agrupa (exata · possíveis · nenhuma) e escreve.
 * ⚠ NUNCA CASA SOZINHA: a exata ganha o "Casar" cheio, mas casar é sempre o clique do operador.
 * ⚠ "NÃO CONSEGUI" NUNCA VIRA "NENHUMA" (P146): a falha do motor é `{ ok: false }` e a linha diz "não consegui ver".
 */
import { supabase } from '@/integrations/supabase/client';
import { lerCandidato, type CandidatoConciliacao } from '@/hooks/useConciliacaoDoMes';

export type RespostaDoAmpliado = { ok: true; candidatos: CandidatoConciliacao[] } | { ok: false; erro: string };

/** O motor ampliado de UM movimento. */
export async function motorAmpliadoDoMovimento(clienteId: string, extratoId: string, limite = 10): Promise<RespostaDoAmpliado> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_candidatos_conciliacao', {
      p_cliente_id: clienteId, p_extrato_id: extratoId, p_limite: limite, p_ampliado: true,
    });
    if (error) { console.error('[motorAmpliado]', error); return { ok: false, erro: 'o banco recusou a consulta' }; }
    if (!Array.isArray(data)) return { ok: false, erro: 'a resposta veio num formato inesperado' };
    return { ok: true, candidatos: data.map(lerCandidato) };
  } catch (e) {
    console.error('[motorAmpliado]', e);
    return { ok: false, erro: 'o banco não respondeu' };
  }
}

/** O mês: o motor ampliado de cada movimento, `paralelo` por vez; `aoAvancar` a cada resposta (a tela pinta aos poucos). */
export async function motorAmpliadoDoMes(
  clienteId: string, extratoIds: readonly string[],
  aoAvancar?: (id: string, r: RespostaDoAmpliado) => void, paralelo = 4,
): Promise<Map<string, RespostaDoAmpliado>> {
  const saida = new Map<string, RespostaDoAmpliado>();
  let i = 0;
  const trabalhador = async () => {
    while (i < extratoIds.length) {
      const id = extratoIds[i++];
      const r = await motorAmpliadoDoMovimento(clienteId, id, 10);
      saida.set(id, r); aoAvancar?.(id, r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(paralelo, extratoIds.length) }, trabalhador));
  return saida;
}

const vivo = (c: CandidatoConciliacao) => !c.indisponivel;

/** As exatas do motor (valor + documento), lançamento ou nota, na ordem dele. */
export function exatasDoMotor(cands: readonly CandidatoConciliacao[] | null | undefined): CandidatoConciliacao[] {
  /* a parcela de financiamento (amortização + juros) é a linha agrupada de `parcelasDoMotor`, nunca a exata de um só lançamento */
  return (cands ?? []).filter((c) => vivo(c) && c.exata === true && !c.parcelaId);
}

/** O que o motor ampliado traz e a lista de hoje não tem (outro banco, o fornecedor pelo CNPJ, nota sem lançamento), sem as exatas. */
export function possiveisDoMotor(cands: readonly CandidatoConciliacao[] | null | undefined, idsJaNaLista: ReadonlySet<string>): CandidatoConciliacao[] {
  return (cands ?? []).filter((c) => vivo(c) && c.exata !== true && !idsJaNaLista.has(c.id) && !c.parcelaId
    && (c.outraConta === true || !!c.documentoCasa || c.origem === 'nota'));
}

/**
 * REGRA DE FINANCIAMENTO (Gabriel 26/11 07:07) — a parcela aberta do credor é UMA linha: a amortização e os juros da MESMA parcela juntos
 * (o motor manda os dois com o mesmo `parcelaId`, lote 114400). O valor da linha = a soma dos dois (o previsto da parcela).
 * ADIANTAMENTO (07:09): toda parcela aberta do credor entra, sem janela de data — a ordem é a do motor.
 */
export interface ParcelaDoMotor {
  parcelaId: string;
  rotulo: string;
  /** a amortização primeiro, depois os juros (a ordem do motor dentro da parcela) */
  candidatos: CandidatoConciliacao[];
  valor: number;
  vencimento: string | null;
  /** negativo = pago ANTES do vencimento (adiantado); nulo = longe (> 60 dias corridos) — a tela usa os dias corridos */
  diasUteis: number | null;
  outraConta: boolean;
  contaNome: string | null;
}

export function parcelasDoMotor(cands: readonly CandidatoConciliacao[] | null | undefined): ParcelaDoMotor[] {
  const por = new Map<string, ParcelaDoMotor>();
  for (const c of cands ?? []) {
    if (!vivo(c) || !c.parcelaId) continue;
    const g = por.get(c.parcelaId);
    if (!g) {
      por.set(c.parcelaId, { parcelaId: c.parcelaId, rotulo: c.parcelaRotulo ?? c.descricao ?? 'parcela', candidatos: [c],
        valor: Math.abs(c.valor), vencimento: c.vencimento ?? null, diasUteis: c.diasUteis ?? null,
        outraConta: c.outraConta === true, contaNome: c.contaNome ?? null });
    } else {
      g.candidatos.push(c);
      g.valor = Math.round((g.valor + Math.abs(c.valor)) * 100) / 100;
      if (c.outraConta) g.outraConta = true;
    }
  }
  return [...por.values()];
}

/** O valor da parcela difere do banco (meio centavo, a tolerância da conciliação). */
export const parcelaDifere = (p: { valor: number }, valorDoExtrato: number): boolean => Math.abs(p.valor - Math.abs(valorDoExtrato)) >= 0.005;

const diasCorridos = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000);

/**
 * O prazo do pagamento contra o vencimento da parcela: "no prazo" (0 = o 1º dia útil), "N dias úteis de atraso", "adiantado N dias úteis";
 * longe (o motor não conta dia útil além de 60 dias corridos) = "adiantado N dias" / "N dias de atraso" corridos.
 */
export function prazoDaParcela(p: { vencimento: string | null; diasUteis: number | null }, dataDoExtrato: string): { texto: string; adiantado: boolean } | null {
  if (p.diasUteis != null) {
    if (p.diasUteis === 0) return { texto: 'no prazo', adiantado: false };
    const n = Math.abs(p.diasUteis);
    return p.diasUteis < 0
      ? { texto: `adiantado ${n} ${n === 1 ? 'dia útil' : 'dias úteis'}`, adiantado: true }
      : { texto: `${n} ${n === 1 ? 'dia útil' : 'dias úteis'} de atraso`, adiantado: false };
  }
  if (!p.vencimento) return null;
  const d = diasCorridos(dataDoExtrato, p.vencimento);
  if (d === 0) return { texto: 'no prazo', adiantado: false };
  return d > 0 ? { texto: `adiantado ${d} ${d === 1 ? 'dia' : 'dias'}`, adiantado: true }
    : { texto: `${-d} ${d === -1 ? 'dia' : 'dias'} de atraso`, adiantado: false };
}

export type EstadoDaLinhaSemPar =
  | { tipo: 'procurando' }
  | { tipo: 'falhou' }
  | { tipo: 'exata'; n: number; candidato: CandidatoConciliacao }
  | { tipo: 'possiveis'; n: number }
  | { tipo: 'nenhuma'; motivo: string };

/**
 * B · Conferência — o que a linha sem par TEM: exata (do motor), N possíveis (a lista de hoje + o que só o motor ampliado acha) ou
 * nenhuma (com o motivo curto). `motor` indefinido = ainda procurando.
 */
export function estadoDaLinhaSemPar(
  motor: RespostaDoAmpliado | undefined, idsDaLista: readonly string[],
  leitura: { temNome: boolean; temDocumento: boolean },
): EstadoDaLinhaSemPar {
  if (!motor) return idsDaLista.length ? { tipo: 'possiveis', n: idsDaLista.length } : { tipo: 'procurando' };
  if (!motor.ok) return idsDaLista.length ? { tipo: 'possiveis', n: idsDaLista.length } : { tipo: 'falhou' };
  const ex = exatasDoMotor(motor.candidatos);
  if (ex.length) return { tipo: 'exata', n: ex.length, candidato: ex[0] };
  const ids = new Set(idsDaLista);
  const n = ids.size + possiveisDoMotor(motor.candidatos, ids).length
    + parcelasDoMotor(motor.candidatos).filter((p) => !p.candidatos.some((c) => ids.has(c.id))).length;
  if (n > 0) return { tipo: 'possiveis', n };
  const motivo = leitura.temDocumento ? 'achado pelo CNPJ · nada em aberto'
    : leitura.temNome ? 'nada em aberto com esse nome' : 'sem nome no banco';
  return { tipo: 'nenhuma', motivo };
}

/** O apelido do banco na linha de outra conta ("BB", "Itaú", "Sicredi"): a 1ª palavra, e as siglas conhecidas. */
export function apelidoDaConta(nome: string | null | undefined): string {
  const t = (nome ?? '').trim();
  if (!t) return 'outra conta';
  if (/^(banco do brasil|bb\b)/i.test(t)) return 'BB';
  if (/^caixa\b|^cef\b/i.test(t)) return 'Caixa';
  return t.split(/\s+/)[0];
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const TIPO_DO_HISTORICO: readonly [RegExp, string][] = [
  [/^LIQUIDA[CÇ][AÃ]O (DE )?BOLETO( SICREDI)?\b/i, 'Liquidação boleto'],
  [/^PAGAMENTO (DE )?BOLETO\b/i, 'Pagamento boleto'],
  [/^BOLETO PAGO\b/i, 'Boleto pago'],
  [/^(PAGAMENTO PIX|PIX ENVIADO)\b/i, 'Pix'],
  [/^(RECEBIMENTO (DE )?PIX|PIX RECEBIDO)\b/i, 'Pix recebido'],
  [/^TED RECEBIDA\b/i, 'TED recebida'],
  [/^TED( ENVIADA)?\b/i, 'TED'],
];

/** "T R SANTANA LTDA" → "T R Santana Ltda" (sem caixa alta; letra solta fica maiúscula; de/da/do minúsculas). */
export function semCaixaAlta(nome: string): string {
  return nome.split(/\s+/).filter(Boolean).map((w, i) => {
    const b = w.toLowerCase();
    if (i > 0 && MINUSCULAS.has(b)) return b;
    if (w.length === 1) return w.toUpperCase();
    return b.charAt(0).toUpperCase() + b.slice(1);
  }).join(' ');
}

/** A 1ª linha "Banco" das tabelas: "Pix · T R Santana Ltda" (o texto cru vai no `title`). Sem tipo conhecido, o nome sem caixa alta. */
export function nomeDoExtratoSemCaixa(historico: string | null | undefined, nome: string): string {
  const cru = (historico ?? '').trim();
  const tipo = TIPO_DO_HISTORICO.find(([re]) => re.test(cru))?.[1] ?? null;
  const n = nome ? semCaixaAlta(nome) : '';
  if (tipo && n) return `${tipo} · ${n}`;
  return n || semCaixaAlta(cru);
}

/**
 * CONC-SUGESTOES-V2 C (lote 114390) — o que DECLARA o vencimento de cada id ('boleto' | 'nota' | 'contrato'; null = ESTIMADO), pela
 * `fn_vencimentos_declarados` (a regra `_fn_vencimento_declarado` é do banco). Falhou = `null`: a tela não marca nada como estimado
 * (nunca inventa "~").
 */
export async function lerVencimentosDeclarados(clienteId: string, ids: readonly string[]): Promise<Map<string, string | null> | null> {
  if (!ids.length) return new Map();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_vencimentos_declarados', { p_cliente: clienteId, p_ids: [...new Set(ids)] });
    if (error || !Array.isArray(data)) { if (error) console.error('[vencimentosDeclarados]', error); return null; }
    const m = new Map<string, string | null>();
    for (const r of data) if (r && typeof r.lancamento_id === 'string') m.set(r.lancamento_id, typeof r.declarado === 'string' ? r.declarado : null);
    return m;
  } catch (e) {
    console.error('[vencimentosDeclarados]', e);
    return null;
  }
}

/** Estimado só quando o banco RESPONDEU por aquele id e disse que nada o declara. */
export const vencimentoEstimado = (declarados: ReadonlyMap<string, string | null> | null, id: string): boolean =>
  !!declarados && declarados.has(id) && declarados.get(id) == null;
