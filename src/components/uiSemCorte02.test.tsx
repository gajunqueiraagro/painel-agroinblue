/**
 * UI-SEM-CORTE-02 — o que o bloco mudou e que o `check:ui-cortes` não prende sozinho:
 *   o ícone do OFX em dois estados no mesmo lugar (item 4), o prazo das pendências em dd/mm/aaaa e o corpo da tabela como flex-1
 *   do modal (item 3), o "Reabrir mês" sem "…" e a frase do mês fechado sem corte (item 1), a linha do Financeiro V2 sem itálico
 *   (item 2). As medidas renderizadas (sobreposição, texto inclinado) são do gate.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/v2/hooks/usePodeAbrir', () => ({ usePodeNaOperacao: () => true }));

import { estadoDoSlotOfx, TITULO_OFX_SEM_SALDO } from '@/lib/conciliacao/slotOfx';
import { dataCompleta } from '@/lib/consultor/pendencias';
import { ReabrirMesNaOC } from '@/components/operacao-comercial/ReabrirMesNaOC';
import { AvisoMesFechado } from '@/components/lancamento/AvisoMesFechado';

const fonte = (p: string) => readFileSync(resolve(__dirname, '..', '..', p), 'utf8');

describe('item 4 — o ícone do OFX', () => {
  it('cheio com saldo do banco; vazado com movimentos e sem saldo; vazio sem nenhum dos dois', () => {
    expect(estadoDoSlotOfx({ comSaldoNoMes: true, importaOfx: true, temExtratoNoMes: true })).toBe('cheio');
    expect(estadoDoSlotOfx({ comSaldoNoMes: true, importaOfx: false, temExtratoNoMes: false })).toBe('cheio');
    expect(estadoDoSlotOfx({ comSaldoNoMes: false, importaOfx: true, temExtratoNoMes: true })).toBe('vazado');
    expect(estadoDoSlotOfx({ comSaldoNoMes: false, importaOfx: true, temExtratoNoMes: false })).toBeNull();
    expect(estadoDoSlotOfx({ comSaldoNoMes: false, importaOfx: false, temExtratoNoMes: true })).toBeNull();
  });
  /* P141 (CONC-LAYOUT-01, D1): o ícone virou o selo "OFX" (7px) num lugar FIXO (P166: 20px) — cheio e vazado no MESMO lugar e no mesmo selo */
  it('a frase do vazado é a do pedido, e a tela usa o MESMO lugar fixo nos dois estados', () => {
    expect(TITULO_OFX_SEM_SALDO).toBe('saldo calculado pelos movimentos — o banco não informou o saldo deste mês');
    const tela = fonte('src/pages/ConciliacaoBancariaTab.tsx');
    expect(tela).toContain("const LUGAR_SELO = 'inline-flex h-[11px] w-[20px] shrink-0");
    expect(tela).toContain('<span className={LUGAR_SELO} data-testid="slot-ofx"');
    expect(tela).toContain("{estadoOfx === 'vazado' && <span className={`${SELO_ARQUIVO} border-dashed");
    expect(tela).toContain('temExtratoNoMes: s.linha.tem_extrato');
  });
});

describe('item 3 — o modal de pendências', () => {
  it('o prazo sai em dd/mm/aaaa', () => {
    expect(dataCompleta('2026-10-19')).toBe('19/10/2026');
    expect(dataCompleta(null)).toBe('—');
  });
  it('o corpo da tabela é o flex-1 de quem hospeda: nenhuma altura própria, e o modal não volta aos 280px', () => {
    const tabela = fonte('src/components/consultor/PendenciasTabela.tsx');
    expect(tabela).not.toMatch(/alturaDoCorpo/);
    expect(tabela).toContain('<div className="min-h-0 flex-1 overflow-auto" data-testid="pendencias-corpo">');
    expect(tabela).toContain('{dataCompleta(p.prazo)}');
    const aviso = fonte('src/components/consultor/AvisoPendenciasCliente.tsx');
    expect(aviso).not.toContain('h-[280px]');
    expect(aviso).not.toContain('alturaDoCorpo');
  });
});

describe('item 1 — o rodapé da OC', () => {
  it('"Reabrir mês" sem reticências', () => {
    render(<ReabrirMesNaOC forma="link" onAbrir={() => {}} />);
    expect(screen.getByTestId('reabrir-mes').textContent).toBe('Reabrir mês');
  });
  it('a frase do mês fechado rola na própria linha, nunca corta com "…"', () => {
    render(<AvisoMesFechado p1="Setembro/2026 fechado no Mapa de Pastos (P1)" master="Mês set/2026 com trava master" />);
    for (const id of ['aviso-mes-fechado-p1', 'aviso-mes-fechado-master']) {
      const span = screen.getByTestId(id).querySelector('span')!;
      expect(span.className).toContain('uma-linha-que-rola');
      expect(span.className).not.toContain('truncate');
    }
  });
  it('a data da Entrega e a faixa "Última saída" com o ano inteiro', () => {
    expect(fonte('src/components/compra/AbaRecebimentoLotes.tsx')).toContain('${tot.ultimaData.slice(0, 4)}');
    expect(fonte('src/components/venda/EntregasVendaTabela.tsx')).toContain('{fmtBr(m.data || null)}');
  });
});

describe('item 2 — a linha do Financeiro V2', () => {
  it('sem itálico na linha, e o texto que corta tem 2px à direita', () => {
    const tela = fonte('src/pages/FinanceiroV2Tab.tsx');
    expect(tela).not.toMatch(/border-b italic/);
    expect(tela).toContain('<span className="truncate pr-0.5">{fornNome}</span>');
    expect(fonte('src/index.css')).toContain('padding-right: 2px !important;');
  });
});
