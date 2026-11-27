/**
 * BOLETO-DDA-API-01 · D1b — o leitor do boleto por POSIÇÃO. Boletos SINTÉTICOS (itens com x/y montados aqui, nos arranjos medidos
 * nos reais na FASE 0: rótulo com o valor embaixo, rótulo e valor no mesmo item, recibo + ficha repetindo os rótulos).
 * Os documentos são de exemplo com DV certo (11.222.333/0001-81, 11.444.777/0001-61, 111.444.777-35, o alfanumérico da Receita).
 */
import { describe, it, expect, vi } from 'vitest';
import type { ItemDoDanfe } from '@/lib/financeiro/nfe/danfe';
import {
  lerBoleto, lerBoletos, lerBoletoDoArquivo, documentoValido, documentosDoTexto, sugestoesDeSenha, paraEntrada,
  FRASE_SENHA, FRASE_SENHA_ERRADA,
} from './lerBoleto';

const it_ = (str: string, x: number, y: number): ItemDoDanfe => ({ str, x, y, w: 0, h: 9 });
const LINHA = '34191.09008 04881.820049 19646.100008 8 16110000300650';
const CNPJ_A = '11.222.333/0001-81';
const CNPJ_B = '11.444.777/0001-61';
const CPF = '111.444.777-35';

describe('documento com DV certo', () => {
  it('CPF, CNPJ numérico e CNPJ alfanumérico (Receita, jul/2026); DV errado e repetidos não', () => {
    expect([CNPJ_A, CNPJ_B, CPF, '12.ABC.345/01DE-35'].map(documentoValido)).toEqual([true, true, true, true]);
    expect(['11.222.333/0001-82', '111.444.777-36', '00.000.000/0000-00', '111.111.111-11', '1234'].map(documentoValido))
      .toEqual([false, false, false, false, false]);
  });

  it('do texto: o pontuado, ou o solto quando o item é SÓ o número; pedaço de número maior nunca', () => {
    expect(documentosDoTexto(`AGRO LTDA CNPJ ${CNPJ_A}`)).toEqual(['11222333000181']);
    expect(documentosDoTexto(' 11222333000181 ')).toEqual(['11222333000181']);
    expect(documentosDoTexto('00011222333000181999')).toEqual([]);
    expect(documentosDoTexto('CNPJ 11.222.333/0001-82')).toEqual([]);
  });
});

describe('o leitor por posição', () => {
  it('rótulo com o valor embaixo: beneficiário e pagador, nome e documento; a linha conferida', () => {
    const l = lerBoleto([[
      it_('Beneficiário', 40, 700), it_(`AGRO INSUMOS SINTETICO LTDA - CNPJ ${CNPJ_A}`, 40, 688),
      it_('Pagador', 40, 600), it_(`FAZENDA TESTE   CPF ${CPF}`, 40, 588),
      it_(LINHA, 200, 500),
    ]]);
    expect(l.boleto?.codigo_barras).toBe('34198161100003006501090004881820041964610000');
    expect(l.beneficiario).toEqual({ documento: '11222333000181', nome: 'AGRO INSUMOS SINTETICO LTDA', confira: false });
    expect(l.pagador).toEqual({ documento: '11144477735', nome: 'FAZENDA TESTE', confira: false });
  });

  it('rótulo e valor no mesmo item ("Beneficiário: …"), e o documento ao lado na mesma linha', () => {
    const l = lerBoleto([[
      it_('Beneficiário: AGRO INSUMOS SINTETICO LTDA', 40, 700), it_(CNPJ_A, 330, 700),
      it_(`Pagador: FAZENDA TESTE - ${CPF}`, 40, 650),
    ]]);
    expect(l.beneficiario).toMatchObject({ documento: '11222333000181', nome: 'AGRO INSUMOS SINTETICO LTDA' });
    expect(l.pagador.documento).toBe('11144477735');
  });

  it('cabeçalho lado a lado (Beneficiário | Pagador) com os documentos embaixo de cada um: cada um pega o seu', () => {
    const l = lerBoleto([[
      it_('Beneficiário', 40, 700), it_('Pagador', 320, 700),
      it_(CNPJ_A, 40, 688), it_(CPF, 320, 688),
    ]]);
    expect([l.beneficiario.documento, l.pagador.documento]).toEqual(['11222333000181', '11144477735']);
  });

  it('recibo do pagador + ficha de compensação (os rótulos repetidos, em páginas/alturas diferentes) dão o mesmo resultado', () => {
    const l = lerBoleto([
      [it_('Beneficiário', 40, 780), it_(CNPJ_A, 40, 768), it_('Pagador', 40, 740), it_(CPF, 40, 728)],
      [it_('Pagador', 40, 300), it_(CPF, 40, 288), it_('Beneficiário', 40, 200), it_(CNPJ_A, 40, 188)],
    ]);
    expect([l.beneficiario.documento, l.pagador.documento, l.beneficiario.confira]).toEqual(['11222333000181', '11144477735', false]);
  });

  it('AMBÍGUO: o recibo e a ficha dão CNPJs diferentes para o beneficiário → null + confira (nunca chutar)', () => {
    const l = lerBoleto([[
      it_('Beneficiário', 40, 780), it_(CNPJ_A, 40, 768),
      it_('Beneficiário', 40, 300), it_(CNPJ_B, 40, 288),
    ]]);
    expect(l.beneficiario).toMatchObject({ documento: null, confira: true });
  });

  it('o MESMO documento junto dos dois rótulos não é de nenhum (confira nos dois)', () => {
    const l = lerBoleto([[it_('Beneficiário', 40, 700), it_('Pagador', 40, 690), it_(CNPJ_A, 40, 680)]]);
    expect([l.beneficiario.documento, l.pagador.documento, l.beneficiario.confira, l.pagador.confira]).toEqual([null, null, true, true]);
  });

  it('o documento do outro lado não apaga o meu quando eu tenho mais de um (o beneficiário vê o do pagador também)', () => {
    const l = lerBoleto([[
      it_('Beneficiário', 40, 780), it_(CNPJ_A, 40, 768),
      it_('Beneficiário', 40, 500), it_(CPF, 40, 488), it_('Pagador', 40, 476), it_(CPF, 40, 464),
    ]]);
    expect([l.beneficiario.documento, l.pagador.documento]).toEqual(['11222333000181', null]);
  });

  it('a frase que só CITA "o beneficiário" não é rótulo; "CPF/CNPJ do Pagador" é', () => {
    const l = lerBoleto([[
      it_('Em caso de dúvida, o pagador deve procurar o beneficiário antes do vencimento', 40, 700), it_(CNPJ_B, 40, 690),
      it_('CPF/CNPJ do Pagador', 40, 600), it_(CPF, 40, 590),
    ]]);
    expect([l.beneficiario.documento, l.beneficiario.confira, l.pagador.documento]).toEqual([null, false, '11144477735']);
  });

  it('o documento na mesma linha do rótulo, a ~316 pt (medido num real), ainda é dele; a 400 pt não', () => {
    expect(lerBoleto([[it_('Beneficiário', 22, 776), it_(CNPJ_A, 338, 767)]]).beneficiario.documento).toBe('11222333000181');
    expect(lerBoleto([[it_('Beneficiário', 22, 776), it_(CNPJ_A, 422, 767)]]).beneficiario.documento).toBeNull();
  });

  it('DV errado não conta; o certo logo depois vale', () => {
    const l = lerBoleto([[it_('Beneficiário', 40, 700), it_('11.222.333/0001-82', 40, 690), it_(CNPJ_A, 40, 680)]]);
    expect(l.beneficiario.documento).toBe('11222333000181');
  });

  it('"Beneficiário final", "Sacador/Avalista" e "Agência/Código do Beneficiário" não são rótulo do beneficiário', () => {
    const l = lerBoleto([[
      it_('Beneficiário final', 40, 700), it_(CNPJ_B, 40, 690),
      it_('Agência/Código do Beneficiário', 300, 600), it_(CNPJ_B, 300, 590),
      it_('Sacador/Avalista', 40, 500), it_(CNPJ_B, 40, 490),
    ]]);
    expect(l.beneficiario).toEqual({ documento: null, nome: null, confira: false });
  });

  it('longe do rótulo (mais de ~3 linhas abaixo, outra página, ou acima) não é dele', () => {
    const l = lerBoleto([
      [it_('Beneficiário', 40, 700), it_(CNPJ_A, 40, 640), it_(CNPJ_B, 40, 720)],
      [it_(CPF, 40, 690)],
    ]);
    expect(l.beneficiario).toMatchObject({ documento: null, confira: true });
  });

  it('a leitura vira o p_leitura da fn_boleto_entrar (vazio não vai)', () => {
    const l = lerBoleto([[it_('Beneficiário', 40, 700), it_(`AGRO LTDA ${CNPJ_A}`, 40, 690), it_(LINHA, 40, 500)]]);
    if (!l.boleto) throw new Error('sem linha');
    expect(paraEntrada({ ...l, boleto: l.boleto }, 'pdf', 'Boleto.PDF')).toEqual({
      linha: '34191090080488182004919646100008816110000300650', origem: 'pdf', arquivo_nome: 'Boleto.PDF', arquivo_extensao: 'pdf',
      beneficiario_nome: 'AGRO LTDA', beneficiario_documento: '11222333000181',
    });
  });
});

describe('o PDF com senha', () => {
  const pdfjsQue = (falha: { name: string; code: number } | null) => {
    const getDocument = vi.fn((_src: { data: Uint8Array; password?: string }) => ({
      promise: falha ? Promise.reject(Object.assign(new Error('x'), falha)) : Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 595, height: 842 }),
          getTextContent: async () => ({ items: [{ str: 'Beneficiário', transform: [1, 0, 0, 1, 40, 700] }, { str: CNPJ_A, transform: [1, 0, 0, 1, 40, 690] }] }),
        }),
      }),
    }));
    return { getDocument };
  };

  it('sem senha: motivo "senha" e a frase pede a senha', async () => {
    expect(await lerBoletoDoArquivo(new ArrayBuffer(8), { pdfjs: pdfjsQue({ name: 'PasswordException', code: 1 }) }))
      .toEqual({ ok: false, motivo: 'senha', frase: FRASE_SENHA });
  });

  it('senha errada: motivo próprio', async () => {
    expect(await lerBoletoDoArquivo(new ArrayBuffer(8), { senha: '12345', pdfjs: pdfjsQue({ name: 'PasswordException', code: 2 }) }))
      .toEqual({ ok: false, motivo: 'senha_errada', frase: FRASE_SENHA_ERRADA });
  });

  it('com a senha: ela vai ao pdfjs (e só a ele) e o boleto é lido', async () => {
    const pdfjs = pdfjsQue(null);
    const r = await lerBoletoDoArquivo(new ArrayBuffer(8), { senha: '11222', pdfjs });
    expect(pdfjs.getDocument.mock.calls[0][0].password).toBe('11222');
    expect(r.ok && r.leitura.beneficiario.documento).toBe('11222333000181');
  });

  it('sem senha dada, o pdfjs não recebe "password"', async () => {
    const pdfjs = pdfjsQue(null);
    await lerBoletoDoArquivo(new ArrayBuffer(8), { pdfjs });
    expect('password' in pdfjs.getDocument.mock.calls[0][0]).toBe(false);
  });

  it('as sugestões são os 5 primeiros dígitos de cada documento do cliente, sem repetir', () => {
    expect(sugestoesDeSenha([CPF, CNPJ_A, '111.444.000-00', null, '12'])).toEqual(['11144', '11222']);
  });
});

/* BOLETO-SEPARAR-01 — em que página está cada boleto (a divisão do PDF usa) */
describe('a página de cada boleto', () => {
  const LINHA_2 = '34191.09008 04882.240049 19646.100008 6 17370000300650';
  it('capa sem boleto + 1 boleto por página: cada um na sua página, o total do PDF', () => {
    const l = lerBoletos([[it_('AVISO DE COBRANCA', 40, 700)], [it_(LINHA, 200, 500)], [it_(LINHA_2, 200, 500)]]);
    expect(l.boletos.map((b) => b.linha)).toEqual([LINHA, LINHA_2].map((x) => x.replace(/\D/g, '')));
    expect([l.paginaDeCada, l.totalDePaginas]).toEqual([[2, 3], 3]);
  });
  it('a mesma linha no recibo e na ficha conta uma vez, na 1ª página em que aparece; 2 boletos na mesma página = a mesma página', () => {
    expect(lerBoletos([[it_(LINHA, 200, 700)], [it_(LINHA, 200, 500)]]).paginaDeCada).toEqual([1]);
    expect(lerBoletos([[it_(LINHA, 200, 700), it_(LINHA_2, 200, 300)]]).paginaDeCada).toEqual([1, 1]);
  });
});

describe('o vencimento IMPRESSO da arrecadação (FOLHA-VERA-PACOTE-01: o DARF entrava sem vencimento)', () => {
  /* a arrecadação sintética do linhaDigitavelDv.test (DV certo); o código dela não tem vencimento */
  const ARR = '81660000001-1 23450001111-4 22223333444-0 45555666677-0';
  const darf = (extra: ItemDoDanfe[] = []) => [
    it_('Período de Apuração', 40, 760), it_('Data de Vencimento', 200, 760), it_('Número do Documento', 360, 760),
    it_('Pagar este documento até', 520, 770), it_('Março/2026', 40, 748), it_('20/04/2026', 200, 748), it_('07.00.00000.0000000-0', 360, 748),
    it_('20/04/2026', 520, 755), it_('PA:03/2026', 40, 500), it_('Vencimento:20/04/2026', 120, 500), it_(ARR, 40, 300),
    it_('Pagar até:', 40, 200), it_('20/04/2026', 120, 200), ...extra,
  ];

  it('DARF: "Data de Vencimento" (embaixo), "Pagar este documento até", "Vencimento:" no item e "Pagar até:" ao lado — a mesma data', () => {
    const l = lerBoleto([darf()]);
    expect(l.boleto).toMatchObject({ tipo: 'arrecadacao', vencimento: '2026-04-20' });
    expect(lerBoletos([darf()]).boletos.map((b) => b.vencimento)).toEqual(['2026-04-20']);
  });

  it('DAS: só "Pagar este documento até" com a data embaixo', () => {
    expect(lerBoleto([[it_('Pagar este documento até', 40, 400), it_('31/03/2026', 40, 388), it_(ARR, 40, 300)]]).boleto?.vencimento).toBe('2026-03-31');
  });

  it('duas datas diferentes nos rótulos = null (nunca chutar); data que não existe também; sem rótulo, null', () => {
    expect(lerBoleto([darf([it_('Vencimento: 21/04/2026', 40, 100)])]).boleto?.vencimento).toBeNull();
    expect(lerBoleto([[it_('Vencimento', 40, 400), it_('31/02/2026', 40, 390), it_(ARR, 40, 300)]]).boleto?.vencimento).toBeNull();
    expect(lerBoleto([[it_('Emitido em 20/04/2026', 40, 400), it_(ARR, 40, 300)]]).boleto?.vencimento).toBeNull();
  });

  it('a data longe do rótulo (mais de ~3 linhas abaixo) não é dele', () => {
    expect(lerBoleto([[it_('Vencimento', 40, 400), it_('20/04/2026', 40, 300), it_(ARR, 40, 200)]]).boleto?.vencimento).toBeNull();
  });

  it('no PDF de várias páginas, vale a página do boleto (a capa com outra data não conta)', () => {
    const capa = [it_('Vencimento', 40, 400), it_('10/01/2026', 40, 390)];
    expect(lerBoletos([capa, darf()]).boletos.map((b) => b.vencimento)).toEqual(['2026-04-20']);
  });

  it('o bancário não muda: o vencimento é o do fator, nunca o impresso', () => {
    const l = lerBoleto([[it_('Vencimento', 40, 400), it_('01/01/2030', 40, 390), it_(LINHA, 200, 300)]]);
    expect(l.boleto?.tipo).toBe('bancario');
    expect(l.boleto?.vencimento).not.toBe('2030-01-01');
  });

  it('o p_leitura leva o vencimento impresso da arrecadação (o banco só o usa quando o código não tem)', () => {
    const l = lerBoleto([darf()]);
    if (!l.boleto) throw new Error('sem boleto');
    expect(paraEntrada({ ...l, boleto: l.boleto }, 'email', 'darf.pdf')).toMatchObject({ vencimento: '2026-04-20' });
    const sem = { ...l, boleto: { ...l.boleto, vencimento: null } };
    expect(paraEntrada(sem, 'email', 'darf.pdf')).not.toHaveProperty('vencimento');
  });
});
