/**
 * OC-CORRECOES-01 A · OC-TIPO-VENDA-01 — o tipo de venda da OC persiste. O banco foi provado em
 * `supabase/tests/oc_tipo_venda_01_test.sql` (salvar, salvar de novo, sem a chave nao apaga, OC fechada troca desmama <-> gado
 * adulto com trilha, boitel recusa, a saida herda). Aqui: a carga e o que a tela manda (lido da FONTE, o modal e' grande demais
 * para montar).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tipoVendaDaCarga, tipoVendaEditavelComOCFechada } from './tipoVendaOC';

describe('a carga do tipo de venda', () => {
  it('o planejamento de boitel manda; sem ele, a coluna; desconhecido ou nulo volta vazio', () => {
    expect(tipoVendaDaCarga('desmama', true)).toBe('boitel');
    expect(tipoVendaDaCarga('gado_adulto', false)).toBe('gado_adulto');
    expect(tipoVendaDaCarga('desmama', false)).toBe('desmama');
    expect(tipoVendaDaCarga(null, false)).toBe('');
    expect(tipoVendaDaCarga('escala', false)).toBe('');
  });
  it('com a OC fechada, so' + "'" + ' o boitel fica travado', () => {
    expect(tipoVendaEditavelComOCFechada('desmama')).toBe(true);
    expect(tipoVendaEditavelComOCFechada('')).toBe(true);
    expect(tipoVendaEditavelComOCFechada('boitel')).toBe(false);
  });
});

describe('a tela (lida da fonte): salvar, reabrir, editar fechada', () => {
  const tab = readFileSync('src/pages/LancamentosTab.tsx', 'utf8');
  it('o Salvar da venda manda o tipo; a carga o le; o sujo o enxerga (e vai pelo editar_dados com a OC fechada)', () => {
    expect(tab).toContain("tipo_venda: (vendaTipoVenda || '') as TipoVendaOC | '',");
    expect(tab).toContain('const tipoCarregado = tipoVendaDaCarga((op as { tipo_venda?: string | null }).tipo_venda, !!bd);');
    expect(tab).toContain("if (modoOCVenda && (vendaTipoVenda || '') !== snap.tipo_venda) sujo.tipo_venda = vendaTipoVenda || null;");
    expect(tab).not.toContain("else { setVendaTipoVenda(''); setOcBoitel(null); }");
  });
  it('OC-PROPRIEDADE-DESTINO-01: a propriedade de destino vai no Salvar, volta na carga e entra no sujo da OC fechada', () => {
    expect(tab).toContain("propriedade_destino: (vendaPropriedadeDestino || '').trim(),");
    expect(tab).toContain("setVendaPropriedadeDestino((op as { propriedade_destino?: string | null }).propriedade_destino ?? '');");
    expect(tab).toContain("if (modoOCVenda && (vendaPropriedadeDestino || '').trim() !== snap.propriedade_destino) sujo.propriedade_destino");
  });
});
