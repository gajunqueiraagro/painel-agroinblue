/**
 * O que este teste trava — a unidade é honrada no modal onde se negocia o lote.
 *
 * ⚠ A UNIDADE JÁ ERROU UMA VEZ E CUSTOU UMA MIGRATION. Os campos do diálogo legado se
 * chamam `bonusPrecoce` × `bonusPrecoceReais`, e o nome sugere "percentual × reais". A
 * aritmética da lib diz outra coisa — `bonusPrecoce * totalArrobas` —, ou seja, o primeiro
 * lado é **R$ por arroba**. A tabela nasceu com CHECK `('pct','reais')` por causa dessa
 * leitura, e `abate_fontes_bonus_arroba` a corrigiu. Este teste afirma o que a conta faz,
 * não o que o nome sugere.
 *
 * ⚠ AS ASSERÇÕES SOBREVIVERAM À TROCA DE TELA. Elas nasceram no formulário inline
 * (`AbaNegociacaoAbate`), que morreu por substituição em ABATE-UX-01c; as regras não
 * mudaram uma vírgula, então o teste mudou de endereço e não de conteúdo. O que era da
 * lista — total de vários lotes, aviso de categoria sem subcentro, lista vazia — foi para
 * `abaLotesAbateTotais`, que é quem passou a responder por isso.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalNegociarLote } from '@/components/abate/ModalNegociarLote';
import { linhaVazia, type LoteAbate } from '@/components/abate/calculoDoLote';
import type { LinhaAbate } from '@/hooks/useOperacaoAbate';

const M: LoteAbate = {
  id: 'l1', ordem: 1, categoria: 'bois', categoriaLabel: 'Bois', quantidade: 10, pesoMedioKg: 500,
};

/* 10 cab × 500 kg, carcaça 2.500 kg no LOTE → 250 kg/cab → 16,6667 @/cab → 166,6667 @. */
const linha = (extra: Partial<LinhaAbate> = {}): LinhaAbate => ({
  ...linhaVazia('l1'),
  pesoCarcacaKg: 2500, pesoCarcacaFonte: 'total',
  precoArroba: 300, precoFonte: 'arroba',
  ...extra,
});

function montar(l: LinhaAbate | undefined, onAplicar = vi.fn()) {
  render(
    <ModalNegociarLote lote={M} linha={l} cenario="realizado"
      onAplicar={onAplicar} onFechar={vi.fn()} />,
  );
  return onAplicar;
}

/* ⚠ PELO <label>, não pelo texto solto: desde ABATE-UX-01e o modal tem títulos de seção,
   e "Carcaça" aparece duas vezes — o título e o rótulo do campo. Buscar o texto pegaria o
   primeiro dos dois, que é o título e não tem input dentro. */
const campoPorRotulo = (rotulo: string) => {
  const label = screen.getAllByText(rotulo).find(el => el.tagName === 'LABEL');
  return label!.parentElement!.querySelector('input') as HTMLInputElement;
};

describe('Modal do lote — a unidade vem da conta', () => {
  it('bônus em R$/@ multiplica pelas arrobas: 2 × 166,67 = R$ 333,33', () => {
    montar(linha({ bonusPrecoce: { valor: 2, fonte: 'arroba' } }));
    /* ⚠ Se a fonte fosse lida como percentual, o bônus seria 2% da base (R$ 1.000) — um
       número três vezes maior. Aparece no lado derivado, no subtexto por @/cab e na
       cascata do rodapé; as três leituras saem do mesmo total. */
    expect(screen.getAllByText(/333,33/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('R$ 1.000,00')).not.toBeInTheDocument();
  });

  it('o mesmo bônus em R$ total NÃO é multiplicado — 333,33 continua 333,33', () => {
    montar(linha({ bonusPrecoce: { valor: 333.33, fonte: 'reais' } }));
    /* Agora o derivado é o outro lado: 333,33 / 166,6667 = R$ 2,00 por arroba. */
    expect(screen.getAllByText(/R\$ 2,00/).length).toBeGreaterThan(0);
  });

  it('o Funrural é percentual — 1,5% de R$ 50.000 = R$ 750,00', () => {
    /* Base: 166,6667 @ × R$ 300 = R$ 50.000. */
    montar(linha({ funrural: { valor: 1.5, fonte: 'pct' } }));
    expect(screen.getAllByText(/750,00/).length).toBeGreaterThan(0);
  });

  it('a cascata do rodapé mostra base, bruto e líquido do lote', () => {
    montar(linha());
    expect(screen.getByText('Líquido do lote')).toBeInTheDocument();
    /* Sem bônus nem desconto, os três marcos valem o mesmo. */
    expect(screen.getAllByText('R$ 50.000,00').length).toBeGreaterThanOrEqual(3);
  });
});

describe('Rendimento e arrobas — derivados, nunca digitados', () => {
  it('o rendimento aparece fora de card e não tem campo', () => {
    montar(linha());
    /* 250 kg de carcaça sobre 500 kg de peso vivo = 50,00%. */
    expect(screen.getByText(/50\.00%|50,00%/)).toBeInTheDocument();
    const valores = [...document.querySelectorAll('input[type="number"]')].map(i => (i as HTMLInputElement).value);
    expect(valores).not.toContain('50');
  });

  it('o rendimento derivado sobe junto do que se aplica', () => {
    const onAplicar = montar(linha({ pesoCarcacaKg: null, pesoCarcacaFonte: null }));
    fireEvent.change(campoPorRotulo('Carcaça'), { target: { value: '250' } });
    fireEvent.click(screen.getByText('Aplicar'));
    const proxima = onAplicar.mock.calls[0][0];
    expect(proxima.rendimentoCarcacaPct).toBe(50);
    /* Digitou 250 no lado `cab`; grava o total das 10 cabeças. */
    expect(proxima.pesoCarcacaKg).toBe(2500);
    expect(proxima.pesoCarcacaFonte).toBe('cabeca');
  });
});

describe('Carcaça e preço — dois lados, um canônico', () => {
  it('com fonte "total", o campo mostra o total do lote', () => {
    montar(linha());
    expect(campoPorRotulo('Carcaça').value).toBe('2500');
  });

  it('ida e volta cabeça ↔ total fecha a 2 casas', () => {
    const onAplicar = montar(linha({ pesoCarcacaKg: null, pesoCarcacaFonte: null }));
    /* 10 cabeças × 333,33 kg = 3.333,30 no total. */
    fireEvent.change(campoPorRotulo('Carcaça'), { target: { value: '333.33' } });
    fireEvent.click(screen.getByText('Aplicar'));
    expect(onAplicar.mock.calls[0][0].pesoCarcacaKg).toBe(3333.3);
  });

  it('sem carcaça, o total do lote fica travado e DIZ por quê', () => {
    /* ⚠ Sem arrobas a conversão seria divisão por zero. */
    montar(linha({ pesoCarcacaKg: null, pesoCarcacaFonte: null, rendimentoCarcacaPct: null }));
    const travado = document.querySelector('[title^="Informe a carcaça primeiro"]');
    expect(travado).not.toBeNull();
    expect(travado!.textContent).toBe('—');
  });

  it('Aplicar devolve a linha ao pai; Cancelar não devolve nada', () => {
    /* ⚠ O MODAL NÃO PERSISTE — quem grava é o rodapé do shell, na ordem lotes → abate →
       confirmar. Aplicar só troca o rascunho. */
    const onAplicar = vi.fn();
    const onFechar = vi.fn();
    render(<ModalNegociarLote lote={M} linha={linha()} cenario="realizado"
      onAplicar={onAplicar} onFechar={onFechar} />);
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onAplicar).not.toHaveBeenCalled();
    expect(onFechar).toHaveBeenCalled();
  });
});
