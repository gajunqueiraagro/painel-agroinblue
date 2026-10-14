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
import { linhaVazia, paraCalculo, totaisDoAbate, type LoteAbate } from '@/components/abate/calculoDoLote';
import { buildAbateCalculation } from '@/lib/calculos/abate';
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

/* ⚠ ABATE-PROJETADO-01b (Gabriel, 14/10/2026) REVOGOU "Rendimento e arrobas — derivados, nunca digitados": o rendimento PODE
   ser digitado (forma "RC %" do seletor da carcaca) e a carcaca e' entao derivada pelo dono. Fora do RC %, segue derivado. */
describe('Rendimento: derivado em cabeça/total, digitável em RC % (a carcaça sai do dono)', () => {
  it('em cabeça/total o rendimento aparece derivado e não tem campo', () => {
    montar(linha());
    /* 250 kg de carcaça sobre 500 kg de peso vivo = 50,00%. ABATE-PROJETADO-01b: aparece no Rendimento E em cinza ao lado
       do seletor da carcaça ("RC 50,00%"), as duas leituras do mesmo dono. */
    expect(screen.getAllByText(/50\.00%|50,00%/)).toHaveLength(2);
    expect(screen.getByTestId('carcaca-derivada').textContent).toBe('RC 50,00%');
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

describe('ABATE-PROJETADO-01b — rendimento pode ser digitado; carcaça derivada pelo dono', () => {
  const vazio = () => linha({ pesoCarcacaKg: null, pesoCarcacaFonte: null, rendimentoCarcacaPct: null });
  const escolherRc = () => fireEvent.click(screen.getByText('RC %'));
  const digitar = (v: string) => { fireEvent.change(campoPorRotulo('Carcaça'), { target: { value: v } }); fireEvent.blur(campoPorRotulo('Carcaça')); };

  it('a unidade escolhida ANTES de digitar vale: RC % 52 → carcaça 260 kg/cab (total 2.600) pelo dono, fonte cabeça', () => {
    const onAplicar = montar(vazio());
    escolherRc();
    digitar('52');
    expect(screen.getByTestId('carcaca-derivada').textContent).toBe('= 260,00 kg/cab');
    fireEvent.click(screen.getByText('Aplicar'));
    const p = onAplicar.mock.calls[0][0];
    expect(p.rendimentoCarcacaPct).toBe(52);
    expect(p.pesoCarcacaKg).toBe(2600);
    expect(p.pesoCarcacaFonte).toBe('cabeca');
    /* arrobas e valor seguem o dono: 260 / 15 × 10 × R$ 300 = R$ 52.000,00 */
    expect(screen.getAllByText('R$ 52.000,00').length).toBeGreaterThan(0);
  });

  it('o RC aceita conta (pelo dono do lote), 2 casas; conta que nao fecha vira recusa com a frase do dono', () => {
    const onAplicar = montar(vazio());
    escolherRc();
    digitar('51+0,96');
    expect(campoPorRotulo('Carcaça').value).toBe('51,96');
    digitar('52+');
    expect(screen.getByTestId('linha-carcaca').className).toContain('text-destructive');
    expect(campoPorRotulo('Carcaça').value).toBe('51,96');
    fireEvent.click(screen.getByText('Aplicar'));
    expect(onAplicar.mock.calls[0][0].rendimentoCarcacaPct).toBe(51.96);
  });

  it('o RC digitado nao vira o derivado da carcaça arredondada, nem quando outro campo muda (3 cab × 333,33 kg, RC 51,37)', () => {
    /* 333,33 × 51,37% = 171,2316 kg/cab -> total 513,69 (2 casas); dele o RC derivado seria 51,3695 — o digitado tem de ficar */
    const T: LoteAbate = { id: 'l1', ordem: 1, categoria: 'bois', categoriaLabel: 'Bois', quantidade: 3, pesoMedioKg: 333.33 };
    const onAplicar = vi.fn();
    render(<ModalNegociarLote lote={T} linha={vazio()} cenario="projetado" onAplicar={onAplicar} onFechar={vi.fn()} />);
    escolherRc();
    digitar('51,37');
    irPara('Preço');
    const preco = screen.getAllByText('Preço base').find(el => el.tagName === 'LABEL')!.parentElement!.querySelector('input')!;
    fireEvent.change(preco, { target: { value: '310' } });
    fireEvent.blur(preco);
    fireEvent.click(screen.getByText('Aplicar'));
    expect(onAplicar.mock.calls[0][0]).toMatchObject({ rendimentoCarcacaPct: 51.37, pesoCarcacaKg: 513.69 });
  });

  it('trocar RC → cabeça mantém o número coerente (260,00 kg/cab, RC derivado 52%)', () => {
    const onAplicar = montar(vazio());
    escolherRc();
    digitar('52');
    fireEvent.click(screen.getByText('cabeça'));
    expect(campoPorRotulo('Carcaça').value).toBe('260,00');
    expect(screen.getByTestId('carcaca-derivada').textContent).toBe('RC 52,00%');
    fireEvent.click(screen.getByText('Aplicar'));
    expect(onAplicar.mock.calls[0][0]).toMatchObject({ pesoCarcacaKg: 2600, pesoCarcacaFonte: 'cabeca', rendimentoCarcacaPct: 52 });
  });

  it('reabre em RC % quando a carcaça gravada é exatamente a do RC de 2 casas; RC derivado (4 casas) reabre pela fonte', () => {
    montar(linha({ pesoCarcacaKg: 2600, pesoCarcacaFonte: 'cabeca', rendimentoCarcacaPct: 52 }));
    expect(campoPorRotulo('Carcaça').value).toBe('52,00');
    expect(screen.getByTestId('carcaca-derivada').textContent).toBe('= 260,00 kg/cab');
  });

  it('NJ 30/09, um lote de 54 cab, PV 460,02, RC 51,96% → o dono deriva 239,03 kg/cab (12.907,43 kg)', () => {
    const NJ: LoteAbate = { id: 'l1', ordem: 1, categoria: 'vacas', categoriaLabel: 'Vacas', quantidade: 54, pesoMedioKg: 460.02 };
    const onAplicar = vi.fn();
    render(<ModalNegociarLote lote={NJ} linha={vazio()} cenario="projetado" onAplicar={onAplicar} onFechar={vi.fn()} />);
    escolherRc();
    digitar('51,96');
    expect(screen.getByTestId('carcaca-derivada').textContent).toBe('= 239,03 kg/cab');
    fireEvent.click(screen.getByText('Aplicar'));
    expect(onAplicar.mock.calls[0][0]).toMatchObject({ pesoCarcacaKg: 12907.43, rendimentoCarcacaPct: 51.96 });
  });

  it('o 239,01 / 51,96 do Resumo da OC c109ba8a vem do AGREGADO dos dois lotes reais (36 × 461,72 e 18 × 456,61)', () => {
    const l1: LoteAbate = { id: 'a', ordem: 1, categoria: 'vacas', categoriaLabel: 'Vacas', quantidade: 36, pesoMedioKg: 461.72 };
    const l2: LoteAbate = { id: 'b', ordem: 2, categoria: 'vacas', categoriaLabel: 'Vacas', quantidade: 18, pesoMedioKg: 456.61 };
    const calc = new Map([
      ['a', buildAbateCalculation(paraCalculo({ ...linhaVazia('a'), pesoCarcacaKg: 8695.5, pesoCarcacaFonte: 'total' }, l1))],
      ['b', buildAbateCalculation(paraCalculo({ ...linhaVazia('b'), pesoCarcacaKg: 4211, pesoCarcacaFonte: 'total' }, l2))],
    ]);
    const t = totaisDoAbate([l1, l2], calc);
    expect(t.cabecas).toBe(54);
    expect(t.pesoMedio.toFixed(2)).toBe('460.02');
    expect(t.carcacaCab.toFixed(2)).toBe('239.01');
    expect(t.rc.toFixed(2)).toBe('51.96');
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

describe('ABATE-PROJETADO-01a — a unidade escolhida antes de digitar vale', () => {
  /* ⚠ O DEFEITO: com o campo vazio, trocar a unidade subia `{valor: null, fonte: null}` e a escolha se perdia; o número
     digitado depois entrava em R$. Os seis campos de unidade da aba Bônus, um a um. */
  /* ⚠ O FUNRURAL EM % SAI EM R$ (o Aplicar converte pelo dono — o bloco seguinte): 2% de R$ 50.000 = R$ 1.000. */
  const CAMPOS: { rotulo: string; chave: keyof LinhaAbate; botao: string; fonte: string; gravado: { valor: number; fonte: string } }[] = [
    { rotulo: 'Precoce', chave: 'bonusPrecoce', botao: '@', fonte: 'arroba', gravado: { valor: 2, fonte: 'arroba' } },
    { rotulo: 'Qualidade', chave: 'bonusQualidade', botao: '@', fonte: 'arroba', gravado: { valor: 2, fonte: 'arroba' } },
    { rotulo: 'Lista / trace', chave: 'bonusListaTrace', botao: '@', fonte: 'arroba', gravado: { valor: 2, fonte: 'arroba' } },
    { rotulo: 'Desconto qualidade', chave: 'descontoQualidade', botao: '@', fonte: 'arroba', gravado: { valor: 2, fonte: 'arroba' } },
    { rotulo: 'Outros descontos', chave: 'outrosDescontos', botao: '@', fonte: 'arroba', gravado: { valor: 2, fonte: 'arroba' } },
    { rotulo: 'Funrural + SENAR', chave: 'funrural', botao: '%', fonte: 'pct', gravado: { valor: 1000, fonte: 'reais' } },
  ];
  const botaoDoCampo = (rotulo: string, texto: string) => {
    const label = screen.getAllByText(rotulo).find(el => el.tagName === 'LABEL')!;
    return Array.from(label.parentElement!.querySelectorAll('button')).find(b => b.textContent === texto)!;
  };

  it.each(CAMPOS)('$rotulo: escolher "$botao" e depois digitar vale na unidade $fonte', ({ rotulo, chave, botao, gravado }) => {
    const onAplicar = montar(linha());
    irPara('Bônus, descontos e impostos');
    fireEvent.click(botaoDoCampo(rotulo, botao));
    const campo = campoPorRotulo(rotulo);
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '2' } });
    fireEvent.blur(campo);
    fireEvent.click(screen.getByText('Aplicar'));
    expect(onAplicar.mock.calls[0][0][chave]).toEqual(gravado);
  });

  it('esvaziar o campo não esquece a unidade: digitar de novo volta na unidade escolhida', () => {
    const onAplicar = montar(linha());
    irPara('Bônus, descontos e impostos');
    fireEvent.click(botaoDoCampo('Precoce', '@'));
    const campo = campoPorRotulo('Precoce');
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '3' } });
    fireEvent.change(campo, { target: { value: '' } });
    fireEvent.change(campo, { target: { value: '4' } });
    fireEvent.blur(campo);
    fireEvent.click(screen.getByText('Aplicar'));
    expect(onAplicar.mock.calls[0][0].bonusPrecoce).toEqual({ valor: 4, fonte: 'arroba' });
  });

  it('a fonte gravada manda ao abrir (o padrão R$ não a sobrescreve)', () => {
    const onAplicar = montar(linha({ bonusQualidade: { valor: 5, fonte: 'arroba' } }));
    irPara('Bônus, descontos e impostos');
    const at = botaoDoCampo('Qualidade', '@');
    expect(at.className).toContain('bg-primary');
    fireEvent.click(screen.getByText('Aplicar'));
    expect(onAplicar.mock.calls[0][0].bonusQualidade).toEqual({ valor: 5, fonte: 'arroba' });
  });
});

describe('ABATE-PROJETADO-01a — Funrural / SENAR em % sobre o BRUTO, gravado em R$', () => {
  /* NJ LT10 (NF 000.008.812): bruto 98.135,31 × 1,63% = 1.599,61 — confere com a nota. Bruto pela base total, sem bônus. */
  const LT10 = (extra: Partial<LinhaAbate> = {}): LinhaAbate => ({
    ...linhaVazia('l1'), pesoCarcacaKg: 2500, pesoCarcacaFonte: 'total', precoFonte: 'total', valorBaseOverride: 98135.31, ...extra,
  });
  const botaoPct = () => {
    const label = screen.getAllByText('Funrural + SENAR').find(el => el.tagName === 'LABEL')!;
    return Array.from(label.parentElement!.querySelectorAll('button')).find(b => b.textContent === '%')!;
  };
  const digitarPct = (texto: string) => {
    irPara('Bônus, descontos e impostos');
    fireEvent.click(botaoPct());
    const campo = campoPorRotulo('Funrural + SENAR');
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: texto } });
    fireEvent.blur(campo);
  };

  it('NJ LT10: 1,63% de um bruto de 98.135,31 = R$ 1.599,61, gravado em reais', () => {
    const onAplicar = montar(LT10());
    digitarPct('1,63');
    expect(screen.getAllByText((_, el) => el?.tagName === 'DIV' && /^= R\$\s1\.599,61/.test(el.textContent ?? '')).length).toBe(1);
    fireEvent.click(screen.getByText('Aplicar'));
    const l = onAplicar.mock.calls[0][0] as LinhaAbate;
    expect(l.funrural).toEqual({ valor: 1599.61, fonte: 'reais' });
    expect(l.valorLiquido).toBe(96535.7);
  });

  it('conta no campo: "1,63+0,3" = 1,93% -> R$ 1.894,01', () => {
    const onAplicar = montar(LT10());
    digitarPct('1,63+0,3');
    expect(campoPorRotulo('Funrural + SENAR').value).toBe('1,93');
    fireEvent.click(screen.getByText('Aplicar'));
    expect((onAplicar.mock.calls[0][0] as LinhaAbate).funrural).toEqual({ valor: 1894.01, fonte: 'reais' });
  });

  it('com bônus, a base do % é o BRUTO, não o preço base: 90.000 + 8.135,31 de bônus -> 1.599,61 (não 1.467,00)', () => {
    const onAplicar = montar(LT10({ valorBaseOverride: 90000, bonusPrecoce: { valor: 8135.31, fonte: 'reais' } }));
    digitarPct('1,63');
    fireEvent.click(screen.getByText('Aplicar'));
    expect((onAplicar.mock.calls[0][0] as LinhaAbate).funrural).toEqual({ valor: 1599.61, fonte: 'reais' });
  });

  it('reaberto, mostra o R$ gravado e o % só como leitura: "= 1,63% do bruto"', () => {
    montar(LT10({ funrural: { valor: 1599.61, fonte: 'reais' } }));
    irPara('Bônus, descontos e impostos');
    expect(screen.getByText(/= 1,63% do bruto/)).toBeTruthy();
    expect(campoPorRotulo('Funrural + SENAR').value.replace(/\s/g, ' ')).toBe('R$ 1.599,61');
  });

  it('conta que não fecha é recusada com a frase do dono e o campo volta ao que tinha', () => {
    montar(LT10());
    digitarPct('1,63+');
    expect(screen.getByTestId('recusa-conta-funrural').textContent).toBeTruthy();
    expect(campoPorRotulo('Funrural + SENAR').value).toBe('');
  });

  it('sem bruto não há o que converter: Aplicar apagado com o motivo escrito', () => {
    const onAplicar = montar({ ...linhaVazia('l1') });
    digitarPct('1,5');
    const aplicar = screen.getByText('Aplicar').closest('button')!;
    expect(aplicar.disabled).toBe(true);
    expect(screen.getByText('Funrural em %: informe preço e carcaça para converter em R$.')).toBeTruthy();
    fireEvent.click(aplicar);
    expect(onAplicar).not.toHaveBeenCalled();
  });
});
