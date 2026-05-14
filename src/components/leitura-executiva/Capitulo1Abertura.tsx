/**
 * Capitulo1Abertura — Cap I · Abertura da Leitura Executiva.
 *
 * Identidade visual: carta executiva, não dashboard.
 *   - Cormorant Garamond para display (lead em itálico)
 *   - Inter para body
 *   - Paleta cor terrosa (paper/ink/gold)
 *   - Indicador lateral rotacionado fixo à esquerda
 *
 * REGRAS:
 *   - Microcopy fixa nesta versão
 *   - Todos os números via usePainelConsultorData (PC-100). Zero hardcode.
 *   - viewMode='periodo' (fechamento de período)
 *   - Cliente/Fazenda vêm dos contextos globais (mesmo padrão V2)
 *   - Setas de delta em var(--gold), nunca verde/vermelho
 */
import { usePainelConsultorData } from '@/hooks/usePainelConsultorData';

interface Props {
  ano: number;
  mes: number;
}

// ─── Formatters ────────────────────────────────────────────────────

const fmtCabecas = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('pt-BR');
};

const fmtMilhoes = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return '—';
  const v = n / 1_000_000;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

const fmtMil = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return '—';
  const v = n / 1_000;
  return Math.round(v).toLocaleString('pt-BR');
};

/** Recebe delta em PERCENTUAL (ex: -4.6) e devolve "4,6". */
const fmtPctDelta = (d: number | null | undefined): string => {
  if (d == null || !Number.isFinite(d)) return '—';
  const abs = Math.abs(d);
  return abs.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

const arrowFor = (d: number | null | undefined): string => {
  if (d == null || !Number.isFinite(d)) return '—';
  if (d < 0) return '▼';
  if (d > 0) return '▲';
  return '—';
};

const MESES_PT: Record<number, string> = {
  1: 'janeiro', 2: 'fevereiro', 3: 'março', 4: 'abril',
  5: 'maio', 6: 'junho', 7: 'julho', 8: 'agosto',
  9: 'setembro', 10: 'outubro', 11: 'novembro', 12: 'dezembro',
};

const mesNome = (m: number): string => MESES_PT[m] ?? '';

/** Nome do mês anterior considerando virada de ano. */
const mesAnteriorNome = (m: number): string => {
  if (m === 1) return 'dezembro';
  return mesNome(m - 1);
};

// ─── Componente ────────────────────────────────────────────────────

export default function Capitulo1Abertura({ ano, mes }: Props) {
  const pc100 = usePainelConsultorData({
    ano,
    mes,
    viewMode: 'periodo',
    incluirComparativos: true,
  });

  if (pc100.loading) {
    return (
      <div className="cap1-leitura">
        <style>{CAP1_STYLES}</style>
        <p className="cap1-leitura__loading">Carregando leitura…</p>
      </div>
    );
  }

  // Coleta de números (todos do PC-100, nada hardcoded)
  // Rebanho: ESTOQUE — usar cabecasIndicador.serieAno[mes] (foto do mês),
  // NÃO pc100.cabecas que em viewMode='periodo' devolve média do trimestre.
  // O delta também é recalculado manualmente vs serieAno[mes-1] para a mesma razão.
  const cabecasSerie  = pc100.cabecasIndicador?.serieAno ?? null;
  const cabecasRaw    = cabecasSerie?.[mes];
  const cabecasPrev   = cabecasSerie?.[mes - 1];
  const cabecas       = (cabecasRaw != null && Number.isFinite(cabecasRaw)) ? cabecasRaw : null;
  const cabDelta      = (cabecas != null
                         && cabecasPrev != null
                         && Number.isFinite(cabecasPrev)
                         && cabecasPrev !== 0)
    ? ((cabecas - cabecasPrev) / cabecasPrev) * 100
    : null;

  const valorRebanho  = pc100.valorRebanhoMes;
  const rebDelta      = pc100.valorRebanhoIndicador?.deltaMes ?? null;

  const caixaValor    = pc100.caixaIndicador?.valor ?? null;
  const caixaDelta    = pc100.caixaIndicador?.deltaMes ?? null;
  const caixaInicio   = pc100.caixaIndicador?.serieAno?.[0] ?? null;

  const receitaPec    = pc100.receitaPecIndicador?.valor ?? null;
  const custeioPec    = pc100.custeioPecIndicador?.valor ?? null;

  const abateItem     = pc100.rebanho?.movimentacoes?.porTipo?.find(p => p.tipo === 'abate');
  const abateCabecas  = abateItem?.cabecas ?? null;

  const deficitMensal = pc100.executivo?.runway?.deficitMedioMensal ?? null;

  // Labels textuais
  const mesAtual      = mesNome(mes);
  const mesPrev       = mesAnteriorNome(mes);
  const mesInicioStr  = 'dezembro'; // serieAno[0] é sempre Dez do ano anterior

  return (
    <div className="cap1-leitura">
      <style>{CAP1_STYLES}</style>

      <aside className="cap1-leitura__sidemark" aria-hidden="true">
        CAP I · ABERTURA
      </aside>

      <article className="cap1-leitura__page">
        <header className="cap1-leitura__header">
          <p className="cap1-leitura__eyebrow">Leitura Executiva · Cap I</p>
          <h1 className="cap1-leitura__title">
            <span className="cap1-leitura__title-prefix">—01</span>
            <span className="cap1-leitura__title-text">Abertura</span>
          </h1>
          <p className="cap1-leitura__sub">
            Fechamento do trimestre · referência {mesAtual} de {ano}
          </p>
        </header>

        <p className="cap1-leitura__lead">
          O rebanho fechou o trimestre em <em>{fmtCabecas(cabecas)} cabeças</em>,
          {' '}com patrimônio consolidado de <em>R$ {fmtMilhoes(valorRebanho)} milhões</em>
          {' '}e <em>R$ {fmtMil(caixaValor)} mil</em> em caixa ao final de {mesAtual}.
        </p>

        <section className="cap1-leitura__ancoras" aria-label="Âncoras do período">
          <div className="cap1-leitura__ancora">
            <p className="cap1-leitura__ancora-label">Rebanho</p>
            <p className="cap1-leitura__ancora-valor">{fmtCabecas(cabecas)}</p>
            <p className="cap1-leitura__ancora-unit">cabeças</p>
            <p className="cap1-leitura__ancora-delta">
              <span className="cap1-leitura__arrow">{arrowFor(cabDelta)}</span>
              {' '}{fmtPctDelta(cabDelta)}% vs {mesPrev}
            </p>
          </div>
          <div className="cap1-leitura__ancora">
            <p className="cap1-leitura__ancora-label">Patrimônio</p>
            <p className="cap1-leitura__ancora-valor">R$ {fmtMilhoes(valorRebanho)}</p>
            <p className="cap1-leitura__ancora-unit">milhões</p>
            <p className="cap1-leitura__ancora-delta">
              <span className="cap1-leitura__arrow">{arrowFor(rebDelta)}</span>
              {' '}{fmtPctDelta(rebDelta)}% vs {mesPrev}
            </p>
          </div>
          <div className="cap1-leitura__ancora">
            <p className="cap1-leitura__ancora-label">Caixa</p>
            <p className="cap1-leitura__ancora-valor">R$ {fmtMil(caixaValor)}</p>
            <p className="cap1-leitura__ancora-unit">mil</p>
            <p className="cap1-leitura__ancora-delta">
              <span className="cap1-leitura__arrow">{arrowFor(caixaDelta)}</span>
              {' '}{fmtPctDelta(caixaDelta)}% vs {mesPrev}
            </p>
          </div>
        </section>

        <div className="cap1-leitura__body">
          <p className="cap1-leitura__paragraph">
            Os três meses foram marcados por volume operacional consistente —
            {' '}{fmtCabecas(abateCabecas)} cabeças abatidas,
            {' '}R$ {fmtMilhoes(receitaPec)} milhões em receita de pecuária
            {' '}e R$ {fmtMilhoes(custeioPec)} milhões em custeio realizado.
          </p>
          <p className="cap1-leitura__paragraph">
            O caixa retraiu de <em>R$ {fmtMil(caixaInicio)} mil</em> em {mesInicioStr}
            {' '}para <em>R$ {fmtMil(caixaValor)} mil</em> em {mesAtual},
            {' '}com queima média líquida de <em>R$ {fmtMil(deficitMensal)} mil ao mês</em>
            {' '}ao longo do trimestre.
          </p>
        </div>

        <blockquote className="cap1-leitura__citacao">
          A leitura do trimestre mostra uma operação com volume relevante,
          patrimônio consolidado e caixa mais enxuto ao final de março. O
          runway líquido indica horizonte alongado mantendo o padrão recente
          de entradas e saídas, enquanto o runway bruto mostra baixa folga
          se novas entradas não ocorrerem.
        </blockquote>

        <footer className="cap1-leitura__footer">
          <span>Agroinblue · Leitura Executiva</span>
          <span>Cap I — Abertura</span>
        </footer>
      </article>
    </div>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────

const CAP1_STYLES = `
  .cap1-leitura {
    --paper:        #faf8f3;
    --ink:          #1a1d24;
    --ink-soft:     #4a5260;
    --ink-mute:     #8b9099;
    --gold:         #a07d3a;
    --line:         #d4cfc1;
    --line-strong:  #1a1d24;
    min-height: 100vh;
    background: var(--paper);
    color: var(--ink);
    font-family: 'Inter', system-ui, sans-serif;
    position: relative;
    padding: 0;
  }
  .cap1-leitura__loading {
    padding: 80px 64px;
    color: var(--ink-mute);
    font-size: 14px;
  }
  .cap1-leitura__sidemark {
    position: fixed;
    left: 32px;
    top: 50%;
    transform: translateY(-50%) rotate(-90deg);
    transform-origin: left center;
    white-space: nowrap;
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    letter-spacing: 0.32em;
    color: var(--ink-mute);
    text-transform: uppercase;
    font-weight: 500;
    pointer-events: none;
    user-select: none;
  }
  @media (max-width: 1100px) {
    .cap1-leitura__sidemark { display: none; }
  }
  .cap1-leitura__page {
    max-width: 920px;
    margin: 0 auto;
    padding: 80px 64px 96px;
  }
  .cap1-leitura__header {
    border-bottom: 1px solid var(--line);
    padding-bottom: 28px;
    margin-bottom: 48px;
  }
  .cap1-leitura__eyebrow {
    font-size: 11px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--gold);
    margin: 0 0 14px;
    font-weight: 500;
  }
  .cap1-leitura__title {
    margin: 0;
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-weight: 500;
    font-size: 56px;
    line-height: 1.05;
    letter-spacing: -0.005em;
    color: var(--ink);
    display: flex;
    align-items: baseline;
    gap: 18px;
  }
  .cap1-leitura__title-prefix {
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: var(--gold);
    letter-spacing: 0.05em;
  }
  .cap1-leitura__title-text {
    font-style: italic;
  }
  .cap1-leitura__sub {
    margin: 18px 0 0;
    font-size: 13px;
    color: var(--ink-soft);
    letter-spacing: 0.04em;
  }
  .cap1-leitura__lead {
    max-width: 640px;
    margin: 0 0 56px;
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-size: 26px;
    line-height: 1.45;
    color: var(--ink);
    letter-spacing: -0.005em;
  }
  .cap1-leitura__lead em {
    font-style: normal;
    font-weight: 500;
    color: var(--ink);
  }
  .cap1-leitura__ancoras {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    border-top: 1px solid var(--line-strong);
    border-bottom: 1px solid var(--line);
    margin: 0 0 56px;
  }
  .cap1-leitura__ancora {
    padding: 28px 24px 26px;
    border-right: 1px solid var(--line);
  }
  .cap1-leitura__ancora:last-child {
    border-right: none;
  }
  .cap1-leitura__ancora-label {
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-mute);
    font-weight: 500;
    margin: 0 0 14px;
  }
  .cap1-leitura__ancora-valor {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-weight: 500;
    font-size: 38px;
    line-height: 1;
    color: var(--ink);
    margin: 0 0 4px;
    letter-spacing: -0.01em;
  }
  .cap1-leitura__ancora-unit {
    font-size: 12px;
    color: var(--ink-soft);
    margin: 0 0 14px;
    letter-spacing: 0.02em;
  }
  .cap1-leitura__ancora-delta {
    font-size: 12px;
    color: var(--ink-soft);
    margin: 0;
    letter-spacing: 0.02em;
  }
  .cap1-leitura__arrow {
    color: var(--gold);
    font-size: 11px;
  }
  .cap1-leitura__body {
    max-width: 640px;
    margin: 0 0 56px;
  }
  .cap1-leitura__paragraph {
    font-size: 15.5px;
    line-height: 1.75;
    color: var(--ink);
    margin: 0 0 22px;
    font-weight: 400;
  }
  .cap1-leitura__paragraph em {
    font-style: normal;
    font-weight: 600;
    color: var(--ink);
  }
  .cap1-leitura__paragraph:last-child {
    margin-bottom: 0;
  }
  .cap1-leitura__citacao {
    max-width: 640px;
    margin: 0 0 56px;
    padding: 28px 32px;
    border-left: 2px solid var(--gold);
    background: rgba(160, 125, 58, 0.04);
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-size: 18px;
    line-height: 1.55;
    color: var(--ink-soft);
  }
  .cap1-leitura__footer {
    border-top: 1px solid var(--line);
    padding-top: 24px;
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--ink-mute);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-weight: 500;
  }

  @media (max-width: 720px) {
    .cap1-leitura__page { padding: 48px 24px 64px; }
    .cap1-leitura__title { font-size: 42px; }
    .cap1-leitura__lead { font-size: 22px; }
    .cap1-leitura__ancoras {
      grid-template-columns: 1fr;
    }
    .cap1-leitura__ancora {
      border-right: none;
      border-bottom: 1px solid var(--line);
    }
    .cap1-leitura__ancora:last-child {
      border-bottom: none;
    }
  }
`;
