/**
 * APP-SEM-TRADUCAO-01 — a página se declara em português do Brasil e pede para NÃO ser traduzida.
 *
 * Nasce de um caso do piloto (08/10/2026): com `<html lang="en">` o Chrome oferecia traduzir, e o Novo Lançamento aparecia com
 * "Competência de Dados" no lugar de "Data Competência", "Pré-visualização" no lugar de "Previsto" e "Contém origem" no lugar de
 * "Conta origem". Este teste lê a FONTE (o `index.html` único da aplicação e o manifesto) e cai se alguém tirar uma das marcas.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = process.cwd();
const ler = (c: string) => readFileSync(resolve(raiz, c), 'utf8');

/** As três marcas, lidas de um HTML: o idioma declarado, o `translate` da raiz e a meta do Google. */
function marcasDe(html: string) {
  const semComentario = html.replace(/<!--[\s\S]*?-->/g, '');
  const raizHtml = semComentario.match(/<html\b[^>]*>/i)?.[0] ?? '';
  const meta = semComentario.match(/<meta\b[^>]*\bname=["']google["'][^>]*>/i)?.[0] ?? '';
  return {
    lang: raizHtml.match(/\blang=["']([^"']*)["']/i)?.[1] ?? null,
    translate: raizHtml.match(/\btranslate=["']([^"']*)["']/i)?.[1] ?? null,
    metaGoogle: meta.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? null,
  };
}

describe('APP-SEM-TRADUCAO-01', () => {
  it('AUTO-TESTE: o leitor acha as marcas quando existem e diz que faltam quando faltam (comentário não conta)', () => {
    expect(marcasDe('<!doctype html><html lang="en"><head></head></html>')).toEqual({ lang: 'en', translate: null, metaGoogle: null });
    expect(marcasDe('<!-- <html lang="pt-BR" translate="no"> --><html lang="en"><head><!-- <meta name="google" content="notranslate"> --></head></html>'))
      .toEqual({ lang: 'en', translate: null, metaGoogle: null });
    expect(marcasDe('<html translate="no" lang="pt-BR"><head><meta content="notranslate" name="google" /></head></html>'))
      .toEqual({ lang: 'pt-BR', translate: 'no', metaGoogle: 'notranslate' });
  });

  it('o index.html declara pt-BR, translate="no" e a meta notranslate', () => {
    expect(marcasDe(ler('index.html'))).toEqual({ lang: 'pt-BR', translate: 'no', metaGoogle: 'notranslate' });
  });

  it('o index.html é o ÚNICO HTML de entrada servido ao usuário (raiz e public)', () => {
    const htmls = (dir: string) => readdirSync(resolve(raiz, dir)).filter((f) => /\.html?$/i.test(f)).map((f) => (dir === '.' ? f : `${dir}/${f}`));
    expect([...htmls('.'), ...htmls('public')]).toEqual(['index.html']);
  });

  it('o manifesto do aplicativo instalado declara o mesmo idioma', () => {
    const manifesto: { lang?: string } = JSON.parse(ler('public/site.webmanifest'));
    expect(manifesto.lang).toBe('pt-BR');
  });

  it('nenhum código troca o idioma da página em tempo de execução', () => {
    const arquivos = (dir: string): string[] => readdirSync(resolve(raiz, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? arquivos(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    const troca = /documentElement\s*\.\s*lang\s*=|documentElement\s*\.\s*setAttribute\(\s*['"](lang|translate)['"]/;
    expect(troca.test("document.documentElement.lang = 'en'")).toBe(true);   /* o detector sabe achar */
    const lista = arquivos('src');
    expect(lista.length).toBeGreaterThan(500);
    expect(lista.filter((a) => troca.test(ler(a)))).toEqual([]);
  });
});
