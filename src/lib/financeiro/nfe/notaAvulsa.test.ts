/**
 * NOTA-AVULSA-890-01 — a NF-e AVULSA (serie 890–899, emitida pelo fisco em nome do produtor) nao trava por "chave nao confere: CNPJ": a
 * chave traz o CNPJ do orgao emissor. Numero, serie, mes, modelo e digito seguem conferidos; a nota COMUM com o CNPJ trocado segue barrada.
 * E a remessa de entrega futura e' avisada (com a originaria citada). Molde SINTETICO.
 */
import { describe, it, expect } from 'vitest';
import { notaDoDanfe, ehSerieAvulsa, conferirChave } from './danfe';
import { danfeSinteticoAvulsa } from './__fixtures__/danfeSintetico';
import { ehRemessaDeEntregaFutura, fraseDaRemessa, originariaCitada } from './remessaEntregaFutura';

const ler = (o?: Parameters<typeof danfeSinteticoAvulsa>[0]) => { const r = notaDoDanfe(danfeSinteticoAvulsa(o)); if (r.ok === false) throw new Error(r.frase); return r; };

describe('a chave da nota avulsa', () => {
  it('serie 890: o CPF do produtor x o CNPJ do orgao na chave NAO diverge — nada barra', () => {
    const r = ler();
    expect([r.nota.serie, r.nota.emitente.documento, r.nota.chave.slice(6, 20)]).toEqual(['890', '11144477735', '11444777000161']);
    expect(r.divergencias).toEqual([]);
  });
  it('a nota COMUM (serie 10) com o CNPJ da chave trocado continua barrada por "cnpj"', () => {
    expect(ler({ serie: '10' }).divergencias).toEqual(['cnpj']);
  });
  it('na avulsa o resto continua conferido: numero trocado diverge', () => {
    const r = ler();
    expect(conferirChave({ ...r.nota, numero: '938' })).toEqual(['numero']);
    expect(conferirChave({ ...r.nota, emissao: '2026-10-16' })).toEqual(['mes']);
  });
  it('ehSerieAvulsa: so 890 a 899', () => {
    expect(['889', '890', '895', '899', '900', '1', ''].map(ehSerieAvulsa)).toEqual([false, true, true, true, false, false, false]);
  });
});

describe('a remessa de entrega futura', () => {
  it('pela natureza, com a originaria dos dados adicionais', () => {
    const r = ler();
    expect(ehRemessaDeEntregaFutura(r.nota)).toBe(true);
    expect(r.nota.informacoesComplementares).toContain('NFP ORIGINARIA Nº 123.456');
    expect(fraseDaRemessa(r.nota)).toBe('Remessa de entrega futura: confira se a nota da venda futura (originária) já foi lançada — esta pode ser só a entrega. A nota cita a originária nº 123.456.');
  });
  it('pelo CFOP da entrega (5116/5117/6116/6117); venda comum nao avisa', () => {
    expect(ehRemessaDeEntregaFutura({ naturezaOperacao: 'VENDA', cfops: ['6.116'] })).toBe(true);
    expect(ehRemessaDeEntregaFutura({ naturezaOperacao: 'Remessa de mercadoria p/ venda futura', cfops: [] })).toBe(true);
    expect(ehRemessaDeEntregaFutura({ naturezaOperacao: 'VENDA DE MERCADORIA', cfops: ['5102'] })).toBe(false);
    expect(fraseDaRemessa({ naturezaOperacao: 'VENDA', cfops: [], informacoesComplementares: null })).toBeNull();
  });
  it('originariaCitada: as formas escritas', () => {
    expect(originariaCitada('Ref. NFP originária nº 4.512 de 01/10/2026')).toBe('4.512');
    expect(originariaCitada('NOTA ORIGINARIA: 998877')).toBe('998877');
    expect(originariaCitada('sem referencia')).toBeNull();
  });
});
