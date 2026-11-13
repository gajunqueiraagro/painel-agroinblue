/** LOTES-03 F1 + LOTE-ETAPAS-01 — a regra do assistente "+ Novo lote" (etapas, código, contagem, busca, validação, o que vai ao banco). */
import { describe, it, expect } from 'vitest';
import {
  PASSOS, aceitaCarimbo, camposParaSalvar, categoriasDaAtividade, codigoDoAssistente, faltaNoPasso, faseDaAtividade, fichaDoAssistente, filtrarCadastros,
  fraseCurtaDaTroca, fraseDaTroca, legendaDoCodigo, lotesQueUsam, perfilInicial, resumoDoRebanho, safraDe, siglaDigitada, ultimoPassoAlcancavel,
  validarCadastro, validarCarimbo, validarPerfil, listaDeCarimbos, type Escolha,
} from './assistente';
import { FRASE_CARIMBO_INVALIDO, codigoPorEtapas, nomeDoLote } from './tipos';
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

describe('etapas (LOTE-ETAPAS-01)', () => {
  it('Atividade → Categoria e sexo → Situação → Raça e genética → Nome; obrigatório só atividade, categoria e raça', () => {
    expect(PASSOS.map(p => p.chave)).toEqual(['atividade', 'categoria', 'situacao', 'raca', 'nome']);
    expect(ultimoPassoAlcancavel(E(null, null, null))).toBe(0);
    expect(ultimoPassoAlcancavel(E('df', null, null))).toBe(0);
    expect(ultimoPassoAlcancavel(E(null, null, 'rc'))).toBe(1);
    expect(ultimoPassoAlcancavel(E('df', null, 'rc'))).toBe(3);
    expect(ultimoPassoAlcancavel(E('df', 'ne', 'rc'))).toBe(4);
    const p = perfilInicial('2026-11-12');
    expect(faltaNoPasso(E(null, null, null), p, 0, false)).toBe('Escolha a atividade');
    expect(faltaNoPasso(E(null, null, 'rc'), p, 1, false)).toBe('Escolha a categoria');
    expect(faltaNoPasso(E('df', null, 'rc'), p, 2, false)).toBeNull();          // a situação nunca trava
    expect(faltaNoPasso(E('df', null, 'rc'), p, 3, false)).toBe('Escolha a raça');
    expect(faltaNoPasso(E('df', 'ne', 'rc'), p, 4, false)).toBeNull();          // apelido, anotação: "completar", nunca trava
  });
  it('parida (PA/PP/VZ) pede o carimbo; mojada, solteira e descarte nunca; carimbo errado trava', () => {
    const p = perfilInicial('2026-11-12');
    for (const s of ['PA', 'PP', 'VZ'] as const) expect(faltaNoPasso(E('pp', 'ne', 'cr'), { ...p, situacaoCria: s }, 3, true)).toBe('Falta o carimbo dos mamotes');
    for (const s of ['PR', 'SL', 'DS', null] as const) expect(faltaNoPasso(E('pp', 'ne', 'cr'), { ...p, situacaoCria: s }, 3, true)).toBeNull();
    expect(faltaNoPasso(E('pp', 'ne', 'cr'), { ...p, situacaoCria: 'PA', carimbo: '7.1' }, 4, true)).toBeNull();
    expect(faltaNoPasso(E('pp', 'ne', 'cr'), { ...p, situacaoCria: 'PA', carimbo: '7X' }, 3, true)).toBe(FRASE_CARIMBO_INVALIDO);
    expect(validarPerfil({ ...p, situacaoCria: 'PP' }, '2026-11-12')).toEqual({ campo: 'carimbo', mensagem: 'Parida: informe o carimbo (mês.lote, ex.: 7.1).' });
    expect(validarPerfil({ ...p, situacaoCria: 'PR' }, '2026-11-12')).toBeNull();
  });
  it('D3: a categoria filtrada pela atividade pelas categorias do rebanho; sem fase = todas; a escolhida sempre fica', () => {
    const REB = [{ id: 'r-va', codigo: 'vacas' }, { id: 'r-mf', codigo: 'mamotes_f' }, { id: 'r-df', codigo: 'desmama_f' }, { id: 'r-bo', codigo: 'bois' }, { id: 'r-no', codigo: 'novilhas' }];
    const C = [cad('vc', 'categoria', 'VC', 'Vacas', ['r-va']), cad('pp', 'categoria', 'PP', 'Prenha parida', ['r-va', 'r-mf']),
      cad('df', 'categoria', 'DF', 'Desmama F', ['r-df']), cad('bo', 'categoria', 'BO', 'Boi', ['r-bo']), cad('nv', 'categoria', 'NV', 'Novilhas', ['r-no'])];
    expect(categoriasDaAtividade(C, 'cria', REB, null).map(c => c.id)).toEqual(['vc', 'pp', 'nv']);
    expect(categoriasDaAtividade(C, 'recria', REB, null).map(c => c.id)).toEqual(['df', 'nv']);
    expect(categoriasDaAtividade(C, 'engorda', REB, null).map(c => c.id)).toEqual(['vc', 'pp', 'bo', 'nv']);
    expect(categoriasDaAtividade(C, null, REB, null).map(c => c.id)).toEqual(['vc', 'pp', 'df', 'bo', 'nv']);
    expect(categoriasDaAtividade(C, 'recria', REB, 'bo').map(c => c.id)).toEqual(['df', 'bo', 'nv']);
    expect([faseDaAtividade('CRI'), faseDaAtividade('CR'), faseDaAtividade('REC'), faseDaAtividade('ENG'), faseDaAtividade('RP'), faseDaAtividade(null)])
      .toEqual(['cria', 'cria', 'recria', 'engorda', null, null]);
  });
  it('Chat 14:45: a linha do cartão da categoria em UMA linha — mamotes M+F = "mamotes", mais de 2 = "+N"', () => {
    const r = (codigo: string, nome: string) => ({ codigo, nome });
    expect(resumoDoRebanho([r('vacas', 'Vacas'), r('mamotes_m', 'Mamotes M'), r('mamotes_f', 'Mamotes F')])).toBe('vacas + mamotes');
    expect(resumoDoRebanho([r('mamotes_m', 'Mamotes M'), r('mamotes_f', 'Mamotes F'), r('novilhas', 'Novilhas')])).toBe('novilhas + mamotes');
    expect(resumoDoRebanho([r('desmama_m', 'Desmama M'), r('desmama_f', 'Desmama F')])).toBe('desmama');
    expect(resumoDoRebanho([r('bois', 'Bois'), r('touros', 'Touros'), r('vacas', 'Vacas'), r('mamotes_m', 'Mamotes M')])).toBe('bois + touros +2');
  });
});

describe('código (D1)', () => {
  const C = [cad('cri', 'atividade', 'CRI', 'Cria'), cad('vc', 'categoria', 'VC', 'Vacas', ['r-va']), cad('nel', 'raca', 'NEL', 'Nelore'), cad('ang', 'raca', 'ANG', 'Angus')];
  it('lote NOVO = ATIV-CAT-RAÇA[-carimbo], "__" no que falta; -02/-03 só quando repetir entre os vivos da fazenda', () => {
    expect(codigoDoAssistente(C, E(null, null, 'cri'), [], [])).toBe('CRI-__-__');
    expect(codigoDoAssistente(C, E('vc', 'nel', 'cri'), [], [])).toBe('CRI-VC-NEL');
    expect(codigoDoAssistente(C, E('vc', 'nel', 'cri'), ['7.1'], [])).toBe('CRI-VC-NEL-7.1');
    const vivos = [{ ...lote('a', 'vc', 'nel', 'cri', 1), codigo: 'CRI-VC-NEL-7.1' }, { ...lote('b', 'vc', 'nel', 'cri', 2), codigo: 'CRI-VC-NEL-7.1-02' }];
    expect(codigoDoAssistente(C, E('vc', 'nel', 'cri'), ['7.1'], vivos)).toBe('CRI-VC-NEL-7.1-03');
    expect(codigoDoAssistente(C, E('vc', 'nel', 'cri'), ['7.1'], [{ ...vivos[0], situacao: 'cancelado' }])).toBe('CRI-VC-NEL-7.1');
    expect(codigoPorEtapas('CRI', 'VC', 'NEL', null, vivos, 'a')).toBe('CRI-VC-NEL');
    expect(legendaDoCodigo(null)).toBe('atividade · categoria · raça · carimbo');
  });
  it('lote de ANTES (ATIV-CAT-RAÇA-NN): o mesmo código enquanto a identidade não muda; mudou = "-__" (o nº sai do banco)', () => {
    const l = { ...lote('l', 'vc', 'nel', 'cri', 5), codigo: 'CRI-VC-NEL-05' };
    expect(codigoDoAssistente(C, E('vc', 'nel', 'cri'), ['7.1'], [l], l)).toBe('CRI-VC-NEL-05');
    expect(codigoDoAssistente(C, E('vc', 'ang', 'cri'), [], [l], l)).toBe('CRI-VC-ANG-__');
    expect(legendaDoCodigo(l)).toBe('atividade · categoria · raça · nº');
    const novo = { ...l, codigo: 'CRI-VC-NEL-7.1', carimbo: '7.1', codigoRegra: 'etapas' as const };
    expect(codigoDoAssistente(C, E('vc', 'nel', 'cri'), ['7.1'], [novo], novo)).toBe('CRI-VC-NEL-7.1');
    expect(codigoDoAssistente(C, E('vc', 'nel', 'cri'), ['7.2'], [novo], novo)).toBe('CRI-VC-NEL-7.2');
  });
  it('LOTE-CARIMBOS-01: vários carimbos — o código leva a faixa de meses (1 = ele mesmo); o digitado válido entra na lista', () => {
    expect(codigoDoAssistente(C, E('vc', 'nel', 'cri'), ['7.1', '7.2', '8.1'], [])).toBe('CRI-VC-NEL-7/8');
    expect(codigoDoAssistente(C, E('vc', 'nel', 'cri'), ['7.1', '7R'], [])).toBe('CRI-VC-NEL-7/7R');
    expect(codigoDoAssistente(C, E('vc', 'nel', 'cri'), ['10.1', '9.2'], [])).toBe('CRI-VC-NEL-9/10');
    expect(listaDeCarimbos({ carimbo: ' 8.1 ', carimbos: ['7.1'] })).toEqual(['7.1', '8.1']);
    expect(listaDeCarimbos({ carimbo: '7.1', carimbos: ['7.1'] })).toEqual(['7.1']);
    expect(listaDeCarimbos({ carimbo: '13', carimbos: ['7.1'] })).toEqual(['7.1']);
    const p = { ...perfilInicial('2026-11-12'), situacaoCria: 'PA' as const };
    expect(faltaNoPasso(E('vc', 'nel', 'cri'), { ...p, carimbos: ['7.1', '8.1'] }, 3, true)).toBeNull();
    expect(faltaNoPasso(E('vc', 'nel', 'cri'), { ...p, carimbos: ['7.1'], carimbo: '13' }, 3, true)).toBe(FRASE_CARIMBO_INVALIDO);
    expect(camposParaSalvar(E('vc', 'nel', 'cri'), { ...p, carimbos: ['7.1', '8.1'] }, true).carimbos).toEqual(['7.1', '8.1']);
    const l = { ...lote('1', 'vc', 'nel', 'cri', 1), carimbo: '7.1', carimbos: ['7.1'], situacaoCria: 'PA' as const };
    expect(camposParaSalvar(E('vc', 'nel', 'cri'), perfilInicial('2026-11-12', l), true, l, true)).toEqual({});
    expect(camposParaSalvar(E('vc', 'nel', 'cri'), { ...perfilInicial('2026-11-12', l), carimbo: '8.1' }, true, l, true)).toEqual({ carimbos: ['7.1', '8.1'] });
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
  it('carimbo: a atividade de cria aceita, CRI (LOTES-04) ou CR (antes)', () => {
    const C2 = [cad('cri', 'atividade', 'CRI', 'Cria'), cad('rec', 'atividade', 'REC', 'Recria'), cad('df', 'categoria', 'DF', 'Desmama', ['r-desf'])];
    expect(aceitaCarimbo(C2, E('df', 'ne', 'cri'), [])).toBe(true);
    expect(aceitaCarimbo(C2, E('df', 'ne', 'rec'), [])).toBe(false);
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
  it('LOTE-CODIGO-CURTO-01: a atividade aceita 1 letra (C/R/E, as frases da 117550); categoria e raça seguem 2 a 3; C/R/E são as fases', () => {
    const base = { existentes: CAD, idEditando: null, categorias: [] };
    expect(validarCadastro({ ...base, tipo: 'atividade', sigla: 'C', nome: 'Cria nova' })).toBeNull();
    expect(validarCadastro({ ...base, tipo: 'atividade', sigla: '', nome: 'X' })?.mensagem).toBe('A sigla da atividade precisa de 1 a 3 letras ou números.');
    expect(validarCadastro({ ...base, tipo: 'raca', sigla: 'N', nome: 'X' })?.mensagem).toBe('A sigla precisa de 2 ou 3 letras ou números.');
    expect([faseDaAtividade('C'), faseDaAtividade('R'), faseDaAtividade('E')]).toEqual(['cria', 'recria', 'engorda']);
    expect(aceitaCarimbo([cad('c', 'atividade', 'C', 'Cria')], E('df', 'ne', 'c'), [])).toBe(true);
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
  it('validação no campo: formado em depois de hoje, carimbo, apelido, anotação (a mesma frase da RPC)', () => {
    const p = perfilInicial('2026-11-06');
    expect(validarPerfil(p, '2026-11-06')).toBeNull();
    expect(validarPerfil({ ...p, formadoEm: '2026-11-07' }, '2026-11-06')?.campo).toBe('formadoEm');
    expect(validarPerfil({ ...p, carimbo: '13.1' }, '2026-11-06')?.campo).toBe('carimbo');
    expect(validarPerfil({ ...p, nomeCampeiro: 'x'.repeat(41) }, '2026-11-06')?.campo).toBe('nomeCampeiro');
    expect(validarPerfil({ ...p, anotacao: 'x'.repeat(121) }, '2026-11-06')).toEqual({ campo: 'anotacao', mensagem: 'A anotação passa de 120 letras.' });
  });
  it('criar manda tudo (as chaves novas inclusive); editar manda só o que mudou (o banco mantém o resto); o nº nunca vai', () => {
    const p = { ...perfilInicial('2026-11-06'), nomeCampeiro: ' L05 - DF Nel. SP ', sistemaId: 'conf', anotacao: ' veio da 3M ' };
    const c = camposParaSalvar(E('df', 'ne', 'rc'), p, false);
    expect(c).toMatchObject({ categoria_id: 'df', raca_id: 'ne', atividade_id: 'rc', nome_campeiro: 'L05 - DF Nel. SP', sistema_id: 'conf', safra: '26/27',
      formado_em: '2026-11-06', anotacao: 'veio da 3M', situacao_cria: '', mamotes_sexo: '' });
    expect(c.numero).toBeUndefined();
    const l = { ...lote('1', 'df', 'ne', 'rc', 5), nomeCampeiro: 'L05', safra: '26/27' };
    expect(camposParaSalvar(E('df', 'ne', 'rc'), perfilInicial('2026-11-06', l), false, l)).toEqual({});
    expect(camposParaSalvar(E('df', 'ne', 'cr'), { ...perfilInicial('2026-11-06', l), sistemaId: 'conf' }, true, l, false)).toEqual({ atividade_id: 'cr', sistema_id: 'conf' });
  });
  it('a cria leva situação e ordem; a parida leva os mamotes; fora da parida os mamotes vão vazios (a mojada não tem bezerro ao pé)', () => {
    const p = { ...perfilInicial('2026-11-12'), situacaoCria: 'PA' as const, ordemParto: 'MUL' as const, carimbo: '7.1',
      mamotesSexo: 'MF' as const, mamotesCruzamento: 'f1_angus' as const, mamotesSemen: 'convencional' as const };
    expect(camposParaSalvar(E('pp', 'ne', 'cr'), p, true)).toMatchObject({ situacao_cria: 'PA', ordem_parto: 'MUL', carimbos: ['7.1'],
      mamotes_sexo: 'MF', mamotes_cruzamento: 'f1_angus', mamotes_semen: 'convencional' });
    expect(camposParaSalvar(E('pp', 'ne', 'cr'), { ...p, situacaoCria: 'PR' }, true)).toMatchObject({ situacao_cria: 'PR', mamotes_sexo: '', mamotes_cruzamento: '', mamotes_semen: '' });
    expect(camposParaSalvar(E('df', 'ne', 'rc'), p, false)).toMatchObject({ situacao_cria: '', ordem_parto: '', mamotes_sexo: '' });
    const l = { ...lote('1', 'pp', 'ne', 'cr', 1), carimbo: '7.1', situacaoCria: 'PA' as const, mamotesSexo: 'MF' as const };
    expect(camposParaSalvar(E('pp', 'ne', 'cr'), { ...perfilInicial('2026-11-12', l), situacaoCria: 'PP' }, true, l, true)).toEqual({ situacao_cria: 'PP' });
  });
  it('a ficha do passo Nome: uma linha por etapa; vazio = null ("completar")', () => {
    const C = [cad('cri', 'atividade', 'CRI', 'Cria'), cad('pp', 'categoria', 'PP', 'Prenha parida'), cad('ne', 'raca', 'NE', 'Nelore')];
    const p = { ...perfilInicial('2026-11-12'), situacaoCria: 'PA' as const, carimbo: '7.1', mamotesSexo: 'MF' as const };
    expect(fichaDoAssistente(C, E('pp', 'ne', 'cri'), p, true)).toEqual([
      { rotulo: 'Atividade', valor: 'CRI · Cria' }, { rotulo: 'Categoria e sexo', valor: 'PP · Prenha parida' },
      { rotulo: 'Situação', valor: 'Parida com bezerro' }, { rotulo: 'Programa e sistema', valor: null }, { rotulo: 'Raça', valor: 'NE · Nelore' },
      { rotulo: 'Mamotes ao pé', valor: 'carimbo 7.1 · Misto' },
    ]);
    expect(fichaDoAssistente(C, E('pp', null, 'cri'), perfilInicial('2026-11-12'), false).map(l => l.valor)).toEqual(['CRI · Cria', 'PP · Prenha parida', null, null]);
    /* Chat 12/11 09:20 — o programa também na cria */
    const C2 = [...C, cad('iatf', 'programa', null, 'IATF superprecoce'), cad('pas', 'sistema', null, 'Pasto')];
    expect(fichaDoAssistente(C2, E('pp', 'ne', 'cri'), { ...p, programaId: 'iatf', sistemaId: 'pas' }, true)[3]).toEqual({ rotulo: 'Programa e sistema', valor: 'IATF superprecoce · Pasto' });
    expect(camposParaSalvar(E('pp', 'ne', 'cri'), { ...p, programaId: 'iatf' }, true)).toMatchObject({ programa_id: 'iatf', situacao_cria: 'PA' });
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
