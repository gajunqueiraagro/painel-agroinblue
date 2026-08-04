/**
 * DocumentoAnaliseExecutiva — Document react-pdf do PDF Executivo. PR-FIN-V2-PDF-EXECUTIVO-03.
 * FASE 1: Página 1 (Visão do Caixa). Páginas 2–4 nas fases seguintes.
 */
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { estilos } from '@/lib/pdf/analise/estilos';
import { PdfHeader, PdfRodape } from '@/lib/pdf/analise/PdfHeader';
import { PdfKpis } from '@/lib/pdf/analise/PdfKpis';
import { PdfFluxoCaixa } from '@/lib/pdf/analise/PdfFluxoCaixa';
import { PdfOrganizacaoPagamentos, type DiaCalendario, type CardEtapa } from '@/lib/pdf/analise/PdfOrganizacaoPagamentos';

export interface DocProps {
  clienteNome: string;
  fazenda?: string;
  contaNome: string;
  periodoLabel: string;
  logoData?: string;
  kpis: { label: string; valor: string }[];
  serie: { dia: string; mov: number; saldo: number }[];
  fmt: (v: number) => string;
  calendario: DiaCalendario[];
  cards: CardEtapa[];
  notaProjetado?: string;
}

export function DocumentoAnaliseExecutiva(p: DocProps) {
  return (
    <Document title="Análise Financeira Executiva" author="AGROinBLUE">
      <Page size="A4" style={estilos.pagina} wrap>
        <PdfHeader clienteNome={p.clienteNome} fazenda={p.fazenda} contaNome={p.contaNome} periodoLabel={p.periodoLabel} logoData={p.logoData} />
        <PdfRodape />

        <PdfKpis itens={p.kpis} />

        <Text style={estilos.secao}>Evolução do Caixa</Text>
        <PdfFluxoCaixa serie={p.serie} fmt={p.fmt} />
        {p.notaProjetado ? <Text style={{ fontSize: 7.5, color: '#5a5a5a', marginTop: 3 }}>{p.notaProjetado}</Text> : null}

        <Text style={estilos.secao}>Organização dos Pagamentos</Text>
        <PdfOrganizacaoPagamentos calendario={p.calendario} cards={p.cards} />
      </Page>
    </Document>
  );
}
