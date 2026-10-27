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
  ordem_exibicao?: number | null;
  updated_at?: string | null;
  updated_by?: string | null;
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
    const alvo = [nomeDaConta(c), c.banco, ref?.nome_banco, ref?.codigo_banco, c.gerente_nome, c.codigo_conta].filter(Boolean).join(' ');
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

export function rodapeDaLista(contas: readonly ContaBancariaCadastro[]): { contas: number; ativas: number; saldo: number; texto: string } {
  const ativas = contas.filter(c => c.ativa).length;
  const saldo = Math.round(contas.reduce((s, c) => s + (saldoNumero(c.saldo_inicial_oficial) ?? 0), 0) * 100) / 100;
  const n = contas.length;
  return { contas: n, ativas, saldo, texto: `${n} ${n === 1 ? 'conta' : 'contas'} · ${ativas} ${ativas === 1 ? 'ativa' : 'ativas'}` };
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
  };
}

/** "03722-5" -> numero "03722" e digito "5"; sem hifen, tudo e' numero. */
export function separarContaDigito(v: string): { numero: string; digito: string } {
  const s = v.trim();
  const i = s.lastIndexOf('-');
  if (i <= 0 || i === s.length - 1) return { numero: s, digito: '' };
  return { numero: s.slice(0, i).trim(), digito: s.slice(i + 1).trim() };
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
export function faltasDoFormulario(f: FormularioConta, nova: boolean): string[] {
  const falta: string[] = [];
  if (!f.nome.trim()) falta.push('o nome da conta');
  if (!f.fazendaId) falta.push('a fazenda');
  if (nova || f.saldoEm || f.saldoInicial !== null) {
    if (!f.saldoEm) falta.push('a data do saldo');
    if (f.saldoInicial === null) falta.push('o saldo inicial');
  }
  return falta;
}

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
