/** NOTA-ITENS-SUGESTAO — a resposta da escada → a classificação de partida e a faixa da proposta da nota. PURO. Dados SINTÉTICOS. */
import { describe, it, expect } from 'vitest';
import type { ItemSugerido } from './sugestaoDosItens';
import { sugestaoParaAProposta } from './sugestaoNaProposta';

const s = (n: number, plano: string | null, sub: string | null, fonte: string, extra: Partial<ItemSugerido> = {}): ItemSugerido =>
  ({ itemId: null, nItem: n, planoContaId: plano, subcentro: sub, fonte, confianca: null, porque: '', origem: fonte, pergunta: null, ...extra });
const ITENS = [{ nItem: 1, descricao: 'AREIA GROSSA', liquidoCent: 93000 }, { nItem: 2, descricao: 'SAL MINERAL', liquidoCent: 960000 }, { nItem: 3, descricao: 'BRINCO', liquidoCent: 10000 }];
const PERG = { manutencao: { planoContaId: 'pm', subcentro: 'Manutenção' }, obra: { planoContaId: 'po', subcentro: 'Investimento' } };

describe('sugestaoParaAProposta', () => {
  it('uma conta pelos itens: classificação nela, origem "pelos itens", sem aviso de várias', () => {
    const r = sugestaoParaAProposta({ itens: [s(2, 'pn', 'Nutrição', 'mesmo_produto')], fornecedor: null }, ITENS, '2026-11-26');
    expect([r.classificacao?.plano_conta_id, r.classificacao?.subcentro, r.classificacao?.data, r.origem, r.varias]).toEqual(['pn', 'Nutrição', '2026-11-26', 'pelos itens', false]);
    expect(r.frase).toBe('Classificação sugerida pelos itens (1): Nutrição · sal mineral');
  });
  it('várias: a de MAIOR valor de partida e o aviso pequeno', () => {
    const r = sugestaoParaAProposta({ itens: [s(1, null, null, 'familia_pergunta', { pergunta: PERG }), s(2, 'pn', 'Nutrição', 'mesmo_produto'), s(3, 'pb', 'Brincos', 'mesmo_produto')], fornecedor: null }, ITENS, '2026-11-26');
    expect([r.classificacao?.plano_conta_id, r.varias, r.frase]).toEqual(['pn', true, 'A nota tem 3 itens em 2 classificações (1 a decidir: obra ou manutenção)']);
  });
  it('a nota só de material (NF de areia): sem conta de partida, a faixa diz que todos esperam', () => {
    const r = sugestaoParaAProposta({ itens: [s(1, null, null, 'familia_pergunta', { pergunta: PERG })], fornecedor: { planoContaId: 'pf', subcentro: 'Ferramentas', ultimo: '2026-08-14' } }, ITENS, '2026-11-26');
    expect([r.classificacao, r.varias, r.frase]).toEqual([null, true, 'A nota tem 1 item: espera obra ou manutenção']);
  });
  it('sem itens (NFS-e): o último deste fornecedor', () => {
    const r = sugestaoParaAProposta({ itens: [], fornecedor: { planoContaId: 'pf', subcentro: 'Ferramentas', ultimo: '2026-08-14' } }, [], '2026-11-26');
    expect([r.classificacao?.plano_conta_id, r.origem, r.frase]).toEqual(['pf', 'último deste fornecedor', 'Classificação sugerida: Ferramentas · último deste fornecedor (14/08/26)']);
  });
  it('nada = sem classificação e sem faixa; falha = a faixa diz e o campo fica vazio', () => {
    expect(sugestaoParaAProposta({ itens: [s(1, null, null, 'sem_sugestao')], fornecedor: null }, ITENS, '2026-11-26')).toMatchObject({ classificacao: null, frase: null });
    expect(sugestaoParaAProposta({ falha: 'sem rede' }, ITENS, '2026-11-26')).toMatchObject({ classificacao: null, porque: 'sem rede',
      frase: 'Não consegui verificar a sugestão da classificação: escolha a conta' });
  });
});
