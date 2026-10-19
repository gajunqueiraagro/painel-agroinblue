/**
 * FIN-CONTRATO-TELA-FONTE-01 — a tela do contrato tem UMA escala de fonte (`ESCALA_DO_CONTRATO`, `TelaDoContratoV3.tsx`) e nada
 * nela corta com "…". Lido da FONTE (o jsdom não faz layout): nas peças da tela não pode haver `truncate`, `text-ellipsis` nem
 * `line-clamp`, e nenhuma fonte passa de 13px (o título). Antes de varrer, o detector se prova num texto com cada defeito.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ESCALA_DO_CONTRATO } from './TelaDoContratoV3';

const ler = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8').replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/.*$/gm, '');

/** o trecho do arquivo de `inicio` (inclusive) até `fim` (exclusive) */
const trecho = (texto: string, inicio: string, fim: string) => {
  const a = texto.indexOf(inicio);
  const b = texto.indexOf(fim, a + inicio.length);
  if (a < 0 || b < 0) throw new Error(`trecho não achado: ${inicio} … ${fim}`);
  return texto.slice(a, b);
};

const CORTE = /\btruncate\b|\btext-ellipsis\b|\bline-clamp-\d/;
const MAIOR_QUE_13 = /\btext-(sm|base|lg|xl|[2-9]xl)\b|\btext-\[(1[4-9]|[2-9]\d)(\.\d+)?px\]/;
const achados = (texto: string) => texto.split('\n').filter((l) => CORTE.test(l) || MAIOR_QUE_13.test(l));

const CONTRATO = ler('ContratoDeCredito.tsx');
const PECAS: Record<string, string> = {
  'FinanciamentoDetalhe.tsx': ler('../../pages/FinanciamentoDetalhe.tsx'),
  'TelaDoContratoV3.tsx': ler('TelaDoContratoV3.tsx'),
  'GradeChaveValor.tsx': ler('../shared/GradeChaveValor.tsx'),
  /* `CabecalhoDoCredito` fica fora: não é montado pela tela (só por um teste antigo) */
  'ContratoDeCredito.tsx · constantes': trecho(CONTRATO, 'const br =', 'export function CabecalhoDoCredito'),
  'ContratoDeCredito.tsx · liberações': trecho(CONTRATO, 'export function BlocoLiberacoes', 'export function BlocoDestinacoes'),
  'ContratoDeCredito.tsx · documentos': trecho(CONTRATO, 'export const BlocoDocumentos', 'function Rotulo('),
  'bloco-formulario.tsx · TituloDoBloco': trecho(ler('../ui/bloco-formulario.tsx'), 'export function TituloDoBloco', 'export function BlocoFormulario'),
};

describe('a fonte da tela do contrato', () => {
  it('o detector sabe achar cada defeito (e não acusa o que é permitido)', () => {
    for (const ruim of ['x truncate y', 'overflow-hidden text-ellipsis', 'line-clamp-2', 'text-sm', 'text-lg', 'text-3xl', 'text-[14px]', 'text-[15.5px]', 'text-[20px]']) {
      expect(achados(`<span className="${ruim}">`), ruim).toHaveLength(1);
    }
    for (const bom of ['text-[13px]', 'text-[10.5px]', 'text-[9.5px]', 'uma-linha-que-rola', 'text-foreground', 'text-xs']) {
      expect(achados(`<span className="${bom}">`), bom).toHaveLength(0);
    }
  });

  it.each(Object.keys(PECAS))('%s: sem "…" e sem fonte acima de 13px', (peca) => {
    expect(achados(PECAS[peca])).toEqual([]);
  });

  it('a escala mora em constantes, com os tamanhos aprovados', () => {
    expect(ESCALA_DO_CONTRATO.titulo).toMatch(/text-\[13px\] font-semibold/);
    expect(ESCALA_DO_CONTRATO.fato).toBe('text-[11px]');
    expect(ESCALA_DO_CONTRATO.cartaoRotulo).toBe('text-[10px]');
    expect(ESCALA_DO_CONTRATO.cartaoValor).toBe('text-[12px] font-semibold');
    expect(ESCALA_DO_CONTRATO.bloco).toBe('text-[11px] font-semibold');
    expect(ESCALA_DO_CONTRATO.th).toBe('text-[10px]');
    expect(ESCALA_DO_CONTRATO.td).toBe('text-[10.5px]');
    expect(ESCALA_DO_CONTRATO.total).toBe('text-[10.5px] font-bold');
    expect(ESCALA_DO_CONTRATO.recado).toBe('text-[11px]');
    expect(ESCALA_DO_CONTRATO.rola).toBe('uma-linha-que-rola');
  });

  it('o título quebra dentro de um lugar de duas linhas, que não empurra a tela', () => {
    const v3 = PECAS['TelaDoContratoV3.tsx'];
    expect(v3).toMatch(/max-h-\[32px\] min-w-0 overflow-y-auto break-words \$\{E\.titulo\}/);
    expect(PECAS['FinanciamentoDetalhe.tsx']).toMatch(/max-h-\[32px\] min-w-0 overflow-y-auto break-words \$\{E\.titulo\}/);
  });

  it('data sempre dd/mm/aaaa nas tabelas de liberações e documentos', () => {
    expect(CONTRATO).toMatch(/const br = \(iso: string \| null\) => \(iso \? `\$\{iso\.slice\(8, 10\)\}\/\$\{iso\.slice\(5, 7\)\}\/\$\{iso\.slice\(0, 4\)\}`/);
  });
});
