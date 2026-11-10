/** LOTES-03 F1 — a regra do assistente "+ Novo lote" (passos, código, contagem, busca, validação, o que vai ao banco). */
import { describe, it, expect } from 'vitest';
import {
  PASSOS, aceitaCarimbo, camposParaSalvar, codigoMontando, filtrarCadastros, fraseCurtaDaTroca, fraseDaTroca, lotesDaCombinacao, lotesQueUsam, mesmaCombinacao, perfilInicial,
  podeAvancar, safraDe, siglaDigitada, ultimoPassoAlcancavel, validarCadastro, validarCarimbo, validarNumero, validarPerfil, type Escolha,
} from './assistente';
import { FRASE_CARIMBO_INVALIDO, nomeDoLote } from './tipos';
import type { CadastroDoLote, LoteDaLista } from './tipos';

const cad = (id: string, tipo: CadastroDoLote['tipo'], sigla: string | null, nome: string, categoriasRebanho: string[] = []): CadastroDoLote =>
  ({ id, tipo, sigla, nome, categoriasRebanho, ordem: 0, ativo: true });
const CAD = [cad('df', 'categoria', 'DF', 'Desmama fêmea', ['r-desf']), cad('pp', 'categoria', 'PP', 'Prenha parida', ['r-vacas', 'r-mamf']),
  cad('ne', 'raca', 'NE', 'Nelore'), cad('ch', 'raca', 'CH', 'Charolês'), cad('rc', 'atividade', 'RC', 'Recria'), cad('cr', 'atividade', 'CR', 'Cria'),
  cad('conf', 'sistema', null, 'Confinamento')];
const lote = (id: string, categoriaId: string, racaId: string, atividadeId: string, numero: number, situacao: LoteDaLista['situacao'] = 'ativo'): LoteDaLista => ({
  id, codigo: `X-${numero}`, codigosAntigos: [], nomeCampeiro: null, situacao, formadoEm: '2026-09-30', encerradoEm: null, categoriaId, racaId, atividadeId,
  numero, sistemaId: null, programaId: null, destinoId: null, safra: null, carimbo: null, idadeMediaMeses: null, metaPesoKg: null, metaGmdKg: null,
  metaData: null, versao: 1, anoMesDado: null, cabecas: null, pesoMedioKg: null, gmdKg: null, pastos: [], lancamentos: 0, conferir: null,
});
const E = (c: string | null, r: string | null, a: string | null): Escolha => ({ categoriaId: c, racaId: r, atividadeId: a });

describe('passos', () => {
  it('LOTES-04: os passos na ordem do código (atividade, categoria, raça); com os três, o número e o perfil', () => {
    expect(PASSOS.slice(0, 3).map(p => p.chave)).toEqual(['atividade', 'categoria', 'raca']);
    expect(ultimoPassoAlcancavel(E(null, null, null))).toBe(0);
    expect(ultimoPassoAlcancavel(E('df', null, null))).toBe(0);
    expect(ultimoPassoAlcancavel(E(null, null, 'rc'))).toBe(1);
    expect(ultimoPassoAlcancavel(E('df', null, 'rc'))).toBe(2);
    expect(ultimoPassoAlcancavel(E('df', 'ne', 'rc'))).toBe(4);
    expect(podeAvancar(E(null, null, 'rc'), 1)).toBe(false);
    expect(podeAvancar(E('df', null, 'rc'), 1)).toBe(true);
    expect(podeAvancar(E('df', 'ne', 'rc'), 4)).toBe(true);
  });
});

describe('código montando', () => {
  it('LOTES-04: ATIV-CAT-RAÇA-NN com "__" no que falta; o número só com os três', () => {
    expect(codigoMontando(CAD, E(null, null, 'rc'), 5)).toBe('RC-__-__-__');
    expect(codigoMontando(CAD, E('df', null, 'rc'), 5)).toBe('RC-DF-__-__');
    expect(codigoMontando(CAD, E('df', 'ne', 'rc'), 5)).toBe('RC-DF-NE-05');
    expect(codigoMontando(CAD, E('df', 'ne', 'rc'), null)).toBe('RC-DF-NE-__');
  });
  it('LOTES-04: o nº digitado — 1 a 99 e livre na combinação; vazio = automático; o próprio lote não conta', () => {
    const L = [lote('a', 'df', 'ne', 'rc', 1), lote('b', 'df', 'ne', 'rc', 5)];
    expect(validarNumero('', L, null)).toBeNull();
    expect(validarNumero('7', L, null)).toBeNull();
    expect(validarNumero('0', L, null)).toBe('O nº vai de 1 a 99.');
    expect(validarNumero('5', L, null)).toBe('O nº 05 já é do lote X-5. Escolha outro.');
    expect(validarNumero('5', L, 'b')).toBeNull();
  });
  it('LOTES-05: o carimbo do mês — 7.1, 10.2, a ressinc. 7R e 7R.2; vazio vale; 7X, 13.1, 7.0 e 7R0 não', () => {
    expect(['7.1', '10.2', '12.15', '7R', '7R.2', '', ' 7.1 '].map(validarCarimbo)).toEqual([null, null, null, null, null, null, null]);
    expect(['7X', '13.1', '7.0', '7R0', '0.1', '7', 'R'].map(validarCarimbo)).toEqual(Array(7).fill(FRASE_CARIMBO_INVALIDO));
  });
  it('LOTES-05: na tela, a cria com carimbo é o carimbo; sem carimbo (recria, engorda, vacas), o código', () => {
    expect(nomeDoLote({ codigo: 'CRI-VAC-NEL-04', carimbo: '7.1' })).toBe('7.1');
    expect(nomeDoLote({ codigo: 'CRI-VAC-NEL-04', carimbo: '7R' })).toBe('7R');
    expect(nomeDoLote({ codigo: 'REC-DF-NEL-01', carimbo: null })).toBe('REC-DF-NEL-01');
    expect(nomeDoLote({ codigo: 'REC-DF-NEL-01', carimbo: '  ' })).toBe('REC-DF-NEL-01');
  });
  it('LOTES-04: o nº vai ao banco só quando digitado (criar) ou diferente do lote (editar)', () => {
    const p = perfilInicial('2026-11-06');
    expect(camposParaSalvar(E('df', 'ne', 'rc'), p).numero).toBeUndefined();
    expect(camposParaSalvar(E('df', 'ne', 'rc'), p, null, 7).numero).toBe(7);
    const l = lote('l', 'df', 'ne', 'rc', 5);
    expect(camposParaSalvar(E('df', 'ne', 'rc'), perfilInicial('2026-11-06', l), l, 5)).toEqual({});
    expect(camposParaSalvar(E('df', 'ne', 'rc'), perfilInicial('2026-11-06', l), l, 8)).toEqual({ numero: 8 });
    expect(camposParaSalvar(E('df', 'ch', 'rc'), perfilInicial('2026-11-06', l), l, 5)).toEqual({ raca_id: 'ch', numero: 5 });
  });
  it('carimbo: a atividade de cria aceita, CRI (LOTES-04) ou CR (antes)', () => {
    const C = [cad('cri', 'atividade', 'CRI', 'Cria'), cad('rec', 'atividade', 'REC', 'Recria'), cad('df', 'categoria', 'DF', 'Desmama', ['r-desf'])];
    expect(aceitaCarimbo(C, E('df', 'ne', 'cri'), [])).toBe(true);
    expect(aceitaCarimbo(C, E('df', 'ne', 'rec'), [])).toBe(false);
  });
});

describe('cartões', () => {
  it('a busca ignora acento e maiúscula, em sigla e nome; só os ativos do tipo', () => {
    expect(filtrarCadastros(CAD, 'raca', 'charoles').map(c => c.id)).toEqual(['ch']);
    expect(filtrarCadastros(CAD, 'categoria', 'FEMEA').map(c => c.id)).toEqual(['df']);
    expect(filtrarCadastros(CAD, 'raca', '').map(c => c.id)).toEqual(['ne', 'ch']);
    expect(filtrarCadastros([...CAD, { ...cad('x', 'raca', 'XX', 'Velha'), ativo: false }], 'raca', 'velha')).toEqual([]);
  });
  it('a contagem do cartão: lotes ATIVOS que usam; a da trava da sigla conta encerrados, nunca cancelados', () => {
    const L = [lote('1', 'df', 'ne', 'rc', 1), lote('2', 'df', 'ne', 'rc', 2, 'encerrado'), lote('3', 'df', 'ch', 'rc', 1, 'cancelado')];
    expect(lotesQueUsam(L, CAD[0])).toBe(1);
    expect(lotesQueUsam(L, CAD[0], false)).toBe(2);
    expect(lotesQueUsam(L, CAD[3], false)).toBe(0);
  });
  it('os lotes da combinação (passo 4), em ordem de número, sem os cancelados', () => {
    const L = [lote('b', 'df', 'ne', 'rc', 3), lote('a', 'df', 'ne', 'rc', 1), lote('c', 'df', 'ne', 'cr', 1), lote('d', 'df', 'ne', 'rc', 2, 'cancelado')];
    expect(lotesDaCombinacao(L, E('df', 'ne', 'rc')).map(l => l.id)).toEqual(['a', 'b']);
    expect(mesmaCombinacao(L[1], E('df', 'ne', 'rc'))).toBe(true);
    expect(mesmaCombinacao(L[1], E('df', 'ch', 'rc'))).toBe(false);
  });
});

describe('cadastrar nova / editar', () => {
  it('as mesmas frases da RPC: sigla, repetida, nome, categorias do rebanho', () => {
    const base = { existentes: CAD, idEditando: null };
    expect(validarCadastro({ ...base, tipo: 'raca', sigla: 'N', nome: 'X', categorias: [] })?.mensagem).toBe('A sigla precisa de 2 ou 3 letras ou números.');
    expect(validarCadastro({ ...base, tipo: 'raca', sigla: 'ne', nome: 'Outra', categorias: [] })?.mensagem).toBe('A sigla NE já é “Nelore”. Escolha outra ou use a existente.');
    expect(validarCadastro({ ...base, tipo: 'raca', sigla: 'AN', nome: ' ', categorias: [] })).toEqual({ campo: 'nome', mensagem: 'Falta o nome.' });
    expect(validarCadastro({ ...base, tipo: 'categoria', sigla: 'TO', nome: 'Touro', categorias: [] })?.campo).toBe('categorias');
    expect(validarCadastro({ ...base, tipo: 'sistema', sigla: '', nome: 'confinamento', categorias: [] })?.mensagem).toBe('“Confinamento” já está no cadastro.');
    expect(validarCadastro({ ...base, tipo: 'sistema', sigla: '', nome: 'Pasto', categorias: [] })).toBeNull();
    expect(validarCadastro({ existentes: CAD, idEditando: 'ne', tipo: 'raca', sigla: 'NE', nome: 'Nelore PO', categorias: [] })).toBeNull();
  });
  it('a sigla se digita maiúscula, só letra e número, até 3', () => {
    expect(siglaDigitada('d-f9z')).toBe('DF9');
  });
});

describe('perfil', () => {
  it('safra do dia (jul–jun) e carimbo só na cria', () => {
    expect(safraDe('2026-11-06')).toBe('26/27');
    expect(safraDe('2027-03-15')).toBe('26/27');
    expect(safraDe('2026-06-30')).toBe('25/26');
    expect(aceitaCarimbo(CAD, E('df', 'ne', 'rc'), ['r-mamf'])).toBe(false);
    expect(aceitaCarimbo(CAD, E('pp', 'ne', 'rc'), ['r-mamf'])).toBe(true);
    expect(aceitaCarimbo(CAD, E('df', 'ne', 'cr'), [])).toBe(true);
  });
  it('validação no campo: formado em depois de hoje, safra, carimbo, meta', () => {
    const p = perfilInicial('2026-11-06');
    expect(validarPerfil(p, '2026-11-06')).toBeNull();
    expect(validarPerfil({ ...p, formadoEm: '2026-11-07' }, '2026-11-06')?.campo).toBe('formadoEm');
    expect(validarPerfil({ ...p, safra: '2026' }, '2026-11-06')?.campo).toBe('safra');
    expect(validarPerfil({ ...p, carimbo: '13.1' }, '2026-11-06')?.campo).toBe('carimbo');
    expect(validarPerfil({ ...p, metaGmdKg: 0 }, '2026-11-06')?.campo).toBe('metaGmdKg');
  });
  it('criar manda tudo; editar manda só o que mudou (o banco mantém o resto)', () => {
    const p = { ...perfilInicial('2026-11-06'), nomeCampeiro: ' L05 - DF Nel. SP ', sistemaId: 'conf' };
    const c = camposParaSalvar(E('df', 'ne', 'rc'), p);
    expect(c).toMatchObject({ categoria_id: 'df', raca_id: 'ne', atividade_id: 'rc', nome_campeiro: 'L05 - DF Nel. SP', sistema_id: 'conf', safra: '26/27', formado_em: '2026-11-06' });
    const l = { ...lote('1', 'df', 'ne', 'rc', 5), nomeCampeiro: 'L05', safra: '26/27' };
    expect(camposParaSalvar(E('df', 'ne', 'rc'), perfilInicial('2026-11-06', l), l)).toEqual({});
    expect(camposParaSalvar(E('df', 'ne', 'cr'), { ...perfilInicial('2026-11-06', l), sistemaId: 'conf' }, l)).toEqual({ atividade_id: 'cr', sistema_id: 'conf' });
  });
});

describe('LOTE-SIGLA-EDITAR-01 — a prévia da troca de sigla', () => {
  it('uma linha: quantos lotes e cada código antes → depois; nenhum = vazio', () => {
    expect(fraseDaTroca([{ id: 'a', antes: 'DES-ANG-CRI-01', depois: 'DF-ANG-CRI-01' }, { id: 'b', antes: 'DES-CZ-REC-01', depois: 'DF-CZ-REC-01' }]))
      .toBe('2 lotes mudam: DES-ANG-CRI-01 → DF-ANG-CRI-01 · DES-CZ-REC-01 → DF-CZ-REC-01');
    expect(fraseDaTroca([{ id: 'a', antes: 'DES-ANG-CRI-01', depois: 'DF-ANG-CRI-01' }])).toBe('1 lote muda: DES-ANG-CRI-01 → DF-ANG-CRI-01');
    expect(fraseDaTroca([])).toBe('');
    /* na linha dos botões, sem cortar: o 1º e "+N" */
    expect(fraseCurtaDaTroca([{ id: 'a', antes: 'REC-DES-ANG-01', depois: 'REC-DF-ANG-01' }, { id: 'b', antes: 'REC-DES-CZ-01', depois: 'REC-DF-CZ-01' }]))
      .toBe('2 lotes mudam: REC-DES-ANG-01 → REC-DF-ANG-01 · +1');
    expect(fraseCurtaDaTroca([{ id: 'a', antes: 'X', depois: 'Y' }])).toBe('1 lote muda: X → Y');
    expect(fraseCurtaDaTroca([])).toBe('');
  });
});
