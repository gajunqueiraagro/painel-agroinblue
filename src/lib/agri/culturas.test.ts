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
  periodoDaTemporada, codigoSafraPerene, nomeSafraPerene,
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
    /* ⚠ ERA '' ATÉ O AGRI-CADASTRO-SAFRA-01, e o vazio era o que segurava o botão Criar
       enquanto a cultura não fosse escolhida. A cultura saiu do cadastro da safra (foi para a
       área plantada), então a lavoura passou a ter sigla própria e o código nasce completo. */
    expect(codigoDaSafra('25/26', 'agricultura', null)).toBe('25/26-Lav');
    expect(nomeDaSafra('25/26', 'agricultura', null)).toBe('Safra 25/26 Lavoura');
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

  /**
   * ⚠ ESTE BLOCO SUBSTITUI "cinco temporadas, com a de hoje no meio" — FIN-SAFRA-CADASTRO-01.
   * Cinco eram duas para trás, e as duas eram um PISO INVISÍVEL: o NJ tem pecuária lançada
   * desde 2020 e o cadastro simplesmente não oferecia 20/21. O limite não vinha do dado.
   */
  it('vai de cinco à frente até vinte atrás, da mais recente para a mais antiga', () => {
    const lista = temporadasDisponiveis(new Date(2026, 8, 6));
    expect(lista[0]).toBe('31/32');
    expect(lista.at(-1)).toBe('15/16');
    expect(lista).toContain('20/21');
    expect(lista).toContain('23/24');
    expect(lista).toContain(temporadaDeReferencia(new Date(2026, 8, 6)));
  });

  it('o piso de 2015/16 corta antes dos vinte anos, e a lista não cresce sem fim', () => {
    /* Em 2026 os vinte anos iriam a 2006; o piso manda. É convenção, não dado — está dito
       na constante, para ninguém procurar no banco de onde ele veio. */
    const lista = temporadasDisponiveis(new Date(2026, 8, 6));
    expect(lista).toHaveLength(17);
    expect(lista).not.toContain('06/07');
  });

  it('quando o piso não alcança, valem os vinte anos cheios', () => {
    const lista = temporadasDisponiveis(new Date(2040, 8, 6));
    expect(lista[0]).toBe('45/46');
    expect(lista.at(-1)).toBe('20/21');
    expect(lista).toHaveLength(26);
  });

  it('antes de julho, a temporada corrente ainda é a anterior — e a lista acompanha', () => {
    expect(temporadasDisponiveis(new Date(2026, 5, 30))[0]).toBe('30/31');
  });

  it('a virada de década não quebra o formato de dois dígitos', () => {
    expect(temporadaDeReferencia(new Date(2029, 8, 1))).toBe('29/30');
    expect(temporadaDeReferencia(new Date(2030, 8, 1))).toBe('30/31');
    expect(codigoDaSafra(temporadaDeReferencia(new Date(2099, 8, 1)), 'pecuaria')).toBe('99/00-Pec');
  });
});

describe('as datas da temporada — AGRI-CADASTRO-SAFRA-01', () => {
  it('julho a junho, a mesma convenção de temporadaDeReferencia', () => {
    expect(periodoDaTemporada('25/26')).toEqual({ inicio: '2025-07-01', fim: '2026-06-30' });
    expect(periodoDaTemporada('20/21')).toEqual({ inicio: '2020-07-01', fim: '2021-06-30' });
  });

  it('a virada do século segue o módulo 100 do resto da lib', () => {
    expect(periodoDaTemporada('99/00')).toEqual({ inicio: '2099-07-01', fim: '2100-06-30' });
  });

  it('texto que não é temporada devolve null — não se inventa período', () => {
    expect(periodoDaTemporada('')).toBeNull();
    expect(periodoDaTemporada('2025/2026')).toBeNull();
    expect(periodoDaTemporada('abc')).toBeNull();
  });
});

describe('o código da safra perene', () => {
  it('nasce dos dois anos: eucalipto de 2020 a 2027', () => {
    expect(codigoSafraPerene('2020-03-10', '2027-08-01', 'agricultura')).toBe('20/27-Lav');
    expect(nomeSafraPerene('2020-03-10', '2027-08-01')).toBe('Safra perene 2020–2027');
  });

  it('pecuária perene também tem forma, ainda que rara', () => {
    expect(codigoSafraPerene('2020-01-01', '2025-01-01', 'pecuaria')).toBe('20/25-Pec');
  });

  it('sem as duas datas não há código — e vazio é o que segura o botão', () => {
    expect(codigoSafraPerene('2020-03-10', null, 'agricultura')).toBe('');
    expect(codigoSafraPerene(null, '2027-08-01', 'agricultura')).toBe('');
    expect(codigoSafraPerene('', '', 'agricultura')).toBe('');
    expect(nomeSafraPerene('2020-03-10', null)).toBe('');
  });

  it('⚠ um perene de um ano colide com o anual da mesma temporada, e isso é sabido', () => {
    /* Não há desempate automático: quem avisa é o alerta de código repetido do cadastro, e no
       perene o código é editável justamente para o operador resolver. */
    expect(codigoSafraPerene('2020-07-01', '2021-06-30', 'agricultura'))
      .toBe(codigoDaSafra('20/21', 'agricultura'));
  });
});
