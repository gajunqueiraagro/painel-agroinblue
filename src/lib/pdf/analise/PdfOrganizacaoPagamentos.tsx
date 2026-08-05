/**
 * PdfOrganizacaoPagamentos — calendário 01–fim (dias coloridos por etapa) + 4 cards grandes
 * (% em destaque · valor · nº pagamentos). PR-FIN-V2-PDF-EXECUTIVO-03. Só desenha (dados prontos).
 */
import { View, Text } from '@react-pdf/renderer';
import { COR } from '@/lib/pdf/analise/estilos';

export interface DiaCalendario { dia: number; cor: string; claro: string; }
export interface CardEtapa { nome: string; faixa: string; pct: number; valor: string; count: number; cor: string; }

export function PdfOrganizacaoPagamentos({ subtitulo, calendario, cards }: { subtitulo?: string; calendario: DiaCalendario[]; cards: CardEtapa[] }) {
  return (
    <View>
      {subtitulo ? <Text style={{ fontSize: 8.5, color: COR.cinzaMedio, marginBottom: 8 }}>{subtitulo}</Text> : null}
      {/* Calendário horizontal */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2.5, marginBottom: 12 }}>
        {calendario.map((d) => (
          <View key={d.dia} style={{ width: 17.5, height: 22, backgroundColor: d.claro, borderWidth: 0.5, borderColor: COR.separador, borderRadius: 2.5, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 9, color: d.cor }}>{String(d.dia).padStart(2, '0')}</Text>
          </View>
        ))}
      </View>
      {/* 4 cards por janela de datas (faixa em destaque; nome secundário) */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {cards.map((c) => (
          <View key={c.nome} style={{ flex: 1, borderWidth: 1, borderColor: c.cor, borderRadius: 4, paddingVertical: 14, paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: 700, color: c.cor }}>{c.faixa}</Text>
            <Text style={{ fontSize: 8.5, color: COR.cinzaMedio, marginBottom: 7 }}>{c.nome}</Text>
            <Text style={{ fontSize: 34, fontWeight: 700, color: c.cor }}>{c.pct}%</Text>
            <Text style={{ fontSize: 8.5, color: COR.cinzaMedio }}>das saídas do mês</Text>
            <Text style={{ fontSize: 14, fontWeight: 700, color: COR.cinza, marginTop: 9 }}>{c.valor}</Text>
            <Text style={{ fontSize: 8.5, color: COR.cinzaMedio, marginTop: 1 }}>{c.count} pagamento{c.count !== 1 ? 's' : ''}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
