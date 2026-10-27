/**
 * P134 — a busca sem acento: o arquivo de casos ÚNICO roda aqui contra a tela e, pelo SQL gerado, contra o banco.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import casos from './busca.casos.json';
import { normalizarParaBusca, casaNaBusca } from './busca';
import { normalizarNome } from '@/lib/fornecedores/buscaDeFornecedor';

describe('P134 — normalizarParaBusca (a mesma regra do _fn_normalizar_texto)', () => {
  it.each(casos.normalizacao)('"$entrada" → "$saida"', ({ entrada, saida }) => {
    expect(normalizarParaBusca(entrada)).toBe(saida);
  });
  it('a busca de fornecedor usa a MESMA função (não uma cópia)', () => {
    expect(normalizarNome).toBe(normalizarParaBusca);
  });
  it('nulo e indefinido viram vazio', () => {
    expect(normalizarParaBusca(null)).toBe('');
    expect(normalizarParaBusca(undefined)).toBe('');
  });
});

describe('P134 — casaNaBusca (a mesma regra do fn_texto_casa)', () => {
  it.each(casos.casa)('"$termo" em "$texto" → $casa', ({ texto, termo, casa }) => {
    expect(casaNaBusca(texto, termo)).toBe(casa);
  });
  it('os quatro casos do pedido do Gabriel estão no arquivo', () => {
    const tem = (texto: string, termo: string) => casos.casa.some((c) => c.texto.includes(texto) && c.termo === termo && c.casa);
    expect(tem('Máquinas', 'maq')).toBe(true);
    expect(tem('Manutenção', 'manutencao')).toBe(true);
    expect(tem('Açúcar', 'acucar')).toBe(true);
    expect(tem('João', 'JOAO')).toBe(true);
  });
});

describe('P134 — o teste SQL está em dia com o arquivo de casos', () => {
  it('o .sql gravado é o que `node scripts/gerar-teste-busca-sem-acento.mjs` produz agora', () => {
    const raiz = resolve(__dirname, '../../..');
    const gerado = execFileSync('node', [resolve(raiz, 'scripts/gerar-teste-busca-sem-acento.mjs'), '--stdout'], { encoding: 'utf8' });
    expect(readFileSync(resolve(raiz, 'supabase/tests/p134_busca_sem_acento_test.sql'), 'utf8')).toBe(gerado);
  });
});
