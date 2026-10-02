/**
 * O GESTO DA SELEÇÃO no Extrato da planilha — PR-CONC-ENRIQ-AGRUP-2b-TELA.
 *
 * O operador marca linhas "sem par" da planilha e lançamentos "Só no sistema", como na Conferência; a forma da seleção
 * diz qual RPC grava:
 *   1 × 1  -> 'casar'      (sem gravação ainda — desabilitado; ver abaixo)
 *   N × 1  -> 'desmembrar' (`fn_classificacao_split_substituir`: N lançamentos no lugar do consolidado)
 *   1 × N  -> 'juntar'     (`fn_classificacao_resolver_grupo`: N lançamentos nesta linha)
 *   N × M  -> 'bloco'      (sem gravação ainda — desabilitado)
 *
 * ⚠ ESTA FUNÇÃO SÓ HABILITA O BOTÃO. Quem valida soma, origem, mês fechado e estado da linha é a RPC; a recusa dela é a
 *   verdade e aparece escrita na barra. A ÚNICA conta daqui é a soma ao centavo do desmembrar, e ela é a MESMA frase da RPC
 *   (`motivoDoDesmembrar`, decisão (iv) do Gabriel: bloco que não fecha não se desmembra à mão).
 * ⚠ SOMAS COM SINAL, como os valores já desenhados na linha (saída negativa nos dois lados).
 */
import { motivoDoDesmembrar } from '@/v2/lib/mesa/desmembrar';

export type FormaDaSelecao = 'casar' | 'desmembrar' | 'juntar' | 'bloco';

export interface ItemMarcado { id: string; valor: number }

export interface GestoDaSelecao {
  /** `null` = nada marcado, ou só um lado. */
  forma: FormaDaSelecao | null;
  /** O texto do botão. */
  rotulo: string;
  habilitado: boolean;
  /** Por que o botão está apagado — escrito ao lado e no `title`. */
  motivo: string | null;
  somaPlanilha: number;
  somaSistema: number;
  /** planilha − sistema, com sinal. */
  diferenca: number;
}

const cent = (v: number) => Math.round(v * 100);

export function gestoDaSelecao(sel: { planilha: readonly ItemMarcado[]; sistema: readonly ItemMarcado[] }): GestoDaSelecao {
  const nP = sel.planilha.length;
  const nS = sel.sistema.length;
  const somaPlanilha = cent(sel.planilha.reduce((a, x) => a + x.valor, 0)) / 100;
  const somaSistema = cent(sel.sistema.reduce((a, x) => a + x.valor, 0)) / 100;
  const diferencaCent = cent(somaPlanilha) - cent(somaSistema);
  const base = { somaPlanilha, somaSistema, diferenca: diferencaCent / 100 };

  if (nP === 0 && nS === 0) return { ...base, forma: null, rotulo: '', habilitado: false, motivo: null };
  if (nP === 0 || nS === 0) {
    return { ...base, forma: null, rotulo: '', habilitado: false, motivo: 'marque também o outro lado' };
  }
  /* ⚠ O 1×1 NÃO GRAVA AINDA (fix1): a linha marcável é a "sem par" (`sem_match`), e `fn_classificacao_resolver_proximos` só
     aceita `candidatos_proximos` — recusaria em 100% dos cliques (`nao_candidatos_proximos`). Frente de banco, com o N×M. */
  if (nP === 1 && nS === 1) {
    return { ...base, forma: 'casar', rotulo: 'Casar', habilitado: false, motivo: 'casar 1×1 em linha sem par ainda não tem gravação' };
  }
  if (nP >= 2 && nS === 1) {
    const motivo = motivoDoDesmembrar({
      completo: true, bate: diferencaCent === 0, diferencaCent, carregadas: nP, total: nP,
    });
    return { ...base, forma: 'desmembrar', rotulo: `Desmembrar em ${nP}`, habilitado: motivo === null, motivo };
  }
  if (nP === 1 && nS >= 2) {
    return { ...base, forma: 'juntar', rotulo: `Juntar ${nS} nesta linha`, habilitado: true, motivo: null };
  }
  return {
    ...base, forma: 'bloco', rotulo: `Bloco ${nP}×${nS}`, habilitado: false,
    motivo: `bloco ${nP}×${nS} ainda não tem gravação`,
  };
}
