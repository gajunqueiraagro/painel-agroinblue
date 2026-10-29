/** P159a — o histórico do banco limpo (só exibição). As FORMAS são as do BB do NJ em set–out/26; os nomes são inventados. */
import { describe, it, expect } from 'vitest';
import { historicoDoBanco } from './historicoDoBanco';

const H = historicoDoBanco;

describe('P159a — historicoDoBanco', () => {
  it('PIX enviado: a hora sai na frente e o "dd/mm" do dia some', () => {
    expect(H('PIX - ENVIADO - 01/10 08:46 FULANO DE TAL JUNIOR', '2026-10-01')).toEqual({ hora: '08:46', texto: 'PIX ENVIADO · FULANO DE TAL JUNIOR' });
    expect(H('Pix - Recebido - 05/10 14:02 Beltrana Souza', '2026-10-05')).toEqual({ hora: '14:02', texto: 'Pix Recebido · Beltrana Souza' });
  });
  it('compra com cartão (uma parte só antes da data)', () => {
    expect(H('COMPRA COM CARTÃO - 02/10 16:31 LOJA EXEMPLO', '2026-10-02')).toEqual({ hora: '16:31', texto: 'COMPRA COM CARTÃO · LOJA EXEMPLO' });
  });
  it('agendamento de outro dia: a data FICA no texto (é o dia em que se agendou)', () => {
    expect(H('Pix - Agendamento - 28/09 10:15 Ciclano Pereira', '2026-10-01')).toEqual({ hora: '10:15', texto: 'Pix Agendamento 28/09 · Ciclano Pereira' });
    /* sem a data do movimento não se sabe: fica */
    expect(H('PIX - ENVIADO - 01/10 08:46 FULANO').texto).toBe('PIX ENVIADO 01/10 · FULANO');
  });
  it('sem nome depois da hora', () => {
    expect(H('Pix - Agendamento - 03/10 09:00', '2026-10-03')).toEqual({ hora: '09:00', texto: 'Pix Agendamento' });
  });
  it('sem hora: só o separador " - " vira " · " (o espaço duplo do banco cai); nada se abrevia', () => {
    expect(H('PAGAMENTO DE BOLETO -  EMPRESA EXEMPLO S A', '2026-10-01')).toEqual({ hora: '', texto: 'PAGAMENTO DE BOLETO · EMPRESA EXEMPLO S A' });
    expect(H('BB Consórcio - Prestação - ADMINISTRADORA EXEMPLO')).toEqual({ hora: '', texto: 'BB Consórcio · Prestação · ADMINISTRADORA EXEMPLO' });
    expect(H('TED-CRÉDITO EM CONTA -  FULANO').texto).toBe('TED-CRÉDITO EM CONTA · FULANO');
    expect(H('Movimento do Dia - Clube de beneficios 09/2026').texto).toBe('Movimento do Dia · Clube de beneficios 09/2026');
  });
  it('padrão não reconhecido: o texto ORIGINAL, sem hora', () => {
    expect(H('rcbt parcela custeio')).toEqual({ hora: '', texto: 'rcbt parcela custeio' });
    expect(H('Movimento do Dia')).toEqual({ hora: '', texto: 'Movimento do Dia' });
    expect(H(null)).toEqual({ hora: '', texto: '' });
    expect(H('   ')).toEqual({ hora: '', texto: '   ' });
  });
});
