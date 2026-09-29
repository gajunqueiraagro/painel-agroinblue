/**
 * FIN-NFE-PARCELAS-01 PR 2b — qual boleto vai para qual parcela. O caso que justifica a regra "pela
 * ordem" e não "pelo mês" é o da Vera: o 5º boleto vence 01/03/27 (a duplicata caía num sábado). Pelo
 * mês ele iria para a parcela de março, que é a 6ª.
 */
import { describe, it, expect } from 'vitest';
import { casarBoletos, numeroNoNome, diasDeDiferenca, LIMITE_DIAS_AVISO } from '@/lib/financeiro/casarBoletos';

/* As 8 parcelas da Vera no banco vencem dia 5; os boletos, nas datas da nota. */
const PARCELAS = [
  '2026-10-05', '2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05', '2027-03-05', '2027-04-05', '2027-05-05',
].map((vencimento, i) => ({ numero: i + 1, vencimento }));
const BOLETOS = ['2026-10-26', '2026-11-26', '2026-12-28', '2027-01-27', '2027-03-01', '2027-03-30', '2027-04-30', '2027-05-31'];

const arq = (chave: string, nome: string, vencimentoLido: string | null, parcelaManual: number | null = null) =>
  ({ chave, nome, vencimentoLido, parcelaManual });

describe('casamento pela ordem do vencimento', () => {
  it('caso Vera: o boleto de 01/03/27 vai para a parcela 5 (não para março); os 8 em ordem', () => {
    /* fora de ordem de propósito, e com nomes que não dizem nada */
    const ordem = [7, 2, 5, 0, 6, 3, 1, 4];
    const r = casarBoletos(ordem.map(k => arq(`b${k}`, `digitalizado_${String.fromCharCode(97 + k)}.pdf`, BOLETOS[k])), PARCELAS);
    expect(BOLETOS.map((_, k) => r.get(`b${k}`)?.parcela)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.get('b4')).toEqual({ parcela: 5, casouPor: 'vencimento' });
  });

  it('parcela que já tem boleto não é opção: a fila pula ela', () => {
    const livres = PARCELAS.filter(p => p.numero !== 1 && p.numero !== 2);
    const r = casarBoletos([arq('a', 'x.pdf', '2026-12-28'), arq('b', 'y.pdf', '2027-01-27')], livres);
    expect(r.get('a')?.parcela).toBe(3);
    expect(r.get('b')?.parcela).toBe(4);
  });

  it('arquivo sem leitura casa pelo número no nome, se a parcela estiver livre; senão, escolher', () => {
    const r = casarBoletos([
      arq('lido', 'boleto_004.pdf', '2026-10-26'), // pega a 1 (pela ordem), não a 4
      arq('foto', 'boleto_003_ST_Repro.jpg', null),
      arq('sem', 'scan.pdf', null),
      arq('ocupada', 'boleto_001.pdf', null), // a 1 já foi pelo vencimento
    ], PARCELAS);
    expect(r.get('lido')).toEqual({ parcela: 1, casouPor: 'vencimento' });
    expect(r.get('foto')).toEqual({ parcela: 3, casouPor: 'nome' });
    expect(r.get('sem')).toEqual({ parcela: null, casouPor: 'nao_leu' });
    expect(r.get('ocupada')).toEqual({ parcela: null, casouPor: 'nao_leu' });
  });

  it('a escolha manual vence e tira a parcela da fila dos outros', () => {
    const r = casarBoletos([arq('m', 'qualquer.pdf', '2026-10-26', 8), arq('a', 'a.pdf', '2026-11-26')], PARCELAS);
    expect(r.get('m')).toEqual({ parcela: 8, casouPor: 'escolha' });
    expect(r.get('a')?.parcela).toBe(1);
  });

  it('mais boletos lidos do que parcelas livres: o que sobra fica sem parcela', () => {
    const r = casarBoletos([arq('a', 'a.pdf', '2026-10-26'), arq('b', 'b.pdf', '2026-11-26')], [PARCELAS[0]]);
    expect(r.get('a')?.parcela).toBe(1);
    expect(r.get('b')?.parcela).toBeNull();
  });
});

describe('diferença de dias e número no nome', () => {
  it('diferença acima de 7 dias é aviso (o 5º boleto da Vera: +24 dias contra o dia 5)', () => {
    expect(diasDeDiferenca('2027-03-01', '2027-02-05')).toBe(24);
    expect(Math.abs(diasDeDiferenca('2027-03-01', '2027-02-05') ?? 0) > LIMITE_DIAS_AVISO).toBe(true);
    expect(diasDeDiferenca('2026-10-26', '2026-10-26')).toBe(0);
    expect(diasDeDiferenca(null, '2026-10-26')).toBeNull();
  });

  it('o número é o último grupo de 1 a 3 dígitos do nome, sem a extensão', () => {
    expect(numeroNoNome('boleto_003_ST_Repro.pdf')).toBe(3);
    expect(numeroNoNome('boleto_8.pdf')).toBe(8);
    expect(numeroNoNome('parcela 12 de 12.pdf')).toBe(12);
    expect(numeroNoNome('scan.pdf')).toBeNull();
    expect(numeroNoNome('NF_18112.pdf')).toBeNull();
    /* achado na prova na tela: o "2" de "pr2b" não é número de parcela */
    expect(numeroNoNome('boleto_004_teste_pr2b.pdf')).toBe(4);
    expect(numeroNoNome('parcela2.pdf')).toBeNull();
  });
});
