/**
 * PR-FIN-V2-STATUS-PGTO-01 — só realizado tem data de pagamento; a ordem e a cor do status têm um dono.
 *
 * ⚠ O CASO DO NJ: sete lançamentos voltaram de realizado para previsto pelo `LancamentoV2Dialog` e ficaram com o pagamento de
 *   04/09 gravado. A regra que decide o pagamento mora em duas funções puras de `statusFinanceiro.ts`, testadas aqui de
 *   verdade; o dialog (2.700 linhas, nenhum teste o monta) é conferido na FONTE, como o `finV2HomologFix01`.
 * ⚠ A PÍLULA DA OC NÃO PODE MUDAR NENHUM BYTE: a paleta saiu de `TabelaDespesasOC.tsx` para o domínio, e a classe renderizada
 *   é conferida contra a string literal de antes do PR.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  pagamentoAoTrocarStatus, pagamentoParaGravar, statusTemPagamento,
  STATUS_FINANCEIRO_OPCOES_FILTRO, STATUS_FINANCEIRO_OPCOES_MODAL, STATUS_FILTRO_COR, STATUS_FILTRO_PILULA, STATUS_PALETA,
} from '@/lib/financeiro/statusFinanceiro';
import { PilulaStatusDespesa } from '@/components/compra/TabelaDespesasOC';

const dialogo = readFileSync(resolve(__dirname, './LancamentoV2Dialog.tsx'), 'utf8');
const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');

describe('pagamento x status — a regra', () => {
  it('realizado -> previsto/programado/agendado ZERA o pagamento', () => {
    for (const s of ['previsto', 'programado', 'agendado']) expect(pagamentoAoTrocarStatus(s, '2026-09-04', false)).toBe('');
  });
  it('voltar para realizado não inventa data, e realizado mantém a que tem', () => {
    expect(pagamentoAoTrocarStatus('realizado', '', false)).toBe('');
    expect(pagamentoAoTrocarStatus('realizado', '2026-09-04', false)).toBe('2026-09-04');
  });
  it('pagamento TRAVADO pelo extrato não zera ao trocar o status', () => {
    expect(pagamentoAoTrocarStatus('previsto', '2026-09-04', true)).toBe('2026-09-04');
  });
  it('o payload sai com data_pagamento NULL fora de realizado/conciliado, mesmo com o estado preenchido', () => {
    expect(pagamentoParaGravar('previsto', '2026-09-04', false)).toBeNull();
    expect(pagamentoParaGravar('agendado', '2026-09-04', false)).toBeNull();
    expect(pagamentoParaGravar('meta', '2026-09-04', false)).toBeNull();
    expect(pagamentoParaGravar('realizado', '2026-09-04', false)).toBe('2026-09-04');
    expect(pagamentoParaGravar('realizado', '', false)).toBeNull();
    expect(pagamentoParaGravar('previsto', '2026-09-04', true)).toBe('2026-09-04');
  });
  it('só realizado e conciliado têm pagamento', () => {
    expect(['previsto', 'programado', 'agendado', 'realizado', 'conciliado', 'meta'].filter(statusTemPagamento))
      .toEqual(['realizado', 'conciliado']);
  });
});

describe('LancamentoV2Dialog — a regra está ligada (fonte)', () => {
  it('o select de status passa pela troca que zera, e o payload pela defesa', () => {
    expect(dialogo).toContain('<Select value={statusTransacao} onValueChange={handleStatusChange}>');
    expect(dialogo).toContain('setDataPagamento(atual => pagamentoAoTrocarStatus(v, atual, pagamentoTravado));');
    expect(dialogo).toContain('data_pagamento: pagamentoParaGravar(statusPersistido, dataPagamento, pagamentoTravado),');
    expect(dialogo).toContain("const pagamentoTravado = lockedFields?.includes('data_pagamento') ?? false;");
  });
  it('o campo de pagamento fica desabilitado fora do realizado, e diz por quê', () => {
    expect(dialogo).toContain('disabled={pagamentoTravado || !pagamentoPermitido}');
    expect(dialogo).toContain("'Só realizado tem data de pagamento'");
  });
  it('a data de pagamento não escolhe mais o status', () => {
    expect(dialogo).not.toContain('deriveStatusFinanceiro');
    expect(dialogo).not.toMatch(/setStatusTransacao\(deriveStatus/);
    expect(dialogo).toContain('const handleDataPagamentoChange = (val: string) => {\n    setDataPagamento(val);\n  };');
  });
});

describe('a ordem do status — Previsto > Programado > Agendado > Realizado > Conciliado', () => {
  it('no filtro', () => {
    expect(STATUS_FINANCEIRO_OPCOES_FILTRO.map(o => o.label)).toEqual(['Previsto', 'Programado', 'Agendado', 'Realizado', 'Conciliado']);
  });
  it('no select do modal', () => {
    expect(STATUS_FINANCEIRO_OPCOES_MODAL.map(o => o.value)).toEqual(['previsto', 'programado', 'agendado', 'realizado']);
  });
});

describe('a cor do status tem um dono', () => {
  /* ⚠ fix1 (Gabriel, 30/09): caixa SÓ em realizado e conciliado. A OC herda: previsto e programado viram texto (borda
     transparente, como o agendado já era); realizado e conciliado ficam byte a byte como antes. */
  it('previsto, programado e agendado SEM fundo nem borda visível; realizado e conciliado COM', () => {
    for (const s of ['previsto', 'programado', 'agendado'] as const) {
      expect(STATUS_PALETA[s].comCaixa).toBe(false);
      expect(STATUS_PALETA[s].pilula).not.toMatch(/\bbg-/);
      expect(STATUS_PALETA[s].pilula).toContain('border-transparent');
      expect(STATUS_FILTRO_PILULA[s]).toBeUndefined();
    }
    for (const s of ['realizado', 'conciliado'] as const) {
      expect(STATUS_PALETA[s].comCaixa).toBe(true);
      expect(STATUS_PALETA[s].pilula).toMatch(/\bbg-\[#/);
      expect(STATUS_PALETA[s].pilula).not.toContain('border-transparent');
    }
  });
  it('a pílula da OC: realizado igual à de antes do PR, previsto sem caixa', () => {
    const base = 'inline-block h-[15px] whitespace-nowrap rounded-[7px] border px-[6px] text-[9.5px] font-semibold leading-[13px]';
    const r = render(<PilulaStatusDespesa status="realizado" />);
    expect(r.container.querySelector('[data-status="realizado"]')?.className).toBe(`${base} text-[#15803d] bg-[#f0fdf4] border-[#bbf7d0]`);
    const p = render(<PilulaStatusDespesa status="previsto" />);
    expect(p.container.querySelector('[data-status="previsto"]')?.className).toBe(`${base} text-[#c2410c] border-transparent`);
  });
  it('a lista e o filtro leem a mesma paleta (nenhuma segunda cor)', () => {
    expect(STATUS_FILTRO_COR.previsto).toBe(STATUS_PALETA.previsto.texto);
    expect(STATUS_FILTRO_COR.conciliado_real).toBe(STATUS_PALETA.conciliado.texto);
    expect(STATUS_FILTRO_PILULA.realizado).toBe(STATUS_PALETA.realizado.pilula);
    expect(STATUS_FILTRO_PILULA.conciliado_real).toBe(STATUS_PALETA.conciliado.pilula);
    expect(STATUS_FILTRO_PILULA.meta).toBeUndefined();
  });
});

describe('FinanceiroV2Tab — a coluna ST', () => {
  /* ⚠ CONTRATO MUDOU NO FIN-V2-COLUNAS-OC-01 (Gabriel, 05/10): o status renderiza a 8px (`.celula-status`) e a coluna foi
     remedida — 77 → 64. A pílula e a cor continuam vindo do dono. */
  it('ST com 64px (a 8px), Doc com 90 (70 até o PARC-LIVRES-01 passo 3: a coluna passou a escrever o tipo), e o status em pílula', () => {
    expect(tela).toContain('<col style={{ width: 64 }} />');
    expect(tela).not.toContain('<col style={{ width: 77 }} />');
    expect(tela.split('<col style={{ width: 90 }} />').length - 1).toBe(2);   // Valor e Doc.
    expect(tela).not.toContain('<col style={{ width: 70 }} />');
    expect(tela).toContain('<span className={cn(STATUS_PILULA_BASE, stPilula)} data-status={stKey}>{stLabel}</span>');
    expect(tela).not.toContain('text-[10px] leading-tight ${stColor}`}');
  });
  it('o "..." NÃO é fixo (fix1, decisão do Gabriel de 30/09): nenhum sticky à direita na tela', () => {
    expect(tela).not.toContain('sticky right-0');
    /* a busca sabe achar: os sticky da ESQUERDA (checkbox, origem, datas) continuam */
    expect(tela).toContain('sticky left-0 z-10 bg-background');
  });

  /* ⚠ A CONTA DE LARGURA, MEDIDA NA TELA (fix1): na janela do Gabriel o scroller tem 909px de `clientWidth` (innerWidth 1.135) e
     o `respiro-lista` tira 20 — 889 úteis. Com 15 de barra clássica (Windows, ou macOS "mostrar sempre"), 874. A soma do colgroup
     no modo NORMAL (sem as duas contas do Ampliado, e o lado `: N` do ternário) tem de caber nesse piso. */
  it('a soma do colgroup no modo normal cabe nos 874px úteis medidos', () => {
    const grupo = tela.slice(tela.indexOf('<colgroup>'), tela.indexOf('</colgroup>'));
    const cols = grupo.split('\n').filter(l => l.includes('<col style') && !l.includes('modoIntensivo &&'));
    const larguras = cols.map(l => {
      const tern = l.match(/modoIntensivo \? \d+ : (\d+)/);
      return Number(tern ? tern[1] : l.match(/width: (\d+)/)![1]);
    });
    expect(larguras.length).toBe(16);   // FIN-V2-COLUNAS-OC-01: +1, a coluna do ícone da OC (16px); a soma segue ≤ 874
    expect(larguras.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(874);
  });
});
