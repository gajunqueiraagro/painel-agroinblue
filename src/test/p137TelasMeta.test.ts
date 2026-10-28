/**
 * P137 — as 4 telas da meta (Fluxo de Caixa META, PC-100, VG Planejamento, Fechamento): as regras de tela que o gate da bancada
 * (`meta-*` sem a `regiao`) acusava. O gate de tela é a prova; estas travas impedem a volta do que causava cada família.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ler = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('P137 família 1 — um scrollport por tela (o cabeçalho preso vive no quadro que rola)', () => {
  it('Fluxo de Caixa META: o quadro da tabela mede até o fim da janela (useAlturaAteOFim); nenhuma altura fixa calc(100vh…)', () => {
    const f = ler('pages/PlanejamentoFinanceiroTab.tsx');
    expect(f).not.toMatch(/calc\(100vh/);
    expect(f).toContain('const quadro = useAlturaAteOFim();');
    expect(f).toMatch(/<div ref=\{quadro\.ref\} className="overflow-auto relative" style=\{\{ height: quadro\.altura \}\}>/);
  });

});

describe('P137 família 3 — a barra do Fluxo não muda ao trocar a fazenda', () => {
  it('o aviso do Global e o ⚙ da fazenda são sempre montados; só a visibilidade troca', () => {
    const tudo = ler('pages/PlanejamentoFinanceiroTab.tsx');
    // só a barra do topo (do cabeçalho até o quadro da tabela)
    const f = tudo.slice(tudo.indexOf('{/* Header — sticky'), tudo.indexOf('{/* Table — scrolls'));
    expect(f.length).toBeGreaterThan(500);
    expect(f).not.toMatch(/\{isGlobal && \(/);
    expect(f).not.toMatch(/\{!isGlobal && \(/);
    expect(f).toContain("style={{ visibility: isGlobal ? 'visible' : 'hidden' }} aria-hidden={!isGlobal}>");
    expect(f).toContain("style={{ visibility: isGlobal ? 'hidden' : 'visible' }} aria-hidden={isGlobal} tabIndex={isGlobal ? -1 : undefined}");
  });
});
