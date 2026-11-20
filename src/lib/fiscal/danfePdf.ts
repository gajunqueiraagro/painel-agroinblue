/**
 * NOTA-RECEITA-DANFE-ANEXO-01 (Gabriel 19/11 07:35) — o DANFE em PDF a partir do XML, para ANEXAR junto com ele: a nota que vem da Receita
 * só tem o XML; ao lançar/vincular, o sistema gera o PDF e grava os dois nos documentos (um registro cada).
 * O documento é o MESMO do "PDF" da lista (`danfeDoArquivo` → `danfeHtml`, NOTA-DANFE-01): renderizado num quadro escondido, cada FOLHA
 * (210 × 297 mm) vira uma página A4 do PDF (html2canvas + jsPDF, as bibliotecas que a casa já usa). É IMAGEM da folha (o texto não se
 * seleciona); a nota fiscal de verdade continua sendo o XML, que vai junto.
 */
import { danfeDoArquivo } from '@/lib/fiscal/abrirDanfe';
import { importarDoApp } from '@/lib/app/falhaDeVersao';

/** o nome do PDF: o do XML com "-DANFE.pdf" no lugar do ".xml" */
export const nomeDoDanfe = (nomeDoXml: string): string => `${nomeDoXml.replace(/\.xml$/i, '').trim() || 'nota'}-DANFE.pdf`;

/** gera o DANFE em PDF do XML; a recusa do leitor volta como frase */
export async function danfePdfDoXml(arquivo: File): Promise<{ ok: true; pdf: File } | { ok: false; frase: string }> {
  const r = await danfeDoArquivo(arquivo);
  if (r.ok === false) return r;
  /* o import() dinâmico passa pelo dono (`importarDoApp`: a versão nova do app vira a frase de recarregar, nunca um erro cru) */
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([importarDoApp(() => import('html2canvas')), importarDoApp(() => import('jspdf'))]);
  const quadro = document.createElement('iframe');
  quadro.setAttribute('aria-hidden', 'true');
  quadro.style.cssText = 'position:fixed;left:-10000px;top:0;width:820px;height:1200px;border:0;visibility:hidden';
  document.body.appendChild(quadro);
  try {
    const doc = quadro.contentDocument;
    if (!doc) return { ok: false, frase: 'Não consegui montar o DANFE.' };
    doc.open();
    /* a folha como no papel: sem a barra de cima, sem sombra nem margem entre as folhas */
    doc.write(r.html.replace('</head>', '<style>.barra{display:none!important}.folha{margin:0!important;box-shadow:none!important}body{background:#fff!important;margin:0}</style></head>'));
    doc.close();
    await doc.fonts?.ready;
    const folhas = Array.from(doc.querySelectorAll<HTMLElement>('.folha'));
    if (folhas.length === 0) return { ok: false, frase: 'Não consegui montar o DANFE.' };
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (const [k, folha] of folhas.entries()) {
      const tela = await html2canvas(folha, { scale: 2, backgroundColor: '#ffffff', logging: false, windowWidth: 820 });
      if (k > 0) pdf.addPage();
      pdf.addImage(tela.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
    }
    return { ok: true, pdf: new File([pdf.output('blob')], nomeDoDanfe(arquivo.name), { type: 'application/pdf' }) };
  } catch {
    return { ok: false, frase: 'Não consegui gerar o PDF do DANFE.' };
  } finally {
    quadro.remove();
  }
}
