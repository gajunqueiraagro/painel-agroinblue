/**
 * FECH-CALC-01 (Chat 11/11 12:50) — no modal do pasto (caso Pureza T-A1, out/26) o Gabriel digitou "470,00+45" no Peso da Desmama M e o
 * campo lia 470. Qtde e Peso usam agora o campo de número com CONTA do sistema (`CampoNumeroComConta`, P91 — a mesma conta do
 * `CampoMoeda` do valor do lançamento): resolve ao sair/Enter, a dica "= 515,00" enquanto digita, nunca grava texto; Peso 2 casas.
 */
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CategoriaCard } from '@/components/FechamentoPastoDialog';
import type { CategoriaRebanho } from '@/hooks/usePastos';

const CAT = { id: 'dm', nome: 'Desmama M', codigo: 'desmama_m', ordem_exibicao: 1 } as unknown as CategoriaRebanho;

/* o cartão com o estado do modal (o pai guarda Qtde e Peso e devolve ao cartão, como o `editarGrade`) */
function montar(quantidade = 0, peso: number | null = null) {
  const onUpdateQtd = vi.fn(); const onUpdatePeso = vi.fn();
  function Pai() {
    const [q, setQ] = useState(quantidade); const [p, setP] = useState<number | null>(peso);
    return <CategoriaCard c={CAT} idx={0} tabBase={10} quantidade={q} pesoMedioKg={p} origemDado="manual" disabled={false}
      onUpdateQtd={(id, v) => { onUpdateQtd(id, v); setQ(v); }} onUpdatePeso={(id, v) => { onUpdatePeso(id, v); setP(v); }} />;
  }
  render(<Pai />);
  return { onUpdateQtd, onUpdatePeso, qtd: screen.getByPlaceholderText('0'), peso: screen.getByPlaceholderText('kg') };
}
const digitar = (el: HTMLElement, t: string) => { fireEvent.focus(el); fireEvent.change(el, { target: { value: t } }); };

describe('a calculadora nos campos do modal do pasto (FECH-CALC-01)', () => {
  it('Peso "470,00+45": a dica "= 515,00" enquanto digita; ao sair grava 515 e o campo mostra 515,00', () => {
    const { peso, onUpdatePeso } = montar();
    digitar(peso, '470,00+45');
    expect(screen.getByText(/= 515,00/)).toBeTruthy();
    fireEvent.blur(peso);
    expect(onUpdatePeso).toHaveBeenLastCalledWith('dm', 515);
    expect((peso as HTMLInputElement).value).toBe('515,00');
  });
  it('Peso "470,5*2" = 941 e "=19740/42" = 470 (2 casas)', () => {
    const { peso, onUpdatePeso } = montar();
    digitar(peso, '470,5*2'); fireEvent.blur(peso);
    expect(onUpdatePeso).toHaveBeenLastCalledWith('dm', 941);
    digitar(peso, '=19740/42'); fireEvent.blur(peso);
    expect(onUpdatePeso).toHaveBeenLastCalledWith('dm', 470);
    digitar(peso, '470,25+45,5'); fireEvent.blur(peso);
    expect(onUpdatePeso).toHaveBeenLastCalledWith('dm', 515.75);
    expect((peso as HTMLInputElement).value).toBe('515,75');
  });
  it('Qtde "42+10" = 52 cabeças (inteiro); vazio = 0, nunca texto', () => {
    const { qtd, onUpdateQtd } = montar();
    digitar(qtd, '42+10'); fireEvent.blur(qtd);
    expect(onUpdateQtd).toHaveBeenLastCalledWith('dm', 52);
    expect((qtd as HTMLInputElement).value).toBe('52');
    digitar(qtd, ''); fireEvent.blur(qtd);
    expect(onUpdateQtd).toHaveBeenLastCalledWith('dm', 0);
  });
  it('a ordem de tabulação continua: Qtde = base, Peso = base + 1', () => {
    const { qtd, peso } = montar(30, 420);
    expect(qtd.getAttribute('tabindex')).toBe('10');
    expect(peso.getAttribute('tabindex')).toBe('11');
    expect((peso as HTMLInputElement).value).toBe('420,00');
  });
  it('o modal não lê mais os números na mão (parseInt/parseFloat) — uma fonte só, a conta do sistema', () => {
    const src = readFileSync('src/components/FechamentoPastoDialog.tsx', 'utf8');
    expect(src.match(/<CampoNumeroComConta/g)).toHaveLength(2);
    expect(src).not.toMatch(/parseInt\(qtdLocal|parseFloat\(raw\)/);
  });
});
