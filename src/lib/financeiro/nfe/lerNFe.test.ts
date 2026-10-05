/**
 * FIN-NFE-XML-01a — o leitor de NF-e, fixture a fixture. Todas SINTETICAS (`__fixtures__/notas.ts`).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { lerNFe } from './lerNFe';
import { FRASES_DE_RECUSA, LIMITE_BYTES_NFE, fraseDaRecusa, type MotivoRecusa, type NotaLida, type ResultadoNFe } from './tipos';
import {
  CTE, DESTINATARIO_CPF, EMITENTE_CNPJ, EMITENTE_CPF, EVENTO, NAO_XML, NFSE, chaveDe, latin1, montarLote, montarNFe, montarProcComDuasNotas, utf8,
} from './__fixtures__/notas';

function lida(r: ResultadoNFe): { nota: NotaLida; avisos: string[] } {
  /* `=== false`, nao `!r.ok`: com `strict: false` no tsconfig o `!` nao estreita a uniao (medido: TS2339). */
  if (r.ok === false) throw new Error(`esperava nota lida, veio recusa: ${r.motivo}`);
  return { nota: r.nota, avisos: r.avisos };
}
function recusada(r: ResultadoNFe): { motivo: MotivoRecusa; frase: string } {
  if (r.ok === true) throw new Error('esperava recusa, veio nota lida');
  return { motivo: r.motivo, frase: r.frase };
}

describe('F1 — nfeProc completo, autorizado (2026, com os grupos da reforma tributaria)', () => {
  const { nota, avisos } = lida(lerNFe(utf8(montarNFe())));
  it('todos os campos do contrato', () => {
    expect(nota).toEqual({
      chave: chaveDe(EMITENTE_CNPJ, '55', '12345'),
      modelo: '55', numero: '12345', serie: '1',
      emissao: '2026-09-30', saidaEntrada: '2026-10-01',
      tipoNota: 'saida', finalidade: 'normal', naturezaOperacao: 'VENDA DE MERCADORIA',
      emitente: { documento: EMITENTE_CNPJ, nome: 'AGROPECUARIA EXEMPLO LTDA', fantasia: 'CASA DO CAMPO', ie: '283456789' },
      destinatario: { documento: DESTINATARIO_CPF, nome: 'PRODUTOR RURAL DE TESTE', ie: '289876543' },
      totais: { produtosCent: 1623800, freteCent: 0, descontoCent: 0, notaCent: 1623800 },
      fatura: { origCent: 1623800, descCent: 0, liqCent: 1623800 },
      duplicatas: [
        { numero: '001', vencimento: '2026-11-05', valorCent: 811900 },
        { numero: '002', vencimento: '2026-12-05', valorCent: 811900 },
      ],
      somaDuplicatasCent: 1623800,
      pagamentos: [{ tPag: '15', valorCent: 1623800 }],
      itens: [
        { descricao: 'SAL MINERAL 80 P SC 30KG', quantidade: '120.0000', unidade: 'SC', valorCent: 960000 },
        { descricao: 'RACAO ENGORDA 18% SC 40KG', quantidade: '50.0000', unidade: 'SC', valorCent: 425000 },
        { descricao: 'UREIA PECUARIA SC 25KG', quantidade: '10.0000', unidade: 'SC', valorCent: 118000 },
        { descricao: 'VERMIFUGO INJETAVEL 500ML', quantidade: '4.0000', unidade: 'FR', valorCent: 71600 },
        { descricao: 'ARAME FARPADO 500M', quantidade: '2.0000', unidade: 'RL', valorCent: 39200 },
        { descricao: 'BRINCO IDENTIFICACAO CX 100', quantidade: '1.0000', unidade: 'CX', valorCent: 10000 },
      ],
      protocolo: { cStat: '100', numero: '150260000123456' },
    });
    expect(avisos).toEqual([]);
  });
  it('a chave tem 44 digitos e so digitos', () => {
    expect(nota.chave).toMatch(/^\d{44}$/);
  });
  it('os itens somam os produtos (inteiros)', () => {
    expect(nota.itens.reduce((s, i) => s + i.valorCent, 0)).toBe(nota.totais.produtosCent);
  });
});

describe('F2 — a mesma estrutura com centavos quebrados', () => {
  it('vNF 1345.50 em duas duplicatas de 672.75', () => {
    const { nota, avisos } = lida(lerNFe(utf8(montarNFe({ numero: '777', vNF: '1345.50', duplicatas: [['001', '2026-11-05', '672.75'], ['002', '2026-12-05', '672.75']] }))));
    expect(nota.totais.notaCent).toBe(134550);
    expect(nota.duplicatas.map((d) => d.valorCent)).toEqual([67275, 67275]);
    expect(nota.duplicatas.map((d) => d.vencimento)).toEqual(['2026-11-05', '2026-12-05']);
    expect(nota.somaDuplicatasCent).toBe(134550);
    expect(nota.fatura).toEqual({ origCent: 134550, descCent: 0, liqCent: 134550 });
    expect(nota.pagamentos).toEqual([{ tPag: '15', valorCent: 134550 }]);
    expect(nota.numero).toBe('777');
    expect(nota.chave).toBe(chaveDe(EMITENTE_CNPJ, '55', '777'));
    expect(nota.emissao).toBe('2026-09-30');
    expect(avisos).toEqual([]);
  });
});

describe('avisos — a nota e lida, e a tela mostra', () => {
  it('F3 — NFe solta, sem protNFe: aviso sem_protocolo, e a chave sai do Id do infNFe', () => {
    const { nota, avisos } = lida(lerNFe(utf8(montarNFe({ cStat: null }))));
    expect(avisos).toEqual(['sem_protocolo']);
    expect(nota.protocolo).toBeNull();
    expect(nota.chave).toBe(chaveDe(EMITENTE_CNPJ, '55', '12345'));
  });
  it('F4 — sem cobr: aviso sem_duplicatas, fatura nula, soma zero', () => {
    const { nota, avisos } = lida(lerNFe(utf8(montarNFe({ duplicatas: null }))));
    expect(avisos).toEqual(['sem_duplicatas']);
    expect(nota.fatura).toBeNull();
    expect(nota.duplicatas).toEqual([]);
    expect(nota.somaDuplicatasCent).toBe(0);
  });
  it('F5 — duplicatas somando 1 centavo a menos que a nota: aviso duplicatas_diferem_da_nota (tolerancia zero)', () => {
    const { nota, avisos } = lida(lerNFe(utf8(montarNFe({ duplicatas: [['001', '2026-11-05', '8119.00'], ['002', '2026-12-05', '8118.99']] }))));
    expect(nota.somaDuplicatasCent).toBe(1623799);
    expect(nota.totais.notaCent).toBe(1623800);
    expect(avisos).toEqual(['duplicatas_diferem_da_nota']);
  });
  it('F14 — finNFe 4: finalidade devolucao, com aviso; finNFe 2: complementar; finNFe 3: ajuste, sem aviso', () => {
    expect(lida(lerNFe(utf8(montarNFe({ finNFe: '4' })))).avisos).toEqual(['devolucao']);
    expect(lida(lerNFe(utf8(montarNFe({ finNFe: '4' })))).nota.finalidade).toBe('devolucao');
    expect(lida(lerNFe(utf8(montarNFe({ finNFe: '2' })))).avisos).toEqual(['complementar']);
    const ajuste = lida(lerNFe(utf8(montarNFe({ finNFe: '3' }))));
    expect([ajuste.nota.finalidade, ajuste.avisos]).toEqual(['ajuste', []]);
  });
  it('F15 — emitente com CPF (produtor rural): documento de 11 digitos, sem fantasia', () => {
    const { nota } = lida(lerNFe(utf8(montarNFe({ emitenteCpf: true, nomeEmitente: 'JOAO PRODUTOR DE TESTE' }))));
    expect(nota.emitente).toEqual({ documento: EMITENTE_CPF, nome: 'JOAO PRODUTOR DE TESTE', fantasia: null, ie: '283456789' });
    expect(nota.emitente.documento).toHaveLength(11);
    expect(nota.chave).toMatch(/^\d{44}$/);
  });
});

describe('recusas — o motivo e a frase', () => {
  const casos: [string, () => ArrayBuffer, MotivoRecusa, string][] = [
    ['F6 — cStat 101 (cancelada)', () => utf8(montarNFe({ cStat: '101' })), 'cancelada_ou_denegada', 'Nota cancelada ou denegada na SEFAZ.'],
    ['F7 — mod 65 (NFC-e)', () => utf8(montarNFe({ modelo: '65' })), 'nfce', 'Cupom (NFC-e) ainda não é lido; preencha à mão.'],
    ['F8 — cteProc', () => utf8(CTE), 'cte', 'É um conhecimento de transporte (CT-e), não uma nota.'],
    ['F9 — procEventoNFe', () => utf8(EVENTO), 'evento', 'É um evento da nota, não a nota.'],
    ['F10 — dois infNFe (lote)', () => utf8(montarLote()), 'lote', 'Uma nota por arquivo.'],
    ['dois infNFe sob uma raiz nfeProc', () => utf8(montarProcComDuasNotas()), 'lote', 'Uma nota por arquivo.'],
    ['F11 — texto que nao e XML', () => utf8(NAO_XML), 'nao_e_xml', 'Arquivo não é um XML válido.'],
    ['F12 — XML truncado (parsererror)', () => utf8(montarNFe().slice(0, 900)), 'nao_e_xml', 'Arquivo não é um XML válido.'],
    ['NFS-e (outro leiaute)', () => utf8(NFSE), 'nfse_ou_desconhecido', 'Nota de serviço ou formato não reconhecido; preencha à mão.'],
    ['modelo que nao e 55 nem 65', () => utf8(montarNFe({ modelo: '01' })), 'nfse_ou_desconhecido', 'Nota de serviço ou formato não reconhecido; preencha à mão.'],
  ];
  for (const [nome, bytes, motivo, frase] of casos) {
    it(nome, () => expect(recusada(lerNFe(bytes()))).toEqual({ motivo, frase }));
  }
  it('os cinco cStat de cancelada/denegada recusam; 100 e 150 leem', () => {
    for (const c of ['101', '135', '110', '301', '302']) expect(`${c}:${recusada(lerNFe(utf8(montarNFe({ cStat: c })))).motivo}`).toBe(`${c}:cancelada_ou_denegada`);
    for (const c of ['100', '150']) expect(lida(lerNFe(utf8(montarNFe({ cStat: c })))).nota.protocolo?.cStat).toBe(c);
  });
  it('grande demais: recusa pelo TAMANHO, antes de decodificar (o conteudo nem e XML)', () => {
    expect(recusada(lerNFe(new ArrayBuffer(LIMITE_BYTES_NFE + 1)))).toEqual({ motivo: 'grande_demais', frase: 'Arquivo grande demais para uma nota (limite 2 MB).' });
    /* no limite exato o tamanho passa, e a recusa e' a do conteudo */
    expect(recusada(lerNFe(new ArrayBuffer(LIMITE_BYTES_NFE))).motivo).toBe('nao_e_xml');
  });
  it('incompleta: a frase diz o campo que falta', () => {
    const falta = (semCampo: NonNullable<Parameters<typeof montarNFe>[0]>['semCampo'], cStat?: null) => recusada(lerNFe(utf8(montarNFe({ semCampo, cStat }))));
    expect(falta('nNF')).toEqual({ motivo: 'incompleta', frase: 'Nota sem número.' });
    expect(falta('dhEmi')).toEqual({ motivo: 'incompleta', frase: 'Nota sem data de emissão.' });
    expect(falta('emit')).toEqual({ motivo: 'incompleta', frase: 'Nota sem emitente.' });
    expect(falta('vNF')).toEqual({ motivo: 'incompleta', frase: 'Nota sem valor total.' });
    expect(falta('chave')).toEqual({ motivo: 'incompleta', frase: 'Nota sem chave de acesso.' });
    expect(falta('chave', null)).toEqual({ motivo: 'incompleta', frase: 'Nota sem chave de acesso.' });
  });
  it('a lista de frases e UNICA: uma por motivo, e `fraseDaRecusa` so a le', () => {
    expect(Object.keys(FRASES_DE_RECUSA).sort()).toEqual(['cancelada_ou_denegada', 'cte', 'evento', 'grande_demais', 'lote', 'nao_e_xml', 'nfce', 'nfse_ou_desconhecido']);
    expect(new Set(Object.values(FRASES_DE_RECUSA)).size).toBe(8);
    expect(fraseDaRecusa('lote')).toBe(FRASES_DE_RECUSA.lote);
  });
});

describe('data, charset e namespace', () => {
  it('dhEmi "…T23:30:00-04:00": a emissao e o dia ESCRITO (30/09), nao o dia em UTC (01/10)', () => {
    const dh = '2026-09-30T23:30:00-04:00';
    /* a busca sabe achar: em UTC esse instante ja' e' o dia seguinte */
    expect(new Date(dh).toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(lida(lerNFe(utf8(montarNFe({ dhEmi: dh })))).nota.emissao).toBe('2026-09-30');
  });
  it('F13 — declarado ISO-8859-1, gravado em bytes 1252: o acento do xNome chega certo', () => {
    const xml = montarNFe({ encoding: 'ISO-8859-1', nomeEmitente: 'AGROPECUÁRIA SÃO JOSÉ LTDA' });
    const bytes = latin1(xml);
    /* a busca sabe achar: lidos como UTF-8 esses bytes perdem o acento */
    expect(new TextDecoder('utf-8').decode(bytes)).toContain('�');
    const { nota } = lida(lerNFe(bytes));
    expect(nota.emitente.nome).toBe('AGROPECUÁRIA SÃO JOSÉ LTDA');
    expect(nota.totais.notaCent).toBe(1623800);
  });
  it('UTF-8 com acento e com BOM tambem', () => {
    const xml = montarNFe({ nomeEmitente: 'AGROPECUÁRIA SÃO JOSÉ LTDA' });
    expect(lida(lerNFe(utf8(xml))).nota.emitente.nome).toBe('AGROPECUÁRIA SÃO JOSÉ LTDA');
    expect(lida(lerNFe(utf8(`﻿${xml}`))).nota.emitente.nome).toBe('AGROPECUÁRIA SÃO JOSÉ LTDA');
  });
  it('elementos com PREFIXO de namespace (nfe:infNFe) leem igual: a leitura e por localName', () => {
    const semPrefixo = lida(lerNFe(utf8(montarNFe())));
    const comPrefixo = lida(lerNFe(utf8(montarNFe({ prefixo: 'nfe' }))));
    expect(comPrefixo).toEqual(semPrefixo);
    const solta = lida(lerNFe(utf8(montarNFe({ prefixo: 'nfe', cStat: null }))));
    expect([solta.nota.numero, solta.avisos]).toEqual(['12345', ['sem_protocolo']]);
  });
  it('os grupos da reforma tributaria estao no arquivo e nao entram em campo nenhum', () => {
    const xml = montarNFe();
    for (const g of ['<IBSCBS>', '<IBSCBSTot>', '<vNFTot>']) expect(xml).toContain(g);
    expect(JSON.stringify(lida(lerNFe(utf8(xml))).nota)).not.toMatch(/IBS|CBS/);
  });
});

describe('a lib e pura', () => {
  it('nenhum import de React, supabase ou tela dentro de src/lib/financeiro/nfe/', () => {
    const dir = 'src/lib/financeiro/nfe';
    const fontes = readdirSync(dir).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f));
    expect(fontes.sort()).toEqual(['centavos.ts', 'lerNFe.ts', 'tipos.ts']);
    for (const f of fontes) {
      const imports = readFileSync(`${dir}/${f}`, 'utf8').split('\n').filter((l) => /^\s*import\b/.test(l) || /\bfrom\s+['"]/.test(l));
      for (const l of imports) expect(`${f}: ${l}`).not.toMatch(/react|supabase|@\/components|@\/pages|@\/hooks|@\/v2|sonner/i);
    }
    /* a busca sabe achar: o leitor importa o decodificador */
    expect(readFileSync(`${dir}/lerNFe.ts`, 'utf8')).toContain("from '@/lib/financeiro/parser/decodificarExtrato'");
  });
  it('o leitor nao escreve em console', () => {
    for (const f of ['centavos.ts', 'lerNFe.ts', 'tipos.ts']) expect(readFileSync(`src/lib/financeiro/nfe/${f}`, 'utf8')).not.toMatch(/console\./);
  });
});
