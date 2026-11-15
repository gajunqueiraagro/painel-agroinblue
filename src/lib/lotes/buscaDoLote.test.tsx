/**
 * LOTE-BUSCA-01 (Gabriel 11/11 10:00) — no formato do caso Pureza (nomes genéricos): 63 lotes ativos, o seletor mostrava 50 e os REC- do fim
 * nunca apareciam; o caderno diz "LOT 9.2 F1" e há DOIS lotes 9.2 (vacas, ligado no P7 do mês anterior; novilhas, sem ligação);
 * em set/26 nada era ligado, só o texto dos cards ("Vacas CAR_9.2" no P7, "N1 Angus SP CAR_9.2" no P13).
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { within } from '@testing-library/react';
import { CampoLoteDoPasto } from '@/components/fechamento/CampoLoteDoPasto';
import { casaPorPalavras, normalizarParaBusca } from '@/lib/texto/busca';
import type { LoteDaLista } from './tipos';
import {
  carimbosDoTexto, mesesDoTexto, opcoesDosLotesNoPasto, GRUPO_DEMAIS, GRUPO_DO_CADERNO, GRUPO_NESTE_PASTO, GRUPO_OUTROS_PASTOS,
  type MesAnteriorDoLote,
} from './buscaDoLote';

const lote = (id: string, codigo: string, carimbo: string | null, nomeCampeiro: string | null = null, situacao: LoteDaLista['situacao'] = 'ativo'): LoteDaLista => ({
  id, codigo, codigosAntigos: [], nomeCampeiro, situacao, formadoEm: '2026-10-01', encerradoEm: null, categoriaId: 'c', racaId: 'r',
  atividadeId: 'a', numero: 1, sistemaId: null, programaId: null, destinoId: null, safra: null, carimbo, idadeMediaMeses: null,
  metaPesoKg: null, metaGmdKg: null, metaData: null, versao: 1, anoMesDado: null, cabecas: null, pesoMedioKg: null, gmdKg: null,
  pastos: [], lancamentos: 0, conferir: null, daCria: carimbo !== null,
});

const VACAS = lote('vacas', 'CRI-PP-NE-09', '9.2', 'Vacas CAR_9.2');
const NOVILHAS = lote('novilhas', 'CRI-N1-AN-01', '9.2', 'N1 Angus SP CAR_9.2');
const OITO = lote('oito', 'CRI-VAC-NE-03', '8.1', 'Vacas CAR_8.1');
/* 60 de recria: com os 3 da cria = 63, a Pureza */
const RECRIA = Array.from({ length: 60 }, (_, i) => lote(`rec${i}`, `REC-DM-NE-${String(i + 1).padStart(2, '0')}`, null));
const TODOS = [VACAS, NOVILHAS, OITO, ...RECRIA, lote('fim', 'REC-ZZ-NE-01', null, null, 'encerrado')];

const semNada: MesAnteriorDoLote = { porLote: new Map(), textos: [] };
const ctx = (pastoNome: string, textoDoCaderno: string, mesAnterior: MesAnteriorDoLote | null = semNada) => ({ pastoNome, textoDoCaderno, mesAnterior });
const grupoDe = (ops: ReturnType<typeof opcoesDosLotesNoPasto>, id: string) => ops.find(o => o.value === id)?.grupo;

describe('o carimbo lido do texto do caderno', () => {
  it('acha o carimbo no meio do texto; "F1", "N1", número solto e palavra não são carimbo', () => {
    expect(carimbosDoTexto('LOT 9.2 F1')).toEqual(['9.2']);
    expect(carimbosDoTexto('Vacas CAR_9.2')).toEqual(['9.2']);
    expect(carimbosDoTexto('7R e 8.1.')).toEqual(['7R', '8.1']);
    expect(carimbosDoTexto('N1 Angus SP 2026')).toEqual([]);
    expect(carimbosDoTexto(null)).toEqual([]);
  });
});

describe('as opções do campo Lote (LOTE-BUSCA-01)', () => {
  it('(a) todos os ativos entram (63), o encerrado não', () => {
    const ops = opcoesDosLotesNoPasto(TODOS, ctx('P22', ''));
    expect(ops).toHaveLength(63);
    expect(ops.some(o => o.value === 'fim')).toBe(false);
  });

  it('(b) "LOT 9.2 F1" no caderno: os DOIS 9.2 no topo, no grupo do caderno', () => {
    const ops = opcoesDosLotesNoPasto(TODOS, ctx('P22', 'LOT 9.2 F1'));
    expect(ops.slice(0, 2).map(o => o.value)).toEqual(['vacas', 'novilhas']);
    expect(grupoDe(ops, 'vacas')).toBe(GRUPO_DO_CADERNO);
    expect(grupoDe(ops, 'oito')).toBe(GRUPO_DEMAIS);
  });

  it('(b) o caderno com o nome do campeiro de um lote sugere SÓ ele (o carimbo não decide)', () => {
    const ops = opcoesDosLotesNoPasto(TODOS, ctx('P22', 'vacas car_9.2'));
    expect(ops.filter(o => o.grupo === GRUPO_DO_CADERNO).map(o => o.value)).toEqual(['vacas']);
  });

  it('(c) pela LIGAÇÃO do mês anterior: neste pasto · em outros pastos (pasto · cab) · demais', () => {
    const mes: MesAnteriorDoLote = { porLote: new Map([['vacas', { pastos: ['P7'], cabecas: 150 }], ['oito', { pastos: ['P22'], cabecas: 40 }]]), textos: [] };
    const ops = opcoesDosLotesNoPasto(TODOS, ctx('P22', '', mes));
    expect(ops.map(o => o.grupo).filter((g, i, a) => a.indexOf(g) === i)).toEqual([GRUPO_NESTE_PASTO, GRUPO_OUTROS_PASTOS, GRUPO_DEMAIS]);
    expect(grupoDe(ops, 'oito')).toBe(GRUPO_NESTE_PASTO);
    expect(grupoDe(ops, 'vacas')).toBe(GRUPO_OUTROS_PASTOS);
    expect(ops.find(o => o.value === 'vacas')?.sub).toBe('P7 · 150 cab · CRI-PP-NE-09 · Vacas CAR_9.2');
    expect(grupoDe(ops, 'rec59')).toBe(GRUPO_DEMAIS);
  });

  it('(c) sem ligação no mês anterior (set/26): o TEXTO dos cards — nome igual primeiro, senão o carimbo', () => {
    const mes: MesAnteriorDoLote = { porLote: new Map(), textos: [{ pasto: 'P7', texto: 'Vacas CAR_9.2' }, { pasto: 'P13', texto: 'N1 Angus SP CAR_9.2' }, { pasto: 'P22', texto: 'lote 8.1' }] };
    const ops = opcoesDosLotesNoPasto(TODOS, ctx('P22', '', mes));
    expect(ops.find(o => o.value === 'vacas')?.sub).toBe('P7 · caderno "Vacas CAR_9.2" · CRI-PP-NE-09 · Vacas CAR_9.2');
    expect(ops.find(o => o.value === 'novilhas')?.sub?.startsWith('P13 · caderno')).toBe(true);
    expect(grupoDe(ops, 'oito')).toBe(GRUPO_NESTE_PASTO);
  });

  it('a ligação manda sobre o texto', () => {
    const mes: MesAnteriorDoLote = { porLote: new Map([['vacas', { pastos: ['P10'], cabecas: 90 }]]), textos: [{ pasto: 'P22', texto: 'Vacas CAR_9.2' }] };
    const ops = opcoesDosLotesNoPasto(TODOS, ctx('P22', '', mes));
    expect(grupoDe(ops, 'vacas')).toBe(GRUPO_OUTROS_PASTOS);
  });

  it('nada no caderno nem no mês anterior: a lista sem cabeçalho, como era', () => {
    expect(opcoesDosLotesNoPasto(TODOS, ctx('P22', '', null)).every(o => o.grupo === undefined)).toBe(true);
  });
});

describe('a busca por palavras', () => {
  it('cada palavra em qualquer texto; a ordem não importa; acento não conta', () => {
    const t = ['9.2', 'cri-pp-ne-09 · vacas car_9.2'].map(normalizarParaBusca);
    expect(casaPorPalavras(t, 'vacas 9.2')).toBe(true);
    expect(casaPorPalavras(t, '9.2  VACAS')).toBe(true);
    expect(casaPorPalavras(t, 'vacas f1')).toBe(false);
    expect(casaPorPalavras(t, '')).toBe(true);
  });
});

describe('o seletor com os lotes (LOTE-BUSCA-01)', () => {
  beforeEach(() => { Element.prototype.scrollIntoView = () => {}; });
  const abrir = (extra: { buscaPorPalavras?: boolean; semCorte?: boolean }) => {
    const ops = opcoesDosLotesNoPasto(TODOS, ctx('P22', ''));
    render(<SearchableSelect value="" allValue="" allLabel="Sem lote" onValueChange={vi.fn()} options={ops} placeholder="Buscar lote" {...extra} />);
    fireEvent.click(screen.getByRole('button', { name: /Sem lote/ }));
  };
  it('(a) sem corte: os 63 desenhados (o último REC aparece sem digitar)', async () => {
    abrir({ semCorte: true });
    await screen.findByPlaceholderText('Buscar lote');
    expect(screen.getByText('REC-DM-NE-60')).toBeTruthy();
    expect(screen.queryByText(/refine a busca/)).toBeNull();
  });
  it('sem a prop, o corte de sempre (as outras montagens não mudam)', async () => {
    abrir({});
    await screen.findByPlaceholderText('Buscar lote');
    expect(screen.queryByText('REC-DM-NE-60')).toBeNull();
    expect(screen.getByText(/\+13 resultados/)).toBeTruthy();
  });
  it('(b) "vacas 9.2" acha o lote das vacas por palavras; sem a prop, o trecho inteiro não acha', async () => {
    abrir({ buscaPorPalavras: true, semCorte: true });
    fireEvent.change(await screen.findByPlaceholderText('Buscar lote'), { target: { value: 'vacas 9.2' } });
    expect(screen.getAllByText('9.2')).toHaveLength(1);
  });
});

describe('o campo Lote do modal com o contexto (LOTE-BUSCA-01)', () => {
  beforeEach(() => { Element.prototype.scrollIntoView = () => {}; });
  it('abre com os grupos do mês anterior e o 9.2 do caderno no topo', async () => {
    const mes: MesAnteriorDoLote = { porLote: new Map([['oito', { pastos: ['P7'], cabecas: 40 }]]), textos: [] };
    render(<CampoLoteDoPasto itens={[{ categoria_id: 'c', quantidade: 10, lote_id: null }]} lotes={TODOS} nomeDaCategoria={() => 'Vacas'}
      contexto={ctx('P22', 'LOT 9.2 F1', mes)} onChange={vi.fn()} onNovoLote={vi.fn()} />);
    fireEvent.click(screen.getByTestId('campo-lote-do-pasto'));
    const painel = await screen.findByTestId('painel-lote-do-pasto');
    fireEvent.click(within(painel).getAllByRole('button', { name: /Sem lote/ })[0]);
    await screen.findAllByPlaceholderText('Buscar lote, código ou nome');
    expect([...document.querySelectorAll('[data-grupo]')].map(g => g.textContent)).toEqual([GRUPO_DO_CADERNO, GRUPO_OUTROS_PASTOS, GRUPO_DEMAIS]);
    expect(screen.getByText('REC-DM-NE-60')).toBeTruthy();
    /* a linha "onde esteve" é longa: fora de tabela ela QUEBRA, nunca "…" (o gate de cortes achou o corte) */
    const sub = screen.getByText('P7 · 40 cab · CRI-VAC-NE-03 · Vacas CAR_8.1');
    expect(sub.className).not.toMatch(/truncate/);
    expect(sub.className).toMatch(/whitespace-normal/);
  });
  it('sem o subInteiro, o seletor segue cortando a linha de baixo (as outras montagens não mudam)', async () => {
    const ops = opcoesDosLotesNoPasto(TODOS, ctx('P22', '', { porLote: new Map([['oito', { pastos: ['P7'], cabecas: 40 }]]), textos: [] }));
    render(<SearchableSelect value="" allValue="" allLabel="Sem lote" onValueChange={vi.fn()} options={ops} placeholder="Buscar lote" />);
    fireEvent.click(screen.getByRole('button', { name: /Sem lote/ }));
    await screen.findByPlaceholderText('Buscar lote');
    expect(screen.getByText('P7 · 40 cab · CRI-VAC-NE-03 · Vacas CAR_8.1').className).toMatch(/truncate/);
  });
});

describe('as telas leem a regra', () => {
  it('o campo Lote passa as duas props e o modal passa o contexto do mês anterior', () => {
    const campo = readFileSync('src/components/fechamento/CampoLoteDoPasto.tsx', 'utf8');
    expect(campo.match(/buscaPorPalavras semCorte subInteiro/g)).toHaveLength(2);
    expect(readFileSync('src/components/FechamentoPastoDialog.tsx', 'utf8')).toContain('mesAnterior: lotesDoMesAnterior');
  });
});

/* LOTE-BUSCA-02 (Gabriel 12/11 10:23) — o caso da Santa Rita, nomes genéricos: o lote do L20 existia (10.1, apelido "L20 SP+F1"); no 20R-2
   o caderno diz "L20 F1+SP C10" e nem a busca nem a sugestão achavam (ordem trocada no "+", e "C10" é o mês, não o carimbo 10.1). */
describe('LOTE-BUSCA-02 — o caderno com palavras em outra ordem e o mês escrito', () => {
  const L20 = lote('l20', 'CRI-PRE-NEL-01', '10.1', 'L20 SP+F1');
  const L19 = lote('l19', 'CRI-VAC-NEL-02', '10.2', 'L19 MULT');
  const L18 = lote('l18', 'CRI-VAC-NEL-9.3', '9.3', 'L18');
  const L1 = lote('l1', 'CRI-VAC-NEL-7.1', '7.1', 'L1VC NEL C6/7');
  const SR = [L20, L19, L18, L1];
  it('a busca por palavras parte também em "+", "/", "_" e "-": "L20 F1+SP" acha "L20 SP+F1"', () => {
    const textos = ['10.1', 'l20 sp+f1', 'cri-pre-nel-01'];
    expect(casaPorPalavras(textos, 'L20 F1+SP')).toBe(true);
    expect(casaPorPalavras(textos, 'f1/sp')).toBe(true);
    expect(casaPorPalavras(textos, 'L20 F1+SX')).toBe(false);
    expect(casaPorPalavras(['l18 prim. c9'], 'L1')).toBe(true);           // por palavra contida, como antes
  });
  it('a sugestão: todas as palavras do apelido no texto do caderno, em qualquer ordem', () => {
    const ops = opcoesDosLotesNoPasto(SR, ctx('20R-2', 'L20 F1+SP C10'));
    expect(grupoDe(ops, 'l20')).toBe(GRUPO_DO_CADERNO);
    expect(grupoDe(ops, 'l19')).toBe(GRUPO_DEMAIS);                         // 10.2 é do mês 10, mas o nome já achou: o mês não entra
    expect(ops[0].value).toBe('l20');
  });
  it('apelido curto casa a palavra inteira, nunca um pedaço ("L1" não é "L18"; "L18" está em "L18 Prim. C9")', () => {
    expect(grupoDe(opcoesDosLotesNoPasto(SR, ctx('14 D-2', 'L18 Prim. C9')), 'l18')).toBe(GRUPO_DO_CADERNO);
    expect(grupoDe(opcoesDosLotesNoPasto([lote('x', 'X', null, 'L1')], ctx('P', 'L18 Prim. C9')), 'x')).toBeUndefined();
  });
  it('sem nada pelo nome nem pelo carimbo, o mês escrito ("C10", "C8/9", "CAR_09") sugere os lotes daquele mês', () => {
    expect(mesesDoTexto('L20 F1+SP C10')).toEqual([10]);
    expect(mesesDoTexto('L15 PRIM+SEC C8/9')).toEqual([8, 9]);
    expect(mesesDoTexto('Prim. CAR_09')).toEqual([9]);
    expect(mesesDoTexto('L09 Vaca Nel C_07e08')).toEqual([7, 8]);
    expect(mesesDoTexto('N1 Angus SP 2026')).toEqual([]);
    const ops = opcoesDosLotesNoPasto(SR, ctx('P', 'Lote novo C10'));
    expect([grupoDe(ops, 'l20'), grupoDe(ops, 'l19'), grupoDe(ops, 'l18')]).toEqual([GRUPO_DO_CADERNO, GRUPO_DO_CADERNO, GRUPO_DEMAIS]);
  });
});
