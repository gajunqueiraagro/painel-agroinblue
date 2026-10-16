/**
 * FIN-LR-SYNC-01 passo c — a linha "pasta Downloads": sem a API, sem pasta, permissão expirada, pasta ok; IndexedDB indisponível
 * não quebra; o adaptador do handle só abre os relatórios do LR.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PastaDownloadsLr, FRASE_SEM_API } from './PastaDownloadsLr';
import { comoPasta, fonteDoNavegador, type FontePastaLr, type PastaLr, type PermissaoDaPasta } from '@/v2/lib/lucroRural/pastaDownloads';

const arquivo = (nome: string, dias = 0) => new File(['x'], nome, { lastModified: Date.now() - dias * 86400000 });
/* como o Chrome: depois de o pedido ser aceito, a consulta passa a dizer 'granted' */
const pasta = (perm: PermissaoDaPasta, arquivos: File[], depoisDePedir: PermissaoDaPasta = 'granted'): PastaLr => {
  let atual = perm;
  return {
    nome: 'Downloads', bruto: {},
    permissao: vi.fn(async (pedir: boolean) => { if (pedir) atual = depoisDePedir; return atual; }),
    listarRelatorios: vi.fn(async () => arquivos),
  };
};
const fonte = (over: Partial<FontePastaLr> = {}): FontePastaLr => ({
  disponivel: true, escolher: vi.fn(async () => null), lerGuardada: vi.fn(async () => null),
  guardar: vi.fn(async () => true), esquecer: vi.fn(async () => undefined), ...over,
});
const estado = () => screen.getByTestId('pasta-downloads').getAttribute('data-estado');

describe('os quatro estados', () => {
  it('sem a API: só a frase, nenhum botão', () => {
    render(<PastaDownloadsLr fonte={fonte({ disponivel: false })} auto onAchados={vi.fn()} />);
    expect(estado()).toBe('sem_api');
    expect(screen.getByTestId('pasta-downloads').textContent).toBe(FRASE_SEM_API);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sem pasta: "Usar a pasta Downloads" abre o seletor, guarda e já entrega os dois relatórios', async () => {
    const p = pasta('granted', [arquivo('relatorio-contas-pagar-unificado.xlsx'), arquivo('relatorio-contas-receber-unificado.xlsx')]);
    const f = fonte({ escolher: vi.fn(async () => p) });
    const onAchados = vi.fn();
    render(<PastaDownloadsLr fonte={f} auto onAchados={onAchados} />);
    await waitFor(() => expect(estado()).toBe('sem_pasta'));
    fireEvent.click(screen.getByTestId('usar-pasta'));
    await waitFor(() => expect(onAchados).toHaveBeenCalledTimes(1));
    expect(f.guardar).toHaveBeenCalledWith(p);
    expect(onAchados.mock.calls[0][0].map((x: File) => x.name)).toEqual(['relatorio-contas-pagar-unificado.xlsx', 'relatorio-contas-receber-unificado.xlsx']);
    expect(onAchados.mock.calls[0][1]).toBe(true);
    expect(screen.getAllByTestId('arquivo-da-pasta')).toHaveLength(2);
  });

  it('pasta guardada com permissão: lê sozinho ao abrir, sem pedir nada', async () => {
    const p = pasta('granted', [arquivo('relatorio-contas-pagar-unificado.xlsx'), arquivo('relatorio-contas-receber-unificado.xlsx')]);
    const onAchados = vi.fn();
    render(<PastaDownloadsLr fonte={fonte({ lerGuardada: vi.fn(async () => p) })} auto onAchados={onAchados} />);
    await waitFor(() => expect(onAchados).toHaveBeenCalledTimes(1));
    expect(p.permissao).toHaveBeenCalledWith(false);
    expect(p.permissao).not.toHaveBeenCalledWith(true);
  });

  it('permissão expirada: botão; o pedido (requestPermission) só no clique', async () => {
    const p = pasta('prompt', [arquivo('relatorio-contas-pagar-unificado.xlsx', 5)]);
    const onAchados = vi.fn();
    render(<PastaDownloadsLr fonte={fonte({ lerGuardada: vi.fn(async () => p) })} auto onAchados={onAchados} />);
    await waitFor(() => expect(estado()).toBe('expirada'));
    expect(p.permissao).not.toHaveBeenCalledWith(true);
    expect(onAchados).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('permitir-pasta'));
    await waitFor(() => expect(onAchados).toHaveBeenCalledTimes(1));
    /* só o de pagar, e velho: não completo, e a tela diz o que falta e a data */
    expect(onAchados.mock.calls[0][1]).toBe(false);
    expect(screen.getByTestId('aviso-da-pasta').textContent).toContain('Falta o relatório de contas a receber');
    expect(screen.getByTestId('aviso-da-pasta').textContent).toContain('baixe o de hoje no LR?');
  });

  it('permissão negada no clique: continua o botão, com o recado; nada é lido', async () => {
    const p = pasta('prompt', [], 'denied');
    render(<PastaDownloadsLr fonte={fonte({ lerGuardada: vi.fn(async () => p) })} auto onAchados={vi.fn()} />);
    await waitFor(() => expect(estado()).toBe('expirada'));
    fireEvent.click(screen.getByTestId('permitir-pasta'));
    await waitFor(() => expect(screen.getByTestId('pasta-downloads').textContent).toContain('acesso não permitido'));
    expect(p.listarRelatorios).not.toHaveBeenCalled();
  });

  it('depois de "trocar arquivos" (auto falso) não lê sozinho; "esquecer pasta" volta a sem pasta', async () => {
    const p = pasta('granted', [arquivo('relatorio-contas-pagar-unificado.xlsx')]);
    const f = fonte({ lerGuardada: vi.fn(async () => p) });
    const onEsquecida = vi.fn();
    render(<PastaDownloadsLr fonte={f} auto={false} onAchados={vi.fn()} onEsquecida={onEsquecida} />);
    await waitFor(() => expect(estado()).toBe('guardada'));
    expect(p.listarRelatorios).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('esquecer-pasta'));
    await waitFor(() => expect(estado()).toBe('sem_pasta'));
    expect(f.esquecer).toHaveBeenCalled();
    expect(onEsquecida).toHaveBeenCalled();
  });
});

describe('o navegador de verdade, sem a API e sem IndexedDB', () => {
  it('não lança: sem pasta guardada, guardar falha calado, esquecer passa', async () => {
    const f = fonteDoNavegador();
    expect(f.disponivel).toBe(false);
    await expect(f.lerGuardada()).resolves.toBeNull();
    await expect(f.guardar({ nome: 'x', bruto: {}, permissao: async () => 'granted', listarRelatorios: async () => [] })).resolves.toBe(false);
    await expect(f.esquecer()).resolves.toBeUndefined();
    await expect(f.escolher()).resolves.toBeNull();
  });

  it('IndexedDB que lança ao abrir: também vira "sem pasta"', async () => {
    const antes = Reflect.get(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => { throw new Error('bloqueado'); } } });
    try { await expect(fonteDoNavegador().lerGuardada()).resolves.toBeNull(); }
    finally { Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: antes }); }
  });
});

describe('comoPasta — o handle do navegador', () => {
  it('forma torta = nulo; a lista só abre os relatórios do LR', async () => {
    expect(comoPasta(null)).toBeNull();
    expect(comoPasta({ name: 'x' })).toBeNull();
    const getFile = vi.fn(async function (this: { name: string }) { return new File(['x'], this.name); });
    const entradas = [
      { kind: 'file', name: 'relatorio-contas-pagar-unificado.xlsx', getFile },
      { kind: 'file', name: 'video.mp4', getFile },
      { kind: 'directory', name: 'relatorio-contas-receber-unificado.xlsx' },
    ];
    const h = {
      name: 'Downloads',
      queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      values: () => { let i = 0; return { [Symbol.asyncIterator]() { return this; }, next: async () => (i < entradas.length ? { done: false, value: entradas[i++] } : { done: true, value: undefined }) }; },
    };
    const p = comoPasta(h);
    expect(p?.nome).toBe('Downloads');
    expect(await p?.permissao(false)).toBe('granted');
    const lista = await p?.listarRelatorios();
    expect(lista?.map(f => f.name)).toEqual(['relatorio-contas-pagar-unificado.xlsx']);
    expect(getFile).toHaveBeenCalledTimes(1);
  });
});

describe('o encaixe no modal', () => {
  it('a tela inicial monta a pasta; achados completos comparam, incompletos só leem; "trocar arquivos" desliga o automático', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/lucroRural/AtualizarLucroRuralDialog.tsx', 'utf8');
    expect(src).toContain('<PastaDownloadsLr fonte={fonte} auto={!manual} onAchados={daPastaAchados}');
    expect(src).toContain('void receberRef.current(fs, completos);');
    expect(src).toContain('if (compararAgora) await comparar(junto);');
    expect(src).toMatch(/const trocarArquivos = \(\) => \{[^}]*setManual\(true\)/);
    expect(src).toContain('const r = lerArquivoLr(await f.arrayBuffer(), f.name);');
  });
});
