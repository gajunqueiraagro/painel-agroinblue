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
  favorecido: null, favorecidoId: null, conta: 'Sicredi Lavoura', contaId: 'CONTA-1',
  pago: 0, conciliadoEm: null, conciliado: false, ...extra,
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

  /* ⚠ O CASO QUE A FASE 1 ERRAVA. O gatilho da conciliação promove a 'realizado' já no primeiro
     centavo aplicado, sem olhar valor — então um PARCIAL chega com status de pago. Decidir pelo
     status dizia "Pago" com R$ 3.647,60 faltando. */
  it('parcial: status realizado mas aplicado menor que o valor', () => {
    const linhas = montarCompromissos(
      [l('frete', 5647.60, '-1', { statusTransacao: 'realizado', pago: 2000, conciliado: true })],
      40.34, 1.05);
    const f = linhas[0];
    expect(f.status).toBe('parcial');
    expect(f.pago).toBe(2000);
    expect(f.falta).toBeCloseTo(3647.60, 2);
  });

  it('quitado não deve nada; sem aplicado deve tudo', () => {
    const linhas = montarCompromissos(
      [l('frete', 5647.60, '-1'),
       l('trator', 2017, '-1', { statusTransacao: 'realizado', pago: 2017, conciliado: true })],
      40.34, 1.05);
    expect(linhas.find(x => x.papel === 'frete')?.falta).toBe(5647.60);
    expect(linhas.find(x => x.papel === 'frete')?.status).toBe('programado');
    expect(linhas.find(x => x.papel === 'trator')?.falta).toBe(0);
    expect(linhas.find(x => x.papel === 'trator')?.status).toBe('pago');
  });

  /* ⚠ TOLERÂNCIA DE UM CENTAVO, copiada de `_oc_estado_liquidacao`: sem ela um arredondamento
     deixaria o compromisso eternamente "Parcial · falta R$ 0,00", que parece defeito. */
  it('um centavo de diferença já conta como quitado', () => {
    const linhas = montarCompromissos([l('trator', 2017, '-1', { pago: 2016.995 })], 40.34, 1.05);
    expect(linhas[0].status).toBe('pago');
    expect(linhas[0].falta).toBe(0);
  });

  it('pagar mais que o valor não vira dívida negativa', () => {
    const linhas = montarCompromissos([l('trator', 2017, '-1', { pago: 2500 })], 40.34, 1.05);
    expect(linhas[0].status).toBe('pago');
    expect(linhas[0].falta).toBe(0);
    expect(linhas[0].pago).toBe(2017);
  });

  /* ⚠ A TELA PERGUNTA ANTES DE MOSTRAR O CAMPO, com as mesmas três condições da guarda da RPC —
     avisar depois de o operador digitar é pior que não deixar digitar. */
  it('editável só quando não há conciliação nenhuma', () => {
    const linhas = montarCompromissos([
      l('frete', 100, '-1'),
      l('trator', 100, '-1', { conciliado: true }),
      l('mao_obra', 100, '-1', { statusTransacao: 'realizado' }),
      l('icms', 100, '-1', { conciliadoEm: '2026-09-01T00:00:00Z' }),
    ], 40.34, 1.05);
    const por = (p: string) => linhas.find(x => x.papel === p)!;
    expect(por('frete').editavel).toBe(true);
    expect(por('frete').motivoTravado).toBeNull();
    for (const p of ['trator', 'mao_obra', 'icms']) {
      expect(por(p).editavel).toBe(false);
      expect(por(p).motivoTravado).toBeTruthy();
    }
  });

  it('papel desconhecido aparece com o próprio nome, em vez de sumir', () => {
    const linhas = montarCompromissos([l('taxa_nova', 10, '-1')], 40.34, 1.05);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].rotulo).toBe('taxa_nova');
  });
});

describe('statusDaLinha', () => {
  it('decide pelo aplicado, não pelo status', () => {
    expect(statusDaLinha(-2017, 2017)).toBe('pago');
    expect(statusDaLinha(-2017, 1000)).toBe('parcial');
    expect(statusDaLinha(-2017, 0)).toBe('programado');
    /* Centavo de sobra é quitado; centavo aplicado já é parcial. */
    expect(statusDaLinha(-2017, 2016.995)).toBe('pago');
    expect(statusDaLinha(-2017, 0.02)).toBe('parcial');
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
    const pago = CARGA.map(x => (x.papel === 'frete' ? { ...x, pago: 5647.60 } : x));
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
    const pago = CARGA.map(x => (x.papel === 'icms' ? { ...x, pago: 2470.26 } : x));
    const t = topoFinanceiro(montarCompromissos(pago, 40.34, 1.05));
    expect(t.pagas).toBeCloseTo(2470.26, 2);
    expect(t.recebido).toBe(0);
    expect(t.despesas).toBeCloseTo(16118.00, 2);
  });

  /* ⚠ AS CAIXAS SOMAM O APLICADO, não o valor da linha. Com um parcial de 2.000 num compromisso
     de 5.647,60, "Pagas" tem de dizer 2.000 — dizer o valor inteiro afirmaria que saiu do caixa
     dinheiro que não saiu, justamente na caixa que se confere contra o extrato. */
  it('parcial entra pelo que foi aplicado, não pelo valor cheio', () => {
    const pago = CARGA.map(x => (x.papel === 'frete' ? { ...x, pago: 2000 } : x));
    const t = topoFinanceiro(montarCompromissos(pago, 40.34, 1.05));
    expect(t.pagas).toBe(2000);
    expect(t.despesas).toBeCloseTo(16118.00, 2);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────
   RECONSTRUÇÃO — a guarda que precede a retirada da trava (PR-MANDIOCA-FASE3).
   ──────────────────────────────────────────────────────────────────────────────────────────── */
import { reconstruirCarga, totalDoServico } from '@/lib/agri/compromissosDaCarga';

/* Os lançamentos REAIS da NF 9287581, lidos do proto em 21/09/2026 depois da fusão.
   Os ids de favorecido são os do banco. */
const r = (papel: string, valor: number, favorecidoId: string | null): LancamentoDaCarga => ({
  lancamentoId: `L-${papel}`, papel, valor, sinal: papel === 'venda' ? '1' : '-1',
  statusTransacao: 'programado', dataVencimento: '2026-08-21',
  favorecido: null, favorecidoId, conta: null, contaId: null,
  pago: 0, conciliadoEm: null, conciliado: false,
});

const CARGA_9287581: LancamentoDaCarga[] = [
  r('venda', 20585.50, '28fd64af-20d4-4a76-96f5-61061bb0f024'),
  r('arranquio', 5647.60, 'c9ccdb59-51db-4aaf-82a9-b84a9460bb75'),
  r('frete', 5647.60, '3a67853a-07f1-42f7-9061-51ec15a71433'),
  r('carregamento', 2017.00, '7b56949a-35ff-4220-9ae6-1c146f67bfdf'),
  r('icms', 2470.26, '948cab3f-52e3-46bd-b4b8-3e022828125b'),
  r('funrural', 335.54, '28fd64af-20d4-4a76-96f5-61061bb0f024'),
];

describe('reconstruirCarga', () => {
  /* ⚠ ESTE É O TESTE QUE AUTORIZA A TRAVA A SAIR. Enquanto o formulário reabria com serviços
     vazios, salvar apagava dinheiro — foi o que aconteceu nesta carga em 21/09. Os números aqui
     são os do proto: se algum dia ele falhar, o salvar volta a ser destrutivo. */
  it('devolve os R$/t que foram negociados, e não zero', () => {
    const c = reconstruirCarga(CARGA_9287581, 40.34);
    const por = (t: string) => c.servicos.find(s => s.tipo === t);
    expect(por('mao_obra')?.preco_t).toBe(140);
    expect(por('trator')?.preco_t).toBe(50);
    expect(por('frete')?.preco_t).toBe(140);
    expect(c.servicos).toHaveLength(3);
  });

  it('os impostos vêm inteiros, sem dividir por tonelada', () => {
    const c = reconstruirCarga(CARGA_9287581, 40.34);
    expect(c.icms).toBeCloseTo(2470.26, 2);
    expect(c.funrural).toBeCloseTo(335.54, 2);
    /* Esta carga não tem os dois novos — e ausência é `null`, não zero. */
    expect(c.inss).toBeNull();
    expect(c.icmsTransporte).toBeNull();
  });

  /* ⚠ O ID, NÃO O NOME: o payload grava `fornecedor_id`. Reconstruir por texto criaria um segundo
     cadastro com o mesmo nome na primeira gravação. */
  it('cada serviço volta com o favorecido que tinha', () => {
    const c = reconstruirCarga(CARGA_9287581, 40.34);
    expect(c.servicos.find(s => s.tipo === 'mao_obra')?.fornecedor_id)
      .toBe('c9ccdb59-51db-4aaf-82a9-b84a9460bb75');
    expect(c.servicos.find(s => s.tipo === 'frete')?.fornecedor_id)
      .toBe('3a67853a-07f1-42f7-9061-51ec15a71433');
    expect(c.servicos.find(s => s.tipo === 'trator')?.fornecedor_id)
      .toBe('7b56949a-35ff-4220-9ae6-1c146f67bfdf');
  });

  it('os nomes novos do serviço reconstroem igual aos antigos', () => {
    const c = reconstruirCarga(
      [r('mao_obra', 5647.60, 'F1'), r('trator', 2017, 'F2'), r('frete', 5647.60, 'F3')], 40.34);
    expect(c.servicos.map(s => `${s.tipo}:${s.preco_t}`).sort())
      .toEqual(['frete:140', 'mao_obra:140', 'trator:50']);
  });

  /* ⚠ SEM TONELADAS, `null` — NUNCA ZERO. Zero num preço de serviço é "de graça", e um payload
     que promete serviço gratuito apaga dinheiro exatamente como o payload vazio apagava. */
  it('sem toneladas o preço é ausência, não zero', () => {
    for (const t of [null, 0]) {
      const c = reconstruirCarga(CARGA_9287581, t);
      expect(c.servicos.every(s => s.preco_t === null)).toBe(true);
      /* e o imposto continua vindo: ele não depende do peso */
      expect(c.icms).toBeCloseTo(2470.26, 2);
    }
  });

  /* ⚠ DOIS NOMES DO MESMO SERVIÇO NÃO VIRAM DUAS LINHAS: o payload levaria o tipo duas vezes e a
     RPC gravaria dois lançamentos onde havia um. */
  it('arranquio e mao_obra na mesma carga produzem UM serviço', () => {
    const c = reconstruirCarga([r('arranquio', 100, 'F1'), r('mao_obra', 200, 'F2')], 10);
    expect(c.servicos.filter(s => s.tipo === 'mao_obra')).toHaveLength(1);
  });

  it('carga sem serviço nenhum devolve lista vazia, sem inventar', () => {
    const c = reconstruirCarga([r('venda', 1000, 'F1')], 10);
    expect(c.servicos).toEqual([]);
    expect(c.icms).toBeNull();
  });
});

describe('totalDoServico', () => {
  /* ⚠ IDA E VOLTA SEM PERDER CENTAVO: é o invariante que liga as duas funções. Reabrir a carga
     (valor -> preco_t) e salvá-la sem tocar em nada (preco_t -> valor) tem de devolver o mesmo
     número — senão cada abertura moveria um centavo do compromisso. */
  it('desfaz a reconstrução sem mover centavo', () => {
    const c = reconstruirCarga(CARGA_9287581, 40.34);
    const por = (t: string) => c.servicos.find(s => s.tipo === t)?.preco_t ?? null;
    expect(totalDoServico(por('mao_obra'), 40.34)).toBeCloseTo(5647.60, 2);
    expect(totalDoServico(por('trator'), 40.34)).toBeCloseTo(2017.00, 2);
    expect(totalDoServico(por('frete'), 40.34)).toBeCloseTo(5647.60, 2);
  });

  it('sem preço ou sem peso é ausência, não zero', () => {
    expect(totalDoServico(null, 40.34)).toBeNull();
    expect(totalDoServico(140, null)).toBeNull();
    expect(totalDoServico(140, 0)).toBeNull();
  });

  it('arredonda em duas casas', () => {
    expect(totalDoServico(140.005, 1)).toBeCloseTo(140.01, 2);
    expect(totalDoServico(33.333, 3)).toBeCloseTo(100, 2);
  });
});
