/* FECH-P2-TRAVA-AVISO-01 — a regra das duas marcas (a do `_fn_fechamento_p2_travado`), a leitura e as frases da tela. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const respostas: Record<string, { data: unknown; error: unknown }> = {};
const filtros: Record<string, Array<[string, string]>> = {};
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      filtros[tabela] = [];
      const q = {
        select: () => q,
        eq: (c: string, v: string) => { filtros[tabela].push([c, v]); return q; },
        maybeSingle: async () => respostas[tabela],
      };
      return q;
    },
  },
}));

import {
  estadoDoP2, lerEstadoDoP2, ehRecusaDaTravaDoP2, fraseDaTravaDoPasto, rotuloReabrirValorRebanho,
  fraseDaTravaAoReabrirMes, fraseRevalidarValorRebanho, lerARevalidar, fraseARevalidar,
} from './travaDoP2';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

beforeEach(() => {
  respostas.valor_rebanho_realizado_validado = { data: null, error: null };
  respostas.valor_rebanho_fechamento = { data: null, error: null };
});

describe('estadoDoP2 — trava com QUALQUER uma das duas marcas', () => {
  it.each([
    ['validado', 'aberto', true, false], // o caso da Baia Grande em set/26: P2 reaberto, validado ficou
    ['validado', 'fechado', true, false],
    [null, 'fechado', true, false],
    ['validado', null, true, false],
    ['invalidado', 'aberto', false, true], // reaberto pela função nova: livre, e pede revalidar
    ['cadeia_quebrada', null, false, true],
    [null, 'aberto', false, false],
    [null, null, false, false], // nunca validado
  ])('validado=%s fechamento=%s → travado %s, revalidar %s', (v, f, travado, revalidar) => {
    expect(estadoDoP2(v, f)).toEqual({ travado, revalidar });
  });
});

describe('lerEstadoDoP2', () => {
  it('lê as duas tabelas pela fazenda e pelo mês', async () => {
    respostas.valor_rebanho_realizado_validado = { data: { status: 'validado' }, error: null };
    respostas.valor_rebanho_fechamento = { data: { status: 'aberto' }, error: null };
    expect(await lerEstadoDoP2('faz', '2026-09')).toEqual({ ok: true, valor: { travado: true, revalidar: false } });
    for (const t of ['valor_rebanho_realizado_validado', 'valor_rebanho_fechamento']) {
      expect(filtros[t]).toEqual([['fazenda_id', 'faz'], ['ano_mes', '2026-09']]);
    }
  });

  it('leitura que falha NUNCA vira "livre"', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    respostas.valor_rebanho_fechamento = { data: null, error: { message: 'x' } };
    const r = await lerEstadoDoP2('faz', '2026-09');
    expect(r.ok).toBe(false);
    erro.mockRestore();
  });
});

describe('frases (Gabriel 31/10)', () => {
  it('o mês curto e o texto inteiro', () => {
    expect(fraseDaTravaDoPasto('2026-09')).toBe('O Valor do Rebanho de set/26 está validado. Reabra-o para editar os pastos deste mês.');
    expect(rotuloReabrirValorRebanho('2026-09')).toBe('Reabrir Valor do Rebanho de set/26');
    expect(fraseDaTravaAoReabrirMes('2026-09')).toBe('O Valor do Rebanho de set/26 está validado: para salvar mudanças nos pastos, reabra-o também.');
    expect(fraseRevalidarValorRebanho('2026-12')).toBe('Revalide o Valor do Rebanho de dez/26 (o peso mudou).');
  });

  it('reconhece a recusa do banco (salvar, reabrir e itens) e só ela', () => {
    expect(ehRecusaDaTravaDoP2('Mês 2026-09 possui Valor do Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar pastos.')).toBe(true);
    expect(ehRecusaDaTravaDoP2('Card fechado não se salva.')).toBe(false);
    expect(ehRecusaDaTravaDoP2(null)).toBe(false);
  });
});

describe('FECH-REVALIDAR-AVISO-01 — a pendência "revalidar" é UM estado (a linha invalidada), não um aviso a cada Salvar', () => {
  it('só o status invalidado entra (validado não; linha torta não), em ordem de mês e fazenda', () => {
    expect(lerARevalidar([
      { fazenda_id: 'b', ano_mes: '2026-09', status: 'invalidado' },
      { fazenda_id: 'a', ano_mes: '2026-09', status: 'validado' },
      { fazenda_id: 'c', ano_mes: '2026-08', status: 'invalidado' },
      { fazenda_id: 3, ano_mes: '2026-07', status: 'invalidado' },
      null,
    ])).toEqual([{ fazendaId: 'c', anoMes: '2026-08' }, { fazendaId: 'b', anoMes: '2026-09' }]);
    expect(lerARevalidar(null)).toEqual([]);
  });
  it('a frase do item', () => {
    expect(fraseARevalidar('2026-09')).toBe('Valor do Rebanho de set/26 a revalidar');
  });
});

describe('FECH-REVALIDAR-AVISO-01 — a trava das duas pontas', () => {
  const fonte = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8');
  it('o Salvar do modal do pasto não avisa "revalide" (a frase não volta ao modal)', () => {
    expect(fonte('src/components/FechamentoPastoDialog.tsx')).not.toMatch(/fraseRevalidarValorRebanho|Revalide o Valor/);
  });
  it('a Visão Geral lê a pendência pelo leitor daqui e o item leva ao Valor do Rebanho da fazenda', () => {
    const vg = fonte('src/v2/pages/V2Home.tsx');
    expect(vg).toMatch(/useValorRebanhoARevalidar\(idsARevalidar\)/);
    /* VISAO-GERAL-04 V3 (Gabriel 08/11): a pendência de mês anterior fica com o mês dela; a de mês posterior ao selecionado nunca aparece */
    expect(vg).toMatch(/const revalidarDoMes = aRevalidar\.pendentes\.filter\(r => r\.anoMes <= anoMesVG\)/);
    expect(vg).toMatch(/revalidarDoMes\.map/);
    expect(vg).toMatch(/onIrPara\?\.\('valor-rebanho', r\.fazendaId\)/);
  });
});
