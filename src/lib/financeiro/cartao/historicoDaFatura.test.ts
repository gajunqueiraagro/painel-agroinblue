/**
 * CARTAO-FATURA-IMPORT-01 — o que a prévia lê do sistema (puro). Dado SINTÉTICO.
 */
import { describe, expect, it } from 'vitest';
import { janelaDaFatura, lancamentoDoBanco, MAX_TERMOS, sugestaoPeloHistorico, termosDoHistorico } from './historicoDaFatura';
import type { LinhaDaFatura } from './lerFaturaOurocard';

const linha = (descricao: string, o: Partial<LinhaDaFatura> = {}): LinhaDaFatura => ({
  ordem: 1, secao: 'Serviços', dataCompra: '2031-09-04', descricao, pais: 'BR', valorCent: 15600, parcela: null, exterior: null, tipo: 'compra',
  titular: null, finalCartao: null, ...o,
});

describe('a janela, a linha do banco e os termos', () => {
  it('H1 a janela: vencimento −60 / +40 dias e o histórico de 12 meses; sem vencimento = nada', () => {
    expect(janelaDaFatura({ vencimento: '2031-10-16' })).toEqual({ de: '2031-08-17', ate: '2031-11-25', historicoDe: '2030-10-16' });
    expect(janelaDaFatura({ vencimento: null })).toBeNull();
  });
  it('H2 só SAÍDA vira candidato, em centavos inteiros; sem conta = fora', () => {
    const base = { id: 'x', conta_bancaria_id: 'k', data_vencimento: '2031-10-16', data_competencia: '2031-09-04', valor: '156.1', descricao: 'Loja',
      favorecido_id: 'f1', status_transacao: 'programado', tipo_operacao: '2-Saídas' };
    expect(lancamentoDoBanco(base, () => 'LOJA EXEMPLO LTDA')).toMatchObject({ valorCent: 15610, fornecedor: 'LOJA EXEMPLO LTDA', contaId: 'k' });
    expect(lancamentoDoBanco({ ...base, tipo_operacao: '1-Entradas' }, () => null)).toBeNull();
    expect(lancamentoDoBanco({ ...base, conta_bancaria_id: null }, () => null)).toBeNull();
    /* CARTAO-FATURA-GRAVAR: o `updated_at` lido vai inteiro (a string do banco) — é o `lido_em` do mover/ajustar */
    expect(lancamentoDoBanco({ ...base, updated_at: '2031-10-01T12:34:56.789123+00:00' }, () => null)?.atualizadoEm).toBe('2031-10-01T12:34:56.789123+00:00');
    expect(lancamentoDoBanco(base, () => null)?.atualizadoEm).toBeNull();
  });
  it('H2b a parcela COM ELO (financiamento_id) lê o "k/N" da descrição; sem elo fica sem parcela (a regra de 12/11 a trata como solta)', () => {
    const base = { id: 'x', conta_bancaria_id: 'k', data_vencimento: '2031-10-16', data_competencia: '2031-05-02', valor: 860, descricao: 'Maquinas Exemplo 3/4',
      favorecido_id: null, status_transacao: 'programado', tipo_operacao: '2-Saídas' };
    expect(lancamentoDoBanco({ ...base, financiamento_id: 'fin1' }, () => null)?.parcela).toEqual({ k: 3, n: 4 });
    expect(lancamentoDoBanco(base, () => null)?.parcela).toBeNull();
  });
  it('H3 os termos: das compras (nunca do pagamento/estorno), sem repetir, com teto', () => {
    const t = termosDoHistorico([linha('PADARIA CENTRAL'), linha('PGTO DEBITO CONTA', { tipo: 'pagamento' }), linha('PADARIA NORTE')]);
    expect(t).toEqual(['padaria', 'central', 'norte']);
    const muitas = Array.from({ length: 60 }, (_, i) => linha(`LOJA${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}xx`));
    expect(termosDoHistorico(muitas)).toHaveLength(MAX_TERMOS);
  });
});

describe('a sugestão pelo histórico', () => {
  const rotulo = (id: string) => ({ p1: 'Combustível', p2: 'Peças' }[id] ?? null);
  it('H4 a MAIORIA ESTRITA do mesmo estabelecimento sugere; outro estabelecimento não conta', () => {
    const s = sugestaoPeloHistorico([
      { descricao: 'Posto Avenida', fornecedor: null, planoContaId: 'p1' }, { descricao: 'POSTO AVENIDA', fornecedor: null, planoContaId: 'p1' },
      { descricao: 'Posto Avenida', fornecedor: null, planoContaId: 'p2' }, { descricao: 'Ferragem', fornecedor: null, planoContaId: 'p2' },
    ], rotulo);
    expect(s(linha('POSTO AVENIDA CAMPO GRANDE'))).toEqual({ planoContaId: 'p1', rotulo: 'Combustível', fazendaId: null });
  });
  it('H8 (CARTAO-FATURA-GRAVAR D1) a FAZENDA da sugestão = a maioria estrita dos mesmos casos COM ESSA CONTA; misto = sem fazenda', () => {
    const caso = (planoContaId: string, fazendaId: string | null) => ({ descricao: 'Posto Avenida', fornecedor: null, planoContaId, fazendaId });
    const s = sugestaoPeloHistorico([caso('p1', 'faz-a'), caso('p1', 'faz-a'), caso('p1', 'faz-b'), caso('p2', 'faz-b')], rotulo);
    expect(s(linha('POSTO AVENIDA'))).toEqual({ planoContaId: 'p1', rotulo: 'Combustível', fazendaId: 'faz-a' });
    const misto = sugestaoPeloHistorico([caso('p1', 'faz-a'), caso('p1', 'faz-b'), caso('p1', null)], rotulo);
    expect(misto(linha('POSTO AVENIDA'))?.fazendaId).toBeNull();
    /* metade não é maioria */
    expect(sugestaoPeloHistorico([caso('p1', 'faz-a'), caso('p1', null)], rotulo)(linha('POSTO AVENIDA'))?.fazendaId).toBeNull();
  });
  it('H5 histórico MISTO (empate) = sem sugestão; nada no histórico = sem sugestão; conta fora do plano = sem sugestão', () => {
    const misto = sugestaoPeloHistorico([
      { descricao: 'Mercado Exemplo', fornecedor: null, planoContaId: 'p1' }, { descricao: 'Mercado Exemplo', fornecedor: null, planoContaId: 'p2' },
    ], rotulo);
    expect(misto(linha('MERCADO EXEMPLO'))).toBeNull();
    expect(misto(linha('OUTRA COISA'))).toBeNull();
    expect(sugestaoPeloHistorico([{ descricao: 'Loja Zeta', fornecedor: null, planoContaId: 'p9' }], rotulo)(linha('LOJA ZETA'))).toBeNull();
  });
  it('H7 a palavra COMUM sozinha não sugere: precisa da 1ª palavra do estabelecimento; vence quem divide mais palavras (o achado da bancada)', () => {
    const h = [
      { descricao: 'Supermercado exemplo', fornecedor: null, planoContaId: 'p1' }, { descricao: 'Supermercado exemplo', fornecedor: null, planoContaId: 'p1' },
      /* a mais fraca ANTES: quem divide mais palavras tem de desbancar a que já estava */
      { descricao: 'Nutrição bovina', fornecedor: null, planoContaId: 'p1' }, { descricao: 'Nutrição animal exemplo', fornecedor: null, planoContaId: 'p2' },
    ];
    const s = sugestaoPeloHistorico(h, rotulo);
    expect(s(linha('NUTRICAO ANIMAL EXEMPLO'))?.planoContaId).toBe('p2');
    expect(s(linha('AUTO ELETRICA EXEMPLO'))).toBeNull();
  });
  it('H6 o nome do FORNECEDOR também casa (a descrição do lançamento diz outra coisa)', () => {
    const s = sugestaoPeloHistorico([{ descricao: 'combustível da caminhonete', fornecedor: 'AUTO POSTO TREVO', planoContaId: 'p1' }], rotulo);
    expect(s(linha('POSTO TREVO'))?.planoContaId).toBe('p1');
  });
});
