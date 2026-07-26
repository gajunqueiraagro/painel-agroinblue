import type { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { CompraLotesApi } from '@/hooks/useCompraLotes';
import type { LoteRecebimento, EstadoRecebimento } from '@/hooks/useOperacaoRecebimento';
import type { DocumentoLista } from '@/hooks/useOperacaoDocumentos';
import type { ResumoLiquidacao } from '@/hooks/useOperacaoLiquidacao';

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

const REC_ESTADO_LABEL: Record<EstadoRecebimento, string> = {
  nao_iniciado: 'Não iniciado', parcial: 'Parcial', completo: 'Completo', excedente: 'Excedente',
};
const LIQ_ESTADO_LABEL: Record<string, string> = {
  nao_liquidada: 'Aberta', parcial: 'Parcial', quitada: 'Quitada', sem_caixa: 'Sem caixa', cancelada: 'Cancelada', excedente: 'Excedente',
};

const nOr = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR'));
const moneyOr = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : formatMoeda(v));
const kgOr = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('pt-BR')} kg`);

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</div>
      <div className="space-y-0.5 text-[10px] leading-tight">{children}</div>
    </div>
  );
}
function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: ReactNode; destaque?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <strong className={`truncate ${destaque ? 'text-primary' : ''}`}>{valor}</strong>
    </div>
  );
}

interface Props {
  // Compra (identidade)
  fornecedorNome: string;
  fazendaNome: string;
  situacaoLabel: string;
  ocId: string | null;
  statusComercial: string | null;
  // Negociação (fonte oficial — não recalcular)
  negociacaoTotais: CompraLotesApi['totais'] | null;
  // Recebimento (consolidação por helper puro)
  recebimentoLotes: LoteRecebimento[] | null;
  entregaEncerrada: boolean;
  // Documentos (consolidação por helper puro)
  documentos: DocumentoLista[] | null;
  // Financeiro (fonte oficial derivada nas views — não recalcular)
  financeiroResumo: ResumoLiquidacao | null;
  obrigacoesCount: number | null;
}

export function ResumoLateralOC({
  fornecedorNome, fazendaNome, situacaoLabel, ocId, statusComercial,
  negociacaoTotais, recebimentoLotes, entregaEncerrada, documentos, financeiroResumo, obrigacoesCount,
}: Props) {
  const rec = consolidarRecebimento(recebimentoLotes);
  const doc = consolidarDocumentos(documentos);

  return (
    <div className="bg-card rounded-md border shadow-sm p-2 space-y-1.5 self-start">
      <h3 className="text-[12px] font-semibold text-foreground leading-tight">Resumo da Operação</h3>
      <Separator />

      <Secao titulo="Compra">
        <Linha rotulo="Fornecedor" valor={fornecedorNome || '—'} />
        <Linha rotulo="Fazenda" valor={fazendaNome || '—'} />
        <Linha rotulo="Situação" valor={situacaoLabel || '—'} />
        <Linha rotulo="OC" valor={ocId ? `#${ocId.slice(0, 8)}` : '—'} />
        <Linha rotulo="Status" valor={statusComercial ?? '—'} />
      </Secao>
      <Separator />

      <Secao titulo="Negociação">
        <Linha rotulo="Lotes" valor={nOr(negociacaoTotais?.lotes)} />
        <Linha rotulo="Animais" valor={nOr(negociacaoTotais?.animais)} />
        <Linha rotulo="Peso total" valor={kgOr(negociacaoTotais?.pesoTotal)} />
        <Linha rotulo="Valor negociado" valor={moneyOr(negociacaoTotais?.valorNegociado)} destaque />
      </Secao>
      <Separator />

      <Secao titulo="Recebimento">
        <Linha rotulo="Negociado" valor={nOr(rec.negociado)} />
        <Linha rotulo="Recebido" valor={nOr(rec.recebido)} />
        <Linha rotulo="Diferença" valor={nOr(rec.diferenca)} />
        <Linha rotulo="Estado" valor={rec.estadoGeral ? REC_ESTADO_LABEL[rec.estadoGeral] : '—'} />
        {entregaEncerrada && <Linha rotulo="Entrega" valor="Encerrada" />}
      </Secao>
      <Separator />

      <Secao titulo="Documentos">
        <Linha rotulo="Documentos" valor={doc ? doc.total.toLocaleString('pt-BR') : '—'} />
        <Linha rotulo="Situação" valor={doc ? doc.situacao : '—'} />
        <Linha rotulo="Valor líquido" valor={moneyOr(doc?.valorLiquidoTotal)} />
      </Secao>
      <Separator />

      <Secao titulo="Financeiro">
        <Linha rotulo="Base" valor={moneyOr(financeiroResumo?.base)} />
        <Linha rotulo="Liquidado" valor={moneyOr(financeiroResumo?.totalLiquidadoValido)} />
        <Linha rotulo="Saldo" valor={moneyOr(financeiroResumo?.saldoOperacao)} destaque />
        <Linha rotulo="Estado" valor={financeiroResumo?.estadoLiquidacao ? (LIQ_ESTADO_LABEL[financeiroResumo.estadoLiquidacao] ?? financeiroResumo.estadoLiquidacao) : '—'} />
        <Linha rotulo="Títulos" valor={obrigacoesCount == null ? '—' : obrigacoesCount.toLocaleString('pt-BR')} />
      </Secao>
      <Separator />

      <Secao titulo="Auditoria">
        <div className="text-[10px] text-muted-foreground italic">Em desenvolvimento</div>
      </Secao>
    </div>
  );
}
