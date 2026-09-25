/**
 * OC-BOITEL-VALOR-01 A4b — o item que o realizado zera cancela o compromisso dele, depois de confirmar.
 *
 * ⚠ OS NUMEROS SAO DA RRCC da0b8577 (proto, 25/09/2026): a projecao previa 6.000 de despesas fora do
 * boitel (frete 3.000 + notas 3.000, pagos pelo produtor), o compromisso 1e33fb64 nasceu com 6.000,
 * aberto e sem programacao — e o realizado diz ZERO.
 * ⚠ A PERGUNTA SO' EXISTE NESSE CASO (decisao do Gabriel): o caso normal do "Gerar previsao" segue sem
 * dialogo nenhum, e o caso normal e' o primeiro teste.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  planejarPrevisao, planoPedeConfirmacao, executarPlanoPrevisao, ConfirmacaoPrevisao, MOTIVO_ITEM_ZERADO,
  type LinhaPrevisao, type ContagemPrevisao,
} from '@/components/compra/AbaCompromissosOC';

const COMP_FRETE = '1e33fb64-0000-0000-0000-000000000000';
const linha = (o: Partial<LinhaPrevisao>): LinhaPrevisao => ({
  natureza: 'obrigacao', componente: 'frete', subcentro: 'Despesas de Venda', valor: 0,
  descricao: 'Boitel 074 G - Despesas fora do boitel', favorecidoId: null,
  rotulo: 'Despesas fora do boitel', vencimentoPrevisto: null, ...o,
});
/* O tipo e' o que o planejador RECEBE — `status` e' uma uniao de literais, e a fabrica o respeita. */
type CompromissoDoPlano = Parameters<typeof planejarPrevisao>[1][number];
const compromisso = (o: Partial<CompromissoDoPlano>): CompromissoDoPlano => ({
  natureza: 'obrigacao', componente: 'frete', compromissoId: COMP_FRETE,
  status: 'aberto', temProgramacaoAtiva: false, valorCompromisso: 6000, ...o,
});
const contagemVazia = (): ContagemPrevisao => ({ criadas: 0, substituidas: 0, mantidas: 0, canceladas: 0, bloqueadas: [] });

describe('o plano da previsao', () => {
  it('caso normal: linha com valor e compromisso igual — nada a perguntar', () => {
    const acoes = planejarPrevisao([linha({ valor: 6000 })], [compromisso({})]);
    expect(acoes.map(a => a.tipo)).toEqual(['manter']);
    expect(planoPedeConfirmacao(acoes)).toBe(false);
  });

  it('RRCC da0b8577: frete zerado pelo realizado com o compromisso aberto -> cancelar, e pergunta antes', () => {
    const acoes = planejarPrevisao([linha({ zerada: true })], [compromisso({})]);
    expect(acoes).toEqual([expect.objectContaining({ tipo: 'cancelar_zerado', compromissoId: COMP_FRETE, valorAnterior: 6000 })]);
    expect(planoPedeConfirmacao(acoes)).toBe(true);
  });

  it('zerado com o compromisso PROGRAMADO: bloqueado, com o motivo, e sem pergunta', () => {
    const acoes = planejarPrevisao([linha({ zerada: true })], [compromisso({ status: 'programado', temProgramacaoAtiva: true })]);
    expect(acoes).toEqual([expect.objectContaining({ tipo: 'bloquear', rotulo: 'Despesas fora do boitel (zerada pelo realizado)' })]);
    expect(planoPedeConfirmacao(acoes)).toBe(false);
  });

  it('zerado sem compromisso nenhum: nada a fazer', () => {
    expect(planejarPrevisao([linha({ zerada: true })], []).map(a => a.tipo)).toEqual(['ignorar']);
  });
});

describe('confirmando, o cancelamento grava com o motivo fixo e a versao encadeada', () => {
  it('cancela o 1e33fb64 com "item zerado pelo realizado"', async () => {
    const cancelar = vi.fn(async (v: number) => v + 1);
    const criar = vi.fn(async (v: number) => v + 1);
    const contagem = contagemVazia();
    const acoes = planejarPrevisao(
      [linha({ zerada: true }), linha({ natureza: 'principal', componente: 'principal', valor: 473884.10, rotulo: 'Recebimento ref. operação' })],
      [compromisso({})],
    );
    const vFinal = await executarPlanoPrevisao(acoes, 10, { criar, cancelar }, contagem);
    expect(cancelar).toHaveBeenCalledWith(10, COMP_FRETE, MOTIVO_ITEM_ZERADO);
    expect(MOTIVO_ITEM_ZERADO).toBe('item zerado pelo realizado');
    /* ⚠ A VERSAO ANDA PELO RETORNO: a criacao seguinte recebe a do cancelamento, nao a inicial. */
    expect(criar).toHaveBeenCalledWith(11, expect.objectContaining({ valor_total: 473884.10 }));
    expect(vFinal).toBe(12);
    expect(contagem).toMatchObject({ canceladas: 1, criadas: 1 });
  });
});

describe('a confirmacao', () => {
  const acoes = planejarPrevisao(
    [linha({ zerada: true }), linha({ natureza: 'principal', componente: 'principal', valor: 473884.10, rotulo: 'Recebimento ref. operação' })],
    [compromisso({})],
  );

  it('lista o que sera cancelado (componente e valor) e o que sera gerado', () => {
    render(<ConfirmacaoPrevisao acoes={acoes} gravando={false} onConfirmar={() => {}} onVoltar={() => {}} />);
    const cancelar = document.querySelector('[data-acao="cancelar"]');
    expect(cancelar?.textContent).toMatch(/Despesas fora do boitel/);
    expect(cancelar?.textContent).toMatch(/6\.000,00/);
    expect(document.querySelector('[data-acao="gerar"]')?.textContent).toMatch(/473\.884,10/);
    /* SEM CAMPO DE MOTIVO: o gravado e' fixo. */
    expect(document.querySelector('input, textarea')).toBeNull();
  });

  it('Voltar nao grava nada; Confirmar confirma', () => {
    const onConfirmar = vi.fn();
    const onVoltar = vi.fn();
    render(<ConfirmacaoPrevisao acoes={acoes} gravando={false} onConfirmar={onConfirmar} onVoltar={onVoltar} />);
    fireEvent.click(screen.getByText('Voltar'));
    expect(onVoltar).toHaveBeenCalled();
    expect(onConfirmar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Confirmar'));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });
});
