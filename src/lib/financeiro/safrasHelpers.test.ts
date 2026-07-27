import { describe, it, expect } from 'vitest';
import {
  escopoLabel,
  ordenarSafras,
  parseOrdemExibicao,
  validarSafra,
  buildEmUsoSet,
  mapErroSalvarSafra,
  type SafraFormInput,
} from './safrasHelpers';

describe('escopoLabel — rótulo de escopo (legado NULL → "Não definido")', () => {
  it('mapeia os três escopos oficiais', () => {
    expect(escopoLabel('pecuaria')).toBe('Pecuária');
    expect(escopoLabel('agricultura')).toBe('Agricultura');
    expect(escopoLabel('administrativo')).toBe('Administrativo');
  });
  it('NULL/indefinido/valor estranho → "Não definido"', () => {
    expect(escopoLabel(null)).toBe('Não definido');
    expect(escopoLabel(undefined)).toBe('Não definido');
    expect(escopoLabel('outro')).toBe('Não definido');
  });
});

describe('parseOrdemExibicao — Opção A: NOT NULL DEFAULT 0', () => {
  it('campo vazio gera 0 (nunca NULL)', () => {
    expect(parseOrdemExibicao('')).toEqual({ ok: true, value: 0 });
    expect(parseOrdemExibicao('   ')).toEqual({ ok: true, value: 0 });
  });
  it('zero é aceito', () => {
    expect(parseOrdemExibicao('0')).toEqual({ ok: true, value: 0 });
  });
  it('inteiro positivo é aceito', () => {
    expect(parseOrdemExibicao('3')).toEqual({ ok: true, value: 3 });
    expect(parseOrdemExibicao(' 12 ')).toEqual({ ok: true, value: 12 });
  });
  it('negativo é rejeitado', () => {
    expect(parseOrdemExibicao('-1').ok).toBe(false);
  });
  it('decimal é rejeitado', () => {
    expect(parseOrdemExibicao('1.5').ok).toBe(false);
    expect(parseOrdemExibicao('1,5').ok).toBe(false);
  });
  it('não-numérico é rejeitado', () => {
    expect(parseOrdemExibicao('abc').ok).toBe(false);
  });
});

describe('ordenarSafras — ordem crescente e depois nome pt-BR', () => {
  it('ordena por ordem_exibicao asc, empate por nome (localeCompare pt-BR)', () => {
    const list = [
      { ordem_exibicao: 2, nome: 'Zeta' },
      { ordem_exibicao: 0, nome: 'Banana' },
      { ordem_exibicao: 0, nome: 'Abacaxi' },
      { ordem_exibicao: 1, nome: 'Café' },
    ];
    expect(ordenarSafras(list).map(x => x.nome)).toEqual(['Abacaxi', 'Banana', 'Café', 'Zeta']);
  });
  it('não muta a lista original', () => {
    const list = [{ ordem_exibicao: 1, nome: 'B' }, { ordem_exibicao: 0, nome: 'A' }];
    ordenarSafras(list);
    expect(list.map(x => x.nome)).toEqual(['B', 'A']);
  });
});

describe('validarSafra — criação/edição exige nome, código e escopo', () => {
  const base: SafraFormInput = {
    nome: 'Safra 26/27 Soja', codigo: '26/27-SOJ', escopo_negocio: 'agricultura',
    ordemRaw: '1', descricao: '  detalhe  ', observacoes: '', ativa: true,
  };

  it('caminho feliz: trim de nome/código e vazios → NULL', () => {
    const r = validarSafra({ ...base, nome: '  Safra X ', codigo: ' CX ', observacoes: '   ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.nome).toBe('Safra X');
      expect(r.payload.codigo).toBe('CX');
      expect(r.payload.descricao).toBe('detalhe');
      expect(r.payload.observacoes).toBeNull();
      expect(r.payload.ordem_exibicao).toBe(1);
      expect(r.payload.escopo_negocio).toBe('agricultura');
    }
  });
  it('nome só com espaços → erro', () => {
    const r = validarSafra({ ...base, nome: '   ' });
    expect(r).toEqual({ ok: false, erro: 'Informe o nome da Safra.' });
  });
  it('código vazio → erro', () => {
    const r = validarSafra({ ...base, codigo: '' });
    expect(r).toEqual({ ok: false, erro: 'Informe o código da Safra.' });
  });
  it('escopo não selecionado → erro (só ao salvar)', () => {
    const r = validarSafra({ ...base, escopo_negocio: '' });
    expect(r).toEqual({ ok: false, erro: 'Selecione o escopo do negócio.' });
  });
  it('ordem vazia → payload com 0', () => {
    const r = validarSafra({ ...base, ordemRaw: '' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.ordem_exibicao).toBe(0);
  });
  it('ordem decimal → erro', () => {
    expect(validarSafra({ ...base, ordemRaw: '2.5' }).ok).toBe(false);
  });
  it('ordem negativa → erro', () => {
    expect(validarSafra({ ...base, ordemRaw: '-3' }).ok).toBe(false);
  });
});

describe('buildEmUsoSet — Set de safra_id vinculados', () => {
  it('deduplica e ignora nulos', () => {
    const s = buildEmUsoSet([{ safra_id: 'a' }, { safra_id: 'a' }, { safra_id: null }, { safra_id: 'b' }]);
    expect(s.has('a')).toBe(true);
    expect(s.has('b')).toBe(true);
    expect(s.size).toBe(2);
  });
  it('lista vazia/null → Set vazio', () => {
    expect(buildEmUsoSet([]).size).toBe(0);
    expect(buildEmUsoSet(null).size).toBe(0);
  });
});

describe('mapErroSalvarSafra — mensagens amigáveis de unicidade (23505)', () => {
  it('sem erro → null', () => {
    expect(mapErroSalvarSafra(null)).toBeNull();
  });
  it('23505 conflito de nome (por nome de constraint)', () => {
    expect(mapErroSalvarSafra({ code: '23505', message: 'duplicate key value violates unique constraint "financeiro_safras_cliente_nome_uk"' }))
      .toBe('Já existe uma Safra com este nome.');
  });
  it('23505 conflito de código (por detalhe)', () => {
    expect(mapErroSalvarSafra({ code: '23505', message: 'duplicate key', details: 'Key (cliente_id, codigo)=(x, CX) already exists.' }))
      .toBe('Já existe uma Safra com este código.');
  });
  it('23505 indiferenciado → mensagem genérica de duplicidade', () => {
    expect(mapErroSalvarSafra({ code: '23505', message: 'duplicate key value' }))
      .toBe('Já existe uma Safra com estes dados.');
  });
  it('erro não-23505 → mensagem genérica de salvamento (sem vazar SQL)', () => {
    const msg = mapErroSalvarSafra({ code: '42501', message: 'permission denied' });
    expect(msg).toBe('Erro ao salvar a Safra.');
    expect(msg).not.toContain('permission');
  });
});
