/**
 * DocumentoAnaliseExecutiva — Document react-pdf do PDF Executivo. PR-FIN-V2-PDF-EXECUTIVO-03.
 * FASE 1: Página 1 (Visão do Caixa). Páginas 2–4 nas fases seguintes.
 */
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { estilos } from '@/lib/pdf/analise/estilos';
import { PdfHeader, PdfRodape, PdfDivisoria } from '@/lib/pdf/analise/PdfHeader';
import { PdfKpis } from '@/lib/pdf/analise/PdfKpis';
import { PdfFluxoCaixa } from '@/lib/pdf/analise/PdfFluxoCaixa';
import { PdfOrganizacaoPagamentos, type DiaCalendario, type CardEtapa } from '@/lib/pdf/analise/PdfOrganizacaoPagamentos';
import { PdfBlocoDonut, type LinhaRanking } from '@/lib/pdf/analise/PdfBlocoDonut';
import { PdfCompromissos, type LinhaCompromisso } from '@/lib/pdf/analise/PdfCompromissos';
import { PdfTesouraria, type LinhaTransf } from '@/lib/pdf/analise/PdfTesouraria';
import { PdfExtrato, type LinhaExtrato } from '@/lib/pdf/analise/PdfExtrato';
import type { SegmentoDonut } from '@/lib/pdf/analise/PdfDonut';

interface BlocoDist { segmentos: SegmentoDonut[]; ranking: LinhaRanking[]; }
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
  // Página 2
  credito: BlocoDist;
  natureza: BlocoDist;
  negocio: BlocoDist;
  compromissos: { linhas: LinhaCompromisso[]; totalFmt: string; totalCount: number };
  // Página 3
  tesouraria: { recebidas: LinhaTransf[]; enviadas: LinhaTransf[]; totalRecFmt: string; totalEnvFmt: string };
  // Página 4+
  extrato: { resumo: { label: string; valor: string; cor?: string }[]; contadores: { label: string; valor: string }[]; linhas: LinhaExtrato[] };
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
        <PdfOrganizacaoPagamentos subtitulo="Concentração das saídas de caixa por período do mês (janelas móveis de 4 dias)." calendario={p.calendario} cards={p.cards} />
      </Page>

      <Page size="A4" style={estilos.pagina} wrap>
        <PdfHeader clienteNome={p.clienteNome} fazenda={p.fazenda} contaNome={p.contaNome} periodoLabel={p.periodoLabel} logoData={p.logoData} />
        <PdfRodape />

        <Text style={estilos.secao}>De onde veio o dinheiro</Text>
        <PdfBlocoDonut segmentos={p.credito.segmentos} ranking={p.credito.ranking} />

        <PdfDivisoria />
        <Text style={estilos.secao}>Para onde foi o dinheiro</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: 1 }}><PdfBlocoDonut subtitulo="Por natureza" segmentos={p.natureza.segmentos} ranking={p.natureza.ranking} donutSize={70} /></View>
          <View style={{ flex: 1 }}><PdfBlocoDonut subtitulo="Por negócio" segmentos={p.negocio.segmentos} ranking={p.negocio.ranking} donutSize={70} /></View>
        </View>

        <PdfDivisoria />
        <Text style={estilos.secao}>Principais Custos e Compromissos</Text>
        <PdfCompromissos linhas={p.compromissos.linhas} totalFmt={p.compromissos.totalFmt} totalCount={p.compromissos.totalCount} />
      </Page>

      <Page size="A4" style={estilos.pagina} wrap>
        <PdfHeader clienteNome={p.clienteNome} fazenda={p.fazenda} contaNome={p.contaNome} periodoLabel={p.periodoLabel} logoData={p.logoData} />
        <PdfRodape />

        <Text style={estilos.secao}>Transferências entre Contas (Tesouraria)</Text>
        <PdfTesouraria recebidas={p.tesouraria.recebidas} enviadas={p.tesouraria.enviadas} totalRecFmt={p.tesouraria.totalRecFmt} totalEnvFmt={p.tesouraria.totalEnvFmt} />
      </Page>

      <Page size="A4" style={estilos.pagina} wrap>
        <PdfHeader clienteNome={p.clienteNome} fazenda={p.fazenda} contaNome={p.contaNome} periodoLabel={p.periodoLabel} logoData={p.logoData} />
        <PdfRodape />

        <Text style={estilos.secao}>Extrato Financeiro do Período</Text>
        <PdfExtrato resumo={p.extrato.resumo} contadores={p.extrato.contadores} linhas={p.extrato.linhas} />
      </Page>
    </Document>
  );
}
