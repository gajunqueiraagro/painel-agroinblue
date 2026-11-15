/**
 * FECH-ROLAGEM-02 (Chat 11/11 12:53, Pureza out/26) — (2) Salvar um pasto lá de baixo voltava a tela ao TOPO: a releitura do mês trocava a
 * grade por "Carregando...", a página encolhia e o navegador zerava a rolagem. (1) A linha "Cards | Mapa" sumia por baixo do cabeçalho.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLASSE_LINHA_PRESA, VAR_TOPO, medirTopo, soNaPrimeiraLeitura } from './rolagemDoFechamento';

const OUT = [{ ano_mes: '2026-10', fazenda_id: 'pur' }];

describe('(2) a releitura não troca a grade por "Carregando..." (a rolagem fica)', () => {
  it('releitura do MESMO mês e fazenda (o modal salvou): os cards ficam', () => {
    expect(soNaPrimeiraLeitura(true, OUT, '2026-10', 'pur')).toBe(false);
  });
  it('primeira leitura: nada do mês na mão, OU outro mês, OU outra fazenda → "Carregando..."', () => {
    expect(soNaPrimeiraLeitura(true, [], '2026-10', 'pur')).toBe(true);
    expect(soNaPrimeiraLeitura(true, OUT, '2026-11', 'pur')).toBe(true);
    expect(soNaPrimeiraLeitura(true, OUT, '2026-10', 'outra')).toBe(true);
  });
  it('sem leitura em curso, nunca', () => {
    expect(soNaPrimeiraLeitura(false, [], '2026-10', 'pur')).toBe(false);
  });
});

describe('(1) a linha "Cards | Mapa" presa abaixo do cabeçalho fixo', () => {
  it('a altura do cabeçalho vai na variável do pai, e a linha usa a variável como topo', () => {
    const area = document.createElement('div'); const topo = document.createElement('div'); area.appendChild(topo);
    Object.defineProperty(topo, 'offsetHeight', { value: 187 });
    const soltar = medirTopo(topo);
    expect(area.style.getPropertyValue(VAR_TOPO)).toBe('187px');
    soltar();
    expect(CLASSE_LINHA_PRESA).toMatch(/\bsticky\b/);
    expect(CLASSE_LINHA_PRESA).toContain(`top-[var(${VAR_TOPO}`);
    expect(CLASSE_LINHA_PRESA).toMatch(/\bbg-background\b/);
  });
});

describe('as telas leem a regra', () => {
  const tab = readFileSync('src/pages/FechamentoTab.tsx', 'utf8');
  it('o Fechamento: "Carregando..." só pela regra, o cabeçalho medido, a linha da vista presa', () => {
    expect(tab).toContain('{soNaPrimeiraLeitura(loading, fechamentos, anoMes, fazendaAtual?.id) ? (');
    expect(tab).not.toMatch(/\{loading \? \(\s*<div className="text-center py-8 text-muted-foreground">Carregando/);
    expect(tab).toContain('<div ref={setTopoFixo} className="sticky top-0 z-20');
    expect(tab).toContain('useEffect(() => medirTopo(topoFixo), [topoFixo]);');
    expect(tab.match(/\$\{CLASSE_LINHA_PRESA\}`\} data-testid="linha-da-vista"/g)).toHaveLength(1);
  });
  it('o Mapa do fechamento: a mesma linha presa (com a faixa "Sem desenho no mapa")', () => {
    const mapa = readFileSync('src/components/fechamento/MapaDoFechamento.tsx', 'utf8');
    expect(mapa.match(/\$\{CLASSE_LINHA_PRESA\}`\} data-testid="linha-da-vista"/g)).toHaveLength(1);
  });
});
