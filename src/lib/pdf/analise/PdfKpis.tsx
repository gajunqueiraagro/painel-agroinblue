/**
 * PdfKpis — grid de cards KPI (mesmo padrão executivo da tela). PR-FIN-V2-PDF-EXECUTIVO-03.
 * Recebe só valores prontos (label/valor) — sem cálculo.
 */
import { View, Text } from '@react-pdf/renderer';
import { COR } from '@/lib/pdf/analise/estilos';

export function PdfKpis({ itens }: { itens: { label: string; valor: string; cor?: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 7 }}>
      {itens.map((k) => (
        <View key={k.label} style={{ flex: 1, backgroundColor: COR.azulClaro, borderWidth: 0.6, borderColor: COR.separador, borderRadius: 4, paddingVertical: 14, paddingHorizontal: 10 }}>
          <Text style={{ fontSize: 8.5, color: COR.cinzaMedio, textTransform: 'uppercase', letterSpacing: 0.3 }}>{k.label}</Text>
          <Text style={{ fontSize: 17, fontWeight: 700, color: k.cor ?? COR.azul, marginTop: 7 }}>{k.valor}</Text>
        </View>
      ))}
    </View>
  );
}
