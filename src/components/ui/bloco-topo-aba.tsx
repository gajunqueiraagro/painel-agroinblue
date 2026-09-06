/**
 * BlocoTopoAba — o bloco cinza de números do topo de uma aba.
 *
 * ⚠ MOVIDO VERBATIM de `AbateModalShell`, onde nasceu privado (ZOOT/CUSTEIO-TXT-02). A
 * prévia do custeio precisa do MESMO bloco, e importá-lo do shell do abate acoplaria o
 * importador financeiro a um modal de operação comercial — o tipo de aresta que vira
 * ciclo. Módulo folha: não importa nada do repo além do React implícito.
 * ⚠ NADA MUDOU NA APARÊNCIA: o diff contra a origem é vazio, de propósito. Quem quiser
 * mudar o bloco muda aqui, e os dois lados andam juntos.
 */
/**
 * O bloco de topo de uma aba — o mesmo container do "Identificação do abate".
 *
 * ⚠ UM SÓ PARA AS CINCO ABAS, e é isso que o torna útil: o operador aprende a olhar
 * para o mesmo lugar e encontra sempre a resposta da aba em que está. Cinco variações do
 * mesmo bloco ensinariam a procurar.
 * ⚠ FONTE AUSENTE É TRAÇO, nunca zero — zero afirma que se perguntou e não há.
 */
export function BlocoTopoAba({ itens }: { itens: { rotulo: string; valor: string | null; contexto?: string | null }[] }) {
  return (
    <div className={`grid gap-3 rounded-md border bg-muted/20 px-3.5 py-[11px] grid-cols-${itens.length}`}
         style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
      {itens.map(i => (
        <div key={i.rotulo} className="min-w-0">
          <div className="text-[11px] font-normal text-muted-foreground leading-none">{i.rotulo}</div>
          <div className="mt-1 truncate whitespace-nowrap text-[20px] font-medium leading-none tabular-nums">
            {i.valor ?? '—'}
          </div>
          {i.contexto && (
            <div className="mt-1 truncate whitespace-nowrap text-[11px] text-muted-foreground">{i.contexto}</div>
          )}
        </div>
      ))}
    </div>
  );
}
