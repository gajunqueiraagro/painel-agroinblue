/**
 * ACESSO-CONVITE-01 PR 1 — as regras puras da entrada: o link do e-mail, o endereço de volta, a senha nova (8+, diferente da atual,
 * as duas iguais) e as frases (o texto cru do Supabase nunca vai para a tela).
 */
import { describe, expect, it } from 'vitest';
import {
  CAMINHO_DEFINIR_SENHA, FRASE_LINK_VENCIDO, enderecoDeVolta, fraseDoErroDaSenha, fraseDoErroDoLink, fraseDoErroDoLogin, lerLinkDoEmail,
  pendenciasDaSenhaNova, temPendencia, textosDoLink,
} from './senhaEConvite';
import { FRASE_SENHA_FRACA } from '../../../supabase/functions/_shared/regraDaSenha';

describe('lerLinkDoEmail', () => {
  it('lê o token_hash e o tipo dos três links (convite, recuperação, troca de e-mail)', () => {
    expect(lerLinkDoEmail('?token_hash=abc&type=invite')).toEqual({ tokenHash: 'abc', tipo: 'invite' });
    expect(lerLinkDoEmail('token_hash=abc&type=recovery')).toEqual({ tokenHash: 'abc', tipo: 'recovery' });
    expect(lerLinkDoEmail('?type=email_change&token_hash=x1')).toEqual({ tokenHash: 'x1', tipo: 'email_change' });
  });
  it('sem token, sem tipo ou com tipo fora dos três = null (a página diz "link incompleto")', () => {
    expect(lerLinkDoEmail('')).toBeNull();
    expect(lerLinkDoEmail('?type=invite')).toBeNull();
    expect(lerLinkDoEmail('?token_hash=abc')).toBeNull();
    expect(lerLinkDoEmail('?token_hash=abc&type=signup')).toBeNull();
    expect(lerLinkDoEmail('?token_hash=%20%20&type=invite')).toBeNull();
  });
});

describe('enderecoDeVolta', () => {
  it('a página nossa no endereço em que o sistema está aberto, sem barra dobrada', () => {
    expect(enderecoDeVolta('https://gestao.agroinblue.com.br')).toBe(`https://gestao.agroinblue.com.br${CAMINHO_DEFINIR_SENHA}`);
    expect(enderecoDeVolta('http://localhost:8081/')).toBe('http://localhost:8081/definir-senha');
  });
});

describe('pendenciasDaSenhaNova', () => {
  it('a regra única (SEG-SENHA-01): 8+, com letras e números; 7 recusa, só números ou só letras recusa, 8 com os dois passa', () => {
    expect(pendenciasDaSenhaNova({ nova: 'abcd123', confirmar: 'abcd123' }).nova).toBe(FRASE_SENHA_FRACA);
    expect(pendenciasDaSenhaNova({ nova: '12345678', confirmar: '12345678' }).nova).toBe(FRASE_SENHA_FRACA);
    expect(pendenciasDaSenhaNova({ nova: 'abcdefgh', confirmar: 'abcdefgh' }).nova).toBe(FRASE_SENHA_FRACA);
    expect(pendenciasDaSenhaNova({ nova: 'ãéíõúçãé1', confirmar: 'ãéíõúçãé1' }).nova).toBe(FRASE_SENHA_FRACA);
    expect(temPendencia(pendenciasDaSenhaNova({ nova: 'abcd1234', confirmar: 'abcd1234' }))).toBe(false);
    expect(FRASE_SENHA_FRACA).toBe('A senha precisa de pelo menos 8 caracteres, com letras e números.');
  });
  it('as duas têm de ser iguais', () => {
    expect(pendenciasDaSenhaNova({ nova: 'abcd1234', confirmar: 'abcd1235' }).confirmar).toBe('As duas senhas não são iguais.');
  });
  it('no "Trocar senha": pede a atual e a nova não pode ser igual a ela', () => {
    expect(pendenciasDaSenhaNova({ atual: '', nova: 'abcd1234', confirmar: 'abcd1234' }, true).atual).toBe('Digite a sua senha atual.');
    expect(pendenciasDaSenhaNova({ atual: 'abcd1234', nova: 'abcd1234', confirmar: 'abcd1234' }, true).nova).toMatch(/diferente da atual/);
    expect(temPendencia(pendenciasDaSenhaNova({ atual: 'velha123', nova: 'nova12345', confirmar: 'nova12345' }, true))).toBe(false);
  });
});

describe('frases', () => {
  it('o título e o botão seguem o tipo do link', () => {
    expect(textosDoLink('invite').titulo).toBe('Crie a sua senha');
    expect(textosDoLink('recovery').titulo).toBe('Crie uma nova senha');
    expect(textosDoLink('email_change').botao).toBe('Confirmar e-mail');
  });
  it('link vencido/usado = a frase do "peça um novo"; o cru do Supabase não aparece', () => {
    expect(fraseDoErroDoLink('Email link is invalid or has expired')).toBe(FRASE_LINK_VENCIDO);
    expect(fraseDoErroDoLink('fetch failed')).not.toMatch(/fetch/);
  });
  it('login: credencial errada, e-mail não confirmado e acesso desativado têm frase própria', () => {
    expect(fraseDoErroDoLogin('Invalid login credentials')).toBe('E-mail ou senha incorretos.');
    expect(fraseDoErroDoLogin('Email not confirmed')).toMatch(/link do convite/);
    expect(fraseDoErroDoLogin('User is banned')).toMatch(/desativado/);
    expect(fraseDoErroDoLogin('boom')).not.toMatch(/boom/);
  });
  it('senha recusada pelo Supabase: igual à anterior e fraca', () => {
    expect(fraseDoErroDaSenha('New password should be different from the old password.')).toMatch(/diferente da atual/);
    expect(fraseDoErroDaSenha('Password should be at least 8 characters')).toBe(FRASE_SENHA_FRACA);
    /* a senha vazada (o painel liga o HaveIBeenPwned) tem frase própria */
    expect(fraseDoErroDaSenha('Password is known to be weak and easy to guess, please choose a different one.')).toMatch(/senhas vazadas/);
    expect(fraseDoErroDaSenha('Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789')).toBe(FRASE_SENHA_FRACA);
  });
});
