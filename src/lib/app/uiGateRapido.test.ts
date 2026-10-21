/**
 * UI-GATE-RAPIDO-01 — o modo rápido do gate de tela mede só as telas da bancada que o diff alcança.
 * O mapa tela ← arquivo sai do `telas.tsx` (o ramo de cada `tela === '…'` e o que ele importa) e do grafo de imports de `src/`.
 */
import { describe, it, expect } from 'vitest';
import { telasDaBancada, COMPARTILHADOS, telaDoCenario } from '../../../scripts/ui-gate-rapido.mjs';

const telas: Map<string, { arquivos: Set<string> }> = telasDaBancada().telas;
const regras: RegExp[] = COMPARTILHADOS;
const quem = (arq: string) => [...telas].filter(([, t]) => t.arquivos.has(arq)).map(([n]) => n).sort();
const compartilhado = (arq: string) => regras.some((re) => re.test(arq));

describe('UI-GATE-RAPIDO-01 — as telas que um arquivo alcança', () => {
  it('acha as telas da bancada pelos ramos do telas.tsx', () => {
    expect(telas.size).toBeGreaterThanOrEqual(18);
    expect([...telas.keys()]).toEqual(expect.arrayContaining(['recorrencias', 'oc', 'oc-cc', 'lancamento', 'fornecedores', 'cpr']));
  });

  it('a página de Recorrências só é medida pela tela de recorrências', () => {
    expect(quem('src/v2/pages/V2Recorrencias.tsx')).toEqual(['recorrencias']);
  });

  it('a conta corrente da OC (o "+ Buscar recebimento") é medida pelo modal da OC e pela conta corrente solta', () => {
    expect(quem('src/components/venda/AbaContaCorrenteOC.tsx')).toEqual(['oc', 'oc-cc']);
  });

  it('dependência indireta conta (a lib do contrato chega à tela pelo componente)', () => {
    expect(quem('src/lib/oc/contaCorrente.ts')).toEqual(expect.arrayContaining(['oc', 'oc-cc']));
  });

  it('componente compartilhado, a casca e o próprio gate pedem o completo', () => {
    for (const a of ['src/components/ui/regua-tabela.tsx', 'src/components/ui/button.tsx', 'src/index.css', 'src/v2/components/V2Sidebar.tsx',
      'scripts/check-ui-cortes.mjs', 'scripts/ui-cortes/mocks/supabase.ts']) expect(compartilhado(a)).toBe(true);
    expect(compartilhado('src/v2/pages/V2Recorrencias.tsx')).toBe(false);
  });

  it('a tela do cenário é o `tela=` da url', () => {
    expect(telaDoCenario({ url: 'tela=oc&v=venda&aba=financeiro&cc=1' })).toBe('oc');
    expect(telaDoCenario({ url: 'tela=oc-cc&v=buscar' })).toBe('oc-cc');
    expect(telaDoCenario({ url: 'v=1' })).toBe('mesclar');
  });
});
