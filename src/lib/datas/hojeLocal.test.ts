// PARC-FECHA-02 item 4 — "hoje" e' a data LOCAL do navegador, nunca a UTC.
// O caso do Gabriel: 06/10/2026 as 23:30 em Campo Grande (UTC−4) ja' e' 07/10 em UTC, e a competencia padrao saia 07/10.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

process.env.TZ = 'America/Campo_Grande';

import { dataLocalISO, hojeLocal, mesLocal } from './hojeLocal';

const INSTANTE = '2026-10-06T23:30:00-04:00';

describe('hojeLocal — relogio fixado em 06/10/2026 23:30 (UTC−4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(INSTANTE));
  });
  afterEach(() => vi.useRealTimers());

  it('o teste roda no fuso de Campo Grande e o instante ja e dia 07 em UTC (a busca sabe achar)', () => {
    expect(new Date().getTimezoneOffset()).toBe(240);
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-07');
  });

  it('hoje = 2026-10-06, o dia do calendario de quem esta na tela', () => {
    expect(hojeLocal()).toBe('2026-10-06');
  });

  it('o mes e o do dia local', () => {
    vi.setSystemTime(new Date('2026-09-30T21:00:00-04:00'));
    expect(new Date().toISOString().slice(0, 7)).toBe('2026-10');
    expect(mesLocal()).toBe('2026-09');
  });

  it('dataLocalISO de uma data derivada (hoje + 30 dias) segue o calendario local', () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    expect(d.toISOString().slice(0, 10)).toBe('2026-11-06');
    expect(dataLocalISO(d)).toBe('2026-11-05');
  });
});

// ── fonte: ninguem mais forma "hoje" por toISOString ─────────────────────────────────────────────────────────────────────
const HOJE_EM_UTC = /new Date\(\)\s*\.toISOString\(\)\s*\.(slice|substring|substr)\(0,\s*(10|7)\)|new Date\(\)\s*\.toISOString\(\)\s*\.split\('T'\)/;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    if (!/\.(ts|tsx)$/.test(nome) || /\.test\.(ts|tsx)$/.test(nome)) return [];
    return [caminho];
  });
}

describe('fonte — data de calendario nao sai de toISOString', () => {
  it('o detector acha o caso conhecido', () => {
    expect(HOJE_EM_UTC.test("const today = new Date().toISOString().slice(0, 10);")).toBe(true);
    expect(HOJE_EM_UTC.test("a.download = `x_${new Date().toISOString().split('T')[0]}.csv`")).toBe(true);
    expect(HOJE_EM_UTC.test('const carimbo = new Date().toISOString();')).toBe(false);
  });

  it('nenhum arquivo de src forma "hoje" em UTC', () => {
    const lista = arquivos(join(process.cwd(), 'src'));
    expect(lista.length).toBeGreaterThan(500);
    const achados = lista.filter((caminho) => {
      const fonte = readFileSync(caminho, 'utf8')
        .split('\n')
        .filter((linha) => !/^\s*(\*|\/\/|\/\*)/.test(linha))
        .join('\n');
      return HOJE_EM_UTC.test(fonte);
    });
    expect(achados).toEqual([]);
  });

  it('o modal do lancamento nasce com a competencia de hojeLocal()', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/components/financeiro-v2/LancamentoV2Dialog.tsx'), 'utf8');
    expect(fonte.match(/const today = hojeLocal\(\);/g)?.length).toBe(2);
  });
});
