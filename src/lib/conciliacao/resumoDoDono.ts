/**
 * O RESUMO DA CONTA NO MÊS, COMO A TELA O LÊ — PR-CONC-SALDO-UMA-REGUA-02.
 *
 * ⚠ O DONO É O BANCO: `fn_conciliacao_resumo_mes` (uma linha por conta, um subtotal por tipo e o total) e
 *   `fn_conciliacao_status_ano` (o selo dos doze meses). Aqui só se LÊ o retorno — sem cast, o que não tem a forma
 *   esperada vira o valor neutro — e se ESCREVE em português o que ele já decidiu. Nenhuma função daqui soma linha,
 *   subtrai saldo ou escolhe conta: quem precisar de um número que não está na linha do dono pede ao dono.
 * ⚠ O STATUS É O DO DONO, o mesmo da Conferência: 'conciliado' | 'nao_conciliado' | 'pendente'. 'parcial' não existe.
 * ⚠ O STATUS É O SALDO; O EXTRATO IMPORTADO É A 2ª PROVA — PR-CONC-STATUS-SALDO-01b. `motivos` só traz o que DECIDE o
 *   status (saldo diverge, saldo não informado; nos agregados, as contas). O que vem do extrato importado — sem extrato,
 *   dias com diferença, extrato que não fecha, linhas sem par, realizados após a posição — vem em `avisos`, com a mesma
 *   forma, e NUNCA muda o veredito: a tela o escreve à parte, em cor neutra/âmbar. Aviso tratado como motivo é defeito.
 */

export type StatusDono = 'conciliado' | 'nao_conciliado' | 'pendente';
export type NivelDono = 'conta' | 'tipo' | 'total';

export interface QtdeValor { qtde: number; valor: number }

export interface MotivoConta { conta_id: string; conta_nome: string; status: StatusDono; motivos: Motivo[]; avisos: Motivo[] }

/** Os motivos que o dono escreve; `motivo` desconhecido fica como veio (a tela o mostra cru, nunca o esconde). */
export interface Motivo {
  motivo: string;
  qtde?: number;
  valor?: number;
  dias?: string[];
  falta?: string;
  contas?: MotivoConta[];
  /** 'conferida_com': a conta com que esta fecha o mês (a mãe, na linha da interna). */
  conta_id?: string;
  conta_nome?: string;
  /** 'realizados_apos_posicao': a data da posição declarada. */
  data?: string;
  /** 'saldo_diverge' julgado na posição declarada: a data dela. */
  posicao?: string;
  /** 'contas_com_aviso' (agregados): quantas contas têm cada aviso, e quantas têm algum além de 'sem_extrato'. */
  por_aviso?: Record<string, number>;
  qtde_alem_sem_extrato?: number;
}

export interface PosicaoDono {
  data: string;
  saldo_sistema_na_data: number | null;
  diferenca_na_data: number | null;
  /** O sistema PRÓPRIO da conta na data (PR-CONC-INTERNA-SEPARADA-01a); em conta sem par é o `saldo_sistema_na_data`. */
  saldo_sistema_proprio_na_data: number | null;
  realizados_apos: QtdeValor;
}

/**
 * O SALDO PRÓPRIO DA CONTA — PR-CONC-INTERNA-SEPARADA-01a/01b. Em conta sem par (e na interna) é igual aos campos de topo;
 * na conta-mãe é só o dela, com as transferências mãe↔interna. Os campos de topo da mãe seguem CONSOLIDADOS: são o
 * veredito do par, não o saldo da conta.
 */
export interface ProprioDono {
  saldo_inicial: number | null;
  entradas: number;
  saidas: number;
  saldo_sistema: number | null;
  saldo_extrato: number | null;
  diferenca: number | null;
  entradas_terceiros: number;
  entradas_transferencias: number;
  saidas_terceiros: number;
  saidas_transferencias: number;
}

export interface ContaDoPar { conta_id: string; conta_nome: string }

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
  /** O saldo corrido PRÓPRIO (conta as linhas 'transferencia_interna'); nulo se o dono não o mandou. */
  saldo_apos_proprio: number | null;
}

/** A perna da transferência mãe↔interna na lista da mãe: fora do extrato e do consolidado, dentro do saldo próprio. */
export const TIPO_TRANSFERENCIA_INTERNA = 'transferencia_interna';

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
  /** A 2ª prova (o extrato importado) e, na interna, o ponteiro 'conferida_com'. Nunca decide o status. */
  avisos: Motivo[];
  posicao: PosicaoDono | null;
  sem_conta: { qtde: number; entradas: number; saidas: number } | null;
  linhas_sistema: LinhaSistemaDono[] | null;
  /** Só nas linhas de conta; nulo nos agregados (e se o dono não o mandou). */
  proprio: ProprioDono | null;
  /** Na interna: a mãe e o status do par (o mesmo `status` da linha). */
  par_conta_id: string | null;
  par_status: StatusDono | null;
  /** Na mãe: as internas conferidas com ela; vazio nas demais. */
  internas: ContaDoPar[];
}

export interface StatusAnoDono {
  ano_mes: string;
  nivel: 'conta' | 'total';
  conta_id: string | null;
  conta_nome: string | null;
  status: StatusDono;
  motivos: Motivo[];
  avisos: Motivo[];
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
    const ci = texto(m.conta_id); if (ci !== null) x.conta_id = ci;
    const cn = texto(m.conta_nome); if (cn !== null) x.conta_nome = cn;
    const dt = texto(m.data); if (dt !== null) x.data = dt;
    const ps = texto(m.posicao); if (ps !== null) x.posicao = ps;
    const qa = numeroOuNulo(m.qtde_alem_sem_extrato); if (qa !== null) x.qtde_alem_sem_extrato = qa;
    if (ehObjeto(m.por_aviso)) {
      const pa: Record<string, number> = {};
      for (const [k, n] of Object.entries(m.por_aviso)) { const q2 = numeroOuNulo(n); if (q2 !== null) pa[k] = q2; }
      x.por_aviso = pa;
    }
    if (Array.isArray(m.contas)) {
      x.contas = m.contas.filter(ehObjeto).map((c) => ({
        conta_id: texto(c.conta_id) ?? '', conta_nome: texto(c.conta_nome) ?? '',
        status: status(c.status), motivos: lerMotivos(c.motivos), avisos: lerMotivos(c.avisos),
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
    saldo_apos_proprio: numeroOuNulo(v.saldo_apos_proprio),
  };
}

function lerProprio(v: unknown): ProprioDono | null {
  if (!ehObjeto(v)) return null;
  return {
    saldo_inicial: numeroOuNulo(v.saldo_inicial),
    entradas: numero(v.entradas),
    saidas: numero(v.saidas),
    saldo_sistema: numeroOuNulo(v.saldo_sistema),
    saldo_extrato: numeroOuNulo(v.saldo_extrato),
    diferenca: numeroOuNulo(v.diferenca),
    entradas_terceiros: numero(v.entradas_terceiros),
    entradas_transferencias: numero(v.entradas_transferencias),
    saidas_terceiros: numero(v.saidas_terceiros),
    saidas_transferencias: numero(v.saidas_transferencias),
  };
}

function lerContasDoPar(v: unknown): ContaDoPar[] {
  if (!Array.isArray(v)) return [];
  const out: ContaDoPar[] = [];
  for (const c of v) {
    if (!ehObjeto(c)) continue;
    const id = texto(c.conta_id);
    if (id !== null) out.push({ conta_id: id, conta_nome: texto(c.conta_nome) ?? '' });
  }
  return out;
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
    avisos: lerMotivos(v.avisos),
    posicao: pos && typeof pos.data === 'string'
      ? {
          data: pos.data,
          saldo_sistema_na_data: numeroOuNulo(pos.saldo_sistema_na_data),
          diferenca_na_data: numeroOuNulo(pos.diferenca_na_data),
          saldo_sistema_proprio_na_data: numeroOuNulo(pos.saldo_sistema_proprio_na_data),
          realizados_apos: qtdeValor(pos.realizados_apos),
        }
      : null,
    sem_conta: sc ? { qtde: numero(sc.qtde), entradas: numero(sc.entradas), saidas: numero(sc.saidas) } : null,
    linhas_sistema: Array.isArray(v.linhas_sistema)
      ? v.linhas_sistema.map(lerLinhaSistema).filter((l): l is LinhaSistemaDono => l !== null)
      : null,
    proprio: lerProprio(v.proprio),
    par_conta_id: texto(v.par_conta_id),
    par_status: v.par_status === 'conciliado' || v.par_status === 'nao_conciliado' || v.par_status === 'pendente' ? v.par_status : null,
    internas: lerContasDoPar(v.internas),
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
      avisos: lerMotivos(r.avisos),
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

/** O `title` da marca do par: por que as duas contas só fecham juntas. */
export const tituloDoPar = (nome: string) =>
  `o mês desta conta só fecha junto com ${nome}: o arquivo do banco traz o saldo das duas somado`;

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
  /** Aviso que pede olho (âmbar): todo aviso do extrato menos o 'sem_extrato', que é o caso comum (neutro). */
  marca?: boolean;
  /** No Todas: as contas que o total cita (o nome e o primeiro dia com diferença dela, se houver). */
  contas?: { conta_id: string; conta_nome: string; texto: string; dia?: string }[];
}

/** O nome de cada aviso na contagem por aviso dos agregados (`contas_com_aviso.por_aviso`). */
const ROTULO_AVISO: Record<string, string> = {
  sem_extrato: 'sem extrato',
  dias_com_diferenca: 'dias com diferença',
  extrato_nao_fecha: 'extrato não fecha',
  extratos_sem_par: 'extratos sem par',
  lancamentos_sem_par: 'lançamentos sem par',
  realizados_apos_posicao: 'realizados após a posição',
};

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
      return {
        chave: m.motivo, texto: `saldo diverge ${brlSinal(m.valor ?? 0)}`,
        titulo: m.posicao ? `diferença na posição declarada em ${ddmm(m.posicao)}` : undefined,
      };
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
        /* O dia do link vem dos AVISOS da conta (a 2ª prova) — PR-CONC-STATUS-SALDO-01b. */
        const dias = c.avisos.find((x) => x.motivo === 'dias_com_diferenca');
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
    case 'conferida_com': {
      const nome = m.conta_nome ?? '';
      return { chave: m.motivo, texto: `conferida com ${nome}`, titulo: tituloDoPar(nome) };
    }
    case 'contas_pendentes': {
      const n = m.qtde ?? 0;
      return { chave: m.motivo, texto: `${n} ${n === 1 ? 'pendente' : 'pendentes'}`, titulo: `${n} ${n === 1 ? 'conta' : 'contas'} sem saldo informado` };
    }
    case 'lancamentos_sem_conta': {
      const n = m.qtde ?? 0;
      return { chave: m.motivo, texto: `${n} ${n === 1 ? 'lançamento sem conta' : 'lançamentos sem conta'}` };
    }
    case 'extratos_sem_par': {
      const n = m.qtde ?? 0;
      return { chave: m.motivo, texto: `${n} ${n === 1 ? 'extrato sem par' : 'extratos sem par'}`, titulo: `movimentos do banco sem lançamento: ${brlSinal(m.valor ?? 0)}` };
    }
    case 'lancamentos_sem_par': {
      const n = m.qtde ?? 0;
      return { chave: m.motivo, texto: `${n} ${n === 1 ? 'lançamento sem par' : 'lançamentos sem par'}`, titulo: `lançamentos do sistema sem movimento no banco: ${brlSinal(m.valor ?? 0)}` };
    }
    case 'realizados_apos_posicao': {
      const n = m.qtde ?? 0;
      return {
        chave: m.motivo,
        texto: `${n} ${n === 1 ? 'realizado' : 'realizados'} após ${m.data ? ddmm(m.data) : 'a posição'}`,
        titulo: `o saldo foi informado em ${m.data ? ddmm(m.data) : 'data anterior ao fim do mês'} e o status julga essa data; depois dela há ${n} ${n === 1 ? 'lançamento realizado' : 'lançamentos realizados'}, ${brlSinal(m.valor ?? 0)}`,
      };
    }
    case 'contas_com_aviso': {
      const n = m.qtde_alem_sem_extrato ?? 0;
      return {
        chave: m.motivo,
        texto: `${n} ${n === 1 ? 'conta com aviso do extrato' : 'contas com aviso do extrato'}`,
        /* ⚠ ORDEM FIXA, a de `ROTULO_AVISO` (o desconhecido no fim): a ordem das chaves de um objeto JSON muda com o
           transporte (o PostgREST manda na ordem do jsonb; outro canal, alfabética) e a frase não pode mudar com ela. */
        titulo: [...Object.keys(ROTULO_AVISO), ...Object.keys(m.por_aviso ?? {}).filter((k) => !(k in ROTULO_AVISO))]
          .filter((k) => m.por_aviso?.[k] !== undefined)
          .map((k) => `${ROTULO_AVISO[k] ?? k.replace(/_/g, ' ')}: ${m.por_aviso?.[k]}`).join(' · '),
      };
    }
    default:
      return { chave: m.motivo, texto: m.motivo.replace(/_/g, ' ') };
  }
}

/** O ponteiro do par: não é motivo nem 2ª prova — diz com quem a conta fecha. */
const AVISO_DO_PAR = 'conferida_com';
/** Conta sem arquivo importado é o caso comum: informa, não pede olho. */
const AVISO_NEUTRO = 'sem_extrato';

/** O nome da outra conta do par: na mãe, as `internas`; na interna, o aviso 'conferida_com' do dono. Vazio sem par. */
function nomeDoPar(l: Pick<LinhaResumo, 'par_conta_id' | 'internas' | 'avisos'>): string {
  if (l.internas.length > 0) return l.internas.map((i) => i.conta_nome).join(', ');
  if (l.par_conta_id !== null) return l.avisos.find((m) => m.motivo === AVISO_DO_PAR)?.conta_nome ?? '';
  return '';
}

/**
 * As frases do STATUS de UMA linha do dono (conta ou agregado), na ordem em que ele as escreveu: só o que DECIDE (os
 * `motivos`), mais "confere em todos os dias" e, em conta de par, "conferida com <nome>".
 * ⚠ "confere em todos os dias" só existe quando a conta TEM extrato e o dono NÃO avisou `dias_com_diferenca` — as duas
 *   frases nunca convivem. Desde o PR-CONC-STATUS-SALDO-01b o dia com diferença é AVISO: quem olhar `motivos` aqui escreve
 *   "confere em todos os dias" numa conta com dia divergente.
 */
export function frasesDoStatus(l: Pick<LinhaResumo, 'nivel' | 'tem_extrato' | 'motivos' | 'avisos' | 'par_conta_id' | 'internas'>): FraseDoStatus[] {
  const frases = l.motivos.map(fraseDoMotivo);
  if (l.nivel === 'conta' && l.tem_extrato && !l.avisos.some((m) => m.motivo === 'dias_com_diferenca')) {
    frases.unshift({ chave: 'confere_dias', texto: 'confere em todos os dias' });
  }
  if (l.nivel === 'conta') {
    const nome = nomeDoPar(l);
    if (nome) frases.push({ chave: AVISO_DO_PAR, texto: `conferida com ${nome}`, titulo: tituloDoPar(nome) });
  }
  return frases;
}

/**
 * A 2ª PROVA — as frases dos AVISOS do extrato importado, na ordem do dono. Não decidem o status e a tela as escreve à
 * parte ("2ª prova · extrato"), nunca em vermelho. `marca` = pede olho (âmbar); 'sem_extrato' informa (neutro). O
 * ponteiro do par fica fora (está nas frases do status). Nos agregados, "N contas com aviso do extrato" conta as contas
 * com aviso ALÉM de 'sem_extrato' (`qtde_alem_sem_extrato`, do dono) e some quando são zero.
 */
export function frasesDosAvisos(l: Pick<LinhaResumo, 'avisos'>): FraseDoStatus[] {
  const out: FraseDoStatus[] = [];
  for (const m of l.avisos) {
    if (m.motivo === AVISO_DO_PAR) continue;
    if (m.motivo === 'contas_com_aviso' && (m.qtde_alem_sem_extrato ?? 0) <= 0) continue;
    out.push({ ...fraseDoMotivo(m), marca: m.motivo !== AVISO_NEUTRO });
  }
  return out;
}

/**
 * O MARCADOR ÂMBAR (régua do ano e "Saldos por conta"): a linha está CONCILIADA e o extrato importado tem aviso que pede
 * olho. Devolve o texto do `title` (os avisos por extenso) ou nulo. Só LÊ o dono: status e avisos são dele.
 */
export function marcaDeAviso(l: Pick<LinhaResumo, 'status' | 'avisos'>): string | null {
  if (l.status !== 'conciliado') return null;
  const f = frasesDosAvisos(l).filter((x) => x.marca);
  if (f.length === 0) return null;
  return `2ª prova · extrato: ${f.map((x) => (x.chave === 'contas_com_aviso' && x.titulo ? `${x.texto} (${x.titulo})` : x.texto)).join(' · ')}`;
}

/* ── o saldo próprio e o par (PR-CONC-INTERNA-SEPARADA-01b) ───────────────────── */

const PROPRIO_AUSENTE: ProprioDono = {
  saldo_inicial: null, entradas: 0, saidas: 0, saldo_sistema: null, saldo_extrato: null, diferenca: null,
  entradas_terceiros: 0, entradas_transferencias: 0, saidas_terceiros: 0, saidas_transferencias: 0,
};

/**
 * OS NÚMEROS QUE A TELA DESENHA PARA UMA LINHA: na linha de CONTA, o `proprio` do dono (o saldo da conta, nunca o
 * consolidado do par); nos agregados ('tipo', 'total'), os campos de topo — que o dono já soma pelos próprios.
 * ⚠ LER, não calcular: conta sem `proprio` (dono antigo) fica neutra ("—"), nunca cai no campo consolidado.
 */
export function saldosDaLinha(l: LinhaResumo | null): ProprioDono {
  if (!l) return PROPRIO_AUSENTE;
  if (l.nivel === 'conta') return l.proprio ?? PROPRIO_AUSENTE;
  return {
    saldo_inicial: l.saldo_inicial, entradas: l.entradas, saidas: l.saidas, saldo_sistema: l.saldo_sistema,
    saldo_extrato: l.saldo_extrato, diferenca: l.diferenca,
    entradas_terceiros: l.entradas_terceiros, entradas_transferencias: l.entradas_transferencias,
    saidas_terceiros: l.saidas_terceiros, saidas_transferencias: l.saidas_transferencias,
  };
}

/** A conta é conferida em PAR: é a interna (aponta a mãe) ou a mãe (tem internas). */
export function contaEmPar(l: Pick<LinhaResumo, 'par_conta_id' | 'internas'> | null): boolean {
  return !!l && (l.par_conta_id !== null || l.internas.length > 0);
}

/**
 * A MARCA DO PAR — "conferida com <nome>": na mãe, os nomes de `internas`; na interna, o `conta_nome` do AVISO
 * 'conferida_com' (era motivo até o PR-CONC-STATUS-SALDO-01b). Nulo em conta sem par. Os nomes são os do dono; nenhuma leitura de cadastro.
 * ⚠ `curto` É O QUE CABE NA LINHA DE "SALDOS POR CONTA": medido a 1.135px, a coluna Conta tem 224px úteis e sobram 117 na
 *   linha do Bradesco (106 na do Invest. Fácil); "· conferida com Bradesco-Invest. Facil" pede ~175 e quebrava a linha em
 *   duas (36px contra 22). Até "· em par" (36,5px) quebrava a do Invest. Fácil em set/26 por 1,7px (nome + data + marca +
 *   clipe = 209,7 de 208). A linha escreve `curto` ("par") e a frase inteira — `texto` + o porquê — vai no `title`.
 */
export function marcaDoPar(l: Pick<LinhaResumo, 'par_conta_id' | 'internas' | 'avisos'> | null): { texto: string; curto: string; titulo: string; tituloLinha: string } | null {
  if (!l) return null;
  const nome = nomeDoPar(l);
  if (!nome) return null;
  return { texto: `conferida com ${nome}`, curto: 'par', titulo: tituloDoPar(nome), tituloLinha: `conferida com ${nome} — ${tituloDoPar(nome)}` };
}

/** O `title` do "—" da diferença na posição, em conta de par (dívida de banco 01c: `posicao.diferenca_propria_na_data`). */
export const TITULO_DIFERENCA_NA_POSICAO_INDISPONIVEL =
  'diferença na posição ainda não disponível para conta conferida em par — veja a diferença do fim do mês';

/**
 * A DIFERENÇA NA POSIÇÃO DECLARADA, lida do dono. Conta sem par: `posicao.diferenca_na_data`. Conta de PAR: o dono ainda
 * não devolve a diferença própria na data — a tela mostra "—" com o motivo (`indisponivel`), nunca uma subtração.
 */
export function diferencaNaPosicao(l: LinhaResumo | null): { valor: number | null; indisponivel: boolean } {
  if (!l || !l.posicao) return { valor: null, indisponivel: false };
  if (l.nivel === 'conta' && contaEmPar(l)) return { valor: null, indisponivel: true };
  return { valor: l.posicao.diferenca_na_data, indisponivel: false };
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
    if (l.nivel !== 'conta' || !l.conta_id) continue;
    /* ⚠ O QUE SE GRAVA É O SALDO DA CONTA, o `proprio` (PR-CONC-INTERNA-SEPARADA-01b): em conta sem par é igual ao topo; na
       mãe o topo é o consolidado do par, e gravá-lo como saldo dela somaria a interna. */
    const p = saldosDaLinha(l);
    if (p.saldo_extrato !== null) continue;
    if (l.tem_extrato || Math.round(p.entradas * 100) !== 0 || Math.round(p.saidas * 100) !== 0) { comMovimento++; continue; }
    if (l.saldo_inicial_origem === 'ausente' || p.saldo_inicial === null || p.saldo_sistema === null) { semReferencia++; continue; }
    fechar.push({ conta_id: l.conta_id, saldo_inicial: p.saldo_inicial, saldo_final: p.saldo_sistema });
  }
  return { fechar, comMovimento, semReferencia };
}

/**
 * O SISTEMA NA POSIÇÃO, LIDO DO DONO — PR-CONC-SALDO-UMA-REGUA-02b (D1), próprio desde o PR-CONC-INTERNA-SEPARADA-01b (D4/D7).
 * Com posição declarada ANTES do fim do mês: o saldo é `posicao.saldo_sistema_proprio_na_data`, a diferença é a da posição
 * (`diferencaNaPosicao`: em conta de par, indisponível) e os "realizados após" são os da `posicao`; sem ela, o `proprio` do
 * mês. Nada se soma nem se subtrai aqui: cada campo é uma chave da linha do dono. Em conta sem par os números são os de antes.
 */
export function sistemaNaPosicao(l: LinhaResumo | null): {
  saldo: number | null; diferenca: number | null; diferencaIndisponivel: boolean; aposQtde: number; data: string | null;
} {
  if (!l) return { saldo: null, diferenca: null, diferencaIndisponivel: false, aposQtde: 0, data: null };
  if (l.posicao) {
    const dif = diferencaNaPosicao(l);
    return {
      saldo: l.posicao.saldo_sistema_proprio_na_data, diferenca: dif.valor, diferencaIndisponivel: dif.indisponivel,
      aposQtde: l.posicao.realizados_apos.qtde, data: l.posicao.data,
    };
  }
  const p = saldosDaLinha(l);
  return { saldo: p.saldo_sistema, diferenca: p.diferenca, diferencaIndisponivel: false, aposQtde: 0, data: l.saldo_extrato_data };
}

/**
 * O SISTEMA NUMA DATA QUALQUER — o lápis (D4 do 02b; próprio desde o PR-CONC-INTERNA-SEPARADA-01b, D5). É o
 * `saldo_apos_proprio` da ÚLTIMA linha de `linhas_sistema` com data até a pedida (a lista vem em ordem de data e o saldo é
 * corrido pelo dono, com as transferências mãe↔interna); sem linha até a data, o saldo inicial PRÓPRIO. LER, não somar.
 * Sem a lista (resumo sem detalhe), nulo — nunca uma soma de reserva.
 */
export function saldoSistemaNaData(l: LinhaResumo | null, dataIso: string): number | null {
  if (!l || !l.linhas_sistema) return null;
  const d = dataIso.slice(0, 10);
  let saldo: number | null = saldosDaLinha(l).saldo_inicial;
  for (const x of l.linhas_sistema) {
    if (!x.data || x.data.slice(0, 10) > d) continue;
    saldo = x.saldo_apos_proprio;
  }
  return saldo;
}
