/**
 * DetalheCustosCentroSubcentro — box de detalhamento Centro/Subcentro de Custos
 * (PR-BOLETIM-2.2B), um por grupo (Variável / Fixo). Reusa o GrupoExpansivel
 * (mesma formatação Real/Meta/Δ + cores via classeCustoDelta). Zero fórmula nova.
 */
import type { FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';
import { BoletimContainer } from './boletim/BoletimContainer';
import { GrupoExpansivel } from './DesembolsoProducao';

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
      ? 'Detalhamento — Custo Variável (Centro / Subcentro)'
      : 'Detalhamento — Custo Fixo (Centro / Subcentro)';

  return (
    <BoletimContainer titulo={titulo} subtitulo={subtitulo} badge="FINANCEIRO" tone="financeiro">
      {grupos.length === 0 ? (
        <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
          Sem dados para este grupo de custo.
        </div>
      ) : (
        <div style={{ margin: '10px 0', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 10, color: '#111' }}>
            <colgroup>
              <col style={{ width: '40%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#cbd5e1', color: '#1f2937', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, borderBottom: '2px solid #94a3b8' }}>Centro / Subcentro</th>
                <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, borderBottom: '2px solid #94a3b8' }}>Média Período</th>
                <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, borderBottom: '2px solid #94a3b8' }}>Real</th>
                <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, borderBottom: '2px solid #94a3b8' }}>Meta</th>
                <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, borderBottom: '2px solid #94a3b8' }}>Δ R$</th>
                <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, borderBottom: '2px solid #94a3b8' }}>Δ %</th>
              </tr>
            </thead>
            {grupos.map((g) => (
              <GrupoExpansivel key={g.grupo_custo} grupo={g} denom={denom} numMeses={numMeses} />
            ))}
          </table>
        </div>
      )}
    </BoletimContainer>
  );
}
