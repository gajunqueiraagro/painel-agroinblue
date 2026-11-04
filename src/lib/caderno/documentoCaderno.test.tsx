/**
 * CADERNO-CAMPO-01 peça 1 — o PDF do "Exportar mês" se monta de verdade (react-pdf), uma página por folha escolhida, sem fonte
 * monoespaçada (regra 17/10). Dados SINTÉTICOS.
 */
import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { cadernoDoMes, FOLHAS_DO_CADERNO, type FolhaDoCaderno } from './cadernoDoMes';
import { DocumentoCaderno } from './DocumentoCaderno';
import type { Lancamento } from '@/types/cattle';

const lanc: Lancamento[] = [
  { id: '1', data: '2031-02-11', tipo: 'morte', quantidade: 1, categoria: 'vacas', fazendaDestino: 'Natimorto', cenario: 'realizado', statusOperacional: 'realizado' },
  { id: '2', data: '2031-01-05', tipo: 'compra', quantidade: 10, categoria: 'novilhas', pesoMedioKg: 300, cenario: 'realizado', statusOperacional: 'realizado' },
];

function montar(folhas: readonly FolhaDoCaderno[]) {
  return cadernoDoMes({
    cliente: 'Cliente Teste', fazenda: 'Faz. Teste', ano: 2031, mes: 2, geradoEm: '04/11/2031', folhas,
    rebanho: [], lancamentos: lanc, vigentes: [], mapa: new Map(), categorias: [],
    chuvas: [{ id: 'c', fazendaId: 'f', data: '2031-02-10', milimetros: 30 }],
  });
}

const paginas = (pdf: string) => (pdf.match(/\/Type \/Page\b/g) ?? []).length;

describe('DocumentoCaderno', () => {
  it('T11 todas as folhas = um PDF de 10 páginas, sem fonte monoespaçada', async () => {
    const buf = await renderToBuffer(<DocumentoCaderno caderno={montar(FOLHAS_DO_CADERNO.map((f) => f.id))} />);
    const txt = buf.toString('latin1');
    expect(txt.startsWith('%PDF')).toBe(true);
    expect(paginas(txt)).toBe(10);
    expect(/Courier/.test(txt)).toBe(false);
  }, 30000);
  it('T12 só as folhas escolhidas (D5)', async () => {
    const buf = await renderToBuffer(<DocumentoCaderno caderno={montar(['conciliacao', 'chuva'])} />);
    expect(paginas(buf.toString('latin1'))).toBe(2);
  }, 30000);
});
