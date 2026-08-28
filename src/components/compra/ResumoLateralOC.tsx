import type { ReactNode } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { pesoMedioPorCabeca, valorPorKgNegociado, type CompraLotesApi } from '@/hooks/useCompraLotes';
import type { LoteRecebimento, EstadoRecebimento } from '@/hooks/useOperacaoRecebimento';
import type { DocumentoLista } from '@/hooks/useOperacaoDocumentos';
import type { ResumoLiquidacao, ObrigacaoLinha } from '@/hooks/useOperacaoLiquidacao';

// Resumo lateral OC (PR-RESUMO-LATERAL-01a). Painel PERMANENTE das 6 etapas, independente
//   da aba ativa. Espelho sintético das fontes OFICIAIS já montadas (uma única vez) em
//   LancamentosTab e repassadas pelo shell — NÃO recalcula Negociação/Financeiro (usa
//   totais/resumo derivados). Recebimento/Documentos: consolidação em helper puro abaixo,
//   sem hook/estado/query novos. Ausência nunca vira zero: fonte insegura → "—".

// ── helpers puros (fora do JSX) ──
export interface RecebimentoConsolidado {
  negociado: number | null; recebido: number | null; diferenca: number | null; estadoGeral: EstadoRecebimento | null;
}
export function consolidarRecebimento(lotes: LoteRecebimento[] | null | undefined): RecebimentoConsolidado {
  if (!lotes || lotes.length === 0) return { negociado: null, recebido: null, diferenca: null, estadoGeral: null };
  let recebido = 0, negociado = 0, recebidoOk = true, negociadoOk = true;
  for (const l of lotes) {
    if (Number.isFinite(l.qtdRecebida)) recebido += l.qtdRecebida; else recebidoOk = false;
    if (l.qtdNegociada != null && Number.isFinite(l.qtdNegociada)) negociado += l.qtdNegociada; else negociadoOk = false;
  }
  const recebidoFinal = recebidoOk ? recebido : null;
  const negociadoFinal = negociadoOk ? negociado : null;
  const diferenca = (recebidoFinal != null && negociadoFinal != null) ? recebidoFinal - negociadoFinal : null;
  // estado geral derivado EXCLUSIVAMENTE dos estados oficiais dos lotes (sem status novo).
  const estados = lotes.map(l => l.estado);
  const estadoGeral: EstadoRecebimento =
    estados.every(e => e === 'nao_iniciado') ? 'nao_iniciado'
    : estados.some(e => e === 'excedente') ? 'excedente'
    : estados.every(e => e === 'completo') ? 'completo'
    : 'parcial';
  return { negociado: negociadoFinal, recebido: recebidoFinal, diferenca, estadoGeral };
}

// Situação geral derivada EXCLUSIVAMENTE dos estados oficiais 'ativo'/'cancelado' (vw_oc_documentos);
//   sem status novo/persistido. Documentos não têm estado "concluído/parcial" — só ativo/cancelado.
export type SituacaoDocumentos = 'Sem documentos' | 'Ativos' | 'Cancelados' | 'Ativos + cancelados';
export interface DocumentosConsolidado {
  total: number; ativos: number; cancelados: number; valorLiquidoTotal: number | null; situacao: SituacaoDocumentos;
}
export function consolidarDocumentos(docs: DocumentoLista[] | null | undefined): DocumentosConsolidado | null {
  if (!docs) return null;
  const total = docs.length;
  const cancelados = docs.filter(d => d.cancelado).length;
  const ativos = total - cancelados;
  // Valor líquido só dos ATIVOS (cancelamento é lógico → sem efeito econômico). Sem ativos ou
  //   valor não-finito → null (ausência nunca vira zero).
  let soma = 0, ok = true;
  for (const d of docs) {
    if (d.cancelado) continue;
    if (Number.isFinite(d.valorLiquido)) soma += d.valorLiquido; else ok = false;
  }
  const situacao: SituacaoDocumentos =
    total === 0 ? 'Sem documentos'
    : cancelados === 0 ? 'Ativos'
    : ativos === 0 ? 'Cancelados'
    : 'Ativos + cancelados';
  return { total, ativos, cancelados, valorLiquidoTotal: (ativos > 0 && ok) ? soma : null, situacao };
}

const nOr = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR'));
const moneyOr = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : formatMoeda(v));
const kgOr = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('pt-BR')} kg`);

interface Props {
  tipoLabel: string | null;                             // 'compra' | 'venda' | 'abate' — fonte: liquidacaoApi.tipoOperacao
  dataLabel: string;                                    // Compra — data já disponível no shell (sem consulta)
  statusComercial: string | null;                       // Compra — fonte oficial status_comercial: 'programada'|'fechada'|'cancelada'
  fornecedorNome: string;
  fazendaNome: string;
  ocId: string | null;
  negociacaoTotais: CompraLotesApi['totais'] | null;    // fonte oficial — não recalcular
  recebimentoLotes: LoteRecebimento[] | null;           // consolidação por helper puro
  entregaEncerrada: boolean;
  documentos: DocumentoLista[] | null;                  // consolidação por helper puro
  financeiroResumo: ResumoLiquidacao | null;            // fonte oficial derivada nas views (legado; não mais exibido)
  obrigacoesCount: number | null;
  obrigacoes: ObrigacaoLinha[] | null;                  // PR-OC-FIN-VISAO-02 — split Principal × Obrigações por natureza
}

export function ResumoLateralOC({
  tipoLabel, dataLabel, statusComercial, fornecedorNome, fazendaNome, ocId,
  negociacaoTotais, recebimentoLotes, entregaEncerrada, documentos, obrigacoes,
}: Props) {
  const rec = consolidarRecebimento(recebimentoLotes);
  const doc = consolidarDocumentos(documentos);
  void statusComercial;   // "Programada" saiu do resumo: a Central ja tem a coluna Comercial.
  void ocId;

  const temNegociacao = !!negociacaoTotais && negociacaoTotais.lotes > 0;
  /* MESMA FONTE do rodape da aba Negociacao (`useCompraLotes`), nao uma segunda conta.
     Sem peso informado o valor por kg e' null e sai '—': dividir por zero nao vira
     numero, e inventar um aqui seria pior que nao dizer. */
  const pesoMedio = temNegociacao ? pesoMedioPorCabeca(negociacaoTotais!) : null;
  const valorKg = temNegociacao ? valorPorKgNegociado(negociacaoTotais!) : null;

  const recEstadoLabel =
    rec.estadoGeral == null || rec.estadoGeral === 'nao_iniciado' ? 'Não iniciado'
    : rec.estadoGeral === 'completo' ? (entregaEncerrada ? 'Completo · encerrado' : 'Completo')
    : rec.estadoGeral === 'excedente' ? 'Excedente'
    : 'Parcial';
  const recRealce =
    rec.estadoGeral === 'excedente' ? 'text-destructive'
    : rec.estadoGeral === 'parcial' ? 'text-amber-700 dark:text-amber-500'
    : undefined;

  /* FINANCEIRO — tres numeros, todos da MESMA fonte que ja chegava aqui
     (`obrigacoes`, de vw_oc_obrigacoes). Nenhuma consulta, nenhum calculo novo:
       Lançado   = obrigacao ATIVA que ja tem titulo (`tituloId`). Ter titulo E' ter
                   sido lancada; nao ha estado intermediario.
       Liquidado = `totalLiquidado`, campo da propria view.
       Saldo     = `saldoAberto`, campo da propria view — somado, nunca subtraido
                   aqui, para nao criar uma segunda definicao de saldo.
     ⚠ Cancelada nao entra em nenhum dos tres: cancelamento e' logico e sem efeito
     economico, criterio ja usado em `consolidarDocumentos`. */
  const obrAtivas = (obrigacoes ?? []).filter(o => !o.cancelada);
  const temFinanceiro = obrAtivas.length > 0;
  const finLancado = obrAtivas.filter(o => o.tituloId).reduce((a, o) => a + (o.valorNominal || 0), 0);
  const finLiquidado = obrAtivas.reduce((a, o) => a + (o.totalLiquidado || 0), 0);
  const finSaldo = obrAtivas.reduce((a, o) => a + (o.saldoAberto || 0), 0);

  return (
    <aside className="bg-card rounded-md border shadow-sm overflow-hidden self-start text-[10px]">
      {/* Faixa de titulo — mesma altura/fundo/tipografia do aside do LancamentoV2Dialog. */}
      <div className="h-8 shrink-0 border-b border-border bg-accent/40 flex items-center px-3 text-[11px] font-bold uppercase tracking-wide text-primary">
        Resumo da operação
      </div>
      <div className="pb-1">
        <BlocoHead titulo="Identificação" />
        <div className="px-3 space-y-0.5">
          <Linha rotulo="Tipo" valor={TIPO_LABEL[tipoLabel ?? ''] ?? null} />
          <Linha rotulo="Contraparte" valor={fornecedorNome || null} />
          <Linha rotulo="Data" valor={dataLabel || null} />
          <Linha rotulo="Fazenda" valor={fazendaNome || null} />
        </div>

        <BlocoHead titulo="Negociação" />
        <div className="px-3 space-y-0.5">
          {/* O QUE se comprou antes de QUANTO custou. */}
          <Linha rotulo="Animais" valor={temNegociacao ? `${nOr(negociacaoTotais!.animais)} cab` : null} />
          <Linha rotulo="Peso médio" valor={kgOr(pesoMedio)} />
          <Linha rotulo="Valor por kg" valor={moneyOr(valorKg)} />
          <Linha rotulo="Valor total" valor={temNegociacao ? moneyOr(negociacaoTotais!.valorNegociado) : null} valorClassName="text-primary" />
        </div>

        <BlocoHead titulo="Recebimento" />
        <div className="px-3 space-y-0.5">
          {/* ATENCAO DESTACA O VALOR, nao a linha: parcial e excedente sao estados
              que pedem o olho, mas o rotulo continua neutro como nos demais. */}
          <Linha rotulo="Situação" valor={recEstadoLabel} valorClassName={recRealce} />
          <Linha rotulo="Recebido" valor={rec.recebido == null ? null : `${nOr(rec.recebido)} / ${nOr(rec.negociado)} cab`} />
        </div>

        <BlocoHead titulo="Financeiro" />
        <div className="px-3 space-y-0.5">
          <Linha rotulo="Lançado" valor={temFinanceiro ? moneyOr(finLancado) : null} />
          <Linha rotulo="Liquidado" valor={temFinanceiro ? moneyOr(finLiquidado) : null} />
          <Linha rotulo="Saldo" valor={temFinanceiro ? moneyOr(finSaldo) : null}
            valorClassName={finSaldo > 0.005 ? 'text-amber-700 dark:text-amber-500' : undefined} />
        </div>

        <BlocoHead titulo="Documentos" />
        <div className="px-3 space-y-0.5">
          <Linha rotulo="Situação" valor={doc ? doc.situacao : null} />
        </div>
      </div>
    </aside>
  );
}

const TIPO_LABEL: Record<string, string> = { compra: 'Compra', venda: 'Venda', abate: 'Abate' };

/* Faixa de secao e par rotulo-valor — ESPELHO de `ResumoBlocoHead` / `ResumoRow` do
   LancamentoV2Dialog (a referencia que o Gabriel definiu). Copiados na aparencia, nao
   importados: aqueles sao internos daquele arquivo, e exporta-los para ca acoplaria os
   dois modais por um detalhe visual. Se um dia virarem componente compartilhado, este
   e' o segundo chamador. */
function BlocoHead({ titulo }: { titulo: string }) {
  return (
    <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 first:mt-0 mb-0.5">
      <span className="text-[9px] font-bold uppercase tracking-wide text-primary/90 leading-none">{titulo}</span>
    </div>
  );
}
function Linha({ rotulo, valor, valorClassName }: { rotulo: string; valor: string | null; valorClassName?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <span className={`font-medium text-right truncate ${valorClassName ?? ''}`}>{valor || '—'}</span>
    </div>
  );
}
