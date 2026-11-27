/**
 * ENTRADA-CENTRAL-01 F1 — a leitura guardada: o que se guarda (só o resultado; folha/resumo só o tipo; erro nada), a volta do banco
 * (só a versão de hoje, campo a campo) e a VERSÃO PRESA AO CÓDIGO DO LEITOR (mudou um arquivo do leitor sem subir `LEITOR_VERSAO` = falha).
 * Dados SINTÉTICOS (CNPJ/CPF de exemplo).
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LEITOR_VERSAO, daGravada, paraGravar } from './leituraGravada';
import type { LeituraDaCaixa } from './lerDaCaixa';

const COD = '34198161100003006501090004881820041964610000';
const BOLETOS: LeituraDaCaixa = {
  k: 'boletos',
  boletos: [{ ok: true, codigo_barras: COD, linha: '34191090080488182004919646100008816110000300650', tipo: 'bancario', banco: '341', valor: 3006.5, vencimento: '2026-10-26' }],
  beneficiario: { documento: '11222333000181', nome: 'AGRO INSUMOS SINTETICO LTDA', confira: false },
  pagador: { documento: '11144477735', nome: 'FAZENDA TESTE', confira: false }, paginaDeCada: [1], totalDePaginas: 1,
};
const NOTA: LeituraDaCaixa = { k: 'nota', nota: { chave: '5'.repeat(44), numero: '12345', emitente: 'AGRO SINTETICO', valor: 148, vencimento: '2026-12-10' } };

describe('o que se guarda', () => {
  it('nota e boletos: o resultado inteiro que a caixa mostra, com a versão; volta igual do banco', () => {
    for (const l of [NOTA, BOLETOS]) {
      const g = paraGravar(l);
      expect(g?.v).toBe(LEITOR_VERSAO);
      expect(daGravada(JSON.parse(JSON.stringify(g)))).toEqual(l);
    }
  });
  it('folha e resumo: SÓ o tipo (nada de pessoa ou salário); senha: só o "pede senha"; erro: nada (tenta de novo)', () => {
    const folha: LeituraDaCaixa = { k: 'folha', folha: { layout: 'sci', tipo: 'mensal', competencia: '2026-10', empregadores: ['11222333000181'],
      pessoas: [{ codigo: '1', nome: 'PESSOA SINTETICA', cei: '11222333000181', paginas: [1], valor: 1000 }], total: 1000 } };
    expect(paraGravar(folha)).toEqual({ v: LEITOR_VERSAO, k: 'folha' });
    expect(paraGravar({ k: 'senha', errada: true })).toEqual({ v: LEITOR_VERSAO, k: 'senha' });
    expect(paraGravar({ k: 'erro', frase: 'x' })).toBeNull();
    expect(paraGravar({ k: 'nada', frase: 'Sem linha digitável.' })).toEqual({ v: LEITOR_VERSAO, k: 'nada', frase: 'Sem linha digitável.' });
  });
  it('o que se guarda não leva chave fora da lista do banco (_fn_entrada_leitura_valida)', () => {
    const LISTA = ['v', 'k', 'nota', 'boletos', 'beneficiario', 'pagador', 'paginaDeCada', 'totalDePaginas', 'frase'];
    for (const l of [NOTA, BOLETOS, { k: 'nada', frase: 'x' } as const]) expect(Object.keys(paraGravar(l) ?? {}).every((c) => LISTA.includes(c))).toBe(true);
  });
});

describe('a volta do banco', () => {
  it('outra versão do leitor, folha/resumo, campo estranho ou faltando = null (a caixa lê o arquivo)', () => {
    const g = JSON.parse(JSON.stringify(paraGravar(NOTA)));
    expect(daGravada({ ...g, v: 'caixa-0' })).toBeNull();
    expect(daGravada({ v: LEITOR_VERSAO, k: 'folha' })).toBeNull();
    expect(daGravada({ v: LEITOR_VERSAO, k: 'resumo' })).toBeNull();
    expect(daGravada({ ...g, nota: { ...g.nota, chave: '123' } })).toBeNull();
    const b = JSON.parse(JSON.stringify(paraGravar(BOLETOS)));
    expect(daGravada({ ...b, pagador: { nome: 'X' } })).toBeNull();
    expect(daGravada({ ...b, boletos: [] })).toBeNull();
    expect(daGravada(null)).toBeNull();
    expect(daGravada('{}')).toBeNull();
  });
  it('senha volta como "pede senha" (a caixa pergunta e lê no navegador)', () => {
    expect(daGravada({ v: LEITOR_VERSAO, k: 'senha' })).toEqual({ k: 'senha', errada: false });
  });
});

/* ═══ a versão presa ao código do leitor ═══ */
const RAIZ = path.resolve(__dirname, '../../../..');
/** Os arquivos que o `lerDaCaixa.ts` alcança pelos imports de VALOR (`@/…` e relativos; `import type` não conta). */
function fechoDoLeitor(): string[] {
  const vistos = new Set<string>();
  const fila = [path.join(RAIZ, 'src/lib/financeiro/boleto/lerDaCaixa.ts')];
  while (fila.length) {
    const f = fila.pop();
    if (!f || vistos.has(f)) continue;
    vistos.add(f);
    const texto = fs.readFileSync(f, 'utf8');
    for (const m of texto.matchAll(/^import\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
      const alvo = m[1];
      const base = alvo.startsWith('@/') ? path.join(RAIZ, 'src', alvo.slice(2)) : alvo.startsWith('.') ? path.resolve(path.dirname(f), alvo) : null;
      if (!base) continue;
      const achado = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((c) => fs.existsSync(c));
      if (achado) fila.push(achado);
    }
  }
  return [...vistos].map((f) => path.relative(RAIZ, f)).sort();
}
/** A assinatura do leitor de hoje: md5 de "arquivo:md5" de cada arquivo, em ordem. MUDOU O LEITOR? Suba `LEITOR_VERSAO` e troque aqui. */
const ASSINATURA: Record<string, string> = { 'caixa-1': 'd4b89f1bc1d9eeec96927889c370f628' };

describe('a versão do leitor', () => {
  it('o leitor de hoje tem a assinatura desta versão (mudou um arquivo do leitor = suba LEITOR_VERSAO)', () => {
    const arquivos = fechoDoLeitor();
    expect(arquivos.length).toBeGreaterThan(10);   // auto-teste: o fecho acha o leitor inteiro (boleto, nota, folha…)
    expect(arquivos).toContain('src/lib/financeiro/boleto/lerBoleto.ts');
    expect(arquivos).toContain('src/lib/financeiro/nfe/lerNFe.ts');
    const assinatura = createHash('md5').update(arquivos.map((f) => `${f}:${createHash('md5').update(fs.readFileSync(path.join(RAIZ, f))).digest('hex')}`).join('\n')).digest('hex');
    expect({ versao: LEITOR_VERSAO, assinatura }).toEqual({ versao: LEITOR_VERSAO, assinatura: ASSINATURA[LEITOR_VERSAO] });
  });
});
