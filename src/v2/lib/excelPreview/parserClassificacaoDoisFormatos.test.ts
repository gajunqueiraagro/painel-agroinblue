/**
 * O que este teste trava — a sessão do Enriquecer aceita os DOIS Excel.
 *
 * ⚠ O BLOCO DE CIMA E O DE BAIXO LIAM FORMATOS DIFERENTES DO MESMO ARQUIVO. O de
 * cima (importação em massa) já lia o modelo novo — cabeçalho na linha 2, aba
 * "Lançamentos", coluna "Conta (plano do cliente)". O de baixo, que confere linha
 * a linha, só lia o legado: aba `EXPORT_APP_UNICO`, cabeçalho na linha 1, coluna
 * `Subcentro`. O mesmo arquivo entrava num e era recusado no outro.
 *
 * ⚠ O CABEÇALHO NA LINHA 2 NÃO É DETALHE. Lido com `sheet_to_json` por chaves — o
 * modo que assume linha 1 —, o modelo novo viraria uma planilha de colunas
 * chamadas "OBRIGATÓRIA"/"opcional", com zero linha válida e a mensagem errada.
 *
 * ⚠ E "CONTA" NÃO QUER DIZER A MESMA COISA NOS DOIS. No legado é a conta
 * BANCÁRIA; no modelo novo, `Conta (plano do cliente)` é o PLANO e o banco chama
 * `Conta bancária`. Um mapa por semelhança de nome jogaria o plano do cliente na
 * conta de origem — e o teste do modelo novo confere justamente onde cada um foi
 * parar.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelClassificacao } from '@/v2/lib/excelPreview/parserClassificacao';

/**
 * Constrói um File .xlsx em memória a partir de uma matriz de linhas.
 *
 * ⚠ `File.arrayBuffer` NÃO EXISTE EM JSDOM, e o parser o chama. É buraco do
 * ambiente, não do código — sem o `defineProperty` o teste acusaria um defeito
 * que o navegador não tem.
 */
function arquivo(aba: string, matriz: unknown[][]): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matriz), aba);
  const bytes: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const f = new File([bytes], 'teste.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  Object.defineProperty(f, 'arrayBuffer', { value: async () => bytes });
  return f;
}

/** O formato LEGADO: aba EXPORT_APP_UNICO, cabeçalho na linha 1. */
const LEGADO = arquivo('EXPORT_APP_UNICO', [
  ['Data_Ref', 'Valor', 'Tipo', 'Subcentro', 'Conta', 'Fazenda', 'Fornecedor', 'Produto', 'Documento'],
  ['01/07/2026', 1250, '2-Saídas', 'COMBUSTIVEL', 'Banco do Brasil', 'SR', 'POSTO IPIRANGA', 'Diesel S10', 'NF 12345'],
  ['05/07/2026', 380.9, '2-Saídas', 'MANUTENCAO', 'Cartão Itaú', 'SR', 'OFICINA DO ZE', 'Troca de óleo', ''],
]);

/** O MODELO NOVO: aba Lançamentos, marcador na linha 1, cabeçalho na 2. */
const NOVO = arquivo('Lançamentos', [
  ['OBRIGATÓRIA', 'OBRIGATÓRIA', 'OBRIGATÓRIA', 'opcional', 'OBRIGATÓRIA', 'OBRIGATÓRIA', 'OBRIGATÓRIA', 'opcional', 'opcional', 'opcional'],
  ['Data de competência', 'Valor', 'Tipo de operação', 'Conta (plano do cliente)', 'Fazenda',
   'Fornecedor', 'Conta bancária', 'Descrição', 'Documento', 'ID (não mexer)'],
  ['01/07/2026', 1250, '2-Saídas', 'COMBUSTIVEL', 'SR', 'POSTO IPIRANGA', 'Banco do Brasil', 'Diesel S10', 'NF 12345', 'abc-123'],
  ['05/07/2026', 380.9, '2-Saídas', 'MANUTENCAO', 'SR', 'OFICINA DO ZE', 'Cartão Itaú', 'Troca de óleo', '', 'def-456'],
]);

describe('parserClassificacao — os dois formatos entram', () => {
  it('legado: continua entrando exatamente como antes', async () => {
    const r = await parseExcelClassificacao(LEGADO);
    expect(r.linhasValidas).toBe(2);
    expect(r.linhasComErro).toBe(0);
    expect(r.rows[0].subcentro).toBe('COMBUSTIVEL');
    expect(r.rows[0].conta_origem).toBe('Banco do Brasil');
    expect(r.rows[0].data).toBe('2026-07-01');
    expect(r.rows[0].valor).toBe(1250);
    /* A numeração da linha do Excel continua a mesma: cabeçalho em 1, dados em 2. */
    expect(r.rows[0].linha).toBe(2);
  });

  it('modelo novo: entra, com o cabeçalho na linha 2', async () => {
    const r = await parseExcelClassificacao(NOVO);
    expect(r.linhasValidas).toBe(2);
    expect(r.linhasComErro).toBe(0);
    /* Dados começam na linha 3 do Excel, porque a 1 é o marcador. */
    expect(r.rows[0].linha).toBe(3);
    expect(r.rows[1].linha).toBe(4);
  });

  it('modelo novo: "Conta (plano do cliente)" vira SUBCENTRO, não conta de origem', async () => {
    const r = await parseExcelClassificacao(NOVO);
    expect(r.rows[0].subcentro).toBe('COMBUSTIVEL');
    expect(r.rows[0].conta_origem).toBe('Banco do Brasil');
    expect(r.rows[1].subcentro).toBe('MANUTENCAO');
    expect(r.rows[1].conta_origem).toBe('Cartão Itaú');
  });

  it('os dois formatos produzem o MESMO conteúdo para os mesmos lançamentos', async () => {
    const a = await parseExcelClassificacao(LEGADO);
    const b = await parseExcelClassificacao(NOVO);
    const semLinha = (r: Awaited<ReturnType<typeof parseExcelClassificacao>>) =>
      r.rows.map(({ linha: _linha, ...resto }) => resto);
    expect(semLinha(b)).toEqual(semLinha(a));
  });

  it('coluna que o legado não conhece é ignorada sem erro', async () => {
    const r = await parseExcelClassificacao(NOVO);
    expect(r.erros).toEqual([]);
    /* `ID (não mexer)` não tem destino no shape da sessão — e não vira erro. */
    expect(Object.keys(r.rows[0])).not.toContain('id');
  });

  it('planilha sem cabeçalho reconhecível diz isso, e não "zero linhas"', async () => {
    const lixo = arquivo('Plan1', [['a', 'b', 'c'], [1, 2, 3]]);
    const r = await parseExcelClassificacao(lixo);
    expect(r.linhasValidas).toBe(0);
    expect(r.erros[0].motivo).toContain('Nenhuma linha de cabeçalho reconhecida');
  });

  it('sem plano a linha ENTRA como pendente — nunca é recusada', async () => {
    const semPlano = arquivo('Lançamentos', [
      ['OBRIGATÓRIA', 'OBRIGATÓRIA', 'OBRIGATÓRIA', 'opcional', 'OBRIGATÓRIA'],
      ['Data de competência', 'Valor', 'Tipo de operação', 'Conta (plano do cliente)', 'Fazenda'],
      ['01/07/2026', 1250, '2-Saídas', '', 'SR'],
    ]);
    const r = await parseExcelClassificacao(semPlano);
    /* ⚠ A CÉLULA EM BRANCO É UMA RESPOSTA: recusar a linha esconderia do operador
       exatamente aquela que ele abriu a sessão para classificar. */
    expect(r.linhasValidas).toBe(1);
    expect(r.erros).toEqual([]);
    expect(r.rows[0].subcentro).toBeNull();
    /* O resto da linha chega inteiro — é o que permite achar o lançamento. */
    expect(r.rows[0].valor).toBe(1250);
    expect(r.rows[0].data).toBe('2026-07-01');
    expect(r.rows[0].fazenda_codigo).toBe('SR');
  });

  it('o que continua recusado: sem data, sem valor, sem tipo', async () => {
    const quebrada = arquivo('Lançamentos', [
      ['Data de competência', 'Valor', 'Tipo de operação', 'Conta (plano do cliente)', 'Fazenda'],
      ['', 1250, '2-Saídas', 'COMBUSTIVEL', 'SR'],
      ['01/07/2026', '', '2-Saídas', 'COMBUSTIVEL', 'SR'],
      ['01/07/2026', 1250, '', 'COMBUSTIVEL', 'SR'],
    ]);
    const r = await parseExcelClassificacao(quebrada);
    expect(r.linhasValidas).toBe(0);
    expect(r.linhasComErro).toBe(3);
  });
});
