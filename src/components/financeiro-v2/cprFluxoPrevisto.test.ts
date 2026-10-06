/**
 * CPR-SALDO-DIA-02 — a etiqueta de "hoje" e o ponto "em conta hoje" do Fluxo.
 * O gráfico não se monta em teste (o jsdom não mede): aqui ficam as duas regras puras e o contrato lido da fonte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ancoraDaTagDeHoje, pontoEmContaHoje, RECUO_DA_TAG_DE_HOJE } from '@/components/financeiro-v2/CprFluxoPrevisto';

const fonte = readFileSync(resolve(__dirname, 'CprFluxoPrevisto.tsx'), 'utf8');

describe('a etiqueta de hoje não encosta no eixo Y', () => {
  it('hoje é o PRIMEIRO ponto (o período começa hoje): ancora pelo começo, à direita do ponto; senão, centrada como sempre', () => {
    expect(ancoraDaTagDeHoje(0)).toBe('start');
    expect(ancoraDaTagDeHoje(1)).toBe('middle');
    expect(ancoraDaTagDeHoje(35)).toBe('middle');
    expect(RECUO_DA_TAG_DE_HOJE).toBeGreaterThanOrEqual(4);          // a distância mínima pedida
  });
  it('as DUAS linhas da etiqueta (palavra e valor) usam a mesma âncora; o traço continua no ponto', () => {
    expect(Array.from(fonte.matchAll(/ancora=\{ancoraHoje\}/g)).length).toBe(2);
    expect(fonte).toContain("const x = ancora === 'start' ? xPonto + RECUO_DA_TAG_DE_HOJE : xPonto;");
    expect(fonte).toContain('<line x1={xPonto} y1={y - 5} x2={xPonto} y2={yTexto + 4}');
    expect(fonte).toContain('textAnchor={ancora}');
    /* a anti-colisão sabe que, à direita, a etiqueta ocupa a largura inteira de um lado só */
    expect(fonte).toContain('paraEsquerda: aDireita ? 0 : meia, paraDireita: aDireita ? inteira + RECUO_DA_TAG_DE_HOJE : meia');
    /* as outras etiquetas (fim do conciliado, saldo final) não ganharam âncora nova */
    expect(Array.from(fonte.matchAll(/ancora=/g)).length).toBe(2);
  });
});

describe('o ponto "em conta hoje"', () => {
  it('existe quando o caixa difere da partida da linha, com os dois números no título', () => {
    const p = pontoEmContaHoje(604088.31, 394164.24);
    expect(p).toMatchObject({ emConta: 604088.31, partida: 394164.24 });
    expect(p?.titulo).toBe('em conta hoje: R$\u00a0604.088,31 · a linha parte de R$\u00a0394.164,24 após os vencidos');
    expect(pontoEmContaHoje(1, -19492.32)?.titulo).toBe('em conta hoje: R$\u00a01,00 · a linha parte de −R$\u00a019.492,32 após os vencidos');
  });
  it('sem vencido que conta (valores iguais ao centavo) NÃO é desenhado em separado; sem caixa, também não', () => {
    expect(pontoEmContaHoje(1000, 1000)).toBeNull();
    expect(pontoEmContaHoje(1000.004, 1000)).toBeNull();
    expect(pontoEmContaHoje(null, 1000)).toBeNull();
    expect(pontoEmContaHoje(1000, null)).toBeNull();
    expect(pontoEmContaHoje(NaN, 1000)).toBeNull();
    /* a busca sabe achar: um centavo de diferença já desenha */
    expect(pontoEmContaHoje(1000.01, 1000)).not.toBeNull();
  });
  it('ponto, legenda e tooltip só existem com ele (lido da fonte)', () => {
    expect(fonte).toContain('const emConta = pontoEmContaHoje(saldoInicial, emHoje.saldo);');
    expect(fonte).toMatch(/\{emConta && \(\s*<ReferenceDot x=\{emHoje\.rotulo\} y=\{emConta\.emConta\}/);
    expect(fonte).toMatch(/\{emConta && \(\s*<span className="flex items-center gap-1\.5 text-\[11px\]"[^>]*data-testid="legenda-em-conta-hoje">/);
    expect(fonte).toContain('<title>{emConta.titulo}</title>');
    expect(fonte).toContain('Em conta hoje');
    expect(fonte).toContain("const emHoje = label === 'Hoje' && emConta ? emConta : null;");
  });
});
