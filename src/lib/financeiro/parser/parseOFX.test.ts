import { describe, it, expect } from 'vitest';
import { parseOFX, lerSaldoDeclaradoOFX } from './parseOFX';

/**
 * parseOFX — o saldo declarado pelo banco e a fronteira que o separa dos
 * movimentos. FIN-OFX-PARSER-TEST-01.
 *
 * ⚠ ESTE ARQUIVO EXISTE POR CAUSA DE UMA ARMADILHA, e ela não é hipotética:
 * `BALAMT` e `DTASOF` aparecem TANTO em `<LEDGERBAL>` (saldo contábil, o que o
 * banco afirma) QUANTO em `<AVAILBAL>` (saldo disponível, que inclui limite).
 * Um `content.match(/<BALAMT>/)` solto pega o bloco que vier primeiro no
 * arquivo — e mostraria como "declarado pelo banco" um número que o banco
 * declarou para outra coisa. Todos os fixtures abaixo põem o `AVAILBAL` ANTES
 * do `LEDGERBAL` de propósito: se alguém trocar o isolamento de bloco por uma
 * busca no documento inteiro, os testes caem com o 999999.99 na mão.
 *
 * ⚠ E A FRONTEIRA VALE NOS DOIS SENTIDOS: nenhum valor de saldo pode virar
 * transação. `parseOFX` só lê dentro de `<STMTTRN>…</STMTTRN>`, e a contagem de
 * movimentos é verificada em TODOS os casos — inclusive nos que têm dois blocos
 * de saldo com valores altos. É o mesmo descuido que produziu a transação de
 * R$ 5,4M no importador velho, vigiado por construção.
 */

/**
 * OFX 1.x SGML — o formato da maioria dos bancos BR.
 * As tags-folha (`<TRNAMT>`, `<BALAMT>`) não fecham; os agrupadores
 * (`<STMTTRN>`, `<AVAILBAL>`) fecham. O `LEDGERBAL` daqui fica deliberadamente
 * SEM fecho, terminando junto do bloco: é o caso truncado, e ainda assim tem
 * de render saldo.
 */
const SGML = `
OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<DTSTART>20260801
<DTEND>20260831
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260803<TRNAMT>-1500.00<FITID>A1<MEMO>PAGTO RACAO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260815<TRNAMT>2000.50<FITID>A2<MEMO>DEPOSITO</STMTTRN>
</BANKTRANLIST>
<AVAILBAL><BALAMT>999999.99<DTASOF>20260101</AVAILBAL>
<LEDGERBAL><BALAMT>12345.67<DTASOF>20260831
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

/** OFX 2.x XML — tudo fechado, inclusive as folhas. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<DTSTART>20260801</DTSTART>
<DTEND>20260831</DTEND>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260803</DTPOSTED><TRNAMT>-1500.00</TRNAMT><FITID>A1</FITID><MEMO>PAGTO RACAO</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260815</DTPOSTED><TRNAMT>2000.50</TRNAMT><FITID>A2</FITID><MEMO>DEPOSITO</MEMO></STMTTRN>
</BANKTRANLIST>
<AVAILBAL><BALAMT>999999.99</BALAMT><DTASOF>20260101</DTASOF></AVAILBAL>
<LEDGERBAL><BALAMT>-88.10</BALAMT><DTASOF>20260731</DTASOF></LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

/** O mesmo SGML sem NENHUM bloco de saldo — o banco não declarou nada. */
const SEM_SALDO = SGML
  .replace(/<AVAILBAL>[\s\S]*?<\/AVAILBAL>/, '')
  .replace(/<LEDGERBAL>[\s\S]*?20260831/, '');

describe('parseOFX — movimentos', () => {
  it('SGML: lê os dois STMTTRN com valor e sinal do TRNAMT', () => {
    const movs = parseOFX(SGML);
    expect(movs.map((m) => m.valor)).toEqual([-1500, 2000.5]);
    expect(movs.map((m) => m.data)).toEqual(['2026-08-03', '2026-08-15']);
    expect(movs.map((m) => m.tipo)).toEqual(['debito', 'credito']);
    expect(movs.map((m) => m.descricao)).toEqual(['PAGTO RACAO', 'DEPOSITO']);
  });

  it('XML 2.x: mesmo resultado com todas as tags fechadas', () => {
    const movs = parseOFX(XML);
    expect(movs.map((m) => m.valor)).toEqual([-1500, 2000.5]);
    expect(movs.map((m) => m.data)).toEqual(['2026-08-03', '2026-08-15']);
  });

  it('NENHUM SALDO VIRA MOVIMENTO — a contagem não se mexe com ou sem os blocos de saldo', () => {
    // Dois blocos de saldo presentes, um só, nenhum: sempre os mesmos 2 movimentos.
    expect(parseOFX(SGML)).toHaveLength(2);
    expect(parseOFX(XML)).toHaveLength(2);
    expect(parseOFX(SEM_SALDO)).toHaveLength(2);
    // E nenhum valor de saldo aparece entre os movimentos.
    const valores = [...parseOFX(SGML), ...parseOFX(XML)].map((m) => m.valor);
    expect(valores).not.toContain(999999.99);
    expect(valores).not.toContain(12345.67);
    expect(valores).not.toContain(-88.1);
  });
});

describe('lerSaldoDeclaradoOFX — o saldo é do banco, e é o do bloco certo', () => {
  it('SGML: lê BALAMT e DTASOF de dentro do LEDGERBAL', () => {
    expect(lerSaldoDeclaradoOFX(SGML)).toEqual({
      saldoDeclarado: 12345.67,
      saldoData: '2026-08-31',
    });
  });

  it('XML: idem, e o saldo negativo mantém o sinal', () => {
    expect(lerSaldoDeclaradoOFX(XML)).toEqual({
      saldoDeclarado: -88.1,
      saldoData: '2026-07-31',
    });
  });

  it('O AVAILBAL NÃO VAZA, mesmo aparecendo antes no arquivo', () => {
    // Este é o teste que justifica o arquivo: 999999.99 e 2026-01-01 estão nos
    // dois fixtures, ANTES do LEDGERBAL, e não podem sair daqui.
    for (const conteudo of [SGML, XML]) {
      const saldo = lerSaldoDeclaradoOFX(conteudo);
      expect(saldo?.saldoDeclarado).not.toBe(999999.99);
      expect(saldo?.saldoData).not.toBe('2026-01-01');
    }
  });

  it('sem LEDGERBAL → null, NUNCA zero (ausência não é valor)', () => {
    const saldo = lerSaldoDeclaradoOFX(SEM_SALDO);
    expect(saldo).toBeNull();
    // A distinção que a tela depende: null vira traço; 0 viraria "R$ 0,00".
    expect(saldo).not.toEqual({ saldoDeclarado: 0, saldoData: null });
  });

  it('truncado no meio do bloco (sem </LEDGERBAL>) → ainda lê', () => {
    expect(lerSaldoDeclaradoOFX('<LEDGERBAL><BALAMT>10.00<DTASOF>20260831')).toEqual({
      saldoDeclarado: 10,
      saldoData: '2026-08-31',
    });
  });

  it('BALAMT ausente ou ilegível → null, e não NaN', () => {
    expect(lerSaldoDeclaradoOFX('<LEDGERBAL><DTASOF>20260831</LEDGERBAL>')).toBeNull();
    expect(lerSaldoDeclaradoOFX('<LEDGERBAL><BALAMT>abc</LEDGERBAL>')).toBeNull();
  });

  it('vírgula decimal (banco que escreve à brasileira) → converte', () => {
    expect(lerSaldoDeclaradoOFX('<LEDGERBAL><BALAMT>1234,56<DTASOF>20260831</LEDGERBAL>')).toEqual({
      saldoDeclarado: 1234.56,
      saldoData: '2026-08-31',
    });
  });

  it('DTASOF ausente → saldo lido, data null (um sem o outro é possível)', () => {
    expect(lerSaldoDeclaradoOFX('<LEDGERBAL><BALAMT>99.90</LEDGERBAL>')).toEqual({
      saldoDeclarado: 99.9,
      saldoData: null,
    });
  });
});
