import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* UI-PERIODO-01 lote 2 — Painel por período: ANO e DATAS viram o componente único; a SAFRA DO LANÇAMENTO (`safra_id`) fica à parte. */
const tela = readFileSync(resolve(__dirname, 'PainelPeriodoTab.tsx'), 'utf8');

describe('Painel por período com o componente único', () => {
  it('"Datas | Safra do lançamento"; nas datas, o componente; a safra do lançamento continua sendo o select de safra (safra_id)', () => {
    expect(tela).toContain("opcoes={[{ valor: 'periodo', rotulo: 'Datas' }, { valor: 'safra', rotulo: 'Safra do lançamento' }]}");
    expect(tela).toMatch(/\{recorte\.modo !== 'safra' && \(\s*<SeletorDePeriodo testid="painel-periodo"/);
    expect(tela).toMatch(/\{recorte\.modo === 'safra' && \(/);
  });
  it('sem a lista fixa de anos e sem os dois DatePicker', () => {
    expect(tela).not.toMatch(/for \(let y = 2030; y >= 2019/);
    expect(tela).not.toContain('<DatePicker');
  });
  it('o ano inteiro volta a ser o modo "ano" (a frase "2026" no drawer); o resto é "datas"', () => {
    expect(tela).toContain("(ehAnoInteiro(i) ? { modo: 'ano', ano: Number(i.de.slice(0, 4)), de: null, ate: null } : { modo: 'datas', de: i.de, ate: i.ate, ano: null })");
  });
});
