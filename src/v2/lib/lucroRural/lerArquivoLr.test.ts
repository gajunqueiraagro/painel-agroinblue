import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { lerArquivoLr, tipoDoCabecalho } from './lerArquivoLr';

// Fixture SINTÉTICA: nenhum dado real do Lucro Rural entra no repositório.
function planilha(linhas: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas, { cellDates: true }), 'Contas');
  const out: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return out;
}

const CAB_PAGAR = ['Tipo', 'Número', 'CPF/CNPJ', 'Inscrição Estadual', 'Fornecedor', 'Valor',
  'Data Vencimento', 'Data Pagamento', 'Data Cadastro', 'Está Pago?'];

describe('lerArquivoLr', () => {
  it('lê o arquivo de pagar com o cabeçalho do LR como chave', () => {
    const r = lerArquivoLr(planilha([
      ['Relatório de contas'],
      CAB_PAGAR,
      ['Conta a Pagar', '100 / 1', '11.222.333/0001-81', 'Faz Sintética', 'FORN SINT LTDA', 1234.56,
        '06/10/2031', '-', '01/09/2031', 'Não'],
      [null, null, null, null, null, null, null, null, null, null],
      ['Conta a Pagar', '101', '-', 'Faz Sintética', 'Cartão Sint', 99.9, new Date(2031, 9, 16), null, '02/09/2031', 'Sim'],
    ]), 'pagar-sint.xlsx');
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.tipo).toBe('pagar');
    expect(r.linhaCabecalho).toBe(2);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toMatchObject({
      Tipo: 'Conta a Pagar', 'Número': '100 / 1', 'CPF/CNPJ': '11.222.333/0001-81', Valor: 1234.56,
      'Data Vencimento': '06/10/2031', 'Data Pagamento': '-', _arquivo: 'pagar-sint.xlsx', _tipo_arquivo: 'pagar', _ordem: 1,
    });
    expect(r.linhas[1]['Data Vencimento']).toBe('2031-10-16');
    expect(r.linhas[1]['Data Pagamento']).toBeNull();
    expect(r.linhas[1]._ordem).toBe(2);
  });

  it('data gravada como número de série inteiro (o Excel) vira AAAA-MM-DD', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([CAB_PAGAR, ['Conta a Pagar', '7', '', '', 'F', 5, 0, null, null, 'Não']]);
    ws.G2 = { t: 'n', v: 48137, z: 'dd/mm/yyyy' };
    XLSX.utils.book_append_sheet(wb, ws, 'Contas');
    const buf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const r = lerArquivoLr(buf, 'z.xlsx');
    expect(r.ok && r.linhas[0]['Data Vencimento']).toBe('2031-10-16');
  });

  it('o arquivo de receber se reconhece pelo cabeçalho', () => {
    const cab = ['Tipo', 'Número', 'CPF/CNPJ', 'Cliente', 'Valor', 'Data Vencimento', 'Está Recebido?'];
    expect(tipoDoCabecalho(cab)).toBe('receber');
    const r = lerArquivoLr(planilha([cab, ['Conta a Receber', '9', '1', 'CLI SINT', 10, '10/10/2031', 'Não']]), 'rec.xlsx');
    expect(r.ok && r.tipo).toBe('receber');
    expect(r.ok && r.linhas[0]._tipo_arquivo).toBe('receber');
  });

  it('recusa planilha sem o cabeçalho do LR', () => {
    const r = lerArquivoLr(planilha([['A', 'B'], [1, 2]]), 'x.xlsx');
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.motivo).toMatch(/Cabeçalho do Lucro Rural/);
  });

  it('linha sem valor não entra', () => {
    const r = lerArquivoLr(planilha([CAB_PAGAR, ['Conta a Pagar', '1', '', '', 'X', null, '01/01/2031', null, null, 'Não']]), 'y.xlsx');
    expect(r.ok && r.linhas).toEqual([]);
  });
});
