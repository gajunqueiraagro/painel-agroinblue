/**
 * CONTAS-OF-LINHA-01 (mock aprovado, Gabriel 23/11 18:10) — o Open Finance NA LINHA da conta, em Contas bancárias. Puro: sem React e sem rede.
 *
 * A coluna "Open Finance" de cada conta tem 5 estados (iguais para todo cliente):
 *  · `conectado`   — a conta do sistema está ligada a uma conta do banco (`openfinance_contas_permitidas` ativa) e o item está bem;
 *                    "atualizado hh:mm" = a última leitura de saldo (`openfinance_saldos.lido_em`), sem leitura = só "Conectado";
 *  · `reconectar`  — ligada, mas o ÚLTIMO aviso do item pede o titular de novo (`item/error`, `item/login_error`, `item/waiting_user_input`,
 *                    `item/waiting_user_action`) depois do último aviso bom: o banco quer o consentimento de novo;
 *  · `link`        — não ligada, e há um link do titular VIVO para o cliente (`openfinance_convites`: não usado, não revogado, não vencido);
 *  · `conectar`    — não ligada, e a conta é de BANCO;
 *  · `nao_se_aplica` ("—") — caixa físico, permuta, virtual, "Dinheiro"/"Outros", "Pessoal" e cartão de bandeira sem banco: a MESMA regra
 *                    da coluna Banco (`celulaBanco`): banco é o que está em `bancos_referencia` com código ≠ 000.
 */
import { ehCaixa, type BancoReferencia, type ContaBancariaCadastro } from '@/lib/financeiro/contasBancarias';
import type { EventoDaFila } from '@/lib/openfinance/openfinanceTela';

export type EstadoNaLinha =
  | { tipo: 'conectado'; itemId: string; atualizadoEm: string | null }
  | { tipo: 'reconectar'; itemId: string }
  | { tipo: 'link'; ate: string }
  | { tipo: 'conectar' }
  | { tipo: 'nao_se_aplica' };

export interface ContaPermitida { item_id: string; conta_bancaria_id: string | null; final4: string | null; ativo: boolean }
export interface SaldoLido { conta_bancaria_id: string | null; lido_em: string }
export interface ConviteDoCliente { expira_em: string; usado_em: string | null; revogado_em: string | null }

/** o banco da conta (o `bancos_referencia` dela) quando ela é de BANCO; senão nulo */
export function bancoDaConta(c: Pick<ContaBancariaCadastro, 'tipo_conta' | 'banco'>, bancos: readonly BancoReferencia[]): BancoReferencia | null {
  if (ehCaixa(c)) return null;
  const b = (c.banco ?? '').trim();
  if (!b) return null;
  const ref = bancos.find(x => x.nome_curto === b);
  return ref && ref.codigo_banco !== '000' ? ref : null;
}

const AVISO_RUIM = new Set(['item/error', 'item/login_error', 'item/waiting_user_input', 'item/waiting_user_action']);
const AVISO_BOM = new Set(['item/created', 'item/updated', 'item/login_succeeded']);

/** o item pede o titular de novo? = o último aviso de estado do item (bom ou ruim) é ruim */
export function itemPedeOTitular(itemId: string, eventos: readonly EventoDaFila[]): boolean {
  let ultimo: EventoDaFila | null = null;
  for (const e of eventos) {
    if (e.item_id !== itemId || !(AVISO_RUIM.has(e.evento) || AVISO_BOM.has(e.evento))) continue;
    if (!ultimo || e.recebido_em > ultimo.recebido_em) ultimo = e;
  }
  return ultimo !== null && AVISO_RUIM.has(ultimo.evento);
}

/** o link do titular vivo do cliente (o de validade mais longa), ou nulo */
export function linkVivo(convites: readonly ConviteDoCliente[], agoraIso: string): string | null {
  let ate: string | null = null;
  for (const c of convites) {
    if (c.usado_em || c.revogado_em || c.expira_em <= agoraIso) continue;
    if (!ate || c.expira_em > ate) ate = c.expira_em;
  }
  return ate;
}

export function estadoNaLinha(
  conta: Pick<ContaBancariaCadastro, 'id' | 'tipo_conta' | 'banco'>,
  d: { bancos: readonly BancoReferencia[]; permitidas: readonly ContaPermitida[]; saldos: readonly SaldoLido[]; eventos: readonly EventoDaFila[];
    convites: readonly ConviteDoCliente[]; agoraIso: string },
): EstadoNaLinha {
  const ligada = d.permitidas.find(p => p.ativo && p.conta_bancaria_id === conta.id);
  if (ligada) {
    if (itemPedeOTitular(ligada.item_id, d.eventos)) return { tipo: 'reconectar', itemId: ligada.item_id };
    let lido: string | null = null;
    for (const s of d.saldos) if (s.conta_bancaria_id === conta.id && (!lido || s.lido_em > lido)) lido = s.lido_em;
    return { tipo: 'conectado', itemId: ligada.item_id, atualizadoEm: lido };
  }
  if (!bancoDaConta(conta, d.bancos)) return { tipo: 'nao_se_aplica' };
  const ate = linkVivo(d.convites, d.agoraIso);
  return ate ? { tipo: 'link', ate } : { tipo: 'conectar' };
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');
/** "07:40" — hoje; "22/11 07:40" — outro dia (hora local) */
export function horaDaLeitura(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso);
  const hora = `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
  const mesmoDia = d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth() && d.getDate() === agora.getDate();
  return mesmoDia ? hora : `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)} ${hora}`;
}

/** a forma CURTA da célula (cabe nos 132px): hoje "07:40"; outro dia "22/11" */
export function horaCurta(iso: string, agora: Date = new Date()): string {
  const longa = horaDaLeitura(iso, agora);
  return longa.length > 5 ? longa.slice(0, 5) : longa;
}

/** o texto da célula, CURTO (a coluna é fixa); o `title` leva a frase inteira, com dia e hora */
export function textoDoEstado(e: EstadoNaLinha, agora: Date = new Date()): { texto: string; titulo: string } {
  switch (e.tipo) {
    case 'conectado': return e.atualizadoEm
      ? { texto: `● Conectado · ${horaCurta(e.atualizadoEm, agora)}`, titulo: `Conectado pelo Open Finance · última leitura do banco ${horaDaLeitura(e.atualizadoEm, agora)}` }
      : { texto: '● Conectado', titulo: 'Conectado pelo Open Finance · ainda sem leitura do banco' };
    case 'reconectar': return { texto: '⚠ Reconectar', titulo: 'O banco pede o titular de novo (confirmação ou consentimento vencido): clique para confirmar' };
    case 'link': return { texto: `Link enviado · ${horaCurta(e.ate, agora)}`, titulo: `Link do titular enviado · vale até ${horaDaLeitura(e.ate, agora)}` };
    case 'conectar': return { texto: 'Conectar', titulo: 'Conectar esta conta pelo Open Finance (só leitura do extrato)' };
    default: return { texto: '—', titulo: 'Caixa físico, permuta, virtual ou conta sem banco: não há Open Finance' };
  }
}

/** os finais da conta (com e sem o dígito: o banco pode contar de um jeito ou de outro), para ela já vir marcada em "Escolher contas" */
export function finaisDaConta(c: Pick<ContaBancariaCadastro, 'numero_conta' | 'conta_digito'>): string[] {
  const so = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
  const com = `${so(c.numero_conta)}${so(c.conta_digito)}`;
  const sem = so(c.numero_conta);
  return [...new Set([com, sem].filter(x => x.length >= 4).map(x => x.slice(-4)))];
}
