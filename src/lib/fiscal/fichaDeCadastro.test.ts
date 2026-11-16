/**
 * PROD-FICHA-CADASTRO-01 — a ficha de cadastro (dado SINTÉTICO, pior caso: nomes longos, 3 pessoas numa fazenda, arrendatário, 5 contas).
 *   F1 só vem escrito o cadastrado: nome, CPF inteiro DELE, nascimento, IE da fazenda, participações; o resto em branco
 *   F2 o CPF de OUTRA pessoa sai mascarado; as linhas em branco existem (pelo menos o mínimo do mock)
 *   F3 a situação da terra vem marcada pela condição cadastrada; o contrato só para arrendatário/parceiro/comodatário
 *   F4 NADA corta no A4: zero células fora da largura, e cada produtor ocupa exatamente 2 folhas (nada empurrado para uma 3ª)
 *   F5 "todos os pendentes" = produtor ativo com pendência do banco
 */
import { describe, it, expect } from 'vitest';
import { titularDaLinha } from './produtores';
import { fichaDoProdutor, pdfDasFichas, pendentesDoCliente } from './fichaDeCadastro';

const LONGO = 'Produtora Sintética de Nome Muito Comprido Exemplo da Silva Junior';
const FAZ_LONGA = 'Fazenda Sintética de Nome Bem Comprido Retiro';
const PROD = titularDaLinha({
  id: 't1', nome: LONGO, documento: '52998224725', documento_formatado: '529.982.247-25', tipo: 'PF', papel: 'produtor', ativo: true,
  nascimento: '1970-03-09', email_fiscal: 'escritorio.contabil.exemplo.muito.longo@contabilidade-exemplo.com.br',
  endereco: 'Rodovia Sintética Exemplo, quilômetro 123, zona rural, depois da ponte', municipio: 'São Sintético do Oeste', uf: 'MS', cep: '79000000',
  ies: [{ uf: 'MS', ie: '281234567', fazenda_id: 'f1' }],
  fazendas: [
    { fazenda_id: 'f1', fazenda: FAZ_LONGA, participacao: 50, condicao: 'condomino', registra: 'so_a_parte', desde: '2020-01-01', ate: null },
    { fazenda_id: 'f2', fazenda: 'Faz. Exemplo Dois', participacao: 100, condicao: 'arrendatario', registra: 'total', desde: '2020-01-01', ate: null },
  ],
  contas: [1, 2, 3, 4, 5].map(i => ({ conta_id: `c${i}`, conta: `Banco Sintético Cooperativo de Crédito ${i}` })),
  grupo: [], acordos: 0, pendencias: ['Sem regime do IR'],
});
const OUTRA = titularDaLinha({
  id: 't2', nome: 'Outra Pessoa Sintética com Sobrenome Comprido Também', documento: '12345678909', documento_formatado: '123.456.789-09',
  tipo: 'PF', papel: 'terceiro', ativo: true, ies: [], grupo: [], contas: [], acordos: 0, pendencias: [],
  fazendas: [{ fazenda_id: 'f1', fazenda: FAZ_LONGA, participacao: 30, condicao: 'condomino', registra: 'total', desde: '2020-01-01', ate: null }],
});
const EMPRESA = titularDaLinha({
  id: 't3', nome: 'Agropecuária Sintética Exemplo Limitada', documento: '11222333000181', documento_formatado: '11.222.333/0001-81',
  tipo: 'PJ', papel: 'produtor', ativo: true, ies: [], grupo: [], contas: [], acordos: 0, pendencias: [],
  fazendas: [{ fazenda_id: 'f1', fazenda: FAZ_LONGA, participacao: 20, condicao: 'condomino', registra: 'total', desde: '2020-01-01', ate: null }],
});
const TODOS = [PROD, OUTRA, EMPRESA];

describe('PROD-FICHA-CADASTRO-01', () => {
  const f = fichaDoProdutor(PROD, TODOS, 'Cliente Sintético', '2026-11-14');

  it('F1 só o cadastrado vem escrito', () => {
    expect(f.quemE).toMatchObject({ nome: LONGO, documento: '529.982.247-25', nascimento: '09/03/1970' });
    expect(f.emitidaEm).toBe('14/11/2026'); expect(f.devolverAte).toBe('28/11/2026');
    expect(f.fazendas.linhas[0].slice(0, 4)).toEqual([FAZ_LONGA, '281234567', '', '']);
    expect(f.fazendas.linhas[1].slice(0, 2)).toEqual(['Faz. Exemplo Dois', '']);
    expect(f.endereco).toMatchObject({ uf: 'MS', cep: '79000-000' });
  });

  it('F2 o CPF de outra pessoa mascarado; linhas em branco', () => {
    const daF1 = f.partes.linhas.filter(l => l[0] === FAZ_LONGA);
    expect(daF1.map(l => [l[1], l[2], l[3]])).toEqual([
      [LONGO, '529.982.247-25', '50%'], [OUTRA.nome, '***.456.789-**', '30%'], [EMPRESA.nome, '11.222.333/0001-81', '20%']]);
    const brancas = (ls: ReadonlyArray<ReadonlyArray<unknown>>) => ls.filter(l => l[0] === '').length;
    expect(brancas(f.partes.linhas)).toBeGreaterThanOrEqual(6);
    expect(brancas(f.fazendas.linhas)).toBeGreaterThanOrEqual(2);
    expect(brancas(f.contratos.linhas)).toBeGreaterThanOrEqual(5);
    expect(brancas(f.contas.linhas)).toBeGreaterThanOrEqual(2);
  });

  it('F3 situação marcada pela condição; contrato só do arrendado', () => {
    expect(f.fazendas.linhas[0][4]).toMatchObject({ marcada: 0 });
    expect(f.fazendas.linhas[1][4]).toMatchObject({ marcada: 1 });
    expect(f.contratos.linhas.filter(l => l[0] !== '').map(l => l[0])).toEqual(['Faz. Exemplo Dois']);
  });

  it('F4 nada corta e são 2 folhas por produtor', () => {
    const um = pdfDasFichas([f]);
    expect(um.naoCouberam).toEqual([]);
    expect(um.folhas).toBe(2);
    const dois = pdfDasFichas([f, fichaDoProdutor(EMPRESA, TODOS, 'Cliente Sintético', '2026-11-14')]);
    expect(dois.naoCouberam).toEqual([]);
    expect(dois.folhas).toBe(4);
  });

  it('F5 pendentes = produtor ativo com pendência', () => {
    expect(pendentesDoCliente(TODOS).map(t => t.id)).toEqual(['t1']);
  });
});
