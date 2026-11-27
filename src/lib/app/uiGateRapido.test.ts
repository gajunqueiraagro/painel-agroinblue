/**
 * UI-GATE-RAPIDO-01 — o modo rápido do gate de tela mede só as telas da bancada que o diff alcança.
 * O mapa tela ← arquivo sai do `telas.tsx` (o ramo de cada `tela === '…'` e o que ele importa) e do grafo de imports de `src/`.
 */
import { describe, it, expect } from 'vitest';
import { telasDaBancada, COMPARTILHADOS, telaDoCenario, telasDaReguaPelosArquivos, testidsDasLinhas, elementoDoDiff } from '../../../scripts/ui-gate-rapido.mjs';

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

/* UI-FONTES-REGUA-01 (Gabriel 25/11 07:41) — a régua de fonte reprova SÓ nas telas novas ou alteradas no diff; mexer no gate, num componente
   da casa ou num arquivo de metade das telas NÃO põe as antigas sob a régua (elas vão para o relatório) */
describe('UI-FONTES-REGUA-01 — as telas sob a régua de fonte', () => {
  const ramo = (tela: string) => { const t = telasDaBancada().telas.get(tela); return t ? t.de + 1 : -1; };
  it('a tela que o diff alcança entra; o gate, o index.css e o componente da casa não põem ninguém', () => {
    expect([...telasDaReguaPelosArquivos(['src/v2/pages/V2Recorrencias.tsx']).telas]).toEqual(['recorrencias']);
    const r = telasDaReguaPelosArquivos(['scripts/check-ui-cortes.mjs', 'src/index.css', 'src/components/ui/button.tsx']);
    expect(r.telas.size).toBe(0);
    expect(r.fora).toEqual(['scripts/check-ui-cortes.mjs', 'src/index.css', 'src/components/ui/button.tsx']);
  });
  it('cena nova na bancada: a tela do ramo mudado entra; o trecho comum (antes do 1º ramo) não', () => {
    expect([...telasDaReguaPelosArquivos(['scripts/ui-cortes/telas.tsx'], [ramo('recorrencias')]).telas]).toEqual(['recorrencias']);
    expect(telasDaReguaPelosArquivos(['scripts/ui-cortes/telas.tsx'], [1]).telas.size).toBe(0);
  });
});

/* UI-FONTES-REGUA-01 ajuste (Gabriel 25/11, opção 2): a régua reprova só o ELEMENTO do diff — o testid escrito numa linha acrescentada */
describe('a régua de fonte só nos elementos do diff', () => {
  const linhas = [
    '<td data-testid="nota-outra-nf-numero">',
    "<li data-testid={`nota-confirmar-${c.chave}`}>",
    "<span data-testid={cond ? 'saldo-falta' : 'saldo-ok'} className={cn('a', { b: true })}>",
    "<p data-testid='doc-papel'>",
  ];
  const ids: RegExp[] = testidsDasLinhas(linhas);
  it('acha o testid simples, o de template (com o ${…}) e os dois do ternário', () => {
    expect(elementoDoDiff('td[nota-outra-nf-numero] "30.436"', ids)).toBe(true);
    expect(elementoDoDiff('li[nota-confirmar-atualizar] "Atualizar 1"', ids)).toBe(true);
    expect(elementoDoDiff('td[saldo-falta] "600 kg"', ids)).toBe(true);
    expect(elementoDoDiff('td[saldo-ok] "completa"', ids)).toBe(true);
    expect(elementoDoDiff('p[doc-papel] "Compra"', ids)).toBe(true);
  });
  it('o elemento antigo (testid fora do diff) e o sem testid não reprovam: vão ao relatório', () => {
    expect(elementoDoDiff('span[nota-fiscal] "Close"', ids)).toBe(false);
    expect(elementoDoDiff('button[nota-etapa-ficar] "Como vai ficar"', ids)).toBe(false);
    expect(elementoDoDiff('span "Close"', ids)).toBe(false);
    expect(elementoDoDiff('td[nota-outra-nf-numero-x] "1"', ids)).toBe(false);
  });
});
