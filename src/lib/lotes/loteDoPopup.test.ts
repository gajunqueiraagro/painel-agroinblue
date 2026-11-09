/** POPUP-ORIGINAL-COR — o lote no popup do pasto = o texto do campo Lote do modal; sem lote, nulo (o popup mostra "Lote —"). Dados SINTÉTICOS. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loteDoPopup } from './loteDoPasto';
import type { LoteDaLista } from './tipos';

const lote = (id: string, codigo: string): LoteDaLista => ({
  id, codigo, codigosAntigos: [], nomeCampeiro: null, situacao: 'ativo', formadoEm: '2026-01-01', encerradoEm: null, categoriaId: 'c1',
  racaId: 'r1', atividadeId: 'a1', numero: 1, sistemaId: null, programaId: null, destinoId: null, safra: null, carimbo: null,
  idadeMediaMeses: null, metaPesoKg: null, metaGmdKg: null, metaData: null, versao: 1, anoMesDado: null, cabecas: null, pesoMedioKg: null,
  gmdKg: null, pastos: [], lancamentos: 0, conferir: null,
});
const LOTES = [lote('l1', 'NOV-IATF-01'), lote('l2', 'DES-CZ-02')];

describe('loteDoPopup', () => {
  it('um lote: o código (o mesmo do botão do campo Lote)', () => {
    expect(loteDoPopup([{ categoria_id: 'c1', quantidade: 31, lote_id: 'l1' }], LOTES)).toBe('NOV-IATF-01');
  });
  it('dois lotes: "2 lotes"; categoria sem cabeça não conta', () => {
    expect(loteDoPopup([{ categoria_id: 'c1', quantidade: 3, lote_id: 'l1' }, { categoria_id: 'c2', quantidade: 6, lote_id: 'l2' },
      { categoria_id: 'c3', quantidade: 0, lote_id: 'l2' }], LOTES)).toBe('2 lotes');
  });
  it('sem lote (ou sem cabeça): nulo — o popup mostra "Lote —"', () => {
    expect(loteDoPopup([{ categoria_id: 'c1', quantidade: 31, lote_id: null }], LOTES)).toBeNull();
    expect(loteDoPopup([], LOTES)).toBeNull();
  });
  it('a tela passa o lote pelo MESMO leitor do modal e pelos itens do card', () => {
    const f = readFileSync('src/pages/FechamentoTab.tsx', 'utf8');
    expect(f).toContain("const lotesDaFazenda = useLotesDaFazenda(fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null, anoMes);");
    expect(f).toContain('lote: loteDoPopup(fech ? itensMap.get(fech.id) ?? [] : [], lotesDaFazenda.lotes),');
  });
});
