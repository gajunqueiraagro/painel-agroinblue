/**
 * REBANHO-ORGAO-01 (F3) — "Baixar planilha": a MESMA conta da tela (`PropostaDaFazenda`) no formato das planilhas do Gabriel
 * (AAAA-MM_Inventario_<fazenda>.xlsx): "Fazenda:", "Data", e a tabela Sexo · Faixa Etária · Saldo Anterior · Nascimentos · Mortes e
 * consumo · Transf. Era · Saldo Atual · Vacinados · Saldo Real na fazenda · Dif. Cab, com a linha Total.
 * ⚠ Mortes e consumo numa coluna só (a tela as edita juntas); "Transf. Era" = o que entra da faixa de baixo − o que passa para a de cima.
 * ⚠ "Saldo Real na fazenda" é o SISTEMA: a faixa que o sistema não separa sai no bloco (célula mesclada), como na tela; sem número = vazio.
 * ⚠ Sem número (comprovante não lido, troca de faixa sem nascimento lançado) = célula VAZIA; o zero é zero (valor real).
 * Pura: devolve as linhas e as mesclas; quem baixa monta o arquivo (`baixarPlanilhaDaDeclaracao`).
 */
import { FAIXAS, type Faixa } from './tipos';
import type { PropostaDaFazenda } from './propostaDaDeclaracao';

export type Celula = string | number | null;
export interface Mescla { linha: number; coluna: number; linhas: number }
export const ROTULO_PLANILHA: Record<Faixa, string> = { 0: '00-12', 1: '13-24', 2: '25-36', 3: '37-acima' };
export const CABECALHO_PLANILHA = ['Sexo', 'Faixa Etária', 'Saldo Anterior', 'Nascimentos', 'Mortes e consumo', 'Transf. Era', 'Saldo Atual',
  'Vacinados', '', 'Saldo Real na fazenda', 'Dif. Cab'];

const soma = (xs: readonly (number | null)[]): number | null => (xs.some((x) => x === null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0));

export function linhasDaPlanilha(fazendaNome: string, dataBR: string, p: PropostaDaFazenda): { linhas: Celula[][]; mesclas: Mescla[] } {
  const linhas: Celula[][] = [[], [null, 'Fazenda:', fazendaNome], [null, 'Data', dataBR], [], [null, ...CABECALHO_PLANILHA]];
  const mesclas: Mescla[] = [];
  const totais: (number | null)[][] = [];
  for (const s of ['F', 'M'] as const) {
    const ls = p.linhas[s];
    const grupos = p.sistema[s];
    FAIXAS.forEach((k) => {
      const l = ls[k];
      const era = l.entra - (l.passa ?? 0);
      const g = grupos.find((x) => k >= x.de && k <= x.ate);
      const primeiraDoGrupo = g ? g.de === k : false;
      const linha = linhas.length;
      if (g && primeiraDoGrupo && g.ate > g.de) mesclas.push({ linha, coluna: 10, linhas: g.ate - g.de + 1 }, { linha, coluna: 11, linhas: g.ate - g.de + 1 });
      const real = g && primeiraDoGrupo ? g.cab : null;
      const dif = g && primeiraDoGrupo ? g.dif : null;
      const passaSemNumero = k < 3 && l.passa === null;
      linhas.push([null, k === 0 ? s : null, ROTULO_PLANILHA[k], l.iagro, k === 0 ? l.nascimentos : null, l.mortesConsumo,
        passaSemNumero ? null : era, l.proposto, null, null, real, dif]);
      totais.push([l.iagro, k === 0 ? l.nascimentos : 0, l.mortesConsumo, passaSemNumero ? null : era, l.proposto, g && primeiraDoGrupo ? g.cab : 0,
        g && primeiraDoGrupo ? g.dif : 0]);
    });
  }
  const col = (i: number) => soma(totais.map((t) => t[i]));
  linhas.push([null, null, 'Total', col(0), col(1), col(2), col(3), col(4), null, null, col(5), col(6)]);
  return { linhas, mesclas };
}

/** Baixa o .xlsx (o pacote `xlsx` da casa, carregado só no gesto). */
export async function baixarPlanilhaDaDeclaracao(nomeDoArquivo: string, fazendaNome: string, dataBR: string, p: PropostaDaFazenda): Promise<void> {
  const XLSX = await import('xlsx');
  const { linhas, mesclas } = linhasDaPlanilha(fazendaNome, dataBR, p);
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws['!merges'] = mesclas.map((m) => ({ s: { r: m.linha, c: m.coluna }, e: { r: m.linha + m.linhas - 1, c: m.coluna } }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha1');
  XLSX.writeFile(wb, nomeDoArquivo);
}
