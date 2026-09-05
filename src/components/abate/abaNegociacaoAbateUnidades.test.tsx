/**
 * O que este teste trava — a unidade do bônus é honrada, e categoria fora do mapa recusa.
 *
 * ⚠ A UNIDADE JÁ ERROU UMA VEZ E CUSTOU UMA MIGRATION. Os campos do diálogo legado se
 * chamam `bonusPrecoce` × `bonusPrecoceReais`, e o nome sugere "percentual × reais". A
 * aritmética da lib diz outra coisa — `bonusPrecoce * totalArrobas` —, ou seja, o primeiro
 * lado é **R$ por arroba**. A tabela nasceu com CHECK `('pct','reais')` por causa dessa
 * leitura, e `abate_fontes_bonus_arroba` a corrigiu. Este teste afirma o que a conta faz,
 * não o que o nome sugere.
 *
 * ⚠ E CATEGORIA FORA DO MAPA RECUSA COM MENSAGEM, nunca cai para subcentro vazio. Um
 * lançamento sem classificação é justamente o que a Mesa de Revisão existe para consertar
 * depois — e o erro é de cadastro, que se mostra na hora.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AbaNegociacaoAbate, type LoteAbate } from '@/components/abate/AbaNegociacaoAbate';
import type { LinhaAbate } from '@/hooks/useOperacaoAbate';

const lote = (id: string, ordem: number, categoria: string, label: string): LoteAbate => ({
  id, ordem, categoria, categoriaLabel: label, quantidade: 10, pesoMedioKg: 500,
});

/* 10 cabeças × 500 kg, rendimento 50% → 250 kg de carcaça → 16,6667 @/cab → 166,6667 @. */
const linha = (id: string, extra: Partial<LinhaAbate> = {}): LinhaAbate => ({
  operacaoLoteId: id,
  pesoCarcacaKg: null, pesoCarcacaFonte: null, rendimentoCarcacaPct: 50, pesoTotalKgNf: null,
  precoArroba: 300, precoFonte: 'arroba', valorBaseOverride: null, valorLiquido: null,
  bonusPrecoce: { valor: null, fonte: null },
  bonusQualidade: { valor: null, fonte: null },
  bonusListaTrace: { valor: null, fonte: null },
  descontoQualidade: { valor: null, fonte: null },
  outrosDescontos: { valor: null, fonte: null },
  funrural: { valor: null, fonte: null },
  ...extra,
});

function montar(lotes: LoteAbate[], linhas: Map<string, LinhaAbate>) {
  return render(
    <AbaNegociacaoAbate
      lotes={lotes}
      linhas={linhas}
      cenariosExistentes={['projetado']}
      cenario="projetado"
      onLinhaChange={vi.fn()}
    />,
  );
}

const M = lote('l1', 1, 'bois', 'Bois');
const F = lote('l2', 2, 'vacas', 'Vacas');

describe('Negociação do abate — a unidade vem da conta', () => {
  it('bônus em R$/@ multiplica pelas arrobas: 2 × 166,67 = R$ 333,33', () => {
    const l = linha('l1', { bonusPrecoce: { valor: 2, fonte: 'arroba' } });
    montar([M], new Map([['l1', l]]));
    /* ⚠ Se a fonte fosse lida como percentual, o bônus seria 2% da base (R$ 1.000) — um
       número três vezes maior. Aparece DUAS vezes, e as duas provam a mesma leitura: no
       lado derivado (R$ total) e na linha "(+) Bônus" da cascata. */
    expect(screen.getAllByText('R$ 333,33')).toHaveLength(2);
    expect(screen.queryByText('R$ 1.000,00')).not.toBeInTheDocument();
  });

  it('o mesmo bônus em R$ total NÃO é multiplicado — 333,33 continua 333,33', () => {
    const l = linha('l1', { bonusPrecoce: { valor: 333.33, fonte: 'reais' } });
    montar([M], new Map([['l1', l]]));
    /* Agora o derivado é o outro lado: 333,33 / 166,6667 = R$ 2,00 por arroba. */
    expect(screen.getByText('R$ 2,00')).toBeInTheDocument();
  });

  it('o Funrural é percentual — 1,5% de R$ 50.000 = R$ 750,00', () => {
    /* Base: 166,6667 @ × R$ 300 = R$ 50.000. */
    const l = linha('l1', { funrural: { valor: 1.5, fonte: 'pct' } });
    montar([M], new Map([['l1', l]]));
    expect(screen.getAllByText('R$ 750,00').length).toBeGreaterThan(0);
  });

  it('a cascata aparece na ordem, e o total é a soma dos lotes', () => {
    montar([M, F], new Map([['l1', linha('l1')], ['l2', linha('l2')]]));
    expect(screen.getByText('Total do abate')).toBeInTheDocument();
    /* Cada lote: R$ 50.000 de base. Dois lotes: R$ 100.000 no total — e como não há bônus
       nem desconto, Base, Bruto e Líquido do total valem o mesmo, então são três. */
    expect(screen.getAllByText('R$ 100.000,00')).toHaveLength(3);
    expect(screen.getAllByText('Base (@ × preço)')).toHaveLength(3); // 2 lotes + total
    expect(screen.getAllByText('Líquido do lote')).toHaveLength(2);
    expect(screen.getByText('Líquido a receber')).toBeInTheDocument();
  });

  it('cada lote mostra a receita em que vai cair — macho e fêmea', () => {
    montar([M, F], new Map([['l1', linha('l1')], ['l2', linha('l2')]]));
    expect(screen.getByText('Abates de Machos')).toBeInTheDocument();
    expect(screen.getByText('Abates de Fêmeas')).toBeInTheDocument();
  });

  it('categoria fora do mapa RECUSA com mensagem — nunca subcentro vazio', () => {
    const X = lote('l3', 3, 'cavalos', 'Cavalos');
    montar([X], new Map([['l3', linha('l3')]]));
    expect(screen.getByText(/não tem categoria que o plano saiba classificar/i)).toBeInTheDocument();
    /* Duas vezes: no aviso e no cabeçalho do cartão — o operador acha o lote pelos dois. */
    expect(screen.getAllByText(/3\. Cavalos/).length).toBeGreaterThanOrEqual(1);
  });

  it('sem lotes, diz o que fazer em vez de mostrar cascata vazia', () => {
    montar([], new Map());
    expect(screen.getByText(/Nenhum lote na negociação/i)).toBeInTheDocument();
  });
});

describe('Rendimento — derivado, nunca digitado', () => {
  /* ⚠ ELE JA' ERA DERIVADO NA CONTA E MESMO ASSIM ERA DIGITAVEL. `abate.ts:117` faz
     `pesoCarcaca / pesoVivo` sempre que ha carcaca, ignorando o numero informado — o
     banco guardava um rendimento que a tela nao usava para nada. Agora ha um so'. */
  it('nao ha campo de digitar rendimento — o valor aparece travado', () => {
    /* 250 kg de carcaca sobre 500 kg de peso vivo = 50,00%. */
    /* ⚠ 2.500 kg é o TOTAL do lote — 10 cabeças × 250 kg de carcaça sobre 500 kg de peso
       vivo = 50,00%. O canônico gravado é o total; o campo `kg/cab` mostra 250. */
    const l = linha('l1', { pesoCarcacaKg: 2500, rendimentoCarcacaPct: null });
    const { container } = montar([M], new Map([['l1', l]]));
    expect(screen.getByText('50.00%')).toBeInTheDocument();
    /* ⚠ E NENHUM CAMPO CARREGA O 50. Enquanto o rendimento era digitavel, ele vinha num
       `input` com esse valor; agora o unico numero editavel do bloco e' a carcaca (250).
       Contar inputs nao serviria: o Funrural tambem e' `type=number`. */
    const valores = [...container.querySelectorAll('input[type="number"]')].map(i => (i as HTMLInputElement).value);
    expect(valores).toContain('250');
    expect(valores).not.toContain('50');
  });

  it('sem carcaça o rendimento é "—", não zero', () => {
    /* ⚠ Ausente nao e' zero: 0,00% afirmaria que o animal nao rende nada. */
    montar([M], new Map([['l1', linha('l1', { pesoCarcacaKg: null, rendimentoCarcacaPct: null })]]));
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('o rendimento derivado SOBE junto de toda mudança', () => {
    /* Ele e' persistido como o `valorLiquido`, e pelo mesmo motivo: a RPC pondera o
       rendimento no cabecalho e nao pode refazer a lib em SQL. */
    const onLinhaChange = vi.fn();
    render(
      <AbaNegociacaoAbate
        lotes={[M]} linhas={new Map([['l1', linha('l1', { rendimentoCarcacaPct: null })]])}
        cenariosExistentes={['projetado']} cenario="projetado" onLinhaChange={onLinhaChange}
      />,
    );
    const cartao = screen.getByText('1. Bois', { exact: false }).closest('div.rounded-lg')!;
    const campoCarcaca = cartao.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(campoCarcaca, { target: { value: '250' } });
    expect(onLinhaChange).toHaveBeenCalledTimes(1);
    const [loteId, proxima] = onLinhaChange.mock.calls[0];
    expect(loteId).toBe('l1');
    expect(proxima.rendimentoCarcacaPct).toBe(50);
    /* Digitou 250 no lado `kg/cab`; o que se grava é o total das 10 cabeças. */
    expect(proxima.pesoCarcacaKg).toBe(2500);
    expect(proxima.pesoCarcacaFonte).toBe('cabeca');
    expect(proxima.valorLiquido).toBeGreaterThan(0);
  });
});

describe('A chave do lote — o defeito que impediu o abate de existir', () => {
  /* ⚠ ERA `lote.id`, O ID DO BANCO, QUE UM LOTE NOVO NAO TEM. `LoteForm.id` e' opcional;
     o rascunho nascia na chave `undefined`, dois lotes novos colidiam nela e o payload
     subia sem `operacao_lote_id`. A RPC recusava com "Lote <NULL> nao pertence a
     operacao" e o erro morria sem toast. Agora a chave e' o `idLocal`, que existe desde
     o nascimento do lote. ⚠ E O COMPILADOR NAO VE': `strict: false` no tsconfig.app.json
     deixa `string | undefined` entrar em campo `string` sem uma palavra. */
  it('dois lotes distintos devolvem chaves distintas — nunca a mesma', () => {
    const onLinhaChange = vi.fn();
    render(
      <AbaNegociacaoAbate
        lotes={[M, F]}
        linhas={new Map([['l1', linha('l1')], ['l2', linha('l2')]])}
        cenariosExistentes={['projetado']} cenario="projetado" onLinhaChange={onLinhaChange}
      />,
    );
    /* Por CARTAO, nunca por indice global: cada lote tem mais de um `input[type=number]`
       (a carcaca e o Funrural), e um indice global casaria dois campos do mesmo lote. */
    const carcacaDo = (titulo: string) => {
      const cartao = screen.getByText(titulo, { exact: false }).closest('div.rounded-lg')!;
      return cartao.querySelector('input[type="number"]') as HTMLInputElement;
    };
    fireEvent.change(carcacaDo('1. Bois'), { target: { value: '250' } });
    fireEvent.change(carcacaDo('2. Vacas'), { target: { value: '240' } });
    const chaves = onLinhaChange.mock.calls.map(c => c[0]);
    expect(chaves).toEqual(['l1', 'l2']);
    expect(new Set(chaves).size).toBe(2);
    expect(chaves).not.toContain(undefined);
  });
});

describe('Carcaça e preço — dois lados, um canônico', () => {
  /* ⚠ O CANÔNICO NÃO É O QUE SE DIGITA. O banco guarda `peso_carcaca_kg` como TOTAL do
     lote (a RPC faz `sum()` entre lotes para o cabeçalho) e `preco_arroba` como R$/@; a
     fonte só lembra por onde o operador entrou. A lib, do outro lado, trabalha POR
     CABEÇA — `abate.ts` faz `carcaça / 15` e chama de `pesoArrobaCab` antes de
     multiplicar pela quantidade. A conversão vive na tela, e é ela que estes testes
     travam: errá-la erra tudo por um fator de `quantidade`, calado. */
  const carcacaDo = (titulo: string) => {
    const cartao = screen.getByText(titulo, { exact: false }).closest('div.rounded-lg')!;
    return cartao.querySelector('input[type="number"]') as HTMLInputElement;
  };

  it('ida e volta cabeça ↔ total fecha a 2 casas', () => {
    const onLinhaChange = vi.fn();
    const { rerender } = render(
      <AbaNegociacaoAbate lotes={[M]} linhas={new Map([['l1', linha('l1')]])}
        cenariosExistentes={['projetado']} cenario="projetado" onLinhaChange={onLinhaChange} />,
    );
    /* 10 cabeças × 333,33 kg = 3.333,30 no total. */
    fireEvent.change(carcacaDo('1. Bois'), { target: { value: '333.33' } });
    const gravada = onLinhaChange.mock.calls[0][1];
    expect(gravada.pesoCarcacaKg).toBe(3333.3);

    /* Reabrir com o que foi gravado devolve exatamente o que foi digitado. */
    rerender(
      <AbaNegociacaoAbate lotes={[M]} linhas={new Map([['l1', gravada]])}
        cenariosExistentes={['projetado']} cenario="projetado" onLinhaChange={onLinhaChange} />,
    );
    expect(carcacaDo('1. Bois').value).toBe('333.33');
  });

  it('digitar o total grava o total e a fonte "total"', () => {
    const onLinhaChange = vi.fn();
    render(
      <AbaNegociacaoAbate lotes={[M]}
        linhas={new Map([['l1', linha('l1', { pesoCarcacaKg: 2500, pesoCarcacaFonte: 'total' })]])}
        cenariosExistentes={['projetado']} cenario="projetado" onLinhaChange={onLinhaChange} />,
    );
    /* Com fonte `total`, o campo editável é o do lote — o de kg/cab vira derivado. */
    const campo = carcacaDo('1. Bois');
    expect(campo.value).toBe('2500');
    fireEvent.change(campo, { target: { value: '4500' } });
    const gravada = onLinhaChange.mock.calls[0][1];
    expect(gravada.pesoCarcacaKg).toBe(4500);
    expect(gravada.pesoCarcacaFonte).toBe('total');
  });

  it('preço: R$ do lote vira R$/@ pelas arrobas da carcaça', () => {
    /* Carcaça 2.500 kg no lote → 166,6667 @. R$ 50.000 no lote → R$ 300,00/@. */
    const onLinhaChange = vi.fn();
    render(
      <AbaNegociacaoAbate lotes={[M]}
        linhas={new Map([['l1', linha('l1', { pesoCarcacaKg: 2500, pesoCarcacaFonte: 'total', precoArroba: null, precoFonte: 'total' })]])}
        cenariosExistentes={['projetado']} cenario="projetado" onLinhaChange={onLinhaChange} />,
    );
    /* Pelo rótulo do lado, nunca por posição: o cartão tem quatro campos e a ordem
       deles é decisão de layout, que muda sem avisar. */
    const precoTotal = screen.getByText('R$ do lote').parentElement!.querySelector('input')!;
    fireEvent.change(precoTotal, { target: { value: '50000' } });
    const chamada = onLinhaChange.mock.calls.at(-1)![1];
    expect(chamada.precoArroba).toBe(300);
    expect(chamada.precoFonte).toBe('total');
  });

  it('sem carcaça, o R$ do lote fica travado e DIZ por quê', () => {
    /* ⚠ Sem arrobas a conversão seria divisão por zero. O campo não aceita número e o
       motivo fica no title — a regra do botão que diz por que está desabilitado. */
    montar([M], new Map([['l1', linha('l1', { pesoCarcacaKg: null, rendimentoCarcacaPct: null })]]));
    const travado = document.querySelector('[title^="Informe a carcaça primeiro"]');
    expect(travado).not.toBeNull();
    expect(travado!.textContent).toBe('—');
  });
});
