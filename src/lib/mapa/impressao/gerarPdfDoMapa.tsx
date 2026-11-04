/**
 * MAPA-IMPRESSAO-01 — gera e BAIXA o PDF da folha (no navegador, D2). O motor (@react-pdf) e o documento entram por `import()` dinâmico
 * (`importarDoApp`: a tela do mapa não carrega o motor). A imagem do satélite só com a chave Esri; sem ela (ou se falhar) sai sem satélite
 * e o motivo volta para o diálogo dizer.
 */
import fonteRegular from 'pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url';
import fonteNegrito from 'pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url';
import fonteItalico from 'pdfjs-dist/standard_fonts/LiberationSans-Italic.ttf?url';
import fonteNegritoItalico from 'pdfjs-dist/standard_fonts/LiberationSans-BoldItalic.ttf?url';
import { importarDoApp } from '@/lib/app/falhaDeVersao';
import { carregarLogoBase64 } from '@/lib/pdf/pdfChassi';
import { chaveEsri, comporNoNavegador, lerEstiloNoNavegador, lerFundo } from './imagemDoFundo';
import { montarFolha, type EntradaDaFolha } from './montarFolha';

export const FRASE_SEM_POLIGONO = 'Esta fazenda não tem nenhum polígono no mapa: não há o que imprimir.';

const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'mapa';

/** O nome do arquivo: mapa_<fazenda>_<A3>_<AAAA-MM>.pdf */
export const nomeDoArquivo = (fazenda: string, tamanho: string, anoMes: string) => `mapa_${slug(fazenda)}_${tamanho}_${anoMes}.pdf`;

export interface ResultadoDoPdf { arquivo: string; comImagem: boolean; motivoSemImagem: string | null }

export async function gerarPdfDoMapa(e: { entrada: EntradaDaFolha; querImagem: boolean }): Promise<ResultadoDoPdf> {
  const folha = montarFolha(e.entrada);
  if (!folha) throw new Error(FRASE_SEM_POLIGONO);
  const fundo = await lerFundo({
    querImagem: e.querImagem, chave: chaveEsri(), fuso: folha.enq.fuso, extensao: folha.enq.extensao,
    quadroMm: { w: folha.layout.quadro.w, h: folha.layout.quadro.h }, lerEstiloJson: lerEstiloNoNavegador, compor: comporNoNavegador,
  });
  let logo: string | null = null;
  try { logo = await carregarLogoBase64(); } catch { logo = null; }

  const [{ pdf }, { FolhaDoMapaPdf, registrarFonteDaFolha }] = await Promise.all([
    importarDoApp(() => import('@react-pdf/renderer')),
    importarDoApp(() => import('@/lib/mapa/impressao/FolhaDoMapaPdf')),
  ]);
  registrarFonteDaFolha({ regular: fonteRegular, negrito: fonteNegrito, italico: fonteItalico, negritoItalico: fonteNegritoItalico });
  const blob = await pdf(<FolhaDoMapaPdf folha={folha} fundo={fundo} logo={logo} />).toBlob();

  const arquivo = nomeDoArquivo(e.entrada.identificacao.fazenda, e.entrada.tamanho, e.entrada.anoMes);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = arquivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { arquivo, comImagem: fundo.tipo === 'imagem', motivoSemImagem: fundo.tipo === 'papel' ? fundo.motivo : null };
}
