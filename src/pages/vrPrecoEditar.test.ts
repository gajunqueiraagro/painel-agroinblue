/**
 * VR-PRECO-EDITAR-01 (Gabriel 09/11 06:42, print Vera · Faz Baia Grande · out/26) — os preços do mês aberto ficavam cinza: a trava
 * master (só de tela) dava o mês por "fechado" (16/16 pastos fechados + preço gravado), o cliente não tem master e o "Desbloquear" nem
 * aparece no mês aberto. Regra: o preço do mês aberto não passa pela trava master; mexer no preço de mês VALIDADO reabre sozinho.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const f = readFileSync('src/pages/ValorRebanhoTab.tsx', 'utf8');

describe('Valor do Rebanho — editar o preço (VR-PRECO-EDITAR-01)', () => {
  it('o mês aberto edita: a trava da tela é o fechamento do próprio VR, não a trava master', () => {
    expect(f).toContain('const uCanEdit = isGlobal ? false : canEdit;');
    expect(f).not.toContain("from '@/hooks/useMasterLock'");
  });
  it('o 1º preço mexido (digitado ou copiado do mês anterior) de um mês validado reabre sozinho, uma vez', () => {
    expect(f).toContain('if (!validadoComP2Aberto || reabrindoPelaEdicao.current) return;');
    expect(f).toContain('void reabrirPelaEdicao().finally(() => {');
    const iChange = f.indexOf('const handlePrecoChange = (codigo: string, value: string) => {');
    expect(f.slice(iChange, iChange + 120)).toContain('aoMexerNoPreco();');
    const iCopiar = f.indexOf('const handleCopiarMesAnterior = async () => {');
    expect(f.slice(iCopiar, f.indexOf('preços copiados do mês anterior', iCopiar))).toContain('aoMexerNoPreco();');
  });
});
