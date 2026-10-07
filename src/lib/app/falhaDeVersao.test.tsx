/**
 * APP-VERSAO-NOVA-01 — a falha de `import()` por página aberta antes de uma publicação nunca aparece crua.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  FRASE_VERSAO_NOVA, EVENTO_VERSAO_NOVA, EVENTO_DO_VITE, FalhaDeVersao,
  ehFalhaDeVersao, fraseDaFalhaDeVersao, importarDoApp, ouvirVersaoNova,
} from '@/lib/app/falhaDeVersao';
import { motivoDaFalhaDoPdf } from '@/lib/pdf/cpr/falhaDoPdf';
import { AvisoVersaoNova } from '@/components/app/AvisoVersaoNova';

const CRUAS = [
  'Failed to fetch dynamically imported module: https://app/assets/gerarPdfCpr-abc123.js',
  'Importing a module script failed.',
  'error loading dynamically imported module: https://app/assets/x.js',
  'Unable to preload CSS for /assets/x-abc.css',
];

describe('o dono da frase', () => {
  it('a frase é a aprovada, e as grafias de Chrome, Safari, Firefox e do Vite a recebem — sem endereço de arquivo', () => {
    expect(FRASE_VERSAO_NOVA).toBe('O sistema foi atualizado depois que esta página abriu. Recarregue a página (Ctrl+R) e repita.');
    for (const msg of CRUAS) {
      expect(ehFalhaDeVersao(new TypeError(msg))).toBe(true);
      expect(fraseDaFalhaDeVersao(new TypeError(msg))).toBe(FRASE_VERSAO_NOVA);
    }
    expect(fraseDaFalhaDeVersao(msgSolta())).toBe(FRASE_VERSAO_NOVA);
  });
  const msgSolta = () => CRUAS[0]; /* a exceção pode vir como texto */
  it('outra falha não é de versão (a busca prova que sabe dizer NÃO)', () => {
    expect(ehFalhaDeVersao(new Error('unsupported number: NaN'))).toBe(false);
    expect(fraseDaFalhaDeVersao(new Error('permission denied for function x'))).toBeNull();
    expect(ehFalhaDeVersao(null)).toBe(false);
  });
  it('o dono é importado estaticamente e não importa nada', () => {
    const dono = readFileSync(resolve(process.cwd(), 'src/lib/app/falhaDeVersao.ts'), 'utf8');
    expect(dono).not.toMatch(/^\s*import\s/m);
    expect(dono).not.toMatch(/\blocation\.reload\b/);
  });
});

describe('importarDoApp', () => {
  it('pedaço que chega: devolve o módulo e não avisa ninguém', async () => {
    const aviso = vi.fn();
    const desliga = ouvirVersaoNova(aviso);
    await expect(importarDoApp(async () => ({ x: 1 }))).resolves.toEqual({ x: 1 });
    expect(aviso).not.toHaveBeenCalled();
    desliga();
  });
  it('pedaço que NÃO chega: avisa o shell e relança com a frase no lugar da mensagem crua', async () => {
    for (const msg of CRUAS) {
      const aviso = vi.fn();
      const desliga = ouvirVersaoNova(aviso);
      const erro = await importarDoApp(async () => { throw new TypeError(msg); }).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(FalhaDeVersao);
      expect(erro instanceof Error ? erro.message : '').toBe(FRASE_VERSAO_NOVA);
      expect(erro instanceof Error ? erro.message : '').not.toMatch(/https?:|\.js|\.css/);
      expect(aviso).toHaveBeenCalledTimes(1);
      desliga();
    }
  });
  it('outra falha passa como veio, sem aviso', async () => {
    const aviso = vi.fn();
    const desliga = ouvirVersaoNova(aviso);
    const original = new Error('qualquer');
    await expect(importarDoApp(async () => { throw original; })).rejects.toBe(original);
    expect(aviso).not.toHaveBeenCalled();
    desliga();
  });
  it('depois de desligado, o shell não ouve mais', () => {
    const aviso = vi.fn();
    ouvirVersaoNova(aviso)();
    window.dispatchEvent(new Event(EVENTO_VERSAO_NOVA));
    window.dispatchEvent(new Event(EVENTO_DO_VITE));
    expect(aviso).not.toHaveBeenCalled();
  });
});

describe('o PDF delega e o texto dele é o de sempre', () => {
  it('as três causas do PDF, byte a byte — inclusive depois de a falha passar pelo importarDoApp', async () => {
    const DO_PDF = 'O aplicativo foi atualizado depois que esta página abriu. Recarregue a página (Ctrl+R) e gere o PDF de novo.';
    for (const msg of CRUAS.slice(0, 3)) expect(motivoDaFalhaDoPdf(new TypeError(msg))).toBe(DO_PDF);
    const traduzida = await importarDoApp(async () => { throw new TypeError(CRUAS[0]); }).catch((e: unknown) => e);
    expect(motivoDaFalhaDoPdf(traduzida)).toBe(DO_PDF);
    expect(motivoDaFalhaDoPdf(new Error('unsupported number: NaN'))).toContain('valor inválido');
    expect(motivoDaFalhaDoPdf(new Error('qualquer'))).toBe('Falha ao gerar PDF: qualquer');
    const pdf = readFileSync(resolve(process.cwd(), 'src/lib/pdf/cpr/falhaDoPdf.ts'), 'utf8');
    expect(pdf).toContain('if (ehFalhaDeVersao(e)) {');
    expect(pdf).not.toMatch(/dynamically imported module\|/); /* a lista de grafias mora só no dono */
  });
});

describe('o aviso do shell', () => {
  it('apagado até a falha; acende com o evento do Vite e com o do dono; um aviso só', () => {
    render(<AvisoVersaoNova recarregar={() => {}} />);
    expect(screen.queryByTestId('aviso-versao-nova')).toBeNull();
    act(() => { window.dispatchEvent(new Event(EVENTO_DO_VITE)); });
    act(() => { window.dispatchEvent(new Event(EVENTO_VERSAO_NOVA)); });
    expect(screen.getAllByTestId('aviso-versao-nova')).toHaveLength(1);
    expect(screen.getByTestId('aviso-versao-nova').textContent).toContain(FRASE_VERSAO_NOVA);
  });
  it('NUNCA recarrega sozinho: só no clique de "Recarregar"; o X fecha sem recarregar e a falha seguinte reacende', () => {
    const recarregar = vi.fn();
    render(<AvisoVersaoNova recarregar={recarregar} />);
    act(() => { window.dispatchEvent(new Event(EVENTO_DO_VITE)); });
    expect(recarregar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('aviso-versao-nova-fechar'));
    expect(screen.queryByTestId('aviso-versao-nova')).toBeNull();
    expect(recarregar).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new Event(EVENTO_VERSAO_NOVA)); });
    fireEvent.click(screen.getByTestId('aviso-versao-nova-recarregar'));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });
  it('o shell monta o aviso, e o evento do Vite não é engolido (a falha segue para quem chamou)', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app).toContain('<AvisoVersaoNova />');
    const dono = readFileSync(resolve(process.cwd(), 'src/lib/app/falhaDeVersao.ts'), 'utf8');
    expect(dono).not.toContain('preventDefault(');
    const aviso = readFileSync(resolve(process.cwd(), 'src/components/app/AvisoVersaoNova.tsx'), 'utf8');
    /* o único reload do aviso é o valor padrão do botão */
    expect(aviso.match(/location\.reload/g)).toHaveLength(1);
    expect(aviso).not.toMatch(/useEffect\([^)]*reload/);
  });
});

/* ── TESTE DE FONTE: nenhum `import()` dinâmico de `src` fora do tratamento ───────────────────────────────── */
/** Os `import('…')` de um texto que NÃO estão embrulhados em `importarDoApp(() => …)`. Comentário e `import()` de TIPO não contam. */
function semTratamento(fonte: string): string[] {
  const achados: string[] = [];
  for (const linha of fonte.split('\n')) {
    const l = linha.trim();
    if (l.startsWith('//') || l.startsWith('*') || l.startsWith('/*')) continue;
    for (const m of l.matchAll(/\bimport\(\s*['"`]/g)) {
      const antes = l.slice(0, m.index);
      if (/importarDoApp\(\(\) => $/.test(antes)) continue;
      if (/[<|&:]\s*$/.test(antes) || /\btypeof $/.test(antes)) continue; /* import() de TIPO */
      achados.push(l);
    }
  }
  return achados;
}
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return arquivos(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) && !n.endsWith('.d.ts') ? [p] : [];
  });
}

describe('fonte: todo import() dinâmico passa pelo dono', () => {
  it('AUTO-TESTE: o detector acha o import cru, o de lazy e o de Promise.all, e deixa passar o tratado, o de tipo e o comentário', () => {
    expect(semTratamento("const { x } = await import('@/a');")).toHaveLength(1);
    expect(semTratamento("const T = lazy(() => import('./T'));")).toHaveLength(1);
    expect(semTratamento("    import('@react-pdf/renderer'),")).toHaveLength(1);
    expect(semTratamento("const J = (await import('jszip')).default;")).toHaveLength(1);
    expect(semTratamento("const { x } = await importarDoApp(() => import('@/a'));")).toHaveLength(0);
    expect(semTratamento("const T = lazy(() => importarDoApp(() => import('./T')));")).toHaveLength(0);
    expect(semTratamento("const [a] = useState<import('./X').Y | null>(null);")).toHaveLength(0);
    expect(semTratamento("//   const { m } = await import('@/lib/x');")).toHaveLength(0);
    expect(semTratamento(" * o `import()` dinâmico lá embaixo")).toHaveLength(0);
  });
  it('nenhum import() dinâmico de src fora do tratamento — e a busca achou os que existem', () => {
    const raiz = resolve(process.cwd(), 'src');
    const todos = arquivos(raiz);
    expect(todos.length).toBeGreaterThan(600);
    const crus: string[] = [];
    let tratados = 0;
    for (const p of todos) {
      const fonte = readFileSync(p, 'utf8');
      if (!p.endsWith('falhaDeVersao.ts')) tratados += (fonte.match(/importarDoApp\(\(\) => import\(/g) ?? []).length;
      for (const l of semTratamento(fonte)) crus.push(`${p.replace(raiz, 'src')}: ${l}`);
    }
    expect(crus).toEqual([]);
    /* 11 pedaços sob demanda + 3 telas em lazy( */
    expect(tratados).toBe(14);
  });
  it('quem usa o dono o importa ESTATICAMENTE', () => {
    for (const p of arquivos(resolve(process.cwd(), 'src'))) {
      const fonte = readFileSync(p, 'utf8');
      if (!/importarDoApp\(\(\) => import\(/.test(fonte) || p.endsWith('falhaDeVersao.ts')) continue;
      expect(fonte, p).toMatch(/^import \{ importarDoApp \} from '@\/lib\/app\/falhaDeVersao';$/m);
    }
  });
});
