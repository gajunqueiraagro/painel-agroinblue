/**
 * ORDENAR UMA TABELA PELO CABEÇALHO — PR-TABELA-SORT-01.
 *
 * ⚠ NÃO HAVIA O QUE REUSAR, e vale dizer onde procurei para ninguém procurar de novo. Três
 * telas já ordenam por cabeçalho, e as três com código próprio:
 *  · `CentralOperacoesComerciais` — `ThOrd` + `alternarOrd`, o desenho mais maduro (aria-sort,
 *    teclado, três estados), mas função LOCAL do arquivo, presa ao `TableHead` do shadcn e ao
 *    `ColunaOrd` daquela tela;
 *  · `TabelaLancamentosCompacta` — cabeçalho com seta, ordenação CONTROLADA por quem monta,
 *    campos fixos (`CampoOrdemLanc`);
 *  · `drillEconomico.ordenarLancamentos` — compara com `if` por nome de campo do domínio.
 * O que faltava era a peça genérica. Ela nasce aqui, e o piloto é a colheita; converter as
 * três é frente própria, uma por vez.
 *
 * ⚠ DUAS DIREÇÕES, NÃO TRÊS. A Central alterna asc → desc → nenhum; aqui é asc ↔ desc, que é o
 * que o Gabriel pediu como padrão. A diferença fica registrada porque a conversão da Central
 * vai ter de escolher uma das duas — e a escolha é dele, não do código que chegar primeiro.
 *
 * ⚠ SÓ EXIBIÇÃO. Nada aqui toca o banco, o consolidado ou os totais: soma não muda com ordem.
 */
import { useMemo, useState } from 'react';

/** Como a coluna se compara. O tipo é da COLUNA, não do valor: "180" e "27" são números. */
export type TipoOrdem = 'numero' | 'data' | 'texto';

export type DirecaoOrdem = 'asc' | 'desc';

export interface OrdemTabela<C extends string> {
  coluna: C;
  direcao: DirecaoOrdem;
}

/** O que a tabela declara sobre cada coluna ordenável. */
export interface ColunaOrdenavel<T, C extends string> {
  coluna: C;
  tipo: TipoOrdem;
  /** O valor que entra na comparação. `null` é ausência — e ausência vai para o fim. */
  valor: (linha: T) => string | number | null | undefined;
}

/**
 * ⚠ AUSÊNCIA VAI PARA O FIM NOS DOIS SENTIDOS — é o mesmo idioma do "(Sem centro)" do drill.
 * Um nulo tratado como zero colocaria a carga sem laudo na frente das de 12 ppb ao ordenar
 * crescente, como se fosse a melhor; tratado como texto vazio, ele encabeçaria a lista
 * alfabética. Em nenhum dos dois casos o operador procurava por ele.
 */
function comparar(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  tipo: TipoOrdem,
  sinal: number,
): number {
  const vazio = (v: typeof a) => v == null || v === '';
  if (vazio(a) && vazio(b)) return 0;
  if (vazio(a)) return 1;
  if (vazio(b)) return -1;
  if (tipo === 'numero') return sinal * (Number(a) - Number(b));
  /* Data em ISO (yyyy-mm-dd) e hora em HH:MM ordenam certo como texto — comparar string é o
     mesmo que comparar cronologia, e evita construir mil `Date` a cada render. */
  if (tipo === 'data') return sinal * String(a).localeCompare(String(b));
  return sinal * String(a).localeCompare(String(b), 'pt-BR');
}

/**
 * A ORDENAÇÃO EM SI — pura, e por isso testável sem montar React.
 *
 * ⚠ ESTÁVEL PELO ÍNDICE DE ORIGEM: sem o desempate, duas cargas do mesmo dia trocariam de
 * lugar a cada render e a lista "piscaria" sozinha.
 */
export function ordenarPorColuna<T, C extends string>(
  linhas: readonly T[],
  def: ColunaOrdenavel<T, C> | undefined,
  direcao: DirecaoOrdem,
): T[] {
  if (!def) return [...linhas];
  const sinal = direcao === 'asc' ? 1 : -1;
  return linhas
    .map((linha, i) => ({ linha, i }))
    .sort((x, y) => comparar(def.valor(x.linha), def.valor(y.linha), def.tipo, sinal) || (x.i - y.i))
    .map(x => x.linha);
}

export function useOrdenacaoTabela<T, C extends string>(
  linhas: readonly T[],
  colunas: readonly ColunaOrdenavel<T, C>[],
  inicial: OrdemTabela<C>,
) {
  const [ordem, setOrdem] = useState<OrdemTabela<C>>(inicial);

  /** Clicar na coluna ativa inverte; clicar em outra começa pelo sentido mais útil dela. */
  const alternar = (coluna: C) => setOrdem(atual => (
    atual.coluna === coluna
      ? { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
      /* Nome sobe (a-z), número e data descem (maior e mais recente primeiro) — o idioma da
         lista do Financeiro. */
      : { coluna, direcao: colunas.find(c => c.coluna === coluna)?.tipo === 'texto' ? 'asc' : 'desc' }
  ));

  const ordenadas = useMemo(
    () => ordenarPorColuna(linhas, colunas.find(c => c.coluna === ordem.coluna), ordem.direcao),
    [linhas, colunas, ordem]);

  return { ordem, alternar, ordenadas };
}
