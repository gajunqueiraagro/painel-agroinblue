import type { Categoria, SaldoInicial } from '@/types/cattle';

/* REBANHO-INICIAL-EDITAR-01 (Chat 12/11 15:15). O saldo inicial se CADASTRA uma vez, no janeiro de
   partida da fazenda. Os janeiros seguintes são o dezembro anterior, gravados pelo motor
   (`propagar_saldo_inicial_pos_dezembro`): não são saldo inicial e não se editam aqui.

   ⚠ O ERRO QUE ISTO FECHA: o formulário guardava o ano num `useState` do 1º render, quando a lista
   ainda vinha vazia — o ano virava o de HOJE (2026) e nunca mais mudava. O seletor só oferecia o
   ano de partida (2024), aparecia em branco, e o Salvar gravava no janeiro de 2026, por cima da
   linha do motor (Faz Baia Grande: 1.012 cab no lugar das 609 de jan/2024).
   Agora, com saldo já cadastrado, o período vem SEMPRE da partida; o ano escolhido só vale no
   primeiro cadastro, quando ainda não existe partida. */

export interface Periodo { ano: number; mes: number }

/** O janeiro de partida: o mais antigo cadastrado. Sem nenhum, `null` (o operador escolhe). */
export function partidaDoSaldo(saldos: SaldoInicial[]): Periodo | null {
  if (saldos.length === 0) return null;
  let p: Periodo = { ano: saldos[0].ano, mes: saldos[0].mes || 1 };
  for (const s of saldos) {
    const m = s.mes || 1;
    if (s.ano < p.ano || (s.ano === p.ano && m < p.mes)) p = { ano: s.ano, mes: m };
  }
  return p;
}

/** O período que o formulário MOSTRA e GRAVA. Mês sempre janeiro (o motor só lê `mes = 1`). */
export function periodoDoFormulario(saldos: SaldoInicial[], anoEscolhido: string | number): Periodo {
  const partida = partidaDoSaldo(saldos);
  if (partida) return { ano: partida.ano, mes: 1 };
  const ano = Number(anoEscolhido);
  return { ano: Number.isFinite(ano) && ano > 0 ? ano : new Date().getFullYear(), mes: 1 };
}

/** Os janeiros que vêm do fechamento de dezembro (todos depois da partida), para a frase. */
export function anosDoFechamento(saldos: SaldoInicial[]): number[] {
  const partida = partidaDoSaldo(saldos);
  if (!partida) return [];
  return [...new Set(saldos.filter(s => s.ano > partida.ano).map(s => s.ano))].sort((a, b) => a - b);
}

export interface LinhaDigitada { quantidade: number; pesoMedioKg?: number; precoKg?: number }

export interface Mudanca {
  categoria: Categoria;
  campo: 'Cabeças' | 'Peso (kg)' | 'R$/kg';
  antes: number | null;
  depois: number | null;
}

const igual = (a: number | null, b: number | null) =>
  (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.005);

/** Antes × depois por categoria e campo, só o que muda. Vazio = nada a gravar. */
export function mudancasDoSaldo(
  saldos: SaldoInicial[],
  periodo: Periodo,
  digitado: Partial<Record<Categoria, LinhaDigitada>>,
  categorias: Categoria[],
): Mudanca[] {
  const out: Mudanca[] = [];
  for (const c of categorias) {
    const s = saldos.find(x => x.ano === periodo.ano && (x.mes || 1) === periodo.mes && x.categoria === c);
    const d = digitado[c] ?? { quantidade: 0 };
    const pares: [Mudanca['campo'], number | null, number | null][] = [
      ['Cabeças', s ? s.quantidade : null, d.quantidade > 0 ? d.quantidade : (s ? 0 : null)],
      ['Peso (kg)', s?.pesoMedioKg ?? null, d.pesoMedioKg ?? null],
      ['R$/kg', s?.precoKg ?? null, d.precoKg ?? null],
    ];
    for (const [campo, antes, depois] of pares) {
      if (!igual(antes, depois)) out.push({ categoria: c, campo, antes, depois });
    }
  }
  return out;
}
