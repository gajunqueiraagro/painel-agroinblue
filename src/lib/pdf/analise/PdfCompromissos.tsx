/**
 * PdfCompromissos — tabela executiva dos maiores compromissos (Top 10 + Demais + Total).
 * PR-FIN-V2-PDF-EXECUTIVO-03. Só desenha (dados prontos).
 */
import { View, Text } from '@react-pdf/renderer';
import { COR } from '@/lib/pdf/analise/estilos';

export interface LinhaCompromisso { rank: string; label: string; valorFmt: string; pct: number; count: number; cor: string; ehDemais?: boolean; }

const cRank: { width: number; fontSize: number } = { width: 16, fontSize: 8.5 };
const cVal: { width: number; fontSize: number; textAlign: 'right' } = { width: 74, fontSize: 8.5, textAlign: 'right' };
const cPct: { width: number; fontSize: number; textAlign: 'right' } = { width: 42, fontSize: 8.5, textAlign: 'right' };
const cNum: { width: number; fontSize: number; textAlign: 'right' } = { width: 40, fontSize: 8.5, textAlign: 'right' };

export function PdfCompromissos({ linhas, totalFmt, totalCount }: { linhas: LinhaCompromisso[]; totalFmt: string; totalCount: number }) {
  return (
    <View>
      {/* Cabeçalho */}
      <View style={{ flexDirection: 'row', backgroundColor: COR.azulClaro, paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.6, borderBottomColor: COR.separador }}>
        <Text style={{ ...cRank, color: COR.azul, fontWeight: 700 }}>#</Text>
        <Text style={{ flex: 1, fontSize: 8.5, color: COR.azul, fontWeight: 700 }}>Compromisso</Text>
        <Text style={{ ...cVal, color: COR.azul, fontWeight: 700 }}>Valor</Text>
        <Text style={{ ...cPct, color: COR.azul, fontWeight: 700 }}>%</Text>
        <Text style={{ ...cNum, color: COR.azul, fontWeight: 700 }}>Nº pag.</Text>
      </View>
      {linhas.map((r, i) => (
        <View key={r.label} style={{ flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 4, backgroundColor: i % 2 ? COR.zebra : COR.branco, borderBottomWidth: 0.3, borderBottomColor: COR.separador }}>
          <Text style={{ ...cRank, color: COR.cinzaMedio }}>{r.ehDemais ? '—' : r.rank}</Text>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 6, height: 6, backgroundColor: r.cor, borderRadius: 1 }} />
            <Text style={{ fontSize: 8.5, color: COR.cinza }}>{r.label}</Text>
          </View>
          <Text style={{ ...cVal, color: COR.cinza }}>{r.valorFmt}</Text>
          <Text style={{ ...cPct, color: r.cor, fontWeight: 700 }}>{r.pct}%</Text>
          <Text style={{ ...cNum, color: COR.cinzaMedio }}>{r.count}</Text>
        </View>
      ))}
      {/* Total */}
      <View style={{ flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, borderTopWidth: 0.8, borderTopColor: COR.azul }}>
        <Text style={{ ...cRank }} />
        <Text style={{ flex: 1, fontSize: 8.5, fontWeight: 700, color: COR.azul }}>Total</Text>
        <Text style={{ ...cVal, fontWeight: 700, color: COR.azul }}>{totalFmt}</Text>
        <Text style={{ ...cPct, fontWeight: 700, color: COR.azul }}>100%</Text>
        <Text style={{ ...cNum, fontWeight: 700, color: COR.cinzaMedio }}>{totalCount}</Text>
      </View>
    </View>
  );
}
