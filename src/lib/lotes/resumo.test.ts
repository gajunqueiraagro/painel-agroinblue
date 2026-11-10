/** LOTES-06 — a aba Resumo da lista de Lotes, com o caso do mock (Vera, Faz. 3 Muchachas, os 16 lotes do print 09:30). */
import { describe, it, expect } from 'vitest';
import type { CadastroDoLote, LoteDaLista } from './tipos';
import { mapaDoCadastro } from './lista';
import { pastoDoLote, quadro, resumoDosLotes, sexoDosCodigos, somar } from './resumo';

const cad = (id: string, tipo: CadastroDoLote['tipo'], sigla: string, nome: string): CadastroDoLote => ({ id, tipo, sigla, nome, categoriasRebanho: [], ordem: 10, ativo: true });
const nomes = mapaDoCadastro([
  cad('CRI', 'atividade', 'CRI', 'Cria'), cad('REC', 'atividade', 'REC', 'Recria'), cad('ENG', 'atividade', 'ENG', 'Engorda'),
  ...['LEI:Leiteiras', 'NOV:Novilhas', 'PRE:Precoce', 'TOU:Touros', 'VAC:Vacas', 'DF:Desmama F', 'DM:Desmama M', 'GAR:Garrotes']
    .map((x) => { const [id, n] = x.split(':'); return cad(id, 'categoria', id, n); }),
  ...['MIX:Várias raças', 'NEL:Nelore', 'CZ:Cruzada', 'ANG:Angus'].map((x) => { const [id, n] = x.split(':'); return cad(id, 'raca', id, n); }),
  cad('INS', 'programa', 'INS', '1ª inseminação'),
]);
const SEXO: Record<string, 'M' | 'F'> = { LEI: 'F', NOV: 'F', PRE: 'F', TOU: 'M', VAC: 'F', DF: 'F', DM: 'M', GAR: 'M' };
let n = 0;
const lote = (a: string, c: string, r: string, cab: number, peso: number | null, pastos: number, programa: string | null = null): LoteDaLista => ({
  id: `l${++n}`, codigo: `${a}-${c}-${r}-${n}`, codigosAntigos: [], nomeCampeiro: null, situacao: 'ativo', formadoEm: '2026-01-01', encerradoEm: null,
  categoriaId: c, racaId: r, atividadeId: a, numero: n, sistemaId: null, programaId: programa, destinoId: null, safra: null, carimbo: null,
  idadeMediaMeses: null, metaPesoKg: null, metaGmdKg: null, metaData: null, versao: 1, anoMesDado: cab ? '2026-11' : null,
  cabecas: cab ? cab : null, pesoMedioKg: peso, gmdKg: null, pastos: Array.from({ length: pastos }, (_, i) => `P_${i}`), lancamentos: cab ? 1 : 0, conferir: null,
});
const D = [
  lote('CRI', 'LEI', 'MIX', 34, 302, 1), lote('CRI', 'NOV', 'NEL', 31, 335, 1), lote('CRI', 'NOV', 'NEL', 84, 353, 1, 'INS'), lote('CRI', 'PRE', 'CZ', 76, 314, 2),
  lote('CRI', 'TOU', 'MIX', 3, 670, 1), lote('CRI', 'VAC', 'NEL', 0, null, 0),
  lote('REC', 'DF', 'ANG', 131, 290, 3), lote('REC', 'DF', 'CZ', 76, 230, 1), lote('REC', 'DF', 'MIX', 56, 270, 1), lote('REC', 'DM', 'ANG', 93, 305, 1),
  lote('REC', 'DM', 'CZ', 80, 280, 1), lote('REC', 'DM', 'MIX', 61, 230, 1), lote('REC', 'GAR', 'MIX', 5, 340, 1), lote('REC', 'NOV', 'CZ', 69, 400, 1),
  lote('REC', 'NOV', 'MIX', 84, 345, 1), lote('ENG', 'VAC', 'NEL', 25, 446, 1),
];
const r = resumoDosLotes(D, nomes, (c) => SEXO[c] ?? 'misto');

describe('LOTES-06 — o Resumo (3M, 16 lotes)', () => {
  it('os números do topo: 908 cab em 16 lotes · 309 kg · 242 machos · 666 fêmeas · 9.366 @', () => {
    expect([r.total.cabecas, r.total.lotes, Math.round(r.total.pesoMedioKg ?? 0), r.machos, r.femeas, Math.round(r.arrobas ?? 0)]).toEqual([908, 16, 309, 242, 666, 9366]);
  });
  it('por atividade na ordem da fase, com o peso ponderado e a % das cabeças', () => {
    const q = r.quadros[0];
    expect(q.linhas.map((l) => [l.rotulo, l.cabecas, Math.round(l.pesoMedioKg ?? 0), Math.round(l.pct * 10) / 10])).toEqual([
      ['Cria', 228, 334, 25.1], ['Recria', 655, 296, 72.1], ['Engorda', 25, 446, 2.8]]);
    expect(q.linhas.map((l) => l.barra)).toEqual([228 / 655, 1, 25 / 655]);
  });
  it('os outros quadros ordenam pelas cabeças; sem programa e o pasto em 3 grupos', () => {
    expect(r.quadros.map((q) => q.titulo)).toEqual(['Por atividade', 'Por raça', 'Por sexo', 'Por categoria', 'Por programa', 'Por pasto']);
    expect(r.quadros[2].linhas.map((l) => [l.rotulo, l.cabecas])).toEqual([['Fêmeas', 666], ['Machos', 242]]);
    expect(r.quadros[4].linhas.map((l) => [l.rotulo, l.cabecas])).toEqual([['Sem programa', 824], ['1ª inseminação', 84]]);
    expect(r.quadros[5].linhas.map((l) => [l.rotulo, l.cabecas])).toEqual([['Em 1 pasto', 701], ['Em 2+ pastos', 207], ['Sem pasto no mês', 0]]);
    expect(r.quadros.every((q) => q.total.cabecas === 908)).toBe(true);
  });
  it('o sexo pelos códigos do rebanho; sem peso nenhum = sem peso e sem arroba', () => {
    expect([sexoDosCodigos(['desmama_m', 'bois']), sexoDosCodigos(['vacas']), sexoDosCodigos(['vacas', 'touros']), sexoDosCodigos([])]).toEqual(['M', 'F', 'misto', 'misto']);
    expect(somar([lote('CRI', 'VAC', 'NEL', 10, null, 1)])).toEqual({ cabecas: 10, pesoMedioKg: null, pesoVivoKg: 0, lotes: 1 });
    expect(resumoDosLotes([lote('CRI', 'VAC', 'NEL', 10, null, 1)], nomes, () => 'F').arrobas).toBeNull();
    expect(pastoDoLote({ pastos: [] })).toBe('Sem pasto no mês');
    expect(quadro('x', 'x', [], () => 'a')).toEqual({ titulo: 'x', coluna: 'x', linhas: [], total: { cabecas: 0, pesoMedioKg: null, pesoVivoKg: 0, lotes: 0 } });
  });
});
