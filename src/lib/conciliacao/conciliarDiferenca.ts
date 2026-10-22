/**
 * CONC-SEM-TRAVA-01 (tela, mock aprovado pelo Gabriel em 22/10 07h32) — a regra pura do modal "Conciliar": valor diferente do previsto
 * nunca trava; a tela SIMULA (`fn_conc_simular_diferenca`) e oferece tres caminhos, cada um com o que faz e a previa. Quem decide o
 * que vale e' o banco (as opcoes vem dele); aqui so' se le a resposta, se escolhe a opcao ja' marcada (a que fecha exato) e se escrevem
 * o verbo do botao e a frase do rodape.
 */

export type Sentido = 'igual' | 'a_menos' | 'a_mais';
export type CodigoOpcao = 'ligar' | 'acrescentar_lancamento' | 'sobra_na_oc' | 'criar_diferenca'
  | 'juntar_extrato' | 'ligar_com_falta' | 'desconto_na_oc';

export interface SugestaoLancamento { id: string; descricao: string; data: string | null; valor: number; parcela: string | null; fechaExato: boolean }
export interface SugestaoExtrato { id: string; descricao: string; data: string | null; valor: number; fechaExato: boolean }

export interface OpcaoConciliar {
  codigo: CodigoOpcao;
  frase: string;
  sugestoesLancamento: SugestaoLancamento[];
  sugestoesExtrato: SugestaoExtrato[];
  /** a previa do banco, como veio (cada opcao tem a sua) */
  previa: Record<string, unknown>;
}

export interface SimulacaoConciliar {
  sentido: Sentido;
  frase: string;
  somaExtratos: number;
  somaLancamentos: number;
  /** + sobra do banco; - falta */
  diferenca: number;
  dataExtrato: string | null;
  temOc: boolean;
  opcoes: OpcaoConciliar[];
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(obj) : []);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Le a resposta de `fn_conc_simular_diferenca`. Recusa do banco (`ok:false`) vira `{ erro }` com a frase dele. */
export function lerSimulacao(raw: unknown): { sim: SimulacaoConciliar | null; erro: string | null } {
  const r = obj(raw);
  if (r.ok !== true) return { sim: null, erro: txt(r.mensagem) ?? 'O banco não conseguiu comparar estes itens.' };
  const sentido = (['igual', 'a_menos', 'a_mais'] as const).find(s => s === r.sentido) ?? 'igual';
  const opcoes: OpcaoConciliar[] = lista(r.opcoes).map(o => ({
    codigo: String(o.codigo) as CodigoOpcao,
    frase: txt(o.frase) ?? '',
    previa: obj(o.previa),
    sugestoesLancamento: lista(o.sugestoes).filter(s => s.lancamento_id).map(s => ({
      id: String(s.lancamento_id), descricao: txt(s.descricao) ?? '—', data: txt(s.data), valor: num(s.valor),
      parcela: txt(s.parcela), fechaExato: s.fecha_exato === true })),
    sugestoesExtrato: lista(o.sugestoes).filter(s => s.extrato_id).map(s => ({
      id: String(s.extrato_id), descricao: txt(s.descricao) ?? '—', data: txt(s.data), valor: num(s.valor), fechaExato: s.fecha_exato === true })),
  }));
  return {
    sim: { sentido, frase: txt(r.frase) ?? '', somaExtratos: num(r.soma_extratos), somaLancamentos: num(r.soma_lancamentos),
           diferenca: num(r.diferenca), dataExtrato: txt(r.data_extrato), temOc: lista(r.ocs).length > 0, opcoes },
    erro: null,
  };
}

/** A escolha do operador: a opcao e, na (a), o item escolhido da lista. */
export interface Escolha { codigo: CodigoOpcao | null; itemId: string | null }

/** O sistema ja' deixa marcada a opcao que fecha exato (a primeira sugestao com o selo); senao, nenhuma. Igual: "ligar". */
export function escolhaInicial(sim: SimulacaoConciliar | null): Escolha {
  if (!sim) return { codigo: null, itemId: null };
  if (sim.sentido === 'igual') return { codigo: 'ligar', itemId: null };
  for (const o of sim.opcoes) {
    const s = o.sugestoesLancamento.find(x => x.fechaExato) ?? o.sugestoesExtrato.find(x => x.fechaExato);
    if (s) return { codigo: o.codigo, itemId: s.id };
  }
  return { codigo: null, itemId: null };
}

export const brl = (v: number): string =>
  `R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** 'Venda 118 Vacas · Receb. 3/3' -> o rotulo curto da linha: "Receb. 3/3" quando houver parcela, senao a descricao */
export const rotuloLancamento = (descricao: string, parcela: string | null): string => (parcela ? `Receb. ${parcela}` : descricao);

export interface ItemLevado { id: string; descricao: string; parcela: string | null; valor: number }

/** O texto do botao, com o verbo exato do que vai acontecer. Sem opcao escolhida (ou faltando item), nulo: o botao fica apagado. */
export function verboDoBotao(sim: SimulacaoConciliar | null, e: Escolha): string | null {
  if (!sim || !e.codigo) return null;
  const op = sim.opcoes.find(o => o.codigo === e.codigo);
  switch (e.codigo) {
    case 'ligar': return 'Conciliar';
    case 'acrescentar_lancamento': {
      const s = op?.sugestoesLancamento.find(x => x.id === e.itemId);
      /* sem parcela, o valor (a descricao nao cabe no botao de largura fixa) */
      return s ? `Conciliar e ligar ${s.parcela ? `o Receb. ${s.parcela}` : `o lançamento de ${brl(s.valor)}`}` : null;
    }
    case 'juntar_extrato': {
      const s = op?.sugestoesExtrato.find(x => x.id === e.itemId);
      return s ? `Conciliar e juntar o movimento de ${brl(s.valor)}` : null;
    }
    case 'sobra_na_oc': return 'Conciliar e lançar na OC';
    case 'criar_diferenca': return 'Conciliar e criar a diferença';
    case 'ligar_com_falta': return `Conciliar e deixar ${brl(sim.diferenca)} em aberto`;
    case 'desconto_na_oc': return 'Conciliar e lançar o desconto na OC';
    default: return null;
  }
}

/** A frase do rodape: a conta que vai fechar ("Extrato R$ 375.000,00 = Receb. 1/3 + Receb. 3/3"). */
export function fraseDoRodape(sim: SimulacaoConciliar | null, e: Escolha, levados: readonly ItemLevado[]): string {
  if (!sim) return '';
  const nomes = levados.map(l => rotuloLancamento(l.descricao, l.parcela));
  const extrato = `Extrato ${brl(sim.somaExtratos)}`;
  const op = sim.opcoes.find(o => o.codigo === e.codigo);
  switch (e.codigo) {
    case 'ligar': return `${extrato} = ${nomes.join(' + ')}`;
    case 'acrescentar_lancamento': {
      const s = op?.sugestoesLancamento.find(x => x.id === e.itemId);
      return s ? `${extrato} = ${[...nomes, rotuloLancamento(s.descricao, s.parcela)].join(' + ')}` : 'Escolha o lançamento que falta.';
    }
    case 'juntar_extrato': {
      const s = op?.sugestoesExtrato.find(x => x.id === e.itemId);
      return s ? `Extratos ${brl(sim.somaExtratos)} + ${brl(s.valor)} = ${nomes.join(' + ')}` : 'Escolha o movimento do banco que falta.';
    }
    case 'sobra_na_oc': return `${extrato} = ${nomes.join(' + ')} + ${brl(sim.diferenca)} a mais na OC`;
    case 'criar_diferenca': return `${extrato} = ${nomes.join(' + ')} + diferença de ${brl(sim.diferenca)}`;
    case 'ligar_com_falta': return `${extrato} + ${brl(sim.diferenca)} em aberto = ${nomes.join(' + ')}`;
    case 'desconto_na_oc': return `${extrato} + desconto de ${brl(sim.diferenca)} na OC = ${nomes.join(' + ')}`;
    default: return 'Escolha o que fazer com a diferença.';
  }
}

/** O que vai para o banco: a (a) acrescenta o item e liga; as outras vao como estao. */
export function pedidoDeExecucao(e: Escolha, extratos: readonly string[], lancamentos: readonly string[]):
  { extratos: string[]; lancamentos: string[]; opcao: CodigoOpcao } | null {
  if (!e.codigo) return null;
  if (e.codigo === 'acrescentar_lancamento') return e.itemId ? { extratos: [...extratos], lancamentos: [...lancamentos, e.itemId], opcao: 'ligar' } : null;
  if (e.codigo === 'juntar_extrato') return e.itemId ? { extratos: [...extratos, e.itemId], lancamentos: [...lancamentos], opcao: 'ligar' } : null;
  return { extratos: [...extratos], lancamentos: [...lancamentos], opcao: e.codigo };
}
