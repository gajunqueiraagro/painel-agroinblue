/**
 * PdfKpis — grid de cards KPI (mesmo padrão executivo da tela). PR-FIN-V2-PDF-EXECUTIVO-03.
 * Recebe só valores prontos (label/valor) — sem cálculo.
 */
import { View, Text } from '@react-pdf/renderer';
import { COR } from '@/lib/pdf/analise/estilos';

// Escala dinâmica: fonte grande p/ valores curtos; reduz conforme o comprimento para nunca
// estourar a largura do card (ex.: "R$ 208.561,46", "-R$ 12.345,67"). Só apresentação.
function fontValor(v: string): number {
  const n = v.length;
  if (n <= 8) return 17;
  if (n <= 11) return 14;
  if (n <= 14) return 11;
  if (n <= 18) return 10;
  return 9;
}

export function PdfKpis({ itens }: { itens: { label: string; valor: string; cor?: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 7 }}>
      {itens.map((k) => (
        <View key={k.label} style={{ flex: 1, backgroundColor: COR.azulClaro, borderWidth: 0.6, borderColor: COR.separador, borderRadius: 4, paddingVertical: 14, paddingHorizontal: 10 }}>
          <Text style={{ fontSize: 8.5, color: COR.cinzaMedio, textTransform: 'uppercase', letterSpacing: 0.3 }}>{k.label}</Text>
          <Text wrap={false} style={{ fontSize: fontValor(k.valor), fontWeight: 700, color: k.cor ?? COR.azul, marginTop: 7 }}>{k.valor}</Text>
        </View>
      ))}
    </View>
  );
}
