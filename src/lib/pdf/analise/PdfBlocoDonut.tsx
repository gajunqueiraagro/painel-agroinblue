/**
 * PdfBlocoDonut — donut + ranking (reutilizável: Créditos / Por natureza / Por negócio).
 * PR-FIN-V2-PDF-EXECUTIVO-03. Só desenha (dados prontos).
 */
import { View, Text } from '@react-pdf/renderer';
import { COR } from '@/lib/pdf/analise/estilos';
import { PdfDonut, type SegmentoDonut } from '@/lib/pdf/analise/PdfDonut';

export interface LinhaRanking { label: string; valorFmt: string; pct: number; cor: string; }

export function PdfBlocoDonut({ subtitulo, segmentos, ranking, donutSize = 86 }: {
  subtitulo?: string;
  segmentos: SegmentoDonut[];
  ranking: LinhaRanking[];
  donutSize?: number;
}) {
  return (
    <View>
      {subtitulo ? <Text style={{ fontSize: 9.5, fontWeight: 700, color: COR.azul, marginBottom: 4 }}>{subtitulo}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <PdfDonut segmentos={segmentos} size={donutSize} />
        <View style={{ flex: 1 }}>
          {ranking.map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <View style={{ width: 7, height: 7, backgroundColor: r.cor, borderRadius: 1 }} />
              <Text style={{ flex: 1, fontSize: 8.5, color: COR.cinza }}>{r.label}</Text>
              <Text style={{ fontSize: 8.5, fontWeight: 700, color: COR.azul }}>{r.valorFmt}</Text>
              <Text style={{ fontSize: 8.5, color: COR.cinzaMedio, width: 30, textAlign: 'right' }}>{r.pct}%</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
