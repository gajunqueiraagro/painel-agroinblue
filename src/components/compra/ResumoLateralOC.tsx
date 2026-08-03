import type { ReactNode } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { CompraLotesApi } from '@/hooks/useCompraLotes';
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

// Indicador-sentinela por etapa — dot CSS (SEM emoji) usando tokens do design system, mapeando
//   ESTADOS JÁ EXISTENTES (nenhum status novo): success · warning · destructive · muted.
type Sinal = 'ok' | 'atencao' | 'divergencia' | 'neutro';
const DOT_CLASS: Record<Sinal, string> = {
  ok: 'bg-success', atencao: 'bg-warning', divergencia: 'bg-destructive', neutro: 'bg-muted-foreground/40',
};

// Blocos de conteúdo (hierarquia visual — apresentação pura, sem novo dado):
//   Principal = dado-chave da etapa (13px semibold) · Ctx = contexto secundário (11px muted).
function Principal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`text-[12px] font-semibold text-foreground leading-tight break-words ${className}`}>{children}</div>;
}
function Ctx({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`text-[11px] text-muted-foreground leading-tight break-words ${className}`}>{children}</div>;
}

// aria-label = estado textual da etapa (acessibilidade); passado explicitamente por seção.
//   Cabeçalho = dot + TÍTULO 11px semibold uppercase. Separação entre blocos: hairline curta (divisor),
//   nunca separator de largura total. Cada Secao é um "mini-card invisível" (sem borda/caixa).
function Secao({ sinal, estadoLabel, titulo, divisor, children }: { sinal: Sinal; estadoLabel: string; titulo: string; divisor?: boolean; children: ReactNode }) {
  return (
    <div>
      {divisor && <div className="w-8 border-t border-border/40 mb-1" />}
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70 leading-none">
        <span role="img" aria-label={estadoLabel} className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[sinal]}`} />
        {titulo}
      </div>
      <div className="pl-3.5 mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

// PR-OC-FIN-VISAO-02 — status financeiro por natureza (mesma regra do PR-OC-HOMOLOG-01):
//   liquidado ≥ base → Pago; liquidado 0 → Programado; parcial → Parcial.
function statusFinanceiro(base: number, liquidado: number): { icon: string; label: string; sinal: Sinal } {
  if (base <= 0) return { icon: '', label: '—', sinal: 'neutro' };
  if (liquidado >= base - 0.005) return { icon: '🟢', label: 'Pago', sinal: 'ok' };
  if (liquidado > 0) return { icon: '🟠', label: 'Parcial', sinal: 'atencao' };
  return { icon: '🟡', label: 'Programado', sinal: 'atencao' };
}
const COMPONENTE_LABEL: Record<string, string> = {
  frete: 'Frete', comissao: 'Comissão', taxa_aquisicao: 'Taxa aquisição', taxa: 'Taxas', imposto: 'Impostos',
};
const rotuloComponente = (c: string) => COMPONENTE_LABEL[c] ?? (c ? c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' ') : 'Outros');

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
  financeiroResumo: ResumoLiquidacao | null;            // fonte oficial derivada nas views (legado; não mais exibido)
  obrigacoesCount: number | null;
  obrigacoes: ObrigacaoLinha[] | null;                  // PR-OC-FIN-VISAO-02 — split Principal × Obrigações por natureza
}

export function ResumoLateralOC({
  dataLabel, statusComercial, fornecedorNome, fazendaNome, ocId,
  negociacaoTotais, recebimentoLotes, entregaEncerrada, documentos, obrigacoes,
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
  // PR-OC-FIN-VISAO-02 — visão financeira SEPARADA por natureza (substitui saldo/excedente misto).
  //   Fonte: obrigacoes (vw_oc_obrigacoes) — cada linha tem natureza/componente/valorNominal/totalLiquidado.
  //   O "excedente" da view legada não é mais exibido (base era só principal × liquidado principal+obrigações).
  const obrAtivas = (obrigacoes ?? []).filter(o => !o.cancelada);
  const aggNat = (nat: string) => obrAtivas.filter(o => o.natureza === nat)
    .reduce((a, o) => ({ base: a.base + (o.valorNominal || 0), liq: a.liq + (o.totalLiquidado || 0) }), { base: 0, liq: 0 });
  const finPrincipal = aggNat('principal');
  const finObrig = aggNat('obrigacao');
  const finTotalBase = finPrincipal.base + finObrig.base;
  const finTotalLiq = finPrincipal.liq + finObrig.liq;
  const temFinanceiro = obrAtivas.length > 0;
  const stPrincipal = statusFinanceiro(finPrincipal.base, finPrincipal.liq);
  const stObrig = statusFinanceiro(finObrig.base, finObrig.liq);
  const componentesObrig = Array.from(new Set(obrAtivas.filter(o => o.natureza === 'obrigacao').map(o => o.componente))).map(rotuloComponente);
  const stTotal = statusFinanceiro(finTotalBase, finTotalLiq);
  const finSinal: Sinal = !temFinanceiro ? 'neutro' : stTotal.sinal;
  const finEstadoLabel = !temFinanceiro ? 'Indisponível' : stTotal.label;

  return (
    <div className="bg-card rounded-md border shadow-sm p-1.5 space-y-1.5 self-start">{/* PR-OC-UX-DENSIDADE-01 — padding/gap reduzidos */}
      <h3 className="text-[11px] font-semibold text-foreground leading-none">Resumo</h3>

      <Secao sinal={compraSinal} estadoLabel={compraEstadoLabel} titulo="Compra">
        <Principal>{fornecedorNome || '—'}</Principal>
        <Ctx>{dataLabel}{fazendaNome ? ` • ${fazendaNome}` : ''}</Ctx>
        <Ctx>{compraEstadoLabel}</Ctx>
      </Secao>

      <Secao sinal={negSinal} estadoLabel={negSinal === 'ok' ? 'Negociada' : 'Não iniciada'} titulo="Negociação" divisor>
        {negociacaoTotais && negociacaoTotais.lotes > 0 ? (
          <>
            <Principal className="text-primary">{moneyOr(negociacaoTotais.valorNegociado)}</Principal>
            <Ctx>{nOr(negociacaoTotais.animais)} cab • {kgOr(negociacaoTotais.pesoTotal)}</Ctx>
          </>
        ) : (
          <Ctx>Não iniciada</Ctx>
        )}
      </Secao>

      <Secao sinal={recSinal} estadoLabel={recEstadoLabel} titulo="Recebimento" divisor>
        {rec.estadoGeral == null || rec.estadoGeral === 'nao_iniciado' ? (
          <Ctx>Não iniciado</Ctx>
        ) : (
          <>
            <Principal className={rec.estadoGeral === 'excedente' ? 'text-destructive' : ''}>{recEstadoLabel}</Principal>
            {rec.estadoGeral === 'completo' ? (
              <Ctx>{nOr(rec.recebido)} / {nOr(rec.negociado)} cab{entregaEncerrada ? ' • encerrado' : ''}</Ctx>
            ) : (
              <Ctx>{nOr(rec.recebido)} / {nOr(rec.negociado)} cab • {rec.estadoGeral === 'excedente' ? 'Excedente' : 'Diferença'}: {rec.diferenca == null ? '—' : Math.abs(rec.diferenca).toLocaleString('pt-BR')}</Ctx>
            )}
          </>
        )}
      </Secao>

      <Secao sinal={docSinal} estadoLabel={docEstadoLabel} titulo="Documentos" divisor>
        {!doc || doc.total === 0 ? (
          <Ctx>Sem documentos</Ctx>
        ) : (
          <>
            <Principal>{doc.total.toLocaleString('pt-BR')} documento{doc.total === 1 ? '' : 's'}</Principal>
            <Ctx>
              {doc.cancelados === 0
                ? 'Ativos'
                : `${doc.ativos} ativo${doc.ativos === 1 ? '' : 's'} • ${doc.cancelados} cancelado${doc.cancelados === 1 ? '' : 's'}`}
            </Ctx>
            {doc.valorLiquidoTotal != null && doc.valorLiquidoTotal > 0 && (
              <Ctx>Líq. {moneyOr(doc.valorLiquidoTotal)}</Ctx>
            )}
          </>
        )}
      </Secao>

      {/* PR-OC-FIN-VISAO-02 — Financeiro separado por natureza: Principal (animais) × Obrigações × Total.
          Sem "Excedente" falso (base agora é comparada por natureza, não principal × liquidado total). */}
      <Secao sinal={finSinal} estadoLabel={finEstadoLabel} titulo="Financeiro" divisor>
        {!temFinanceiro ? (
          <Ctx>—</Ctx>
        ) : (
          <div className="space-y-1">
            <div>
              <div className="text-[10px] font-semibold text-foreground/80 leading-none">Principal (animais)</div>
              <Ctx>{stPrincipal.icon ? `${stPrincipal.icon} ` : ''}{stPrincipal.label} · {moneyOr(finPrincipal.liq)} / {moneyOr(finPrincipal.base)}</Ctx>
            </div>
            {finObrig.base > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-foreground/80 leading-none">Obrigações</div>
                <Ctx>{stObrig.icon ? `${stObrig.icon} ` : ''}{stObrig.label} · {moneyOr(finObrig.liq)} / {moneyOr(finObrig.base)}</Ctx>
                {componentesObrig.length > 0 && <Ctx>{componentesObrig.join(' · ')}</Ctx>}
              </div>
            )}
            <div className="pt-0.5">
              <Principal className="text-primary">Total {moneyOr(finTotalBase)}</Principal>
            </div>
          </div>
        )}
      </Secao>
    </div>
  );
}
