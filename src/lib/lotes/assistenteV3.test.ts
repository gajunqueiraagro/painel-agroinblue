/** LOTE-PADRAO-V3 · L2 — a regra do assistente v3: passos que se aplicam, o que trava, o código e o `p_campos` da fn_lote_salvar (117590). */
import { describe, expect, it } from 'vitest';
import type { CadastroDoLote, LoteDaLista } from './tipos';
import {
  alcanceV3, camposV3, codigoV3, comCarimbo, erroDoCarimbo, escolhaV3Inicial, faltaNoPassoV3, passoSeAplica, passoVizinho, perfilV3Inicial,
  PASSOS_V3, programaPorExtenso, semCarimbo, usaV3, valorDoPassoV3, type EscolhaV3,
} from './assistenteV3';

const HOJE = '2026-11-12';
const c = (id: string, tipo: CadastroDoLote['tipo'], sigla: string | null, nome: string, reb: string[] = []): CadastroDoLote =>
  ({ id, tipo, sigla, nome, categoriasRebanho: reb, ordem: 0, ativo: true });
const CAD = [c('a-c', 'atividade', 'C', 'Cria'), c('a-r', 'atividade', 'R', 'Recria'), c('r-ne', 'raca', 'NEL', 'Nelore'), c('r-an', 'raca', 'ANG', 'Angus'),
  c('k-vac', 'categoria', 'VAC', 'Vacas', ['rb-va'])];
const REB = new Map([['vacas', 'rb-va'], ['novilhas', 'rb-no'], ['bois', 'rb-bo'], ['desmama_m', 'rb-dm']]);
const VACA_CRIA: EscolhaV3 = { atividadeId: 'a-c', categoria: 'vacas', racaId: 'r-ne' };
const idx = (k: string) => PASSOS_V3.findIndex(p => p.chave === k);

const lote = (mais: Partial<LoteDaLista>): LoteDaLista => ({
  id: 'l1', codigo: 'C-VAC-NEL-7.1', codigosAntigos: [], nomeCampeiro: null, situacao: 'ativo', formadoEm: '2026-10-01', encerradoEm: null,
  categoriaId: 'k-vac', racaId: 'r-ne', atividadeId: 'a-c', numero: 1, sistemaId: null, programaId: null, destinoId: null, safra: '26/27',
  carimbo: '7.1', idadeMediaMeses: null, metaPesoKg: null, metaGmdKg: null, metaData: null, versao: 3, anoMesDado: null, cabecas: null,
  pesoMedioKg: null, gmdKg: null, pastos: [], lancamentos: 0, conferir: null, carimbos: ['7.1'], categoriaFixa: 'vacas', criaAoPe: 'parida',
  codigoRegra: 'etapas', ...mais,
});

describe('LOTE-PADRAO-V3 · assistente', () => {
  it('8 passos na ordem do mock (o Plano é a L5); recria e engorda pulam Situação e Ordem de parto; touro da cria também', () => {
    expect(PASSOS_V3.map(p => p.chave)).toEqual(['atividade', 'categoria', 'raca', 'situacao', 'ordem', 'programa', 'onde', 'nome']);
    expect([passoSeAplica('situacao', 'cria', 'vacas'), passoSeAplica('situacao', 'recria', 'novilhas'), passoSeAplica('ordem', 'cria', 'touros')])
      .toEqual([true, false, false]);
    expect(passoVizinho(idx('raca'), 1, 'recria', 'garrotes')).toBe(idx('programa'));
    expect(passoVizinho(idx('programa'), -1, 'recria', 'garrotes')).toBe(idx('raca'));
    expect(passoVizinho(idx('raca'), 1, 'cria', 'vacas')).toBe(idx('situacao'));
    expect(alcanceV3({ atividadeId: 'a-c', categoria: 'vacas', racaId: null })).toBe(2);
  });

  it('trava só atividade, categoria, raça, o carimbo da parida e datas impossíveis — com as frases do banco', () => {
    const p = perfilV3Inicial(HOJE);
    expect(faltaNoPassoV3({ atividadeId: null, categoria: null, racaId: null }, p, 0, null, HOJE)).toBe('Escolha a atividade');
    expect(faltaNoPassoV3(VACA_CRIA, { ...p, nascidoDe: '2026-12-01' }, idx('raca'), 'cria', HOJE)).toBe('Nascimento: a data não pode ser depois de hoje.');
    expect(faltaNoPassoV3(VACA_CRIA, { ...p, nascidoDe: '2025-05-01', nascidoAte: '2025-01-01' }, idx('raca'), 'cria', HOJE)).toBe('Nascimento: o "até" vem depois do "de".');
    expect(faltaNoPassoV3(VACA_CRIA, { ...p, criaAoPe: 'parida' }, idx('situacao'), 'cria', HOJE)).toBe('Parida: informe o carimbo (mês.lote, ex.: 7.1).');
    expect(erroDoCarimbo(VACA_CRIA, { ...p, criaAoPe: 'parida', carimbo: '13.1' }, 'cria')).toMatch(/^Carimbo: mês.lote/);
    expect(faltaNoPassoV3(VACA_CRIA, { ...p, criaAoPe: 'parida', carimbo: '7.1' }, idx('situacao'), 'cria', HOJE)).toBeNull();
    /* solteira, prenha, nada escolhido: nunca trava */
    expect(faltaNoPassoV3(VACA_CRIA, p, idx('situacao'), 'cria', HOJE)).toBeNull();
    expect(faltaNoPassoV3(VACA_CRIA, { ...p, criaAoPe: 'parida' }, idx('nome'), 'cria', HOJE)).toBe('Parida: informe o carimbo (mês.lote, ex.: 7.1).');
    expect(faltaNoPassoV3(VACA_CRIA, { ...p, marcadores: Array.from({ length: 11 }, (_, i) => `m${i}`) }, idx('nome'), 'cria', HOJE))
      .toBe('Marcadores: até 10, cada um com até 32 letras.');
  });

  it('carimbos com as cabeças casadas por posição', () => {
    let p = comCarimbo(perfilV3Inicial(HOJE), '7.1');
    p = comCarimbo({ ...p, carimbosCab: [40] }, '8.1');
    expect([p.carimbos, p.carimbosCab]).toEqual([['7.1', '8.1'], [40, null]]);
    expect(comCarimbo(p, '7.1').carimbos).toEqual(['7.1', '8.1']);
    p = semCarimbo({ ...p, carimbosCab: [40, 12] }, '7.1');
    expect([p.carimbos, p.carimbosCab]).toEqual([['8.1'], [12]]);
  });

  it('o código: a sigla do cadastro que o banco vai usar (fixa se não tiver) e a faixa dos carimbos', () => {
    expect(codigoV3(CAD, REB, VACA_CRIA, ['7.1', '8.1'], [])).toBe('C-VAC-NEL-7/8');
    expect(codigoV3(CAD, REB, { atividadeId: 'a-r', categoria: 'desmama_m', racaId: 'r-an' }, [], [])).toBe('R-DSM-ANG');
    expect(codigoV3(CAD, REB, { atividadeId: 'a-c', categoria: null, racaId: null }, [], [])).toBe('C-__-__');
    /* repetido na fazenda = -02 */
    expect(codigoV3(CAD, REB, VACA_CRIA, ['7.1'], [lote({ id: 'outro' })])).toBe('C-VAC-NEL-7.1-02');
    /* editar sem mudar identidade nem carimbos = o mesmo código */
    expect(codigoV3(CAD, REB, VACA_CRIA, ['7.1'], [lote({})], lote({ codigo: 'C-VAC-NEL-7.1-03' }))).toBe('C-VAC-NEL-7.1-03');
  });

  it('p_campos ao criar: categoria fixa pelo código, idade calculada, o que não se aplica vazio, safra do dia', () => {
    const p = { ...perfilV3Inicial(HOJE), criaAoPe: 'parida' as const, prenhez: 'prenha' as const, carimbos: ['7.1'], carimbosCab: [142],
      mamotesSexo: 'F' as const, mamotesSemen: 'sexado_f' as const, prenhaDe: 'iatf' as const, prenhaRacaId: 'r-an', partoPrevisto: '2027-08-15',
      ordemParto: 'MUL' as const, programa: 'reproducao' as const, metodo: 'iatf' as const, entrada: 'precoce' as const, sistema: 'pasto' as const,
      nascidoDe: '2020-01-01', nascidoAte: '2020-12-31', nomeCampeiro: ' Sexada F ', marcador: 'Gêmeos' };
    const k = camposV3(VACA_CRIA, p, 'cria', HOJE);
    expect(k).toMatchObject({ categoria_rebanho: 'vacas', atividade_id: 'a-c', raca_id: 'r-ne', cria_ao_pe: 'parida', prenhez: 'prenha',
      carimbos: ['7.1'], carimbos_cab: [142], parto_previsto: '2027-08-15', ordem_parto: 'MUL', metodo_reproducao: 'iatf',
      entrada_novilha: '', idade_media_meses: '76', nome_campeiro: 'Sexada F', marcadores: ['Gêmeos'], safra: '26/27' });
    expect(k).not.toHaveProperty('categoria_id');
    expect(k).not.toHaveProperty('situacao_cria');
    /* recria: situação, ordem e bezerros vão vazios; o método só na reprodução */
    const r = camposV3({ atividadeId: 'a-r', categoria: 'novilhas', racaId: 'r-ne' }, { ...p, programa: 'recria' }, 'recria', HOJE);
    expect(r).toMatchObject({ cria_ao_pe: '', prenhez: '', ordem_parto: '', carimbos: [], carimbos_cab: [], mamotes_sexo: '', prenha_de: '',
      parto_previsto: '', metodo_reproducao: '', entrada_novilha: 'precoce' });
  });

  it('p_campos ao editar: só o que mudou; sem mudança = vazio', () => {
    const l = lote({ nomeCampeiro: 'Sexada F' });
    const e = escolhaV3Inicial(l); const p = perfilV3Inicial(HOJE, l);
    expect(camposV3(e, p, 'cria', HOJE, l)).toEqual({});
    expect(camposV3(e, { ...p, sistema: 'tip' }, 'cria', HOJE, l)).toEqual({ sistema_lote: 'tip' });
    expect(camposV3(e, comCarimbo(p, '8.1'), 'cria', HOJE, l)).toEqual({ carimbos: ['7.1', '8.1'] });
  });

  it('trilho por extenso; legado (categoria do cliente) segue no assistente de antes', () => {
    const p = { ...perfilV3Inicial(HOJE), programa: 'reproducao' as const, metodo: 'iatf_repasse' as const };
    expect(valorDoPassoV3('programa', CAD, VACA_CRIA, p, 'cria', HOJE)).toBe('Reprodução');            // o trilho: uma linha, sem "…"
    expect(programaPorExtenso(VACA_CRIA, p)).toBe('Reprodução · IATF + repasse');
    expect(valorDoPassoV3('situacao', CAD, { ...VACA_CRIA, categoria: 'bois' }, p, 'engorda', HOJE)).toBe('não se aplica');
    expect(valorDoPassoV3('categoria', CAD, { ...VACA_CRIA, categoria: 'desmama_f' }, p, 'recria', HOJE)).toBe('Desmama fêmea');
    expect([usaV3(null), usaV3(lote({})), usaV3(lote({ categoriaFixa: null }))]).toEqual([true, true, false]);
  });
});
