/**
 * FOLHA-TELAS-03 — as REGRAS da aba "Folha do mês" (mock MDj3uBiVv1ez5SFtBP7hEn; contrato do PR C §B, 22/11): o leitor do jsonb de
 * `fn_folha_mes(cliente, 'AAAA-MM', 'mensal'|'13_1'|'13_2')` (sem cast: o que não é do tipo vira nulo), os rótulos e o "por que não confirma".
 * ⚠ NENHUM NÚMERO NASCE AQUI: previsto, recibo, diferença, situação, o que falta e os totais vêm prontos do banco; a tela só escreve o rótulo.
 * ⚠ "—" = dado ausente (o recibo que não chegou, o previsto que não existe); nunca zero.
 * ⚠ Arquivo PRÓPRIO (e não o `folhaTela.ts`, que o lançamento alcança em 17 telas fora da Folha — régua de fonte do gate).
 */
import { competenciaBR, dataBR, ehLinha, linhas, numOuNulo, txt, num, type Linha } from '@/lib/folha/folhaTela';
import type { TipoDaFolha } from '@/lib/folha/lerFolha';

/* o tipo é o MESMO do leitor do recibo (`lerFolha`): a folha lida e a folha do mês falam a mesma língua */
export type { TipoDaFolha };
export const TIPOS_DA_FOLHA: ReadonlyArray<{ valor: TipoDaFolha; rotulo: string }> = [
  { valor: 'mensal', rotulo: 'Mensal' }, { valor: '13_1', rotulo: '13º · 1ª parcela' }, { valor: '13_2', rotulo: '13º · 2ª parcela' },
];

export type SituacaoDaFolha = 'confere' | 'diferenca' | 'sem_recibo' | 'a_conferir' | 'sem_previsto' | 'criado_pelo_recibo';
const SITUACOES: readonly SituacaoDaFolha[] = ['confere', 'diferenca', 'sem_recibo', 'a_conferir', 'sem_previsto', 'criado_pelo_recibo'];
const situacaoDaFolha = (v: unknown): SituacaoDaFolha => SITUACOES.find(s => s === v) ?? 'a_conferir';

export interface LancamentoDaLinha { id: string; valor: number; status: string | null; vencimento: string | null; pagamento: string | null; conciliado: boolean; ligado: boolean }
export interface ReciboDaLinha { id: string; nome: string; bucket: string; storage_path: string | null; lancamento_id: string | null }
export interface LinhaDoMes {
  funcionario_id: string; nome: string; vinculo_a_confirmar: boolean;
  previsto: number | null; recibo: number | null; diferenca: number | null;
  recibos: ReciboDaLinha[]; lancamentos: LancamentoDaLinha[]; lancamento_status: string | null;
  situacao_folha: SituacaoDaFolha; falta: string[]; falta_frase: string | null;
}
export interface TotaisDoMes {
  pessoas: number; previsto: number | null; recibo: number | null; diferenca: number | null;
  confere: number; diferencas: number; sem_recibo: number; a_conferir: number; sem_previsto: number; criados_pelo_recibo: number; a_ligar: number;
}
export interface DocumentoDoMes { chegou: boolean; n: number | null; de: number | null; valor: number | null; vencimento: string | null }
export interface DocumentosDoMes { recibos: DocumentoDoMes; espelho: DocumentoDoMes; guia_inss: DocumentoDoMes; guia_fgts: DocumentoDoMes }
export interface LugarDoCalendario { chave: string; rotulo: string; origem: string | null; data: string | null; dias: number | null }
/** a folha gravada do mês (lote 118740): nula = nunca confirmada */
export interface FolhaGravada { id: string; situacao: string; confirmada_em: string | null }
export interface FolhaDoMes {
  competencia: string; tipo: TipoDaFolha; linhas: LinhaDoMes[]; totais: TotaisDoMes; documentos: DocumentosDoMes; calendario: LugarDoCalendario[];
  folha: FolhaGravada | null;
}
export const estaConfirmada = (f: Pick<FolhaDoMes, 'folha'> | null | undefined): boolean => f?.folha?.situacao === 'confirmada';

const bool = (v: unknown): boolean => v === true;
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const tipo = (v: unknown): TipoDaFolha => TIPOS_DA_FOLHA.find(t => t.valor === v)?.valor ?? 'mensal';
const documento = (v: unknown): DocumentoDoMes => {
  const d: Linha = ehLinha(v) ? v : {};
  return { chegou: bool(d.chegou), n: numOuNulo(d.n), de: numOuNulo(d.de), valor: numOuNulo(d.valor), vencimento: txt(d.vencimento) };
};

export function folhaDoMesDoBanco(v: unknown): FolhaDoMes | null {
  if (!ehLinha(v)) return null;
  const t: Linha = ehLinha(v.totais) ? v.totais : {};
  const d: Linha = ehLinha(v.documentos) ? v.documentos : {};
  return {
    competencia: txt(v.competencia) ?? '', tipo: tipo(v.tipo),
    linhas: linhas(v.linhas).map(l => ({
      funcionario_id: txt(l.funcionario_id) ?? '', nome: txt(l.nome) ?? '—', vinculo_a_confirmar: bool(l.vinculo_a_confirmar),
      previsto: numOuNulo(l.previsto), recibo: numOuNulo(l.recibo), diferenca: numOuNulo(l.diferenca),
      recibos: linhas(l.recibos).map(r => ({ id: txt(r.id) ?? '', nome: txt(r.nome) ?? 'recibo', bucket: txt(r.bucket) ?? 'folha-documentos',
        storage_path: txt(r.storage_path), lancamento_id: txt(r.lancamento_id) })),
      lancamentos: linhas(l.lancamentos).map(x => ({ id: txt(x.id) ?? '', valor: num(x.valor), status: txt(x.status), vencimento: txt(x.vencimento),
        pagamento: txt(x.pagamento), conciliado: bool(x.conciliado), ligado: bool(x.ligado) })),
      lancamento_status: txt(l.lancamento_status), situacao_folha: situacaoDaFolha(l.situacao_folha), falta: textos(l.falta), falta_frase: txt(l.falta_frase),
    })),
    totais: {
      pessoas: num(t.pessoas), previsto: numOuNulo(t.previsto), recibo: numOuNulo(t.recibo), diferenca: numOuNulo(t.diferenca),
      confere: num(t.confere), diferencas: num(t.diferencas), sem_recibo: num(t.sem_recibo), a_conferir: num(t.a_conferir),
      sem_previsto: num(t.sem_previsto), criados_pelo_recibo: num(t.criados_pelo_recibo), a_ligar: num(t.a_ligar),
    },
    documentos: { recibos: documento(d.recibos), espelho: documento(d.espelho), guia_inss: documento(d.guia_inss), guia_fgts: documento(d.guia_fgts) },
    calendario: linhas(v.calendario).map(c => ({ chave: txt(c.chave) ?? '', rotulo: txt(c.rotulo) ?? '', origem: txt(c.origem), data: txt(c.data), dias: numOuNulo(c.dias) })),
    folha: ehLinha(v.folha) && txt(v.folha.id) ? { id: txt(v.folha.id) ?? '', situacao: txt(v.folha.situacao) ?? 'prevista', confirmada_em: txt(v.folha.confirmada_em) } : null,
  };
}

/* ── rótulos ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export type TomDaSituacao = 'verde' | 'ambar' | 'cinza' | 'azul';
/** a palavra da tela (o mock: "Pago e conferido", "Recibo difere", "Falta recibo", "Previsto") e o tom do ponto */
export function situacaoDaLinha(l: Pick<LinhaDoMes, 'situacao_folha' | 'lancamentos'>): { texto: string; tom: TomDaSituacao } {
  const pago = l.lancamentos.length > 0 && l.lancamentos.every(x => x.status === 'realizado');
  switch (l.situacao_folha) {
    case 'confere': return pago ? { texto: 'Pago e conferido', tom: 'verde' } : { texto: 'Confere · a pagar', tom: 'azul' };
    case 'criado_pelo_recibo': return { texto: 'Criado pelo recibo', tom: 'azul' };
    case 'diferenca': return { texto: 'Recibo difere', tom: 'ambar' };
    case 'sem_recibo': return { texto: 'Falta recibo', tom: 'ambar' };
    case 'a_conferir': return { texto: 'A conferir', tom: 'ambar' };
    default: return { texto: 'Sem previsto', tom: 'cinza' };
  }
}
/** "Pago em": a data do último pagamento quando TODOS os lançamentos da pessoa estão pagos; senão nulo ("—") */
export function pagoEm(l: Pick<LinhaDoMes, 'lancamentos'>): string | null {
  if (l.lancamentos.length === 0 || l.lancamentos.some(x => x.status !== 'realizado' || !x.pagamento)) return null;
  return l.lancamentos.reduce<string | null>((m, x) => (x.pagamento && (!m || x.pagamento > m) ? x.pagamento : m), null);
}

/** a linha de cima da tabela: a competência e o prazo do pagamento (do calendário do banco; sem data = só a regra) */
export function fraseDoTipo(f: Pick<FolhaDoMes, 'competencia' | 'tipo' | 'calendario'>): string {
  const lugar = (chave: string) => f.calendario.find(c => c.chave === chave) ?? null;
  const ate = (c: LugarDoCalendario | null) => (c?.data ? ` · pagar até ${dataBR(c.data)}` : '');
  if (f.tipo === '13_1') return `13º salário · 1ª parcela${ate(lugar('decimo_terceiro'))} · metade do salário, sem desconto`;
  if (f.tipo === '13_2') return `13º salário · 2ª parcela${ate(lugar('decimo_terceiro'))} · desconta a 1ª e o INSS`;
  return `Competência ${competenciaBR(f.competencia)}${ate(lugar('salario'))} (5º dia útil)`;
}

/** os 4 lugares da faixa de documentos, SEMPRE presentes e na mesma ordem (UI-LARGURA-FIXA-01) */
export function lugaresDosDocumentos(f: Pick<FolhaDoMes, 'documentos' | 'tipo'>): Array<{ chave: keyof DocumentosDoMes; rotulo: string; chegou: boolean; detalhe: string }> {
  const d = f.documentos;
  const r = d.recibos;
  return [
    { chave: 'espelho', rotulo: 'Espelho da folha', chegou: d.espelho.chegou, detalhe: d.espelho.chegou ? 'chegou' : 'não chegou' },
    { chave: 'recibos', rotulo: 'Recibos', chegou: r.chegou, detalhe: r.chegou ? `${(r.n ?? 0).toLocaleString('pt-BR')} de ${(r.de ?? 0).toLocaleString('pt-BR')}` : 'não chegou' },
    { chave: 'guia_fgts', rotulo: 'Guia FGTS', chegou: d.guia_fgts.chegou, detalhe: d.guia_fgts.chegou ? 'chegou' : 'não chegou' },
    { chave: 'guia_inss', rotulo: 'Guia INSS', chegou: d.guia_inss.chegou, detalhe: d.guia_inss.chegou ? 'chegou' : 'não chegou' },
  ];
}

/** FOLHA-REGUA-01: o "O que falta" na TABELA em palavra curta, que cabe na coluna (160px) sem "…"; a frase inteira do banco (`falta_frase`)
 *  vai no `title`. O 'ligar' não entra: é o botão "ligar" da célula. Código que o banco ainda não tinha sai como veio. */
const FALTA_CURTA: Record<string, string> = { lancamento: 'previsto', recibo: 'recibo', pagamento: 'pagar', vinculo: 'vínculo' };
export const faltaCurta = (falta: readonly string[]): string =>
  falta.filter(c => c !== 'ligar').map(c => FALTA_CURTA[c] ?? c).join(' · ');

/** o que falta e TRAVA o confirmar — a mesma lista do `fn_folha_mes_confirmar` (118740); o PAGAMENTO não trava: a folha se confirma antes de pagar */
export const FALTA_QUE_TRAVA: readonly string[] = ['lancamento', 'ligar', 'recibo', 'vinculo'];

/**
 * "Confirmar folha" só libera quando TUDO bate: ninguém fora de "confere"/"criado pelo recibo" e nada do que trava no "o que falta".
 * A frase é a fonte única do `disabled`, do `title` e da dica ao lado do botão (o botão apagado diz por quê). A recusa final é do banco.
 */
export function motivoParaNaoConfirmar(f: FolhaDoMes | null): string | null {
  if (!f) return 'Carregando a folha do mês.';
  if (estaConfirmada(f)) return `Folha confirmada${f.folha?.confirmada_em ? ` em ${dataBR(f.folha.confirmada_em.slice(0, 10))}` : ''}.`;
  if (f.linhas.length === 0) return 'Ninguém nesta folha.';
  const t = f.totais;
  const partes = [
    t.sem_recibo ? `${t.sem_recibo} sem recibo` : null, t.diferencas ? `${t.diferencas} com diferença` : null,
    t.a_conferir ? `${t.a_conferir} a conferir` : null, t.sem_previsto ? `${t.sem_previsto} sem previsto` : null,
  ].filter((p): p is string => p !== null);
  if (partes.length) return `Falta: ${partes.join(' · ')}.`;
  const comFalta = f.linhas.filter(l => l.falta.some(c => FALTA_QUE_TRAVA.includes(c))).length;
  if (comFalta) return `${comFalta} ${comFalta === 1 ? 'pessoa ainda tem' : 'pessoas ainda têm'} o que fazer (ver "O que falta").`;
  return null;
}

/** 'AAAA-MM' de um ano e mês (1–12) */
export const competenciaDe = (ano: number, mes: number): string => `${ano}-${String(mes).padStart(2, '0')}`;
