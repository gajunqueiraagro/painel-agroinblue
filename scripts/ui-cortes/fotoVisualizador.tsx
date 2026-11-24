/**
 * VISUALIZADOR-PDF-02 — a página das fotos do `fotoVisualizador.mjs` (fora do `telas.tsx`: o gate rápido não passa a medir esta tela).
 * O visualizador ÚNICO aberto com um PDF SINTÉTICO desenhado pelo jspdf (nenhum dado de cliente): `?v=danfe` (1 página A4 em pé),
 * `?v=boleto` (A4 com a ficha de compensação), `?v=tres` (3 páginas). `window.__zoomDoNavegador` = o zoom da PÁGINA (tem de ficar 1).
 */
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { VisualizadorDeDocumento } from '@/components/financeiro-v2/VisualizadorDeDocumento';

const v = new URLSearchParams(location.search).get('v') ?? 'danfe';

async function pdfSintetico(): Promise<{ bytes: ArrayBuffer; nome: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = 595.28;
  const caixa = (x: number, y: number, w: number, h: number, rotulo: string, valor: string) => {
    doc.rect(x, y, w, h); doc.setFontSize(6); doc.text(rotulo, x + 3, y + 8); doc.setFontSize(9); doc.text(valor, x + 3, y + h - 5);
  };
  if (v === 'boleto') {
    doc.setFontSize(14); doc.text('BANCO EXEMPLO  | 000-0 |  00000.00000 00000.000000 00000.000000 0 00000000000000', 20, 40);
    caixa(20, 60, 400, 28, 'Local de pagamento', 'Pagável em qualquer banco até o vencimento');
    caixa(420, 60, 155, 28, 'Vencimento', '05/12/2026');
    caixa(20, 88, 400, 28, 'Beneficiário', 'ESCOLA FICTICIA LTDA · CNPJ 00.000.000/0001-00');
    caixa(420, 88, 155, 28, 'Agência / Código do beneficiário', '0000 / 00000-0');
    caixa(20, 116, 400, 90, 'Instruções', 'Mensalidade de dezembro (boleto de exemplo)');
    caixa(420, 116, 155, 28, '(=) Valor do documento', 'R$ 1.234,56');
    caixa(20, 206, 555, 40, 'Pagador', 'PAGADOR DE EXEMPLO · CPF 000.000.000-00');
    for (let i = 0; i < 90; i++) doc.rect(20 + i * 4.4, 260, i % 3 === 0 ? 2.6 : 1.2, 46, 'F');
    doc.setLineDashPattern([3, 3], 0); doc.line(20, 330, W - 20, 330); doc.setLineDashPattern([], 0);
    doc.setFontSize(10); doc.text('Recibo do pagador', 20, 350);
    return { bytes: doc.output('arraybuffer'), nome: 'boleto-exemplo.pdf' };
  }
  const paginas = v === 'tres' ? 3 : 1;
  for (let p = 1; p <= paginas; p++) {
    if (p > 1) doc.addPage();
    doc.setFontSize(16); doc.text(v === 'tres' ? `CONTRATO DE EXEMPLO — página ${p} de 3` : 'DANFE — Documento Auxiliar da Nota Fiscal Eletrônica', 20, 40);
    caixa(20, 55, 360, 50, 'Emitente', 'FORNECEDOR FICTICIO LTDA · Rua Exemplo, 100');
    caixa(380, 55, 195, 50, 'Chave de acesso', '0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000');
    caixa(20, 105, 555, 28, 'Destinatário', 'FAZENDA EXEMPLO');
    doc.rect(20, 140, 555, 600);
    doc.setFontSize(8);
    for (let i = 0; i < 30; i++) doc.text(`${String(i + 1).padStart(3, '0')}   PRODUTO DE EXEMPLO ${i + 1}   UN   ${(i + 1) * 3},00   R$ ${(i + 1) * 12},50`, 28, 160 + i * 19);
    doc.setFontSize(9); doc.text(`Página ${p}/${paginas}`, W - 80, 820);
  }
  return { bytes: doc.output('arraybuffer'), nome: v === 'tres' ? 'contrato-3-paginas.pdf' : 'danfe-exemplo.pdf' };
}

(async () => {
  const { bytes, nome } = await pdfSintetico();
  (window as unknown as { __zoomDoNavegador: () => number }).__zoomDoNavegador = () => window.visualViewport?.scale ?? 1;
  createRoot(document.getElementById('root') as HTMLElement).render(
    <VisualizadorDeDocumento open bytes={bytes} nome={nome} onFechar={() => {}} onNovaAba={() => {}} onBaixar={() => {}} />);
})();
