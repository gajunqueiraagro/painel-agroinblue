/**
 * PdfTesouraria — Transferências entre contas: Recebidas (verde) e Enviadas (vermelho).
 * PR-FIN-V2-PDF-EXECUTIVO-03 (FASE 3). Só desenha (dados prontos).
 */
import { View, Text } from '@react-pdf/renderer';
import { COR } from '@/lib/pdf/analise/estilos';

export interface LinhaTransf { data: string; descricao: string; contaOrigem: string; contaDestino: string; valorFmt: string; status: string; statusCor: string; }

const cData: { width: number } = { width: 34 };
const cConta: { width: number } = { width: 94 };
const cValor: { width: number; textAlign: 'right'; paddingRight: number } = { width: 66, textAlign: 'right', paddingRight: 8 };
const cStatus: { width: number } = { width: 58 };

function Tabela({ titulo, cor, linhas, totalFmt }: { titulo: string; cor: string; linhas: LinhaTransf[]; totalFmt: string }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 10, fontWeight: 700, color: cor, marginBottom: 4 }}>{titulo} — {totalFmt}</Text>
      {linhas.length === 0 ? (
        <Text style={{ fontSize: 8.5, color: COR.cinzaMedio }}>Nenhuma no período.</Text>
      ) : (
        <View style={{ borderWidth: 0.5, borderColor: COR.separador, borderRadius: 2 }}>
          <View style={{ flexDirection: 'row', backgroundColor: COR.azulClaro, paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: COR.separador }}>
            <Text style={{ ...cData, fontSize: 8, fontWeight: 700, color: COR.azul }}>Data</Text>
            <Text style={{ flex: 1, fontSize: 8, fontWeight: 700, color: COR.azul }}>Descrição</Text>
            <Text style={{ ...cConta, fontSize: 8, fontWeight: 700, color: COR.azul }}>Conta origem</Text>
            <Text style={{ ...cConta, fontSize: 8, fontWeight: 700, color: COR.azul }}>Conta destino</Text>
            <Text style={{ ...cValor, fontSize: 8, fontWeight: 700, color: COR.azul }}>Valor</Text>
            <Text style={{ ...cStatus, fontSize: 8, fontWeight: 700, color: COR.azul }}>Status</Text>
          </View>
          {linhas.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 4, backgroundColor: i % 2 ? COR.zebra : COR.branco, borderBottomWidth: 0.3, borderBottomColor: COR.separador }}>
              <Text style={{ ...cData, fontSize: 8, color: COR.cinza }}>{r.data}</Text>
              <Text style={{ flex: 1, fontSize: 8, color: COR.cinza }}>{r.descricao}</Text>
              <Text style={{ ...cConta, fontSize: 8, color: COR.cinza }}>{r.contaOrigem}</Text>
              <Text style={{ ...cConta, fontSize: 8, color: COR.cinza }}>{r.contaDestino}</Text>
              <Text style={{ ...cValor, fontSize: 8, fontWeight: 700, color: cor }}>{r.valorFmt}</Text>
              <Text style={{ ...cStatus, fontSize: 8, fontWeight: 700, color: r.statusCor }}>{r.status}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function PdfTesouraria({ recebidas, enviadas, totalRecFmt, totalEnvFmt }: {
  recebidas: LinhaTransf[]; enviadas: LinhaTransf[]; totalRecFmt: string; totalEnvFmt: string;
}) {
  const vazio = recebidas.length === 0 && enviadas.length === 0;
  if (vazio) return <Text style={{ fontSize: 9, color: COR.cinzaMedio }}>Nenhuma transferência entre contas próprias no período.</Text>;
  return (
    <View>
      <Tabela titulo="Transferências Recebidas" cor={COR.verde} linhas={recebidas} totalFmt={totalRecFmt} />
      <Tabela titulo="Transferências Enviadas" cor={COR.vermelho} linhas={enviadas} totalFmt={totalEnvFmt} />
      <Text style={{ fontSize: 8, color: COR.cinzaMedio, marginTop: 2 }}>Transferências entre contas próprias não representam resultado econômico; impactam saldo, fluxo de caixa e planejamento financeiro.</Text>
    </View>
  );
}
