/**
 * DIVIDENDO-ESCRITOR-UNICO-01 (passo 4) — A TRAVA DO FRONT: nenhum arquivo de `src` ESCREVE em `financeiro_dividendos`.
 *
 * O cadastro de dividendos e a conta do plano mudam juntos, por cinco funções do banco (`fn_dividendo_*`). O banco já recusa a
 * escrita direta (`trg_guard_dividendo_escritor`); este teste recusa antes, na fonte: quem precisar criar, renomear, inativar,
 * reativar ou reordenar chama a função. LER a tabela continua permitido, nos arquivos declarados abaixo.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const RAIZ = resolve(process.cwd(), 'src');

/** Cada cadeia que começa em `.from('financeiro_dividendos')` e vai até o `;` (ou o fim do texto). */
const CADEIA = /\.from\(\s*['"`]financeiro_dividendos['"`]\s*\)[^;]*/g;
const ESCRITA = /\.(insert|update|delete|upsert)\s*\(/;

const cadeias = (texto: string): string[] => texto.match(CADEIA) ?? [];
const escritas = (texto: string): number => cadeias(texto).filter((c) => ESCRITA.test(c)).length;

/** Quem LÊ o cadastro, com a contagem exata de consultas. Arquivo novo, ou consulta a mais ou a menos, reprova. */
const LEITORES: Record<string, number> = {
  'src/pages/DividendosTab.tsx': 1,
  'src/lib/financeiro/planoContasBuilder.ts': 1,
  'src/hooks/usePlanejamentoFinanceiro.ts': 1,
};

function arquivosDeFonte(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) { arquivosDeFonte(caminho, achados); continue; }
    if (!/\.(ts|tsx)$/.test(nome) || /\.test\.(ts|tsx)$/.test(nome) || nome.endsWith('.d.ts')) continue;
    achados.push(caminho);
  }
  return achados;
}

const porArquivo = (): Record<string, { consultas: number; escritas: number }> => {
  const mapa: Record<string, { consultas: number; escritas: number }> = {};
  for (const caminho of arquivosDeFonte(RAIZ)) {
    const texto = readFileSync(caminho, 'utf8');
    const n = cadeias(texto).length;
    if (n > 0) mapa[relative(process.cwd(), caminho).split('\\').join('/')] = { consultas: n, escritas: escritas(texto) };
  }
  return mapa;
};

describe('o cadastro de dividendos não é escrito pelo front', () => {
  it('o detector sabe achar — os quatro verbos, as três aspas, o cast na frente e a quebra de linha', () => {
    expect(escritas("await supabase.from('financeiro_dividendos').update({ ativo }).eq('id', id);")).toBe(1);
    expect(escritas('supabase.from("financeiro_dividendos").insert({ nome })')).toBe(1);
    expect(escritas('(supabase as any).from(`financeiro_dividendos`).delete().eq("id", id);')).toBe(1);
    expect(escritas("supabase\n  .from(\n    'financeiro_dividendos'\n  )\n  .upsert(linhas);")).toBe(1);
    expect(escritas("a.from('financeiro_dividendos').update(x); b.from('financeiro_dividendos').insert(y);")).toBe(2);
    /* a escrita em laço da tela antiga */
    expect(escritas("const u = lista.map((r, i) => supabase.from('financeiro_dividendos').update({ ordem_exibicao: i }).eq('id', r.id));")).toBe(1);
    /* e não acusa leitura, outra tabela, nem a escrita de OUTRA cadeia */
    expect(escritas("supabase.from('financeiro_dividendos').select('*').eq('cliente_id', c).order('ordem_exibicao');")).toBe(0);
    expect(escritas("supabase.from('financeiro_dividendos_x').update(x);")).toBe(0);
    expect(escritas("supabase.from('financeiro_dividendos').select('id'); supabase.from('outra').update(x);")).toBe(0);
    expect(cadeias("supabase.from('financeiro_dividendos').select('id');").length).toBe(1);
  });

  it('nenhum arquivo de src escreve na tabela, e quem a lê é só quem está declarado', () => {
    const mapa = porArquivo();
    const comEscrita = Object.entries(mapa).filter(([, v]) => v.escritas > 0).map(([k]) => k);
    expect(comEscrita).toEqual([]);
    const lidos: Record<string, number> = {};
    for (const [k, v] of Object.entries(mapa)) lidos[k] = v.consultas;
    expect(lidos).toEqual(LEITORES);
  });

  it('a tela chama as cinco funções do escritor único, e os nomes delas têm um dono', () => {
    const dono = readFileSync(resolve(process.cwd(), 'src/lib/financeiro/dividendosCadastro.ts'), 'utf8');
    for (const fn of ['fn_dividendo_criar', 'fn_dividendo_renomear', 'fn_dividendo_inativar', 'fn_dividendo_reativar', 'fn_dividendo_reordenar']) {
      expect(dono.split(`'${fn}'`).length - 1).toBe(1);
    }
    /* fora do dono, ninguém escreve o nome de uma função de dividendo */
    const fora = arquivosDeFonte(RAIZ)
      .filter((c) => !c.endsWith('dividendosCadastro.ts') && !c.endsWith('types.ts'))
      .filter((c) => /['"`]fn_dividendo_/.test(readFileSync(c, 'utf8')))
      .map((c) => relative(process.cwd(), c));
    expect(fora).toEqual([]);
  });
});
