/** MAPA-TIPO-ROTULO-GRANT-01 — o 42501 só vira "Sem acesso a esta fazenda." quando o banco diz isso; o defeito mostra a causa. */
import { describe, expect, it } from 'vitest';
import { fraseDo42501 } from '@/lib/mapa/fraseDaPermissao';

describe('fraseDo42501', () => {
  it('a recusa de acesso dos gravadores vira a frase da casa', () => {
    expect(fraseDo42501('sem acesso a esta fazenda')).toBe('Sem acesso a esta fazenda.');
    expect(fraseDo42501('sem acesso a este registro')).toBe('Sem acesso a esta fazenda.');
  });
  it('a permissão negada numa função mostra a função (o caso de 02/11)', () => {
    expect(fraseDo42501('permission denied for function _fn_mapa_tipo_rotulo')).toBe('Permissão negada em função _fn_mapa_tipo_rotulo — avise o suporte.');
    expect(fraseDo42501('permission denied for table fazenda_geometria_edicoes')).toBe('Permissão negada em tabela fazenda_geometria_edicoes — avise o suporte.');
  });
  it('RLS e o resto mostram a mensagem real; vazio diz que não veio detalhe', () => {
    expect(fraseDo42501('new row violates row-level security policy for table "x"')).toContain('row-level security');
    expect(fraseDo42501('outra coisa')).toBe('Permissão negada: outra coisa');
    expect(fraseDo42501(undefined)).toContain('sem detalhe');
  });
});
