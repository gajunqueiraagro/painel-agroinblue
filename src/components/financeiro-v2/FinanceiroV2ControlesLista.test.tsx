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
  it('o bloco de ações é 2×2, na ordem congelada', () => {
    montar();
    const bloco = screen.getByTestId('bloco-acoes');
    expect(bloco.className).toContain('grid-cols-2');
    // ordem no DOM = ordem visual do grid: Novo, Exportar, Limpar, Intensivo
    const rotulos = Array.from(bloco.children).map((c) => c.textContent?.trim());
    expect(rotulos[0]).toContain('Novo');
    expect(rotulos[1]).toContain('Exportar');
    expect(rotulos[2]).toContain('Limpar');
    expect(rotulos[3]).toContain('Intensivo');
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

  it('Limpar e Intensivo são neutros', () => {
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
