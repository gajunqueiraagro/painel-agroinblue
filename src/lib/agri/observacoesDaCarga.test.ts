import { describe, it, expect } from 'vitest';
import { observacoesDoOperador, temMetadadoDeMigracao } from '@/lib/agri/observacoesDaCarga';

/* Os textos são os do proto, copiados das colheitas ativas em 21/09/2026. */
const BACKFILL =
  'Carga de 40,34 t dividida por area entre IND.05 e IND.06 (sem cerca); '
  + 'backfill 16/09/2026 das planilhas T Cortez';
const COM_CANCELADA = BACKFILL + ' - cancelada: metade substituída pela carga corrigida';

describe('observacoesDoOperador', () => {
  it('o texto do backfill some inteiro', () => {
    expect(observacoesDoOperador(BACKFILL)).toBe('');
  });

  /* ⚠ O CASO QUE JUSTIFICA O ARQUIVO. Esta linha está ATIVA e diz "cancelada": a reversão da
     manhã de 21/09 devolveu o `ativo` e não limpou o texto. O modal a abre como carga viva. */
  it('o "cancelada" que sobrou numa linha viva também some', () => {
    expect(observacoesDoOperador(COM_CANCELADA)).toBe('');
  });

  it('a marca de fusão some', () => {
    expect(observacoesDoOperador(
      'x - fundida na colheita fba9937a em 2026-09-21 (PR-MANDIOCA-FUNDIR-01)')).toBe('x');
  });

  /* ⚠ E ESTE É O QUE IMPEDE O REMÉDIO DE VIRAR A DOENÇA: o que o operador escrever tem de
     atravessar. Um filtro que apagasse tudo passaria nos três casos acima e seria inútil. */
  it('o que o operador escreveu atravessa, mesmo colado no metadado', () => {
    expect(observacoesDoOperador(BACKFILL + '; conferir o ticket com a indústria'))
      .toBe('conferir o ticket com a indústria');
    expect(observacoesDoOperador('Carga chegou molhada')).toBe('Carga chegou molhada');
  });

  it('duas frases do operador continuam duas', () => {
    expect(observacoesDoOperador('backfill 16/09; pesou a menos; falar com o Silvio'))
      .toBe('pesou a menos; falar com o Silvio');
  });

  it('vazio e nulo não quebram', () => {
    expect(observacoesDoOperador(null)).toBe('');
    expect(observacoesDoOperador(undefined)).toBe('');
    expect(observacoesDoOperador('   ')).toBe('');
  });

  /* ⚠ O FILTRO É POR SENTENÇA, não por documento: uma observação de operador na mesma string de
     um metadado não pode morrer junto. É o caso de cima, visto do outro lado. */
  it('não apaga a frase inteira por causa de uma palavra no vizinho', () => {
    const r = observacoesDoOperador('dividida por area entre A e B; o motorista era outro');
    expect(r).toBe('o motorista era outro');
  });
});

describe('temMetadadoDeMigracao', () => {
  it('acusa o que vai ser escondido e só isso', () => {
    expect(temMetadadoDeMigracao(BACKFILL)).toBe(true);
    expect(temMetadadoDeMigracao(COM_CANCELADA)).toBe(true);
    expect(temMetadadoDeMigracao('Carga chegou molhada')).toBe(false);
    expect(temMetadadoDeMigracao(null)).toBe(false);
  });
});
