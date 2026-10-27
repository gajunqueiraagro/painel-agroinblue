/**
 * P88 — os campos de número do painel financeiro da venda (o mesmo estado do LancamentosTab): eram `Input type="number"`, que no
 * teclado brasileiro recusa a vírgula e não faz conta. Agora são o `CampoMoeda` (R$) e o `CampoNumeroComConta` (%, parcelas), com a
 * conta; o estado que sobe continua no TEXTO DE MÁQUINA ("1000", "1.5"), que os leitores de sempre (`Number`, `parseNumericValue`) leem.
 */
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';

vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'or', 'in', 'order', 'limit', 'maybeSingle', 'single']) c[m] = () => c;
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return c;
  };
  return { supabase: { from: () => cadeia(), rpc: () => Promise.resolve({ data: null, error: null }) } };
});
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz-1', nome: 'Fazenda' }, fazendas: [] }) }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', config: {} } }) }));

import { VendaFinanceiroPanel } from '@/components/VendaFinanceiroPanel';

const comoInput = (el: Element | null | undefined): HTMLInputElement => { if (!(el instanceof HTMLInputElement)) throw new Error('não é input'); return el; };
const campoDoRotulo = (rotulo: string) => {
  const label = screen.getAllByText(rotulo).find((el) => el.tagName === 'LABEL');
  return comoInput(label?.parentElement?.querySelector('input'));
};
const digitarESair = (input: HTMLInputElement, texto: string) => {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: texto } });
  fireEvent.blur(input);
};

function Hospedeiro({ registro }: { registro: Record<string, string> }) {
  const [frete, setFrete] = useState('');
  const [comissao, setComissao] = useState('');
  const [outros, setOutros] = useState('');
  const [funPct, setFunPct] = useState('');
  const [funReais, setFunReais] = useState('');
  const sobe = (k: string, set: (v: string) => void) => (v: string) => { registro[k] = v; set(v); };
  return (
    <QueryClientProvider client={new QueryClient()}>
      <VendaFinanceiroPanel
        quantidade={100} pesoKg={50000} categoria="bois" data="2026-10-10" destino="" fornecedorId="" onFornecedorIdChange={() => {}}
        fornecedores={[]} onCreateFornecedor={async () => {}} notaFiscal="" onNotaFiscalChange={() => {}} statusOp="realizado"
        tipoPeso="gado_adulto" onTipoPesoChange={() => {}} vendaTipoPreco="por_kg" onVendaTipoPrecoChange={() => {}} vendaPrecoInput="10"
        onVendaPrecoInputChange={() => {}} valorBruto={500000} totalBonus={0} totalDescontos={0} valorLiquido={500000}
        funruralPct={funPct} onFunruralPctChange={sobe('funruralPct', setFunPct)} descontoQualidade="" onDescontoQualidadeChange={() => {}}
        outrosDescontos={outros} onOutrosDescontosChange={sobe('outros', setOutros)} descFunruralTotal={0} descQualidadeTotal={0}
        frete={frete} onFreteChange={sobe('frete', setFrete)} comissao={comissao} onComissaoChange={sobe('comissao', setComissao)}
        funruralReais={funReais} onFunruralReaisChange={sobe('funruralReais', setFunReais)} comissaoVal={0} freteVal={0}
      />
    </QueryClientProvider>
  );
}

describe('P88 — painel da venda: os campos fazem conta e o estado segue no texto de máquina', () => {
  it('Frete "800+200" → "1000"; Outros custos "1.234,56" → "1234.56"; Comissão "1,5%" → "1.5"', () => {
    const registro: Record<string, string> = {};
    render(<Hospedeiro registro={registro} />);
    fireEvent.click(screen.getByText('Despesas Comerciais'));
    const frete = campoDoRotulo('Frete (R$)');
    fireEvent.focus(frete);
    fireEvent.change(frete, { target: { value: '800+200' } });
    expect(within(frete.parentElement!).getByTestId('conta-do-campo').textContent).toBe('= 1.000,00');
    fireEvent.blur(frete);
    expect(registro.frete).toBe('1000');
    digitarESair(campoDoRotulo('Outros custos extras (R$)'), '1.234,56');
    expect(registro.outros).toBe('1234.56');
    digitarESair(campoDoRotulo('Comissão (%)'), '1,5%');
    expect(registro.comissao).toBe('1.5');
  });

  it('Funrural: o % digitado apaga o R$ e vice-versa (a exclusão de sempre), em texto de máquina', () => {
    const registro: Record<string, string> = {};
    render(<Hospedeiro registro={registro} />);
    fireEvent.click(screen.getByText('Deduções / Encargos'));
    digitarESair(campoDoRotulo('Funrural (%)'), '1,2+0,3');
    expect(registro.funruralPct).toBe('1.5');
    expect(registro.funruralReais).toBe('');
  });
});

describe('P88 — LancamentosTab (lido da fonte: a tela inteira não monta em teste)', () => {
  const fonte = readFileSync('src/pages/LancamentosTab.tsx', 'utf8');
  it('nenhum Input type="number"; os campos do Valor da Operação passam pelo texto de máquina', () => {
    expect(fonte).not.toMatch(/type="number"/);
    expect(fonte).toContain('<CampoMoeda casas={4} valor={numMaq(precoKg)} onChange={n => setPrecoKg(txtMaq(n))}');
    for (const [v, set] of [['bonus', 'setBonus'], ['descontos', 'setDescontos'], ['frete', 'setFrete'], ['outrasDespesas', 'setOutrasDespesas']]) {
      expect(fonte).toContain(`<CampoMoeda valor={numMaq(${v})} onChange={n => ${set}(txtMaq(n))}`);
    }
    expect(fonte).toContain('<CampoNumeroComConta percentual sufixoDentro="%" valor={numMaq(comissaoPct)} onChange={n => setComissaoPct(txtMaq(n))}');
  });
  it('o painel da venda também não tem mais type="number"', () => {
    expect(readFileSync('src/components/VendaFinanceiroPanel.tsx', 'utf8')).not.toMatch(/type="number"/);
  });
});
