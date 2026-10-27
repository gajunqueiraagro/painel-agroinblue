/** P116 — o Salvar que não muda nada não grava. Dados SINTÉTICOS. */
import { describe, it, expect } from 'vitest';
import { edicaoSemMudanca } from './edicaoSemMudanca';

const linha = {
  valor: '821.22', data_pagamento: '2026-09-10', data_competencia: '2026-10-01', descricao: 'Produce', observacao: null,
  status_transacao: 'realizado', dados_pagamento: { pix: 'x', banco: '001' }, editado_manual: true, updated_by: 'u-1',
};

describe('edicaoSemMudanca', () => {
  it('os mesmos valores (número x texto numérico, vazio x nulo, json noutra ordem) não mudam nada', () => {
    expect(edicaoSemMudanca({
      valor: 821.22, data_pagamento: '2026-09-10', descricao: 'Produce', observacao: '', status_transacao: 'realizado',
      dados_pagamento: { banco: '001', pix: 'x' }, editado_manual: true, updated_by: 'u-2',
    }, linha)).toBe(true);
  });

  it('data pura contra data com hora do mesmo dia não é mudança', () => {
    expect(edicaoSemMudanca({ data_competencia: '2026-10-01' }, { data_competencia: '2026-10-01T00:00:00+00:00' })).toBe(true);
  });

  it.each([
    ['valor', { valor: 821.23 }],
    ['data', { data_pagamento: '2026-09-11' }],
    ['texto', { descricao: 'Produce FR' }],
    ['vazio → preenchido', { observacao: 'nota' }],
    ['json', { dados_pagamento: { pix: 'y', banco: '001' } }],
  ])('%s diferente é mudança', (_n, payload) => {
    expect(edicaoSemMudanca(payload, linha)).toBe(false);
  });

  it('na dúvida grava: sem a linha, ou com campo que a linha lida não tem', () => {
    expect(edicaoSemMudanca({ valor: 1 }, null)).toBe(false);
    expect(edicaoSemMudanca({ cultura: 'soja' }, linha)).toBe(false);
  });

  it('as marcas de quem grava (updated_by, editado_manual) não contam como mudança', () => {
    expect(edicaoSemMudanca({ updated_by: 'outro', editado_manual: true }, { updated_by: 'u-1', editado_manual: null })).toBe(true);
  });
});
