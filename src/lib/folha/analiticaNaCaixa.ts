/**
 * FOLHA-VERA-PACOTE-01 F1 — a REGRA PURA do relatório analítico da folha na Caixa: a frase e o rótulo da linha.
 * ⚠ F1 só RECONHECE (a linha diz o que foi lido e se confere com o resumo geral); nada grava — os lançamentos saem pelo PACOTE da folha
 *   (este relatório + as guias do FGTS e do INSS, F3).
 */
import type { FolhaAnaliticaLida } from './lerFolhaAnalitica';
import { competenciaBR } from './folhaNaCaixa';

export const rotuloDaAnalitica = (f: FolhaAnaliticaLida): string => `Folha analítica · ${competenciaBR(f.competencia)}`;

export function fraseDaLinhaDaAnalitica(f: FolhaAnaliticaLida): string {
  const n = f.pessoas.length;
  return `${f.empresa} · ${n} ${n === 1 ? 'funcionário' : 'funcionários'} · ${f.confere ? 'confere com o resumo geral' : 'não confere com o resumo geral'}`;
}

export const TITULO_DA_ANALITICA = 'Ainda não grava nada: os lançamentos saem pelo pacote da folha (este relatório + as guias do FGTS e do INSS).';
