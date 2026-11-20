/**
 * CONC-CASAR-1X1-TABELA-01 (Gabriel 19/11 07:23, FILA 07:26) — o 1:1 com NF no padrão da tabela do Casar N. Caso Luiz Gustavo (sintético):
 * NF 585 de 1.404,00 paga num PIX de 3.404,16 (as NFS-e 270/272 de serviço vieram junto e ainda não estão lançadas).
 *   · o Aplicado nasce = valor da NF (1.404,00) e TRAVADO; ao banco vai o que ele pagou (3.404,16) e o rodapé diz a diferença (2.000,16);
 *   · a caixa da NF: frase curta numa linha (a do banco no title) e os 3 gestos — juros · taxa · OUTRA NOTA (nº e valor opcionais);
 *   · o seletor da conta da taxa na altura da casa (22px), numa linha com o rótulo.
 * O banco falso segue a 115570: sem destino → pergunta (ok na simulação); 'outra_nota' → ok.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

type Item = { lancamento_id: string; valor: number; destino?: string; plano_conta_id?: string; outras_notas?: { numero: string; valor?: number }[] };
const CHAMADAS = vi.hoisted(() => [] as { p_itens: Item[]; p_simular?: boolean }[]);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: { p_itens: Item[]; p_simular?: boolean }) => {
      if (fn !== 'fn_espelho_casar') return Promise.resolve({ data: null, error: null });
      CHAMADAS.push(args);
      const i = args.p_itens[0];
      if (Math.abs(i.valor - 3404.16) > 0.005) return Promise.resolve({ data: { ok: false, motivo: 'soma_nao_bate', no_extrato: -3404.16, soma: -i.valor, diferenca: 3404.16 - i.valor }, error: null });
      const decidido = i.destino === 'juros' || i.destino === 'outra_nota' || (i.destino === 'taxa' && !!i.plano_conta_id);
      if (!decidido) {
        const pergunta_nf = { lancamento_id: i.lancamento_id, sentido: 'a_mais', opcoes: ['juros', 'taxa', 'outra_nota'], diferenca: 2000.16,
          frase: 'A NF nº 585 vale R$ 1.404,00 e o banco pagou R$ 3.404,16: o valor da NF não muda. Diga o que é a diferença de R$ 2.000,16: juros/multa, outra despesa sem nota (taxa) ou outra nota do fornecedor que falta lançar.' };
        return Promise.resolve({ data: args.p_simular ? { ok: true, no_extrato: -3404.16, soma: -3404.16, pergunta_nf } : { ok: false, motivo: 'nf_diferenca', pergunta_nf, frase: pergunta_nf.frase }, error: null });
      }
      return Promise.resolve({ data: { ok: true, no_extrato: -3404.16, soma: -3404.16 }, error: null });
    },
  },
}));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({ CriarLancamentoDaLinha: () => null }));
vi.mock('@/components/financeiro-v2/EspelhoConciliacaoTab', () => ({ MOTIVO_CASAR_LABEL: {} }));
vi.mock('@/components/conciliacao/EscolherContaDaTaxa', () => ({
  EscolherContaDaTaxa: ({ onEscolher }: { onEscolher: (c: { id: string; subcentro: string }) => void }) => (
    <button type="button" data-testid="conta-da-taxa" onClick={() => onEscolher({ id: 'pc-tarifas', subcentro: 'Tarifas Bancárias' })}>Tarifas Bancárias</button>
  ),
}));

import { CasarComBancoModal } from './CasarComBancoModal';

const EXTRATO = { extrato_id: 'e-pix', data: '2026-10-20', historico: 'PIX - ENVIADO - 20/10 09:12 LUIZ GUSTAVO PECAS', valor: -3404.16 };
const NF = { lancamento_id: 'l-585', descricao: 'Peças para manutenção · válvula de admissão', fornecedor: 'Luiz Gustavo Peças', valor_assinado: -1404,
  numero_documento: '000.000.585', data_vencimento: '2026-10-20', status_transacao: 'programado', usarValorDoBanco: true };

function montar() {
  CHAMADAS.length = 0;
  const ok = vi.fn();
  render(<CasarComBancoModal open onClose={() => {}} extrato={EXTRATO} iniciais={[NF]} nomeConta="Banco do Brasil" contaBancariaId="bb" onConciliado={ok} />);
  return ok;
}
const conciliar = () => screen.getByTestId('conciliar-casar') as HTMLButtonElement;
const gravado = () => CHAMADAS.filter((c) => c.p_simular === false)[0]?.p_itens[0];

describe('1:1 com NF: o aplicado é o valor da NF, travado', () => {
  it('o campo mostra 1.404,00 e não se edita; ao banco vai 3.404,16; o rodapé diz a diferença; sem "Ligar com o valor do extrato"', async () => {
    montar();
    const aplicado = screen.getByTestId('levado-linha-aplicado') as HTMLInputElement;
    expect(aplicado.value).toBe('1.404,00');
    expect(aplicado.readOnly).toBe(true);
    expect(aplicado.getAttribute('data-travado')).toBe('nf');
    expect(screen.queryByTestId('usar-valor-banco')).toBeNull();
    expect(screen.getByTestId('levados-diferenca').textContent).toBe('-2.000,16');
    expect(screen.getByTestId('levado-linha-fica').textContent).toBe('inteira');
    await screen.findByTestId('pergunta-nf');
    expect(CHAMADAS[0].p_itens[0]).toMatchObject({ lancamento_id: 'l-585', valor: 3404.16 });
    expect(screen.queryByTestId('aceitar-valor-extrato')).toBeNull();
    expect(conciliar().disabled).toBe(true);
  });
});

describe('1:1 com NF levada SEM a marca do banco (o "Casar selecionados", o Procurar)', () => {
  it('o campo segue o valor da NF, travado, e ao banco vai o valor do extrato (a pergunta da NF aparece)', async () => {
    CHAMADAS.length = 0;
    render(<CasarComBancoModal open onClose={() => {}} extrato={EXTRATO} iniciais={[{ ...NF, usarValorDoBanco: false }]} nomeConta="Banco do Brasil"
      contaBancariaId="bb" onConciliado={() => {}} />);
    expect((screen.getByTestId('levado-linha-aplicado') as HTMLInputElement).value).toBe('1.404,00');
    await screen.findByTestId('pergunta-nf');
    expect(CHAMADAS[0].p_itens[0]).toMatchObject({ lancamento_id: 'l-585', valor: 3404.16 });
  });
});

describe('a caixa da NF: frase curta e os 3 gestos do "a mais"', () => {
  it('frase numa linha (a do banco no title) e os três botões, "Outra nota (falta lançar)" entre eles', async () => {
    montar();
    const frase = await screen.findByTestId('pergunta-nf-frase');
    expect(frase.textContent).toBe('NF nº 000.000.585: o banco pagou R$ 2.000,16 a mais que a nota (o valor da NF não muda). O que é a diferença?');
    expect(frase.className).toContain('truncate');
    expect(frase.getAttribute('title')).toContain('outra nota do fornecedor que falta lançar');
    expect(['destino-juros', 'destino-taxa', 'destino-outra_nota'].map((t) => screen.getByTestId(t).textContent))
      .toEqual(['É juros/multa', 'Outra despesa sem nota (taxa)', 'Outra nota (falta lançar)']);
  });

  it('"Outra nota" com os números e sem valor: o item vai com destino + outras_notas e grava; a frase diz a pendência', async () => {
    const ok = montar();
    fireEvent.click(await screen.findByTestId('destino-outra_nota'));
    expect(conciliar().disabled).toBe(true);
    fireEvent.change(screen.getByTestId('outra-nota-numero'), { target: { value: '270, 272' } });
    fireEvent.click(screen.getByTestId('confirmar-outra-nota'));
    await waitFor(() => expect(screen.queryByTestId('pergunta-nf')).toBeNull());
    expect(screen.getByTestId('escolha-nf').textContent).toContain('R$ 2.000,16 viram "Falta nota nº 270, 272" (a classificar)');
    expect(screen.getByTestId('escolha-nf').textContent).toContain('pendência de anexar a nota');
    await waitFor(() => expect(conciliar().disabled).toBe(false));
    fireEvent.click(conciliar());
    await waitFor(() => expect(ok).toHaveBeenCalled());
    expect(gravado()).toEqual({ lancamento_id: 'l-585', valor: 3404.16, destino: 'outra_nota', outras_notas: [{ numero: '270, 272' }] });
  });

  it('"Outra nota" com o valor de cada uma: uma nota por linha (o banco confere a soma)', async () => {
    const ok = montar();
    fireEvent.click(await screen.findByTestId('destino-outra_nota'));
    fireEvent.change(screen.getByTestId('outra-nota-numero'), { target: { value: '270' } });
    fireEvent.change(screen.getByTestId('outra-nota-valor').querySelector('input')!, { target: { value: '1.200,16' } });
    fireEvent.click(screen.getByTestId('outra-nota-mais'));
    fireEvent.change(screen.getAllByTestId('outra-nota-numero')[1], { target: { value: '272' } });
    fireEvent.change(screen.getAllByTestId('outra-nota-valor')[1].querySelector('input')!, { target: { value: '800,00' } });
    fireEvent.click(screen.getByTestId('confirmar-outra-nota'));
    await waitFor(() => expect(conciliar().disabled).toBe(false));
    fireEvent.click(conciliar());
    await waitFor(() => expect(ok).toHaveBeenCalled());
    expect(gravado()?.outras_notas).toEqual([{ numero: '270', valor: 1200.16 }, { numero: '272', valor: 800 }]);
  });

  it('"taxa": o seletor na linha do rótulo, na altura da casa; com a conta, grava com plano_conta_id', async () => {
    const ok = montar();
    fireEvent.click(await screen.findByTestId('destino-taxa'));
    const seletor = screen.getByTestId('conta-da-taxa');
    expect(seletor.parentElement?.className).toContain('w-[300px]');
    expect(seletor.parentElement?.parentElement?.textContent).toContain('Conta da taxa');
    fireEvent.click(seletor);
    await waitFor(() => expect(conciliar().disabled).toBe(false));
    fireEvent.click(conciliar());
    await waitFor(() => expect(ok).toHaveBeenCalled());
    expect(gravado()).toMatchObject({ destino: 'taxa', plano_conta_id: 'pc-tarifas', valor: 3404.16 });
  });

  it('NADA SE DESLOCA: o que abre (outra nota · taxa) mora no MESMO lugar reservado, de altura fixa (o rodapé não desce)', async () => {
    montar();
    const lugar = () => screen.getByTestId('pergunta-nf-lugar');
    await screen.findByTestId('pergunta-nf');
    const antes = lugar();
    expect(antes.className).toContain('h-[49px]');
    expect(antes.className).toContain('overflow-y-auto');
    expect(antes.textContent).toBe('Escolha acima o que é a diferença.');
    fireEvent.click(screen.getByTestId('destino-outra_nota'));
    expect(lugar()).toBe(antes);
    expect(antes.contains(screen.getByTestId('outras-notas'))).toBe(true);
    fireEvent.click(screen.getByTestId('destino-taxa'));
    expect(lugar()).toBe(antes);
    expect(antes.contains(screen.getByTestId('conta-da-taxa'))).toBe(true);
  });
});
