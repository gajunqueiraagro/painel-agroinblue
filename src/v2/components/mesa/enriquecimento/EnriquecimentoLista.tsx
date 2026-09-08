/**
 * EnriquecimentoLista — a coluna esquerda do passo 2. DUMB.
 *
 * ⚠ AGRUPADA POR "dd/mm/aaaa · conta" — 133b. A data e a conta eram repetidas em TODA
 * linha; num dia com quinze lançamentos, quinze vezes a mesma data ocupando a largura
 * onde deveria estar o nome do que se está conferindo. Ditas uma vez na faixa, sobra a
 * linha inteira para a identidade.
 *
 * ⚠ A FAIXA É `sticky` DENTRO DESTE SCROLLPORT — A21. Ela ancora no scrollport MAIS
 * PRÓXIMO, e o único que existe aqui é o `overflow-y-auto` abaixo. Fundo OPACO (`bg-muted`,
 * não `bg-muted/40`) e `z-10`: transparente é pior que não fixar, porque as linhas passam
 * por baixo da data que se está conferindo.
 *
 * ⚠ UM SCROLLPORT SÓ. O `max-h` é o piso de segurança para quando a cadeia flex acima não
 * tem altura — com ela boa, `flex-1` manda e o teto nunca é alcançado.
 */
import { useMemo } from 'react';
import { EnriquecimentoRow } from './EnriquecimentoRow';

import type { EnriqRowVM } from './types';

export interface EnriquecimentoListaProps {
  rows: EnriqRowVM[];
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
  hideBanco?: boolean;   // U2 — sob filtro por conta, Banco é redundante na faixa
  /** 133b-a correção 2 — linhas editadas e ainda não gravadas: ponto âmbar. */
  editadasIds?: ReadonlySet<string>;
}

/**
 * Agrupa preservando a ORDEM em que as linhas chegaram — elas já vêm ordenadas por
 * `excel_linha_origem`, e reordenar aqui faria a lista discordar da planilha que o
 * operador tem aberta ao lado.
 */
function agrupar(rows: EnriqRowVM[], hideBanco: boolean): Array<{ chave: string; rotulo: string; linhas: EnriqRowVM[] }> {
  const ordem: string[] = [];
  const mapa = new Map<string, { rotulo: string; linhas: EnriqRowVM[] }>();
  for (const r of rows) {
    const conta = r.contaBancaria ?? 'Sem conta';
    /* ⚠ A DATA É A DE CAIXA — 133e adendo item 5; quando sobra a competência, a faixa diz
       "comp." para o operador não conferir um mês que não é o do dinheiro. */
    const marca = r.dataEhCompetencia ? `${r.data} comp.` : r.data;
    const chave = hideBanco ? marca : `${marca}|${conta}`;
    const rotulo = hideBanco ? marca : `${marca} · ${conta}`;
    let g = mapa.get(chave);
    if (!g) { g = { rotulo, linhas: [] }; mapa.set(chave, g); ordem.push(chave); }
    g.linhas.push(r);
  }
  return ordem.map((chave) => ({ chave, ...mapa.get(chave)! }));
}

export function EnriquecimentoLista({ rows, selecionadoId, onSelecionar, hideBanco, editadasIds }: EnriquecimentoListaProps) {
  const grupos = useMemo(() => agrupar(rows, !!hideBanco), [rows, hideBanco]);

  return (
    /* ⚠ SEM TETO DE ALTURA NO DESKTOP — 133h-b item 1a. O `max-h-[calc(100vh-13rem)]` era um
       piso de segurança de quando a cadeia flex acima não tinha altura; desde que o
       hospedeiro da aba deixou de ser um scrollport (133h item 4), `h-full` mede de
       verdade — e o teto passou a SOBRAR área embaixo, porque 13rem é um chute sobre o que
       está acima. `flex-1 min-h-0` deixa a lista chegar ao rodapé.
       ⚠ O `max-h-[70vh]` DO MOBILE FICA: lá não há cadeia flex com altura, e sem teto a
       lista empurraria o rodapé para fora da tela. */
    <div className="flex max-h-[70vh] flex-col overflow-hidden rounded-lg border bg-card md:h-full md:max-h-none md:min-h-0 md:self-stretch">
      <div className="flex shrink-0 items-baseline justify-between border-b bg-card px-2 py-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Linhas da planilha
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-[11px] text-muted-foreground">Nenhuma linha neste recorte.</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {grupos.map((g) => (
            <div key={g.chave}>
              {/* 18px e 10px — 133h-b item 1b; a faixa é referência, não conteúdo. */}
              <div className="sticky top-0 z-10 flex h-[18px] items-center truncate bg-muted px-2 text-[10px] font-medium text-muted-foreground"
                title={g.rotulo}>
                {g.rotulo}
              </div>
              {/* ⚠ SEM `p-1` E SEM `space-y`: eram 8px por grupo e 1px por linha, e numa lista
                  de 30 linhas isso é mais de uma linha inteira gasta em respiro. A altura
                  declarada da linha (22px) é o que separa. */}
              <div>
                {g.linhas.map((r) => (
                  <EnriquecimentoRow
                    key={r.id}
                    row={r}
                    selecionado={r.id === selecionadoId}
                    onSelecionar={() => onSelecionar(r.id)}
                    hideBanco={hideBanco}
                    editadaNaoGravada={editadasIds?.has(r.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
