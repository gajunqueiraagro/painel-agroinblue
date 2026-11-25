/**
 * MARCA-PADRAO-01 — a marca nova presa por teste: nenhum ponto volta ao logo antigo nem às assinaturas antigas, a Inter carrega UMA vez, os
 * tokens são os do kit e o componente escolhe o arquivo certo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { arquivoDoLogo, medidaDoLogoPdf, PROPORCAO_DO_LOGO, RODAPE_DA_MARCA } from './marca';
import { CarregandoAgroinblue, LogoAgroinblue } from '@/components/marca/LogoAgroinblue';

const RAIZ = join(__dirname, '..', '..', '..');
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8');

function arquivosDoCodigo(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivosDoCodigo(p, out);
    else if (/\.(ts|tsx|css)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) out.push(p);
  }
  return out;
}

describe('MARCA-PADRAO-01 — o que não pode voltar', () => {
  const codigo = arquivosDoCodigo(join(RAIZ, 'src')).map(p => ({ p, s: readFileSync(p, 'utf8') }));

  it('M1 ninguém importa o logo antigo (assets/logo.png) — o conjunto varrido não é vazio', () => {
    expect(codigo.length).toBeGreaterThan(500);
    expect(codigo.filter(f => f.s.includes("assets/logo.png'")).map(f => f.p)).toEqual([]);
  });

  it('M2 as assinaturas antigas não aparecem no código nem no index.html', () => {
    const antigas = ['Gestão Rural Inteligente', 'Gestão Pecuária e Financeira', 'Gestão Pecuária', 'gestão rural e financeira',
      'Gestão de Custos e Planejamento em Pecuária'];
    const achados = [...codigo, { p: 'index.html', s: ler('index.html') }]
      .flatMap(f => antigas.filter(a => f.s.includes(a)).map(a => `${f.p}: ${a}`));
    expect(achados).toEqual([]);
    expect(RODAPE_DA_MARCA).toBe('AGROinBLUE · Gestão rural inteligente');
  });

  it('M3 index.html: título, cor do tema, ícones e imagem de compartilhamento da marca nova', () => {
    const html = ler('index.html');
    expect(html).toContain('<title>AGROinBLUE — Gestão rural inteligente</title>');
    expect(html).toContain('<meta name="theme-color" content="#0F1F3A" />');
    expect(html).toContain('href="/apple-touch-icon.png"');
    expect(html).toContain('https://gestao.agroinblue.com.br/compartilhamento-link-1200x630.png');
    expect(html).not.toContain('gpt-engineer-file-uploads');
    expect(JSON.parse(ler('public/site.webmanifest')).theme_color).toBe('#0F1F3A');
  });

  it('M4 a Inter é carregada UMA vez (index.html + index.css)', () => {
    const vezes = (s: string) => (s.match(/family=Inter|family=[^"']*&family=Inter/g) ?? []).length;
    expect(vezes(ler('index.html')) + vezes(ler('src/index.css'))).toBe(1);
  });

  it('M5 os tokens da marca são os do kit, e --navy / --mes-aberto são as mesmas cores em HSL', () => {
    const css = ler('src/index.css');
    const kit: Record<string, string> = {
      'azul-marinho': '#0F1F3A', 'azul-profundo': '#0A1730', 'azul-faixa': '#16284A', 'azul-sistema': '#1E3A5F', azul: '#4F8FE6',
      'azul-sobre-claro': '#1F56B8', dourado: '#C9A75B', 'dourado-sobre-claro': '#B08A3A', branco: '#FFFFFF', papel: '#F5F6F8',
      linha: '#DDE1E8', 'texto-2-escuro': '#9FB0C8', 'texto-2-claro': '#5A6A80', verde: '#1F7A4D', vermelho: '#C0392B',
    };
    for (const [k, v] of Object.entries(kit)) expect(css).toContain(`--marca-${k}: ${v};`);
    const hsl = (nome: string) => css.match(new RegExp(`--${nome}: (\\d+) (\\d+)% (\\d+)%;`))!.slice(1).map(Number);
    const hex = (h: number, s: number, l: number) => {
      const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
      const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
      return [f(0), f(8), f(4)];
    };
    const rgb = (x: string) => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
    const perto = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 3);
    expect(perto(hex(...(hsl('navy') as [number, number, number])), rgb(kit['azul-marinho']))).toBe(true);
    expect(perto(hex(...(hsl('mes-aberto') as [number, number, number])), rgb(kit['azul-sobre-claro']))).toBe(true);
  });
});

describe('MARCA-PADRAO-01 — o logo', () => {
  it('L1 abaixo de 28px o horizontal vira compacto; a 28px ou mais, horizontal', () => {
    expect(arquivoDoLogo('horizontal', 'escuro', 20)).toBe(arquivoDoLogo('compacto', 'escuro'));
    expect(arquivoDoLogo('horizontal', 'escuro', 28)).not.toBe(arquivoDoLogo('compacto', 'escuro'));
    expect(arquivoDoLogo('compacto', 'claro')).not.toBe(arquivoDoLogo('compacto', 'escuro'));
  });

  it('L2 a medida do PDF sai da proporção do arquivo (nunca o 2:1 do logo antigo)', () => {
    const m = medidaDoLogoPdf(45);
    expect(m.w).toBe(45);
    expect(Math.abs(m.w / m.h - PROPORCAO_DO_LOGO.horizontal)).toBeLessThan(0.02);
    expect(m.w / m.h).toBeGreaterThan(4);
  });

  it('L3 o componente desenha o arquivo da variante, com o nome e a assinatura no alt; o carregando traz o logo e a frase', () => {
    render(<LogoAgroinblue variante="compacto" fundo="escuro" alturaPx={20} />);
    const img = screen.getByTestId('logo-agroinblue');
    expect(img.getAttribute('src')).toBe(arquivoDoLogo('compacto', 'escuro'));
    expect(img.getAttribute('alt')).toBe('AGROinBLUE · Gestão rural inteligente');
    expect(img.style.height).toBe('20px');
    render(<CarregandoAgroinblue frase="Carregando fazendas..." />);
    expect(screen.getByTestId('carregando-agroinblue').textContent).toContain('Carregando fazendas...');
  });
});
