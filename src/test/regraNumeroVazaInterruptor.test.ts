/**
 * P92/P113 — o interruptor da regra `numero-vaza` do check-ui-cortes desliga SÓ `visao-geral-analise-regua-saidas` e avisa sempre que
 * pula; todos os outros cenários (o Negociar lote inclusive) seguem com a regra. Desligar a regra para todos derruba este teste.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Achado = { regra: string; texto: string };
type Resultado = { achados: Achado[]; aviso: string | null };

/* o módulo é JavaScript da bancada (node): importado por caminho em tempo de execução, e a forma conferida sem cast */
async function carregar() {
  const caminho = resolve(__dirname, '../../scripts/ui-cortes/regraNumeroVaza.mjs');
  const m: Record<string, unknown> = await import(/* @vite-ignore */ caminho);
  const f = m.aplicarInterruptorNumeroVaza;
  const lista = m.CENARIOS_SEM_NUMERO_VAZA;
  if (typeof f !== 'function' || typeof lista !== 'object' || lista === null) throw new Error('módulo sem o interruptor');
  const aplicar = (nome: string, entrada: Achado[]): Resultado => {
    const r: unknown = f(nome, entrada);
    if (typeof r !== 'object' || r === null || !('achados' in r) || !('aviso' in r)) throw new Error('resultado sem forma');
    const ach = r.achados; const av = r.aviso;
    if (!Array.isArray(ach)) throw new Error('resultado sem forma');
    const achados: Achado[] = [];
    for (const a of ach) {
      if (typeof a === 'object' && a !== null && 'regra' in a && 'texto' in a && typeof a.regra === 'string' && typeof a.texto === 'string') achados.push({ regra: a.regra, texto: a.texto });
    }
    if (av === null) return { achados, aviso: null };
    if (typeof av !== 'string') throw new Error('aviso sem forma');
    return { achados, aviso: av };
  };
  return { aplicar, nomes: Object.keys(lista) };
}

const ACHADOS: Achado[] = [
  { regra: 'numero-vaza', texto: '"+999,9%" sai da celula (0.0px a\' esquerda, 4.8px a\' direita)' },
  { regra: 'folga', texto: '"a" e "b": folga 2.0px' },
];

/* os nomes de cenário do gate que usam a folga (onde a regra roda), lidos da fonte */
const fonte = readFileSync(resolve(__dirname, '../../scripts/check-ui-cortes.mjs'), 'utf8');

describe('P113 — interruptor da numero-vaza', () => {
  it('a lista tem UM cenário: visao-geral-analise-regua-saidas (P113)', async () => {
    const { nomes } = await carregar();
    expect(nomes).toEqual(['visao-geral-analise-regua-saidas']);
  });

  it('nele, a numero-vaza sai (a folga fica) e o aviso diz que pulou', async () => {
    const { aplicar } = await carregar();
    const r = aplicar('visao-geral-analise-regua-saidas', ACHADOS);
    expect(r.achados.map((a) => a.regra)).toEqual(['folga']);
    expect(r.aviso).toBe('numero-vaza desligada neste cenário (P113)');
  });

  it('em todo outro cenário a regra fica ligada e nada é avisado — o Negociar lote, os irmãos da régua e a Visão Geral', async () => {
    const { aplicar } = await carregar();
    for (const nome of ['negociar-lote-resumo-real', 'negociar-lote-resumo-teto', 'negociar-lote-resumo-acima', 'visao-geral-analise-regua-entradas',
      'visao-geral-analise-acumulado', 'visao-geral-analise-grande', 'visao-geral-analise-regua-saidas-x', 'qualquer-outro']) {
      const r = aplicar(nome, ACHADOS);
      expect(r.achados).toEqual(ACHADOS);
      expect(r.aviso).toBeNull();
    }
  });

  it('o gate passa os achados da folga pelo interruptor, com o nome do cenário, e imprime o aviso', () => {
    expect(fonte).toContain("import { aplicarInterruptorNumeroVaza } from './ui-cortes/regraNumeroVaza.mjs';");
    expect(fonte).toContain('const daFolga = aplicarInterruptorNumeroVaza(cen.nome, await p.evaluate(medirFolgaCelulas, cen.folgaCelulas));');
    expect(fonte).toContain('if (daFolga.aviso) console.log(`  ${cen.nome} [${w}x${h}] ${daFolga.aviso}`);');
    /* a regra continua sendo medida para todos (o detector não tem desligamento próprio) */
    expect(fonte).toContain("achados.push({ regra: 'numero-vaza'");
  });
});
