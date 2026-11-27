/**
 * CAD-CONTAS-BANCARIAS-01 — o cadastro da conta bancaria (mock aprovado 20/10 12h53): o que a LISTA mostra em cada celula, os filtros, as
 * faixas por tipo, o rodape, e o que o MODAL grava. Logica pura; quem le e grava e' a tela (fn_conta_bancaria_salvar).
 *
 * ⚠ NADA DE SEGUNDA MARCA: o "Caixa fisico" e' a conta corrente com o banco 'Dinheiro' (o "Dinheiro/Caixa" da `bancos_referencia`); o
 *   "Sem extrato" do formato e' a marca `sem_extrato_bancario` do CONC-TRANSF-DUAS-PONTAS-01b; os nomes de reconhecimento sao os
 *   `aliases` que a importacao ja' le^; a conta de investimento que vive dentro desta e' o `consolida_em_conta_id` DA de investimento.
 * ⚠ SO' O QUE MUDOU VAI AO BANCO (`mudancas`): salvar sem mexer nao toca nada — nem a semente do saldo, nem a Auditoria.
 */
import { normalizarParaBusca } from '@/lib/texto/busca';

export const BANCO_CAIXA = 'Dinheiro';

export type TipoNaTela = 'cc' | 'inv' | 'cartao' | 'caixa';
export type FormatoNaTela = 'ofx' | 'planilha' | 'pdf' | 'sem_extrato';
export type SegmentoDaLista = 'todas' | 'cc' | 'inv' | 'cartao';

export interface ContaBancariaCadastro {
  id: string;
  cliente_id?: string | null;
  nome_conta: string;
  nome_exibicao: string | null;
  codigo_conta: string | null;
  tipo_conta: string | null;
  fazenda_id: string | null;
  ativa: boolean;
  banco: string | null;
  agencia: string | null;
  numero_conta: string | null;
  conta_digito: string | null;
  titular_nome?: string | null;
  titular_documento?: string | null;
  chave_pix?: string | null;
  observacao?: string | null;
  gerente_nome?: string | null;
  gerente_telefone?: string | null;
  gerente_celular?: string | null;
  gerente_email?: string | null;
  gerente_desde?: string | null;
  agencia_endereco?: string | null;
  agencia_cidade_uf?: string | null;
  agencia_telefone?: string | null;
  agencia_outro_contato?: string | null;
  agencia_observacao?: string | null;
  formato_extrato?: string | null;
  sem_extrato_bancario?: boolean | null;
  aliases?: unknown;
  consolida_em_conta_id?: string | null;
  mes_inicio: string | null;
  saldo_inicial_oficial: number | string | null;
  /** CONTA-INATIVAR-DATA-01 — a partir deste dia (1º do mês) a conta não recebe lançamento novo; só em conta inativa */
  inativa_desde?: string | null;
  ordem_exibicao?: number | null;
  updated_at?: string | null;
  updated_by?: string | null;
  /** CARTAO-LANCAMENTO-01 — só cartão: o dia de fechamento e o de vencimento da fatura, digitados (nulo = não informado) */
  dia_fechamento?: number | null;
  dia_vencimento?: number | null;
}

export interface BancoReferencia { codigo_banco: string; nome_banco: string; nome_curto: string }

/* ─── tipo ─────────────────────────────────────────────────────────────────── */

export const ehCaixa = (c: Pick<ContaBancariaCadastro, 'tipo_conta' | 'banco'>): boolean =>
  (c.tipo_conta || 'cc') === 'cc' && (c.banco ?? '').trim() === BANCO_CAIXA;

export function tipoNaTela(c: Pick<ContaBancariaCadastro, 'tipo_conta' | 'banco'>): TipoNaTela {
  if (ehCaixa(c)) return 'caixa';
  const t = c.tipo_conta || 'cc';
  return t === 'inv' || t === 'cartao' ? t : 'cc';
}

/** A faixa da lista: o caixa fisico mora em "Conta corrente" (como no mock); tipo fora do vocabulario (ex.: permuta) tambem. */
export function faixaDaConta(c: Pick<ContaBancariaCadastro, 'tipo_conta'>): 'cc' | 'inv' | 'cartao' {
  const t = c.tipo_conta || 'cc';
  return t === 'inv' || t === 'cartao' ? t : 'cc';
}

export const ROTULO_FAIXA: Record<'cc' | 'inv' | 'cartao', string> = { cc: 'Conta corrente', inv: 'Investimento', cartao: 'Cartão' };
export const SELO_TIPO: Record<'cc' | 'inv' | 'cartao', string> = { cc: 'CC', inv: 'INV', cartao: 'Cartão' };

/* ─── celulas da lista ─────────────────────────────────────────────────────── */

export const NAO_INF = 'não inf.';
export const NAO_INFORMADO = 'não informado';
export const NAO_SE_APLICA = 'não se aplica';
export const SEM_INICIO = 'sem início';
export const SEM_SALDO = 'sem saldo';

export type Celula = { texto: string; tom: 'normal' | 'vazio' | 'aviso' };
const cheia = (texto: string): Celula => ({ texto, tom: 'normal' });
const vazia = (texto: string): Celula => ({ texto, tom: 'vazio' });

const limpo = (v: string | null | undefined): string => (v ?? '').trim();

export function nomeDaConta(c: Pick<ContaBancariaCadastro, 'nome_exibicao' | 'nome_conta'>): string {
  return limpo(c.nome_exibicao) || limpo(c.nome_conta);
}

export function numeroDaConta(c: Pick<ContaBancariaCadastro, 'numero_conta' | 'conta_digito'>): string {
  const n = limpo(c.numero_conta);
  if (!n) return '';
  const d = limpo(c.conta_digito);
  return d ? `${n}-${d}` : n;
}

export function celulaBanco(c: ContaBancariaCadastro, bancos: readonly BancoReferencia[]): Celula {
  if (ehCaixa(c)) return cheia('Caixa físico');
  const b = limpo(c.banco);
  if (!b) return vazia(NAO_INF);
  const ref = bancos.find(x => x.nome_curto === b);
  return cheia(ref && ref.codigo_banco !== '000' ? `${ref.codigo_banco} ${ref.nome_curto}` : b);
}

export function celulaAgencia(c: ContaBancariaCadastro): Celula {
  if (ehCaixa(c)) return vazia(NAO_SE_APLICA);
  return limpo(c.agencia) ? cheia(limpo(c.agencia)) : vazia(NAO_INF);
}

export function celulaConta(c: ContaBancariaCadastro): Celula {
  if (ehCaixa(c)) return vazia(NAO_SE_APLICA);
  const n = numeroDaConta(c);
  return n ? cheia(n) : vazia(NAO_INF);
}

export function celulaGerente(c: ContaBancariaCadastro): Celula {
  if (ehCaixa(c)) return vazia(NAO_SE_APLICA);
  return limpo(c.gerente_nome) ? cheia(limpo(c.gerente_nome)) : vazia(NAO_INFORMADO);
}

/** O telefone da lista: o celular/WhatsApp do gerente; sem ele, o fixo. */
export function celulaTelefone(c: ContaBancariaCadastro): Celula {
  if (ehCaixa(c)) return vazia(NAO_SE_APLICA);
  const t = limpo(c.gerente_celular) || limpo(c.gerente_telefone);
  return t ? cheia(t) : vazia(NAO_INF);
}

/** "AAAA-MM" -> "01/MM/AAAA" (o saldo inicial vale do 1º dia do mes de inicio). */
export function dataDoMesInicio(mes: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})$/.exec(limpo(mes));
  return m ? `01/${m[2]}/${m[1]}` : '';
}

export function celulaInicio(c: ContaBancariaCadastro): Celula {
  const d = dataDoMesInicio(c.mes_inicio);
  return d ? cheia(d) : { texto: SEM_INICIO, tom: 'aviso' };
}

export const saldoNumero = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const brl = (n: number): string => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function celulaSaldo(c: ContaBancariaCadastro): Celula {
  const n = saldoNumero(c.saldo_inicial_oficial);
  return n === null ? { texto: SEM_SALDO, tom: 'aviso' } : cheia(brl(n));
}

/* ─── filtros, faixas, rodape ──────────────────────────────────────────────── */

/* P134: a regra única de busca (`normalizarParaBusca`), no lugar da cópia local */
const semAcento = normalizarParaBusca;

export interface FiltrosDaLista { busca: string; segmento: SegmentoDaLista; fazendaId: string | null; mostrarInativas: boolean }

/** A busca casa o nome da conta, o banco (nome curto, nome e codigo) e o gerente — sem acento e sem caixa. */
export function filtrarContas(contas: readonly ContaBancariaCadastro[], f: FiltrosDaLista,
  bancos: readonly BancoReferencia[] = []): ContaBancariaCadastro[] {
  const q = semAcento(f.busca.trim());
  return contas.filter(c => {
    if (!f.mostrarInativas && !c.ativa) return false;
    if (f.segmento !== 'todas' && faixaDaConta(c) !== f.segmento) return false;
    if (f.fazendaId && c.fazenda_id !== f.fazendaId) return false;
    if (!q) return true;
    const ref = bancos.find(b => b.nome_curto === limpo(c.banco));
    /* CONTAS-BANCARIAS-LISTA-01: a busca acha também a agência e o número da conta ("Buscar conta, banco, agência ou conta") */
    const alvo = [nomeDaConta(c), c.banco, ref?.nome_banco, ref?.codigo_banco, c.gerente_nome, c.codigo_conta, c.agencia, numeroDaConta(c)].filter(Boolean).join(' ');
    return semAcento(alvo).includes(q);
  });
}

const numDoCodigo = (code: string | null): number => {
  if (!code) return Number.MAX_SAFE_INTEGER;
  const parts = code.split('-');
  const n = parseInt(parts[parts.length - 1] || '', 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

export interface FaixaDaLista { tipo: 'cc' | 'inv' | 'cartao'; rotulo: string; contas: ContaBancariaCadastro[] }

/** As faixas na ordem Conta corrente · Investimento · Cartão (so' as que tem conta); dentro, pelo codigo curto. */
export function faixasDaLista(contas: readonly ContaBancariaCadastro[]): FaixaDaLista[] {
  const ordem: Array<'cc' | 'inv' | 'cartao'> = ['cc', 'inv', 'cartao'];
  return ordem.map(tipo => ({
    tipo,
    rotulo: ROTULO_FAIXA[tipo],
    contas: contas.filter(c => faixaDaConta(c) === tipo)
      .sort((a, b) => numDoCodigo(a.codigo_conta) - numDoCodigo(b.codigo_conta) || nomeDaConta(a).localeCompare(nomeDaConta(b), 'pt-BR')),
  })).filter(f => f.contas.length > 0);
}

/** CONTAS-BANCARIAS-AJUSTES-01 (a) — o TÍTULO conta o cadastro inteiro: "15 ativas · 4 inativas" (sem inativa, só "15 ativas"). */
export function resumoDoCadastro(contas: readonly ContaBancariaCadastro[]): { ativas: number; inativas: number; texto: string } {
  const ativas = contas.filter(c => c.ativa).length;
  const inativas = contas.length - ativas;
  const a = `${ativas} ${ativas === 1 ? 'ativa' : 'ativas'}`;
  return { ativas, inativas, texto: inativas > 0 ? `${a} · ${inativas} ${inativas === 1 ? 'inativa' : 'inativas'}` : a };
}

/** (a) o RODAPÉ conta o que a lista MOSTRA: com filtro (busca, tipo, fazenda ou inativas escondidas) "mostrando N de 19"; sem, "19 contas".
 *  Uma regra só com o título: os dois contam o MESMO cadastro (`todas`). */
export function rodapeDaLista(mostradas: readonly ContaBancariaCadastro[], todas: readonly ContaBancariaCadastro[] = mostradas):
  { contas: number; saldo: number; texto: string } {
  const saldo = Math.round(mostradas.reduce((s, c) => s + (saldoNumero(c.saldo_inicial_oficial) ?? 0), 0) * 100) / 100;
  const n = mostradas.length;
  const t = todas.length;
  return { contas: n, saldo, texto: n < t ? `mostrando ${n} de ${t}` : `${t} ${t === 1 ? 'conta' : 'contas'}` };
}

/* ─── (c) o código curto ───────────────────────────────────────────────────── */

/** CONTAS-BANCARIAS-AJUSTES-01 (c) — o código curto tem 2 dígitos ("01" … "99"). */
export const codigoDeDoisDigitos = (codigo: string): boolean => /^\d{2}$/.test(codigo.trim());

/** O `tipo_conta` que a conta terá no banco: o da conta aberta enquanto o tipo da tela não muda (a permuta aparece como "cc" na tela). */
export function tipoContaDoFormulario(f: Pick<FormularioConta, 'tipo'>, conta: Pick<ContaBancariaCadastro, 'tipo_conta' | 'banco'> | null): string {
  if (conta && tipoNaTela(conta) === f.tipo) return conta.tipo_conta || 'cc';
  return f.tipo === 'caixa' ? 'cc' : f.tipo;
}

/** O próximo código livre do tipo, em 2 dígitos: o maior número do MESMO `tipo_conta` do cliente + 1 (a régua de `fn_gerar_codigo_conta`,
 *  que numera por tipo). `semEsta`: a conta aberta não conta. */
export function proximoCodigoLivre(contas: readonly ContaBancariaCadastro[], tipoConta: string, semEsta: string | null = null): string {
  let max = 0;
  for (const c of contas) {
    if (c.id === semEsta || (c.tipo_conta || 'cc') !== tipoConta) continue;
    const s = (c.codigo_conta ?? '').trim();
    if (/^\d+$/.test(s)) max = Math.max(max, Number(s));
  }
  return String(max + 1).padStart(2, '0');
}

/* ─── o formulario do modal ────────────────────────────────────────────────── */

export interface FormularioConta {
  nome: string; codigo: string; ativa: boolean; tipo: TipoNaTela; fazendaId: string;
  banco: string; agencia: string; contaComDigito: string; titular: string; titularDocumento: string; chavePix: string; observacao: string;
  gerenteNome: string; gerenteTelefone: string; gerenteCelular: string; gerenteEmail: string; gerenteDesde: string;
  agenciaEndereco: string; agenciaCidadeUf: string; agenciaTelefone: string; agenciaOutroContato: string; agenciaObservacao: string;
  /** a data do saldo, ISO "AAAA-MM-DD" (o DatePicker da casa); grava o mes */
  saldoEm: string; saldoInicial: number | null;
  nomesReconhecimento: string[]; formato: FormatoNaTela | null;
  /** cc: a de investimento que vive dentro desta; inv: a corrente onde ela vive */
  contaVinculada: string;
  /** CARTAO-LANCAMENTO-01 — só cartão, digitados (texto do campo; vazio = nulo) */
  diaFechamento: string; diaVencimento: string;
  /** CONTA-INATIVAR-DATA-01 — "Inativa desde", ISO "AAAA-MM-01" (o DatePicker da casa, levado ao dia 1º); só vale com a conta inativa */
  inativaDesde: string;
}

export function aliasesDaConta(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim());
}

export function formatoNaTela(c: Pick<ContaBancariaCadastro, 'sem_extrato_bancario' | 'formato_extrato'>): FormatoNaTela | null {
  if (c.sem_extrato_bancario) return 'sem_extrato';
  const f = c.formato_extrato;
  return f === 'ofx' || f === 'planilha' || f === 'pdf' ? f : null;
}

/** O formulario de uma conta (ou de uma nova). `internaDaConta`: a de investimento que hoje aponta para esta (so' cc). */
export function formularioDaConta(c: ContaBancariaCadastro | null, fazendaPadrao: string, internaDaConta: string | null = null): FormularioConta {
  const tipo: TipoNaTela = c ? tipoNaTela(c) : 'cc';
  return {
    nome: c ? nomeDaConta(c) : '', codigo: limpo(c?.codigo_conta), ativa: c ? !!c.ativa : true, tipo, fazendaId: c?.fazenda_id ?? fazendaPadrao,
    banco: c && !ehCaixa(c) ? limpo(c.banco) : '', agencia: limpo(c?.agencia), contaComDigito: c ? numeroDaConta(c) : '',
    titular: limpo(c?.titular_nome), titularDocumento: limpo(c?.titular_documento), chavePix: limpo(c?.chave_pix), observacao: limpo(c?.observacao),
    gerenteNome: limpo(c?.gerente_nome), gerenteTelefone: limpo(c?.gerente_telefone), gerenteCelular: limpo(c?.gerente_celular),
    gerenteEmail: limpo(c?.gerente_email), gerenteDesde: limpo(c?.gerente_desde),
    agenciaEndereco: limpo(c?.agencia_endereco), agenciaCidadeUf: limpo(c?.agencia_cidade_uf), agenciaTelefone: limpo(c?.agencia_telefone),
    agenciaOutroContato: limpo(c?.agencia_outro_contato), agenciaObservacao: limpo(c?.agencia_observacao),
    saldoEm: c && /^\d{4}-\d{2}$/.test(limpo(c.mes_inicio)) ? `${limpo(c.mes_inicio)}-01` : '',
    saldoInicial: c ? saldoNumero(c.saldo_inicial_oficial) : null,
    nomesReconhecimento: c ? aliasesDaConta(c.aliases) : [],
    formato: c ? formatoNaTela(c) : null,
    contaVinculada: tipo === 'inv' ? limpo(c?.consolida_em_conta_id) : limpo(internaDaConta),
    diaFechamento: c?.dia_fechamento != null ? String(c.dia_fechamento) : '', diaVencimento: c?.dia_vencimento != null ? String(c.dia_vencimento) : '',
    inativaDesde: limpo(c?.inativa_desde).slice(0, 10),
  };
}

/** "03722-5" -> numero "03722" e digito "5"; sem hifen, tudo e' numero. */
export function separarContaDigito(v: string): { numero: string; digito: string } {
  const s = v.trim();
  const i = s.lastIndexOf('-');
  if (i <= 0 || i === s.length - 1) return { numero: s, digito: '' };
  return { numero: s.slice(0, i).trim(), digito: s.slice(i + 1).trim() };
}

/** O dia digitado (1–31) ou nulo; texto que não é dia vira nulo aqui — quem trava o Salvar é `faltasDoFormulario`. */
export function diaDoCampo(v: string): number | null {
  const s = v.trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 31 ? n : null;
}

/** O formulario no formato do escritor (`fn_conta_bancaria_salvar`): as chaves do banco, texto vazio = nulo. */
export function dadosDoFormulario(f: FormularioConta): Record<string, unknown> {
  const caixa = f.tipo === 'caixa';
  const { numero, digito } = separarContaDigito(f.contaComDigito);
  const t = (v: string) => (v.trim() === '' ? null : v.trim());
  const d: Record<string, unknown> = {
    nome_conta: t(f.nome), codigo_conta: t(f.codigo), ativa: f.ativa, fazenda_id: t(f.fazendaId),
    tipo_conta: caixa ? 'cc' : f.tipo,
    banco: caixa ? BANCO_CAIXA : t(f.banco),
    agencia: caixa ? null : t(f.agencia), numero_conta: caixa ? null : t(numero), conta_digito: caixa ? null : t(digito),
    titular_nome: t(f.titular), titular_documento: t(f.titularDocumento), chave_pix: t(f.chavePix), observacao: t(f.observacao),
    gerente_nome: t(f.gerenteNome), gerente_telefone: t(f.gerenteTelefone), gerente_celular: t(f.gerenteCelular),
    gerente_email: t(f.gerenteEmail), gerente_desde: t(f.gerenteDesde),
    agencia_endereco: t(f.agenciaEndereco), agencia_cidade_uf: t(f.agenciaCidadeUf), agencia_telefone: t(f.agenciaTelefone),
    agencia_outro_contato: t(f.agenciaOutroContato), agencia_observacao: t(f.agenciaObservacao),
    mes_inicio: /^\d{4}-\d{2}/.test(f.saldoEm) ? f.saldoEm.slice(0, 7) : null,
    saldo_inicial_oficial: f.saldoInicial,
    aliases: f.nomesReconhecimento.length ? f.nomesReconhecimento : null,
    sem_extrato_bancario: f.formato === 'sem_extrato',
    formato_extrato: f.formato && f.formato !== 'sem_extrato' ? f.formato : null,
    /* CARTAO-LANCAMENTO-01 — os dias só existem no cartão; nas outras contas vão nulos (trocar o tipo apaga) */
    dia_fechamento: f.tipo === 'cartao' ? diaDoCampo(f.diaFechamento) : null,
    dia_vencimento: f.tipo === 'cartao' ? diaDoCampo(f.diaVencimento) : null,
    /* CONTA-INATIVAR-DATA-01 — a data só vai com a conta inativa; reativar manda nulo (o escritor limpa a data, com a trilha) */
    inativa_desde: f.ativa ? null : t(f.inativaDesde),
  };
  if (f.tipo === 'inv') d.consolida_em_conta_id = t(f.contaVinculada);
  else if (f.tipo === 'cc') d.conta_interna_id = t(f.contaVinculada);
  return d;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * So' o que mudou entre o formulario de quando abriu e o de agora — e' o que vai ao banco. Numa conta nova vai tudo que tem valor.
 * ⚠ `formato`: escolher OFX/Planilha/PDF numa conta "Sem extrato" manda os dois campos (desmarca a marca e grava o formato).
 */
export function mudancas(original: FormularioConta | null, atual: FormularioConta): Record<string, unknown> {
  const novo = dadosDoFormulario(atual);
  if (!original) return Object.fromEntries(Object.entries(novo).filter(([, v]) => v !== null && v !== ''));
  const antes = dadosDoFormulario(original);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(novo)) if (!igual(novo[k], antes[k])) out[k] = novo[k];
  return out;
}

/** O que falta para gravar. Na conta nova a data e o saldo inicial sao obrigatorios (a aba ganha o selo "obrigatório"). */
export function faltasDoFormulario(f: FormularioConta, nova: boolean, codigo: { original?: string; sugestao?: string } = {}): string[] {
  const falta: string[] = [];
  if (!f.nome.trim()) falta.push('o nome da conta');
  /* (c) o código confere 2 dígitos na conta nova e quando muda (o de hoje, intocado, não trava outro Salvar) */
  if ((nova || f.codigo.trim() !== (codigo.original ?? '').trim()) && !codigoDeDoisDigitos(f.codigo)) {
    falta.push(codigo.sugestao ? `o código curto com 2 dígitos (o próximo livre do tipo: ${codigo.sugestao})` : 'o código curto com 2 dígitos');
  }
  if (!f.fazendaId) falta.push('a fazenda');
  if (nova || f.saldoEm || f.saldoInicial !== null) {
    if (!f.saldoEm) falta.push('a data do saldo');
    if (f.saldoInicial === null) falta.push('o saldo inicial');
  }
  /* CONTA-INATIVAR-DATA-01 — inativar pede a data (dia 1º); a conta nova nasce ativa (o banco recusa o resto) */
  if (!f.ativa && nova) falta.push('a conta nova nasce ativa (inative depois de criada)');
  if (!f.ativa && !nova && !inativaDesdeValida(f.inativaDesde)) falta.push('desde quando a conta está inativa (dia 1º de um mês)');
  if (f.tipo === 'cartao') {
    if (f.diaFechamento.trim() && diaDoCampo(f.diaFechamento) == null) falta.push('o dia de fechamento (de 1 a 31)');
    if (f.diaVencimento.trim() && diaDoCampo(f.diaVencimento) == null) falta.push('o dia de vencimento (de 1 a 31)');
  }
  return falta;
}

/** CONTA-INATIVAR-DATA-01 — "Inativa desde" válida: ISO de um dia 1º. O DatePicker da casa leva qualquer dia escolhido ao 1º do mês. */
export const inativaDesdeValida = (v: string): boolean => /^\d{4}-(0[1-9]|1[0-2])-01$/.test(v.trim());
/** "01/02/2026" → o dia 1º do mês do dia escolhido (ISO); vazio = '' */
export const primeiroDoMes = (iso: string): string => (/^\d{4}-\d{2}/.test(iso) ? `${iso.slice(0, 7)}-01` : '');

/** O que muda o ponto de partida da Conciliacao (o aviso ambar e a Auditoria). */
export const mudaOSaldoInicial = (m: Record<string, unknown>): boolean => 'mes_inicio' in m || 'saldo_inicial_oficial' in m;

/** O subtitulo do cabecalho: "Itaú Personalite · 341 Itaú · ag. 5596 · c/c 03722-5". */
export function subtituloDaConta(c: ContaBancariaCadastro, bancos: readonly BancoReferencia[]): string {
  const partes = [nomeDaConta(c)];
  const b = celulaBanco(c, bancos);
  if (b.tom === 'normal') partes.push(b.texto);
  if (!ehCaixa(c)) {
    if (limpo(c.agencia)) partes.push(`ag. ${limpo(c.agencia)}`);
    const n = numeroDaConta(c);
    if (n) partes.push(`${faixaDaConta(c) === 'inv' ? 'conta' : 'c/c'} ${n}`);
  }
  return partes.join(' · ');
}

/* ─── larguras estreitas ───────────────────────────────────────────────────── */

export type ColunaOpcional = 'telefone' | 'inicio' | 'gerente' | 'agencia' | 'fazenda';

/**
 * As colunas que somem quando a lista estreita, na ordem do mock: primeiro Telefone e Início, depois Gerente e Agência, depois Fazenda.
 * Medido na LARGURA DA LISTA (o mock media a página inteira: 1180/980/820 menos os 24px de margem) — no app a lateral come o resto.
 */
export function colunasEscondidas(larguraDaLista: number): Set<ColunaOpcional> {
  const s = new Set<ColunaOpcional>();
  if (larguraDaLista < 1156) { s.add('telefone'); s.add('inicio'); }
  if (larguraDaLista < 956) { s.add('gerente'); s.add('agencia'); }
  if (larguraDaLista < 796) s.add('fazenda');
  return s;
}

/* ─── CONTA-INATIVAR-DATA-01 — a prévia do "Inativa desde" (`fn_conta_inativar_previa`) ─────────────────────────────────────────────── */

export interface PreviaInativar {
  pode: boolean; frase: string | null; desde: string; mesDoSaldo: string; saldo: number | null; temSaldo: boolean;
  abertos: number; realizados: number; extrato: number;
  lancamentos: Array<{ dia: string; valor: number; status: string | null; descricao: string | null }>;
}

const numeroOuNulo = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const inteiro = (v: unknown): number => Math.max(0, Math.trunc(Number(v) || 0));

/** O corpo da prévia → tipado; fora do contrato = nulo (a tela diz que não conseguiu conferir e trava o Salvar). */
export function lerPreviaInativar(v: unknown): PreviaInativar | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.pode !== 'boolean' || typeof o.desde !== 'string' || typeof o.mes_do_saldo !== 'string') return null;
  const lista = Array.isArray(o.lancamentos) ? o.lancamentos : [];
  return {
    pode: o.pode, frase: typeof o.frase === 'string' ? o.frase : null, desde: o.desde.slice(0, 10), mesDoSaldo: o.mes_do_saldo,
    saldo: numeroOuNulo(o.saldo), temSaldo: o.tem_saldo === true,
    abertos: inteiro(o.abertos), realizados: inteiro(o.realizados), extrato: inteiro(o.extrato),
    lancamentos: lista.flatMap((l) => {
      if (!l || typeof l !== 'object') return [];
      const x = l as Record<string, unknown>;
      return typeof x.dia === 'string' ? [{ dia: x.dia.slice(0, 10), valor: Number(x.valor) || 0, status: typeof x.status === 'string' ? x.status : null,
        descricao: typeof x.descricao === 'string' ? x.descricao : null }] : [];
    }),
  };
}

const mmaaaa = (anoMes: string) => `${anoMes.slice(5, 7)}/${anoMes.slice(0, 4)}`;
const ddmmaaaaIso = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** A linha da conferência ao lado do campo: confere ("saldo R$ 0,00 em 01/2026 · nada a partir de 01/02/2026") ou a recusa do banco. */
export function fraseDaPreviaInativar(p: PreviaInativar): string {
  if (!p.pode) return p.frase ?? 'Não dá para inativar nesta data. Nada foi gravado.';
  return `Confere: saldo ${brl(p.saldo ?? 0)} no fim de ${mmaaaa(p.mesDoSaldo)} · nenhum lançamento nem extrato a partir de ${ddmmaaaaIso(p.desde)}.`;
}

/** O `title` com a lista (mostra, não esconde): os lançamentos a partir da data, um por linha. */
export function listaDaPreviaInativar(p: PreviaInativar): string {
  if (p.lancamentos.length === 0) return fraseDaPreviaInativar(p);
  return [fraseDaPreviaInativar(p), ...p.lancamentos.map((l) => `${ddmmaaaaIso(l.dia)} · ${brl(l.valor)} · ${l.status ?? '—'} · ${l.descricao ?? '—'}`)].join('\n');
}

/* ─── CONTAS-BANCARIAS-LISTA-01 (mock aprovado 26/11, md5 7c4a8e62…) — a régua nova da lista ─────────────────────────────────────────── */

/** Sem dado no cadastro = "—" (nada inventado). */
export const SEM_DADO = '—';

/** A coluna Banco: o código (9 px cinza, largura fixa) + o nome curto; caixa físico e permuta em cinza; sem banco = "—". */
export function bancoNaLista(c: ContaBancariaCadastro, bancos: readonly BancoReferencia[]): { codigo: string; nome: string; cinza: boolean } {
  if (ehCaixa(c)) return { codigo: '', nome: 'Caixa físico', cinza: true };
  if (limpo(c.tipo_conta) === 'permuta') return { codigo: '', nome: 'Permuta', cinza: true };
  const b = limpo(c.banco);
  if (!b) return { codigo: '', nome: SEM_DADO, cinza: true };
  const ref = bancos.find(x => x.nome_curto === b);
  return { codigo: ref && ref.codigo_banco !== '000' ? ref.codigo_banco : '', nome: b, cinza: false };
}

/** A Agência (número tabular); sem dado ou caixa = "—". */
export function agenciaNaLista(c: ContaBancariaCadastro): string {
  return !ehCaixa(c) && limpo(c.agencia) ? limpo(c.agencia) : SEM_DADO;
}

/** A Conta: "25367-7"; o cartão mostra o final ("final 3146"); sem dado ou caixa = "—". */
export function contaNaLista(c: ContaBancariaCadastro): string {
  if (ehCaixa(c)) return SEM_DADO;
  const n = numeroDaConta(c);
  if (!n) return SEM_DADO;
  if (faixaDaConta(c) === 'cartao') return `final ${n.replace(/\D/g, '').slice(-4)}`;
  return n;
}

/** A Situação: "Ativa" · "Inativa desde 01/02/2026" (CONTA-INATIVAR-DATA-01) · "Inativa" (sem a data). */
export function situacaoNaLista(c: Pick<ContaBancariaCadastro, 'ativa' | 'inativa_desde'>): { texto: string; ativa: boolean } {
  if (c.ativa) return { texto: 'Ativa', ativa: true };
  const d = limpo(c.inativa_desde).slice(0, 10);
  return { texto: /^\d{4}-\d{2}-\d{2}$/.test(d) ? `Inativa desde ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : 'Inativa', ativa: false };
}

/** O rodapé fixo: "19 contas · 12 conta corrente · 4 investimento · 3 cartão"; com filtro, "mostrando 8 de 19 · …" (CONTAS-BANCARIAS-AJUSTES-01 a). */
export function rodapeDosTipos(mostradas: readonly ContaBancariaCadastro[], todas: readonly ContaBancariaCadastro[] = mostradas): string {
  const n = mostradas.length; const t = todas.length;
  const conta = (tipo: 'cc' | 'inv' | 'cartao') => mostradas.filter(c => faixaDaConta(c) === tipo).length;
  const inicio = n < t ? `mostrando ${n} de ${t}` : `${t} ${t === 1 ? 'conta' : 'contas'}`;
  return `${inicio} · ${conta('cc')} conta corrente · ${conta('inv')} investimento · ${conta('cartao')} cartão`;
}

/** As larguras FIXAS da lista (px) — o Nome fica com a sobra (corta com "…" e o nome inteiro no title). */
export const LARGURAS_DA_LISTA = { codigo: 42, banco: 130, agencia: 70, conta: 92, fazenda: 120, openFinance: 120, situacao: 120, editar: 30, nomeMinimo: 160 } as const;

/** Estreitando, some primeiro a Fazenda, depois a Agência e, no celular (~750), o Open Finance — o Nome nunca fica abaixo de 160 px.
 *  Medido na LARGURA DA LISTA. */
export function colunasDaListaEscondidas(larguraDaLista: number, comOpenFinance: boolean): Set<'fazenda' | 'agencia' | 'openFinance'> {
  const L = LARGURAS_DA_LISTA;
  const fixas = L.codigo + L.banco + L.agencia + L.conta + L.fazenda + L.situacao + L.editar + (comOpenFinance ? L.openFinance : 0);
  const s = new Set<'fazenda' | 'agencia' | 'openFinance'>();
  if (larguraDaLista < fixas + L.nomeMinimo) s.add('fazenda');
  if (larguraDaLista < fixas - L.fazenda + L.nomeMinimo) s.add('agencia');
  if (comOpenFinance && larguraDaLista < fixas - L.fazenda - L.agencia + L.nomeMinimo) s.add('openFinance');
  return s;
}
