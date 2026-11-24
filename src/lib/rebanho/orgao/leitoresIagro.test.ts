/**
 * REBANHO-ORGAO-01 (F2) — os leitores do Comprovante de Saldo e do Extrato do e-Saniagro. Linhas INVENTADAS no leiaute que o
 * `montarLinhas` monta dos PDFs da IAGRO (nomes, fichas e números fictícios; dado de cliente nunca entra aqui).
 */
import { describe, it, expect } from 'vitest';
import { lerComprovanteIagro, bovinosDoComprovante } from './lerComprovanteIagro';
import { lerExtratoIagro } from './lerExtratoIagro';

const CABECALHO = [
  'GOVERNO DO ESTADO DE MATO GROSSO DO SUL', 'AGÊNCIA ESTADUAL DE DEFESA SANITÁRIA ANIMAL E VEGETAL - IAGRO', 'Comprovante de Saldo',
  'Produtor: | PRODUTOR FICTICIO | Situação: | ATIVO', 'Propriedade: | FAZENDA EXEMPLO | PGA: | 500000000000001',
  'Inscrição: | 111111111 | Vacina Aftosa:', 'Município: | CIDADE EXEMPLO | Vacina Aftosa:', 'Região/ZF: | PLANALTO | Vacina Brucelose: | 06/06/2026',
  'Espécie: | TODAS - COM SALDO', 'Fêmeas 0012 sem vacinação contra brucelose: | 0',
  'Espécie | Sexo | Faixa | Saldo Disponivel | Saldo a Confirmar | Saldo Total',
];
const BOVINO = ['0 A 12 MESES | 10 | 5 | 15', '13 A 24 MESES | 20 | 0 | 20', 'FÊMEA', '25 A 36 MESES | 30 | 0 | 30', 'ACIMA DE 36 MESES | 40 | 0 | 40',
  'BOVINO | 0 A 12 MESES | 11 | 0 | 11', '13 A 24 MESES | 2 | 0 | 2', 'MACHO', '25 A 36 MESES | 3 | 0 | 3', 'ACIMA DE 36 MESES | 4 | 0 | 4', 'Total: | 125'];
const OVINO = ['0 A 12 MESES | 6 | 0 | 6', 'FÊMEA', 'ACIMA DE 12 MESES | 7 | 0 | 7', 'OVINO | 0 A 12 MESES | 1 | 0 | 1', 'MACHO', 'ACIMA DE 12 MESES | 0 | 0 | 0', 'Total: | 14'];
const RODAPE = ['Saldo constante em | 23/11/2026 11:37:31', 'Total Geral: 139', 'Data e Hora de Emissão: | 23/11/2026 11:37 | Páginas: | 1 de 1'];

describe('lerComprovanteIagro', () => {
  it('lê o cabeçalho, as espécies e o saldo por sexo × faixa (com o "a confirmar"), e a prova fecha', () => {
    const r = lerComprovanteIagro([...CABECALHO, ...BOVINO, ...OVINO, ...RODAPE]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.comprovante.saldoEm).toBe('2026-11-23T11:37:31');
    expect(r.comprovante.vacinaBrucelose).toBe('2026-06-06');
    expect(r.comprovante.inscricao).toBe('111111111');
    expect(r.comprovante.femeas012SemBrucelose).toBe(0);
    expect(r.comprovante.especies.map((e) => [e.especie, e.faixas, e.total])).toEqual([['BOVINO', 4, 125], ['OVINO', 2, 14]]);
    expect(r.comprovante.especies[0].porSexo.F[0]).toEqual({ disponivel: 10, aConfirmar: 5, total: 15 });
    expect(bovinosDoComprovante(r.comprovante)).toEqual({ F: [15, 20, 30, 40], M: [11, 2, 3, 4] });
  });
  it('o cabeçalho antigo ("Fêmeas 0 a 12 Sem Brucelose" na linha da espécie) também se lê', () => {
    const antigo = CABECALHO.map((l) => (l.startsWith('Espécie: |') ? 'Espécie: | TODAS - COM SALDO | Fêmeas 0 a 12 Sem Brucelose: | 3' : l))
      .filter((l) => !l.startsWith('Fêmeas 0012'));
    const r = lerComprovanteIagro([...antigo, ...BOVINO, ...RODAPE.map((l) => (l.startsWith('Total Geral') ? 'Total Geral: 125' : l))]);
    expect(r.ok && r.comprovante.femeas012SemBrucelose).toBe(3);
  });
  it('a soma das linhas ≠ o "Total:" impresso = não fecha (nada se usa)', () => {
    const r = lerComprovanteIagro([...CABECALHO, ...BOVINO.map((l) => (l === 'Total: | 125' ? 'Total: | 126' : l)), ...RODAPE.slice(0, 1)]);
    expect(r).toMatchObject({ ok: false, motivo: 'nao_fecha' });
  });
  it('disponível + a confirmar ≠ total numa linha = não fecha', () => {
    const r = lerComprovanteIagro([...CABECALHO, ...BOVINO.map((l) => (l.startsWith('0 A 12 MESES | 10') ? '0 A 12 MESES | 10 | 4 | 15' : l)), ...RODAPE.slice(0, 1)]);
    expect(r).toMatchObject({ ok: false, motivo: 'nao_fecha' });
  });
  it('outro documento = "não reconheci" (nunca chuta)', () => {
    expect(lerComprovanteIagro(['DANFE', 'Chave de acesso'])).toMatchObject({ ok: false, motivo: 'nao_sei' });
  });
  it('sem bovino no comprovante: o saldo de bovinos é null ("—", nunca zero)', () => {
    const r = lerComprovanteIagro([...CABECALHO, ...OVINO, ...RODAPE.map((l) => (l.startsWith('Total Geral') ? 'Total Geral: 14' : l))]);
    expect(r.ok && bovinosDoComprovante(r.comprovante)).toBeNull();
  });
});

const EXT = [
  'E-Saniagro - Extrato do Produtor (A partir de 20/11/2016)',
  'Ficha Sanitária: | 111111111 - PRODUTOR FICTICIO - FAZENDA EXEMPLO | Região/ZF: | PLANALTO | Situação: | ATIVO',
  'Produtor: | PRODUTOR FICTICIO | Área | 100,00 Hectares | Período: | 04/05/2026 | até | 23/11/2026',
  'Município: | CIDADE EXEMPLO | Espécie: | BOVINO | PGA: | 500000000000001',
  '0012 | 1324 | 2536 | 3700', 'Data/Hora | Documento | Destino/Procedência | Município/UF | Operação | M | F | M | F | M | F | M | F | Geral',
  'SALDO ANTERIOR | 10 | 20 | 5 | 6 | 1 | 30 | 2 | 40 | 114', '0/', '--- | ---', 'Saldo: | 10 | 20 | 5 | 6 | 1 | 30 | 2 | 40 | 114',
  /* a declaração: o nome da operação sozinho e os números na linha seguinte, junto com o documento */
  'DB-SAIDA ERA', '90000001/U | -4 | -5 | 0 | 0 | 0 | 0 | 0 | 0 | -9', '06/05/2026 11:07:46 | -USUARIO FICTICIO | IAGRO - ---',
  'CR-ENTRADA ERA | 0 | 0 | 4 | 5 | 0 | 0 | 0 | 0 | 9', 'DB-MORTE | 0 | 0 | 0 | 0 | 0 | 0 | 0 | -1 | -1', 'CR-NASCIMENTO | 3 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 5',
  'Saldo: | 9 | 17 | 9 | 11 | 1 | 30 | 2 | 39 | 118',
  'DB-eGTA | 0 | 0 | -9 | 0 | 0 | 0 | 0 | 0 | -9', '700001/P | 222222222 - COMPRADOR FICTICIO -', '13/05/2026 13:30:43 | CIDADE B/MS',
  'COMPRADOR FICTICIO | Saldo: | 9 | 17 | 0 | 11 | 1 | 30 | 2 | 39 | 109',
  'DB-eGTA | 0 | 0 | 0 | 0 | 0 | -10 | 0 | 0 | -10', '700002/P | 333333333 - OUTRO -', '20/05/2026 10:00:00 | CIDADE C/MS',
  'Saldo: | 9 | 17 | 0 | 11 | 1 | 20 | 2 | 39 | 99',
  'ESTORNO - DB-eGTA | 0 | 0 | 0 | 0 | 0 | 10 | 0 | 0 | 10', '700002/P | 333333333 - OUTRO -', '20/05/2026 10:05:00 | CIDADE C/MS',
  'Saldo: | 9 | 17 | 0 | 11 | 1 | 30 | 2 | 39 | 109',
  /* a brucelose é informação: não mexe no saldo */
  'BRUCELOSE 05/06/2026 | 0 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 17', '90000002/U', '10/06/2026 08:56:48 | 111111111-USUARIO | PRODUTOR',
  'Saldo: | 9 | 17 | 0 | 11 | 1 | 30 | 2 | 39 | 109',
  'Data e Hora de Emissão: | 23/11/2026 08:19 | 1 de 1',
];
describe('lerExtratoIagro', () => {
  it('lê os blocos: operação, documento, data, procedência; o nome sozinho pega os números da linha seguinte; a prova fecha cada bloco', () => {
    const r = lerExtratoIagro(EXT);
    if (r.ok === false) throw new Error(r.frase);
    const x = r.extrato;
    expect([x.ficha, x.especie, x.periodoDe, x.periodoAte]).toEqual(['111111111', 'BOVINO', '2026-05-04', '2026-11-23']);
    expect(x.operacoes.map((o) => o.tipo)).toEqual(['saldo_anterior', 'era_saida', 'era_entrada', 'morte', 'nascimento', 'egta_saida', 'egta_saida', 'estorno_saida', 'brucelose']);
    const era = x.operacoes[1];
    expect([era.documento, era.quando, era.mov.M[0], era.mov.F[0]]).toEqual(['90000001/U', '2026-05-06T11:07:46', -4, -5]);
    const gta = x.operacoes[5];
    expect([gta.documento, gta.quando, gta.outraFicha, gta.municipio, gta.geral]).toEqual(['700001/P', '2026-05-13T13:30:43', '222222222', 'CIDADE B/MS', -9]);
    expect(x.operacoes[8]).toMatchObject({ tipo: 'brucelose', dataDaVacina: '2026-06-05', geral: 17 });
    expect(x.saldoFinal).toEqual({ M: [9, 0, 1, 2], F: [17, 11, 30, 39] });
  });
  it('um bloco que não soma com o "Saldo:" impresso = não fecha (nada se usa)', () => {
    const r = lerExtratoIagro(EXT.map((l) => (l.startsWith('DB-MORTE') ? 'DB-MORTE | 0 | 0 | 0 | 0 | 0 | 0 | 0 | -2 | -2' : l)));
    expect(r).toMatchObject({ ok: false, motivo: 'nao_fecha' });
  });
  it('se a brucelose somasse, o bloco não fecharia (ela é só informação)', () => {
    const r = lerExtratoIagro(EXT.map((l) => (l.startsWith('BRUCELOSE') ? 'DB-CONSUMO | 0 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 17' : l)));
    expect(r).toMatchObject({ ok: false, motivo: 'nao_fecha' });
  });
  it('outro documento = "não reconheci"', () => {
    expect(lerExtratoIagro(['Comprovante de Saldo', 'IAGRO'])).toMatchObject({ ok: false, motivo: 'nao_sei' });
  });
});
