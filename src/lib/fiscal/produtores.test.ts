/**
 * FISCAL onda 1 (a) — a lib da tela de Produtores: lê o que as funções da 117290 devolvem sem cast, agrupa a composição da fazenda e monta
 * o `p_dados` do Salvar só com o que mudou (chave ausente = o banco mantém).
 *   L1 a linha da `fn_fiscal_titulares_lista` vira o titular; lixo vira vazio/nulo, nunca inventa
 *   L2 a composição da fazenda junta os titulares; "com quem divide" mostra os outros (caso Vera × Higino, 50/50)
 *   L3 o payload: no novo só o preenchido; na edição só o que mudou (o CPF digitado com máscara igual não vai; limpar manda vazio; IE mudou = a lista inteira)
 *   L4 pendências do Salvar: só nome e documento (o resto é aviso do banco)
 *   L5 a prévia: diferenças com nome (nunca id), composição antes × depois, avisos, "a anterior termina", "nada muda"
 *   L6 o selo da lista
 */
import { describe, it, expect } from 'vitest';
import {
  comQuemDivide, composicaoPorFazenda, dadosDoForm, formDoTitular, lerPrevia, pendenciasDoForm, seloDoTitular, titularDaLinha, FORM_VAZIO,
} from './produtores';

const VERA = {
  id: 't-vera', nome: 'Produtora Sintética', documento: '52998224725', documento_formatado: '529.982.247-25', tipo: 'PF', papel: 'produtor',
  cnpj_produtor: null, nascimento: '1960-05-20', email_fiscal: 'fiscal@teste.com.br', endereco: 'Rod. 1', municipio: 'Campo Grande', uf: 'MS', cep: '79000000',
  regime_ir: 'pf_atividade_rural', ativo: true, ies: [{ uf: 'MS', ie: '281234567', fazenda_id: 'f1' }],
  fazendas: [{ fazenda_id: 'f1', fazenda: 'Faz. Um', participacao: 50, condicao: 'condomino', registra: 'so_a_parte', desde: '2020-01-01', ate: null }],
  condicao_ibs: { condicao: 'nao_contribuinte', desde: '2026-01-01', motivo: 'abaixo do limite' }, grupo: [], contas: [{ conta_id: 'c1', conta: 'CC Um' }],
  acordos: 1, pendencias: [],
};
const HIGINO = {
  ...VERA, id: 't-hig', nome: 'Terceiro Sintético', documento: '12345678909', documento_formatado: '123.456.789-09', papel: 'terceiro', condicao_ibs: null,
  fazendas: [{ fazenda_id: 'f1', fazenda: 'Faz. Um', participacao: 50, condicao: 'condomino', registra: 'total', desde: '2020-01-01', ate: null }],
};

describe('lista', () => {
  it('L1 a linha vira o titular; lixo vira vazio, nunca inventa', () => {
    const t = titularDaLinha(VERA);
    expect(t.tipo).toBe('PF');
    expect(t.fazendas[0]).toEqual({ fazenda_id: 'f1', fazenda: 'Faz. Um', participacao: 50, condicao: 'condomino', registra: 'so_a_parte', desde: '2020-01-01', ate: null });
    expect(t.condicao_ibs?.condicao).toBe('nao_contribuinte');
    const x = titularDaLinha({ id: 'x', regime_ir: 'inventado', condicao_ibs: { condicao: 'qualquer' }, fazendas: 'não é lista', papel: 'dono' });
    expect([x.regime_ir, x.condicao_ibs, x.fazendas, x.papel, x.nome]).toEqual([null, null, [], 'produtor', '']);
  });
  it('L2 a composição junta os titulares e "com quem divide" mostra os outros', () => {
    const comp = composicaoPorFazenda([titularDaLinha(VERA), titularDaLinha(HIGINO)]);
    expect(comp.get('f1')?.map(p => p.titular_id).sort()).toEqual(['t-hig', 't-vera']);
    expect(comQuemDivide('f1', 't-vera', comp)).toBe('Terceiro Sintético 50%');
    expect(comQuemDivide('f9', 't-vera', comp)).toBe('—');
  });
  it('L6 o selo da lista', () => {
    expect(seloDoTitular(titularDaLinha(VERA)).texto).toBe('não contribuinte');
    expect(seloDoTitular(titularDaLinha(HIGINO)).texto).toBe('terceiro');
    expect(seloDoTitular(titularDaLinha({ ...VERA, condicao_ibs: { condicao: 'optante' } })).texto).toBe('contribuinte');
    expect(seloDoTitular(titularDaLinha({ ...VERA, ativo: false })).texto).toBe('inativo');
  });
});

describe('o Salvar', () => {
  const base = formDoTitular(titularDaLinha(VERA));
  it('L3 novo: só o preenchido', () => {
    expect(dadosDoForm(null, { ...FORM_VAZIO, ies: [], nome: ' Nova ', documento: '111.444.777-35' })).toEqual({ nome: 'Nova', documento: '111.444.777-35', papel: 'produtor' });
  });
  it('L3 edição: só o que mudou; documento com outra máscara não vai; limpar manda vazio; IE mudou = a lista inteira', () => {
    expect(dadosDoForm(base, base)).toEqual({});
    expect(dadosDoForm(base, { ...base, documento: '52998224725' })).toEqual({});
    expect(dadosDoForm(base, { ...base, email_fiscal: '' })).toEqual({ email_fiscal: '' });
    expect(dadosDoForm(base, { ...base, ies: [...base.ies, { uf: 'MT', ie: '131234567', fazenda_id: null }] })).toEqual({
      ies: [{ uf: 'MS', ie: '281234567', fazenda_id: 'f1' }, { uf: 'MT', ie: '131234567', fazenda_id: '' }],
    });
  });
  it('L4 pendências: só nome, documento e a UF da IE', () => {
    expect(Object.keys(pendenciasDoForm({ ...FORM_VAZIO, ies: [{ uf: '', ie: '123', fazenda_id: null }] })).sort()).toEqual(['documento', 'ies', 'nome']);
    expect(pendenciasDoForm(base)).toEqual({});
  });
});

describe('a prévia', () => {
  const nomes = new Map([['f1', 'Faz. Um'], ['t-hig', 'Terceiro Sintético']]);
  it('L5 diferenças com nome (nunca id) e as pendências como aviso', () => {
    const p = lerPrevia({ frase: 'Atualiza X.', diferencas: [{ campo: 'terceiro_id', antes: null, depois: 't-hig' }, { campo: 'regime_ir', antes: null, depois: 'pj_real' },
      { campo: 'nascimento', antes: '1960-05-20', depois: null }], pendencias: ['Sem e-mail fiscal'] }, nomes);
    expect(p.linhas).toEqual(['Terceiro: — → Terceiro Sintético', 'Regime do IR: — → PJ · real', 'Nascimento: 20/05/1960 → —']);
    expect(p.avisos).toEqual(['Cadastro incompleto: Sem e-mail fiscal']);
    expect(p.nadaMuda).toBe(false);
  });
  it('L5 composição: antes × depois, aviso da soma e a versão anterior que termina', () => {
    const p = lerPrevia({ frase: 'Faz. Um: nova composição a partir de 01/03/2026.', antes: [{ nome: 'A', participacao: 100, registra: 'total' }],
      depois: [{ nome: 'A', participacao: 50, registra: 'so_a_parte' }], avisos: ['A soma de Faz. Um é 50% (não 100%)'], anterior_termina: '2026-02-28', corrige_a_versao: false });
    expect(p.linhas).toEqual(['Antes: A 100%', 'Depois: A 50% (só a parte)', 'A versão anterior termina em 28/02/2026.']);
    expect(p.avisos).toEqual(['A soma de Faz. Um é 50% (não 100%)']);
  });
  it('L5 "nada muda" apaga o Gravar', () => {
    expect(lerPrevia({ frase: 'X: nada muda.', diferencas: [] }).nadaMuda).toBe(true);
    expect(lerPrevia({ frase: 'Faz. Um: nada muda a partir de 01/01/2020.', antes: [], depois: [] }).nadaMuda).toBe(true);
  });
});
