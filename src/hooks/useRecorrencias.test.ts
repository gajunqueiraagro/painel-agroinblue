import { describe, it, expect } from 'vitest';
import {
  primeiroVencimentoDe, mesDoFatoDe, deslocamentoMeses, resumoVivo,
} from './useRecorrencias';

/**
 * O que este teste protege — FIN-RECORRENCIA-01d.
 *
 * ⚠ A DATA DEIXOU DE SER DIGITADA. O operador escolhe um cartão e o primeiro
 * vencimento passa a ser DERIVADO no submit. Enquanto ele era digitado, um erro
 * de conta ficava visível no campo; agora ele iria calado para o banco, e a
 * âncora inteira — competência do 1º mais vencimento do 1º — nasceria errada
 * para todos os meses seguintes.
 *
 * ⚠ E A FRASE É A ÚNICA CONFERÊNCIA QUE O OPERADOR TEM. Não há campo mostrando o
 * vencimento; se o resumo divergir da gravação, nada mais avisa. Por isso a
 * frase é testada junto com a conta, e não em separado.
 *
 * Os cantos que enganam são dois: fevereiro, que não tem os dias que os outros
 * meses têm, e a virada de ano, onde somar um mês muda o ano.
 */

/* ⚠ SEM FIXTURE DE TABELA — conferido em FIXTURES-VS-BANCO-01. Este arquivo
   exercita funções puras de calendário: entram e saem strings 'yyyy-MM-dd'. Não
   há suposição sobre forma de coluna a errar, e por isso nada aqui mudou na
   conferência. */

describe('primeiroVencimentoDe — a derivação que substituiu o campo', () => {
  it('"do mês anterior" empurra o vencimento um mês à frente', () => {
    expect(primeiroVencimentoDe('2026-09-01', 5, 'anterior')).toBe('2026-10-05');
  });

  it('"do próprio mês" vence no mês da competência', () => {
    expect(primeiroVencimentoDe('2026-09-01', 5, 'proprio')).toBe('2026-09-05');
  });

  /* ⚠ FEVEREIRO — o aparo é calendário, não régua da casa: dia 31 não existe em
     fevereiro, e o banco aceita a âncora aparada (28/02 declarando dia 31). */
  it('apara o dia para o último do mês quando ele não existe', () => {
    expect(primeiroVencimentoDe('2027-01-01', 31, 'anterior')).toBe('2027-02-28');
    expect(primeiroVencimentoDe('2028-01-01', 31, 'anterior')).toBe('2028-02-29'); // bissexto
    expect(primeiroVencimentoDe('2026-04-01', 31, 'proprio')).toBe('2026-04-30');
  });

  /* ⚠ A VIRADA DE ANO — somar um mês a dezembro muda o ano, e a aritmética de
     mês 13 daria "2026-13-10" se ninguém cuidasse. */
  it('atravessa o ano', () => {
    expect(primeiroVencimentoDe('2026-12-01', 10, 'anterior')).toBe('2027-01-10');
    expect(primeiroVencimentoDe('2026-12-01', 10, 'proprio')).toBe('2026-12-10');
  });
});

describe('mesDoFatoDe — o caminho de volta ao abrir para editar', () => {
  it('lê o cartão da regra já gravada', () => {
    expect(mesDoFatoDe('2026-09-01', '2026-10-05')).toBe('anterior');
    expect(mesDoFatoDe('2026-09-01', '2026-09-05')).toBe('proprio');
    expect(mesDoFatoDe('2026-12-01', '2027-01-10')).toBe('anterior');
  });

  /* ⚠ O ALCANCE QUE A TELA PERDEU, escrito: deslocamento 2 existe no banco e a
     tela o representa como "anterior" — reabrir e salvar o encurtaria para 1.
     As duas regras vivas no Proto têm deslocamento 1, então nada é reescrito
     hoje; o dia em que uma de dois meses aparecer, este caso é o aviso. */
  it('deslocamento maior que 1 volta como "anterior" — o limite dos dois cartões', () => {
    expect(deslocamentoMeses('2026-09-01', '2026-11-05')).toBe(2);
    expect(mesDoFatoDe('2026-09-01', '2026-11-05')).toBe('anterior');
  });
});

describe('resumoVivo — a frase tem de descrever a MESMA data que vai ser gravada', () => {
  it('nomeia o mês do pagamento, não "o mês seguinte"', () => {
    const pv = primeiroVencimentoDe('2026-09-01', 5, 'anterior');
    expect(resumoVivo('2026-09-01', pv, '2027-02-01'))
      .toBe('Consumo de setembro, pago em 5 de outubro; repete até fev/27.');
  });

  it('diz "mesmo mês" quando o cartão é o do próprio mês', () => {
    const pv = primeiroVencimentoDe('2026-09-01', 5, 'proprio');
    expect(resumoVivo('2026-09-01', pv, '2027-02-01'))
      .toBe('Consumo de setembro, pago em 5 do mesmo mês (setembro); repete até fev/27.');
  });

  /* ⚠ O DIA DA FRASE É O APARADO. Dizer 31 quando o lançamento nasce dia 28
     seria a única conferência do operador mentindo sobre a gravação. */
  it('mostra o dia já aparado, não o pretendido', () => {
    const pv = primeiroVencimentoDe('2027-01-01', 31, 'anterior');
    expect(resumoVivo('2027-01-01', pv, '2027-06-01'))
      .toBe('Consumo de janeiro, pago em 28 de fevereiro; repete até jun/27.');
  });

  /* Sem data não há meia verdade a narrar. */
  it('cala quando falta data', () => {
    expect(resumoVivo('', '2026-10-05', '2027-02-01')).toBeNull();
    expect(resumoVivo('2026-09-01', '2026-10-05', '')).toBeNull();
  });
});
