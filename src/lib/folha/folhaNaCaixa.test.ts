/** FOLHA-NA-CAIXA-01 — a regra pura (dado INVENTADO; holerite real nunca entra aqui). */
import { describe, it, expect } from 'vitest';
import type { FolhaLida } from './lerFolha';
import { linhasDaPrevia, motivoParaNaoAprovar, nomeDoPedaco, pedidoDaFolha, respostaDaFolha, competenciaBR, fraseDaLinhaDaFolha } from './folhaNaCaixa';

const FOLHA: FolhaLida = {
  layout: 'sci', tipo: '13_1', competencia: '2026-11', empregadores: ['11122233344'], total: 2530,
  pessoas: [
    { codigo: '12', nome: 'FULANA FICTICIA', cei: '11122233344', paginas: [1], valor: 730 },
    { codigo: '15', nome: 'BELTRANO/DE TAL', cei: '11122233344', paginas: [2, 3], valor: 1000 },
    { codigo: '20', nome: 'CICRANO NOVO', cei: '11122233344', paginas: [4], valor: 800 },
  ],
};
const PEDACOS = [{ tamanho: 10, md5: 'a'.repeat(32) }, { tamanho: 20, md5: 'b'.repeat(32) }, { tamanho: 30, md5: 'c'.repeat(32) }];

describe('o pedido da fn_folha_recibos_aplicar (contrato A1)', () => {
  it('documento e itens na ordem do PDF; "criar" só nos marcados; o nome do pedaço sem barra', () => {
    const { documento, itens } = pedidoDaFolha(FOLHA, 'recibos.pdf', 'f'.repeat(32), PEDACOS, new Set([2]));
    expect(documento).toEqual({ md5: 'f'.repeat(32), nome: 'recibos.pdf', tipo: '13_1', competencia: '2026-11', total: 2530, empregador: '11122233344' });
    expect(itens.map((i) => [i.nome, i.paginas, i.valor, i.arquivo.tamanho, i.arquivo.md5])).toEqual([
      ['FULANA FICTICIA', [1], 730, 10, 'a'.repeat(32)], ['BELTRANO/DE TAL', [2, 3], 1000, 20, 'b'.repeat(32)], ['CICRANO NOVO', [4], 800, 30, 'c'.repeat(32)]]);
    expect(itens.map((i) => i.criar ?? false)).toEqual([false, false, true]);
    expect(itens[1].arquivo.nome).toBe('15-BELTRANO DE TAL.pdf');
    expect(nomeDoPedaco({ codigo: '1', nome: 'A:B*C' })).toBe('1-A B C.pdf');
  });
});

const RESP = {
  ok: true, simulado: true, soma: '2530.00',
  automaticos: [{ pagina: [1], nome: 'FULANA FICTICIA', lancamento_id: 'l1', antes: '3192.00', depois: 730, nome_confere: 'exato', casou_por: 'funcionario',
    descricao: 'Folha Pagamento - 13', vencimento: '2026-12-05', status: 'previsto' },
  { pagina: [2, 3], nome: 'BELTRANO/DE TAL', lancamento_id: 'l2', antes: 900, depois: 1000, nome_confere: 'parcial', casou_por: 'favorecido' }],
  pendencias: [{ pagina: [4], nome: 'CICRANO NOVO', valor: '800.00', pendencia: 'sem_lancamento', funcionario_id: null }],
  sem_recibo: [{ lancamento_id: 'l9', nome: 'OUTRO FICTICIO', valor: 500 }], criar: [],
  documentos_sem_funcionario: [{ pagina: [4], nome: 'CICRANO NOVO', motivo: 'sem funcionário no cadastro' }],
};

describe('a resposta do banco → as linhas da prévia', () => {
  it('lê números em texto, o que falta vira null (nunca zero), recusa o que não é ok', () => {
    const r = respostaDaFolha(RESP);
    expect(r?.soma).toBe(2530);
    expect(r?.automaticos[0]).toMatchObject({ antes: 3192, descricao: 'Folha Pagamento - 13', vencimento: '2026-12-05', status: 'previsto' });
    expect(r?.automaticos[1]).toMatchObject({ descricao: null, vencimento: null, nomeConfere: 'parcial' });
    expect(respostaDaFolha({ ok: false })).toBeNull();
    expect(respostaDaFolha('x')).toBeNull();
    expect(respostaDaFolha({ ok: true, ja_aplicado: true })?.jaAplicado).toBe(true);
  });
  it('uma linha por pessoa: casa (com o lançamento), sem lançamento, o PDF que não se guarda; o "Criar" marcado vira cria', () => {
    const r = respostaDaFolha(RESP);
    if (!r) throw new Error('sem resposta');
    const ls = linhasDaPrevia(FOLHA, r, new Set());
    expect(ls.map((l) => [l.acontece, l.antes, l.recibo, l.guardaArquivo, l.nomeParcial])).toEqual([
      ['casa', 3192, 730, true, false], ['casa', 900, 1000, true, true], ['sem_lancamento', null, 800, false, false]]);
    const comCriar = respostaDaFolha({ ...RESP, pendencias: [], criar: [{ nome: 'CICRANO NOVO', valor: 800, descricao: 'Folha Pagamento - 13', vencimento: '2026-12-05' }] });
    if (!comCriar) throw new Error('sem resposta');
    expect(linhasDaPrevia(FOLHA, comCriar, new Set([2]))[2]).toMatchObject({ acontece: 'cria', descricao: 'Folha Pagamento - 13' });
  });
  it('o Aprovar diz por que não: sem lançamento, confira, soma ≠ documento, já aplicado; tudo certo = null', () => {
    const r = respostaDaFolha(RESP);
    if (!r) throw new Error('sem resposta');
    expect(motivoParaNaoAprovar(FOLHA, r, linhasDaPrevia(FOLHA, r, new Set()))).toMatch(/1 recibo\(s\) sem lançamento/);
    const amb = respostaDaFolha({ ...RESP, pendencias: [{ pagina: [4], nome: 'X', valor: 800, pendencia: 'ambiguo' }] });
    if (!amb) throw new Error('sem resposta');
    expect(motivoParaNaoAprovar(FOLHA, amb, linhasDaPrevia(FOLHA, amb, new Set()))).toMatch(/mais de um/);
    const ok = respostaDaFolha({ ...RESP, pendencias: [], criar: [{ nome: 'CICRANO NOVO', valor: 800 }] });
    if (!ok) throw new Error('sem resposta');
    expect(motivoParaNaoAprovar(FOLHA, ok, linhasDaPrevia(FOLHA, ok, new Set([2])))).toBeNull();
    expect(motivoParaNaoAprovar(FOLHA, { ...ok, soma: 2529.99 }, linhasDaPrevia(FOLHA, ok, new Set([2])))).toMatch(/soma/);
    expect(motivoParaNaoAprovar(FOLHA, { ...ok, jaAplicado: true }, [])).toMatch(/já foi aplicado/);
    expect(motivoParaNaoAprovar(FOLHA, null, [])).toMatch(/esperando/);
  });
  it('o contrato 118570: descrição e vencimento DEPOIS mandam (o antes fica para o title); o dividir traz a 2ª parcela', () => {
    const r = respostaDaFolha({ ok: true, soma: 2530, automaticos: [{ pagina: [1], nome: 'FULANA FICTICIA', lancamento_id: 'l1', antes: 3192, depois: 730,
      acao: 'dividir', descricao_antes: 'Folha Pagamento - 13', descricao_depois: '13º Salário 1ª Parcela 2026', vencimento_antes: '2026-12-05',
      vencimento_depois: '2026-11-30', segunda: { descricao: '13º Salário 2ª Parcela 2026', valor: '2462.00', vencimento: '2026-12-18' } }] });
    if (!r) throw new Error('sem resposta');
    const l = linhasDaPrevia(FOLHA, r, new Set())[0];
    expect([l.acontece, l.descricao, l.descricaoAntes, l.vencimento, l.vencimentoAntes]).toEqual(['divide', '13º Salário 1ª Parcela 2026', 'Folha Pagamento - 13', '2026-11-30', '2026-12-05']);
    expect(l.segunda).toEqual({ descricao: '13º Salário 2ª Parcela 2026', valor: 2462, vencimento: '2026-12-18' });
  });
  it('o texto da linha da Caixa', () => {
    expect(competenciaBR('2026-11')).toBe('11/2026');
    expect(fraseDaLinhaDaFolha(FOLHA)).toBe('3 pessoas · "Abrir" mostra a prévia');
    expect(fraseDaLinhaDaFolha({ ...FOLHA, empregadores: ['1', '2', '3'] })).toBe('3 pessoas · 3 empregadores · "Abrir" mostra a prévia');
  });
});
