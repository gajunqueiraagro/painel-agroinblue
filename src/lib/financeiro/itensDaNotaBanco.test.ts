/**
 * ITENS-NOTA-01 — as candidatas do backfill: documentos vivos com chave e arquivo, nas duas tabelas (lancamento e OC), SEM nota ja'
 * guardada; uma por chave, o XML antes do PDF. Banco falso por tabela; chaves SINTETICAS.
 */
import { describe, it, expect, vi } from 'vitest';

const tabelas = vi.hoisted(() => ({ dados: {} as Record<string, unknown[]>, filtros: {} as Record<string, string[]> }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => {
      tabelas.filtros[t] = [];
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'not', 'in', 'order', 'limit']) b[m] = (...a: unknown[]) => { tabelas.filtros[t].push(`${m}:${a.join(',')}`); return b; };
      b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: tabelas.dados[t] ?? [], error: null }).then(ok);
      return b;
    },
  },
}));
import { candidatasDoBackfill, chavesGuardadas, lerItensGuardados } from './itensDaNotaBanco';
import { chaveDoDocumento } from '@/lib/financeiro/nfe/formatos';

const K = (d: string) => d.repeat(44);
describe('candidatasDoBackfill', () => {
  it('as duas tabelas, sem as ja guardadas, uma por chave (o XML ganha do PDF), chave com mascara normalizada, chave curta fora', async () => {
    tabelas.dados = {
      financeiro_lancamento_documentos: [
        { chave_acesso: K('1'), numero: '10', url: 'cli/a.pdf' },
        { chave_acesso: K('1'), numero: '10', url: 'cli/a.xml' },
        { chave_acesso: K('2'), numero: '20', url: 'cli/b.pdf' },
        { chave_acesso: '123', numero: '30', url: 'cli/curta.pdf' },
      ],
      zoo_operacao_documentos: [
        { chave_acesso: K('2'), numero: '20', url: 'cli/oc-b.pdf' },
        { chave_acesso: `${'3'.repeat(4)} ${'3'.repeat(40)}`, numero: '40', url: 'cli/oc-c.pdf' },
        { chave_acesso: K('4'), numero: '50', url: 'cli/oc-d.pdf' },
      ],
      nota_fiscal: [{ chave_acesso: K('4') }],
    };
    const c = await candidatasDoBackfill('cli');
    expect(c.map((x) => [x.chave[0], x.caminho, x.bucket, x.origem])).toEqual([
      ['1', 'cli/a.xml', 'fin-documentos', 'lancamento'],
      ['2', 'cli/b.pdf', 'fin-documentos', 'lancamento'],
      ['3', 'cli/oc-c.pdf', 'oc-documentos', 'oc'],
    ]);
    for (const t of ['financeiro_lancamento_documentos', 'zoo_operacao_documentos']) {
      expect(tabelas.filtros[t]).toEqual(expect.arrayContaining(['eq:cliente_id,cli', 'eq:cancelado,false', 'not:chave_acesso,is,', 'not:url,is,']));
    }
    expect(tabelas.filtros.nota_fiscal).toContain('eq:cliente_id,cli');
  });
});

/* NOTA-ITENS-CLASSIF-01 (Gabriel 24/11 16:3x) — o documento guarda a chave em grupos ("5026 0921 …"): a aba Itens sumia porque a chave
   era descartada ANTES de virar dígitos. Quem lê a nota pela chave do documento passa pela `chaveDoDocumento`. */
const EM_GRUPOS = (d: string) => `${d.repeat(4)} ${d.repeat(4)} ${d.repeat(4)} ${d.repeat(4)} ${d.repeat(4)} ${d.repeat(4)} ${d.repeat(4)} ${d.repeat(4)} ${d.repeat(4)} ${d.repeat(4)} ${d.repeat(4)}`;
describe('a chave como o documento a guarda', () => {
  it('chaveDoDocumento: grupos, pontos e espaços viram os 44 (ou 50) dígitos; o que não é chave é nulo', () => {
    expect(chaveDoDocumento(EM_GRUPOS('5'))).toBe(K('5'));
    expect(chaveDoDocumento(`${'1'.repeat(10)}.${'1'.repeat(34)}`)).toBe(K('1'));
    expect(chaveDoDocumento('7'.repeat(50))).toBe('7'.repeat(50));
    expect(chaveDoDocumento('123 456')).toBeNull();
    expect(chaveDoDocumento(null)).toBeNull();
  });
  it('lerItensGuardados pergunta ao banco pelos DÍGITOS da chave em grupos (antes: nem perguntava)', async () => {
    tabelas.dados = { nota_fiscal: [] };
    tabelas.filtros = {};
    await lerItensGuardados('cli', [EM_GRUPOS('5')]);
    expect(tabelas.filtros.nota_fiscal).toContain(`in:chave_acesso,${K('5')}`);
  });
  it('chavesGuardadas acha a chave em grupos COMO FOI MANDADA (o "Itens da nota" da OC compara a do documento)', async () => {
    tabelas.dados = { nota_fiscal: [{ chave_acesso: K('5') }] };
    const s = await chavesGuardadas('cli', [EM_GRUPOS('5'), EM_GRUPOS('6')]);
    expect(s.has(EM_GRUPOS('5'))).toBe(true);
    expect(s.has(K('5'))).toBe(true);
    expect(s.has(EM_GRUPOS('6'))).toBe(false);
  });
});
