/**
 * MAPA-REBANHO-02 — a coluna "Programa" do Mapa do rebanho: o programa do lote pela fonte única (itens do fechamento → lote → cadastro).
 * Dados SINTÉTICOS (o caso do adendo: só o lote da inseminação tem programa).
 */
import { describe, expect, it } from 'vitest';
import { lotesDoPasto, programaDoPasto, loteDoMapa, tituloDoLoteNoMapa } from './programaDoPasto';
import { readFileSync } from 'node:fs';
import { mapaDoCadastro } from '@/lib/lotes/lista';
import type { CadastroDoLote } from '@/lib/lotes/tipos';

const cad = (id: string, nome: string): CadastroDoLote => ({ id, tipo: 'programa', sigla: null, nome, categoriasRebanho: [], ordem: 1, ativo: true });
const NOMES = mapaDoCadastro([cad('pg-ins', '1ª inseminação'), cad('pg-iatf', 'IATF')]);
const LOTES = [{ id: 'l-ins', programaId: 'pg-ins' }, { id: 'l-cri', programaId: null }, { id: 'l-iatf', programaId: 'pg-iatf' }, { id: 'l-ins2', programaId: 'pg-ins' }];

describe('os lotes do pasto no mês', () => {
  it('só os itens COM cabeça, sem repetir, na ordem; item sem lote não conta', () => {
    expect(lotesDoPasto([{ quantidade: 9, lote_id: 'l-ins' }, { quantidade: 0, lote_id: 'l-cri' }, { quantidade: 4, lote_id: 'l-ins' },
      { quantidade: 3, lote_id: null }, { quantidade: 2 }, { quantidade: 5, lote_id: 'l-iatf' }])).toEqual(['l-ins', 'l-iatf']);
    expect(lotesDoPasto([])).toEqual([]);
  });
});

describe('o programa do pasto', () => {
  it('o lote com programa: o nome do cadastro', () => {
    expect(programaDoPasto(['l-ins'], LOTES, NOMES)).toBe('1ª inseminação');
  });
  it('sem lote, lote sem programa, lote que a leitura não trouxe ou programa fora do cadastro: null (a tela escreve "—")', () => {
    expect(programaDoPasto([], LOTES, NOMES)).toBeNull();
    expect(programaDoPasto(['l-cri'], LOTES, NOMES)).toBeNull();
    expect(programaDoPasto(['l-sumiu'], LOTES, NOMES)).toBeNull();
    expect(programaDoPasto(['l-ins'], LOTES, mapaDoCadastro([]))).toBeNull();
  });
  it('mais de um programa no pasto: os nomes, sem repetir', () => {
    expect(programaDoPasto(['l-ins', 'l-cri', 'l-iatf', 'l-ins2'], LOTES, NOMES)).toBe('1ª inseminação · IATF');
  });
});

/* MAPA-REBANHO-L2 (Gabriel 09/11 07:51, Raul · Monterrey · set/26) — a coluna Lote é o LOTE, o nome do caderno vai no title. SINTÉTICO. */
describe('a coluna Lote do Mapa do rebanho (MAPA-REBANHO-L2)', () => {
  const L = [{ id: 'l-cri', codigo: 'CRI-VAC-NEL-01', carimbo: '7.1' }, { id: 'l-sem', codigo: 'CRI-VAC-NEL-02', carimbo: null }, { id: 'l-rec', codigo: 'REC-NOV-NEL-01', carimbo: null }];
  it('cria com carimbo = o carimbo; sem carimbo = o código (a regra única nomeDoLote); dois lotes = os dois, sem repetir', () => {
    expect(loteDoMapa(['l-cri'], L)).toBe('7.1');
    expect(loteDoMapa(['l-sem'], L)).toBe('CRI-VAC-NEL-02');
    expect(loteDoMapa(['l-cri', 'l-rec', 'l-cri'], L)).toBe('7.1 · REC-NOV-NEL-01');
  });
  it('P_03 "Vacas Prenhas" sem lote cadastrado (ajuste 08:12): o lote é nulo, a célula mostra o caderno em cinza, title "sem lote cadastrado"', () => {
    expect(loteDoMapa([], L)).toBeNull();
    expect(tituloDoLoteNoMapa([], L, 'Vacas Prenhas')).toBe('sem lote cadastrado — Vacas Prenhas');
    expect(tituloDoLoteNoMapa(['l-que-sumiu'], L, 'Vacas')).toBe('sem lote cadastrado — Vacas');
    const f = readFileSync('src/pages/MapaPastosTab.tsx', 'utf8');
    /* cinza e cortando com "…" DENTRO da célula; sem itálico (o gate reprova o inclinado cortado: 56px a 919px) */
    expect(f).toContain('<span className="block truncate text-slate-400" data-testid="lote-sem-cadastro">{row.loteNoCaderno}</span>');
  });
  it('o title: o caderno e o código quando aparece o carimbo', () => {
    expect(tituloDoLoteNoMapa(['l-cri'], L, 'Vacas')).toBe('No caderno: Vacas · CRI-VAC-NEL-01');
    expect(tituloDoLoteNoMapa(['l-rec'], L, null)).toBe('');
  });
  it('a tela, o PDF e o Excel: a MESMA linha (o lote pelo loteDoMapa; o caderno no title da célula)', () => {
    const f = readFileSync('src/pages/MapaPastosTab.tsx', 'utf8');
    expect(f).toContain('lote: loteDoMapa(r.loteIds, lotesDoMes), tituloDoLote: tituloDoLoteNoMapa(r.loteIds, lotesDoMes, r.loteNoCaderno),');
    expect(f).toContain('title={row.tituloDoLote}');
    expect(f).toContain('lote: null, loteNoCaderno: lote,');
    expect(readFileSync('src/lib/exportMapaPastosPdf.ts', 'utf8')).toContain("row.lote || row.loteNoCaderno || '',");
    expect(readFileSync('src/lib/exportMapaPastos.ts', 'utf8')).toContain("row.lote || row.loteNoCaderno || ''");
  });
});
