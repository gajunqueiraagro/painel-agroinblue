/**
 * PdfExtrato — Extrato Financeiro do Período (react-pdf). PR-FIN-V2-PDF-EXECUTIVO-03 (FASE 4).
 * Resumo (cards) + contadores de status + tabela paginada (cabeçalho repetido `fixed`, linhas
 * `wrap={false}`, moeda +R$/-R$, saldo verde/vermelho, fechamento diário em negrito). Só desenha.
 */
import { View, Text } from '@react-pdf/renderer';
import { COR } from '@/lib/pdf/analise/estilos';
import { PdfKpis } from '@/lib/pdf/analise/PdfKpis';

export interface LinhaExtrato {
  data: string; descricao: string; fornecedor: string; centro: string;
  valorFmt: string; valorPos: boolean; saldoFmt: string; saldoNeg: boolean | null;
  status: string; doc: string; ehFechamento: boolean;
}

const wData: { width: number } = { width: 34 };
const wForn: { width: number } = { width: 74 };
const wCentro: { width: number } = { width: 52 };
const wValor: { width: number; textAlign: 'right' } = { width: 56, textAlign: 'right' };
const wSaldo: { width: number; textAlign: 'right' } = { width: 56, textAlign: 'right' };
const wStatus: { width: number } = { width: 50 };
const wDoc: { width: number } = { width: 46 };
const F = 7;

export function PdfExtrato({ resumo, contadores, linhas }: {
  resumo: { label: string; valor: string; cor?: string }[];
  contadores: { label: string; valor: string }[];
  linhas: LinhaExtrato[];
}) {
  return (
    <View>
      <PdfKpis itens={resumo} />
      <View style={{ height: 6 }} />
      <PdfKpis itens={contadores} />
      <View style={{ height: 8 }} />

      {linhas.length === 0 ? (
        <Text style={{ fontSize: 9, color: COR.cinzaMedio }}>Nenhuma movimentação para esta conta no período.</Text>
      ) : (
        <View>
          {/* Cabeçalho da tabela — repete em todas as páginas */}
          <View fixed style={{ flexDirection: 'row', backgroundColor: COR.azul, paddingVertical: 3, paddingHorizontal: 4 }}>
            <Text style={{ ...wData, fontSize: F, color: COR.branco, fontWeight: 700 }}>Data</Text>
            <Text style={{ flex: 1, fontSize: F, color: COR.branco, fontWeight: 700 }}>Descrição</Text>
            <Text style={{ ...wForn, fontSize: F, color: COR.branco, fontWeight: 700 }}>Fornecedor</Text>
            <Text style={{ ...wCentro, fontSize: F, color: COR.branco, fontWeight: 700 }}>Centro</Text>
            <Text style={{ ...wValor, fontSize: F, color: COR.branco, fontWeight: 700 }}>Valor</Text>
            <Text style={{ ...wSaldo, fontSize: F, color: COR.branco, fontWeight: 700 }}>Saldo</Text>
            <Text style={{ ...wStatus, fontSize: F, color: COR.branco, fontWeight: 700 }}>Status</Text>
            <Text style={{ ...wDoc, fontSize: F, color: COR.branco, fontWeight: 700 }}>Doc</Text>
          </View>
          {linhas.map((r, i) => (
            <View key={i} wrap={false} style={{ flexDirection: 'row', paddingVertical: 1.6, paddingHorizontal: 4, backgroundColor: i % 2 ? COR.zebra : COR.branco, borderBottomWidth: 0.3, borderBottomColor: COR.separador }}>
              <Text style={{ ...wData, fontSize: F, color: COR.cinza, fontWeight: r.ehFechamento ? 700 : 400 }}>{r.data}</Text>
              <Text style={{ flex: 1, fontSize: F, color: COR.cinza }}>{r.descricao}</Text>
              <Text style={{ ...wForn, fontSize: F, color: COR.cinza }}>{r.fornecedor}</Text>
              <Text style={{ ...wCentro, fontSize: F, color: COR.cinzaMedio }}>{r.centro}</Text>
              <Text style={{ ...wValor, fontSize: F, color: r.valorPos ? COR.verde : COR.vermelho }}>{r.valorFmt}</Text>
              <Text style={{ ...wSaldo, fontSize: F, fontWeight: r.ehFechamento ? 700 : 400, color: r.saldoNeg == null ? COR.cinza : r.saldoNeg ? COR.vermelho : COR.verde }}>{r.saldoFmt}</Text>
              <Text style={{ ...wStatus, fontSize: F, color: COR.cinzaMedio }}>{r.status}</Text>
              <Text style={{ ...wDoc, fontSize: F, color: COR.cinzaMedio }}>{r.doc}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
