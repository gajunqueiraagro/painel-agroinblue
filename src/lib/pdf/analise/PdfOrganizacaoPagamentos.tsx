/**
 * PdfOrganizacaoPagamentos — calendário 01–fim (dias coloridos por etapa) + 4 cards grandes
 * (% em destaque · valor · nº pagamentos). PR-FIN-V2-PDF-EXECUTIVO-03. Só desenha (dados prontos).
 */
import { View, Text } from '@react-pdf/renderer';
import { COR } from '@/lib/pdf/analise/estilos';

export interface DiaCalendario { dia: number; cor: string; claro: string; }
export interface CardEtapa { nome: string; faixa: string; pct: number; valor: string; count: number; cor: string; }

export function PdfOrganizacaoPagamentos({ calendario, cards }: { calendario: DiaCalendario[]; cards: CardEtapa[] }) {
  return (
    <View>
      {/* Calendário horizontal */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1.5, marginBottom: 6 }}>
        {calendario.map((d) => (
          <View key={d.dia} style={{ width: 15, height: 13, backgroundColor: d.claro, borderWidth: 0.4, borderColor: COR.separador, borderRadius: 1.5, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 6, color: d.cor }}>{String(d.dia).padStart(2, '0')}</Text>
          </View>
        ))}
      </View>
      {/* 4 cards das etapas */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {cards.map((c) => (
          <View key={c.nome} style={{ flex: 1, borderWidth: 0.8, borderColor: c.cor, borderRadius: 3, paddingVertical: 7, paddingHorizontal: 8 }}>
            <Text style={{ fontSize: 8.5, fontWeight: 700, color: c.cor }}>{c.nome}</Text>
            <Text style={{ fontSize: 7, color: COR.cinzaMedio, marginBottom: 3 }}>{c.faixa}</Text>
            <Text style={{ fontSize: 22, fontWeight: 700, color: c.cor }}>{c.pct}%</Text>
            <Text style={{ fontSize: 7, color: COR.cinzaMedio }}>das saídas do mês</Text>
            <Text style={{ fontSize: 9.5, fontWeight: 700, color: COR.cinza, marginTop: 4 }}>{c.valor}</Text>
            <Text style={{ fontSize: 7, color: COR.cinzaMedio }}>{c.count} pagamento{c.count !== 1 ? 's' : ''}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
