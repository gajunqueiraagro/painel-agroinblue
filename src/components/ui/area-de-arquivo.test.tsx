/**
 * UI-ARRASTAR-ARQUIVO-01a — a `AreaDeArquivo`: clicar E arrastar, realce só para arquivo, recusa NA área, e o modo lote.
 *
 * ⚠ O jsdom NÃO MEDE: aqui se prova o CONTRATO (uma linha, texto que corta com `title`, parte fixa que não encolhe, altura do
 *   hospedeiro); as medidas reais vão no relatório.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AreaDeArquivo, type AreaDeArquivoProps } from './area-de-arquivo';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';

const DOC: RegraDeAceite = { tipos: ['pdf', 'jpg', 'png', 'xml'], tamanhoMaxBytes: 10 * 1024 * 1024 };
const pdf = (nome = 'nota.pdf') => new File(['%PDF'], nome, { type: 'application/pdf' });
const txt = () => new File(['x'], 'nota.txt', { type: 'text/plain' });
const comArquivos = (arquivos: File[]) => ({ dataTransfer: { files: arquivos, types: ['Files'] } });
const comTexto = { dataTransfer: { files: [], types: ['text/plain'] } };

function montar(p: Partial<AreaDeArquivoProps> = {}) {
  const onArquivos = vi.fn();
  render(<AreaDeArquivo regra={DOC} onArquivos={onArquivos} testId="area" inputTestId="input" className="h-10" {...p} />);
  return { onArquivos, area: screen.getByTestId('area'), input: screen.getByTestId('input') as HTMLInputElement };
}
let abrirSeletor: ReturnType<typeof vi.spyOn>;
beforeEach(() => { abrirSeletor = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {}); });
afterEach(() => { abrirSeletor.mockRestore(); });

describe('clicar e teclado', () => {
  it('clicar na área abre o seletor; Enter e Espaço também; a área tem foco', () => {
    const { area } = montar();
    expect(area.getAttribute('role')).toBe('button');
    expect(area.getAttribute('tabindex')).toBe('0');
    fireEvent.click(area);
    expect(abrirSeletor).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(area, { key: 'Enter' });
    fireEvent.keyDown(area, { key: ' ' });
    expect(abrirSeletor).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(area, { key: 'a' });
    expect(abrirSeletor).toHaveBeenCalledTimes(3);
  });
  it('o botão da direita abre o seletor UMA vez (não dobra com o clique da área)', () => {
    montar({ rotuloDoBotao: 'Escolher arquivos' });
    fireEvent.click(screen.getByRole('button', { name: 'Escolher arquivos' }));
    expect(abrirSeletor).toHaveBeenCalledTimes(1);
  });
  it('o arquivo escolhido pelo seletor passa pela MESMA regra e chega ao destino', () => {
    const { onArquivos, input } = montar();
    const f = pdf();
    fireEvent.change(input, { target: { files: [f] } });
    expect(onArquivos).toHaveBeenCalledTimes(1);
    expect(onArquivos.mock.calls[0][0]).toEqual([f]);
    expect(input.accept).toBe('application/pdf,image/jpeg,image/png,application/xml,text/xml,.pdf,.jpg,.jpeg,.png,.xml');
    expect(input.multiple).toBe(false);
  });
});

describe('arrastar', () => {
  it('arquivo por cima realça; sair apaga', () => {
    const { area } = montar();
    expect(area.getAttribute('data-sobre')).toBeNull();
    fireEvent.dragEnter(area, comArquivos([]));
    expect(area.getAttribute('data-sobre')).toBe('sim');
    expect(area.className).toContain('ring-success/40');
    fireEvent.dragLeave(area, comArquivos([]));
    expect(area.getAttribute('data-sobre')).toBeNull();
  });
  it('passar sobre um FILHO não apaga o realce (conta entradas e saídas)', () => {
    const { area } = montar({ rotuloDoBotao: 'Escolher' });
    const filho = screen.getByRole('button', { name: 'Escolher' });
    fireEvent.dragEnter(area, comArquivos([]));
    fireEvent.dragEnter(filho, comArquivos([]));   // entrou no filho…
    fireEvent.dragLeave(area, comArquivos([]));    // …e o navegador avisa que "saiu" da área
    expect(area.getAttribute('data-sobre')).toBe('sim');
    fireEvent.dragLeave(filho, comArquivos([]));
    expect(area.getAttribute('data-sobre')).toBeNull();
  });
  it('arrastar que NÃO é arquivo (texto) não realça nem é tratado', () => {
    const { area, onArquivos } = montar();
    fireEvent.dragEnter(area, comTexto);
    expect(area.getAttribute('data-sobre')).toBeNull();
    expect(fireEvent.dragOver(area, comTexto)).toBe(true);    // não houve preventDefault
    fireEvent.drop(area, comTexto);
    expect(onArquivos).not.toHaveBeenCalled();
  });
  it('soltar ACEITO chama o destino uma vez, com o arquivo, e apaga o realce', () => {
    const { area, onArquivos } = montar();
    const f = pdf();
    fireEvent.dragEnter(area, comArquivos([f]));
    expect(fireEvent.dragOver(area, comArquivos([f]))).toBe(false);   // preventDefault: a área aceita o soltar
    fireEvent.drop(area, comArquivos([f]));
    expect(onArquivos).toHaveBeenCalledTimes(1);
    expect(onArquivos.mock.calls[0][0]).toEqual([f]);
    expect(area.getAttribute('data-sobre')).toBeNull();
  });
  it('soltar RECUSADO mostra o motivo NA área e NÃO chama o destino; o próximo aceito limpa', () => {
    const { area, onArquivos } = montar();
    fireEvent.drop(area, comArquivos([txt()]));
    expect(onArquivos).not.toHaveBeenCalled();
    const recusa = screen.getByTestId('area-de-arquivo-recusa');
    expect(recusa.textContent).toBe('Só PDF, imagem ou XML.');
    expect(recusa.getAttribute('role')).toBe('alert');
    expect(area.getAttribute('title')).toBe('Só PDF, imagem ou XML.');
    fireEvent.drop(area, comArquivos([pdf()]));
    expect(onArquivos).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('area-de-arquivo-recusa')).toBeNull();
  });
  it('dois arquivos onde cabe um: "Solte um arquivo só." e nada chega', () => {
    const { area, onArquivos } = montar();
    fireEvent.drop(area, comArquivos([pdf('a.pdf'), pdf('b.pdf')]));
    expect(screen.getByTestId('area-de-arquivo-recusa').textContent).toBe('Solte um arquivo só.');
    expect(onArquivos).not.toHaveBeenCalled();
  });
});

describe('o motivo do hospedeiro e o convite curto (01b)', () => {
  it('`motivoExterno`: a recusa que só o hospedeiro sabe dar aparece no MESMO lugar e do mesmo jeito; em branco, nada', () => {
    const { rerender } = render(<AreaDeArquivo regra={DOC} onArquivos={vi.fn()} testId="area" motivoExterno="O arquivo não é um extrato OFX." />);
    const recusa = screen.getByTestId('area-de-arquivo-recusa');
    expect(recusa.textContent).toBe('O arquivo não é um extrato OFX.');
    expect(recusa.getAttribute('role')).toBe('alert');
    expect(screen.getByTestId('area').getAttribute('title')).toBe('O arquivo não é um extrato OFX.');
    for (const vazio of ['', '   ', null]) {
      rerender(<AreaDeArquivo regra={DOC} onArquivos={vi.fn()} testId="area" motivoExterno={vazio} />);
      expect(screen.queryByTestId('area-de-arquivo-recusa')).toBeNull();
    }
  });
  it('a recusa do DONO vem antes da do hospedeiro (é a do arquivo que acabou de ser solto)', () => {
    const { area } = montar({ motivoExterno: 'recusa antiga do hospedeiro' });
    fireEvent.drop(area, comArquivos([txt()]));
    expect(screen.getByTestId('area-de-arquivo-recusa').textContent).toBe('Só PDF, imagem ou XML.');
  });
  it('`detalhe=""`: só o convite (quem usa já diz os formatos ao lado)', () => {
    const { area } = montar({ detalhe: '' });
    expect(area.textContent).toBe('Clique ou arraste o arquivo');
    expect(area.getAttribute('title')).toBe('Clique ou arraste o arquivo');
  });
});

describe('modo lote', () => {
  it('entrega TODOS os arquivos com o veredito de cada um; nada é recusado na área', () => {
    const { area, onArquivos, input } = montar({ modo: 'lote', regra: { ...DOC, varios: true } });
    const a = pdf('a.pdf'); const t = txt(); const b = pdf('b.pdf');
    fireEvent.drop(area, comArquivos([a, t, b]));
    expect(onArquivos).toHaveBeenCalledTimes(1);
    const [arquivos, vereditos] = onArquivos.mock.calls[0] as [File[], { arquivo: File; motivo: string | null }[]];
    expect(arquivos).toEqual([a, t, b]);
    expect(vereditos.map(v => v.motivo)).toEqual([null, 'Só PDF, imagem ou XML.', null]);
    expect(screen.queryByTestId('area-de-arquivo-recusa')).toBeNull();
    expect(input.multiple).toBe(true);
  });
});

describe('desabilitada: apagada, com o motivo, e não some', () => {
  it('não realça, não aceita, não abre o seletor, e escreve o motivo', () => {
    const { area, onArquivos } = montar({ desabilitado: true, motivoDesabilitado: 'Selecione um cliente.', rotuloDoBotao: 'Escolher' });
    expect(area.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('area-de-arquivo-motivo').textContent).toBe('Selecione um cliente.');
    expect(area.getAttribute('title')).toBe('Selecione um cliente.');
    fireEvent.dragEnter(area, comArquivos([pdf()]));
    expect(area.getAttribute('data-sobre')).toBeNull();
    fireEvent.drop(area, comArquivos([pdf()]));
    expect(onArquivos).not.toHaveBeenCalled();
    fireEvent.click(area);
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(abrirSeletor).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Escolher' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('uma linha, na altura de quem usa', () => {
  it('o convite é uma linha só que corta, com o inteiro no `title`; a altura é a do hospedeiro', () => {
    const { area } = montar({ className: 'h-12' });
    expect(area.textContent).toBe('Clique ou arraste o arquivo · PDF, imagem ou XML · até 10 MB');
    expect(area.getAttribute('title')).toBe('Clique ou arraste o arquivo · PDF, imagem ou XML · até 10 MB');
    for (const c of ['h-12', 'whitespace-nowrap', 'overflow-hidden', 'border-dashed', 'border-success', 'bg-success/10']) expect(area.className).toContain(c);
    expect(area.querySelector('span')?.className).toContain('truncate');
  });
  it('o conteúdo de quem usa (nome do arquivo) corta com o inteiro no `title`; a parte fixa nunca encolhe; "remover" chama', () => {
    const onRemover = vi.fn();
    const nome = 'NFe 000.031.776 Comercial Pantanal de Rio Verde Ltda - via do destinatario.pdf';
    const { area } = montar({ conteudo: nome, tituloDoConteudo: nome, fixo: '2,4 MB', onRemover });
    expect(area.getAttribute('title')).toBe(nome);
    const [texto, fixo] = [...area.querySelectorAll('span')];
    expect(texto.className).toContain('truncate');
    expect(texto.className).toContain('min-w-0');
    expect(fixo.textContent).toBe('2,4 MB');
    expect(fixo.className).toContain('shrink-0');
    fireEvent.click(screen.getByText('remover'));
    expect(onRemover).toHaveBeenCalledTimes(1);
    expect(abrirSeletor).not.toHaveBeenCalled();
  });
  it('o mesmo HTML com e sem realce, fora as classes de cor (nada muda de tamanho)', () => {
    const { area } = montar();
    const limpa = (c: string) => c.split(' ').filter(x => !/success|cursor|ring/.test(x)).sort().join(' ');
    const antes = limpa(area.className);
    fireEvent.dragEnter(area, comArquivos([]));
    expect(limpa(area.className)).toBe(antes);
  });
});
