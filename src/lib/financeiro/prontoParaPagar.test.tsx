/**
 * FIN-PRONTO-PAGAR-01 PR B — a tela só LÊ o código do banco (dados SINTÉTICOS).
 *   P1 o código da linha: só os 10 do banco; outro texto/ausente = sem ponto
 *   P2 a frase: pronto/falta, a forma ("em branco" sem ela), o motivo; falta pede o clique
 *   P3 a contagem do recorte: torta = nulo (nunca zeros inventados)
 *   P4 o filtro vai à RPC só quando não é "todos"; a página lê `pronto_pagar`; mudar a forma relê os totais
 *   P5 o ponto: verde/laranja, lugar reservado sem código, o clique abre e NÃO chega à linha
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { codigoProntoDaLinha, ehPronto, formaEfetivaDaLinha, fraseDoPronto, lerResumoPronto, siglaDaForma } from '@/lib/financeiro/prontoParaPagar';
import { FORMAS_PAGAMENTO_V2 } from '@/lib/financeiro/formasPagamentoV2';
import { filtrosDaPaginaV2, lerPaginaV2, precisaDosTotaisV2, type FiltrosDaTelaV2 } from '@/lib/financeiro/listaPaginaV2';
import { PontoProntoPagar } from '@/components/financeiro-v2/PontoProntoPagar';
import type { LancamentoV2 } from '@/hooks/useFinanceiroV2';

const linhaBase = { id: 'l1', cliente_id: 'cli', valor: 10, tipo_operacao: '2-Saídas', status_transacao: 'programado' };
const linha = (o: Record<string, unknown> = {}): LancamentoV2 => {
  const r = lerPaginaV2({ total_linhas: 1, linhas: [{ ...linhaBase, ...o }], totais: { entradas: 0, saidas: 0, transferencias: 0,
    entradas_sem_caixa: 0, saidas_sem_caixa: 0 }, sem_caixa: { linhas: 0, total: 0 }, fornecedores: {} });
  if (!r) throw new Error('fixture');
  return r.linhas[0];
};

describe('FIN-PRONTO-PAGAR-01 — a lib', () => {
  it('P1 o código da linha', () => {
    expect(codigoProntoDaLinha(linha({ pronto_pagar: 'falta_chave' }))).toBe('falta_chave');
    expect(codigoProntoDaLinha(linha({ pronto_pagar: 'nada_a_fazer' }))).toBe('nada_a_fazer');
    expect(codigoProntoDaLinha(linha({ pronto_pagar: 'pronto' }))).toBeNull();
    expect(codigoProntoDaLinha(linha({ pronto_pagar: null }))).toBeNull();
    expect(codigoProntoDaLinha(linha())).toBeNull();
    expect(formaEfetivaDaLinha(linha({ forma_efetiva: ' PIX ' }))).toBe('PIX');
    expect(formaEfetivaDaLinha(linha({ forma_efetiva: '' }))).toBeNull();
    expect(ehPronto('nada_a_fazer')).toBe(true);
    expect(ehPronto('falta_forma')).toBe(false);
  });
  it('P2 a frase', () => {
    expect(fraseDoPronto('pronto_boleto', 'Boleto')).toBe('Pronto para pagar\nForma: Boleto\nboleto ligado ou anexado');
    expect(fraseDoPronto('falta_forma', null)).toBe('Falta algo para pagar\nForma: em branco\nfalta a forma de pagamento\nClique para resolver na aba Pagamento.');
    expect(fraseDoPronto('nada_a_fazer', 'Débito Automático')).toMatch(/Débito Automático: nada a fazer/);
  });
  it('P2b a sigla da coluna Forma: as 8 formas, as grafias antigas, "Cart" não existe', () => {
    expect(FORMAS_PAGAMENTO_V2.map(siglaDaForma)).toEqual(['Pix', 'Créd', 'Bol', 'DA', 'Déb', 'TED', 'Din', 'Out']);
    expect(['PIX/Transferência Bancária', 'Cartão de Credito', 'Cartão', 'Credito', 'Débito em Conta', 'Cartão de Débito', 'Transferência Bancária', 'TED']
      .map(siglaDaForma)).toEqual(['Pix', 'Créd', 'Créd', 'Créd', 'Déb', 'Déb', 'TED', 'TED']);
    expect(siglaDaForma(null)).toBe('—');
    expect(siglaDaForma('  ')).toBe('—');
    expect(FORMAS_PAGAMENTO_V2.map(siglaDaForma)).not.toContain('Cart');
  });
  it('P3 a contagem do recorte', () => {
    expect(lerResumoPronto({ prontos: 106, prontos_valor: 97496.99, faltando: 370, faltando_valor: 1649659.83 }))
      .toEqual({ prontos: 106, prontosValor: 97496.99, faltando: 370, faltandoValor: 1649659.83 });
    expect(lerResumoPronto({ prontos: 1, prontos_valor: 2, faltando: '3', faltando_valor: 4 })).toBeNull();
    expect(lerResumoPronto(null)).toBeNull();
    expect(lerResumoPronto([1, 2])).toBeNull();
  });
  it('P4 o filtro, a leitura da página e os totais', () => {
    const f: FiltrosDaTelaV2 = { fazendaId: '__all__', anos: ['2026'], meses: [], dimensao: 'financeira', tipoOperacao: '__all__', status: [],
      contaOrigem: '__all__', contaDestino: '__all__', macro: '__all__', grupo: '__all__', centro: '__all__', subcentro: '__all__',
      safra: '__all__', cultura: '__all__', atividade: '__all__', produto: '', documento: '', fornecedor: '__all__', modoSemCaixa: 'ocultar' };
    expect(filtrosDaPaginaV2(f).pronto_pagar).toBeUndefined();
    expect(filtrosDaPaginaV2({ ...f, prontoPagar: 'todos' }).pronto_pagar).toBeUndefined();
    expect(filtrosDaPaginaV2({ ...f, prontoPagar: 'faltando' }).pronto_pagar).toBe('faltando');
    const pag = lerPaginaV2({ total_linhas: 0, linhas: [], totais: { entradas: 0, saidas: 0, transferencias: 0, entradas_sem_caixa: 0,
      saidas_sem_caixa: 0 }, sem_caixa: { linhas: 0, total: 0 }, fornecedores: {}, pronto_pagar: { prontos: 2, prontos_valor: 5, faltando: 1, faltando_valor: 3 } });
    expect(pag?.prontoPagar).toEqual({ prontos: 2, prontosValor: 5, faltando: 1, faltandoValor: 3 });
    expect(precisaDosTotaisV2(linha({ forma_pagamento: null }), linha({ forma_pagamento: 'PIX' }), {})).toBe(true);
    expect(precisaDosTotaisV2(linha({ pronto_pagar: 'falta_boleto' }), linha({ pronto_pagar: 'pronto_boleto' }), {})).toBe(true);
    expect(precisaDosTotaisV2(linha({ descricao: 'a' }), linha({ descricao: 'b' }), {})).toBe(false);
  });
});

describe('FIN-PRONTO-PAGAR-01 — o ponto', () => {
  it('P5 verde/laranja, lugar reservado, o clique abre e não chega à linha', () => {
    const abrir = vi.fn(); const daLinha = vi.fn();
    const { rerender } = render(<div onClick={daLinha}><PontoProntoPagar codigo="falta_chave" forma="PIX" onAbrir={abrir} /></div>);
    const p = screen.getByTestId('ponto-pronto');
    expect(p.dataset.pronto).toBe('nao');
    expect(p.textContent).toBe('Pix');
    expect(p.getAttribute('title')).toMatch(/falta a chave PIX/);
    fireEvent.click(p);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(daLinha).not.toHaveBeenCalled();
    rerender(<div onClick={daLinha}><PontoProntoPagar codigo="pronto_chave_cadastro" forma="PIX" onAbrir={abrir} /></div>);
    expect(screen.getByTestId('ponto-pronto').dataset.pronto).toBe('sim');
    rerender(<div onClick={daLinha}><PontoProntoPagar codigo={null} forma={null} onAbrir={abrir} /></div>);
    expect(screen.queryByTestId('ponto-pronto')).toBeNull();
    expect(screen.getByTestId('forma-sem-ponto').textContent).toBe('—');
    expect(screen.getByTestId('ponto-pronto-vazio').className).toContain('w-1.5');
  });
});
