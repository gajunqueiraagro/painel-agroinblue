/** LOTES-03 F1 — a lista Produção › Lotes e o Histórico da ficha: leitura, filtro, ordenação, total ponderado, diff e Desfazer. */
import { describe, it, expect } from 'vitest';
import { ordenarPorColuna } from '@/hooks/useOrdenacaoTabela';
import {
  chaveDoCarimbo, colunasDosLotes, filtrarLotes, loteDaLinha, mapaDoCadastro, motivoDoDesfazer, mudancasDaTrilha, oQueDaTrilha,
  textoDosPastos, totalDosLotes, trilhaDaLinha, type ColunaDosLotes,
} from './lista';
import type { CadastroDoLote, LoteDaLista } from './tipos';

const cad = (id: string, tipo: CadastroDoLote['tipo'], sigla: string | null, nome: string): CadastroDoLote =>
  ({ id, tipo, sigla, nome, categoriasRebanho: [], ordem: 0, ativo: true });
const CADASTROS = [cad('rc', 'atividade', 'RC', 'Recria'), cad('eg', 'atividade', 'EG', 'Engorda'), cad('sp', 'sistema', null, 'Pasto'),
  cad('sc', 'sistema', null, 'Confinamento'), cad('df', 'categoria', 'DF', 'Desmama fêmea'), cad('ne', 'raca', 'NE', 'Nelore')];
const NOMES = mapaDoCadastro(CADASTROS);

const linha = (o: Partial<Record<string, unknown>>) => ({
  id: 'l1', codigo: 'DF-NE-RC-05', codigos_antigos: [], nome_campeiro: 'L05 - DF Nel. SP', situacao: 'ativo', formado_em: '2026-09-30',
  encerrado_em: null, categoria_id: 'df', raca_id: 'ne', atividade_id: 'rc', numero: 5, sistema_id: 'sc', programa_id: null, destino_id: null,
  safra: '26/27', carimbo: null, idade_media_meses: 9, meta_peso_kg: '380.0', meta_gmd_kg: null, meta_data: null, versao: 1,
  ano_mes_dado: '2026-10', cabecas: 80, peso_medio_kg: '320.0', gmd_kg: '0.840', pastos: ['CONF.01'], lancamentos: 1, ...o,
});
const L = (o: Partial<Record<string, unknown>>): LoteDaLista => { const l = loteDaLinha(linha(o)); if (!l) throw new Error('linha'); return l; };

describe('loteDaLinha: a linha da RPC, sem cast', () => {
  it('lê números que chegam como texto (numeric) e as listas', () => {
    const l = L({});
    expect([l.pesoMedioKg, l.gmdKg, l.metaPesoKg, l.cabecas, l.pastos]).toEqual([320, 0.84, 380, 80, ['CONF.01']]);
  });
  it('117440: lê o "conferir" (texto do que conferir; nulo = nada)', () => {
    expect(L({ conferir: 'carimbo sem o nº do lote' }).conferir).toBe('carimbo sem o nº do lote');
    expect(L({}).conferir).toBeNull();
  });
  it('linha sem id, código, situação conhecida ou identidade fica fora', () => {
    expect(loteDaLinha(linha({ id: null }))).toBeNull();
    expect(loteDaLinha(linha({ situacao: 'sumido' }))).toBeNull();
    expect(loteDaLinha(linha({ atividade_id: '' }))).toBeNull();
    expect(loteDaLinha('x')).toBeNull();
  });
  it('sem lançamento no fechamento: cab., peso e GMD nulos (a tela escreve "—")', () => {
    const l = L({ cabecas: null, peso_medio_kg: null, gmd_kg: null, pastos: null, ano_mes_dado: null, lancamentos: 0 });
    expect([l.cabecas, l.pesoMedioKg, l.gmdKg, l.pastos, l.anoMesDado]).toEqual([null, null, null, [], null]);
  });
});

describe('filtrarLotes', () => {
  const lotes = [L({}), L({ id: 'l2', codigo: 'DM-AN-EG-01', nome_campeiro: 'DM Angus L1', atividade_id: 'eg', pastos: ['T-B1'], codigos_antigos: ['DM-AN-RC-03'] }),
    L({ id: 'l3', codigo: 'PX-NE-DC-02', situacao: 'encerrado', nome_campeiro: 'Vacas PX antigas' })];
  const f = (o: Partial<Parameters<typeof filtrarLotes>[1]>) => filtrarLotes(lotes, { situacao: 'ativo', atividadeId: null, busca: '', ...o }).map(l => l.id);
  it('situação e atividade', () => {
    expect(f({})).toEqual(['l1', 'l2']);
    expect(f({ situacao: 'encerrado' })).toEqual(['l3']);
    expect(f({ atividadeId: 'eg' })).toEqual(['l2']);
  });
  it('a busca acha código, nome do campeiro, pasto e o CÓDIGO ANTIGO (D1), sem acento e sem caixa', () => {
    expect(f({ busca: 'dm-an-rc-03' })).toEqual(['l2']);
    expect(f({ busca: 'conf.01' })).toEqual(['l1']);
    expect(f({ busca: 'nel. sp' })).toEqual(['l1']);
    expect(f({ busca: 'df-ne' })).toEqual(['l1']);
  });
});

describe('ordenação: todas as colunas', () => {
  const lotes = [L({ id: 'a', codigo: 'DF-NE-RC-02', carimbo: '10.1', cabecas: 10, sistema_id: 'sp' }),
    L({ id: 'b', codigo: 'DF-NE-RC-01', carimbo: '7.2', cabecas: null, sistema_id: 'sc' }), L({ id: 'c', codigo: 'DF-NE-RC-03', carimbo: null, cabecas: 99, sistema_id: null })];
  const ordem = (c: ColunaDosLotes, d: 'asc' | 'desc') =>
    ordenarPorColuna(lotes, colunasDosLotes(NOMES).find(x => x.coluna === c), d).map(l => l.id);
  it('as onze colunas existem', () => {
    expect(colunasDosLotes(NOMES).map(c => c.coluna)).toEqual(['codigo', 'nome', 'atividade', 'sistema', 'programa', 'destino', 'carimbo', 'cab', 'peso', 'gmd', 'pasto']);
  });
  it('código em texto; carimbo pelo mês e depois o lote (7.2 antes de 10.1); sem carimbo/cab. vai para o fim; sistema pelo NOME', () => {
    expect(ordem('codigo', 'asc')).toEqual(['b', 'a', 'c']);
    expect(ordem('carimbo', 'asc')).toEqual(['b', 'a', 'c']);
    expect(ordem('cab', 'desc')).toEqual(['c', 'a', 'b']);
    expect(ordem('sistema', 'asc')).toEqual(['b', 'a', 'c']);   // Confinamento < Pasto < (vazio)
    expect(chaveDoCarimbo('7.2')).toBeLessThan(chaveDoCarimbo('10.1') ?? 0);
  });
  it('o pasto na célula: um = o nome; vários = "N pastos"', () => {
    expect([textoDosPastos([]), textoDosPastos(['T-B1']), textoDosPastos(['T-A2', 'T-A3', 'T-B6'])]).toEqual([null, 'T-B1', '3 pastos']);
  });
});

describe('totalDosLotes: cab. somada, peso e GMD ponderados pelas cabeças', () => {
  it('lote sem peso não puxa a média para zero; sem nenhum lançamento = nulo', () => {
    const t = totalDosLotes([L({ cabecas: 80, peso_medio_kg: 320, gmd_kg: 0.8 }), L({ id: 'b', cabecas: 20, peso_medio_kg: 420, gmd_kg: null }),
      L({ id: 'c', cabecas: 50, peso_medio_kg: null, gmd_kg: 0.5 }), L({ id: 'd', cabecas: null, peso_medio_kg: null })]);
    expect(t.lotes).toBe(4);
    expect(t.cabecas).toBe(150);
    expect(t.pesoMedioKg).toBeCloseTo((80 * 320 + 20 * 420) / 100, 6);
    expect(t.gmdKg).toBeCloseTo((80 * 0.8 + 50 * 0.5) / 130, 6);
    expect(totalDosLotes([L({ cabecas: null })])).toEqual({ lotes: 1, cabecas: null, pesoMedioKg: null, gmdKg: null });
  });
});

describe('o Histórico: o diff da trilha e o Desfazer', () => {
  const base = { id: 'a1', created_at: '2026-11-06T17:45:00-03:00', usuario_id: 'u', via: null, acao: 'editou' };
  const antes = linha({}); const depois = linha({ sistema_id: 'sp', versao: 2, atualizado_em: 'x' });
  it('só os campos que mudaram, com o nome do cadastro; o Desfazer manda o ANTES', () => {
    const t = trilhaDaLinha({ ...base, resumo: 'motivo: lote editado', dados_anteriores: antes, dados_novos: depois });
    if (!t) throw new Error('trilha');
    const ms = mudancasDaTrilha(t, NOMES);
    expect(ms.map(m => [m.campo, m.antes, m.depois])).toEqual([['Sistema', 'Confinamento', 'Pasto']]);
    expect(ms[0].desfazer).toEqual({ tipo: 'campos', campos: { sistema_id: 'sc' } });
    expect(oQueDaTrilha(t)).toBe('Lote editado');
    expect(motivoDoDesfazer(ms[0])).toBe('desfazer: sistema');
  });
  it('mudou o código (D1): o Desfazer manda categoria, raça, atividade e o NÚMERO antigos', () => {
    const t = trilhaDaLinha({ ...base, resumo: null, dados_anteriores: antes,
      dados_novos: linha({ codigo: 'DF-NE-EG-01', atividade_id: 'eg', numero: 1, codigos_antigos: ['DF-NE-RC-05'] }) });
    if (!t) throw new Error('trilha');
    const m = mudancasDaTrilha(t, NOMES).find(x => x.chave === 'codigo');
    expect(m?.antes).toBe('DF-NE-RC-05');
    expect(m?.desfazer).toEqual({ tipo: 'campos', campos: { categoria_id: 'df', raca_id: 'ne', atividade_id: 'rc', numero: 5 } });
  });
  it('situação: o Desfazer volta a situação; vazio vira "—"; data em dd/mm/aaaa; criação = uma linha com o código', () => {
    const t = trilhaDaLinha({ ...base, resumo: 'motivo: lote encerrado', dados_anteriores: antes,
      dados_novos: linha({ situacao: 'encerrado', meta_data: '2026-12-15', safra: null }) });
    if (!t) throw new Error('trilha');
    const ms = mudancasDaTrilha(t, NOMES);
    expect(ms.find(m => m.chave === 'situacao')?.desfazer).toEqual({ tipo: 'situacao', situacao: 'ativo' });
    expect(ms.find(m => m.chave === 'meta_data')?.depois).toBe('15/12/2026');
    expect(ms.find(m => m.chave === 'safra')?.depois).toBe('—');
    const cria = trilhaDaLinha({ ...base, acao: 'criou', resumo: 'motivo: lote criado', dados_anteriores: null, dados_novos: linha({}) });
    if (!cria) throw new Error('trilha');
    expect(mudancasDaTrilha(cria, NOMES)).toEqual([{ chave: 'codigo', campo: 'Código', antes: '—', depois: 'DF-NE-RC-05', desfazer: null }]);
  });
});
