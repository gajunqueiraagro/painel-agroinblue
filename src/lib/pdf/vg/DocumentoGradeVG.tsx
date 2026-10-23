/**
 * P90 — o PDF da grade ampliada da Visão Geral (A4 paisagem), no padrão do PDF da CPR (`DocumentoCpr`): o mesmo cabeçalho
 * (`PdfHeader`: cliente, contas, período e a 2ª linha com recorte, chips ligados, critério e emissão), o resumo do mês em quatro
 * números e a grade inteira. Só escreve o `ModeloGradeVG` (textos prontos do banco).
 */
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { estilos, COR } from '@/lib/pdf/analise/estilos';
import { PdfHeader, PdfRodape } from '@/lib/pdf/analise/PdfHeader';
import type { ModeloGradeVG, TomVG } from '@/lib/pdf/vg/modeloGradeVG';

const corDoTom = (t: TomVG) => (t === 'ent' ? '#1f3864' : t === 'sai' ? '#b3261e' : t === 'neg' ? '#b3261e' : t === 'pos' ? '#1d5fb3' : COR.cinzaMedio);
const semHifen = (palavra: string): string[] => [palavra];
/* ⚠ O SINAL: o modelo (e a tela) escrevem o "−" tipográfico (U+2212), que a fonte do PDF (Helvetica) NÃO tem — o react-pdf o descarta e
   o negativo sai como positivo (medido no PDF do Agnaldo, ago/26: "−R$ 2.191.723,67" saiu "R$ 2.191.723,67"). No PDF vai o hífen. */
export const sinalNoPdf = (t: string) => t.replace(/\u2212/g, '-');
const corta: { maxLines: number; textOverflow: 'ellipsis' } = { maxLines: 1, textOverflow: 'ellipsis' };

export function DocumentoGradeVG({ modelo: m, logoData }: { modelo: ModeloGradeVG; logoData?: string }) {
  const n = m.meses.length;
  /* larguras: o nome, os meses (o que sobra) e Total · Média · % */
  const wNome = 118, wTot = 50, wMed = 44, wPct = 30;
  const fs = n > 14 ? 5.6 : 6.4;
  const Cel = ({ texto, cor, largura, flex, fundo, negrito, italico, alinhar = 'right' }: { texto: string; cor: string; largura?: number; flex?: number; fundo?: string; negrito?: boolean; italico?: boolean; alinhar?: 'left' | 'right' }) => (
    <View style={{ width: largura, flex, paddingHorizontal: 2, justifyContent: 'center', backgroundColor: fundo, borderLeftWidth: 0.4, borderLeftColor: '#e6eaef' }}>
      <Text hyphenationCallback={semHifen} style={{ ...corta, fontSize: fs, textAlign: alinhar, color: cor, fontWeight: negrito ? 700 : 400, fontStyle: italico ? 'italic' : 'normal' }}>{sinalNoPdf(texto)}</Text>
    </View>
  );
  return (
    <Document title="Visão Geral · Entradas e saídas" author="AGROinBLUE">
      <Page size="A4" orientation="landscape" style={{ ...estilos.pagina, paddingTop: 74 }} wrap>
        <PdfHeader titulo="Visão Geral · Entradas e saídas" clienteNome={m.cabecalho.clienteNome} contaNome={m.cabecalho.contaNome}
          periodoLabel={m.cabecalho.periodo} linha2={m.cabecalho.linha2} logoData={logoData} />
        <PdfRodape />
        <View style={{ flexDirection: 'row', borderWidth: 0.6, borderColor: COR.separador, borderRadius: 2, marginBottom: 8 }}>
          {m.resumo.map((r, i) => (
            <View key={r.rotulo} style={{ flex: 1, paddingVertical: 5, paddingHorizontal: 6, borderLeftWidth: i === 0 ? 0 : 0.6, borderLeftColor: COR.separador }}>
              <Text style={{ fontSize: 7.5, color: COR.cinzaMedio }}>{r.rotulo}</Text>
              <Text hyphenationCallback={semHifen} style={{ fontSize: 10.5, fontWeight: 700, marginTop: 2, color: corDoTom(r.tom) }}>{sinalNoPdf(r.valor)}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', height: 13, backgroundColor: '#2f3d4f' }} fixed>
          <View style={{ width: wNome, paddingHorizontal: 3, justifyContent: 'center' }}><Text style={{ fontSize: 5.8, color: '#fff' }}>{m.unidade}</Text></View>
          {m.meses.map((x, i) => (
            <View key={i} style={{ flex: 1, paddingHorizontal: 2, justifyContent: 'center', backgroundColor: x.escolhido ? '#1b2430' : x.previsto ? '#55657a' : undefined }}>
              <Text style={{ fontSize: fs, color: '#fff', textAlign: 'right', fontWeight: 700 }}>{x.rotulo}</Text>
            </View>
          ))}
          {['TOTAL', 'MÉDIA', '%'].map((t, i) => (
            <View key={t} style={{ width: [wTot, wMed, wPct][i], paddingHorizontal: 2, justifyContent: 'center', backgroundColor: '#2f3d4f' }}>
              <Text style={{ fontSize: fs, color: '#fff', textAlign: 'right', fontWeight: 700 }}>{t}</Text>
            </View>
          ))}
        </View>
        {m.linhas.map((l, j) => {
          const forte = l.nivel === 'forte' || l.nivel === 'saldo';
          return (
            <View key={j} wrap={false} style={{ flexDirection: 'row', height: l.nivel === 'grupo' || l.nivel === 'miuda' ? 10.5 : 12,
              backgroundColor: l.nivel === 'saldo' ? '#f1f3f6' : l.nivel === 'forte' ? (l.tom === 'sai' ? '#fbeeee' : l.tom === 'ent' ? '#eef3fa' : '#f1f3f6') : undefined,
              borderBottomWidth: 0.4, borderBottomColor: '#e6eaef' }}>
              <View style={{ width: wNome, paddingLeft: l.nivel === 'grupo' ? 9 : l.nivel === 'miuda' ? 14 : 3, paddingRight: 2, justifyContent: 'center' }}>
                <Text hyphenationCallback={semHifen} style={{ ...corta, fontSize: fs, fontWeight: forte ? 700 : 400, color: l.tom === 'sai' ? '#b3261e' : l.tom === 'ent' ? '#1f3864' : '#1b2430' }}>{l.rotulo}</Text>
              </View>
              {l.celulas.map((c, i) => (
                <Cel key={i} texto={c.texto} cor={corDoTom(c.tom)} flex={1} negrito={forte || m.meses[i].escolhido} italico={c.previsto && !m.meses[i].escolhido}
                  fundo={m.meses[i].escolhido ? 'rgba(31,63,102,0.07)' : c.previsto ? '#f8f9fb' : undefined} />
              ))}
              <Cel texto={l.total} cor={corDoTom(l.tom)} largura={wTot} negrito fundo="#eef0f3" />
              <Cel texto={l.media} cor={corDoTom(l.tom)} largura={wMed} negrito fundo="#eef0f3" />
              <Cel texto={l.pct} cor={corDoTom(l.tom)} largura={wPct} fundo="#eef0f3" />
            </View>
          );
        })}
      </Page>
    </Document>
  );
}
