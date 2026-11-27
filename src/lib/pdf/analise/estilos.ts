/**
 * estilos — paleta + StyleSheet do PDF Executivo (react-pdf). PR-FIN-V2-PDF-EXECUTIVO-03.
 * Camada de APRESENTAÇÃO apenas (sem regra/dado). Fonte: Inter quando o .ttf estiver
 * registrado (registrarFontes), com fallback Helvetica (default do react-pdf).
 */
import { StyleSheet, Font } from '@react-pdf/renderer';
import { COR } from '@/lib/pdf/analise/cores';

/* A paleta mora em `cores.ts`, que não importa o motor — ver o porquê lá.
   Reexportada aqui para que os componentes de desenho sigam pedindo cor ao
   mesmo lugar de sempre. */
export { COR };

// FONTE = 'Inter' quando registrado; senão o react-pdf usa Helvetica (fallback aprovado).
export let FONTE = 'Helvetica';

/**
 * Registra Inter SE houver .ttf de asset (400/600/700). Enquanto o asset não existir, o PDF
 * usa Helvetica. Ativação futura: importar os .ttf via Vite (?url) e passar aqui — 1 ponto só.
 */
export function registrarFontes(fontes?: { regular: string; semibold?: string; bold: string }): void {
  if (!fontes) return;
  Font.register({
    family: 'Inter',
    fonts: [
      { src: fontes.regular, fontWeight: 400 },
      ...(fontes.semibold ? [{ src: fontes.semibold, fontWeight: 600 }] : []),
      { src: fontes.bold, fontWeight: 700 },
    ],
  });
  FONTE = 'Inter';
}

export const estilos = StyleSheet.create({
  pagina: { paddingTop: 66, paddingBottom: 32, paddingHorizontal: 22, fontFamily: FONTE, fontSize: 9, color: COR.cinza },
  // Header fixo
  /* MARCA-PADRAO-01 — o cabeçalho do `cabecalho-pdf.html`: logo à esquerda (≈170px = 128pt; a altura pela proporção do arquivo), título e
     contexto à direita, régua dourada (#B08A3A, 1,5px ≈ 1,1pt) embaixo. */
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1.1, borderBottomColor: '#B08A3A' },
  headerLogo: { width: 128, height: 25, objectFit: 'contain', marginRight: 10 },
  headerTexto: { alignItems: 'flex-end' },
  headerTitulo: { fontSize: 13, fontWeight: 700, color: '#0F1F3A', textAlign: 'right' },
  headerCtx: { fontSize: 8, color: '#5A6A80', marginTop: 2, textAlign: 'right' },
  // Rodapé fixo
  rodape: { position: 'absolute', bottom: 14, left: 24, right: 24, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#828282', borderTopWidth: 0.4, borderTopColor: COR.separador, paddingTop: 4 },
  // Título de seção (faixa azul)
  secao: { backgroundColor: COR.azul, color: COR.branco, fontSize: 13, fontWeight: 700, paddingVertical: 6, paddingHorizontal: 8, marginTop: 14, marginBottom: 6, borderRadius: 2 },
});
