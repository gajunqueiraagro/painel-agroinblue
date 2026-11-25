/**
 * CARTAO-FATURA-IMPORT-01 (mock aprovado 23/11 13:38, vista 1) — a prévia da fatura no painel da conta do cartão, em GRUPOS CLICÁVEIS,
 * cada linha com "o que o sistema vai fazer". PURO: lê o resultado do casamento (`linhasDaFatura`, a regra de 12/11: parcela k/N casa com a
 * parcela k/N, nunca vencimento ± dias) e só agrupa e escreve; nada grava.
 *   Já lançado neste cartão · Parcela k/N casa · Parcela com diferença · Lançado em outro cartão/conta (= mover) · Nova com sugestão ·
 *   Nova classificar · Anuidade, IOF, juros · Pagamento da fatura (= transferência, nunca saída).
 * A sugestão de classificação vem de fora (`sugestaoDe`, o histórico do mesmo estabelecimento): sem ela, "Nova · classificar".
 */
import type { LinhaDaFatura } from './lerFaturaOurocard';
import type { LancamentoNoCartao, LinhaDaPrevia, PreviaDaFatura } from './linhasDaFatura';

export type GrupoDaFatura = 'ja_lancado' | 'parcela_casa' | 'diferenca' | 'mover' | 'nova_sugestao' | 'nova_classificar' | 'encargos' | 'pagamento';
export const ORDEM_DOS_GRUPOS: readonly GrupoDaFatura[] = ['ja_lancado', 'parcela_casa', 'diferenca', 'mover', 'nova_sugestao', 'nova_classificar', 'encargos', 'pagamento'];
export const ROTULO_DO_GRUPO: Record<GrupoDaFatura, string> = {
  ja_lancado: 'Já lançado neste cartão', parcela_casa: 'Parcela k/N casa', diferenca: 'Parcela com diferença', mover: 'Lançado em outro cartão/conta',
  nova_sugestao: 'Nova · com sugestão', nova_classificar: 'Nova · classificar', encargos: 'Anuidade, IOF, juros', pagamento: 'Pagamento da fatura',
};
/** a cor do selo do grupo (verde = nada a fazer; âmbar = conferir; azul = lançar com sugestão; vermelho = falta o operador; cinza = fora da conta) */
export const COR_DO_GRUPO: Record<GrupoDaFatura, 'verde' | 'ambar' | 'azul' | 'vermelho' | 'cinza'> = {
  ja_lancado: 'verde', parcela_casa: 'verde', diferenca: 'ambar', mover: 'ambar', nova_sugestao: 'azul', nova_classificar: 'vermelho', encargos: 'cinza', pagamento: 'cinza',
};

/** o gesto que o "Gravar" faz com a linha (nada = já está certo; a transferência casa com o débito do banco, não cria saída) */
export type GestoDaLinha = 'nada' | 'lancar' | 'mover' | 'ajustar' | 'transferencia';
export interface Sugestao { planoContaId: string; rotulo: string; /** D1 (CARTAO-FATURA-GRAVAR): a fazenda da maioria dos mesmos casos */ fazendaId?: string | null }
export interface LinhaDoGrupo {
  grupo: GrupoDaFatura; linha: LinhaDaFatura; existente: LancamentoNoCartao | null; sugestao: Sugestao | null; contaSugerida: string; oQueFaz: string; gesto: GestoDaLinha;
}
export interface GruposDaFatura {
  linhas: LinhaDoGrupo[]; contagem: Record<GrupoDaFatura, number>;
  /** o rodapé do mock: "54 linhas: 7 casadas · 13 mover · 4 ajustar · 30 lançar" */
  rodape: string;
}

const ddmm = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const reais = (cent: number) => (cent / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ENCARGO = /\b(JUROS|ENCARGOS?|MULTA|IOF)\b/i;

function umaLinha(p: LinhaDaPrevia, contaDaFatura: string, nomeDaConta: (id: string) => string, sugestao: Sugestao | null, anuladas: ReadonlySet<number>,
  contaDosEncargos: Sugestao | null): LinhaDoGrupo {
  const { linha: l, existente: e } = p;
  const base = { linha: l, existente: e, sugestao: null, contaSugerida: '—' };
  if (p.decisao === 'transferencia') {
    if (l.tipo === 'pagamento') return { ...base, grupo: 'pagamento', oQueFaz: 'transferência · casa com o débito no banco', gesto: 'transferencia' };
    return { ...base, grupo: 'nova_classificar', oQueFaz: 'crédito na fatura (estorno) · escolher a conta da entrada', gesto: 'lancar' };
  }
  /* anuidade e o desconto dela se anulam SÓ quando a fatura traz os dois (o par); a anuidade sem desconto é cobrança: lança */
  if (p.decisao === 'anuidade_par') {
    if (anuladas.has(p.linha.ordem)) return { ...base, grupo: 'encargos', oQueFaz: 'anuidade e o desconto dela se anulam · nada a lançar', gesto: 'nada' };
    return { ...base, grupo: 'encargos', sugestao: sugestao ?? contaDosEncargos, contaSugerida: (sugestao ?? contaDosEncargos)?.rotulo ?? '—', oQueFaz: 'lançar', gesto: 'lancar' };
  }
  if (e && e.contaId !== contaDaFatura) {
    return { ...base, grupo: 'mover', oQueFaz: `está em ${nomeDaConta(e.contaId)} venc. ${ddmm(e.vencimento)} → mover para este cartão`, gesto: 'mover' };
  }
  if (p.decisao === 'ja_lancado') return { ...base, grupo: 'ja_lancado', oQueFaz: `casado com o lançamento de ${ddmm(e?.competencia ?? null)}`, gesto: 'nada' };
  if (p.decisao === 'parcela') {
    return { ...base, grupo: 'parcela_casa', oQueFaz: `casa com a parcela ${l.parcela?.k}/${l.parcela?.n} da compra`, gesto: 'nada' };
  }
  if (p.decisao === 'parcela_diferenca' || p.decisao === 'ja_lancado_diferenca') {
    const lancada = e ? `lançada com ${reais(e.valorCent)}` : '';
    const dif = p.diferencas.filter((d) => !d.startsWith('valor ')).join(' · ');
    return { ...base, grupo: 'diferenca', oQueFaz: [l.parcela ? `parcela ${l.parcela.k}/${l.parcela.n} ${lancada}` : lancada, dif].filter(Boolean).join(' · ') + ' · ajustar?', gesto: 'ajustar' };
  }
  /* sobra: lançar */
  if (l.tipo === 'iof' || ENCARGO.test(l.descricao)) {
    return { ...base, grupo: 'encargos', sugestao: sugestao ?? contaDosEncargos, contaSugerida: (sugestao ?? contaDosEncargos)?.rotulo ?? '—', oQueFaz: 'lançar', gesto: 'lancar' };
  }
  if (sugestao) return { ...base, grupo: 'nova_sugestao', sugestao, contaSugerida: sugestao.rotulo, oQueFaz: 'lançar · sugestão do mesmo estabelecimento (12 m)', gesto: 'lancar' };
  return { ...base, grupo: 'nova_classificar', oQueFaz: 'escolher a conta', gesto: 'lancar' };
}

export function gruposDaFatura(previa: PreviaDaFatura, o: {
  contaDaFatura: string; nomeDaConta: (id: string) => string; sugestaoDe: (l: LinhaDaFatura) => Sugestao | null;
  /** D5 (CARTAO-FATURA-GRAVAR): a conta dos encargos sem histórico ("Despesas Financeiras Administrativo" do plano; sem ela = classificar) */
  contaDosEncargos?: Sugestao | null;
}): GruposDaFatura {
  /* os pares anuidade × desconto (o mesmo valor com sinal trocado), um a um */
  const anuladas = new Set<number>();
  const anuidades = previa.linhas.filter((p) => p.linha.tipo === 'anuidade');
  for (const d of previa.linhas.filter((p) => p.linha.tipo === 'desconto_anuidade')) {
    const a = anuidades.find((x) => !anuladas.has(x.linha.ordem) && x.linha.valorCent === -d.linha.valorCent);
    if (a) { anuladas.add(a.linha.ordem); anuladas.add(d.linha.ordem); }
  }
  const linhas = previa.linhas.map((p) => umaLinha(p, o.contaDaFatura, o.nomeDaConta,
    p.decisao === 'lanca' || (p.decisao === 'anuidade_par' && !anuladas.has(p.linha.ordem)) ? o.sugestaoDe(p.linha) : null, anuladas, o.contaDosEncargos ?? null));
  const contagem: Record<GrupoDaFatura, number> = { ja_lancado: 0, parcela_casa: 0, diferenca: 0, mover: 0, nova_sugestao: 0, nova_classificar: 0, encargos: 0, pagamento: 0 };
  for (const x of linhas) contagem[x.grupo] += 1;
  const n = (g: GestoDaLinha) => linhas.filter((x) => x.gesto === g).length;
  const casadas = linhas.filter((x) => x.gesto === 'nada' || x.gesto === 'transferencia').length;
  return { linhas, contagem, rodape: `${linhas.length} linhas: ${casadas} casadas · ${n('mover')} mover · ${n('ajustar')} ajustar · ${n('lancar')} lançar` };
}
