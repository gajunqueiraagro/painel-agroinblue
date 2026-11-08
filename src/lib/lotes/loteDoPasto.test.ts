/** LOTES-03 F1 — o campo Lote do modal do pasto: o lote vai por categoria; só a categoria com cabeça leva lote. */
import { describe, it, expect } from 'vitest';
import { comLoteEmTodos, comLoteNaCategoria, loteDoCard, lotesQueSeguem, rotuloDoLote, semLoteNoZerado, textoDoLoteNoCaderno } from './loteDoPasto';
import { opcoesDosLotes } from '@/components/fechamento/CampoLoteDoPasto';
import type { LoteDaLista } from './tipos';

const it3 = [
  { categoria_id: 'df', quantidade: 75, lote_id: null as string | null },
  { categoria_id: 'nov', quantidade: 5, lote_id: null as string | null },
  { categoria_id: 'vac', quantidade: 0, lote_id: null as string | null },
];
const lote = (id: string, codigo: string, nomeCampeiro: string | null): LoteDaLista => ({
  id, codigo, nomeCampeiro, codigosAntigos: [], situacao: 'ativo', formadoEm: '2026-09-30', encerradoEm: null, categoriaId: 'c', racaId: 'r',
  atividadeId: 'a', numero: 5, sistemaId: null, programaId: null, destinoId: null, safra: null, carimbo: null, idadeMediaMeses: null,
  metaPesoKg: null, metaGmdKg: null, metaData: null, versao: 1, anoMesDado: null, cabecas: null, pesoMedioKg: null, gmdKg: null, pastos: [], lancamentos: 0, conferir: null,
});
const L = [lote('l5', 'DF-NE-RC-05', 'L05 - DF Nel. SP'), lote('n2', 'N2-NE-RP-01', null)];

describe('loteDoPasto', () => {
  it('um lote para o pasto inteiro: só quem tem cabeça leva; tirar = sem lote', () => {
    const com = comLoteEmTodos(it3, 'l5');
    expect(com.map(i => i.lote_id)).toEqual(['l5', 'l5', null]);
    expect(loteDoCard(com)).toEqual({ tipo: 'um', loteId: 'l5', semLote: 0 });
    expect(loteDoCard(comLoteEmTodos(com, null))).toEqual({ tipo: 'nenhum' });
  });
  it('por categoria: dois lotes no mesmo card; a categoria sem cabeça não recebe lote', () => {
    const dois = comLoteNaCategoria(comLoteEmTodos(it3, 'l5'), 'nov', 'n2');
    expect(loteDoCard(dois)).toEqual({ tipo: 'varios', loteIds: ['l5', 'n2'], semLote: 0 });
    expect(comLoteNaCategoria(it3, 'vac', 'l5').find(i => i.categoria_id === 'vac')?.lote_id).toBeNull();
    expect(loteDoCard(comLoteNaCategoria(it3, 'df', 'l5'))).toEqual({ tipo: 'um', loteId: 'l5', semLote: 1 });
  });
  it('zerou a categoria: o lote dela sai', () => {
    const zerado = semLoteNoZerado(comLoteEmTodos(it3, 'l5').map(i => (i.categoria_id === 'nov' ? { ...i, quantidade: 0 } : i)));
    expect(zerado.map(i => i.lote_id)).toEqual(['l5', null, null]);
  });
  it('copiar anterior leva o lote só se ele segue ativo', () => {
    const copiado = [{ categoria_id: 'df', quantidade: 75, lote_id: 'l5' }, { categoria_id: 'nov', quantidade: 5, lote_id: 'velho' }];
    expect(lotesQueSeguem(copiado, new Set(['l5'])).map(i => i.lote_id)).toEqual(['l5', null]);
  });
  it('o rótulo: código (nome no title), "2 lotes", "Sem lote", e quantas categorias faltam', () => {
    expect(rotuloDoLote({ tipo: 'um', loteId: 'l5', semLote: 0 }, L)).toEqual({ texto: 'DF-NE-RC-05', title: 'DF-NE-RC-05 · L05 - DF Nel. SP' });
    expect(rotuloDoLote({ tipo: 'um', loteId: 'l5', semLote: 1 }, L).title).toBe('DF-NE-RC-05 · L05 - DF Nel. SP · 1 categoria sem lote');
    expect(rotuloDoLote({ tipo: 'varios', loteIds: ['l5', 'n2'], semLote: 0 }, L)).toEqual({ texto: '2 lotes', title: 'DF-NE-RC-05 · L05 - DF Nel. SP · N2-NE-RP-01' });
    expect(rotuloDoLote({ tipo: 'nenhum' }, L).texto).toBe('Sem lote');
  });
  it('LOTES-05: a cria com carimbo aparece como "7.1" (o código no title); na escolha, o código em cinza separa os "7.1" e a busca acha o código', () => {
    const c1 = { ...lote('c1', 'CRI-PP-NE-05', 'Vaca CAR_7.1'), carimbo: '7.1' };
    const c2 = { ...lote('c2', 'CRI-PP-NE-07', null), carimbo: '7.1' };
    expect(rotuloDoLote({ tipo: 'um', loteId: 'c1', semLote: 0 }, [c1])).toEqual({ texto: '7.1', title: '7.1 · CRI-PP-NE-05 · Vaca CAR_7.1' });
    expect(opcoesDosLotes([c1, c2, L[0]]).map(o => [o.label, o.sub, o.busca])).toEqual([
      ['7.1', 'CRI-PP-NE-05 · Vaca CAR_7.1', 'CRI-PP-NE-05'], ['7.1', 'CRI-PP-NE-07', 'CRI-PP-NE-07'], ['DF-NE-RC-05', 'L05 - DF Nel. SP', 'DF-NE-RC-05']]);
  });
  it('LOTES-05: o texto do "Usar o lote" — um lote, dois (sem repetir), nenhum; categoria sem cabeça não conta', () => {
    const c1 = { ...lote('c1', 'CRI-VAC-NEL-04', null), carimbo: '7.1' };
    const c2 = { ...lote('c2', 'CRI-VAC-NEL-05', null), carimbo: '8.1' };
    const itens = [{ categoria_id: 'a', quantidade: 9, lote_id: 'c1' }, { categoria_id: 'b', quantidade: 3, lote_id: 'c1' }];
    expect(textoDoLoteNoCaderno(itens, [c1, c2])).toBe('7.1');
    expect(textoDoLoteNoCaderno([...itens, { categoria_id: 'c', quantidade: 2, lote_id: 'c2' }], [c1, c2])).toBe('7.1 · 8.1');
    expect(textoDoLoteNoCaderno([{ categoria_id: 'c', quantidade: 0, lote_id: 'c2' }], [c1, c2])).toBeNull();
    expect(textoDoLoteNoCaderno([{ categoria_id: 'a', quantidade: 5, lote_id: 'l5' }], L)).toBe('DF-NE-RC-05');
    expect(textoDoLoteNoCaderno(it3, L)).toBeNull();
  });
});
