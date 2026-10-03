/**
 * O RESUMO DA CONTA NO MÊS, COMO A TELA O LÊ — PR-CONC-SALDO-UMA-REGUA-02.
 *
 * ⚠ O DONO É O BANCO: `fn_conciliacao_resumo_mes` (uma linha por conta, um subtotal por tipo e o total) e
 *   `fn_conciliacao_status_ano` (o selo dos doze meses). Aqui só se LÊ o retorno — sem cast, o que não tem a forma
 *   esperada vira o valor neutro — e se ESCREVE em português o que ele já decidiu. Nenhuma função daqui soma linha,
 *   subtrai saldo ou escolhe conta: quem precisar de um número que não está na linha do dono pede ao dono.
 * ⚠ O STATUS É O DO DONO, o mesmo da Conferência: 'conciliado' | 'nao_conciliado' | 'pendente'. 'parcial' não existe.
 */

export type StatusDono = 'conciliado' | 'nao_conciliado' | 'pendente';
export type NivelDono = 'conta' | 'tipo' | 'total';

export interface QtdeValor { qtde: number; valor: number }

export interface MotivoConta { conta_id: string; conta_nome: string; status: StatusDono; motivos: Motivo[] }

/** Os motivos que o dono escreve; `motivo` desconhecido fica como veio (a tela o mostra cru, nunca o esconde). */
export interface Motivo {
  motivo: string;
  qtde?: number;
  valor?: number;
  dias?: string[];
  falta?: string;
  contas?: MotivoConta[];
}

export interface PosicaoDono {
  data: string;
  saldo_sistema_na_data: number | null;
  diferenca_na_data: number | null;
  realizados_apos: QtdeValor;
}

export interface LinhaSistemaDono {
  tipo: string;
  data: string | null;
  valor: number;
  lancamento_id: string | null;
  extrato_id: string | null;
  parcial: boolean;
  falta: number | null;
  descricao: string | null;
  fornecedor: string | null;
  centro: string | null;
  subcentro: string | null;
  status_exibicao: 'conciliado' | 'parcial' | 'realizado';
  saldo_apos: number;
}

export interface LinhaResumo {
  nivel: NivelDono;
  conta_id: string | null;
  conta_nome: string;
  tipo_conta: string | null;
  consolida_em_conta_id: string | null;
  tem_extrato: boolean;
  saldo_inicial: number | null;
  saldo_inicial_origem: 'informado' | 'herdado' | 'ausente' | null;
  entradas: number;
  saidas: number;
  entradas_terceiros: number;
  entradas_transferencias: number;
  saidas_terceiros: number;
  saidas_transferencias: number;
  saldo_sistema: number | null;
  saldo_extrato: number | null;
  saldo_extrato_data: string | null;
  diferenca: number | null;
  diferenca_entradas: number;
  diferenca_saidas: number;
  banco: { entradas: number; saidas: number };
  extratos_sem_par: QtdeValor;
  lancamentos_sem_par: QtdeValor;
  retido_em_depositos: QtdeValor;
  status: StatusDono;
  motivos: Motivo[];
  posicao: PosicaoDono | null;
  sem_conta: { qtde: number; entradas: number; saidas: number } | null;
  linhas_sistema: LinhaSistemaDono[] | null;
}

export interface StatusAnoDono {
  ano_mes: string;
  nivel: 'conta' | 'total';
  conta_id: string | null;
  conta_nome: string | null;
  status: StatusDono;
  motivos: Motivo[];
}

/* ── leitura sem cast ─────────────────────────────────────────────────────────── */

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);
/** O PostgREST devolve `numeric` como número ou como texto, conforme o tamanho — os dois viram número. */
const numeroOuNulo = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const numero = (v: unknown): number => numeroOuNulo(v) ?? 0;
const qtdeValor = (v: unknown): QtdeValor => (ehObjeto(v) ? { qtde: numero(v.qtde), valor: numero(v.valor) } : { qtde: 0, valor: 0 });
const status = (v: unknown): StatusDono => (v === 'conciliado' || v === 'nao_conciliado' ? v : 'pendente');
const nivel = (v: unknown): NivelDono => (v === 'tipo' || v === 'total' ? v : 'conta');
const origem = (v: unknown): LinhaResumo['saldo_inicial_origem'] =>
  (v === 'informado' || v === 'herdado' || v === 'ausente' ? v : null);

function lerMotivos(v: unknown): Motivo[] {
  if (!Array.isArray(v)) return [];
  const out: Motivo[] = [];
  for (const m of v) {
    if (!ehObjeto(m) || typeof m.motivo !== 'string') continue;
    const x: Motivo = { motivo: m.motivo };
    const q = numeroOuNulo(m.qtde); if (q !== null) x.qtde = q;
    const val = numeroOuNulo(m.valor); if (val !== null) x.valor = val;
    if (Array.isArray(m.dias)) x.dias = m.dias.filter((d): d is string => typeof d === 'string');
    const f = texto(m.falta); if (f !== null) x.falta = f;
    if (Array.isArray(m.contas)) {
      x.contas = m.contas.filter(ehObjeto).map((c) => ({
        conta_id: texto(c.conta_id) ?? '', conta_nome: texto(c.conta_nome) ?? '',
        status: status(c.status), motivos: lerMotivos(c.motivos),
      }));
    }
    out.push(x);
  }
  return out;
}

function lerLinhaSistema(v: unknown): LinhaSistemaDono | null {
  if (!ehObjeto(v)) return null;
  const se = v.status_exibicao;
  return {
    tipo: texto(v.tipo) ?? '',
    data: texto(v.data),
    valor: numero(v.valor),
    lancamento_id: texto(v.lancamento_id),
    extrato_id: texto(v.extrato_id),
    parcial: v.parcial === true,
    falta: numeroOuNulo(v.falta),
    descricao: texto(v.descricao),
    fornecedor: texto(v.fornecedor),
    centro: texto(v.centro),
    subcentro: texto(v.subcentro),
    status_exibicao: se === 'parcial' || se === 'conciliado' ? se : 'realizado',
    saldo_apos: numero(v.saldo_apos),
  };
}

export function lerLinhaResumo(v: unknown): LinhaResumo | null {
  if (!ehObjeto(v)) return null;
  const banco = ehObjeto(v.banco) ? v.banco : {};
  const pos = ehObjeto(v.posicao) ? v.posicao : null;
  const sc = ehObjeto(v.sem_conta) ? v.sem_conta : null;
  return {
    nivel: nivel(v.nivel),
    conta_id: texto(v.conta_id),
    conta_nome: texto(v.conta_nome) ?? '',
    tipo_conta: texto(v.tipo_conta),
    consolida_em_conta_id: texto(v.consolida_em_conta_id),
    tem_extrato: v.tem_extrato === true,
    saldo_inicial: numeroOuNulo(v.saldo_inicial),
    saldo_inicial_origem: origem(v.saldo_inicial_origem),
    entradas: numero(v.entradas),
    saidas: numero(v.saidas),
    entradas_terceiros: numero(v.entradas_terceiros),
    entradas_transferencias: numero(v.entradas_transferencias),
    saidas_terceiros: numero(v.saidas_terceiros),
    saidas_transferencias: numero(v.saidas_transferencias),
    saldo_sistema: numeroOuNulo(v.saldo_sistema),
    saldo_extrato: numeroOuNulo(v.saldo_extrato),
    saldo_extrato_data: texto(v.saldo_extrato_data),
    diferenca: numeroOuNulo(v.diferenca),
    diferenca_entradas: numero(v.diferenca_entradas),
    diferenca_saidas: numero(v.diferenca_saidas),
    banco: { entradas: numero(banco.entradas), saidas: numero(banco.saidas) },
    extratos_sem_par: qtdeValor(v.extratos_sem_par),
    lancamentos_sem_par: qtdeValor(v.lancamentos_sem_par),
    retido_em_depositos: qtdeValor(v.retido_em_depositos),
    status: status(v.status),
    motivos: lerMotivos(v.motivos),
    posicao: pos && typeof pos.data === 'string'
      ? {
          data: pos.data,
          saldo_sistema_na_data: numeroOuNulo(pos.saldo_sistema_na_data),
          diferenca_na_data: numeroOuNulo(pos.diferenca_na_data),
          realizados_apos: qtdeValor(pos.realizados_apos),
        }
      : null,
    sem_conta: sc ? { qtde: numero(sc.qtde), entradas: numero(sc.entradas), saidas: numero(sc.saidas) } : null,
    linhas_sistema: Array.isArray(v.linhas_sistema)
      ? v.linhas_sistema.map(lerLinhaSistema).filter((l): l is LinhaSistemaDono => l !== null)
      : null,
  };
}

export function lerResumo(dado: unknown): LinhaResumo[] {
  if (!Array.isArray(dado)) return [];
  return dado.map(lerLinhaResumo).filter((l): l is LinhaResumo => l !== null);
}

export function lerStatusAno(dado: unknown): StatusAnoDono[] {
  if (!Array.isArray(dado)) return [];
  const out: StatusAnoDono[] = [];
  for (const r of dado) {
    if (!ehObjeto(r) || typeof r.ano_mes !== 'string') continue;
    out.push({
      ano_mes: r.ano_mes,
      nivel: r.nivel === 'total' ? 'total' : 'conta',
      conta_id: texto(r.conta_id),
      conta_nome: texto(r.conta_nome),
      status: status(r.status),
      motivos: lerMotivos(r.motivos),
    });
  }
  return out;
}

/* ── o que a tela escreve ─────────────────────────────────────────────────────── */

export const ROTULO_STATUS: Record<StatusDono, string> = {
  conciliado: 'Conciliado',
  nao_conciliado: 'Não Conciliado',
  pendente: 'Pendente',
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/**
 * Valor com sinal numa FRASE que quebra linha: o "−" tipográfico colado ao "R$" por um word-joiner (U+2060) — o
 * `toLocaleString` dá "-R$" e o navegador quebrava entre o hífen e o "R$" ("…informado -" / "R$ 881,49"). O número já
 * vem com espaço inseparável depois do "R$". `Math.abs` aqui é só a escrita do sinal.
 */
const brlSinal = (v: number) => (v < 0 ? `\u2212\u2060${brl(Math.abs(v))}` : brl(v));
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Uma frase do status, já escrita. `dia` é o primeiro dia com diferença (o link da Conferência); `contas`, os nomes das
 * contas não conciliadas (no Todas).
 */
export interface FraseDoStatus {
  chave: string;
  texto: string;
  /** A frase inteira, para o `title`, quando o texto da tela for a forma curta. */
  titulo?: string;
  /** Leva à Conferência neste dia. */
  dia?: string;
  /** No Todas: as contas que o total cita (o nome e o primeiro dia com diferença dela, se houver). */
  contas?: { conta_id: string; conta_nome: string; texto: string; dia?: string }[];
}

function fraseDoMotivo(m: Motivo): FraseDoStatus {
  switch (m.motivo) {
    case 'dias_com_diferenca': {
      const n = m.qtde ?? m.dias?.length ?? 0;
      const dia = m.dias?.[0];
      return {
        chave: m.motivo,
        texto: `${n} ${n === 1 ? 'dia' : 'dias'} com diferença`,
        titulo: dia ? `${n} ${n === 1 ? 'dia' : 'dias'} com diferença — o primeiro em ${ddmm(dia)}; abre a Conferência nesse dia` : undefined,
        dia,
      };
    }
    case 'saldo_diverge':
      return { chave: m.motivo, texto: `saldo diverge ${brlSinal(m.valor ?? 0)}` };
    case 'extrato_nao_fecha':
      return {
        chave: m.motivo,
        texto: `o extrato não fecha com o saldo informado ${brlSinal(m.valor ?? 0)}`,
        titulo: 'saldo informado − saldo inicial − soma do extrato do mês',
      };
    case 'saldo_nao_informado':
      return { chave: m.motivo, texto: 'saldo não informado' };
    case 'sem_extrato':
      return { chave: m.motivo, texto: 'sem extrato' };
    case 'contas_nao_conciliadas': {
      const contas = (m.contas ?? []).map((c) => {
        const dias = c.motivos.find((x) => x.motivo === 'dias_com_diferenca');
        return {
          conta_id: c.conta_id, conta_nome: c.conta_nome,
          texto: c.motivos.map((x) => fraseDoMotivo(x).texto).join(' · '),
          dia: dias?.dias?.[0],
        };
      });
      const n = m.qtde ?? contas.length;
      return {
        chave: m.motivo,
        texto: `${n} ${n === 1 ? 'conta não conciliada' : 'contas não conciliadas'}`,
        titulo: contas.map((c) => `${c.conta_nome}: ${c.texto}`).join('\n'),
        contas,
      };
    }
    case 'contas_pendentes': {
      const n = m.qtde ?? 0;
      return { chave: m.motivo, texto: `${n} ${n === 1 ? 'pendente' : 'pendentes'}`, titulo: `${n} ${n === 1 ? 'conta' : 'contas'} sem saldo informado` };
    }
    case 'lancamentos_sem_conta': {
      const n = m.qtde ?? 0;
      return { chave: m.motivo, texto: `${n} ${n === 1 ? 'lançamento sem conta' : 'lançamentos sem conta'}` };
    }
    default:
      return { chave: m.motivo, texto: m.motivo.replace(/_/g, ' ') };
  }
}

/**
 * As frases do status de UMA linha do dono (conta ou total), na ordem em que ele as escreveu.
 * ⚠ "confere em todos os dias" só existe quando a conta TEM extrato e o dono NÃO escreveu `dias_com_diferenca` —
 *   as duas frases nunca convivem.
 */
export function frasesDoStatus(l: Pick<LinhaResumo, 'nivel' | 'tem_extrato' | 'motivos'>): FraseDoStatus[] {
  const frases = l.motivos.map(fraseDoMotivo);
  if (l.nivel === 'conta' && l.tem_extrato && !l.motivos.some((m) => m.motivo === 'dias_com_diferenca')) {
    frases.unshift({ chave: 'confere_dias', texto: 'confere em todos os dias' });
  }
  return frases;
}

/** "retido no depósito R$ X (N)", com a frase inteira para o `title`; nulo sem retenção. */
export function fraseDoRetido(r: QtdeValor): { texto: string; titulo: string } | null {
  if (r.qtde <= 0) return null;
  return {
    texto: `retido no depósito ${brl(r.valor)} (${r.qtde})`,
    titulo: `${r.qtde} ${r.qtde === 1 ? 'retenção' : 'retenções'} (Funrural/SENAR) que o comprador reteve e o banco depositou líquido: entram nas entradas do sistema como entrada negativa, ${brl(r.valor)} no mês`,
  };
}

/**
 * "lançamentos sem conta +E / −S (N)" — no Todas; nulo sem lançamento sem conta.
 * ⚠ O DONO DEVOLVE OS DOIS LADOS EM MÓDULO (`sum(abs(valor))` por tipo); o sinal é só da escrita.
 */
export function fraseSemConta(s: LinhaResumo['sem_conta']): { texto: string; titulo: string } | null {
  if (!s || s.qtde <= 0) return null;
  return {
    texto: `lançamentos sem conta +${brl(s.entradas)} / −${brl(s.saidas)} (${s.qtde})`,
    titulo: `${s.qtde} ${s.qtde === 1 ? 'lançamento realizado' : 'lançamentos realizados'} no mês sem conta bancária — não entram em conta nenhuma`,
  };
}

/**
 * "FECHAR CONTAS SEM MOVIMENTO" — o que se grava, pela linha do dono (PR-CONC-SALDO-UMA-REGUA-02, D8).
 *
 * ⚠ O VALOR GRAVADO É O DO DONO: `saldo_final` = `saldo_sistema` e `saldo_inicial` = o `saldo_inicial` dele (o herdado é o
 *   saldo final do mês anterior, a mesma régua que a tela fazia à mão). Antes era o `saldoCalculado` da tela, a valor cheio.
 * ⚠ CONTA COM MOVIMENTO NÃO SE FECHA: entrada, saída ou extrato no mês fazem dela uma conta a CONFERIR, e gravar o saldo do
 *   sistema como saldo do banco a daria por conciliada sem ninguém olhar. Antes ela era fechada sem a marca 'sem_movimento'.
 * ⚠ Só conta SEM saldo de extrato no mês, e nunca a de saldo inicial AUSENTE (não se inventa zero — PR-E1-F1).
 */
export interface FechamentoSemMovimento { conta_id: string; saldo_inicial: number; saldo_final: number }

export function contasParaFecharSemMovimento(linhas: readonly LinhaResumo[]): {
  fechar: FechamentoSemMovimento[];
  comMovimento: number;
  semReferencia: number;
} {
  const fechar: FechamentoSemMovimento[] = [];
  let comMovimento = 0;
  let semReferencia = 0;
  for (const l of linhas) {
    if (l.nivel !== 'conta' || !l.conta_id || l.saldo_extrato !== null) continue;
    if (l.tem_extrato || Math.round(l.entradas * 100) !== 0 || Math.round(l.saidas * 100) !== 0) { comMovimento++; continue; }
    if (l.saldo_inicial_origem === 'ausente' || l.saldo_inicial === null || l.saldo_sistema === null) { semReferencia++; continue; }
    fechar.push({ conta_id: l.conta_id, saldo_inicial: l.saldo_inicial, saldo_final: l.saldo_sistema });
  }
  return { fechar, comMovimento, semReferencia };
}
