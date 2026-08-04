/**
 * capturarAnalise — captura os COMPONENTES REAIS da Análise (mesmos props/dados da tela) como
 * imagem PNG de alta resolução, para o PDF Executivo (PR-FIN-V2-PDF-EXECUTIVO-02 · D-2).
 *
 * Sem versões paralelas: renderiza ExtratoAnaliseFluxo / ExtratoOrganizacaoPagamentos /
 * ExtratoDistribuicaoEconomica / ExtratoMaioresCompromissos num container off-screen de largura
 * fixa e usa html2canvas (scale alto) → dataURL. KPIs/Extrato/Transferências seguem nativos.
 */
import { type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { ExtratoAnaliseFluxo } from '@/components/financeiro-v2/ExtratoAnaliseFluxo';
import { ExtratoOrganizacaoPagamentos } from '@/components/financeiro-v2/ExtratoOrganizacaoPagamentos';
import { ExtratoDistribuicaoEconomica } from '@/components/financeiro-v2/ExtratoDistribuicaoEconomica';
import { ExtratoMaioresCompromissos } from '@/components/financeiro-v2/ExtratoMaioresCompromissos';

export interface ImagemCapturada { dataUrl: string; w: number; h: number; }
export interface ImagensAnalise {
  evolucao?: ImagemCapturada;
  organizacao?: ImagemCapturada;
  distribuicao?: ImagemCapturada;
  compromissos?: ImagemCapturada;
}

// Superset de dadosOrg (serve p/ Organização/Distribuição/Compromissos — cada um usa um subconjunto).
interface ItemAnalise {
  id: string; data: string; mov: number; tipo: string;
  centro: string | null; produto: string | null; fornecedor: string; doc: string;
  macro: string | null; grupo: string | null; centroPlano: string | null; escopo: string | null;
}
// Props espelham a tela (mesmos dados/helpers).
export interface DadosCaptura {
  linhas: { data: string; mov: number; saldo: number | null }[];
  itens: ItemAnalise[];
  saldoIni: number | null;
  contaNome: string;
  periodoLabel: string;
  ano: number;
  mes: number;
}

// Largura off-screen POR componente = a max-w de cada um na tela (preserva o layout desenhado).
const LARG = { evo: 780, org: 900, dist: 620, comp: 720 };
const LARG_MAX = 900;
const ESCALA = 2.5;  // 2x mínimo · 3x se necessário (fidelidade sem arquivo pesado)
const ESPERA_MS = 1700; // > duração da animação recharts (~1500ms) → linha/barras completas na captura

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function capturarNo(el: HTMLElement | null): Promise<ImagemCapturada | undefined> {
  if (!el) return undefined;
  const canvas = await html2canvas(el, { scale: ESCALA, backgroundColor: '#ffffff', logging: false, useCORS: true });
  return { dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
}

export async function capturarAnalise(d: DadosCaptura): Promise<ImagensAnalise> {
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-99999px;top:0;width:${LARG_MAX}px;background:#ffffff;z-index:-1;`;
  document.body.appendChild(container);

  const mk = (id: string, largura: number): HTMLDivElement => {
    const w = document.createElement('div');
    w.id = id; w.style.cssText = `width:${largura}px;background:#ffffff;padding:8px;`;
    container.appendChild(w);
    return w;
  };
  const boxEvo = mk('cap-evo', LARG.evo), boxOrg = mk('cap-org', LARG.org), boxDist = mk('cap-dist', LARG.dist), boxComp = mk('cap-comp', LARG.comp);

  const roots: Root[] = [];
  const render = (box: HTMLElement, node: ReactElement) => { const r = createRoot(box); r.render(node); roots.push(r); };
  render(boxEvo, <ExtratoAnaliseFluxo linhas={d.linhas} saldoIni={d.saldoIni} contaNome={d.contaNome} periodoLabel={d.periodoLabel} ano={d.ano} mes={d.mes} />);
  render(boxOrg, <ExtratoOrganizacaoPagamentos itens={d.itens} ano={d.ano} mes={d.mes} contaNome={d.contaNome} periodoLabel={d.periodoLabel} />);
  render(boxDist, <ExtratoDistribuicaoEconomica itens={d.itens} contaNome={d.contaNome} periodoLabel={d.periodoLabel} />);
  render(boxComp, <ExtratoMaioresCompromissos itens={d.itens} contaNome={d.contaNome} periodoLabel={d.periodoLabel} />);

  // Aguarda layout + FIM da animação do recharts (senão a linha/barras saem incompletas).
  await esperar(ESPERA_MS);

  try {
    const [evolucao, organizacao, distribuicao, compromissos] = await Promise.all([
      capturarNo(boxEvo.firstElementChild instanceof HTMLElement ? boxEvo.firstElementChild : boxEvo),
      capturarNo(boxOrg.firstElementChild instanceof HTMLElement ? boxOrg.firstElementChild : boxOrg),
      capturarNo(boxDist.firstElementChild instanceof HTMLElement ? boxDist.firstElementChild : boxDist),
      capturarNo(boxComp.firstElementChild instanceof HTMLElement ? boxComp.firstElementChild : boxComp),
    ]);
    return { evolucao, organizacao, distribuicao, compromissos };
  } finally {
    for (const r of roots) r.unmount();
    document.body.removeChild(container);
  }
}
