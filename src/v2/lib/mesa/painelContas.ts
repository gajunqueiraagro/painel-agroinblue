/**
 * O PAINEL POR CONTA do Enriquecer v2 — PR-CONC-ENRIQUECER-V2-01, quadro 1 do mock.
 *
 * ⚠ NENHUMA CONTA NOVA DE NEGÓCIO: cada linha da planilha cai num BALDE pelos predicados que a aba já usa —
 *   `grupoDaLinha` (os cards de hoje) e `elegivelParaLote` (o "Gravar N" de hoje, que passou a morar aqui para ser
 *   UMA regra nos dois lugares). O que este módulo acrescenta é só a PARTIÇÃO: cada linha conta em UM balde, para a
 *   barra de andamento fechar 100% e o Total ser a soma das contas.
 * ⚠ A PARTIÇÃO, NESTA ORDEM (a primeira que casa decide):
 *     gravada  — já aplicada pela Mesa, OU o lançamento já é o da planilha (ja_classificado/ja_aplicado fora do lote);
 *     pronta   — entra no "Gravar N" (`elegivelParaLote`);
 *     decide   — grupos "você decide" e "agrupam" ainda não decididos;
 *     semBanco — grupo "sem par" (sem lançamento no banco para casar);
 *     outras   — status desconhecido (fica cinza na barra; nunca some do Linhas).
 *   Os cards antigos contavam `resolvido_*` não gravado em "Já gravadas" E no lote ao mesmo tempo; aqui ele é pronta.
 */
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';
import { contaDaLinhaStaging, grupoDaLinha, parteDeAgrupamento } from '@/v2/lib/mesa/enriquecimentoView';

/** Os status que o "Gravar N" leva — `ja_classificado` só com "sobrescrever" marcado. */
export const STATUS_DO_LOTE: ReadonlySet<string> = new Set(['exato', 'divergente', 'ambiguo_resolvido', 'resolvido_manual', 'resolvido_grupo']);

/**
 * A linha entra no "Gravar N"?
 * ⚠ PARTE DE AGRUPAMENTO NÃO (133i item 11): o `apply_row` a escreveria por cima do consolidado — foi assim que o DARF de
 *   25.590,80 recebeu duas classificações.
 */
export function elegivelParaLote(r: ClassificacaoStagingPreviewRow, sobrescrever = false): boolean {
  if (r.aplicado) return false;
  if (parteDeAgrupamento(r)) return false;
  const status: string = r.match_status;
  return STATUS_DO_LOTE.has(status) || (status === 'ja_classificado' && sobrescrever);
}

export type BaldePainel = 'gravada' | 'pronta' | 'decide' | 'semBanco' | 'outras';

export function baldeDaLinha(r: ClassificacaoStagingPreviewRow, sobrescrever = false): BaldePainel {
  if (r.aplicado) return 'gravada';
  if (elegivelParaLote(r, sobrescrever)) return 'pronta';
  const g = grupoDaLinha(r.match_status, r.aplicado);
  if (g === 'decide' || g === 'agrupam') return 'decide';
  if (g === 'sem_par') return 'semBanco';
  if (g === 'ja_gravadas') return 'gravada';
  return 'outras';
}

export interface LinhaPainelConta {
  contaId: string;
  nome: string;
  linhas: number;
  gravadas: number;
  prontas: number;
  decide: number;
  semBanco: number;
  outras: number;
  /** Lançamentos realizados da conta no mês que nenhuma linha da planilha explica (`fn_classificacao_sistema_nao_explicado`). */
  foraPlanilha: number;
  valorGravadas: number;
  valorProntas: number;
  valorSemBanco: number;
  /** O que o botão "Revisar N" abre: prontas + decide. */
  revisar: number;
  /** Nada a fazer: tudo gravado (ou já do sistema) e sem pendência. */
  concluida: boolean;
  /** A conta não tem extrato (OFX) importado no mês — `null` = ainda não se sabe. */
  faltaOfx: boolean | null;
}

const valorDe = (r: ClassificacaoStagingPreviewRow) => Math.abs(Number(r.excel_valor) || 0);

export function montarPainelContas(
  staging: readonly ClassificacaoStagingPreviewRow[],
  opts: {
    foraPlanilhaPorConta?: ReadonlyMap<string, number>;
    /** As contas COM extrato no mês; `undefined` = ainda carregando (o selo não aparece). */
    contasComOfx?: ReadonlySet<string>;
    sobrescreverIds?: ReadonlySet<string>;
  } = {},
): LinhaPainelConta[] {
  const porConta = new Map<string, LinhaPainelConta>();
  for (const r of staging) {
    const { id, nome } = contaDaLinhaStaging(r);
    let c = porConta.get(id);
    if (!c) {
      c = { contaId: id, nome, linhas: 0, gravadas: 0, prontas: 0, decide: 0, semBanco: 0, outras: 0, foraPlanilha: 0,
        valorGravadas: 0, valorProntas: 0, valorSemBanco: 0, revisar: 0, concluida: false, faltaOfx: null };
      porConta.set(id, c);
    }
    c.linhas += 1;
    const b = baldeDaLinha(r, opts.sobrescreverIds?.has(r.staging_id) ?? false);
    if (b === 'gravada') { c.gravadas += 1; c.valorGravadas += valorDe(r); }
    else if (b === 'pronta') { c.prontas += 1; c.valorProntas += valorDe(r); }
    else if (b === 'decide') c.decide += 1;
    else if (b === 'semBanco') { c.semBanco += 1; c.valorSemBanco += valorDe(r); }
    else c.outras += 1;
  }
  for (const c of porConta.values()) {
    c.foraPlanilha = opts.foraPlanilhaPorConta?.get(c.contaId) ?? 0;
    c.revisar = c.prontas + c.decide;
    c.concluida = c.linhas > 0 && c.prontas === 0 && c.decide === 0 && c.semBanco === 0 && c.outras === 0;
    c.faltaOfx = opts.contasComOfx === undefined || c.contaId === '__sem__' ? null : !opts.contasComOfx.has(c.contaId);
  }
  return [...porConta.values()].sort((a, b) => b.linhas - a.linhas || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export type TotalPainel = Omit<LinhaPainelConta, 'contaId' | 'nome' | 'concluida' | 'faltaOfx'> & { contas: number };

/** O Total é a SOMA das linhas da tabela — nunca um segundo cálculo sobre o staging. */
export function totalPainel(linhas: readonly LinhaPainelConta[]): TotalPainel {
  const t: TotalPainel = { contas: linhas.length, linhas: 0, gravadas: 0, prontas: 0, decide: 0, semBanco: 0, outras: 0,
    foraPlanilha: 0, valorGravadas: 0, valorProntas: 0, valorSemBanco: 0, revisar: 0 };
  for (const l of linhas) {
    t.linhas += l.linhas; t.gravadas += l.gravadas; t.prontas += l.prontas; t.decide += l.decide; t.semBanco += l.semBanco;
    t.outras += l.outras; t.foraPlanilha += l.foraPlanilha; t.valorGravadas += l.valorGravadas;
    t.valorProntas += l.valorProntas; t.valorSemBanco += l.valorSemBanco; t.revisar += l.revisar;
  }
  return t;
}

/** "Com pendência" / "Concluídas" — o filtro da barra. */
export type FiltroPainel = 'todas' | 'pendentes' | 'concluidas';
export function filtrarPainel(linhas: readonly LinhaPainelConta[], f: FiltroPainel): LinhaPainelConta[] {
  if (f === 'pendentes') return linhas.filter((l) => !l.concluida);
  if (f === 'concluidas') return linhas.filter((l) => l.concluida);
  return [...linhas];
}
