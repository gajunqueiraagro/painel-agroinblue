/**
 * REVALIDAR-BG-SET26 (Gabriel 05/11) — o "Revalidar" do aviso do snapshot nunca fica mudo, e o aviso é uma faixa de 22px (nada se desloca).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FaixaDoSnapshot } from '@/components/SnapshotStatusBanner';
import { motivoParaRevalidar } from '@/lib/fechamento/travaDoP2';

const fonte = (p: string) => readFileSync(resolve(__dirname, '..', '..', p), 'utf8');

describe('motivoParaRevalidar — o primeiro que barra, ou nada', () => {
  const ok = { podeEditar: true, pastosOficiais: true, semPreco: [] as string[], anoMes: '2026-09' };
  it('pode: nulo', () => { expect(motivoParaRevalidar(ok)).toBeNull(); });
  it('sem edição, pastos abertos e preço faltando, nessa ordem', () => {
    expect(motivoParaRevalidar({ ...ok, podeEditar: false, pastosOficiais: false })).toMatch(/^Só quem edita/);
    expect(motivoParaRevalidar({ ...ok, pastosOficiais: false, semPreco: ['Desmama F'] })).toMatch(/^Feche os pastos de /);
    expect(motivoParaRevalidar({ ...ok, semPreco: ['Desmama F', 'Touros'] })).toBe('Falta o preço de: Desmama F, Touros.');
  });
});

describe('FaixaDoSnapshot — uma linha de 22px com o botão que faz', () => {
  it('invalidado: o Revalidar chama o gravador', () => {
    const revalidar = vi.fn();
    render(<FaixaDoSnapshot status="invalidado" mesLabel="Set/2026" onRevalidar={revalidar} />);
    const faixa = screen.getByTestId('faixa-snapshot');
    expect(faixa.style.height).toBe('22px');
    expect(faixa.textContent).toContain('Snapshot invalidado — Set/2026');
    fireEvent.click(screen.getByTestId('faixa-snapshot-revalidar'));
    expect(revalidar).toHaveBeenCalledTimes(1);
  });
  it('com motivo: o botão desabilitado e o porquê ao lado', () => {
    const revalidar = vi.fn();
    render(<FaixaDoSnapshot status="invalidado" mesLabel="Set/2026" onRevalidar={revalidar} motivo="Falta o preço de: Desmama F." />);
    const botao = screen.getByTestId('faixa-snapshot-revalidar');
    expect(botao).toHaveProperty('disabled', true);
    expect(screen.getByTestId('faixa-snapshot-motivo').textContent).toBe('Falta o preço de: Desmama F.');
    fireEvent.click(botao);
    expect(revalidar).not.toHaveBeenCalled();
  });
  it('cadeia quebrada: Resolver, na mesma altura; validado: nada', () => {
    const { rerender } = render(<FaixaDoSnapshot status="cadeia_quebrada" mesLabel="Set/2026" onIrMesAnterior={() => {}} />);
    expect(screen.getByTestId('faixa-snapshot').style.height).toBe('22px');
    expect(screen.getByTestId('faixa-snapshot-resolver')).toBeTruthy();
    rerender(<FaixaDoSnapshot status="validado" mesLabel="Set/2026" />);
    expect(screen.queryByTestId('faixa-snapshot')).toBeNull();
  });
});

describe('as duas pontas no código', () => {
  it('o Valor do Rebanho revalida pelo "Salvar e Fechar" e o aviso mora na faixa, não no corpo', () => {
    const t = fonte('src/pages/ValorRebanhoTab.tsx');
    expect(t).toMatch(/onRevalidar=\{isSnapInvalidado \? \(\) => \{ void handleRevalidar\(\); \}/);
    expect(t).toMatch(/const handleRevalidar = async \(\) => \{[\s\S]{0,120}await handleSalvar\(\);/);
    expect(t).not.toMatch(/<SnapshotStatusBanner/);
  });
  it('o salvar não engole a recusa do validado', () => {
    const h = fonte('src/hooks/useValorRebanho.ts');
    expect(h).toMatch(/const \{ error: validadoError \} = await supabase\s*\.from\('valor_rebanho_realizado_validado'/);
    expect(h).toMatch(/if \(validadoError\) \{[\s\S]{0,140}throw validadoError;/);
  });
});
