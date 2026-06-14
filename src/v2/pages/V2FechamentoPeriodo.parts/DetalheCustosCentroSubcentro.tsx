/**
 * DetalheCustosCentroSubcentro — box de detalhamento CENTRO-ONLY de Custos
 * (PR-BOLETIM-2.2B.1), um por grupo (Variável / Fixo). Uma linha por centro +
 * linha TOTAL do grupo. Sem subcentros. Mesma formatação Real/Meta/Δ e cores que
 * o nível centro do GrupoExpansivel — helpers duplicados nesta fase (DRY no fim).
 *
 * NOTE: nome do arquivo/componente mantém "...CentroSubcentro" de propósito (sem
 * cleanup agora); hoje é centro-only.
 */
import { Fragment, type CSSProperties } from 'react';
import type { FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';
import { fmt, pct } from './fmt';
import { BoletimContainer } from './boletim/BoletimContainer';

// Cor de custo (sinal invertido vs. receita): custo acima da meta (>0) é ruim →
// vermelho; abaixo (<0) é economia → verde. Duplicado de DesembolsoProducao.
function classeCustoDelta(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  if (v > 0.05) return 'dif-negativa';
  if (v < -0.05) return 'dif-positiva';
  return '';
}

export function DetalheCustosCentroSubcentro({
  dto,
  custeioAcum,
  custoCab,
  subtitulo,
  grupoAlvo,
}: {
  dto: FechamentoPeriodoDTO;
  custeioAcum: number | null;
  custoCab: number | null;
  subtitulo: string;
  grupoAlvo: 'Custo Variável Pecuária' | 'Custo Fixo Pecuária';
}) {
  // denom: idêntico ao DesembolsoProducao (base cab×mês soberana, custeioAcum/custoCab).
  const denom =
    custeioAcum != null &&
    Number.isFinite(custeioAcum) &&
    custoCab != null &&
    Number.isFinite(custoCab) &&
    custoCab > 0
      ? custeioAcum / custoCab
      : null;
  const numMeses = dto.meses.length;
  const grupos = dto.estruturaCustos.grupos.filter((g) => g.grupo_custo === grupoAlvo);
  const titulo =
    grupoAlvo === 'Custo Variável Pecuária'
      ? 'Detalhamento — Custo Variável (Centro de Custo)'
      : 'Detalhamento — Custo Fixo (Centro de Custo)';

  // ── Helpers (duplicados do nível centro do GrupoExpansivel; fecham sobre denom/numMeses) ──
  const rsCabMes = (v: number | null | undefined): number | null =>
    v != null && denom != null && denom > 0 ? v / denom : null;
  const rsMedioPeriodo = (v: number | null | undefined): number | null =>
    v != null && numMeses > 0 ? v / numMeses : null;
  const fmtRsCabMes = (v: number | null | undefined): string => {
    const r = rsCabMes(v);
    return r != null ? `${fmt(r, 2)}` : '—';
  };
  const difRsCabMes = (
    real: number | null | undefined,
    meta: number | null | undefined,
  ): number | null => {
    const r = rsCabMes(real);
    const m = rsCabMes(meta);
    return r != null && m != null ? r - m : null;
  };
  const fmtDifRsCabMes = (
    real: number | null | undefined,
    meta: number | null | undefined,
  ): string => {
    const d = difRsCabMes(real, meta);
    return d != null ? `${fmt(d, 2)}` : '—';
  };
  const fmtMedioPeriodo = (v: number | null | undefined): string => {
    const r = rsMedioPeriodo(v);
    return r != null ? `R$ ${fmt(r)}` : '—';
  };

  // ── Estilos locais (duplicados) ──
  const cell: CSSProperties = { padding: '3px 8px', borderBottom: '1px solid #eef0f3' };
  const cellNum: CSSProperties = {
    ...cell,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  };
  const cellNome: CSSProperties = {
    ...cell,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 0,
  };
  const COR_REAL_COL = '#dc2626'; // coluna Real sempre vermelho
  const COR_META_COL = '#f97316'; // coluna Meta sempre laranja
  const bordaGrupo = '1px solid #cbd5e1';
  const thBase: CSSProperties = {
    padding: '5px 8px',
    textAlign: 'right',
    fontWeight: 700,
    borderBottom: '2px solid #94a3b8',
  };

  return (
    <BoletimContainer titulo={titulo} subtitulo={subtitulo} badge="FINANCEIRO" tone="financeiro">
      {grupos.length === 0 ? (
        <div
          style={{
            padding: '24px 8px',
            textAlign: 'center',
            fontSize: 11,
            color: '#9ca3af',
            fontStyle: 'italic',
          }}
        >
          Sem dados para este grupo de custo.
        </div>
      ) : (
        <div
          style={{
            margin: '10px 0',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              fontSize: 10,
              color: '#111',
            }}
          >
            <colgroup>
              <col style={{ width: '40%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
            </colgroup>
            <thead>
              <tr
                style={{
                  background: '#cbd5e1',
                  color: '#1f2937',
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                }}
              >
                <th style={{ ...thBase, textAlign: 'left' }}>Centro de Custo</th>
                <th style={thBase}>Média Período</th>
                <th style={thBase}>Real</th>
                <th style={thBase}>Meta</th>
                <th style={thBase}>Δ R$</th>
                <th style={thBase}>Δ %</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((grupo) => {
                const centros = grupo.centros ?? [];
                const metaGrupoAusente = grupo.meta == null || grupo.meta === 0;
                return (
                  <Fragment key={grupo.grupo_custo}>
                    {centros.map((centro) => {
                      // Meta ausente (null ou 0): não exibir Meta/Dif/% — não calcular contra zero.
                      const metaCentroAusente = centro.meta == null || centro.meta === 0;
                      return (
                        <tr key={centro.centro_custo} style={{ background: '#f1f5f9' }}>
                          <td title={centro.centro_custo} style={{ ...cellNome, fontWeight: 600 }}>
                            {centro.centro_custo}
                          </td>
                          <td style={{ ...cellNum, fontWeight: 600 }}>
                            {fmtMedioPeriodo(centro.realizado)}
                          </td>
                          <td style={{ ...cellNum, fontWeight: 600, color: COR_REAL_COL }}>
                            {fmtRsCabMes(centro.realizado)}
                          </td>
                          <td style={{ ...cellNum, fontWeight: 600, color: COR_META_COL }}>
                            {metaCentroAusente ? '—' : fmtRsCabMes(centro.meta)}
                          </td>
                          <td
                            className={metaCentroAusente ? '' : classeCustoDelta(centro.desvioMetaPct)}
                            style={{ ...cellNum, fontWeight: 600 }}
                          >
                            {metaCentroAusente ? '—' : fmtDifRsCabMes(centro.realizado, centro.meta)}
                          </td>
                          <td
                            className={metaCentroAusente ? '' : classeCustoDelta(centro.desvioMetaPct)}
                            style={{ ...cellNum, fontWeight: 600 }}
                          >
                            {metaCentroAusente ? '—' : pct(centro.desvioMetaPct)}
                          </td>
                        </tr>
                      );
                    })}
                    {/* ── TOTAL do grupo (nó grupo) ── */}
                    <tr style={{ background: '#e2e8f0' }}>
                      <td style={{ ...cellNome, fontWeight: 700, fontSize: 12, borderTop: bordaGrupo }}>
                        TOTAL
                      </td>
                      <td style={{ ...cellNum, fontWeight: 700, borderTop: bordaGrupo }}>
                        {fmtMedioPeriodo(grupo.realizado)}
                      </td>
                      <td style={{ ...cellNum, fontWeight: 700, color: COR_REAL_COL, borderTop: bordaGrupo }}>
                        {fmtRsCabMes(grupo.realizado)}
                      </td>
                      <td style={{ ...cellNum, fontWeight: 700, color: COR_META_COL, borderTop: bordaGrupo }}>
                        {metaGrupoAusente ? '—' : fmtRsCabMes(grupo.meta)}
                      </td>
                      <td
                        className={metaGrupoAusente ? '' : classeCustoDelta(grupo.desvioMetaPct)}
                        style={{ ...cellNum, fontWeight: 700, borderTop: bordaGrupo }}
                      >
                        {metaGrupoAusente ? '—' : fmtDifRsCabMes(grupo.realizado, grupo.meta)}
                      </td>
                      <td
                        className={metaGrupoAusente ? '' : classeCustoDelta(grupo.desvioMetaPct)}
                        style={{ ...cellNum, fontWeight: 700, borderTop: bordaGrupo }}
                      >
                        {metaGrupoAusente ? '—' : pct(grupo.desvioMetaPct)}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </BoletimContainer>
  );
}
