/**
 * A GRADE DE PARCELAS — o que a tela mostra e o que cada gesto faz (PARC-LIVRES-01).
 * O hospedeiro do teste guarda a lista e o valor da compra, como o modal do lançamento faz.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GradeDeParcelas, type ModoDasParcelas } from './GradeDeParcelas';
import { parcelasDaNota, type ParcelaLivre } from '@/lib/financiamentos/parcelasLivres';

const SETE = parcelasDaNota([
  { vencimento: '2026-05-23', valorCent: 3300000 }, { vencimento: '2026-06-19', valorCent: 1283334 },
  { vencimento: '2026-07-17', valorCent: 1283334 }, { vencimento: '2026-08-14', valorCent: 1283333 },
  { vencimento: '2026-09-11', valorCent: 1283333 }, { vencimento: '2026-10-09', valorCent: 1283333 },
  { vencimento: '2026-11-06', valorCent: 1283333 },
]);

function Hospedeiro({ inicial = SETE, modoInicial = 'livres' as ModoDasParcelas, aoTrocarModo = vi.fn(), compraInicial = 11000000, semCompraVale = false }) {
  const [parcelas, setParcelas] = useState<ParcelaLivre[]>(inicial);
  const [modo, setModo] = useState<ModoDasParcelas>(modoInicial);
  const [compra, setCompra] = useState(compraInicial);
  return (
    <GradeDeParcelas modo={modo} onModo={(m) => { aoTrocarModo(m); setModo(m); }} parcelas={parcelas} onParcelas={setParcelas}
      compraCent={compra} onCompraVale={semCompraVale ? undefined : setCompra} base={SETE} recado="como na nota" />
  );
}
const t = (id: string) => screen.getByTestId(id).textContent;
const valores = () => screen.getAllByTestId('valor-da-parcela') as HTMLInputElement[];
const digitar = (i: number, texto: string) => { fireEvent.change(valores()[i], { target: { value: texto } }); fireEvent.blur(valores()[i]); };

describe('a grade nas parcelas livres', () => {
  it('(b) as sete duplicatas: N, soma, compra e "0,00 ✓" no rodapé; o recado na faixa; nenhuma frase vermelha', () => {
    render(<Hospedeiro />);
    expect(screen.getAllByTestId('linha-da-parcela')).toHaveLength(7);
    expect(valores().map((v) => v.value)).toEqual(['33.000,00', '12.833,34', '12.833,34', '12.833,33', '12.833,33', '12.833,33', '12.833,33']);
    expect(t('rodape-n')).toBe('7 parcelas');
    expect(t('rodape-soma')).toBe('110.000,00');
    expect(t('rodape-compra')).toBe('110.000,00');
    expect(t('diferenca')).toBe('0,00 ✓');
    expect(screen.getByTestId('diferenca').getAttribute('data-fecha')).toBe('sim');
    expect(t('recado-de-parcelas')).toBe('como na nota');
    expect(screen.queryByTestId('frase-nao-fecha')).toBeNull();
  });

  it('(c) 12.833,33 -> 12.333,33: "▼ −500,00", a frase vermelha, os DOIS gestos e o "editado · era 12.833,33"', () => {
    render(<Hospedeiro />);
    digitar(3, '12.333,33');
    expect(t('rodape-soma')).toBe('109.500,00');
    expect(t('diferenca')).toBe('▼ −500,00');
    expect(screen.getByTestId('diferenca').getAttribute('data-fecha')).toBe('nao');
    expect(t('frase-nao-fecha')).toBe('A soma das parcelas não fecha com a compra.');
    expect(t('por-na-ultima')).toBe('Pôr +500,00 na parcela 7');
    expect(t('compra-vale')).toBe('A compra vale 109.500,00');
    expect(screen.getAllByTestId('cel-de-onde-veio')[3].textContent).toBe('editado · era 12.833,33');
    expect(valores()[3].className).toContain('bg-amber-50');
    expect(screen.queryByTestId('recado-de-parcelas')).toBeNull();
  });

  it('gesto 1 — "Pôr +500,00 na parcela 7": a última vira 13.333,33 e a diferença zera', () => {
    render(<Hospedeiro />);
    digitar(3, '12.333,33');
    fireEvent.click(screen.getByTestId('por-na-ultima'));
    expect(valores()[6].value).toBe('13.333,33');
    expect(t('diferenca')).toBe('0,00 ✓');
    expect(t('rodape-compra')).toBe('110.000,00');
  });

  it('gesto 2 — "A compra vale 109.500,00": o valor da compra muda, nenhuma parcela muda, e a diferença zera', () => {
    render(<Hospedeiro />);
    digitar(3, '12.333,33');
    fireEvent.click(screen.getByTestId('compra-vale'));
    expect(t('rodape-compra')).toBe('109.500,00');
    expect(valores()[6].value).toBe('12.833,33');
    expect(t('diferenca')).toBe('0,00 ✓');
  });

  it('sem `onCompraVale` o segundo gesto fica APAGADO com o motivo (não some)', () => {
    render(<Hospedeiro semCompraVale />);
    digitar(3, '12.333,33');
    const b = screen.getByTestId('compra-vale') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe('o valor total não se altera por aqui');
  });

  it('soma acima da compra: "▲ 100,00" e "Pôr −100,00 na parcela 7"', () => {
    render(<Hospedeiro />);
    digitar(0, '33.100,00');
    expect(t('diferenca')).toBe('▲ 100,00');
    expect(t('por-na-ultima')).toBe('Pôr −100,00 na parcela 7');
  });

  it('a conta direto no campo: "110000-33000-12833,34*2-12833,33*3" guarda só o resultado', () => {
    render(<Hospedeiro />);
    digitar(6, '110000-33000-12833,34*2-12833,33*3');
    expect(valores()[6].value).toBe('12.833,33');
    expect(t('diferenca')).toBe('0,00 ✓');
  });

  it('"+ Parcela" entra no fim sem data e sem valor; "✕" tira; "Voltar às duplicatas da nota" devolve as sete', () => {
    render(<Hospedeiro />);
    const voltar = screen.getByTestId('voltar-a-base') as HTMLButtonElement;
    expect(voltar.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('mais-parcela'));
    expect(t('rodape-n')).toBe('8 parcelas');
    expect(valores()[7].value).toBe('');
    expect(screen.getAllByTestId('cel-de-onde-veio')[7].textContent).toBe('acrescentada');
    fireEvent.click(screen.getAllByTestId('tirar-parcela')[1]);
    expect(t('rodape-n')).toBe('7 parcelas');
    expect(t('rodape-soma')).toBe('97.166,66');
    expect(voltar.disabled).toBe(false);
    fireEvent.click(voltar);
    expect(valores().map((v) => v.value)).toEqual(['33.000,00', '12.833,34', '12.833,34', '12.833,33', '12.833,33', '12.833,33', '12.833,33']);
    expect(t('diferenca')).toBe('0,00 ✓');
  });

  it('voltar ao "Igual todo mês" com edição PERGUNTA na linha; "Não" fica, "Sim" troca; sem edição troca direto', () => {
    const troca = vi.fn();
    const { unmount } = render(<Hospedeiro aoTrocarModo={troca} />);
    digitar(3, '12.333,33');
    fireEvent.click(screen.getByText('Igual todo mês'));
    expect(troca).not.toHaveBeenCalled();
    expect(screen.getByTestId('pergunta-voltar-ao-mensal').textContent).toContain('Voltar para Igual todo mês? As edições se perdem.');
    fireEvent.click(screen.getByTestId('voltar-ao-mensal-nao'));
    expect(screen.queryByTestId('pergunta-voltar-ao-mensal')).toBeNull();
    expect(troca).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Igual todo mês'));
    fireEvent.click(screen.getByTestId('voltar-ao-mensal-sim'));
    expect(troca).toHaveBeenCalledWith('mensal');
    unmount();
    const direto = vi.fn();
    render(<Hospedeiro aoTrocarModo={direto} />);
    fireEvent.click(screen.getByText('Igual todo mês'));
    expect(direto).toHaveBeenCalledWith('mensal');
  });
});

describe('a grade no "Igual todo mês" e a parcela paga', () => {
  it('mensal: só leitura — nenhum campo, nenhum "+ Parcela", nenhum ✕; a soma e a diferença aparecem do mesmo jeito', () => {
    render(<Hospedeiro modoInicial="mensal" />);
    expect(screen.queryAllByTestId('valor-da-parcela')).toHaveLength(0);
    expect(screen.queryByTestId('mais-parcela')).toBeNull();
    expect(screen.queryAllByTestId('tirar-parcela')).toHaveLength(0);
    expect(screen.getAllByTestId('cel-valor').map((c) => c.textContent)[0]).toBe('33.000,00');
    expect(screen.getAllByTestId('cel-vencimento').map((c) => c.textContent)[0]).toBe('23/05/26');
    expect(t('diferenca')).toBe('0,00 ✓');
  });

  it('parcela paga: apagada, sem campo e sem ✕, com o motivo no title — e ENTRA na soma', () => {
    const comPaga = SETE.map((p, i) => (i === 0 ? { ...p, paga: { em: '2026-05-23' } } : p));
    render(<Hospedeiro inicial={comPaga} />);
    const linha = screen.getAllByTestId('linha-da-parcela')[0];
    expect(linha.getAttribute('data-paga')).toBe('sim');
    expect(linha.getAttribute('title')).toBe('paga em 23/05/26: data e valor não mudam');
    expect(linha.querySelector('input')).toBeNull();
    expect(valores()).toHaveLength(6);
    expect(screen.getAllByTestId('tirar-parcela')).toHaveLength(6);
    expect(t('rodape-soma')).toBe('110.000,00');
  });
});

describe('a grade não soma', () => {
  /* a lei do auto-teste: o detector tem de achar uma soma plantada antes de dizer "nenhuma" */
  const somaNaTela = (fonte: string) => /\.reduce\(|\+=|somaCent\s*[-+]|valorCent\s*\+/.test(fonte.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''));
  it('o detector acha uma soma plantada', () => {
    expect(somaNaTela('const s = parcelas.reduce((a, p) => a + p.valorCent, 0);')).toBe(true);
    expect(somaNaTela('let s = 0; s += p.valorCent;')).toBe(true);
  });
  it('GradeDeParcelas.tsx não tem reduce, += nem aritmética de soma: tudo vem de `resumoDasParcelas`', () => {
    const fonte = readFileSync(resolve(__dirname, 'GradeDeParcelas.tsx'), 'utf8');
    expect(somaNaTela(fonte)).toBe(false);
    expect(fonte).toContain('resumoDasParcelas(parcelas, compraCent)');
  });
});
