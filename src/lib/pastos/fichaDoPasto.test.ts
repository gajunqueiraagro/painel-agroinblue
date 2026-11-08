/**
 * PASTO-FICHA-01 PR B — a lib da ficha: o formulário a partir da `fn_pasto_ficha`, SÓ os campos que mudaram para a `fn_pasto_ficha_salvar`
 * (omitir preserva), a área por fora do cadastro, as pendências do Salvar e a prévia com o NOME (nunca o id).
 */
import { describe, it, expect } from 'vitest';
import { areaMudou, camposDoForm, camposQueMudaram, FORM_VAZIO, lerFicha, lerMudancas, pendencias, type FormDaFicha } from './fichaDoPasto';

const FICHA = {
  pasto: { nome: 'Modulo 04', tipo_uso: 'recria', data_inicio: '2020-01-01', data_fim: null, posse: 'arrendada_de_terceiro', posse_contraparte_id: 'f1',
    posse_desde: '2022-01-01', posse_ate: null, forrageira_principal_id: 'fo1', forrageira_secundaria_id: null, forrageira_implantada_em: '2019-03-01',
    relevo_id: 're1', textura_id: null, drenagem_id: null, sombra_id: null, sombra_cobertura: 'parcial', manejo: 'rotacionado', sistema_id: 'si0', ficha_versao: 3 },
  nomes: { forrageira_principal: 'Marandu', relevo: 'Plano (0–3%)', sistema: 'Pasto' },
  ano_mes: '2026-11', area: { oficial_ha: 144.55, mapa_ha: 151.2, trava: null },
  ultima_avaliacao: { data_avaliacao: '2026-08-14', degradacao: 'leve' }, potencial: { potencial_ua_ha: 1.6, epoca: 'águas' },
  ultima_reforma: { data: '2019-03-01', idade_anos: 7 },
};

describe('lerFicha', () => {
  it('monta o formulário (meses AAAA-MM, itens com nome) e a faixa', () => {
    const f = lerFicha(FICHA)!;
    expect(f.versao).toBe(3);
    expect(f.form.mesInicio).toBe('2020-01');
    expect(f.form.posse).toBe('arrendada_de_terceiro');
    expect(f.form.posseContraparteId).toBe('f1');
    expect(f.form.posseDesde).toBe('2022-01');
    expect(f.form.forrageiraPrincipal).toEqual({ itemId: 'fo1', nome: 'Marandu' });
    expect(f.form.textura).toEqual({ itemId: null, nome: '' });
    expect(f.form.area).toBe(144.55);
    expect(f.areaMapa).toBe(151.2);
    expect(f.resumo.suporte).toBe(1.6);
    expect(f.resumo.reforma).toEqual({ data: '2019-03-01', idadeAnos: 7 });
  });
  it('sem pasto não é ficha (nunca formulário vazio)', () => {
    expect(lerFicha({})).toBeNull();
    expect(lerFicha(null)).toBeNull();
  });
  it('valor fora do vocabulário vira nulo (não se inventa posse/manejo)', () => {
    expect(lerFicha({ ...FICHA, pasto: { ...FICHA.pasto, posse: 'emprestada', manejo: 'x' } })!.form.posse).toBeNull();
  });
});

describe('o que vai ao banco', () => {
  const base = lerFicha(FICHA)!.form;
  it('só os campos que mudaram (omitir preserva no banco)', () => {
    const depois: FormDaFicha = { ...base, manejo: 'continuo', forrageiraPrincipal: { itemId: 'fo3', nome: 'Mombaça' } };
    expect(camposQueMudaram(base, depois)).toEqual({ manejo: 'continuo', forrageira_principal_id: 'fo3' });
    expect(camposQueMudaram(base, base)).toEqual({});
  });
  it('a área nunca vai no cadastro; ela tem escritor próprio', () => {
    expect('area' in camposDoForm(base)).toBe(false);
    expect(areaMudou(base, { ...base, area: 151.2 })).toBe(true);
    expect(areaMudou(base, { ...base, areaDesde: '2026-10' })).toBe(false);
  });
  it('posse própria manda de quem e o período vazios (o banco também limpa)', () => {
    const c = camposDoForm({ ...base, posse: 'propria' });
    expect([c.posse_contraparte_id, c.posse_desde, c.posse_ate]).toEqual([null, null, null]);
    expect(camposQueMudaram(base, { ...base, posse: 'propria' })).toEqual({ posse: 'propria', posse_contraparte_id: null, posse_desde: null });
  });
});

describe('pendências do Salvar', () => {
  it('novo: nome, área e em uso desde', () => {
    const p = pendencias({ ...FORM_VAZIO, mesInicio: null }, true);
    expect(Object.keys(p).sort()).toEqual(['area', 'mesInicio', 'nome']);
  });
  it('fim antes do início, posse até antes do desde e secundária = principal', () => {
    const p = pendencias({ ...FORM_VAZIO, nome: 'X', area: 10, mesInicio: '2026-05', mesFim: '2026-01', posse: 'cedida_a_terceiro', posseDesde: '2026-05',
      posseAte: '2026-01', forrageiraPrincipal: { itemId: 'a', nome: 'A' }, forrageiraSecundaria: { itemId: 'a', nome: 'A' } }, false);
    expect(Object.keys(p).sort()).toEqual(['forrageiraSecundaria', 'mesFim', 'posseAte']);
  });
});

describe('a prévia', () => {
  it('mostra o nome do item e do fornecedor (antes_nome/depois_nome), nunca o id', () => {
    const m = lerMudancas({ muda: [{ campo: 'forrageira_principal_id', antes: 'fo1', depois: 'fo3', antes_nome: 'Marandu', depois_nome: 'Mombaça' },
      { campo: 'manejo', antes: 'rotacionado', depois: 'continuo' }] });
    expect(m).toEqual([{ campo: 'forrageira_principal_id', antes: 'Marandu', depois: 'Mombaça' }, { campo: 'manejo', antes: 'rotacionado', depois: 'continuo' }]);
  });
});
