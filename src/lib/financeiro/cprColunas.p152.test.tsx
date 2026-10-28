/**
 * P152 (CPR-COLUNAS-01) — a regra do fluxo de caixa (cada linha no dia em que o dinheiro sai ou entra) e as colunas novas da Contas a
 * Pagar e Receber. A regra é do dono (`diaDaLinhaCpr`); a tela não se monta em teste (a consulta é do hook): o contrato dela é lido da
 * FONTE, como nos testes irmãos (`cprRecorte.test.ts`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { diaDaLinhaCpr, recortarCpr, serieDoSaldoCpr, ramoDaConsultaCpr, type ContaCpr } from '@/lib/financeiro/cprRecorte';
import { CelulaVinculos } from '@/components/financeiro-v2/ColunasDaListaV2';

const HOJE = '2026-10-28';
const OUT = { de: '2026-10-01', ate: '2026-10-31' };
let n = 0;
const conta = (venc: string | null, valor: number, o: Partial<ContaCpr> = {}): ContaCpr => ({
  id: `p${String(++n).padStart(3, '0')}`, data_vencimento: venc, data_pagamento: null, status_transacao: 'programado', tipo_operacao: '2-Saídas', valor, ...o,
});
const paga = (venc: string, pgto: string, valor: number) => conta(venc, valor, { status_transacao: 'realizado', data_pagamento: pgto });

/* o caso do NJ (sintético): venc. 29/10, pago 26/10 (o "Manutencao Trator 1/2"); venc. 25, pago 26; pago em out com venc. em nov;
   venc. em out pago em set; e as em aberto de sempre */
const IGUACU = paga('2026-10-29', '2026-10-26', 2533.79);
const DEPOIS = paga('2026-10-25', '2026-10-26', 360);
const VENCE_EM_NOV = paga('2026-11-05', '2026-10-20', 349.65);
const PAGA_EM_SET = paga('2026-10-15', '2026-09-30', 95);
const ABERTAS = [conta('2026-10-30', 1000), conta('2026-10-29', 50, { status_transacao: 'previsto' }), conta('2026-10-10', 7)];
const PAGAS = [IGUACU, DEPOIS, VENCE_EM_NOV, PAGA_EM_SET];

describe('P152 — o dia da linha é o do dinheiro', () => {
  it('paga → o dia do PAGAMENTO; em aberto → o vencimento; paga sem data → o vencimento; sem nada → ""', () => {
    expect(diaDaLinhaCpr(IGUACU)).toBe('2026-10-26');
    expect(diaDaLinhaCpr(conta('2026-10-30T00:00:00', 1))).toBe('2026-10-30');
    expect(diaDaLinhaCpr(conta('2026-10-15', 1, { status_transacao: 'conciliado' }))).toBe('2026-10-15');
    expect(diaDaLinhaCpr(conta(null, 1, { status_transacao: 'realizado' }))).toBe('');
  });

  it('as pagas do período são as PAGAS no período (a de nov. pagou em out. entra; a de out. paga em set. sai — D5)', () => {
    const r = recortarCpr([...ABERTAS, ...PAGAS], { periodo: OUT, hoje: HOJE });
    expect(r.pagasNoPeriodo.map((l) => l.id).sort()).toEqual([IGUACU.id, DEPOIS.id, VENCE_EM_NOV.id].sort());
    expect(r.pagasNoPeriodo.map(diaDaLinhaCpr).sort()).toEqual(['2026-10-20', '2026-10-26', '2026-10-26']);
  });

  it('NENHUM saldo muda: a série (cada dia, o fim e o mínimo) é a mesma com ou sem as pagas — a paga só muda de dia na lista', () => {
    const com = serieDoSaldoCpr(recortarCpr([...ABERTAS, ...PAGAS], { periodo: OUT, hoje: HOJE }), 10000);
    const sem = serieDoSaldoCpr(recortarCpr(ABERTAS, { periodo: OUT, hoje: HOJE }), 10000);
    expect(com.dias).toEqual(sem.dias);
    expect(com.fim).toBe(sem.fim);
    expect(com.menor).toEqual(sem.menor);
    expect(com.dias.length).toBeGreaterThan(0);
  });

  it('a busca traz a paga NO período pelo pagamento (o vencimento fora do período não a deixa de fora)', () => {
    expect(ramoDaConsultaCpr(OUT, HOJE)).toContain('and(data_pagamento.gte.2026-10-01,data_pagamento.lte.2026-10-31)');
  });
});

describe('P152 — a tela (lida da fonte)', () => {
  const tela = readFileSync(resolve(__dirname, '../../components/financeiro-v2/ContasPagarReceberTab.tsx'), 'utf8');
  const grupos = tela.slice(tela.indexOf('const grupos = useMemo((): Grupo[] => {'), tela.indexOf('// ── Abrir o lançamento'));

  it('os grupos de dia se montam pelo dia do dinheiro, nunca pelo vencimento cru', () => {
    expect(grupos).toContain('const chave = diaDaLinhaCpr(l);');
    expect(grupos).not.toMatch(/const chave = \(l\.data_vencimento/);
  });

  it('a régua do mock (menos os 4px do vão) e o ampliado = a mesma + Safra e Faz.', () => {
    expect(tela).toContain('const REGUA_NORMAL: Regua = { comp: 46, venc: 46, pgto: 46, selo: 16, fornecedor: 176, subcentro: 166, safra: 0, faz: 0, nf: 60, status: 70, receber: 80, pagar: 94, saldo: 94 };');
    expect(tela).toContain('const REGUA_AMPLIADA: Regua = { ...REGUA_NORMAL, safra: 56, faz: 26 };');
    const cab = tela.slice(tela.indexOf('data-testid="cpr-cabecalho"'), tela.indexOf('{/* CAIXA INICIAL'));
    const ordem = ['Comp.', 'Venc.', 'Pgto.', 'regua.selo', 'Descrição', 'Fornecedor', 'Subcentro', 'Safra', 'Faz.', '>NF<', 'Status', 'A receber', 'A pagar', 'Saldo'];
    const pos = ordem.map((t) => cab.indexOf(t));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });

  it('TRAVA DA RÉGUA (Gabriel 17:4x, opção b): o cabeçalho e a linha leem a MESMA régua, coluna a coluna, na mesma ordem — coluna sem largura fixa desalinha e o gate de tela não a pega', () => {
    const cab = tela.slice(tela.indexOf('data-testid="cpr-cabecalho"'), tela.indexOf('{/* CAIXA INICIAL'));
    const linha = tela.slice(tela.indexOf('            key={chaveDaLinhaCpr(l)}'), tela.indexOf('{/* CPR-AJUSTES-20-10 — a ÚLTIMA linha do dia'));
    const colunas = (t: string) => Array.from(t.matchAll(/style=\{larg\(regua\.(\w+)\)\}/g), (m) => m[1]);
    const ORDEM = ['comp', 'venc', 'pgto', 'selo', 'fornecedor', 'subcentro', 'safra', 'faz', 'nf', 'status', 'receber', 'pagar', 'saldo'];
    expect(colunas(cab)).toEqual(ORDEM);
    expect(colunas(linha)).toEqual(ORDEM);
    /* e a Descrição é a única que estica, nos dois */
    expect(cab).toContain('<span className="min-w-0 flex-1" data-coluna-descricao>Descrição</span>');
    expect(linha).toContain('<span className="flex min-w-0 flex-1 items-center gap-1" data-celula-descricao>');
  });

  it('o selo do vínculo é o CelulaVinculos de Lançamentos (11px), o "NF" abre a aba Documentos e o status segue a pílula sem borda', () => {
    expect(tela).toContain('<CelulaVinculos vinculos={vinculos} pequeno abrir={{');
    expect(tela).toContain("onClick={(e) => { e.stopPropagation(); void abrir(l.id, 'documentos'); }}");
    expect(tela).toContain("'inline-block rounded bg-muted px-0.5 whitespace-nowrap', FONTE_STATUS,");
    expect(tela).not.toContain('Paperclip');
    /* pago: a linha toda mais clara */
    expect(tela).toContain("paga && '[&>*]:opacity-50',");
  });

  it('o R abre a recorrência com ida e volta (o shell leva à regra; fechar volta à CPR)', () => {
    const shell = readFileSync(resolve(__dirname, '../../v2/V2Index.tsx'), 'utf8');
    const rec = readFileSync(resolve(__dirname, '../../v2/pages/V2Recorrencias.tsx'), 'utf8');
    expect(tela).toContain('guardarRetornoCpr({ visao, atalho, datas, contaSel, segmento, statusLigados, ampliado }); onAbrirRecorrencia(recorrenciaId);');
    expect(shell).toContain("onAbrirRecorrencia={podeAbrirTela('recorrencias') ? (id) => {");
    expect(shell).toContain("onVoltarParaOrigem={() => { setRecorrenciaIdAlvo(null); setSection('contas-a-pagar-receber'); }}");
    expect(rec).toContain('if (veioDeFora) { setVeioDeFora(false); onVoltarParaOrigem?.(); }');
  });
});

describe('P152 — o selo pequeno (as mesmas cores de Lançamentos)', () => {
  it('11px na CPR, 13px em Lançamentos; com gesto é botão', () => {
    const { container, rerender } = render(<CelulaVinculos pequeno vinculos={[{ tipo: 'R', titulo: 'Recorrência' }]} abrir={{ R: () => {} }} />);
    const r = container.querySelector('[data-testid="vinculo-R"]');
    expect(r?.tagName).toBe('BUTTON');
    expect(r?.className).toContain('h-[11px]');
    expect(r?.className).not.toContain('h-[13px]');
    expect(r?.className).toContain('text-[#6d28d9]');
    rerender(<CelulaVinculos vinculos={[{ tipo: 'P', titulo: 'Parcelamento' }]} />);
    expect(container.querySelector('[data-testid="vinculo-P"]')?.className).toContain('h-[13px]');
  });
});
