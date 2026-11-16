/**
 * OC-SALVAR-RODAPE-01 — o rodapé da OC (Fechar · estado · ações) e a pergunta ao fechar com pendência. E a fiação do Abate na
 * LancamentosTab, lida da fonte: fechar com pendência pergunta (nunca salva calado) e o "Salvar e fechar" grava tudo em ordem.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent } from '@testing-library/react';
import { PerguntaAoFecharOC, RodapeDaOC } from '@/components/compra/RodapeDaOC';

describe('RodapeDaOC', () => {
  it('Fechar à esquerda, o estado em lugar reservado, as ações da aba à direita', () => {
    const onFechar = vi.fn();
    render(<RodapeDaOC onFechar={onFechar} pendente salvoAs="19:52"><button type="button">Salvar abate</button></RodapeDaOC>);
    const estado = screen.getByTestId('rodape-da-oc-estado');
    expect(estado.textContent).toBe('Alterações não salvas');
    expect(estado.getAttribute('data-reserva')).toBe('Alterações não salvas');
    expect(screen.getByRole('button', { name: 'Salvar abate' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onFechar).toHaveBeenCalledTimes(1);
  });
  it('sem pendência: "Salvo às" do último salvar', () => {
    render(<RodapeDaOC onFechar={() => {}} pendente={false} salvoAs="19:52" />);
    expect(screen.getByTestId('rodape-da-oc-estado').textContent).toBe('Salvo às 19:52');
  });
});

describe('PerguntaAoFecharOC', () => {
  it('três caminhos: Salvar e fechar · Fechar sem salvar · Voltar', () => {
    const h = { onSalvarEFechar: vi.fn(), onFecharSemSalvar: vi.fn(), onVoltar: vi.fn() };
    render(<PerguntaAoFecharOC aberta salvando={false} {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e fechar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar sem salvar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect([h.onSalvarEFechar, h.onFecharSemSalvar, h.onVoltar].map(f => f.mock.calls.length)).toEqual([1, 1, 1]);
  });
  it('salvando: os botões travam e o principal diz "Salvando..."', () => {
    render(<PerguntaAoFecharOC aberta salvando onSalvarEFechar={() => {}} onFecharSemSalvar={() => {}} onVoltar={() => {}} />);
    const principal = screen.getByRole('button', { name: 'Salvando...' });
    expect(principal.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Fechar sem salvar' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('a fiação do Abate (LancamentosTab)', () => {
  const fonte = readFileSync('src/pages/LancamentosTab.tsx', 'utf8');
  const fechar = fonte.slice(fonte.indexOf('const fecharModalOCComAutosave = useCallback('));
  const blocoFechar = fechar.slice(0, fechar.indexOf('}, ['));
  const blocoAbate = blocoFechar.slice(blocoFechar.indexOf('if (modoOCAbate) {'), blocoFechar.indexOf('if (modoOCVenda) {'));
  it('fechar o abate com pendência PERGUNTA e não salva calado (D1)', () => {
    expect(blocoAbate).toContain('if (ocAbatePendente) { setPerguntaFecharAbate(true); return; }');
    expect(blocoAbate).not.toMatch(/salvar\w*\(/);
    expect(blocoFechar).not.toContain('(modoOCVenda || modoOCAbate)');
  });
  it('"Salvar e fechar" grava os passos pendentes em ordem, pelos gravadores de hoje, e só fecha se tudo passou (D3)', () => {
    expect(fonte).toContain("passo === 'dados' ? salvarDadosDoAbate() : salvarNegociacaoAbateOC(versao));");
    expect(fonte).toContain('if (r.ok) fecharModalOC();');
    expect(fonte).toContain('lotesApi.salvar({ aoRecusar: setRecusaNegociacaoOC, versaoEsperada: versaoOverride })');
  });
  it('o pendente do abate: dados contra a base, lotes contra o banco, linhas enquanto houver rascunho', () => {
    expect(fonte).toContain('const ocAbateNegociacaoSuja = !!lotesApi.alterados || abateLinhas.size > 0;');
    expect(fonte).toContain("dadosSujos: ocStatusComercial === 'fechada' ? ocDadosSujos : ocAbateDadosAtual !== ocAbateDadosBase,");
    expect(fonte).toContain('setOcAbateDadosBase(dadosDoAbateDaOperacao(op));');
  });
});
