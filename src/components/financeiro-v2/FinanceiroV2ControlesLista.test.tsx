/**
 * PR-FIN-LISTA-VENCIMENTO-03 · 2C-4 — V4, V6..V9, V10..V12 no componente real.
 *
 * Renderiza `FinanceiroV2ControlesLista` de verdade e checa o contrato visual e
 * de comportamento. V14 (sobreposição) não é verificável em jsdom, que não tem
 * motor de layout — é medido no navegador, com bounding boxes reais.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FinanceiroV2ControlesLista, BotaoAplicarFiltros, type PropsControlesLista } from './FinanceiroV2ControlesLista';
import { calcularPaginacao } from '@/lib/financeiro/estadoFiltrosLista';

function montar(over: Partial<PropsControlesLista> = {}) {
  const props: PropsControlesLista = {
    pendente: false,
    onLimpar: vi.fn(),
    onNovo: vi.fn(),
    exportar: <button data-testid="export-real">Exportar</button>,
    modoIntensivo: false,
    onToggleIntensivo: vi.fn(),
    excluidosSemVencimento: 0,
    incluirSemVencimento: false,
    onToggleSemVencimento: vi.fn(),
    paginacao: calcularPaginacao(87, 0, 30),
    total: 87,
    onPagina: vi.fn(),
    ...over,
  };
  return { props, ...render(<FinanceiroV2ControlesLista {...props} />) };
}

describe('contrato visual dos controles', () => {
  /* UI-BOTOES-LUGAR-FIXO-01 — botão pontual tem lugar reservado: a grade é 2 × 3, com as MESMAS seis células na mesma ordem,
     com e sem Voltar. O defeito: com `onVoltar` a segunda linha tinha três botões e vazava por cima dos filtros. */
  const celulas = () => Array.from(screen.getByTestId('bloco-acoes').children).map((c) =>
    c.getAttribute('data-testid') ?? c.querySelector('[data-testid]')?.getAttribute('data-testid') ?? '?');

  it('o bloco de ações é uma grade fixa 2 × 3, de 190px, na ordem congelada', () => {
    montar({ onVoltar: vi.fn(), onNovoDeXml: vi.fn() });
    const bloco = screen.getByTestId('bloco-acoes');
    expect(bloco.className).toContain('grid-cols-2');
    expect(bloco.className).toContain('w-[190px]');
    expect(celulas()).toEqual(['btn-novo', 'slot-exportar', 'btn-novo-de-xml', 'btn-intensivo', 'btn-voltar', 'btn-limpar']);
  });

  it('SEM Voltar a célula dele continua lá, vazia e fora da tabulação — e os outros cinco não mudam de célula', () => {
    const { unmount } = montar({ onVoltar: vi.fn(), onNovoDeXml: vi.fn() });
    const com = celulas();
    unmount();
    montar({ onNovoDeXml: vi.fn() });
    const sem = celulas();
    expect(sem).toHaveLength(6);
    expect(com).toHaveLength(6);
    expect(sem[4]).toBe('celula-voltar');
    expect(com[4]).toBe('btn-voltar');
    for (const i of [0, 1, 2, 3, 5]) expect(sem[i]).toBe(com[i]);
    const vazia = screen.getByTestId('celula-voltar');
    expect(vazia.getAttribute('aria-hidden')).toBe('true');
    expect(vazia.querySelector('button, a, input, [tabindex]')).toBeNull();
    expect(screen.queryByTestId('btn-voltar')).toBeNull();
  });

  it('o Voltar mora DENTRO da grade (não numa linha a mais) e nenhum botão muda de texto ou title', () => {
    montar({ onVoltar: vi.fn(), onNovoDeXml: vi.fn() });
    const bloco = screen.getByTestId('bloco-acoes');
    expect(within(bloco).getByTestId('btn-voltar').getAttribute('title')).toBe('Voltar');
    expect(within(bloco).getByTestId('btn-limpar').getAttribute('title')).toBe('Limpar filtros');
    expect(within(bloco).getByTestId('btn-novo-de-xml').textContent).toContain('Do XML');
    expect(within(bloco).getByTestId('btn-intensivo').textContent).toContain('Ampliar');
    expect(within(bloco).getByTestId('btn-novo').textContent).toContain('Novo');
  });

  it('Novo é amarelo e Aplicar é azul', () => {
    montar({ pendente: true });
    expect(screen.getByTestId('btn-novo').className).toContain('E7C873');
    render(<BotaoAplicarFiltros pendente onAplicar={vi.fn()} />);
    expect(screen.getByTestId('btn-aplicar').className).toContain('2F6FBF');
  });

  it('Aplicar NAO mora no bloco 2x2 — o lugar dele e ao lado de Atividade', () => {
    montar({ pendente: true });
    expect(screen.queryByTestId('btn-aplicar')).toBeNull();
    expect(within(screen.getByTestId('bloco-acoes')).queryByTestId('btn-aplicar')).toBeNull();
  });

  it('Limpar e Ampliar são neutros', () => {
    montar();
    for (const id of ['btn-limpar', 'btn-intensivo']) {
      const c = screen.getByTestId(id).className;
      expect(c).not.toContain('E7C873');
      expect(c).not.toContain('2F6FBF');
    }
  });

  it('o Exportar recebido é preservado como está', () => {
    montar();
    expect(within(screen.getByTestId('slot-exportar')).getByTestId('export-real')).toBeTruthy();
  });

  it('todos os controles estão presentes', () => {
    montar({ onVoltar: vi.fn() });
    for (const id of ['btn-novo', 'btn-limpar', 'btn-intensivo',
                      'btn-voltar', 'btn-pagina-anterior', 'btn-pagina-proxima']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });
});

describe('V4 — aviso de alterações pendentes', () => {
  it('pendente mostra o aviso e habilita Aplicar', () => {
    montar({ pendente: true });
    expect(screen.getByTestId('aviso-pendente').textContent).toContain('último filtro aplicado');
    render(<BotaoAplicarFiltros pendente onAplicar={vi.fn()} />);
    expect((screen.getByTestId('btn-aplicar') as HTMLButtonElement).disabled).toBe(false);
  });

  it('sem pendência, o aviso some e Aplicar fica desabilitado', () => {
    montar({ pendente: false });
    expect(screen.queryByTestId('aviso-pendente')).toBeNull();
    render(<BotaoAplicarFiltros pendente={false} onAplicar={vi.fn()} />);
    expect((screen.getByTestId('btn-aplicar') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Aplicar e Limpar chamam os respectivos manipuladores', () => {
    const onAplicar = vi.fn();
    const { props } = montar({ pendente: true });
    render(<BotaoAplicarFiltros pendente onAplicar={onAplicar} />);
    fireEvent.click(screen.getByTestId('btn-aplicar'));
    fireEvent.click(screen.getByTestId('btn-limpar'));
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(props.onLimpar).toHaveBeenCalledTimes(1);
  });
});

describe('V10/V11 — contador de sem vencimento', () => {
  it('mostra o número real de excluídos', () => {
    montar({ excluidosSemVencimento: 7 });
    expect(screen.getByTestId('contador-sem-vencimento').textContent)
      .toBe('7 lançamentos sem vencimento fora do período');
  });

  it('singular quando é um só', () => {
    montar({ excluidosSemVencimento: 1 });
    expect(screen.getByTestId('contador-sem-vencimento').textContent)
      .toBe('1 lançamento sem vencimento fora do período');
  });

  it('zero excluídos NÃO mostra contador', () => {
    montar({ excluidosSemVencimento: 0 });
    expect(screen.queryByTestId('aviso-sem-vencimento')).toBeNull();
  });

  it('incluindo, o contador dá lugar à marca de inclusão', () => {
    montar({ excluidosSemVencimento: 7, incluirSemVencimento: true });
    expect(screen.queryByTestId('contador-sem-vencimento')).toBeNull();
    expect(screen.getByTestId('marca-incluindo-sem-vencimento').textContent).toContain('ao final da lista');
  });

  it('o botão apenas sinaliza a intenção — quem aplica é o Aplicar', () => {
    const onAplicar = vi.fn();
    const { props } = montar({ excluidosSemVencimento: 3 });
    render(<BotaoAplicarFiltros pendente onAplicar={onAplicar} />);
    fireEvent.click(screen.getByTestId('btn-incluir-sem-vencimento'));
    expect(props.onToggleSemVencimento).toHaveBeenCalledTimes(1);
    expect(onAplicar).not.toHaveBeenCalled();
  });
});

describe('V7 — controles de paginação', () => {
  it('primeira página desabilita Anterior', () => {
    montar({ paginacao: calcularPaginacao(87, 0, 30) });
    expect((screen.getByTestId('btn-pagina-anterior') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('btn-pagina-proxima') as HTMLButtonElement).disabled).toBe(false);
  });

  it('última página desabilita Próxima', () => {
    montar({ paginacao: calcularPaginacao(87, 2, 30) });
    expect((screen.getByTestId('btn-pagina-proxima') as HTMLButtonElement).disabled).toBe(true);
  });

  it('vazio desabilita as duas e diz que não há nada', () => {
    montar({ paginacao: calcularPaginacao(0, 0, 30), total: 0 });
    expect((screen.getByTestId('btn-pagina-anterior') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('btn-pagina-proxima') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('rotulo-paginacao').textContent).toBe('Nenhum lançamento');
    expect(screen.getByTestId('indicador-pagina').textContent).toBe('—');
  });

  it('navegar pede a página vizinha, e só isso', () => {
    const { props } = montar({ paginacao: calcularPaginacao(87, 1, 30) });
    fireEvent.click(screen.getByTestId('btn-pagina-proxima'));
    expect(props.onPagina).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByTestId('btn-pagina-anterior'));
    expect(props.onPagina).toHaveBeenCalledWith(0);
  });

  it('durante o carregamento a navegação trava, para não empilhar consulta', () => {
    montar({ paginacao: calcularPaginacao(87, 1, 30), carregandoLista: true });
    expect((screen.getByTestId('btn-pagina-proxima') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('btn-pagina-anterior') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('V8 — o rótulo representa o conjunto inteiro', () => {
  it('29.407 registros, 30 na tela', () => {
    montar({ paginacao: calcularPaginacao(29407, 0, 30), total: 29407 });
    expect(screen.getByTestId('rotulo-paginacao').textContent).toBe('1–30 de 29407');
    expect(screen.getByTestId('indicador-pagina').textContent).toBe('1 / 981');
  });
});
