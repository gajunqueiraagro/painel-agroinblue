/**
 * RECLASSIFICAR UM ITEM DA OC — OC-RECLASSIFICAR-ITEM-01 (27/09/2026, decisoes do Gabriel).
 *
 * A classificacao de um item da operacao comercial se corrige PELA OC — no Financeiro ela continua travada. Uma RPC
 * (`oc_reclassificar_item`) grava compromisso, partes vivas e titulos vivos na MESMA conta, numa transacao; valor,
 * datas, pagamento, conciliacao, liquidacao, rebanho e favorecido nao se tocam.
 * ⚠ O BANCO DECIDE TUDO, e o "o que vai acontecer" da tela e' a MESMA RPC com `p_simular` — o caminho da gravacao,
 *   desfeito. Neste arquivo so' mora apresentacao: o texto do DRE sai dos quatro fatos que a simulacao devolve
 *   (`compoe_dre` e `bloco_dre`, de e para), do valor e da direcao do item.
 */
import { supabase } from '@/integrations/supabase/client';
import { rotuloComponente } from '@/lib/oc/vincularLancamento';

export interface DreDaConta { compoe_dre: boolean | null; bloco_dre: string | null }

export interface ReclassificacaoFeita {
  ok: true;
  acao: 'simulado' | 'reclassificado';
  simulado: boolean;
  operacao_id: string;
  operacao_versao: number;
  compromisso_id: string;
  valor: number;
  direcao: string;
  conta: { de: { id: string | null; subcentro: string | null; macro_custo: string | null };
    para: { id: string; subcentro: string; macro_custo: string | null } };
  componente: { de: string | null; para: string | null; opcoes: string[] | null };
  dre: { de: DreDaConta; para: DreDaConta };
  partes: string[];
  titulos: { de: TituloResumo[]; para: TituloResumo[] };
}

export interface TituloResumo { id: string; fazenda_id: string | null; fazenda_nome: string | null; subcentro: string | null;
  compoe_dre: boolean | null; hash: string | null }

export interface ReclassificacaoSemMudanca {
  ok: true;
  acao: 'sem_mudanca';
  simulado: boolean;
  operacao_id: string;
  operacao_versao: number;
  compromisso_id: string;
}

export type RespostaReclassificacao = ReclassificacaoFeita | ReclassificacaoSemMudanca;

/* TYPE GUARD pela mesma razao do vincular: sem `strictNullChecks` o TS nao estreita pelo literal. */
export const ehReclassificacao = (r: RespostaReclassificacao | null): r is ReclassificacaoFeita =>
  !!r && (r.acao === 'simulado' || r.acao === 'reclassificado');

export interface ParametrosReclassificacao {
  compromissoId: string;
  planoContaId: string;
  componente: string | null;
  motivo: string | null;
  simular?: boolean;
}

export async function reclassificarItemOC(p: ParametrosReclassificacao): Promise<RespostaReclassificacao> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
  const { data, error } = await (supabase as any).rpc('oc_reclassificar_item', {
    p_compromisso_id: p.compromissoId,
    p_plano_conta_id: p.planoContaId,
    p_componente: p.componente,
    p_motivo: p.motivo,
    p_simular: p.simular ?? false,
  });
  if (error) throw error;
  return data;
}

/** O nome do bloco do DRE na lingua da tela — os de `financeiro_plano_contas.bloco_dre` (medido 27/09/2026). */
const ROTULO_BLOCO: Record<string, string> = {
  receita: 'Receitas', venda: 'Vendas', deducao: 'Deduções', reposicao: 'Reposição',
  custeio: 'Custeio', pos_colheita: 'Pós-colheita', variavel: 'Custo variável', fixo: 'Custo fixo',
  juros: 'Despesas financeiras', investimento: 'Investimento',
};

const ondeNoDre = (d: DreDaConta) =>
  (!d.compoe_dre ? 'fora do DRE' : d.bloco_dre ? (ROTULO_BLOCO[d.bloco_dre] ?? d.bloco_dre) : 'no DRE');

/**
 * ⚠ INVESTIMENTO COMPOE O DRE E NAO O RESULTADO: a grade o mostra depois do "= Resultado economico" — ele sai da
 *   CONTA, nao da tela (DRE-DESTAQUE-01). Mover um custo para investimento sobe o resultado; o contrario, derruba.
 */
const entraNoResultado = (d: DreDaConta) => !!d.compoe_dre && d.bloco_dre !== 'investimento';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * O EFEITO NO RESULTADO DO PERIODO, com sinal: saida que entra no resultado o derruba; entrada que entra o sobe.
 * Troca de linha dentro do resultado (de Custo fixo para Deducoes, por exemplo) nao o muda.
 */
export function efeitoNoResultado(s: Pick<ReclassificacaoFeita, 'dre' | 'valor' | 'direcao'>): number {
  const passo = Number(entraNoResultado(s.dre.para)) - Number(entraNoResultado(s.dre.de));
  const sinal = s.direcao === '1-Entradas' ? 1 : -1;
  return passo * sinal * Number(s.valor);
}

/**
 * A FRASE DO DRE — o exemplo do briefing: "Hoje fora do DRE → passa a entrar em Deduções: o resultado do período cai
 * R$ 6.000,00".
 */
export function fraseDoDre(s: Pick<ReclassificacaoFeita, 'dre' | 'valor' | 'direcao'>): string {
  const de = ondeNoDre(s.dre.de);
  const para = ondeNoDre(s.dre.para);
  const efeito = efeitoNoResultado(s);
  const resultado = efeito === 0 ? 'o resultado do período não muda'
    : `o resultado do período ${efeito < 0 ? 'cai' : 'sobe'} ${brl(Math.abs(efeito))}`;
  if (de === para) return `Continua ${s.dre.de.compoe_dre ? `em ${de}` : de}: ${resultado}`;
  if (!s.dre.de.compoe_dre) return `Hoje fora do DRE → passa a entrar em ${para}: ${resultado}`;
  if (!s.dre.para.compoe_dre) return `Hoje em ${de} → sai do DRE: ${resultado}`;
  return `Sai de ${de} e entra em ${para}: ${resultado}`;
}

export interface LinhaResumoReclassificacao { rotulo: string; valor: string; tom?: 'ambar' }

/** O "o que vai acontecer", lido da simulacao. Fazenda so' aparece se a conta nova a trocar (conta administrativa). */
export function resumoDaReclassificacao(s: ReclassificacaoFeita): LinhaResumoReclassificacao[] {
  const linhas: LinhaResumoReclassificacao[] = [
    { rotulo: 'Subcentro', valor: `${s.conta.de.subcentro ?? '—'} → ${s.conta.para.subcentro}`, tom: 'ambar' },
    s.componente.de === s.componente.para
      ? { rotulo: 'Componente', valor: `mantido · ${rotuloComponente(s.componente.de ?? '—')}` }
      : { rotulo: 'Componente', valor: `${rotuloComponente(s.componente.de ?? '—')} → ${rotuloComponente(s.componente.para ?? '—')}`, tom: 'ambar' },
    { rotulo: 'DRE', valor: fraseDoDre(s), tom: efeitoNoResultado(s) !== 0 ? 'ambar' : undefined },
  ];
  const fazDe = s.titulos.de.map(t => t.fazenda_nome ?? '—').join(', ');
  const fazPara = s.titulos.para.map(t => t.fazenda_nome ?? '—').join(', ');
  if (fazDe !== fazPara) linhas.push({ rotulo: 'Fazenda', valor: `${fazDe} → ${fazPara}`, tom: 'ambar' });
  linhas.push({ rotulo: 'Não muda', valor: `valor ${brl(Number(s.valor))}, datas, pagamento, conciliação e rebanho` });
  const n = s.titulos.de.length;
  linhas.push({ rotulo: 'Títulos', valor: n === 0 ? 'nenhum (item sem título)' : n === 1 ? '1 segue a conta nova' : `${n} seguem a conta nova` });
  return linhas;
}

export interface LinhaMapaOC { subcentro: string; natureza: string; componentes: string[] }

/** O mapa do vincular (`_oc_vinculo_mapa`), para saber ANTES de simular se a conta pede escolha de componente. */
export async function carregarMapaOC(): Promise<LinhaMapaOC[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
  const { data, error } = await (supabase as any).rpc('_oc_vinculo_mapa');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((m: { subcentro: unknown; natureza: unknown; componentes: unknown }) => ({
    subcentro: String(m.subcentro ?? ''),
    natureza: String(m.natureza ?? ''),
    componentes: Array.isArray(m.componentes) ? m.componentes.map(String) : [],
  }));
}

/**
 * AS OPCOES DE COMPONENTE DA CONTA NOVA — decisao 3, ESPELHO da regra da RPC para a tela saber o que perguntar.
 * Conta fora do mapa, ou de outra natureza que a do item: nenhuma (o componente fica). Um so': ele, sem pergunta.
 * ⚠ A RPC DECIDE DE NOVO: se o espelho divergir, a gravacao recusa com a frase dela, ao lado do botao.
 */
export function opcoesDeComponente(mapa: readonly LinhaMapaOC[], subcentro: string | null, natureza: string | null): string[] {
  if (!subcentro) return [];
  const m = mapa.find(x => x.subcentro === subcentro);
  if (!m || m.natureza !== natureza) return [];
  return m.componentes;
}
