/**
 * OC-SHELL-ROTULO-ALINHADO-01 — nos tres shells da OC o rotulo da contraparte (Comprador / Fornecedor) e' bloco flex, como o da
 * Data ao lado: o `<label>` INLINE ficava na caixa de linha do pai (entrelinha do modal) e o campo comecava ~10px abaixo dos vizinhos.
 * Lido da FONTE (o jsdom nao mede layout), com auto-teste do detector.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** As classes do `<Label …>` cujo texto comeca pelo rotulo dado; null se nao achar. */
function classesDoRotulo(fonte: string, rotulo: string): string[] | null {
  const re = new RegExp(`<Label className="([^"]*)">\\s*${rotulo}\\b`);
  const m = fonte.match(re);
  return m ? m[1].split(/\s+/) : null;
}
const alinhado = (c: string[] | null) => !!c && c.includes('flex') && c.includes('items-center');

describe('o detector sabe achar (auto-teste)', () => {
  it('acha o inline e o flex, e nao inventa rotulo que nao existe', () => {
    const inline = '<Label className="text-[10px] text-muted-foreground">Comprador <span>*</span></Label>';
    const flex = '<Label className="text-[10px] flex items-center gap-1">\n  Data da venda <span>*</span>';
    expect(alinhado(classesDoRotulo(inline, 'Comprador'))).toBe(false);
    expect(alinhado(classesDoRotulo(flex, 'Data da venda'))).toBe(true);
    expect(classesDoRotulo(inline, 'Fornecedor')).toBeNull();
  });
});

const CASOS: [string, string, string][] = [
  ['src/components/abate/AbateModalShell.tsx', 'Comprador', 'Data do abate'],
  ['src/components/venda/VendaModalShell.tsx', 'Comprador', 'Data da venda'],
  ['src/components/compra/CompraModalShell.tsx', 'Fornecedor', 'Data da compra'],
];

describe('o rotulo da contraparte tem o mesmo flex items-center do rotulo da data', () => {
  for (const [arquivo, contraparte, data] of CASOS) {
    it(arquivo, () => {
      const f = readFileSync(arquivo, 'utf8');
      const c = classesDoRotulo(f, contraparte);
      const d = classesDoRotulo(f, data);
      expect(alinhado(d), `${data} deixou de ser flex`).toBe(true);
      expect(alinhado(c), `${contraparte} sem flex items-center`).toBe(true);
    });
  }
});
