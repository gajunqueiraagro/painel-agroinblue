/**
 * Capa Executiva — Página 1 do Fechamento do Período (Marco 2.5).
 *
 * 3 linhas: metadata 1-line + Resumo Executivo em bullets textuais + insight
 * automático. Sem cards/grid — texto narrativo executivo, mais legível.
 * Frases determinísticas (sem IA, sem semáforo).
 *
 * "Resultado do período" foi removido: cálculo (Receita Op − Desembolso Pec)
 * não é interpretável nessa camada — usuário consulta DRE para resultado.
 */

import logo from '@/assets/logo.png';
import type { FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';
import type { PainelConsultorDataResult } from '@/hooks/usePainelConsultorData';
import { fmt, pct, formatarPeriodo } from './fmt';

interface Props {
  dto: FechamentoPeriodoDTO;
  nomeCliente?: string;
  nomeFazenda?: string;
  /** PC-100 — usado apenas para derivar escopo "Pecuária + Agricultura"
   *  na metadata. Sem queries novas. */
  painel: PainelConsultorDataResult | null;
}

// ─── Helpers locais de formatação ───────────────────────────────────

function fmtMoedaCurto(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `R$ ${(v / 1e9).toFixed(1).replace('.', ',')}B`;
  if (abs >= 1e6) return `R$ ${(v / 1e6).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return `R$ ${fmt(v)}`;
}

function fmtMoedaArroba(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `R$ ${fmt(v, 0)}/@`;
}

// ─── Insight executivo (função pura) ────────────────────────────────

function gerarInsightExecutivo(dto: FechamentoPeriodoDTO): string {
  const c = dto.cabecalho;
  const partes: string[] = [];

  // Frase 1 — Resultado
  const resPct = c.resultadoPeriodo.desvioMetaPct;
  if (resPct !== null && Number.isFinite(resPct)) {
    if (resPct >= 10) partes.push(`Período fechou **+${Math.round(resPct)}% vs Meta**`);
    else if (resPct <= -10) partes.push(`Período fechou **${Math.round(resPct)}% vs Meta**`);
    else partes.push(`Período **alinhado à Meta**`);
  } else {
    partes.push(`Período em curso`);
  }

  // Frase 2 — Receita
  if (c.receitaPecuaria.realizado != null) {
    partes.push(`receita pec **${fmtMoedaCurto(c.receitaPecuaria.realizado)}**`);
  }

  // Frase 3 — Custos
  const custPct = c.custeioPecuaria.desvioMetaPct;
  if (custPct !== null && Number.isFinite(custPct)) {
    if (custPct <= -10) partes.push(`custos operacionais **${Math.round(custPct)}% vs Meta**`);
    else if (custPct >= 10) partes.push(`custos **+${Math.round(custPct)}% acima da Meta**`);
    else partes.push(`custos **alinhados**`);
  }

  // Frase 4 — Margem R$/@
  if (c.margemRsArroba?.realizado != null) {
    partes.push(`margem **${fmtMoedaArroba(c.margemRsArroba.realizado)}**`);
  }

  return partes.join(', ') + '.';
}

// ─── Escopo Pec/Agri derivado de PC-100 ─────────────────────────────

function derivarEscopo(painel: PainelConsultorDataResult | null): string {
  const pec = painel?.areaPecuariaRealMes ?? 0;
  const agri = painel?.areaAgriculturaRealMes ?? 0;
  return (
    [pec > 0 && 'Pecuária', agri > 0 && 'Agricultura'].filter(Boolean).join(' + ') ||
    'Pecuária'
  );
}

// ─── Componente principal ───────────────────────────────────────────

export default function Capa({ dto, nomeCliente, nomeFazenda, painel }: Props) {
  const c = dto.cabecalho;
  const insight = gerarInsightExecutivo(dto);
  const escopoTexto = derivarEscopo(painel);

  // Render simples de negrito do insight (parse de **...**)
  const renderInsight = (texto: string) => {
    const partes = texto.split(/(\*\*[^*]+\*\*)/);
    return partes.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
        : <span key={i}>{p}</span>,
    );
  };

  return (
    <section className="pagina-fechamento bg-card border border-border rounded-lg p-4 mb-4">
      {/* LINHA 1 — Metadata + logo */}
      <header className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-border">
        <div className="text-xs text-muted-foreground truncate">
          <span className="font-semibold text-foreground">{nomeCliente ?? '—'}</span>
          {nomeFazenda && <> • <span className="font-semibold text-foreground">{nomeFazenda}</span></>}
          {' • '}{formatarPeriodo(dto.periodoInicio, dto.periodoFim)}
          {' • '}{escopoTexto}
        </div>
        <img src={logo} alt="Agroinblue" className="h-8 shrink-0" />
      </header>

      {/* LINHA 2 — Resumo Executivo em bullets textuais */}
      <div className="mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1.5">
          Resumo Executivo
        </h3>
        <ul className="text-sm text-foreground space-y-1 leading-snug">
          <li>
            Caixa final: <strong className="font-semibold">R$ {fmt(c.caixaFinal.realizado)}</strong>
          </li>
          <li>
            Receita Pecuária: <strong className="font-semibold">R$ {fmt(c.receitaPecuaria.realizado)}</strong>
            {c.receitaPecuaria.desvioMetaPct !== null && (
              <span className="text-muted-foreground"> ({pct(c.receitaPecuaria.desvioMetaPct)} vs META)</span>
            )}
          </li>
          <li>
            Custeio Produção: <strong className="font-semibold">R$ {fmt(c.custeioPecuaria.realizado)}</strong>
          </li>
          <li>
            Investimentos Fazenda: <strong className="font-semibold">R$ {fmt(c.investimentosFazendaPec.realizado)}</strong>
          </li>
          <li>
            Juros Financiamento: <strong className="font-semibold">R$ {fmt(c.jurosFinanciamentoPec.realizado)}</strong>
          </li>
          <li>
            Arrobas Produzidas: <strong className="font-semibold">{fmt(c.arrobasProduzidas.realizado)} @</strong>
          </li>
          <li>
            GMD médio: <strong className="font-semibold">{fmt(c.gmd.realizado, 3)} kg/dia</strong>
          </li>
        </ul>
      </div>

      {/* LINHA 3 — Insight executivo */}
      <p className="text-sm text-foreground leading-relaxed">
        {renderInsight(insight)}
      </p>
    </section>
  );
}
