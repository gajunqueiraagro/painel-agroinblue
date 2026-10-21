/**
 * OC-ABRIR-LENTO-01 (Gabriel 21/10/2026) — abrir a OC e o resumo do conta corrente da Central.
 * (1) A falha do resumo nunca vai crua à tela (o "canceling statement due to statement timeout" que apareceu em Cadastros):
 *     a frase pronta, e a leitura que termina depois de a lista sair da tela não escreve nem avisa.
 * (2) Abrir a OC: o cabeçalho e as listas saem juntos (`carregarOperacao`), e na venda as duas linhas do boitel também —
 *     eram cinco idas em série antes do modal abrir.
 * Lido da fonte (a Central e o `LancamentosTab` não se montam em teste), com o detector provado contra o texto antigo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FRASE_RESUMO_CC_INDISPONIVEL } from '@/lib/oc/listaContaCorrente';

const ler = (p: string) => readFileSync(p, 'utf8');
const ERRO_CRU = /toast\.error\(`[^`]*\$\{lote\.error\.message\}/;
const BOITEL_EM_SERIE = /await \(supabase as any\)\s*\.from\('zoo_operacao_boitel'\)/;

describe('OC-ABRIR-LENTO-01', () => {
  it('o detector acha o erro cru e a leitura em série (texto de antes)', () => {
    expect(ERRO_CRU.test("if (lote?.error) toast.error(`Resumo do conta corrente indisponível: ${lote.error.message}`);")).toBe(true);
    expect(BOITEL_EM_SERIE.test("const { data } = await (supabase as any)\n  .from('zoo_operacao_boitel').select('*')")).toBe(true);
  });

  it('a Central avisa com a frase pronta e ignora a leitura que ficou para trás', () => {
    const f = ler('src/components/operacao-comercial/central/CentralOperacoesComerciais.tsx');
    expect(FRASE_RESUMO_CC_INDISPONIVEL).toBe('Não foi possível carregar o resumo do conta corrente agora. Tente de novo.');
    expect(ERRO_CRU.test(f)).toBe(false);
    expect(f).toContain('toast.error(FRASE_RESUMO_CC_INDISPONIVEL)');
    expect(f).toMatch(/const minha = \+\+leituraRef\.current;/);
    expect(f.match(/if \(!valendo\(\)\) return;/g)?.length).toBeGreaterThanOrEqual(2);
    expect(f).toContain('useEffect(() => { carregar(); return () => { leituraRef.current += 1; }; }, [carregar]);');
  });

  it('carregarOperacao lê o cabeçalho junto com as listas, e a conferência do cliente continua', () => {
    const f = ler('src/hooks/useOperacaoComercial.ts');
    const corpo = f.slice(f.indexOf('const carregarOperacao'), f.indexOf('const partes = pr.data'));
    expect(corpo).toMatch(/Promise\.all\(\[\s*\(supabase as any\)\.from\('zoo_operacoes_comerciais'\)/);
    expect(corpo).toContain(".eq('id', operacaoId).eq('cliente_id', clienteId).maybeSingle()");
    expect(corpo).toContain('if (!operacao) return null;');
  });

  it('a venda lê as duas linhas do boitel junto com a OC, e só as usa depois das conferências', () => {
    const f = ler('src/pages/LancamentosTab.tsx');
    const i = f.indexOf('/* Hidratacao de operacao de VENDA existente');
    const corpo = f.slice(i, f.indexOf('setLancModalOpen(true);', i));
    expect(BOITEL_EM_SERIE.test(corpo)).toBe(false);
    expect(corpo).toMatch(/await Promise\.all\(\[\s*ocRpc\.carregarOperacao\(ocIdParam, clienteAtual\.id\), lerBoitel\('projetado'\), lerBoitel\('realizado'\)/);
    expect(corpo.indexOf("if (op.tipo_operacao !== 'venda')")).toBeLessThan(corpo.indexOf('boitelDeLinha(linhaBoitel)'));
  });
});
