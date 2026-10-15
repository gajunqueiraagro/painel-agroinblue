/**
 * ZOOT-MES-FECHADO-MODAL-01 — o motivo do botão travado mora DENTRO do modal, numa faixa comum acima dos botões, num lugar
 * reservado; P1 (Mapa de Pastos) e trava master; releitura quando a janela volta ao foco.
 * Montados: a faixa, Nascimento, Morte, Venda e Abate. Lidos da fonte (não se montam em teste): Compra e o formulário
 * genérico do `LancamentosTab` (Transferência e Consumo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState, useCallback, useEffect } from 'react';

/* o P1 do "banco": cada caso decide; o hook de mentira guarda o que leu e relê no `refetch` (como o de verdade) */
const banco = vi.hoisted(() => ({ p1: 'pendente' as string, leituras: 0 }));
vi.mock('@/hooks/useStatusPilares', () => ({
  useStatusPilares: (fazendaId: string | undefined, anoMes: string | undefined) => {
    const [status, setStatus] = useState(banco.p1);
    const refetch = useCallback(async () => { banco.leituras += 1; setStatus(banco.p1); }, []);
    useEffect(() => { void refetch(); }, [refetch, fazendaId, anoMes]);
    return { status: { p1_mapa_pastos: { status } }, loading: false, error: null, refetch };
  },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: async () => ({ data: null, error: null }) } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ isAdmin: true, clienteAtual: { id: 'c1', perfil: 'admin_agroinblue' } }) }));
vi.mock('@/hooks/useOcCompromissos', () => ({
  useOcCompromissos: () => ({ resumoOperacao: null, compromissos: [], loading: false, recarregar: async () => {} }),
}));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

import { AvisoMesFechado } from './AvisoMesFechado';
import { NascimentoModalShell } from '@/components/nascimento/NascimentoModalShell';
import { MorteModalShell } from '@/components/morte/MorteModalShell';
import { VendaModalShell } from '@/components/venda/VendaModalShell';
import { AbateModalShell } from '@/components/abate/AbateModalShell';
import { mesFechadoMotivo, travaMasterMotivo, tituloDaTrava } from '@/lib/zootecnico/mesFechadoP1';

const P1 = 'Setembro/2026 fechado no Mapa de Pastos (P1) para Faz. 3 Muchachas. Reabra pelo botão ao lado ou em Produção › Fechamento Área.';
const MASTER = 'Mês set/2026 com trava master (Faz. 3 Muchachas). Desbloqueie com a senha master.';
const FAZ = [{ id: 'faz3', nome: 'Faz. 3 Muchachas' }];
const mascara = { displayValue: '', onChange: () => {}, onBlur: () => {}, onFocus: () => {} };

beforeEach(() => { banco.p1 = 'pendente'; banco.leituras = 0; });

describe('as frases (uma fonte: mesFechadoP1.ts)', () => {
  it('P1 diz o que trava e os dois caminhos; master diz o mês curto e a senha; nulo quando não trava', () => {
    expect(mesFechadoMotivo(true, '2026-09', 'Faz. 3 Muchachas')).toBe(P1);
    expect(travaMasterMotivo(true, '2026-09', 'Faz. 3 Muchachas')).toBe(MASTER);
    expect(mesFechadoMotivo(false, '2026-09', 'X')).toBeNull();
    expect(travaMasterMotivo(false, '2026-09', 'X')).toBeNull();
    expect(travaMasterMotivo(true, undefined, 'X')).toBeNull();
    expect(tituloDaTrava(P1, MASTER)).toBe(`${P1} ${MASTER}`);
    expect(tituloDaTrava(null, null)).toBeUndefined();
  });
});

describe('a faixa: lugar reservado, P1 primeiro, as duas cabem', () => {
  it('vazia, só P1, só master e as duas: a MESMA caixa de 40px; duas linhas de 18px', () => {
    const casos = [[null, null], [P1, null], [null, MASTER], [P1, MASTER]] as const;
    const classes: string[] = [];
    for (const [p1, master] of casos) {
      const { unmount } = render(<AvisoMesFechado p1={p1} master={master} />);
      const faixa = screen.getByTestId('aviso-mes-fechado');
      expect(faixa.className).toContain('h-10');
      expect(faixa.className).toContain('overflow-hidden');
      classes.push(faixa.className.split(' ').filter(c => /^h-|^py-|^px-/.test(c)).join(' '));
      const linhas = faixa.querySelectorAll('[data-testid^="aviso-mes-fechado-"]');
      expect(linhas.length).toBe((p1 ? 1 : 0) + (master ? 1 : 0));
      linhas.forEach(l => expect(l.className).toContain('h-[18px]'));
      if (p1 && master) expect(Array.from(linhas).map(l => l.getAttribute('data-testid'))).toEqual(['aviso-mes-fechado-p1', 'aviso-mes-fechado-master']);
      unmount();
    }
    expect(new Set(classes).size).toBe(1);
  });
});

function nascimento(over: Record<string, unknown> = {}) {
  return render(
    <NascimentoModalShell modo="criacao" data="2026-09-15" setData={() => {}} qtdInput={mascara} pesoInput={mascara}
      categoria="" setCategoria={() => {}} categoriasDisponiveis={[]} observacao="" setObservacao={() => {}}
      nascFazendaId="faz3" setNascFazendaId={() => {}} fazendasOC={FAZ} nascFazendaNome="Faz. 3 Muchachas" nascFazendaFalta={false}
      nascQtd={2} nascPeso={30} submitting={false} handleRequestRegister={() => {}} fecharModalOCComAutosave={() => {}} {...over} />,
  );
}
function morte(over: Record<string, unknown> = {}) {
  return render(
    <MorteModalShell modo="criacao" data="2026-09-15" setData={() => {}} qtdInput={mascara} pesoInput={mascara}
      categoria="" setCategoria={() => {}} categoriasDisponiveis={[]} observacao="" setObservacao={() => {}}
      morteFazendaId="faz3" setMorteFazendaId={() => {}} fazendasOC={FAZ} morteFazendaNome="Faz. 3 Muchachas" morteFazendaFalta={false}
      motivoMorte="Raio" setMotivoMorte={() => {}} motivoMorteCustom="" setMotivoMorteCustom={() => {}} motivosDisponiveis={['Raio']}
      valorMorte={null} setValorMorte={() => {}} morteQtd={2} mortePeso={300} submitting={false}
      handleRequestRegister={() => {}} fecharModalOCComAutosave={() => {}} {...over} />,
  );
}

describe.each([
  ['Nascimento', nascimento, 'Registrar nascimento'],
  ['Morte', morte, 'Registrar morte'],
] as const)('%s', (_nome, montar, rotulo) => {
  const botao = () => screen.getByRole('button', { name: rotulo });
  it('mês aberto: faixa vazia no lugar reservado, botão habilitado', async () => {
    montar();
    await act(async () => {});
    expect(screen.getByTestId('aviso-mes-fechado').hasAttribute('data-vazio')).toBe(true);
    expect(botao().hasAttribute('disabled')).toBe(false);
  });
  it('P1 fechado: a frase DENTRO do modal (mês e fazenda), botão travado com o mesmo texto no title', async () => {
    banco.p1 = 'oficial';
    montar();
    await act(async () => {});
    expect(screen.getByTestId('aviso-mes-fechado-p1').textContent).toContain(P1);
    expect(screen.getByTestId('reabrir-mes')).toBeTruthy();
    expect(botao().hasAttribute('disabled')).toBe(true);
    expect(botao().getAttribute('title')).toBe(P1);
  });
  it('trava master: a linha da master e o botão travado', async () => {
    montar({ motivoTravaMaster: MASTER });
    await act(async () => {});
    expect(screen.getByTestId('aviso-mes-fechado-master').textContent).toContain(MASTER);
    expect(screen.queryByTestId('aviso-mes-fechado-p1')).toBeNull();
    expect(botao().hasAttribute('disabled')).toBe(true);
    expect(botao().getAttribute('title')).toBe(MASTER);
  });
  it('as duas: duas linhas na mesma faixa, P1 primeiro', async () => {
    banco.p1 = 'oficial';
    montar({ motivoTravaMaster: MASTER });
    await act(async () => {});
    const faixa = screen.getByTestId('aviso-mes-fechado');
    expect(Array.from(faixa.querySelectorAll('[data-testid^="aviso-mes-fechado-"]')).map(l => l.getAttribute('data-testid')))
      .toEqual(['aviso-mes-fechado-p1', 'aviso-mes-fechado-master']);
    expect(botao().getAttribute('title')).toBe(`${P1} ${MASTER}`);
  });
  it('mês reaberto em outra tela: ao voltar o foco o P1 é relido e o botão destrava, sem fechar o modal', async () => {
    banco.p1 = 'oficial';
    montar();
    await act(async () => {});
    expect(botao().hasAttribute('disabled')).toBe(true);
    banco.p1 = 'pendente';
    const antes = banco.leituras;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(banco.leituras).toBeGreaterThan(antes);
    expect(botao().hasAttribute('disabled')).toBe(false);
    expect(screen.getByTestId('aviso-mes-fechado').hasAttribute('data-vazio')).toBe(true);
  });
});

const CP = [{ id: 'ricardo', nome: 'Ricardo Goulart' }];
describe('Venda e Abate (OC): a faixa comum, com a frase da fonte única', () => {
  it('Venda com P1 fechado: a faixa acima dos botões, e a dica curta ao lado do Salvar', async () => {
    banco.p1 = 'oficial';
    render(
      <VendaModalShell data="2026-09-15" setData={() => {}} compradorId="ricardo" setCompradorId={() => {}} contrapartes={CP} clienteId="c1"
        onNovoComprador={() => {}} vendaFazendaId="faz3" setVendaFazendaId={() => {}} fazendasOC={FAZ}
        propriedadeDestino="" setPropriedadeDestino={() => {}} vendaTipoVenda="gado_adulto" setVendaTipoVenda={() => {}}
        observacao="" setObservacao={() => {}} ocOperacaoId="op" ocStatusComercial="programada"
        categoria="" categoriasDisponiveis={[]} quantidadeNum={0} pesoKgNum={0} submitting={false} semAlteracoes={false}
        onSalvarOperacao={async () => true} onSalvarNegociacao={async () => {}} onFechar={() => {}} />,
    );
    await act(async () => {});
    expect(screen.getByTestId('aviso-mes-fechado-p1').textContent).toContain(P1);
    expect(screen.getByText('mês fechado (P1) — veja o aviso acima')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Salvar alterações/ }).getAttribute('title')).toBe(P1);
  });
  it('Abate aberto: faixa vazia, no mesmo lugar reservado', async () => {
    render(
      <AbateModalShell data="2026-09-15" setData={() => {}} frigorificoId="ricardo" setFrigorificoId={() => {}} contrapartes={CP} clienteId="c1"
        onNovoFrigorifico={() => {}} abateFazendaId="faz3" setAbateFazendaId={() => {}} fazendasOC={FAZ}
        observacao="" setObservacao={() => {}} numeroDocumento={null} ocOperacaoId="op" ocStatusComercial="programada"
        categoria="" categoriasDisponiveis={[]} quantidadeNum={0} pesoKgNum={0} submitting={false}
        onSalvarOperacao={async () => true} onSalvarNegociacao={async () => {}} onFechar={() => {}} />,
    );
    await act(async () => {});
    const faixa = screen.getByTestId('aviso-mes-fechado');
    expect(faixa.hasAttribute('data-vazio')).toBe(true);
    expect(faixa.className).toContain('h-10');
  });
  it('Abate com P1 fechado: a frase na faixa', async () => {
    banco.p1 = 'oficial';
    render(
      <AbateModalShell data="2026-09-15" setData={() => {}} frigorificoId="ricardo" setFrigorificoId={() => {}} contrapartes={CP} clienteId="c1"
        onNovoFrigorifico={() => {}} abateFazendaId="faz3" setAbateFazendaId={() => {}} fazendasOC={FAZ}
        observacao="" setObservacao={() => {}} numeroDocumento={null} ocOperacaoId="op" ocStatusComercial="programada"
        categoria="" categoriasDisponiveis={[]} quantidadeNum={0} pesoKgNum={0} submitting={false}
        onSalvarOperacao={async () => true} onSalvarNegociacao={async () => {}} onFechar={() => {}} />,
    );
    await act(async () => {});
    expect(screen.getByTestId('aviso-mes-fechado-p1').textContent).toContain(P1);
  });
});

describe('fonte: os sete pelo mesmo componente e pela mesma frase', () => {
  const ler = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
  const SHELLS = ['src/components/compra/CompraModalShell.tsx', 'src/components/venda/VendaModalShell.tsx', 'src/components/abate/AbateModalShell.tsx'];
  it('detector sabe achar a cópia local antiga da frase', () => {
    const torto = "const x = `${MESES_EXTENSO[1]}/2026 está fechado (P1) para ${f}`;";
    expect(/está fechado \(P1\)|MESES_EXTENSO/.test(torto)).toBe(true);
  });
  it.each(SHELLS)('%s usa mesFechadoMotivo e a faixa comum; a cópia local saiu', (p) => {
    const fonte = ler(p);
    expect(fonte).toMatch(/import \{[^}]*mesFechadoMotivo as fraseDoMesFechado[^}]*\} from '@\/lib\/zootecnico\/mesFechadoP1'/);
    expect(fonte).toContain('fraseDoMesFechado(');
    expect(fonte).toContain('<AvisoMesFechado p1={mesFechadoMotivo}');
    expect(fonte).toContain('useAoVoltarAoFoco(');
    expect(fonte).not.toMatch(/está fechado \(P1\)|MESES_EXTENSO/);
  });
  it('Compra: o botão de registrar segue travado pela frase, com ela no title', () => {
    const fonte = ler('src/components/compra/CompraModalShell.tsx');
    expect(fonte).toContain('!!mesFechadoMotivo}');
    expect(fonte).toContain('title={mesFechadoMotivo ?? undefined}');
  });
  it('Transferência e Consumo (formulário genérico): faixa no envelope, P1 e master, botão travado com o title', () => {
    const fonte = ler('src/pages/LancamentosTab.tsx');
    expect(fonte).toContain('<AvisoMesFechado p1={motivoMesFechado} master={motivoTravaMaster}');
    expect(fonte.match(/disabled=\{submitting \|\| \(!editingAbateId && !!tituloTravaDoForm\)\} title=\{!editingAbateId \? tituloTravaDoForm : undefined\}/g)?.length).toBe(2);
    expect(fonte).toContain('travaMasterDoForm.isReadOnly(formAnoMes)');
    expect(fonte).toContain('useAoVoltarAoFoco(() => { void pilaresDoLancamento.refetch(); void travaMasterDoForm.refreshLock(); }');
    /* Nascimento e Morte recebem a frase da master pela mesma conta */
    expect(fonte.match(/modo: 'criacao' as const,\n    motivoTravaMaster,/g)?.length).toBe(2);
  });
});
