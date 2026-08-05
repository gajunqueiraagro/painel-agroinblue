/**
 * estilos — paleta + StyleSheet do PDF Executivo (react-pdf). PR-FIN-V2-PDF-EXECUTIVO-03.
 * Camada de APRESENTAÇÃO apenas (sem regra/dado). Fonte: Inter quando o .ttf estiver
 * registrado (registrarFontes), com fallback Helvetica (default do react-pdf).
 */
import { StyleSheet, Font } from '@react-pdf/renderer';

export const COR = {
  azul: '#1e3a5f',
  azulClaro: '#eef6ff',
  cinza: '#505050',
  cinzaMedio: '#787878',
  separador: '#d9e2ec',
  zebra: '#f7fafc',
  verde: '#22784a',
  vermelho: '#b91c1c',
  ambar: '#d77706',
  branco: '#ffffff',
};

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
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.6, borderBottomColor: COR.separador },
  headerLogo: { width: 42, height: 21, objectFit: 'contain', marginRight: 10 },
  headerTitulo: { fontSize: 13, fontWeight: 700, color: COR.azul },
  headerCtx: { fontSize: 8, color: COR.cinzaMedio, marginTop: 2 },
  // Rodapé fixo
  rodape: { position: 'absolute', bottom: 14, left: 24, right: 24, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#828282', borderTopWidth: 0.4, borderTopColor: COR.separador, paddingTop: 4 },
  // Título de seção (faixa azul)
  secao: { backgroundColor: COR.azul, color: COR.branco, fontSize: 13, fontWeight: 700, paddingVertical: 6, paddingHorizontal: 8, marginTop: 14, marginBottom: 6, borderRadius: 2 },
});
