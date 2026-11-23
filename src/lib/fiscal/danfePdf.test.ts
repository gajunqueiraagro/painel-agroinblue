/**
 * DANFE-LAYOUT-02 (Gabriel 23/11) — o DANFE em PDF não corta o texto. Provado com 3 notas reais (1 item; 61 itens Sendas; dados adicionais
 * de 1.581 caracteres): o html2canvas no modo padrão desenha o texto alguns px mais baixo que o navegador e os quadros cortavam o fim dos
 * valores, com a escala 2 (antes de 22/11) e com 1,5 (depois) — a causa não era a escala. Com `foreignObjectRendering` quem desenha é o navegador.
 *   P1 a folha vai ao PDF desenhada pelo navegador (foreignObjectRendering), na escala e qualidade declaradas
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESCALA_DO_DANFE, QUALIDADE_DO_DANFE } from './danfePdf';

describe('DANFE-LAYOUT-02 — o PDF', () => {
  it('P1 o navegador desenha a folha (o texto não desce e não corta)', () => {
    const src = readFileSync(join(__dirname, 'danfePdf.ts'), 'utf8');
    expect(src).toMatch(/html2canvas\(folha, \{[^}]*foreignObjectRendering: true[^}]*\}\)/);
    expect(ESCALA_DO_DANFE).toBe(1.5);
    expect(QUALIDADE_DO_DANFE).toBe(0.8);
  });
});
