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
  it('a pílula da OC renderiza EXATAMENTE a classe de antes do PR', () => {
    const { container } = render(<PilulaStatusDespesa status="previsto" />);
    expect(container.querySelector('[data-status="previsto"]')?.className).toBe(
      'inline-block h-[15px] whitespace-nowrap rounded-[7px] border px-[6px] text-[9.5px] font-semibold leading-[13px] text-[#c2410c] bg-[#fff7ed] border-[#fed7aa]');
  });
  it('a lista e o filtro leem a mesma paleta (nenhuma segunda cor)', () => {
    expect(STATUS_FILTRO_COR.previsto).toBe(STATUS_PALETA.previsto.texto);
    expect(STATUS_FILTRO_COR.conciliado_real).toBe(STATUS_PALETA.conciliado.texto);
    expect(STATUS_FILTRO_PILULA.realizado).toBe(STATUS_PALETA.realizado.pilula);
    expect(STATUS_FILTRO_PILULA.meta).toBeUndefined();
  });
});

describe('FinanceiroV2Tab — a coluna ST', () => {
  it('ST com 84px, Doc com 70, e o status sem truncate, em pílula', () => {
    expect(tela).toContain('<col style={{ width: 84 }} />');
    expect(tela).toContain('<col style={{ width: 70 }} />');
    expect(tela).toContain('<span className={cn(STATUS_PILULA_BASE, stPilula)} data-status={stKey}>{stLabel}</span>');
    expect(tela).not.toContain('text-[10px] leading-tight ${stColor}`}');
  });
  it('o "..." continua fixo à direita (regra vigente do CLAUDE.md, não revogada)', () => {
    expect(tela).toContain('align-middle sticky right-0 z-10 bg-background" onClick={(e) => e.stopPropagation()}');
  });
});
