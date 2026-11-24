/**
 * APROVAR-PAGAMENTOS-V3 (mock aprovado, Gabriel 24/11 11:41; D1 11:50) — as regras da tela PRÓPRIA do aprovador, sem React:
 *   · a linha vem pronta do banco (`fn_aprovacao_lista_v3`, 118600): a ABA, "posso decidir", o documento pedido e o PRONTO (um código só,
 *     o primeiro que falta: o pagamento antes do documento). A tela só traduz o código para UM texto humano (`textoDoPronto`) — nunca o
 *     código cru ("falta_boleto") — e a forma para a sigla (Bol · Pix · TED · DA);
 *   · os dias (a linha discreta do dia com o total), os contadores das abas e do filtro Todos · Prontos · Faltando;
 *   · a aba Pagamento: o CPF/CNPJ de quem recebe "confere" com o emitente da NF (ou, sem NF, com o do fornecedor);
 *   · DÉBITO AUTOMÁTICO (Gabriel 24/11 17:40): já autorizado no banco → "aprovado · DA" pela regra (não entra em Para aprovar nem no total),
 *     com o aviso de valor que variou mais de 20% do último pagamento ao mesmo fornecedor (só aviso).
 */
import { formatMoeda } from '@/lib/calculos/formatters';
import type { LinhaDeDocumento } from '@/lib/financeiro/notaDosDocumentos';

export type AbaV3 = 'aprovar' | 'aprovados' | 'recusados' | 'pagos';
export type FiltroV3 = 'todos' | 'prontos' | 'faltando';
export const ABAS_V3: readonly AbaV3[] = ['aprovar', 'aprovados', 'recusados', 'pagos'];
export const ROTULO_DA_ABA_V3: Record<AbaV3, string> = { aprovar: 'Para aprovar', aprovados: 'Aprovados', recusados: 'Recusados', pagos: 'Pagos' };

export interface PagamentoV3 {
  forma: string | null; chave: string | null; tipoChave: string | null; banco: string | null; agencia: string | null; conta: string | null;
  titular: string | null; docPagamento: string | null; docFornecedor: string | null; linhaDigitavel: string | null; beneficiario: string | null;
  beneficiarioDoc: string | null; boletoAnexado: boolean; emitenteNfDoc: string | null;
  /** o texto de pagamento gravado no próprio lançamento (`dados_pagamento`: a linha digitável digitada, a chave…) */
  dados: string | null;
}

export interface LinhaV3 {
  id: string; vencimento: string | null; status: string | null; aba: AbaV3 | null; fornecedor: string; favorecidoId: string | null;
  descricao: string; valor: number; forma: string | null; nf: string | null; conta: string | null; subcentro: string | null;
  financiamentoId: string | null; recorrenciaId: string | null; estado: string | null; motivo: string | null; possoDecidir: boolean;
  lancadoPor: string | null; lancadoEm: string | null; documentoPedido: string | null; pronto: string | null; pagamento: PagamentoV3;
  /** débito automático que a regra deu como aprovado (`comRegraDoDebitoAutomatico`): no banco segue "aguardando" */
  daPelaRegra: boolean;
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const ehAba = (v: unknown): v is AbaV3 => typeof v === 'string' && (ABAS_V3 as readonly string[]).includes(v);

function lerPagamento(v: unknown): PagamentoV3 {
  const o: Record<string, unknown> = v !== null && typeof v === 'object' ? { ...v } : {};
  return {
    forma: texto(o.forma), chave: texto(o.chave), tipoChave: texto(o.tipo_chave), banco: texto(o.banco), agencia: texto(o.agencia),
    conta: texto(o.conta), titular: texto(o.titular), docPagamento: texto(o.doc_pagamento), docFornecedor: texto(o.doc_fornecedor),
    linhaDigitavel: texto(o.linha_digitavel), beneficiario: texto(o.beneficiario), beneficiarioDoc: texto(o.beneficiario_doc),
    boletoAnexado: o.boleto_anexado === true, emitenteNfDoc: texto(o.emitente_nf_doc), dados: texto(o.dados),
  };
}

/** as linhas da `fn_aprovacao_lista_v3` (o que não é objeto com id fica de fora) */
export function lerLinhasV3(data: unknown): LinhaV3[] {
  if (!Array.isArray(data)) return [];
  const linhas: LinhaV3[] = [];
  for (const item of data) {
    if (item === null || typeof item !== 'object') continue;
    const r: Record<string, unknown> = { ...item };
    const id = texto(r.lancamento_id);
    if (!id) continue;
    linhas.push({
      id, vencimento: texto(r.vencimento), status: texto(r.status), aba: ehAba(r.aba) ? r.aba : null,
      fornecedor: texto(r.fornecedor) ?? '—', favorecidoId: texto(r.favorecido_id), descricao: texto(r.descricao) ?? '',
      valor: Math.abs(Number(r.valor) || 0), forma: texto(r.forma), nf: texto(r.nf), conta: texto(r.conta), subcentro: texto(r.subcentro),
      financiamentoId: texto(r.financiamento_id), recorrenciaId: texto(r.recorrencia_id), estado: texto(r.estado), motivo: texto(r.motivo),
      possoDecidir: r.posso_decidir === true, lancadoPor: texto(r.lancado_por), lancadoEm: texto(r.lancado_em),
      documentoPedido: texto(r.documento_pedido), pronto: texto(r.pronto), pagamento: lerPagamento(r.pagamento), daPelaRegra: false,
    });
  }
  return linhas;
}

/** O PRONTO em UM texto humano (o mock: "pronto ✓" ou o que falta). Código desconhecido = "—" (nunca o código cru). */
const TEXTO_DO_PRONTO: Record<string, string> = {
  pronto: 'pronto ✓', falta_boleto: 'falta boleto', falta_guia: 'falta guia', falta_chave: 'falta chave Pix',
  falta_dados_bancarios: 'falta dados bancários', falta_forma: 'falta forma', falta_outro: 'falta dados do pagamento',
  falta_nota: 'falta nota', falta_recibo: 'falta recibo', falta_holerite: 'falta holerite',
  /* D1 (Gabriel 12:48): seguro e impostos de veículos/máquinas aceitam a nota OU a guia (o código vem no lote 118670) */
  falta_nota_ou_guia: 'falta nota ou guia',
};
export function textoDoPronto(codigo: string | null): string {
  return codigo ? TEXTO_DO_PRONTO[codigo] ?? '—' : '—';
}
export const estaPronto = (codigo: string | null): boolean => codigo === 'pronto';
export const estaFaltando = (codigo: string | null): boolean => !!codigo && codigo.startsWith('falta');

/** A forma em sigla (o mock: Bol · Pix · TED · DA) + a cor do ponto; o nome inteiro vai no `title`. */
export interface SiglaDaForma { sigla: string; nome: string; cor: string }
export function siglaDaForma(forma: string | null): SiglaDaForma {
  const f = (forma ?? '').toLowerCase();
  if (!f) return { sigla: '—', nome: 'sem forma de pagamento', cor: 'transparent' };
  if (f.includes('boleto')) return { sigla: 'Bol', nome: 'Boleto', cor: '#d97706' };
  if (f.includes('pix')) return { sigla: 'Pix', nome: 'Pix', cor: '#0d9488' };
  /* "Debito Auto" (11 lançamentos no proto, 24/11) também é débito automático; "Débito em Conta" NÃO (decisão do Gabriel pendente) */
  if (f.includes('autom') || /d[eé]bito\s*auto/.test(f)) return { sigla: 'DA', nome: 'Débito automático', cor: '#7c3aed' };
  if (f.includes('transfer') || f === 'ted' || f === 'doc') return { sigla: 'TED', nome: 'Transferência (TED)', cor: '#2563eb' };
  if (f.includes('cart')) return { sigla: 'Cartão', nome: 'Cartão de crédito', cor: '#db2777' };
  if (f.includes('débito') || f.includes('debito')) return { sigla: 'Déb.', nome: 'Débito', cor: '#7c3aed' };
  if (f.includes('dinheiro')) return { sigla: 'Din.', nome: 'Dinheiro', cor: '#64748b' };
  return { sigla: 'Outro', nome: forma ?? 'Outro', cor: '#64748b' };
}

/**
 * DÉBITO AUTOMÁTICO = já autorizado no banco (Gabriel 24/11 17:40, todo cliente): o que vem em "Para aprovar" com a forma DA passa para
 * Aprovados como "aprovado · DA" — fora do total de Para aprovar e sem caixa. Só a TELA: no banco o estado segue "aguardando" até o lote
 * que leva a regra para lá (então a linha já vem na aba certa e isto não muda nada).
 */
export const ehDebitoAutomatico = (forma: string | null): boolean => siglaDaForma(forma).sigla === 'DA';
export function comRegraDoDebitoAutomatico(linhas: readonly LinhaV3[]): LinhaV3[] {
  return linhas.map((l) => {
    if (!ehDebitoAutomatico(l.forma)) return l;
    if (l.aba === 'aprovar') return { ...l, aba: 'aprovados', estado: 'aprovado_da', possoDecidir: false, daPelaRegra: true };
    /* com o lote no banco, o DA já vem aprovado pela regra (`aprovado_regra`): o mesmo selo "aprovado · DA" */
    if (l.aba === 'aprovados' && l.estado === 'aprovado_regra') return { ...l, daPelaRegra: true };
    return l;
  });
}

/** o último pagamento (realizado/conciliado) a cada fornecedor, da leitura em ordem de data decrescente: o 1º de cada um */
export interface UltimoPagamento { data: string; valor: number }
export function ultimosPorFornecedor(data: unknown): Map<string, UltimoPagamento> {
  const m = new Map<string, UltimoPagamento>();
  for (const x of Array.isArray(data) ? data : []) {
    if (x === null || typeof x !== 'object') continue;
    const r: Record<string, unknown> = { ...x };
    const f = texto(r.favorecido_id); const d = texto(r.data_pagamento);
    if (f && d && !m.has(f)) m.set(f, { data: d, valor: Math.abs(Number(r.valor) || 0) });
  }
  return m;
}

/** O aviso do DA: o valor variou MAIS de 20% do último pagamento ao mesmo fornecedor. Só aviso — não muda aba nem estado. */
export interface VariacaoDoDa { selo: string; texto: string; titulo: string }
export function variacaoDoDa(l: LinhaV3, ultimo: UltimoPagamento | undefined): VariacaoDoDa | null {
  if (!ehDebitoAutomatico(l.forma) || !ultimo || ultimo.valor <= 0) return null;
  const pct = ((l.valor - ultimo.valor) / ultimo.valor) * 100;
  if (Math.abs(pct) <= 20) return null;
  const r = Math.round(Math.abs(pct));
  const selo = `${pct > 0 ? '+' : '−'}${r}%`;
  const mesAnterior = (() => {
    if (!l.vencimento) return false;
    const a = Number(l.vencimento.slice(0, 4)) * 12 + Number(l.vencimento.slice(5, 7)) - 1;
    const b = Number(ultimo.data.slice(0, 4)) * 12 + Number(ultimo.data.slice(5, 7)) - 1;
    return a - b === 1;
  })();
  const quando = mesAnterior ? 'mês passado' : `em ${ultimo.data.slice(5, 7)}/${ultimo.data.slice(0, 4)}`;
  return {
    selo, texto: `${quando} ${formatMoeda(ultimo.valor)}`,
    titulo: `Débito automático: o valor variou ${selo} do último pagamento a este fornecedor (${formatMoeda(ultimo.valor)} em ${ddmmaaaa(ultimo.data)}). Só aviso.`,
  };
}

/** O nº da NF como no mock ("18.112"): só dígitos → sem zeros à esquerda e com ponto de milhar; o resto como veio. */
export function numeroDaNf(nf: string | null): string {
  if (!nf) return '—';
  const t = nf.trim();
  if (/^[\d.]+$/.test(t)) {
    const d = t.replace(/\D/g, '').replace(/^0+/, '');
    if (!d) return '—';
    return d.length <= 12 ? Number(d).toLocaleString('pt-BR') : d;
  }
  return t;
}

const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const ddmm = (iso: string | null): string => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
export const ddmmaaaa = (iso: string | null): string => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
export function diaDaSemana(iso: string): string {
  return SEMANA_CURTA[new Date(`${iso.slice(0, 10)}T12:00:00`).getDay()];
}

export interface DiaV3 { dia: string; rotulo: string; total: number; linhas: LinhaV3[] }
/** As linhas por dia de vencimento (a ordem do banco), com a linha do dia: "sex · 04/12 · 3 contas" e o total. */
export function porDiaV3(linhas: readonly LinhaV3[]): DiaV3[] {
  const dias: DiaV3[] = [];
  for (const l of linhas) {
    const dia = l.vencimento ?? '';
    let g = dias.length ? dias[dias.length - 1] : null;
    if (!g || g.dia !== dia) { g = { dia, rotulo: '', total: 0, linhas: [] }; dias.push(g); }
    g.linhas.push(l);
    g.total += l.valor;
  }
  for (const g of dias) {
    const n = g.linhas.length;
    g.rotulo = `${g.dia ? `${diaDaSemana(g.dia)} · ${ddmm(g.dia)}` : 'sem vencimento'} · ${n} ${n === 1 ? 'conta' : 'contas'}`;
  }
  return dias;
}

export interface ContagemV3 { n: number; total: number }
export function contarAbas(linhas: readonly LinhaV3[]): Record<AbaV3, ContagemV3> {
  const c: Record<AbaV3, ContagemV3> = { aprovar: { n: 0, total: 0 }, aprovados: { n: 0, total: 0 }, recusados: { n: 0, total: 0 }, pagos: { n: 0, total: 0 } };
  for (const l of linhas) if (l.aba) { c[l.aba].n += 1; c[l.aba].total += l.valor; }
  return c;
}
export function contarFiltro(linhas: readonly LinhaV3[]): Record<FiltroV3, number> {
  return { todos: linhas.length, prontos: linhas.filter((l) => estaPronto(l.pronto)).length, faltando: linhas.filter((l) => estaFaltando(l.pronto)).length };
}
export function filtrarV3(linhas: readonly LinhaV3[], aba: AbaV3, filtro: FiltroV3): LinhaV3[] {
  return linhas.filter((l) => l.aba === aba
    && (filtro === 'todos' || (filtro === 'prontos' ? estaPronto(l.pronto) : estaFaltando(l.pronto))));
}

/** "−R$ 1.234,56" (a saída sempre com o sinal, como no mock) */
export const saida = (v: number): string => `−${formatMoeda(Math.abs(v))}`;

const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
export type Conferencia = { tom: 'ok' | 'diferente' | 'sem'; texto: string };
/**
 * O "confere" da aba Pagamento: o CPF/CNPJ de quem RECEBE (o beneficiário do boleto, ou o de pagamento / do fornecedor no Pix e na TED)
 * contra o emitente da NF; sem NF, contra o do fornecedor. Só a raiz do CNPJ (8 dígitos) conta: a filial do mesmo grupo confere.
 */
export function conferirFavorecido(quemRecebe: string | null, p: PagamentoV3, nf: string | null): Conferencia {
  const a = digitos(quemRecebe);
  const contraNf = digitos(p.emitenteNfDoc);
  const b = contraNf || digitos(p.docFornecedor);
  if (!a || !b) return { tom: 'sem', texto: '—' };
  const igual = a.length === 14 && b.length === 14 ? a.slice(0, 8) === b.slice(0, 8) : a === b;
  const contra = contraNf ? `fornecedor da NF ${numeroDaNf(nf)}` : 'cadastro do fornecedor';
  return igual ? { tom: 'ok', texto: `confere ✓ igual ao ${contra}` } : { tom: 'diferente', texto: `diferente do ${contra}` };
}

/** CPF/CNPJ com máscara (só para mostrar) */
export function documentoComMascara(doc: string | null): string {
  const d = digitos(doc);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return doc ?? '—';
}

/** O mês do período: [1º dia, último dia] em ISO, e o rótulo "dezembro/2026" */
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function periodoDoMes(ano: number, mes0: number): { de: string; ate: string; rotulo: string } {
  const p = (n: number) => String(n).padStart(2, '0');
  const ult = new Date(ano, mes0 + 1, 0).getDate();
  return { de: `${ano}-${p(mes0 + 1)}-01`, ate: `${ano}-${p(mes0 + 1)}-${p(ult)}`, rotulo: `${MESES[mes0]}/${ano}` };
}

/** o rótulo da aba do documento no painel: "NF 18.112" (a nota com o nº), "Boleto", "Recibo"… */
const ROTULO_ESPECIE: Record<string, string> = { nf: 'NF', boleto: 'Boleto', recibo: 'Recibo', comprovante: 'Comprovante', outro: 'Doc.' };

export function rotuloDaAbaDoDocumento(l: LinhaDeDocumento): string {
  const r = ROTULO_ESPECIE[l.principal.especie] ?? 'Doc.';
  return l.principal.especie === 'nf' && l.principal.numero ? `${r} ${numeroDaNf(l.principal.numero)}` : r;
}

/** por que não decido esta (o banco é quem manda; isto só explica o botão apagado) */
export function motivoSemDecidir(l: LinhaV3): string {
  if (l.daPelaRegra) return 'Débito automático: já autorizado no banco (aprovado pela regra).';
  if (l.aba === 'pagos') return 'Já pago.';
  if (l.aba === 'aprovados') return 'Já aprovado.';
  if (l.aba === 'recusados') return 'Recusado.';
  return 'Quem lançou não aprova (ou você não é aprovador deste cliente).';
}
