import { describe, it, expect } from 'vitest';
import { mensagemDoErro } from '@/lib/supabase/mensagemDoErro';

describe('mensagemDoErro', () => {
  /* ⚠ O CASO QUE JUSTIFICA O ARQUIVO. É a forma exata do `error` que o `.rpc()` devolve no
     destructuring: objeto plano, não `Error`. Era por ele que o `instanceof Error` falhava e o
     parcelamento recusava calado por três dias. */
  it('lê o objeto plano do PostgREST', () => {
    const erroDoPostgrest = {
      code: '42809',
      message: 'op ANY/ALL (array) requires array on right side',
      details: null,
      hint: null,
    };
    expect(mensagemDoErro(erroDoPostgrest, 'genérico'))
      .toBe('op ANY/ALL (array) requires array on right side');
  });

  /* E o outro formato tem de continuar funcionando: no mesmo `try` convivem os dois. */
  it('lê um Error de verdade', () => {
    expect(mensagemDoErro(new Error('quebrou'), 'genérico')).toBe('quebrou');
    expect(mensagemDoErro(new TypeError('tipo errado'), 'genérico')).toBe('tipo errado');
  });

  /* ⚠ MENSAGEM VAZIA NÃO PASSA: um toast em branco é pior que o genérico, porque o operador não
     sabe se falhou ou se gravou. */
  it('vazio, nulo e sem mensagem caem no fallback', () => {
    expect(mensagemDoErro({ message: '' }, 'genérico')).toBe('genérico');
    expect(mensagemDoErro({ message: '   ' }, 'genérico')).toBe('genérico');
    expect(mensagemDoErro({}, 'genérico')).toBe('genérico');
    expect(mensagemDoErro(null, 'genérico')).toBe('genérico');
    expect(mensagemDoErro(undefined, 'genérico')).toBe('genérico');
    expect(mensagemDoErro(new Error(''), 'genérico')).toBe('genérico');
  });

  /* Mensagem não-texto não vira "[object Object]" na cara do operador. */
  it('message que não é texto cai no fallback', () => {
    expect(mensagemDoErro({ message: { a: 1 } }, 'genérico')).toBe('genérico');
    expect(mensagemDoErro({ message: 42 }, 'genérico')).toBe('genérico');
  });

  it('string crua também serve', () => {
    expect(mensagemDoErro('falhou feio', 'genérico')).toBe('falhou feio');
    expect(mensagemDoErro('  ', 'genérico')).toBe('genérico');
  });
});
