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
/** As três abas do modal — o campo só existe na sua. */
const irPara = (aba: 'Desempenho' | 'Preço' | 'Bônus, descontos e impostos') =>
  fireEvent.click(screen.getByText(aba));

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
    /* ⚠ O CAMPO GRAVA NO BLUR desde ABATE-UX-01h: ele guarda texto enquanto se digita
       (para aceitar "12.260,80" com vírgula sem o cursor saltar) e traduz ao sair. */
    fireEvent.change(campoPorRotulo('Carcaça'), { target: { value: '250' } });
    fireEvent.blur(campoPorRotulo('Carcaça'));
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
    /* Formatado em pt-BR (A15): duas casas e separador de milhar. */
    expect(campoPorRotulo('Carcaça').value).toBe('2.500,00');
  });

  it('ida e volta cabeça ↔ total fecha a 2 casas', () => {
    const onAplicar = montar(linha({ pesoCarcacaKg: null, pesoCarcacaFonte: null }));
    /* 10 cabeças × 333,33 kg = 3.333,30 no total. */
    fireEvent.change(campoPorRotulo('Carcaça'), { target: { value: '333,33' } });
    fireEvent.blur(campoPorRotulo('Carcaça'));
    fireEvent.click(screen.getByText('Aplicar'));
    expect(onAplicar.mock.calls[0][0].pesoCarcacaKg).toBe(3333.3);
  });

  it('sem carcaça, o R$/@ derivado é "—" — mas a base digitada continua valendo', () => {
    /* ⚠ MUDANÇA DE DESENHO EM ABATE-UX-01g, e ela está certa: o total do lote É a base,
       com ou sem carcaça. Quem depende da carcaça é o R$/@ (não há arrobas para dividir),
       e é ele que vira traço. Salvar continua barrado pela RPC, que exige os dois. */
    montar(linha({ pesoCarcacaKg: null, pesoCarcacaFonte: null, rendimentoCarcacaPct: null,
      precoArroba: null, precoFonte: 'total', valorBaseOverride: 306520 }));
    irPara('Preço');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getAllByText('R$ 306.520,00').length).toBeGreaterThan(0);
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

describe('Preço pelo total — o centavo que a conversão inventava', () => {
  /* ⚠ DEFEITO MEDIDO NA HOMOLOGAÇÃO (05/09): digitava-se 306.520,00 pelo total e a tela
     devolvia 306.520,01. A tela convertia para R$/@ (375,00), arredondava a DUAS casas e
     recalculava o total a partir dali — o centavo nascia no arredondamento do meio, não
     nos dados. Agora o total digitado é a BASE e vai inteiro para `valor_base_override`,
     coluna que a lib já consumia (`abate.ts:123`) e que a RPC já gravava. */
  const L41: LoteAbate = {
    id: 'l1', ordem: 1, categoria: 'bois', categoriaLabel: 'Bois',
    quantidade: 41, pesoMedioKg: 553.78,
  };
  /* 12.260,80 kg de carcaça no lote → 817,3867 @. */
  const comCarcaca = (extra: Partial<LinhaAbate> = {}): LinhaAbate => ({
    ...linhaVazia('l1'), pesoCarcacaKg: 12260.8, pesoCarcacaFonte: 'total', ...extra,
  });

  it('306.520,00 pelo total volta 306.520,00 na base — sem o centavo', () => {
    const onAplicar = vi.fn();
    render(<ModalNegociarLote lote={L41}
      linha={comCarcaca({ precoFonte: 'total', valorBaseOverride: 306520 })}
      cenario="realizado" onAplicar={onAplicar} onFechar={vi.fn()} />);
    /* Na tabela do resultado, "Preço base" tem de ser exatamente o digitado. */
    expect(screen.getAllByText('R$ 306.520,00').length).toBeGreaterThan(0);
    expect(screen.queryByText('R$ 306.520,01')).not.toBeInTheDocument();
    /* E o R$/@ derivado fecha em 375,00. */
    expect(screen.getAllByText('R$ 375,00').length).toBeGreaterThan(0);
  });

  it('o lote 10 do Minerva: base 113.666,31 e R$ 361,46/@', () => {
    /* 20 cab, 4.717,00 kg de carcaça no lote → 314,4667 @. O R$/@ não é redondo, e é
       exatamente por isso que arredondá-lo a duas casas para refazer o total quebrava. */
    const L20: LoteAbate = {
      id: 'l10', ordem: 10, categoria: 'novilhas', categoriaLabel: 'Novilhas',
      quantidade: 20, pesoMedioKg: 453.56,
    };
    render(<ModalNegociarLote lote={L20}
      linha={{ ...linhaVazia('l10'), pesoCarcacaKg: 4717, pesoCarcacaFonte: 'total',
        precoFonte: 'total', valorBaseOverride: 113666.31 }}
      cenario="realizado" onAplicar={vi.fn()} onFechar={vi.fn()} />);
    expect(screen.getAllByText('R$ 113.666,31').length).toBeGreaterThan(0);
    expect(screen.getAllByText('R$ 361,46').length).toBeGreaterThan(0);
  });

  it('mudar a carcaça recalcula o R$/@ sem mexer na base', () => {
    /* ⚠ O R$/@ DERIVADO DEPENDE DA CARCAÇA, não só do preço: mais arrobas pelo mesmo
       total significam outro R$/@. Se ele só fosse recalculado ao mexer no preço, ficaria
       velho e a tabela mostraria uma divisão que não fecha. */
    const onAplicar = vi.fn();
    render(<ModalNegociarLote lote={L41}
      linha={comCarcaca({ precoFonte: 'total', valorBaseOverride: 306520 })}
      cenario="realizado" onAplicar={onAplicar} onFechar={vi.fn()} />);
    const carcaca = screen.getAllByText('Carcaça').find(el => el.tagName === 'LABEL')!
      .parentElement!.querySelector('input') as HTMLInputElement;
    fireEvent.change(carcaca, { target: { value: '24.521,60' } });
    fireEvent.blur(carcaca);
    fireEvent.click(screen.getByText('Aplicar'));
    const p = onAplicar.mock.calls[0][0];
    /* Dobrou a carcaça: a base não muda e o R$/@ cai pela metade. */
    expect(p.valorBaseOverride).toBe(306520);
    expect(p.precoArroba).toBeCloseTo(187.5, 2);
  });
});
