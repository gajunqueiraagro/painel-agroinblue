import type { ReactNode } from 'react';
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

const nOr = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR'));
const moneyOr = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : formatMoeda(v));
const kgOr = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('pt-BR')} kg`);

// Indicador-sentinela por etapa — dot CSS (SEM emoji) usando tokens do design system, mapeando
//   ESTADOS JÁ EXISTENTES (nenhum status novo): success · warning · destructive · muted.
type Sinal = 'ok' | 'atencao' | 'divergencia' | 'neutro';
const DOT_CLASS: Record<Sinal, string> = {
  ok: 'bg-success', atencao: 'bg-warning', divergencia: 'bg-destructive', neutro: 'bg-muted-foreground/40',
};

// aria-label = estado textual da etapa (acessibilidade); passado explicitamente por seção.
function Secao({ sinal, estadoLabel, titulo, children }: { sinal: Sinal; estadoLabel: string; titulo: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-foreground/80 leading-tight">
        <span role="img" aria-label={estadoLabel} className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[sinal]}`} />
        {titulo}
      </div>
      <div className="pl-[14px] text-[11px] leading-tight text-foreground">{children}</div>
    </div>
  );
}

interface Props {
  dataLabel: string;                                    // Compra — data já disponível no shell (sem consulta)
  statusComercial: string | null;                       // Compra — fonte oficial status_comercial: 'programada'|'fechada'|'cancelada'
  fornecedorNome: string;
  fazendaNome: string;
  ocId: string | null;
  negociacaoTotais: CompraLotesApi['totais'] | null;    // fonte oficial — não recalcular
  recebimentoLotes: LoteRecebimento[] | null;           // consolidação por helper puro
  entregaEncerrada: boolean;
  documentos: DocumentoLista[] | null;                  // consolidação por helper puro
  financeiroResumo: ResumoLiquidacao | null;            // fonte oficial derivada nas views
  obrigacoesCount: number | null;
}

export function ResumoLateralOC({
  dataLabel, statusComercial, fornecedorNome, fazendaNome, ocId,
  negociacaoTotais, recebimentoLotes, entregaEncerrada, documentos, financeiroResumo, obrigacoesCount,
}: Props) {
  const rec = consolidarRecebimento(recebimentoLotes);
  const doc = consolidarDocumentos(documentos);

  // Sinais visuais derivados EXCLUSIVAMENTE de estados oficiais já existentes (nenhuma inferência nova).
  // Compra — status_comercial: fechada(=realizada)→success · cancelada→destructive · programada/ausente→muted.
  //   Fornecedor/fazenda/data/identidade NÃO determinam success.
  const compraSinal: Sinal =
    statusComercial === 'fechada' ? 'ok'
    : statusComercial === 'cancelada' ? 'divergencia'
    : 'neutro';
  const compraEstadoLabel =
    statusComercial === 'fechada' ? 'Realizada'
    : statusComercial === 'cancelada' ? 'Cancelada'
    : statusComercial === 'programada' ? 'Programada'
    : '—';
  const negSinal: Sinal = negociacaoTotais && negociacaoTotais.lotes > 0 ? 'ok' : 'neutro';
  const recSinal: Sinal =
    rec.estadoGeral == null || rec.estadoGeral === 'nao_iniciado' ? 'neutro'
    : rec.estadoGeral === 'completo' ? 'ok'
    : rec.estadoGeral === 'excedente' ? 'divergencia'
    : 'atencao';                                         // parcial (encerrado-com-diferença NÃO é estado distinto na fonte → recai em parcial)
  const recEstadoLabel =
    rec.estadoGeral == null || rec.estadoGeral === 'nao_iniciado' ? 'Não iniciado'
    : rec.estadoGeral === 'completo' ? 'Completo'
    : rec.estadoGeral === 'excedente' ? 'Excedente'
    : 'Parcial';
  // Documentos — possuir documento(s)=success; muted quando vazio. Cancelamento é informação
  //   textual, não pendência (vw_oc_documentos só distingue ativo/cancelado; sem estado de pendência ativa).
  const docSinal: Sinal = !doc || doc.total === 0 ? 'neutro' : 'ok';
  const docEstadoLabel = !doc || doc.total === 0 ? 'Sem documentos' : doc.situacao;
  // Financeiro — quitada(=liquidado)→success · excedente→destructive · demais(saldo aberto)→warning · sem resumo→muted.
  const finSinal: Sinal =
    !financeiroResumo ? 'neutro'
    : financeiroResumo.estadoLiquidacao === 'quitada' ? 'ok'
    : financeiroResumo.estadoLiquidacao === 'excedente' ? 'divergencia'
    : 'atencao';
  const finEstadoLabel =
    !financeiroResumo ? 'Indisponível'
    : financeiroResumo.estadoLiquidacao === 'quitada' ? 'Liquidado'
    : financeiroResumo.estadoLiquidacao === 'excedente' ? 'Excedente'
    : 'Saldo em aberto';

  return (
    <div className="bg-card rounded-md border shadow-sm p-1.5 space-y-1 self-start">
      <h3 className="text-[11px] font-semibold text-foreground leading-none">Resumo da Operação</h3>

      <Secao sinal={compraSinal} estadoLabel={compraEstadoLabel} titulo="Compra">
        <div>{dataLabel}</div>
        <div className="break-words">{fornecedorNome || '—'}</div>
        <div className="break-words">{fazendaNome || '—'}</div>
        <div>{compraEstadoLabel}</div>
      </Secao>

      <Secao sinal={negSinal} estadoLabel={negSinal === 'ok' ? 'Negociada' : 'Não iniciada'} titulo="Negociação">
        {negociacaoTotais && negociacaoTotais.lotes > 0 ? (
          <>
            <div>{nOr(negociacaoTotais.animais)} cab • {kgOr(negociacaoTotais.pesoTotal)}</div>
            <div className="font-semibold text-primary">{moneyOr(negociacaoTotais.valorNegociado)}</div>
          </>
        ) : (
          <div className="text-muted-foreground">Não iniciada</div>
        )}
      </Secao>

      <Secao sinal={recSinal} estadoLabel={recEstadoLabel} titulo="Recebimento">
        {rec.estadoGeral == null || rec.estadoGeral === 'nao_iniciado' ? (
          <div className="text-muted-foreground">Não iniciado</div>
        ) : rec.estadoGeral === 'completo' ? (
          <div>Completo{entregaEncerrada ? ' • encerrado' : ''}</div>
        ) : (
          <>
            <div>{nOr(rec.recebido)} / {nOr(rec.negociado)} cab</div>
            <div className={rec.estadoGeral === 'excedente' ? 'text-destructive' : 'text-foreground'}>
              {rec.estadoGeral === 'excedente' ? 'Excedente' : 'Diferença'}: {rec.diferenca == null ? '—' : Math.abs(rec.diferenca).toLocaleString('pt-BR')}
            </div>
          </>
        )}
      </Secao>

      <Secao sinal={docSinal} estadoLabel={docEstadoLabel} titulo="Documentos">
        {!doc || doc.total === 0 ? (
          <div className="text-muted-foreground">Sem documentos</div>
        ) : (
          <>
            <div>{doc.total.toLocaleString('pt-BR')} documento{doc.total === 1 ? '' : 's'}</div>
            <div>
              {doc.cancelados === 0
                ? 'Ativos'
                : `${doc.ativos} ativo${doc.ativos === 1 ? '' : 's'} • ${doc.cancelados} cancelado${doc.cancelados === 1 ? '' : 's'}`}
            </div>
            {doc.valorLiquidoTotal != null && doc.valorLiquidoTotal > 0 && (
              <div className="text-muted-foreground">{moneyOr(doc.valorLiquidoTotal)}</div>
            )}
          </>
        )}
      </Secao>

      <Secao sinal={finSinal} estadoLabel={finEstadoLabel} titulo="Financeiro">
        {!financeiroResumo ? (
          <div className="text-muted-foreground">—</div>
        ) : financeiroResumo.estadoLiquidacao === 'quitada' ? (
          <>
            <div className="font-semibold">Liquidado • {moneyOr(financeiroResumo.totalLiquidadoValido)}</div>
            {obrigacoesCount != null && (
              <div className="text-muted-foreground">{obrigacoesCount} título{obrigacoesCount === 1 ? '' : 's'}</div>
            )}
          </>
        ) : (
          <>
            <div className="font-semibold">Saldo {moneyOr(financeiroResumo.saldoOperacao)}</div>
            {obrigacoesCount != null && (
              <div className="text-muted-foreground">{obrigacoesCount} título{obrigacoesCount === 1 ? '' : 's'}</div>
            )}
          </>
        )}
      </Secao>

      <Secao sinal="neutro" estadoLabel="Em desenvolvimento" titulo="Auditoria">
        <div className="text-muted-foreground italic">Em desenvolvimento</div>
      </Secao>
    </div>
  );
}
