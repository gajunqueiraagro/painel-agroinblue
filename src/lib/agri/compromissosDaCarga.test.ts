import { describe, it, expect } from 'vitest';
import {
  montarCompromissos, resultadoDaCarga, topoFinanceiro, statusDaLinha,
  type LancamentoDaCarga,
} from '@/lib/agri/compromissosDaCarga';

/* A carga real da NF 9287581 — 40,34 t, 486 g, 1,05 R$/g, as duas metades somadas.
   Os valores são os que estavam no proto antes do incidente de 21/09. */
const l = (papel: string, valor: number, sinal: string, extra: Partial<LancamentoDaCarga> = {}): LancamentoDaCarga => ({
  lancamentoId: `L-${papel}`, papel, valor, sinal,
  statusTransacao: 'programado', dataVencimento: '2026-08-21',
  favorecido: null, conta: 'Sicredi Lavoura', ...extra,
});

const CARGA: LancamentoDaCarga[] = [
  l('venda', 20585.50, '1', { favorecido: 'Ind. e Com. de Fecula Olinda Ltda' }),
  l('arranquio', 5647.60, '-1', { favorecido: 'Emerson de Oliveira dos Anjos' }),
  l('frete', 5647.60, '-1', { favorecido: 'André Dias da Rocha' }),
  l('carregamento', 2017.00, '-1', { favorecido: 'Nelson Hafemann' }),
  l('icms', 2470.26, '-1', { favorecido: 'Sefaz MS' }),
  l('funrural', 335.54, '-1', { favorecido: 'Ind. e Com. de Fecula Olinda Ltda' }),
];

describe('montarCompromissos', () => {
  it('ordena pelo dinheiro: entrada, depois serviços, depois impostos', () => {
    const linhas = montarCompromissos(CARGA, 40.34, 1.05);
    expect(linhas.map(x => x.papel)).toEqual([
      'venda', 'arranquio', 'frete', 'carregamento', 'icms', 'funrural',
    ]);
  });

  /* ⚠ O CASO QUE JUSTIFICA O ARQUIVO. A RPC deixou de gravar 'arranquio' e 'carregamento' em
     21/09, mas os 42 lançamentos do backfill continuam com esses papéis até a reclassificação.
     Sem eles no mapa, a aba Financeiro de TODA carga anterior esconderia dois serviços — e o
     operador leria "esta carga não teve mão de obra". */
  it('os nomes antigos de serviço continuam legíveis, com o rótulo novo', () => {
    const linhas = montarCompromissos(CARGA, 40.34, 1.05);
    expect(linhas.find(x => x.papel === 'arranquio')?.rotulo).toBe('Mão de obra');
    expect(linhas.find(x => x.papel === 'carregamento')?.rotulo).toBe('Trator');
  });

  it('a saída recebe sinal negativo e a entrada positivo', () => {
    const linhas = montarCompromissos(CARGA, 40.34, 1.05);
    expect(linhas.find(x => x.papel === 'venda')?.valor).toBe(20585.50);
    expect(linhas.find(x => x.papel === 'frete')?.valor).toBe(-5647.60);
    expect(linhas.find(x => x.papel === 'venda')?.entrada).toBe(true);
  });

  /* ⚠ O DIVISOR É A CARGA INTEIRA. 5.647,60 / 40,34 = 140,00 — o preço contratado. Dividir pela
     metade de 12,15 t devolveria 464,82 R$/t, um número que ninguém negociou. É a mesma raiz do
     incidente de 21/09: a tela editava a metade. */
  it('o R$/t do serviço sai do peso da CARGA INTEIRA', () => {
    const linhas = montarCompromissos(CARGA, 40.34, 1.05);
    expect(linhas.find(x => x.papel === 'frete')?.unitario).toBe('140,00 R$/t');
    expect(linhas.find(x => x.papel === 'carregamento')?.unitario).toBe('50,00 R$/t');
  });

  it('a venda mostra R$/g e o imposto não tem unitário', () => {
    const linhas = montarCompromissos(CARGA, 40.34, 1.05);
    expect(linhas.find(x => x.papel === 'venda')?.unitario).toBe('1,05 R$/g');
    expect(linhas.find(x => x.papel === 'icms')?.unitario).toBeNull();
  });

  it('sem toneladas o serviço não inventa unitário', () => {
    const linhas = montarCompromissos(CARGA, null, 1.05);
    expect(linhas.find(x => x.papel === 'frete')?.unitario).toBeNull();
  });

  it('realizado não deve nada; programado deve tudo', () => {
    const linhas = montarCompromissos(
      [l('frete', 5647.60, '-1'), l('trator', 2017, '-1', { statusTransacao: 'realizado' })],
      40.34, 1.05);
    expect(linhas.find(x => x.papel === 'frete')?.falta).toBe(5647.60);
    expect(linhas.find(x => x.papel === 'frete')?.status).toBe('programado');
    expect(linhas.find(x => x.papel === 'trator')?.falta).toBe(0);
    expect(linhas.find(x => x.papel === 'trator')?.status).toBe('pago');
  });

  it('papel desconhecido aparece com o próprio nome, em vez de sumir', () => {
    const linhas = montarCompromissos([l('taxa_nova', 10, '-1')], 40.34, 1.05);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].rotulo).toBe('taxa_nova');
  });
});

describe('statusDaLinha', () => {
  it('só realizado é pago', () => {
    expect(statusDaLinha('realizado')).toBe('pago');
    expect(statusDaLinha('programado')).toBe('programado');
    expect(statusDaLinha('agendado')).toBe('programado');
    expect(statusDaLinha(null)).toBe('programado');
  });
});

describe('resultadoDaCarga', () => {
  it('venda − impostos − serviços', () => {
    const r = resultadoDaCarga(montarCompromissos(CARGA, 40.34, 1.05));
    expect(r.venda).toBeCloseTo(20585.50, 2);
    expect(r.impostos).toBeCloseTo(2805.80, 2);
    expect(r.servicos).toBeCloseTo(13312.20, 2);
    expect(r.liquido).toBeCloseTo(4467.50, 2);
  });

  /* ⚠ DESPESA PROGRAMADA JÁ É DESPESA DA CARGA. Filtrar pelo pago responderia "quanto saiu do
     caixa", que é a pergunta da conciliação — não a desta tela. */
  it('o resultado não muda quando um serviço vira pago', () => {
    const antes = resultadoDaCarga(montarCompromissos(CARGA, 40.34, 1.05));
    const pago = CARGA.map(x => (x.papel === 'frete' ? { ...x, statusTransacao: 'realizado' } : x));
    expect(resultadoDaCarga(montarCompromissos(pago, 40.34, 1.05))).toEqual(antes);
  });
});

describe('topoFinanceiro', () => {
  it('nada pago: recebido e pagas ficam em zero', () => {
    const t = topoFinanceiro(montarCompromissos(CARGA, 40.34, 1.05));
    expect(t.aReceber).toBeCloseTo(20585.50, 2);
    expect(t.recebido).toBe(0);
    expect(t.despesas).toBeCloseTo(16118.00, 2);
    expect(t.pagas).toBe(0);
  });

  it('o que é pago entra no seu lado, e só nele', () => {
    const pago = CARGA.map(x => (x.papel === 'icms' ? { ...x, statusTransacao: 'realizado' } : x));
    const t = topoFinanceiro(montarCompromissos(pago, 40.34, 1.05));
    expect(t.pagas).toBeCloseTo(2470.26, 2);
    expect(t.recebido).toBe(0);
    expect(t.despesas).toBeCloseTo(16118.00, 2);
  });
});
