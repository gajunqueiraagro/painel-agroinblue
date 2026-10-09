/**
 * PLANO-LEITOR-POR-CLIENTE-01 (passo 3) — A TRAVA: quem lê `financeiro_plano_contas` no front é o carregador dono.
 *
 * O dono é `src/lib/financeiro/planoContasBuilder.ts` (`loadContasDoPlanoDoCliente` + `contaDoPlanoPeloNome`): uma leitura, do
 * cliente em uso, e o nome resolvido pela regra única (espelho de `fn_plano_conta_do_texto`). Os dois importadores liam o plano
 * de TODOS os clientes e montavam o mapa nome → id com "o primeiro vence"; nenhum gate via isso.
 * Arquivo NOVO que consulte a tabela reprova aqui. Os que já consultavam estão na lista de exceções, com o motivo e a contagem
 * exata — mexer num deles obriga a atualizar a lista, e é nessa hora que se olha se a consulta procura conta pelo nome.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const RAIZ = resolve(process.cwd(), 'src');
const DONO = 'src/lib/financeiro/planoContasBuilder.ts';

/** `.from('financeiro_plano_contas')`, com aspas simples, duplas ou crase, e com o `(supabase as any)` na frente. */
const CONSULTA = /\.from\(\s*['"`]financeiro_plano_contas['"`]\s*\)/g;
const contar = (texto: string) => (texto.match(CONSULTA) ?? []).length;

/**
 * EXCEÇÕES DECLARADAS — consultas que já existiam e ficaram FORA deste trabalho (dívidas no CLAUDE.md).
 *   'id'         lê pela CHAVE (não procura por nome)
 *   'lista'      lista para seletor, filtrada por "cliente ou global" (dobraria com cliente + global de mesmo nome: 0 casos)
 *   'lista sem cliente'  lista SEM filtro de cliente (`useOcContaCorrente`: contas de pecuária que compõem o DRE; hoje nenhuma conta
 *                por cliente cai nesse recorte — dívida PLANO-LISTA-SEM-CLIENTE-01)
 *   'nome fixo'  procura um nome FIXO do plano global com `limit(1)`, sem cliente (só erra se um cliente ganhar conta com esse nome)
 */
const EXCECOES: Record<string, { consultas: number; motivo: 'id' | 'lista' | 'lista sem cliente' | 'nome fixo' }> = {
  'src/v2/lib/ocResumo.ts': { consultas: 1, motivo: 'id' },
  'src/components/consumo/gerarFinanceiroConsumo.ts': { consultas: 1, motivo: 'id' },
  'src/components/financiamentos/DialogVerLancamentosOficiais.tsx': { consultas: 1, motivo: 'id' },
  'src/components/financeiro-v2/ExtratoGerencialTab.tsx': { consultas: 1, motivo: 'id' },
  'src/v2/lib/excelPreview/catalogoCliente.ts': { consultas: 1, motivo: 'lista' },
  'src/components/financiamentos/DestinacoesForm.tsx': { consultas: 1, motivo: 'lista' },
  'src/hooks/usePlanoContasOC.ts': { consultas: 1, motivo: 'lista' },
  'src/hooks/useFinanciamentoCadastro.ts': { consultas: 3, motivo: 'lista' },
  'src/hooks/useOcContaCorrente.ts': { consultas: 1, motivo: 'lista sem cliente' },
  'src/pages/FinV2SubcentroAliasesTab.tsx': { consultas: 1, motivo: 'lista' },
  'src/components/AbateFinanceiroPanel.tsx': { consultas: 2, motivo: 'nome fixo' },
  'src/components/VendaFinanceiroPanel.tsx': { consultas: 2, motivo: 'nome fixo' },
  'src/components/CompraFinanceiroPanel.tsx': { consultas: 1, motivo: 'nome fixo' },
  'src/components/compra/gerarFinanceiroCompra.ts': { consultas: 1, motivo: 'nome fixo' },
  'src/lib/financeiro/boitelMapping.ts': { consultas: 1, motivo: 'nome fixo' },
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

const consultasPorArquivo = (): Record<string, number> => {
  const mapa: Record<string, number> = {};
  for (const caminho of arquivosDeFonte(RAIZ)) {
    const n = contar(readFileSync(caminho, 'utf8'));
    if (n > 0) mapa[relative(process.cwd(), caminho).split('\\').join('/')] = n;
  }
  return mapa;
};

describe('o plano de contas tem um leitor no front', () => {
  it('o detector sabe achar — as três aspas, o cast na frente e a quebra de linha', () => {
    expect(contar("supabase.from('financeiro_plano_contas').select('id')")).toBe(1);
    expect(contar('supabase.from("financeiro_plano_contas")')).toBe(1);
    expect(contar('(supabase as any).from(`financeiro_plano_contas`)')).toBe(1);
    expect(contar("supabase\n  .from(\n    'financeiro_plano_contas'\n  )")).toBe(1);
    expect(contar("a.from('financeiro_plano_contas'); b.from('financeiro_plano_contas')")).toBe(2);
    /* e não acusa o que não é a tabela */
    expect(contar("supabase.from('financeiro_plano_contas_x')")).toBe(0);
    expect(contar("// lê de financeiro_plano_contas pelo carregador")).toBe(0);
  });

  it('a varredura enxerga a fonte: o dono consulta a tabela, e só uma vez', () => {
    const mapa = consultasPorArquivo();
    expect(Object.keys(mapa).length).toBeGreaterThan(5);
    expect(mapa[DONO]).toBe(1);
  });

  it('fora do dono, só as exceções declaradas — com a contagem exata', () => {
    const mapa = consultasPorArquivo();
    delete mapa[DONO];
    const declarado = Object.fromEntries(Object.entries(EXCECOES).map(([arquivo, e]) => [arquivo, e.consultas]));
    expect(mapa).toEqual(declarado);
  });

  it('os três pontos consertados não voltam à consulta direta', () => {
    const mapa = consultasPorArquivo();
    for (const arquivo of ['src/v2/hooks/useImportLancamentosExcel.ts', 'src/v2/pages/CusteioTxtImportTab.tsx', 'src/components/financeiro/FluxoFinanceiro.tsx']) {
      expect(mapa[arquivo]).toBeUndefined();
      expect(readFileSync(resolve(process.cwd(), arquivo), 'utf8')).toContain('loadContasDoPlanoDoCliente(clienteId)');
    }
  });

  it('o dono filtra o cliente NA CONSULTA e a regra do nome nunca lê conta de outro cliente', () => {
    const dono = readFileSync(resolve(process.cwd(), DONO), 'utf8');
    expect(dono).toContain('.or(`cliente_id.is.null,cliente_id.eq.${clienteId}`)');
    expect(dono).toContain('const doCliente = doNome.filter(c => c.cliente_id === clienteId);');
    expect(dono).toContain('const globais = doNome.filter(c => c.cliente_id === null);');
  });
});
