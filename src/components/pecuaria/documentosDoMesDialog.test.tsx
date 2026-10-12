import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { useDocumentosDoMes, type FonteDeDocumentosDoMes } from '@/hooks/useDocumentosDoMes';
import { arquivoFake, criarFonteFake } from '@/test/fonteDeDocumentosDoMesFake';
import { CONVITE_DO_DOCUMENTO, FRASE_SEM_DOCUMENTOS } from '@/lib/pecuaria/documentosDoMes';
import { ALTURA_DA_LINHA, DocumentosDoMesDialog, GRADE_DA_LINHA, LINHAS_A_VISTA } from './DocumentosDoMesDialog';
import { BotaoDocumentosDoMes } from './BotaoDocumentosDoMes';

function Hospedeiro({ fonte, abrir, aoFechar }: { fonte: FonteDeDocumentosDoMes; abrir?: (u: string) => void; aoFechar?: () => void }) {
  const api = useDocumentosDoMes('cli', 'faz', '2031-03', fonte);
  const [aberto, setAberto] = useState(true);
  return (
    <DocumentosDoMesDialog aberto={aberto} aoFechar={() => { setAberto(false); aoFechar?.(); }} fazendaNome="Faz. Sintética"
      anoMes="2031-03" api={api} abrirEndereco={abrir} />
  );
}

async function soltar(arquivo: File) {
  const input = screen.getByTestId('input-documento-do-mes');
  await act(async () => { fireEvent.change(input, { target: { files: [arquivo] } }); });
}
const linhas = () => screen.queryAllByTestId('linha-documento');

describe('FECH-DOCS-01 — o diálogo', () => {
  it('vazio: título, convite e "Nenhum documento neste mês."', async () => {
    const { fonte } = criarFonteFake();
    render(<Hospedeiro fonte={fonte} />);
    expect(screen.getByText('Documentos do mês — Faz. Sintética · mar/2031')).toBeTruthy();
    expect(screen.getByTestId('area-documento-do-mes').textContent).toContain(CONVITE_DO_DOCUMENTO);
    await waitFor(() => expect(screen.getByTestId('sem-documentos').textContent).toBe(FRASE_SEM_DOCUMENTOS));
    expect(screen.getByTestId('contagem-documentos').textContent).toBe('0 documentos');
    expect(linhas()).toHaveLength(0);
  });

  it('soltar grava na hora e a linha nasce em edição; Enter grava espécie + nome', async () => {
    const { fonte, idas, linhas: banco } = criarFonteFake();
    render(<Hospedeiro fonte={fonte} />);
    await waitFor(() => screen.getByTestId('sem-documentos'));
    await soltar(arquivoFake('WhatsApp Image.pdf'));
    await waitFor(() => expect(linhas()).toHaveLength(1));
    expect(banco[0]).toMatchObject({ especie: 'outro', nome: 'WhatsApp Image.pdf' }); // já está no banco, antes de qualquer Enter
    expect(linhas()[0].getAttribute('data-edicao')).toBe('sim');
    const campo = screen.getByTestId('edicao-nome') as HTMLInputElement;
    expect(campo.value).toBe('WhatsApp Image.pdf');
    expect(screen.getByTestId('edicao-especie')).toBeTruthy();
    fireEvent.change(campo, { target: { value: 'Nascimentos de março' } });
    await act(async () => { fireEvent.keyDown(campo, { key: 'Enter' }); });
    await waitFor(() => expect(linhas()[0].getAttribute('data-edicao')).toBeNull());
    expect(idas.some(i => i.startsWith('renomear:doc-1:v1:outro:Nascimentos de março'))).toBe(true);
    expect(banco[0]).toMatchObject({ nome: 'Nascimentos de março', versao: 2 });
    expect(screen.getByTestId('cel-nome').textContent).toBe('Nascimentos de março');
    expect(screen.getByTestId('contagem-documentos').textContent).toBe('1 documento');
  });

  it('Esc deixa como veio: sai da edição sem gravar, e o diálogo fica aberto', async () => {
    const { fonte, idas, linhas: banco } = criarFonteFake();
    const aoFechar = vi.fn();
    render(<Hospedeiro fonte={fonte} aoFechar={aoFechar} />);
    await waitFor(() => screen.getByTestId('sem-documentos'));
    await soltar(arquivoFake('IMG-0001.jpg', 'image/jpeg'));
    await waitFor(() => screen.getByTestId('edicao-nome'));
    const campo = screen.getByTestId('edicao-nome');
    fireEvent.change(campo, { target: { value: 'não era para gravar' } });
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(screen.queryByTestId('edicao-nome')).toBeNull();
    expect(idas.some(i => i.startsWith('renomear'))).toBe(false);
    expect(banco[0]).toMatchObject({ especie: 'outro', nome: 'IMG-0001.jpg', versao: 1 });
    expect(screen.getByTestId('cel-nome').textContent).toBe('IMG-0001.jpg');
    expect(screen.getByTestId('cel-especie').textContent).toBe('Outro');
    expect(aoFechar).not.toHaveBeenCalled();
    expect(screen.getByTestId('documentos-do-mes')).toBeTruthy();
  });

  it('o lápis reabre a edição com o que está gravado', async () => {
    const { fonte } = criarFonteFake([{ id: 'd1', especie: 'vendas', nome: 'Venda 12 bois.pdf' }]);
    render(<Hospedeiro fonte={fonte} />);
    await waitFor(() => expect(linhas()).toHaveLength(1));
    expect(screen.queryByTestId('edicao-nome')).toBeNull();
    expect(screen.getByTestId('cel-especie').textContent).toBe('Vendas');
    fireEvent.click(screen.getByTestId('lapis-documento'));
    expect((screen.getByTestId('edicao-nome') as HTMLInputElement).value).toBe('Venda 12 bois.pdf');
    expect(screen.getByTestId('edicao-especie').textContent).toContain('Vendas');
  });

  it('cancelar pede motivo no lugar reservado, não apaga, e a linha sai da lista', async () => {
    const { fonte, linhas: banco, idas } = criarFonteFake([{ id: 'd1', nome: 'a.pdf' }, { id: 'd2', nome: 'b.pdf' }]);
    render(<Hospedeiro fonte={fonte} />);
    await waitFor(() => expect(linhas()).toHaveLength(2));
    fireEvent.click(within(linhas()[0]).getByTestId('cancelar-documento'));
    const confirmar = screen.getByTestId('confirmar-cancelamento') as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true); // sem motivo não confirma
    expect(idas.some(i => i.startsWith('cancelar'))).toBe(false);
    fireEvent.change(screen.getByTestId('motivo-do-cancelamento'), { target: { value: 'arquivo errado' } });
    await act(async () => { fireEvent.click(screen.getByTestId('confirmar-cancelamento')); });
    await waitFor(() => expect(linhas()).toHaveLength(1));
    expect(banco).toHaveLength(2);
    expect(banco.find(l => l.id === 'd1')).toMatchObject({ cancelado: true, cancelado_motivo: 'arquivo errado' });
    expect(screen.getByTestId('contagem-documentos').textContent).toBe('1 documento');
  });

  it('visualizar abre o endereço assinado; linha sem arquivo diz "sem arquivo"', async () => {
    const { fonte } = criarFonteFake([{ id: 'd1', nome: 'a.pdf', url: 'cli/faz/2031-03/d1.pdf' }, { id: 'd2', nome: 'b.pdf', url: null }]);
    const abrir = vi.fn();
    render(<Hospedeiro fonte={fonte} abrir={abrir} />);
    await waitFor(() => expect(linhas()).toHaveLength(2));
    await act(async () => { fireEvent.click(within(linhas()[0]).getByText('visualizar')); });
    expect(abrir).toHaveBeenCalledWith('https://assinada.test/cli/faz/2031-03/d1.pdf');
    expect(within(linhas()[1]).getByText('sem arquivo')).toBeTruthy();
  });

  it('recusa do arquivo fica escrita na área, sem linha nova', async () => {
    const { fonte, idas } = criarFonteFake();
    render(<Hospedeiro fonte={fonte} />);
    await waitFor(() => screen.getByTestId('sem-documentos'));
    await soltar(arquivoFake('nota.xml', 'text/xml'));
    expect(screen.getByTestId('area-de-arquivo-recusa').textContent).toMatch(/PDF/);
    expect(idas.some(i => i.startsWith('inserir'))).toBe(false);
  });

  it('contrato de layout: linha de altura fixa, grade em px, lista de três linhas, lugar do recado sempre presente', async () => {
    const { fonte } = criarFonteFake([{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }, { id: 'd4' }]);
    render(<Hospedeiro fonte={fonte} />);
    await waitFor(() => expect(linhas()).toHaveLength(4));
    expect(GRADE_DA_LINHA).toContain('grid-cols-[96px_minmax(0,1fr)_78px_56px_16px_48px]');
    for (const l of linhas()) expect((l as HTMLElement).style.height).toBe(`${ALTURA_DA_LINHA}px`);
    const lista = screen.getByTestId('lista-documentos-do-mes') as HTMLElement;
    expect(lista.style.height).toBe(`${ALTURA_DA_LINHA * LINHAS_A_VISTA}px`);
    expect(lista.className).toContain('overflow-y-auto');
    expect(screen.getByTestId('lugar-do-recado').className).toContain('h-[26px]');
    expect(screen.getByTestId('area-documento-do-mes').className).toContain('h-6');
    expect(screen.getByTestId('documentos-do-mes').className).toContain('max-w-md');
  });
});

describe('FECH-DOCS-01 — o botão das duas telas', () => {
  it('aparece sempre, com zero também, e conta os vivos da fazenda + mês', async () => {
    const { fonte } = criarFonteFake([
      { id: 'a' }, { id: 'b' }, { id: 'c', cancelado: true, cancelado_motivo: 'x' }, { id: 'd', fazenda_id: 'outra' }, { id: 'e', ano_mes: '2031-04' },
    ]);
    const { rerender } = render(<BotaoDocumentosDoMes clienteId="cli" fazendaId="faz" fazendaNome="F" anoMes="2031-03" fonte={fonte} />);
    const botao = () => screen.getByTestId('botao-documentos-do-mes') as HTMLButtonElement;
    expect(botao().textContent).toBe('Documentos do mês · …');
    await waitFor(() => expect(botao().textContent).toBe('Documentos do mês · 2'));
    rerender(<BotaoDocumentosDoMes clienteId="cli" fazendaId="faz" fazendaNome="F" anoMes="2031-04" fonte={fonte} />);
    await waitFor(() => expect(botao().textContent).toBe('Documentos do mês · 1'));
    rerender(<BotaoDocumentosDoMes clienteId="cli" fazendaId="faz" fazendaNome="F" anoMes="2031-05" fonte={fonte} />);
    await waitFor(() => expect(botao().textContent).toBe('Documentos do mês · 0'));
    expect(botao().disabled).toBe(false);
  });

  it('em Global não some: fica apagado com o motivo, e não lê nada', async () => {
    const { fonte, idas } = criarFonteFake([{ id: 'a' }]);
    render(<BotaoDocumentosDoMes clienteId="cli" fazendaId="__global__" fazendaNome="Global" anoMes="2031-03" fonte={fonte} />);
    const botao = screen.getByTestId('botao-documentos-do-mes') as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.textContent).toBe('Documentos do mês · —');
    expect(botao.title).toMatch(/Selecione uma fazenda/);
    await act(async () => { await Promise.resolve(); });
    expect(idas).toEqual([]);
  });

  it('o clique abre o diálogo da fazenda + mês; anexar ali muda o N do botão', async () => {
    const { fonte } = criarFonteFake();
    render(<BotaoDocumentosDoMes clienteId="cli" fazendaId="faz" fazendaNome="Faz. Sintética" anoMes="2031-03" fonte={fonte} />);
    await waitFor(() => expect(screen.getByTestId('botao-documentos-do-mes').textContent).toBe('Documentos do mês · 0'));
    fireEvent.click(screen.getByTestId('botao-documentos-do-mes'));
    expect(screen.getByText('Documentos do mês — Faz. Sintética · mar/2031')).toBeTruthy();
    await soltar(arquivoFake('mapa.png', 'image/png'));
    await waitFor(() => expect(screen.getByTestId('botao-documentos-do-mes').textContent).toBe('Documentos do mês · 1'));
  });
});

/* As duas telas não se montam em teste: a ligação é lida da FONTE (com auto-teste do detector). */
const fonteDe = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), 'utf8');
const usosDoBotao = (texto: string) => texto.match(/<BotaoDocumentosDoMes\b/g)?.length ?? 0;

describe('FECH-DOCS-01 — os dois pontos de tela (fonte)', () => {
  it('o detector sabe achar', () => {
    expect(usosDoBotao('<div><BotaoDocumentosDoMes a="b" /></div>')).toBe(1);
    expect(usosDoBotao('// BotaoDocumentosDoMes sem a tag')).toBe(0);
  });
  it('Fechamento Área: um botão, fora de qualquer condição de sugestão, antes do "Ver sugestões", que tem lugar reservado', () => {
    const f = fonteDe('src/pages/FechamentoTab.tsx');
    expect(usosDoBotao(f)).toBe(1);
    const iBotao = f.indexOf('<BotaoDocumentosDoMes');
    const iAjuste = f.indexOf('{showAdjustButton && (', iBotao);
    const iSugestoes = f.indexOf('Ver sugestões', iBotao);
    const iAjustar = f.indexOf('Ajustar Conciliação', iBotao);
    expect(iBotao).toBeGreaterThan(0);
    expect(iAjuste).toBeGreaterThan(iBotao);
    expect(iSugestoes).toBeGreaterThan(iAjuste);
    expect(iAjustar).toBeGreaterThan(iSugestoes);
    const trecho = f.slice(iBotao, iAjuste);
    expect(trecho).toContain('anoMes={anoMes}');
    expect(trecho).toContain('fazendaId={fazendaAtual?.id ?? null}');
    expect(trecho).toContain('h-7');
    expect(f.slice(iAjuste, iAjustar)).toContain('data-testid="lugar-ver-sugestoes"');
    /* o botão não mora dentro de `sugestoes.length > 0` nem de `showAdjustButton` */
    const antes = f.slice(f.lastIndexOf('COL 3: Ações', iBotao), iBotao);
    expect(antes).not.toContain('showAdjustButton');
    expect(antes).not.toContain('sugestoes.length');
  });
  it('Lançar › Pecuária: um botão, na barra de atalhos, antes de "Movimentações por foto", no mês corrente local', () => {
    const f = fonteDe('src/v2/V2Index.tsx');
    expect(usosDoBotao(f)).toBe(1);
    const iBotao = f.indexOf('<BotaoDocumentosDoMes');
    const iFoto = f.indexOf('atalho-caderno-importacao');
    expect(iBotao).toBeGreaterThan(0);
    expect(iFoto).toBeGreaterThan(iBotao);
    expect(f.slice(iBotao, iFoto)).toContain('anoMes={mesLocal()}');
    /* não depende do acesso ao caderno (`podeAbrirCaderno`): aparece sempre na barra */
    expect(f.slice(iBotao, iFoto).indexOf('podeAbrirCaderno')).toBeGreaterThan(f.slice(iBotao, iFoto).indexOf('/>'));
  });
});
