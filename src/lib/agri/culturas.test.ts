/**
 * O que este teste trava — o código e o nome que o cadastro de safra gera sozinho.
 *
 * ⚠ OS FORMATOS SÃO OS QUE JÁ ESTÃO NO BANCO, não uma convenção nova: `25/26-Pec`,
 * `25/26-AMD`, `25/26-MAND`, com os nomes "Safra 25/26 Pecuária" e "Safra 25/26 Amendoim".
 * O backfill da futura coluna `cultura` (AGRI-01) lê o sufixo do código; se estas funções
 * gerarem outro formato, o backfill não reconhece a safra criada hoje.
 */
import { describe, it, expect } from 'vitest';
import {
  CULTURAS, codigoDaSafra, nomeDaSafra, temporadaDeReferencia, temporadasDisponiveis,
} from './culturas';

describe('código e nome da safra', () => {
  it('pecuária ignora cultura e usa o sufixo Pec', () => {
    expect(codigoDaSafra('25/26', 'pecuaria')).toBe('25/26-Pec');
    expect(nomeDaSafra('25/26', 'pecuaria')).toBe('Safra 25/26 Pecuária');
    /* Mesmo se vier cultura por engano, o escopo manda. */
    expect(codigoDaSafra('25/26', 'pecuaria', 'soja')).toBe('25/26-Pec');
  });

  it('agricultura usa a sigla da cultura — os dois casos que existem no banco', () => {
    expect(codigoDaSafra('25/26', 'agricultura', 'amendoim')).toBe('25/26-AMD');
    expect(codigoDaSafra('25/26', 'agricultura', 'mandioca')).toBe('25/26-MAND');
    expect(nomeDaSafra('25/26', 'agricultura', 'amendoim')).toBe('Safra 25/26 Amendoim');
  });

  it('⚠ agricultura SEM cultura não gera código — vazio é melhor que um código errado', () => {
    /* Um `25/26-` ou `25/26-undefined` gravado seria um código único e sem sentido, e a
       unicidade (cliente_id, codigo) o aceitaria sem reclamar. */
    expect(codigoDaSafra('25/26', 'agricultura', null)).toBe('');
    expect(nomeDaSafra('25/26', 'agricultura', null)).toBe('');
  });

  it('as seis culturas têm sigla própria, sem colisão', () => {
    const siglas = CULTURAS.map(c => c.sigla);
    expect(new Set(siglas).size).toBe(siglas.length);
    expect(siglas).toContain('MAND');
  });

  it('⚠ a temporada vira em JULHO, não em janeiro', () => {
    /* Junho de 2026 ainda é a temporada 25/26; julho já é 26/27. Errar isto poria a
       colheita de uma safra na safra seguinte. */
    expect(temporadaDeReferencia(new Date(2026, 5, 30))).toBe('25/26');
    expect(temporadaDeReferencia(new Date(2026, 6, 1))).toBe('26/27');
  });

  it('o select oferece cinco temporadas, com a de hoje no meio', () => {
    const lista = temporadasDisponiveis(new Date(2026, 8, 6));
    expect(lista).toEqual(['24/25', '25/26', '26/27', '27/28', '28/29']);
    expect(lista[2]).toBe(temporadaDeReferencia(new Date(2026, 8, 6)));
  });

  it('a virada de década não quebra o formato de dois dígitos', () => {
    expect(temporadaDeReferencia(new Date(2029, 8, 1))).toBe('29/30');
    expect(temporadaDeReferencia(new Date(2030, 8, 1))).toBe('30/31');
    expect(codigoDaSafra(temporadaDeReferencia(new Date(2099, 8, 1)), 'pecuaria')).toBe('99/00-Pec');
  });
});
