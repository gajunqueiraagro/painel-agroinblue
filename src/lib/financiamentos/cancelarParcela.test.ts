/**
 * PARC-CADEIA-01 passo 2 — o dono puro do aviso de parcela de compra parcelada: lê o retorno da simulação do banco e diz o que
 * a tela escreve e oferece. Nenhuma conta aqui: os números são os do banco.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  antesDepois, caminhoInicial, caminhosDoCancelamento, dadosDaParcela, fraseDoLote, lerPreviaCancelarParcela, rotuloDoBotao,
  separarParcelas, tituloDoCancelamento, SEM_NOTA,
} from './cancelarParcela';

/* o retorno de `fn_parcelamento_cancelar_parcela` (forma lida do banco; valores sintéticos) */
const SO_ESTA = {
  ok: true, escopo: 'so_esta', simulado: true,
  contrato: { id: 'fin-1', descricao: 'Parcela 3 - None', credor: 'Nova Lineagro' },
  parcela: { id: 'par-3', numero: 3, total: 4, valor: 341.35, vencimento: '2026-10-06', paga: false, lancamento_id: 'lan-3' },
  nota: '5510', antes: { parcelas: 4, valor_total: 1365.38 }, depois: { parcelas: 3, valor_total: 1024.03 }, todas: null, recusa: null,
};
const TODAS = { ...SO_ESTA, escopo: 'todas', depois: { parcelas: 0, valor_total: 0 }, todas: { lancamentos: 4, parcelas: 4 } };

describe('lerPreviaCancelarParcela', () => {
  it('lê o retorno do banco sem mudar número nenhum', () => {
    const p = lerPreviaCancelarParcela(SO_ESTA);
    expect(p).toMatchObject({
      escopo: 'so_esta', contrato: { id: 'fin-1', descricao: 'Parcela 3 - None', credor: 'Nova Lineagro' },
      parcela: { numero: 3, total: 4, valor: 341.35, vencimento: '2026-10-06', paga: false }, nota: '5510',
      antes: { parcelas: 4, valorTotal: 1365.38 }, depois: { parcelas: 3, valorTotal: 1024.03 }, todas: null, recusa: null,
    });
    expect(lerPreviaCancelarParcela(TODAS)?.todas).toEqual({ lancamentos: 4, parcelas: 4 });
  });
  it('a recusa vem com a frase do banco', () => {
    const p = lerPreviaCancelarParcela({ ...SO_ESTA, ok: false, recusa: { motivo: 'paga', frase: 'A parcela 3 já está paga: desfaça o pagamento antes.' } });
    expect(p?.recusa).toEqual({ motivo: 'paga', frase: 'A parcela 3 já está paga: desfaça o pagamento antes.' });
  });
  it('peça torta invalida a leitura INTEIRA (nunca zero no lugar do que faltou)', () => {
    expect(lerPreviaCancelarParcela(null)).toBeNull();
    expect(lerPreviaCancelarParcela({ ...SO_ESTA, depois: { parcelas: 3 } })).toBeNull();
    expect(lerPreviaCancelarParcela({ ...SO_ESTA, antes: null })).toBeNull();
    expect(lerPreviaCancelarParcela({ ...SO_ESTA, escopo: 'outra' })).toBeNull();
    expect(lerPreviaCancelarParcela({ ...SO_ESTA, parcela: { ...SO_ESTA.parcela, valor: 'x' } })).toBeNull();
    expect(lerPreviaCancelarParcela({ ...TODAS, todas: null })).toBeNull();
    /* a busca sabe achar: o retorno bom é lido */
    expect(lerPreviaCancelarParcela(SO_ESTA)).not.toBeNull();
  });
});

describe('o que a tela escreve', () => {
  const p = lerPreviaCancelarParcela(SO_ESTA)!;
  it('título numa linha: "Parcela 3/4 de «Nome do contrato»"', () => {
    expect(tituloDoCancelamento(p)).toBe('Parcela 3/4 de «Parcela 3 - None»');
  });
  it('linha de dados: credor · nota (pelo dono do rótulo) · vencimento · valor', () => {
    expect(dadosDaParcela(p)).toEqual({ credor: 'Nova Lineagro', nota: 'NF 000.005.510', vencimento: '06/10/2026', valor: expect.stringContaining('341,35') });
  });
  it('sem nota e sem credor: diz, não deixa em branco', () => {
    const q = lerPreviaCancelarParcela({ ...SO_ESTA, nota: null, contrato: { ...SO_ESTA.contrato, credor: null } })!;
    expect(dadosDaParcela(q).nota).toBe(SEM_NOTA);
    expect(dadosDaParcela(q).credor).toBe('sem credor');
  });
  it('antes × depois: os números do banco, só escritos', () => {
    const l = antesDepois(p);
    expect(l.map(x => x.rotulo)).toEqual(['Parcelas', 'Total da compra']);
    expect([l[0].antes, l[0].depois]).toEqual(['4', '3']);
    expect(l[1].antes).toContain('1.365,38');
    expect(l[1].depois).toContain('1.024,03');
  });
});

describe('os caminhos que gravam', () => {
  const so = lerPreviaCancelarParcela(SO_ESTA)!;
  const todas = lerPreviaCancelarParcela(TODAS)!;
  it('os dois valem: nasce em "só esta"; "a compra inteira" diz quantos lançamentos saem (o número do banco)', () => {
    const c = caminhosDoCancelamento(so, todas);
    expect(c.map(x => [x.escopo, x.recusa])).toEqual([['so_esta', null], ['todas', null]]);
    expect(c[0].explica).toBe('A compra passa a 3 parcelas e o total é recalculado.');
    expect(c[1].explica).toBe('4 lançamentos serão cancelados, com as parcelas e o contrato.');
    expect(caminhoInicial(c)).toBe('so_esta');
    expect(rotuloDoBotao('so_esta')).toBe('Cancelar parcela');
    expect(rotuloDoBotao('todas')).toBe('Cancelar a compra');
  });
  it('o caminho que o banco recusa fica com a FRASE da recusa, e o inicial pula para o que vale', () => {
    const ultima = lerPreviaCancelarParcela({ ...SO_ESTA, recusa: { motivo: 'ultima_viva', frase: 'Esta é a última parcela da compra: cancele a compra inteira.' } })!;
    const c = caminhosDoCancelamento(ultima, todas);
    expect(c[0].recusa).toBe('Esta é a última parcela da compra: cancele a compra inteira.');
    expect(caminhoInicial(c)).toBe('todas');
  });
  it('os dois recusados: nenhum caminho nasce marcado', () => {
    const paga = lerPreviaCancelarParcela({ ...SO_ESTA, recusa: { motivo: 'paga', frase: 'A parcela 3 já está paga: desfaça o pagamento antes.' } })!;
    const comPaga = lerPreviaCancelarParcela({ ...TODAS, recusa: { motivo: 'ha_paga', frase: 'A parcela 3 já está paga: desfaça o pagamento antes de cancelar a compra.' } })!;
    expect(caminhoInicial(caminhosDoCancelamento(paga, comPaga))).toBeNull();
  });
  it('enquanto a simulação de "todas" não chega o caminho fica apagado; com erro, a frase do erro', () => {
    expect(caminhosDoCancelamento(so, null)[1].recusa).toBe('calculando…');
    expect(caminhosDoCancelamento(so, null, 'sem acesso a este registro')[1].recusa).toBe('sem acesso a este registro');
  });
});

describe('o lote', () => {
  it('a parcela de compra parcelada é PULADA, na ordem; as demais seguem', () => {
    expect(separarParcelas(['a', 'p1', 'b', 'p2'], new Set(['p1', 'p2', 'x']))).toEqual({ cancelaveis: ['a', 'b'], puladosParcela: ['p1', 'p2'] });
    expect(separarParcelas(['a'], new Set())).toEqual({ cancelaveis: ['a'], puladosParcela: [] });
  });
  it('a frase diz quantas e por quê', () => {
    expect(fraseDoLote(1)).toBe('1 parcela de compra parcelada: cancele uma a uma.');
    expect(fraseDoLote(3)).toBe('3 parcelas de compra parcelada: cancele uma a uma.');
  });
});

/* ── as portas, lidas da FONTE: todas perguntam ao MESMO dono, e nenhuma decide por origem ─────────────────────────── */
describe('as quatro portas passam pelo mesmo dono', () => {
  const ler = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
  const modal = ler('components/financeiro-v2/LancamentoV2Dialog.tsx');
  const leitura = ler('components/financeiro-v2/LancamentoLeituraDialog.tsx');
  const hook = ler('hooks/useFinanceiroV2.ts');
  const cpr = ler('components/financeiro-v2/ContasPagarReceberTab.tsx');
  const lista = ler('pages/FinanceiroV2Tab.tsx');
  const shell = ler('v2/V2Index.tsx');
  const dono = readFileSync(resolve(__dirname, 'cancelarParcela.ts'), 'utf8');

  it('(a) e (c) — o cancelar do modal do lançamento (lista e Contas a Pagar) pergunta ao banco antes da confirmação de sempre', () => {
    expect(modal).toContain('onCancelar={() => { void abrirCancelamento(); }}');
    expect(modal).toContain('const previa = id ? await consultarParcelaDoLancamento(id) : null;');
    expect(modal).toContain('if (previa) setParcelaACancelar(previa);\n    else setConfirmandoCancelamento(true);');
    expect(modal).toContain('<CancelarParcelaDialog');
    /* o caminho antigo, direto na confirmação, saiu do botão */
    expect(modal).not.toContain("onCancelar={() => { setMotivoCancelamento(''); setConfirmandoCancelamento(true); }}");
  });
  it('(d) — a ficha de leitura pergunta ao mesmo dono', () => {
    expect(leitura).toContain('const previa = await consultarParcelaDoLancamento(id);');
    expect(leitura).toContain('<CancelarParcelaDialog');
    expect(leitura).not.toContain('onClick={() => setConfirmCancel(true)}>Cancelar lançamento');
  });
  it('(b) — o lote pula as parcelas pelo dono, com a lista do banco, ANTES de qualquer escrita', () => {
    expect(hook).toContain("rpc('fn_parcelas_dos_lancamentos', { p_cliente_id: clienteId })");
    expect(hook).toContain('const { cancelaveis, puladosParcela } = separarParcelas(semOC, parcelasVivas);');
    expect(hook.indexOf('separarParcelas(semOC, parcelasVivas)')).toBeLessThan(hook.indexOf('// Universal soft delete in batches of 100'));
    expect(lista).toContain('toast.warning(fraseDoLote(result.puladosParcela.length));');
  });
  it('"Abrir o contrato" só para quem acessa a tela, e a volta retorna à origem', () => {
    expect(lista).toContain('onAbrirContrato={podeAbrirFinanciamento ? onAbrirFinanciamento : undefined}');
    expect(cpr).toContain('guardarRetornoCpr({ visao, atalho, datas, incluirVencidos, contaSel, segmento, statusLigados, ampliado });');
    expect(shell).toContain("onAbrirFinanciamento={podeAbrirTela('financiamentos') ? (id) => {\n          setOrigemDoFinanciamento('contas-a-pagar-receber');");
    expect(shell).toContain('setSection(origemDoFinanciamento);');
    expect(shell).not.toContain("setFinanciamentoIdAlvo(null);\n          setSection('financeiro-lanc');");
  });
  it('o dono não faz conta nem decide por origem (o detector sabe achar)', () => {
    const semComentario = dono.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const proibido of ['.reduce(', '+=', 'origem_lancamento', 'origem_tipo']) expect(semComentario).not.toContain(proibido);
    expect('x.reduce((a, b) => a + b, 0)').toContain('.reduce(');
  });
});
