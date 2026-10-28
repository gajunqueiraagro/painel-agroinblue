/**
 * P138 (Gabriel 27/10/2026) — A SAFRA DA COMPETÊNCIA É UMA REGRA SÓ, A DO BANCO (`_fn_safra_da_competencia`, pelas datas da safra), e o
 * banco a grava na criação (`trg_safra_da_competencia`). A regra antiga da tela (`safraSugerida`: a temporada pelo CÓDIGO da safra) não
 * pode voltar a decidir safra em tela nenhuma: quem precisa da safra da competência usa `useSafraDaCompetencia` (pergunta ao banco).
 * Só o tipo `SafraCandidata` pode ser importado. O detector se prova antes de varrer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(__dirname, '../..');

/** As chamadas da regra antiga num texto de arquivo: import de VALOR (não `import type`) de `safraSugerida`/`safrasCandidatas`. */
export function usosDaRegraAntiga(texto: string): string[] {
  const achados: string[] = [];
  for (const m of texto.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]@\/lib\/agri\/safraSugerida['"]/g)) {
    if (m[1]) continue;
    for (const nome of m[2].split(',').map((x) => x.trim()).filter(Boolean)) {
      if (!/^type\s/.test(nome) && /^(safraSugerida|safrasCandidatas)\b/.test(nome)) achados.push(nome);
    }
  }
  return achados;
}

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return arquivos(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe('P138 — a safra da competência é uma regra só (a do banco)', () => {
  it('o detector acha a regra antiga importada e deixa passar o tipo', () => {
    expect(usosDaRegraAntiga("import { safraSugerida } from '@/lib/agri/safraSugerida';")).toEqual(['safraSugerida']);
    expect(usosDaRegraAntiga("import { safrasCandidatas, type SafraCandidata } from '@/lib/agri/safraSugerida';")).toEqual(['safrasCandidatas']);
    expect(usosDaRegraAntiga("import type { SafraCandidata } from '@/lib/agri/safraSugerida';")).toEqual([]);
  });
  it('nenhum arquivo de tela/hook/lib decide safra pela regra antiga', () => {
    const achados = arquivos(SRC)
      .filter((p) => !p.endsWith(join('lib', 'agri', 'safraSugerida.ts')))
      .flatMap((p) => usosDaRegraAntiga(readFileSync(p, 'utf8')).map((n) => `${p.slice(SRC.length + 1)}: ${n}`));
    expect(achados).toEqual([]);
  });
});
