/**
 * Os pares do resumo lateral dos modais de lançamento simples — [OC-PADRAO-01] 114c.
 *
 * ⚠ EXTRAÍDO, NÃO ESCRITO. O corpo veio de `MorteModalShell`, byte a byte; o do
 * Nascimento (`LinhaResumoNasc`) é o mesmo com outro nome. Nenhuma medida foi
 * redigitada.
 *
 * ⚠ POR QUE AGORA, E POR QUE SÓ AQUI. O par estava em CINCO lugares (abate, venda,
 * venda-meta, nascimento, morte) quando o 114c pediu mais três. Oito cópias do mesmo
 * `flex items-baseline justify-between` não se justificam. Mas os cinco antigos NÃO
 * migram neste PR: Nascimento e Morte ainda não passaram por homologação de tela, e as
 * versões do abate e da venda têm parâmetros a mais (`cor`, `forte`, `selo`) que
 * pertencem àquelas telas. Migrar tudo agora misturaria uma refatoração de cinco telas
 * com a criação de três — e o dia em que uma delas quebrasse, ninguém saberia por quê.
 * Os três novos consomem daqui; os cinco antigos são frente própria.
 */

/** Par rótulo-valor: rótulo cinza à esquerda, valor à direita, traço no vazio. */
export function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      <span className="truncate text-right font-medium">{valor || '—'}</span>
    </div>
  );
}

/**
 * A fazenda tem um estado que os outros pares não têm: pode estar FALTANDO e bloquear o
 * registro. Traço cinza diria "ausente, tudo bem"; aqui a ausência é erro a resolver, e a
 * cor precisa dizer isso.
 */
export function LinhaResumoFazenda({ rotulo = 'Fazenda', valor, falta }: {
  rotulo?: string; valor: string | null; falta: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      <span className={`truncate text-right font-medium ${falta ? 'text-destructive' : ''}`}>
        {falta ? 'escolha a fazenda' : (valor || '—')}
      </span>
    </div>
  );
}

/** A faixa que abre cada bloco do resumo — mesma medida do `ResumoLateralOC` (A17). */
export function FaixaResumo({ titulo }: { titulo: string }) {
  return (
    <div className="border-b border-t border-border bg-muted/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {titulo}
    </div>
  );
}
