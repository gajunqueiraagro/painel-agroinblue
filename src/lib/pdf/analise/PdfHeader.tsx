/**
 * PdfHeader — cabeçalho fixo (todas as páginas): logo + identidade + contexto.
 * PR-FIN-V2-PDF-EXECUTIVO-03. Só apresentação.
 */
import { View, Text, Image } from '@react-pdf/renderer';
import { estilos, COR } from '@/lib/pdf/analise/estilos';

export function PdfHeader({ clienteNome, fazenda, contaNome, periodoLabel, logoData, titulo = 'Análise Financeira Executiva', linha2 }: {
  clienteNome: string;
  fazenda?: string;
  contaNome: string;
  periodoLabel: string;
  logoData?: string;
  /** CPR-EXPORT-01: o título do documento. O padrão é o do PDF executivo — sem a prop, ele sai idêntico. */
  titulo?: string;
  /** CPR-EXPORT-01: segunda linha de contexto (segmento, emissão). Sem a prop, não existe. */
  linha2?: string;
}) {
  const ctx = [clienteNome, fazenda, `Conta: ${contaNome}`, periodoLabel].filter(Boolean).join('   ·   ');
  return (
    <View style={estilos.header} fixed>
      {logoData ? <Image src={logoData} style={estilos.headerLogo} /> : null}
      <View>
        <Text style={estilos.headerTitulo}>{titulo}</Text>
        <Text style={estilos.headerCtx}>{ctx}</Text>
        {linha2 ? <Text style={estilos.headerCtx}>{linha2}</Text> : null}
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
