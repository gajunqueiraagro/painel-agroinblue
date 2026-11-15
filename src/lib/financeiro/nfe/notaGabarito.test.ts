/**
 * NOTA-GABARITO-01 (Chat 12/11 13:20) — a SUITE DE NOTAS REAIS: cada nota de ~/Downloads/relatorios/nf-gabarito/esperado.json se le^
 * pelo `lerNota` e a assinatura (numero, datas, totais, duplicatas, itens; nunca nome) tem de ser a esperada. Quebrou = o leitor mudou o
 * que le^ de uma nota real: nada sobe. Os PDFs e o esperado ficam FORA do repositorio (notas de clientes); sem a pasta (outra maquina),
 * a suite nao roda. Nota nova entra no esperado.json com o resultado CONFERIDO, nunca o que o leitor devolve sem olhar.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { lerNota } from './lerNota';
import { assinaturaDaNota } from './notaGabarito';
import { descricaoCurtaDoItem } from './proporLancamento';
import type { PdfjsMinimo } from './lerNotaPdf';

const DOWN = `${process.env.HOME ?? ''}/Downloads`;
const ESPERADO = `${DOWN}/relatorios/nf-gabarito/esperado.json`;
const NF_134583 = `${DOWN}/relatorios/nf-gabarito/NF-134583-ciarama-rocadeira.pdf`;

async function ler(caminho: string) {
  const pdfjs: PdfjsMinimo = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const b = readFileSync(caminho);
  return lerNota(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { pdfjs });
}
interface Gabarito { notas: { arquivo: string; esperado: unknown }[] }
function eGabarito(x: unknown): x is Gabarito {
  return typeof x === 'object' && x !== null && 'notas' in x && Array.isArray(x.notas);
}

describe.skipIf(!existsSync(NF_134583))('NOTA-PDF-REGRESSAO-01 — a NF 134.583 (FATURA em coluna, item em duas meias-linhas)', () => {
  it('a fatura 001 · 19/11/2026 · 15.500,00, o item inteiro (código, NCM, CFOP, 1 UN × 15.500,00, ICMS 867,97) e a descrição sugerida', async () => {
    const r = await ler(NF_134583);
    if (r.ok === false) throw new Error(r.frase);
    const n = r.nota;
    expect([n.numero, n.emissao, n.totais.notaCent]).toEqual(['134583', '2026-11-12', 1550000]);
    expect(n.duplicatas).toEqual([{ numero: '001', vencimento: '2026-11-19', valorCent: 1550000 }]);
    expect(r.avisos).not.toContain('sem_duplicatas');
    expect(n.itens).toHaveLength(1);
    const i = n.itens[0];
    expect([i.valorCent, i.quantidade, i.unitarioCent, i.unidade]).toEqual([1550000, '1.0000', 1550000, 'UN']);
    expect([i.fiscal?.codigo, i.fiscal?.ncm, i.fiscal?.cfop, i.fiscal?.vIcmsCent, i.fiscal?.aliqIcms]).toEqual(['027671', '84328000', '5102', 86797, '17,00%']);
    /* Chat 13:45 — a descrição INTEIRA: a linha de baixo continua a de cima (o ano partido "202" + "6CHASSI"); a repetição e o tracejado não entram */
    expect(i.descricao).toBe('ROCADEIRA 1800 ANO: 2026 CHASSI: 2621448');
    expect(i.detalhe).toBeNull();
    expect(descricaoCurtaDoItem(n)).toBe('Rocadeira 1800 ano: 2026 chassi: 2621448');
    expect(r.divergencias).toEqual([]);
  }, 60000);
});

describe.skipIf(!existsSync(ESPERADO))('NOTA-GABARITO-01 — as notas reais leem como o esperado', () => {
  it('cada nota do esperado.json: a mesma assinatura', async () => {
    const g: unknown = JSON.parse(readFileSync(ESPERADO, 'utf8'));
    if (!eGabarito(g)) throw new Error('esperado.json sem "notas"');
    expect(g.notas.length).toBeGreaterThan(100);
    const quebradas: string[] = [];
    for (const { arquivo, esperado } of g.notas) {
      const caminho = `${DOWN}/${arquivo}`;
      if (!existsSync(caminho)) { quebradas.push(`${arquivo}: arquivo sumiu`); continue; }
      const r = await ler(caminho);
      if (r.ok === false) { quebradas.push(`${arquivo}: ${r.frase}`); continue; }
      const lida = assinaturaDaNota(r);
      if (JSON.stringify(lida) !== JSON.stringify(esperado)) quebradas.push(`${arquivo}: leu ${JSON.stringify(lida).slice(0, 300)}`);
    }
    expect(quebradas).toEqual([]);
  }, 540000);
});
