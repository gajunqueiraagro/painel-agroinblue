/**
 * O que este teste trava — a safra que a tela SUGERE, e os casos em que ela se cala.
 *
 * ⚠ A REGRA É A DO CADASTRO: temporada de julho a junho. Um custeio de junho/2026 é da
 * safra 25/26; o de julho/2026 já é da 26/27. Errar isto joga o custo de uma safra na
 * seguinte, e o resultado por safra — que é a razão do fechamento agrícola existir —
 * passa a comparar coisas diferentes.
 * ⚠ E `null` É RESPOSTA. Sem safra cadastrada, com escopo desconhecido ou com empate real
 * entre culturas, o campo fica vazio para o operador escolher. Chutar seria pior: ninguém
 * revisa um campo que já veio preenchido.
 */
import { describe, it, expect } from 'vitest';
import { safraSugerida, type SafraCandidata } from './safraSugerida';

const PEC_2526: SafraCandidata = { id: 'p1', codigo: '25/26-Pec', escopo_negocio: 'pecuaria', ativa: true };
const PEC_2627: SafraCandidata = { id: 'p2', codigo: '26/27-Pec', escopo_negocio: 'pecuaria', ativa: true };
const AMD_2627: SafraCandidata = { id: 'a1', codigo: '26/27-AMD', escopo_negocio: 'agricultura', ativa: true };
const MAND_2627: SafraCandidata = { id: 'a2', codigo: '26/27-MAND', escopo_negocio: 'agricultura', ativa: true };
const TODAS = [PEC_2526, PEC_2627, AMD_2627, MAND_2627];

describe('safraSugerida', () => {
  it('⚠ a virada é em JULHO, não em janeiro', () => {
    expect(safraSugerida('2026-06-30', 'pecuaria', TODAS)).toBe('p1');   // 25/26
    expect(safraSugerida('2026-07-01', 'pecuaria', TODAS)).toBe('p2');   // 26/27
  });

  it('o caso do Raul: custeio de agosto/2026, pecuária → 26/27-Pec', () => {
    expect(safraSugerida('2026-08-31', 'pecuaria', TODAS)).toBe('p2');
  });

  it('respeita o escopo — não oferece safra de agricultura para custeio de pecuária', () => {
    expect(safraSugerida('2026-08-31', 'agricultura', [PEC_2627])).toBeNull();
  });

  it('⚠ agricultura com duas culturas escolhe amendoim, a principal do cliente', () => {
    expect(safraSugerida('2026-08-31', 'agricultura', TODAS)).toBe('a1');
  });

  it('⚠ mas sem nenhuma cultura conhecida devolve null, não a primeira da lista', () => {
    /* Chutar pela ordem do banco faria a sugestão mudar sozinha quando alguém
       reordenasse o cadastro — o pior tipo de erro: intermitente e invisível. */
    const estranhas: SafraCandidata[] = [
      { id: 'x1', codigo: '26/27-ZZZ', escopo_negocio: 'agricultura', ativa: true },
      { id: 'x2', codigo: '26/27-YYY', escopo_negocio: 'agricultura', ativa: true },
    ];
    expect(safraSugerida('2026-08-31', 'agricultura', estranhas)).toBeNull();
  });

  it('safra inativa não é sugerida', () => {
    const inativa = [{ ...PEC_2627, ativa: false }];
    expect(safraSugerida('2026-08-31', 'pecuaria', inativa)).toBeNull();
  });

  it('sem safra, sem data ou sem escopo: null, e nada quebra', () => {
    expect(safraSugerida('2026-08-31', 'pecuaria', [])).toBeNull();
    expect(safraSugerida(null, 'pecuaria', TODAS)).toBeNull();
    expect(safraSugerida('2026-08-31', null, TODAS)).toBeNull();
    expect(safraSugerida('data ruim', 'pecuaria', TODAS)).toBeNull();
  });

  it('uma safra só no escopo dispensa a preferência de cultura', () => {
    expect(safraSugerida('2026-08-31', 'agricultura', [MAND_2627])).toBe('a2');
  });
});
