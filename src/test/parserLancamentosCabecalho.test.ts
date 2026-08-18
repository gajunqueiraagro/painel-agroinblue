// parserLancamentosCabecalho — PR-IMPORT-EXCEL-LANC-03.
//
// Trava a localização da linha de cabeçalho. O defeito que originou o PR era um
// off-by-one silencioso: o modelo tem marcadores na linha 1 e cabeçalhos na 2, o
// parser lia a linha 1 e devolvia 0 linhas sem erro aparente. O risco de regressão
// é o mesmo de sempre — mexer no índice e não perceber.
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelLancamentos } from '@/v2/lib/excelPreview/parserLancamentos';

function arquivoDe(aoa: unknown[][]): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Lancamentos');
  const buf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const f = new File([buf], 'teste.xlsx');
  // jsdom não implementa File.arrayBuffer — shim só do que o parser usa.
  Object.defineProperty(f, 'arrayBuffer', { value: async () => buf });
  return f;
}

const CAB = [
  'Data de competência', 'Valor', 'Tipo de operação', 'Conta (plano do cliente)',
  'Fazenda', 'Fornecedor', 'Conta bancária',
];
const MARC = ['OBRIGATÓRIA', 'OBRIGATÓRIA', 'OBRIGATÓRIA', 'OBRIGATÓRIA', 'OBRIGATÓRIA', 'OBRIGATÓRIA', 'OBRIGATÓRIA'];
const D1 = ['01/07/2026', '1250,00', '2-Saídas', 'COMBUSTIVEL', 'SR', 'POSTO IPIRANGA', 'Cartão Itaú'];
const D2 = ['05/07/2026', '380,90', '2-Saídas', 'MANUTENCAO', 'SR', 'OFICINA', 'Cartão Itaú'];

describe('localização do cabeçalho', () => {
  it('modelo de DUAS linhas: marcador em 1, cabeçalho em 2, dados de 3 em diante', async () => {
    const r = await parseExcelLancamentos(arquivoDe([MARC, CAB, D1, D2]));
    expect(r.linhaCabecalho).toBe(2);
    expect(r.linhasValidas).toBe(2);
    expect(r.colunaPlanoDetectada).toBe('Conta (plano do cliente)');
    expect(r.rows[0].linha).toBe(3);
    expect(r.rows[0].conta_plano_texto).toBe('COMBUSTIVEL');
    expect(r.rows[1].linha).toBe(4);
  });

  it('planilha de UMA linha: cabeçalho em 1, dados de 2 em diante', async () => {
    const r = await parseExcelLancamentos(arquivoDe([CAB, D1, D2]));
    expect(r.linhaCabecalho).toBe(1);
    expect(r.linhasValidas).toBe(2);
    expect(r.rows[0].linha).toBe(2);
  });

  it('sem cabeçalho reconhecível: 0 linhas e aviso citando quantas foram testadas', async () => {
    const r = await parseExcelLancamentos(arquivoDe([['a', 'b'], ['c', 'd'], ['e', 'f']]));
    expect(r.linhaCabecalho).toBeNull();
    expect(r.linhasValidas).toBe(0);
    expect(r.linhasTestadas).toBe(3);
    expect(r.erros[0].motivo).toContain('3 primeiras linhas');
  });

  it('preserva os valores lidos (data, valor absoluto, tipo canônico)', async () => {
    const r = await parseExcelLancamentos(arquivoDe([MARC, CAB, D1]));
    expect(r.rows[0].data_competencia).toBe('2026-07-01');
    expect(r.rows[0].valor).toBe(1250);
    expect(r.rows[0].tipo_operacao).toBe('2-Saídas');
    expect(r.rows[0].conta_bancaria_texto).toBe('Cartão Itaú');
  });
});
