/**
 * NF-LEITOR-PALAVRAS-01 (Gabriel 03/11, NF 39423 da Ricci: "Nota sem data de emissão.") — o emissor que escreve CADA PALAVRA do rotulo
 * num item ("DATA" | "DA" | "EMISSÃO", e o canhoto "RECEBEMOS" | "DE" | "<nome> OS PRODUTOS…"). A regra e' GERAL, nao do emissor:
 * W1 os 7 DANFEs sinteticos da casa, com todo rotulo partido em palavras, dao a MESMA nota que inteiros
 * W2 o rotulo em 2 linhas na coluna ("DATA DA" / "EMISSÃO"): a data abaixo da 2a linha
 * W3 sem o rotulo da emissao, a data do PROTOCOLO DE AUTORIZACAO; sem as duas, a recusa de sempre (nunca inventada)
 * W4 o PDF real (fora do repo: dado de cliente) — so' roda onde o arquivo existe.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { normalizar, notaDoDanfe, type ItemDoDanfe, type ResultadoDoDanfe } from './danfe';
import { lerNota } from './lerNota';
import type { PdfjsMinimo } from './lerNotaPdf';
import { PAGINAS_DANFE_SINTETICO } from './__fixtures__/danfeSintetico';
import { DANFE_ACBR_DUAS_FOLHAS, DANFE_FORTES, DANFE_PDFMAKE, DANFE_REPORTBUILDER, DANFE_SAVNF, DANFE_SKIA } from './__fixtures__/danfeLayoutsSinteticos';

function lida(r: ResultadoDoDanfe) {
  if (r.ok === false) throw new Error(`esperava nota, veio recusa: ${r.frase}`);
  return r;
}

/* Os rotulos que o leitor procura (os de `danfe.ts`), escritos como os emissores os escrevem */
const ROTULOS = new Set([
  'NATUREZA DA OPERACAO', 'NATUREZA DE OPERACAO', 'PROTOCOLO DE AUTORIZACAO DE USO', 'PROTOCOLO DE AUTORIZACAO', 'NUMERO DO PROTOCOLO',
  'INSCRICAO ESTADUAL', 'NOME / RAZAO SOCIAL', 'NOME/RAZAO SOCIAL', 'NOME RAZAO SOCIAL', 'CNPJ / CPF', 'DATA DA EMISSAO', 'DATA DE EMISSAO',
  'DATA EMISSAO', 'DATA DA ENTRADA / SAIDA', 'DATA DA SAIDA', 'DATA DE SAIDA', 'VALOR ORIGINAL', 'VALOR DO DESCONTO', 'VALOR LIQUIDO',
  'VALOR TOTAL DOS PRODUTOS', 'VALOR TOTAL PRODUTOS', 'VLR TOTAL PRODUTOS', 'VALOR PRODUTOS', 'VALOR DO FRETE', 'VALOR TOTAL DA NOTA',
  'VLR TOTAL NOTA', 'VALOR TOTAL',
]);

/** Um item em itens de uma palavra, cada um no x do caractere onde ela comeca (largura proporcional, como o pdfjs entrega). */
function emPalavras(it: ItemDoDanfe): ItemDoDanfe[] {
  const cw = it.w / it.str.length;
  return [...it.str.matchAll(/\S+/g)].map((m) => ({ ...it, str: m[0], x: it.x + (m.index ?? 0) * cw, w: m[0].length * cw }));
}
/** O canhoto "RECEBEMOS DE <nome> OS PRODUTOS…" partido como o da Ricci: "RECEBEMOS" | "DE" | o resto. */
function canhotoPartido(it: ItemDoDanfe): ItemDoDanfe[] {
  const m = /^(RECEBEMOS)\s+(DE)\s+(.*)$/i.exec(it.str);
  if (!m) return [it];
  const cw = it.w / it.str.length;
  const iDe = it.str.indexOf(m[2], m[1].length); const iResto = it.str.indexOf(m[3], iDe + 2);
  return [{ ...it, str: m[1], w: m[1].length * cw }, { ...it, str: m[2], x: it.x + iDe * cw, w: 2 * cw },
    { ...it, str: m[3], x: it.x + iResto * cw, w: m[3].length * cw }];
}
function partir(paginas: readonly ItemDoDanfe[][]): { paginas: ItemDoDanfe[][]; partidos: number } {
  let partidos = 0;
  const out = paginas.map((p) => p.flatMap((it) => {
    if (ROTULOS.has(normalizar(it.str)) && /\s/.test(it.str.trim())) { partidos++; return emPalavras(it); }
    if (/^RECEBEMOS\s+DE\s/i.test(it.str)) { partidos++; return canhotoPartido(it); }
    return [it];
  }));
  return { paginas: out, partidos };
}

const LAYOUTS: [string, readonly ItemDoDanfe[][]][] = [
  ['sintetico (NF 937)', PAGINAS_DANFE_SINTETICO], ['FortesReport', DANFE_FORTES], ['pdfmake', DANFE_PDFMAKE],
  ['ACBr em 2 folhas', DANFE_ACBR_DUAS_FOLHAS], ['ReportBuilder', DANFE_REPORTBUILDER], ['savnf', DANFE_SAVNF], ['Skia', DANFE_SKIA],
];

describe('W1 — o rotulo partido em palavras: a mesma nota que o inteiro, em todo layout da casa', () => {
  it.each(LAYOUTS)('%s', (_nome, paginas) => {
    const inteira = lida(notaDoDanfe(paginas));
    const { paginas: partidas, partidos } = partir(paginas);
    expect(partidos).toBeGreaterThanOrEqual(5);
    const r = lida(notaDoDanfe(partidas));
    expect(r.nota).toEqual(inteira.nota);
    expect(r.divergencias).toEqual(inteira.divergencias);
    expect(r.avisos).toEqual(inteira.avisos);
  });
});

describe('W2 — o rotulo em 2 linhas na coluna', () => {
  it('"DATA DA" em cima, "EMISSÃO" logo abaixo (mesmo x): a data e\' a de baixo do rotulo (outra que a do protocolo)', () => {
    const paginas = PAGINAS_DANFE_SINTETICO.map((p) => p.flatMap((it) => {
      if (normalizar(it.str) === 'DATA DA EMISSAO') return [{ ...it, str: 'DATA DA', y: it.y + it.h * 1.2, w: it.w * 0.5 }, { ...it, str: 'EMISSÃO', w: it.w * 0.5 }];
      if (it.str === '15/09/2026' && it.y === 436.42) return [{ ...it, str: '14/09/2026' }];
      return [it];
    }));
    expect(lida(notaDoDanfe(paginas)).nota.emissao).toBe('2026-09-14');
  });
  it('a 2a linha deslocada na coluna nao conta (nada adivinhado): sem rotulo, a data vem do protocolo', () => {
    const paginas = PAGINAS_DANFE_SINTETICO.map((p) => p.flatMap((it) => (normalizar(it.str) === 'DATA DA EMISSAO'
      ? [{ ...it, str: 'DATA DA', y: it.y + it.h * 1.2, w: it.w * 0.5 }, { ...it, str: 'EMISSÃO', x: it.x + 40, w: it.w * 0.5 }] : [it])));
    const r = lida(notaDoDanfe(paginas));
    expect(r.nota.emissao).toBe(dataDoProtocolo(PAGINAS_DANFE_SINTETICO));
  });
});

/** A data do protocolo do DANFE sintetico, como esta' no item (dd/mm/aaaa -> aaaa-mm-dd). */
function dataDoProtocolo(paginas: readonly ItemDoDanfe[][]): string {
  const it = paginas.flat().find((o) => /\b1\d{14}\b.*\d{2}\/\d{2}\/\d{4}/.test(o.str));
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(it?.str ?? '');
  if (!m) throw new Error('o sintetico nao tem a data no protocolo');
  return `${m[3]}-${m[2]}-${m[1]}`;
}

describe('W3 — sem o rotulo da emissao', () => {
  const semRotulo = PAGINAS_DANFE_SINTETICO.map((p) => p.filter((it) => normalizar(it.str) !== 'DATA DA EMISSAO'));
  it('a data do PROTOCOLO DE AUTORIZACAO, marcada no protocolo; a chave confere o mes', () => {
    const r = lida(notaDoDanfe(semRotulo));
    expect(r.nota.emissao).toBe(dataDoProtocolo(PAGINAS_DANFE_SINTETICO));
    expect(r.marcas.filter((m) => m.campo === 'emissao').length).toBe(1);
    expect(r.divergencias).toEqual([]);
  });
  it('o protocolo com o numero e a data em itens separados na mesma linha: a data e\' a do item ao lado', () => {
    const separado = semRotulo.map((p) => p.flatMap((it) => {
      const m = /^(1\d{14})\s*-\s*(\d{2}\/\d{2}\/\d{4}.*)$/.exec(it.str);
      return m ? [{ ...it, str: m[1], w: 50 }, { ...it, str: m[2], x: it.x + 55, w: 56 }] : [it];
    }));
    const r = lida(notaDoDanfe(separado));
    expect(r.nota.emissao).toBe(dataDoProtocolo(PAGINAS_DANFE_SINTETICO));
    expect(r.nota.protocolo?.numero).toHaveLength(15);
  });
  it('o quadro da data ACIMA do titulo do destinatario (a nota do produtor): o rotulo achado na pagina, nao o protocolo', () => {
    const yDest = PAGINAS_DANFE_SINTETICO[0].find((it) => normalizar(it.str) === 'DESTINATARIO / REMETENTE')?.y ?? 0;
    const acima = PAGINAS_DANFE_SINTETICO.map((p) => p.map((it) => {
      if (normalizar(it.str) === 'DATA DA EMISSAO') return { ...it, y: yDest + 120 };
      if (it.str === '15/09/2026' && it.y === 436.42) return { ...it, str: '14/09/2026', y: yDest + 111 };
      return it;
    }));
    expect(lida(notaDoDanfe(acima)).nota.emissao).toBe('2026-09-14');
  });
  it('sem o rotulo e sem data no protocolo: "Nota sem data de emissão." (nunca inventada)', () => {
    const semNada = semRotulo.map((p) => p.map((it) => ({ ...it, str: it.str.replace(/\s*\d{2}\/\d{2}\/\d{4}(\s+\d{2}:\d{2}(:\d{2})?)?/g, (s) => (/\b1\d{14}\b/.test(it.str) ? '' : s)) })));
    expect(notaDoDanfe(semNada)).toEqual({ ok: false, motivo: 'incompleta', frase: 'Nota sem data de emissão.' });
  });
});

const REAL = `${process.env.HOME ?? ''}/Downloads/relatorios/casos/NF-39423-ricci-sem-data.pdf`;
describe.skipIf(!existsSync(REAL))('W4 — o PDF real (NF 39423), pelo pdfjs', () => {
  it('lido inteiro: numero, emissao, total, 4 duplicatas que somam a nota; a chave confere; os itens somam os produtos', async () => {
    const pdfjs: PdfjsMinimo = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const b = readFileSync(REAL);
    const r = await lerNota(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { pdfjs });
    if (r.ok === false) throw new Error(r.frase);
    const n = r.nota;
    expect([n.numero, n.serie, n.emissao, n.totais.notaCent]).toEqual(['39423', '1', '2026-07-13', 2453946]);
    expect(n.duplicatas.map((d) => d.vencimento)).toEqual(['2026-08-10', '2026-09-07', '2026-10-05', '2026-11-02']);
    expect(n.somaDuplicatasCent).toBe(n.totais.notaCent);
    expect(n.protocolo?.numero).toHaveLength(15);
    expect(n.emitente.nome.length).toBeGreaterThan(5);
    expect(n.destinatario.documento).toHaveLength(11);
    expect(n.itens.reduce((s, i) => s + i.valorCent, 0)).toBe(n.totais.produtosCent);
    expect(r.divergencias).toEqual([]);
    expect(r.avisos).toEqual([]);
  });
});
