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
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginBottom: 10 }}>
        {calendario.map((d) => (
          <View key={d.dia} style={{ width: 15.5, height: 18, backgroundColor: d.claro, borderWidth: 0.5, borderColor: COR.separador, borderRadius: 2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 7.5, color: d.cor }}>{String(d.dia).padStart(2, '0')}</Text>
          </View>
        ))}
      </View>
      {/* 4 cards das etapas */}
      <View style={{ flexDirection: 'row', gap: 7 }}>
        {cards.map((c) => (
          <View key={c.nome} style={{ flex: 1, borderWidth: 1, borderColor: c.cor, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 11 }}>
            <Text style={{ fontSize: 10, fontWeight: 700, color: c.cor }}>{c.nome}</Text>
            <Text style={{ fontSize: 8, color: COR.cinzaMedio, marginBottom: 6 }}>{c.faixa}</Text>
            <Text style={{ fontSize: 30, fontWeight: 700, color: c.cor }}>{c.pct}%</Text>
            <Text style={{ fontSize: 8, color: COR.cinzaMedio }}>das saídas do mês</Text>
            <Text style={{ fontSize: 12, fontWeight: 700, color: COR.cinza, marginTop: 8 }}>{c.valor}</Text>
            <Text style={{ fontSize: 8, color: COR.cinzaMedio, marginTop: 1 }}>{c.count} pagamento{c.count !== 1 ? 's' : ''}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
