import { describe, expect, it } from 'vitest';
import { arranjarZona } from './barraQueCabe';

const base = { instrucaoInteira: 200, instrucaoCurta: 40, acoes: [60, 70, 80], mais: 50, gap: 8 };

describe('arranjarZona (UI-ESPACO-RESERVADO: o que cabe ao lado do bloco fixo)', () => {
  it('cabendo tudo, tudo inteiro', () => {
    // 200 + (60+8) + (70+8) + (80+8) = 434
    expect(arranjarZona({ ...base, disponivel: 434 })).toEqual({ instrucaoInteira: true, acoesVisiveis: 3 });
  });

  it('primeiro a instrução vira o ⓘ, os botões ficam', () => {
    expect(arranjarZona({ ...base, disponivel: 433 })).toEqual({ instrucaoInteira: false, acoesVisiveis: 3 });
    expect(arranjarZona({ ...base, disponivel: 274 })).toEqual({ instrucaoInteira: false, acoesVisiveis: 3 });
  });

  it('depois os botões do fim vão para o "Mais", um a um (o Mais ocupa lugar)', () => {
    // ⓘ 40 + 68 + 78 + Mais 58 = 244
    expect(arranjarZona({ ...base, disponivel: 273 })).toEqual({ instrucaoInteira: false, acoesVisiveis: 2 });
    expect(arranjarZona({ ...base, disponivel: 244 })).toEqual({ instrucaoInteira: false, acoesVisiveis: 2 });
    expect(arranjarZona({ ...base, disponivel: 243 })).toEqual({ instrucaoInteira: false, acoesVisiveis: 1 });
    expect(arranjarZona({ ...base, disponivel: 98 })).toEqual({ instrucaoInteira: false, acoesVisiveis: 0 });
  });

  it('sem botões de ação, só a instrução decide (nunca há "Mais")', () => {
    expect(arranjarZona({ ...base, acoes: [], disponivel: 200 })).toEqual({ instrucaoInteira: true, acoesVisiveis: 0 });
    expect(arranjarZona({ ...base, acoes: [], disponivel: 199 })).toEqual({ instrucaoInteira: false, acoesVisiveis: 0 });
  });
});
