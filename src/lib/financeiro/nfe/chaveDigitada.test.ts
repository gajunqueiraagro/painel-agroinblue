/**
 * P95 — DIGITAR A CHAVE (PURO). Chaves SINTETICAS (o CNPJ 11.222.333/0004-24 dos fixtures; o DV recalculado).
 *   K1 da chave so' o que ela traz; o resto em branco · K2 a recusa: curta, DV errado, NFC-e, outro modelo · K3 avulsa (890): o CNPJ do
 *   fisco nao vira o emitente · K4 o que o operador digita entra na nota e na proposta · K5 quais recusas deixam digitar
 */
import { describe, it, expect } from 'vitest';
import { FRASE_CHAVE_CURTA, FRASE_CHAVE_INVALIDA, comDadosDigitados, lidoDaChave, notaDaChaveDigitada, podeDigitarAChave } from './chaveDigitada';
import { FRASE_NOTA_SEM_CHAVE, FRASE_PDF_NAO_E_DANFE, FRASE_PDF_SEM_TEXTO, digitoDaChave } from './danfe';
import { proporLancamento } from './proporLancamento';
import { resolverEmitente } from './resolverEmitente';
import { FRASES_DE_RECUSA } from './tipos';

const comDv = (c43: string) => `${c43}${digitoDaChave(c43)}`;
const CHAVE = comDv('5026091122233300042455001000000937121753829');

function nota(texto: string) {
  const r = notaDaChaveDigitada(texto);
  if (r.ok === false) throw new Error(r.frase);
  return r;
}

describe('P95 — a nota pela chave digitada', () => {
  it('K1 da chave: CNPJ, modelo, serie, numero e o mes; valor, emissao, itens, duplicatas e destinatario em branco', () => {
    const r = nota(CHAVE.replace(/(\d{4})/g, '$1 '));
    expect([r.nota.chave, r.nota.emitente.documento, r.nota.modelo, r.nota.serie, r.nota.numero, r.mes, r.avulsa])
      .toEqual([CHAVE, '11222333000424', '55', '001', '937', '2026-09', false]);
    expect([r.nota.emissao, r.nota.totais.notaCent, r.nota.itens, r.nota.duplicatas, r.nota.destinatario.ie, r.nota.emitente.nome]).toEqual(['', 0, [], [], null, '']);
  });
  it('K2 as recusas: curta, digito errado, NFC-e (65), outro modelo', () => {
    expect(notaDaChaveDigitada(CHAVE.slice(0, 40))).toEqual({ ok: false, frase: FRASE_CHAVE_CURTA });
    expect(notaDaChaveDigitada(`${CHAVE.slice(0, 43)}${(Number(CHAVE[43]) + 1) % 10}`)).toEqual({ ok: false, frase: FRASE_CHAVE_INVALIDA });
    expect(notaDaChaveDigitada(comDv('5026091122233300042465001000000937121753829'))).toEqual({ ok: false, frase: FRASES_DE_RECUSA.nfce });
    expect(notaDaChaveDigitada(comDv('5026091122233300042457001000000937121753829'))).toEqual({ ok: false, frase: FRASES_DE_RECUSA.nfse_ou_desconhecido });
  });
  it('K3 avulsa (serie 890): o CNPJ da chave e\' do fisco — o emitente fica sem documento e o fornecedor nao e\' achado por ele', () => {
    const r = nota(comDv('5026091122233300042455890000000937121753829'));
    expect([r.avulsa, r.nota.emitente.documento, r.nota.serie]).toEqual([true, '', '890']);
    const forn = { id: 'f1', nome: 'Agro Sintetica', cpf_cnpj: '11.222.333/0004-24', ativo: true };
    expect(resolverEmitente(r.nota.emitente, [forn], null).propostoId).toBeNull();
    expect(resolverEmitente(nota(CHAVE).nota.emitente, [forn], null).propostoId).toBe('f1');
  });
  it('K4 o que o operador digita (emissao, valor) entra na nota e na proposta (competencia, documento)', () => {
    const r = nota(CHAVE);
    const lido = lidoDaChave(r.nota, []);
    const p = proporLancamento({ nota: r.nota, avisosDoLeitor: lido.avisos, fazendas: [], emitente: resolverEmitente(r.nota.emitente, [], null), favorecidoId: null, ultima: null });
    if (p.ok === false) throw new Error(p.frase);
    const doXml = { proposta: p.proposta, emitenteNome: '', emitenteDocumento: r.nota.emitente.documento, resolucao: resolverEmitente(r.nota.emitente, [], null), ocorrencias: [],
      arquivo: new File([], 'n.pdf') };
    const x = comDadosDigitados({ lido, doXml }, { emissao: '2026-09-06', valorCent: 123450 });
    expect([x.lido.nota.emissao, x.lido.nota.totais.notaCent, x.doXml.proposta.competencia, x.doXml.proposta.valorCent,
      x.doXml.proposta.documento.dataEmissao, x.doXml.proposta.documento.valorCent, x.lido.pelaChave]).toEqual(['2026-09-06', 123450, '2026-09-06', 123450, '2026-09-06', 123450, true]);
    expect(lido.nota.emissao).toBe('');
  });
  it('K5 so\' a nota sem chave e o PDF sem texto deixam digitar a chave', () => {
    expect([podeDigitarAChave(FRASE_NOTA_SEM_CHAVE), podeDigitarAChave(FRASE_PDF_SEM_TEXTO), podeDigitarAChave(FRASE_PDF_NAO_E_DANFE), podeDigitarAChave(null)])
      .toEqual([true, true, false, false]);
  });
});
