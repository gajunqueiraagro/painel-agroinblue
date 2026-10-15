import { describe, it, expect } from 'vitest';
import { camposDaEspecie, especiesDaOC, arrobasDoPeso, retencoesDoAcerto, mediaDoRomaneio, pctDoBruto } from './camposDaEspecie';
import { formAbateDoDetalhe, formAbateVazio, payloadDoFormAbate, pendenciasDoFormAbate, type FormAbate } from './formDocumentoAbate';
import type { DocumentoDetalhe } from '@/hooks/useOperacaoDocumentos';

/* OC-DOC-ESPECIE-ABATE-01 passo 2 — o dono dos campos e o formulario <-> documento. */
const rotulos = (tipo: string, e: Parameters<typeof camposDaEspecie>[1]) =>
  (camposDaEspecie(tipo, e) ?? []).map(l => l.map(c => `${c.rotulo}${c.obrigatorio ? '*' : ''}${c.calculado ? '=' : ''}`));

describe('camposDaEspecie', () => {
  it('abate oferece NF, NPR, Acerto, Romaneio e Outro; compra e venda as 4 de sempre', () => {
    expect(especiesDaOC('abate')).toEqual(['nf_principal', 'npr', 'acerto', 'romaneio', 'outro']);
    expect(especiesDaOC('compra')).toEqual(['nf_principal', 'nf_complementar', 'recibo', 'outro']);
    expect(especiesDaOC('venda')).toEqual(['nf_principal', 'nf_complementar', 'recibo', 'outro']);
  });

  it('compra e venda nao tem grade: seguem com o formulario de hoje', () => {
    for (const t of ['compra', 'venda']) for (const e of especiesDaOC(t)) expect(camposDaEspecie(t, e)).toBeNull();
  });

  it('NF: as 5 linhas do briefing', () => {
    expect(rotulos('abate', 'nf_principal')).toEqual([
      ['Número*', 'Série*', 'Emissão*', 'Data do abate', 'Lote'],
      ['Emitente*', 'Chave de acesso'],
      ['Cab*', 'Carcaça kg*', '@=', 'R$/@', 'Bruto R$*'],
      ['Funrural', 'SENAR', 'Seguro', 'RAT', 'Retenções R$='],
      ['Líquido R$=', 'NF produtor', 'Valor NF produtor', 'Observação'],
    ]);
  });

  it('Acerto: sem serie; o liquido digitado e as retencoes calculadas', () => {
    expect(rotulos('abate', 'acerto')).toEqual([
      ['Ordem compra / Pedido*', 'Lote frigorífico', 'Data do abate*', 'Vencimento', 'Lote'],
      ['Cab*', 'Carcaça kg*', '@=', 'R$/@', 'Bruto R$*'],
      ['Retenções R$=', 'Incentivo R$', 'Líquido R$*', 'Observação'],
    ]);
  });

  it('NPR e Romaneio', () => {
    expect(rotulos('abate', 'npr')).toEqual([
      ['Número*', 'Emissão', 'Vencimento*', 'Valor R$*', 'NF referida'],
      ['Observação'],
    ]);
    expect(rotulos('abate', 'romaneio')).toEqual([
      ['Data do abate*', 'OP', 'Lote frigorífico', 'Cab', 'Peso total kg'],
      ['Média kg=', 'Lote*', 'Observação'],
    ]);
  });

  it('toda linha cabe nas 5 colunas, e nenhuma especie passa das 5 linhas da NF', () => {
    for (const e of especiesDaOC('abate')) {
      const linhas = camposDaEspecie('abate', e)!;
      expect(linhas.length).toBeLessThanOrEqual(5);
      for (const l of linhas) expect(l.reduce((s, c) => s + c.colunas, 0)).toBeLessThanOrEqual(5);
    }
  });

  it('derivados so para exibir', () => {
    expect(arrobasDoPeso(12906.5)).toBe(860.43);
    expect(retencoesDoAcerto(98135.31, 96535.70)).toBe(1599.61);
    expect(mediaDoRomaneio(54, 12906.5)).toBe(239.01);
    expect(pctDoBruto(1295.39, 98135.31)).toBe(1.32);
    expect(arrobasDoPeso(null)).toBeNull();
  });
});

const detalhe = (p: Partial<DocumentoDetalhe>): DocumentoDetalhe => ({
  documentoId: 'd1', versao: 3, especie: 'nf_principal', numero: '', serie: '', chaveAcesso: '', dataEmissao: '', observacao: '',
  url: '', documentoOrigemId: null, emitenteId: null, emitenteNome: '', emitenteDocumento: '', componentes: [], loteIds: [], ...p,
});

describe('formDocumentoAbate', () => {
  it('NF: Funrural, SENAR e Seguro viram componentes; Seguro com tipo proprio; o resto preservado', () => {
    const f = formAbateDoDetalhe(detalhe({
      numero: '000.008.812', serie: '1', componentes: [
        { tipo: 'valor_bruto', natureza: 'acrescimo', valor: 98135.31, ordem: 1 },
        { tipo: 'funrural', natureza: 'retencao_sem_caixa', valor: 1295.39, ordem: 2 },
        { tipo: 'senar', natureza: 'retencao_sem_caixa', valor: 196.27, ordem: 3 },
        { tipo: 'seguro', natureza: 'retencao_sem_caixa', valor: 107.95, ordem: 4 },
        { tipo: 'bonificacao', natureza: 'acrescimo', valor: 10, ordem: 5 },
      ],
    }));
    expect([f.bruto, f.funrural, f.senar, f.seguro]).toEqual([98135.31, 1295.39, 196.27, 107.95]);
    expect(f.preservados.map(c => c.tipo)).toEqual(['bonificacao']);
    const p = payloadDoFormAbate(f);
    expect(p.componentes.map(c => `${c.ordem}:${c.tipo}:${c.valor}`))
      .toEqual(['1:valor_bruto:98135.31', '2:funrural:1295.39', '3:senar:196.27', '4:seguro:107.95', '5:bonificacao:10']);
  });

  it('passo 4: o RAT tem tipo proprio na NF; as NFs do produtor vao para dados.nfs_produtor (a NPR segue com nf_referida)', () => {
    const f = formAbateDoDetalhe(detalhe({ componentes: [
      { tipo: 'valor_bruto', natureza: 'acrescimo', valor: 215969.33, ordem: 1 },
      { tipo: 'rat', natureza: 'retencao_sem_caixa', valor: 237.57, ordem: 2 },
      { tipo: 'outros', natureza: 'retencao_sem_caixa', valor: 237.57, ordem: 3, descricao: 'RAT' },
    ], dados: { nfs_produtor: [{ numero: '9444845', data: '2026-10-09', valor: null }] } }));
    expect(f.rat).toBe(237.57);
    expect(f.preservados.map(c => c.tipo)).toEqual(['outros']);
    expect(f.nfsProdutor).toEqual([{ numero: '9444845', data: '2026-10-09', valor: null }]);
    const p = payloadDoFormAbate({ ...f, nfsProdutor: [...f.nfsProdutor, { numero: '9444790', data: null, valor: null }] });
    expect(p.componentes.map(c => c.tipo)).toEqual(['valor_bruto', 'rat', 'outros']);
    expect(p.dados).toEqual({ nfs_produtor: [{ numero: '9444845', data: '2026-10-09', valor: null }, { numero: '9444790', data: null, valor: null }] });
  });

  it('o "outros" de descricao Seguro NAO vira Seguro na tela (so o tipo decide)', () => {
    const f = formAbateDoDetalhe(detalhe({
      componentes: [{ tipo: 'outros', natureza: 'retencao_sem_caixa', valor: 107.95, ordem: 1, descricao: 'Seguro' }],
    }));
    expect(f.seguro).toBeNull();
    expect(f.preservados).toHaveLength(1);
  });

  it('Acerto: grava bruto e a diferenca para o liquido como UMA retencao; reabre com o liquido', () => {
    const f = { ...formAbateVazio('acerto'), ordemCompra: 'OC 10352', dataAbate: '2026-09-30', cab: 54, pesoKg: 12906.5,
      bruto: 98135.31, liquido: 96535.70, precoArroba: 315.5 };
    const p = payloadDoFormAbate(f);
    expect(p.componentes).toEqual([
      { tipo: 'valor_bruto', natureza: 'acrescimo', valor: 98135.31, ordem: 1 },
      { tipo: 'retencao_acerto', natureza: 'retencao_sem_caixa', valor: 1599.61, descricao: 'Retenções do acerto', ordem: 2 },
    ]);
    expect(p.dados).toEqual({ ordem_compra: 'OC 10352', preco_arroba: 315.5 });
    expect([p.cab, p.pesoKg, p.dataAbate, p.vencimento]).toEqual([54, 12906.5, '2026-09-30', null]);
    const de = formAbateDoDetalhe(detalhe({ especie: 'acerto', componentes: p.componentes, dados: p.dados }));
    expect(de.liquido).toBe(96535.70);
    expect(de.ordemCompra).toBe('OC 10352');
  });

  it('editar preserva o que a especie nao desenha (o numero do acerto do backfill)', () => {
    const f = formAbateDoDetalhe(detalhe({ especie: 'acerto', numero: 'Acerto OC 10352', serie: 'X' }));
    const p = payloadDoFormAbate(f);
    expect([p.numero, p.serie]).toEqual(['Acerto OC 10352', 'X']);
    /* a NPR nao desenha cab: no payload a chave nao vai, e o banco mantem */
    expect('cab' in payloadDoFormAbate(formAbateDoDetalhe(detalhe({ especie: 'npr', cab: 7 })))).toBe(false);
  });

  it('documento NOVO nao leva o que se digitou noutra especie', () => {
    const f: FormAbate = { ...formAbateVazio('nf_principal'), numero: '000.000.001', serie: '1', especie: 'romaneio' };
    const p = payloadDoFormAbate(f);
    expect([p.numero, p.serie]).toEqual([undefined, undefined]);
  });

  it('NPR: nf_referida em dados; dados preserva chaves que a tela nao conhece', () => {
    const f = { ...formAbateDoDetalhe(detalhe({ especie: 'npr', dados: { chave_alheia: 1 } })), nfRefNumero: '8812', valor: 96535.7, numero: 'N1', vencimento: '2026-10-20' };
    const p = payloadDoFormAbate(f);
    expect(p.dados).toEqual({ chave_alheia: 1, nf_referida: { numero: '8812' } });
    expect(p.componentes).toEqual([{ tipo: 'valor_bruto', natureza: 'acrescimo', valor: 96535.7, ordem: 1 }]);
  });

  it('pendencias pelos rotulos; o emitente vazio vale como a contraparte', () => {
    expect(pendenciasDoFormAbate(formAbateVazio('acerto'), 'f1').map(p => p.rotulo))
      .toEqual(['Ordem compra / Pedido', 'Data do abate', 'Cab', 'Carcaça kg', 'Bruto R$', 'Líquido R$']);
    expect(pendenciasDoFormAbate(formAbateVazio('nf_principal'), 'f1').map(p => p.rotulo)).not.toContain('Emitente');
    expect(pendenciasDoFormAbate(formAbateVazio('nf_principal'), null).map(p => p.rotulo)).toContain('Emitente');
    const errado = { ...formAbateVazio('acerto'), bruto: 10, liquido: 20 };
    expect(pendenciasDoFormAbate(errado, 'f1').map(p => p.rotulo)).toContain('Líquido maior que o bruto + incentivo');
  });
});
