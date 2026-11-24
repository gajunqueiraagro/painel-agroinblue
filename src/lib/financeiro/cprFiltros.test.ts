/**
 * CPR-LAYOUT-04 — os filtros da CPR (Origem · Forma · Pagamento) e o apelido curto da conta (coluna Banco). Dado sintético; as grafias
 * de forma são as 10 medidas no NJ em 24/11 e os nomes de conta são os do cadastro do NJ (nome de conta, não pessoa).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SEM_FILTROS_CPR, alternarFiltroCpr, apelidoCurtoDaContaCpr, chipsDosFiltrosCpr, formaDaLinhaCpr, fraseDosFiltrosCpr, origensDaLinhaCpr,
  passaNosFiltrosCpr, prontaDoCodigoCpr, type FiltrosCpr,
} from '@/lib/financeiro/cprFiltros';

describe('a origem da linha', () => {
  it('recorrente, parcelado, da nota (pode ser mais de uma); avulso só quando não é nenhuma', () => {
    expect([...origensDaLinhaCpr({ recorrencia_id: 'r1', origem_lancamento: 'recorrencia' })]).toEqual(['recorrente']);
    expect([...origensDaLinhaCpr({ origem_lancamento: 'parcela_financiamento' })]).toEqual(['parcelado']);
    expect([...origensDaLinhaCpr({ origem_tipo: 'parcela_juros' })]).toEqual(['parcelado']);
    expect([...origensDaLinhaCpr({}, true)]).toEqual(['parcelado']);
    expect([...origensDaLinhaCpr({ origem_tipo: 'parcela_principal', tipo_documento: 'Nota Fiscal', numero_documento: '9232' })].sort())
      .toEqual(['da_nota', 'parcelado']);
    expect([...origensDaLinhaCpr({ tipo_documento: 'Nota Fiscal', numero_documento: '' })]).toEqual(['avulso']);
    expect([...origensDaLinhaCpr({ origem_lancamento: 'manual' })]).toEqual(['avulso']);
  });
});

describe('a forma (texto livre → grupo)', () => {
  it('as 10 grafias do NJ caem no grupo certo; vazio = Sem forma; o resto = Outra', () => {
    const casos: [string | null, string][] = [
      [null, 'sem_forma'], ['', 'sem_forma'], ['PIX', 'pix'], ['Boleto', 'boleto'], ['Cartão de crédito', 'cartao'], ['Débito', 'debito_aut'],
      ['Débito Automático', 'debito_aut'], ['Dinheiro', 'outra'], ['Débito em Conta', 'debito_aut'], ['PIX/Transferência Bancária', 'pix'],
      ['Transferência', 'ted'], ['Cartão de Débito', 'cartao'], ['TED', 'ted'],
    ];
    for (const [f, g] of casos) expect(formaDaLinhaCpr(f), String(f)).toBe(g);
  });
});

describe('passar nos filtros', () => {
  const rec = { recorrencia_id: 'r', forma_pagamento: 'PIX' };
  const nota = { tipo_documento: 'Nota Fiscal', numero_documento: '134139094', forma_pagamento: 'Boleto' };
  const avulsa = { origem_lancamento: 'manual', forma_pagamento: null };
  it('sem filtro passa tudo; no mesmo grupo vale "ou"; entre grupos vale "e"', () => {
    for (const l of [rec, nota, avulsa]) expect(passaNosFiltrosCpr(l, SEM_FILTROS_CPR)).toBe(true);
    const f: FiltrosCpr = { ...SEM_FILTROS_CPR, origem: ['recorrente', 'da_nota'] };
    expect([rec, nota, avulsa].map((l) => passaNosFiltrosCpr(l, f))).toEqual([true, true, false]);
    const g: FiltrosCpr = { ...f, forma: ['boleto'] };
    expect([rec, nota, avulsa].map((l) => passaNosFiltrosCpr(l, g))).toEqual([false, true, false]);
    expect(passaNosFiltrosCpr(avulsa, { ...SEM_FILTROS_CPR, forma: ['sem_forma'] })).toBe(true);
  });
  it('Pagamento: ainda não lido, não filtra; pronta/faltando pela regra; "não se aplica" sai com o filtro ligado', () => {
    const p: FiltrosCpr = { ...SEM_FILTROS_CPR, pagamento: ['prontos'] };
    expect(passaNosFiltrosCpr(rec, p)).toBe(true);
    expect(passaNosFiltrosCpr(rec, p, { pronta: false })).toBe(false);
    expect(passaNosFiltrosCpr(rec, p, { pronta: true })).toBe(true);
    expect(passaNosFiltrosCpr(rec, p, { pronta: null })).toBe(false);
    expect(passaNosFiltrosCpr(rec, SEM_FILTROS_CPR, { pronta: null })).toBe(true);
  });
  it('o código da fn_pronto_para_pagar_dos → pronta', () => {
    expect(['pronto_boleto', 'pronto_dados_lancamento', 'pronto_chave_cadastro', 'pronto_dados_bancarios', 'nada_a_fazer'].map(prontaDoCodigoCpr))
      .toEqual([true, true, true, true, true]);
    expect(['falta_forma', 'falta_boleto', 'falta_chave', 'falta_dados_bancarios', 'falta_outro'].map(prontaDoCodigoCpr))
      .toEqual([false, false, false, false, false]);
    expect(prontaDoCodigoCpr(null)).toBeNull();
  });
});

describe('chips e a frase do PDF/Excel', () => {
  it('ligar/desligar mantém a ordem da lista; um chip por grupo; a frase diz os filtros', () => {
    let f = alternarFiltroCpr(SEM_FILTROS_CPR, 'origem', 'da_nota');
    f = alternarFiltroCpr(f, 'origem', 'recorrente');
    f = alternarFiltroCpr(f, 'forma', 'pix');
    expect(f.origem).toEqual(['recorrente', 'da_nota']);
    expect(chipsDosFiltrosCpr(f)).toEqual([{ grupo: 'origem', texto: 'Origem: Recorrente, Da nota' }, { grupo: 'forma', texto: 'Forma: PIX' }]);
    expect(fraseDosFiltrosCpr(f)).toBe('Filtros: Origem: Recorrente, Da nota · Forma: PIX');
    expect(alternarFiltroCpr(f, 'forma', 'pix').forma).toEqual([]);
    expect(fraseDosFiltrosCpr(SEM_FILTROS_CPR)).toBe('');
  });
});

describe('o apelido curto da conta (coluna Banco)', () => {
  it('os nomes do NJ', () => {
    const casos: [string, string][] = [
      ['Banco do Brasil', 'BB'], ['Sicredi Pessoal', 'Sic. Pes.'], ['Sicredi PJ Pecuária', 'Sic. PJ Pec.'], ['Itau BBA', 'Itaú BBA'],
      ['Bradesco', 'Brad.'], ['Santander', 'Sant.'], ['Caixa Carlos', 'Caixa Car.'], ['Invest-Itau BBA', 'Inv. Itaú BBA'],
      ['Cartão Sicredi Lavoura', 'Cart. Sic. Lav.'], ['cc-008 | itau bba pecuária', 'Itaú BBA pec.'],
    ];
    for (const [n, a] of casos) expect(apelidoCurtoDaContaCpr(n), n).toBe(a);
    expect(apelidoCurtoDaContaCpr(null)).toBe('');
  });
});

describe('a tela usa os filtros (lido da fonte)', () => {
  const tela = readFileSync(resolve(process.cwd(), 'src/components/financeiro-v2/ContasPagarReceberTab.tsx'), 'utf8');
  it('o filtro corta as linhas ANTES do recorte; com filtro o saldo fica vazio; PDF e Excel levam as mesmas linhas e a frase', () => {
    expect(tela).toContain('const linhasDoRecorte = useMemo(() => (!filtroLigado ? linhas : linhas.filter((l) => passaNosFiltrosCpr(');
    expect(tela).toContain('() => recortarCpr(linhasDoRecorte, { periodo, hoje: hojeIso, conta: contaSel, ancoras, estimadas, cartoes }),');
    expect(tela).toContain('const semSaldo = etapaAtiva || filtroLigado;');
    expect(tela).toContain('filtros: fraseDosFiltrosCpr(filtros) || undefined,\n        serie, grupos: gruposDoArquivo,');
    expect(tela).toContain('fim: periodo.ate, rodape, filtros: fraseDosFiltrosCpr(filtros) || undefined,');
    /* o Pagamento lê a regra do banco só com o filtro ligado; ainda não lido = não filtra */
    expect(tela).toContain("enabled: !!clienteId && idsVisiveis.length > 0 && comPagamento,");
    expect(tela).toContain('pronta: !comPagamento || !prontaPorId ? undefined : (prontaPorId.get(l.id) ?? null)');
  });
});

describe('o PDF e o Excel dizem os filtros', () => {
  it('a frase entra no cabeçalho do PDF e na 1ª linha do "Saldo por dia"', () => {
    expect(readFileSync(resolve(process.cwd(), 'src/lib/pdf/cpr/modeloCpr.ts'), 'utf8'))
      .toContain("linha2: `${SEGMENTO[e.segmento]}${e.filtros ? `   ·   ${e.filtros}` : ''}   ·   emitido em ${e.emitidoEm}`,");
    expect(readFileSync(resolve(process.cwd(), 'src/lib/financeiro/cprExcel.ts'), 'utf8'))
      .toContain('const linhaDosFiltros: XlsxCellValue[][] = e.filtros ? [[`${e.filtros} · com filtro o saldo fica vazio`, null, null, null]] : [];');
  });
});
