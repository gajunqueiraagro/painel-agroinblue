/**
 * PdfHeader — cabeçalho fixo (todas as páginas): logo + identidade + contexto.
 * PR-FIN-V2-PDF-EXECUTIVO-03. Só apresentação.
 */
import { View, Text, Image } from '@react-pdf/renderer';
import { estilos, COR } from '@/lib/pdf/analise/estilos';

export function PdfHeader({ clienteNome, fazenda, contaNome, periodoLabel, logoData }: {
  clienteNome: string;
  fazenda?: string;
  contaNome: string;
  periodoLabel: string;
  logoData?: string;
}) {
  const ctx = [clienteNome, fazenda, `Conta: ${contaNome}`, periodoLabel].filter(Boolean).join('   ·   ');
  return (
    <View style={estilos.header} fixed>
      {logoData ? <Image src={logoData} style={estilos.headerLogo} /> : null}
      <View>
        <Text style={estilos.headerTitulo}>Análise Financeira Executiva</Text>
        <Text style={estilos.headerCtx}>{ctx}</Text>
      </View>
    </View>
  );
}

export function PdfRodape() {
  return (
    <View style={estilos.rodape} fixed>
      <Text>AGROinBLUE • Gestão Rural Inteligente</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

// Divisória horizontal leve entre blocos.
export function PdfDivisoria() {
  return <View style={{ borderBottomWidth: 0.5, borderBottomColor: COR.separador, marginVertical: 6 }} />;
}
