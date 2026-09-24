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
/**
 * ⚠ DUAS ESCALAS, E O DEFAULT E' A DE TELA — MOVIMENTACOES-PADRAO-01b. Em tela cheia a regua
 * compete com o navegador; dentro de um modal ela compete com o rodape fixo e o resumo
 * lateral, que NAO rolam. A mesma tipografia que respira numa pagina empurra o resumo para
 * fora da tela num modal de `100vh - 32px`. Ver A18 "escala de modal" em docs/PADROES-UI.md.
 * ⚠ `'tela'` E' O DEFAULT DE PROPOSITO: os tres consumidores medidos sao `CusteioTxtImportTab`
 * (tela cheia), `AbateModalShell` e `CargaMandiocaModal` (modais). Quem nao passa a prop nao
 * muda de tamanho — a mandioca e o custeio ficam como estao.
 */
export type EscalaBloco = 'tela' | 'modal';

export function BlocoTopoAba({ itens, escala = 'tela' }: {
  itens: { rotulo: string; valor: string | null; contexto?: string | null }[];
  escala?: EscalaBloco;
}) {
  const modal = escala === 'modal';
  const container = modal ? 'gap-2 px-[9px] py-1.5' : 'gap-3 px-3.5 py-[11px]';
  const rotulo = modal ? 'text-[10px]' : 'text-[11px]';
  const valor = modal ? 'text-[15px] leading-tight mt-0.5' : 'text-[20px] leading-none mt-1';
  const contexto = modal ? 'text-[10px] mt-0.5' : 'text-[11px] mt-1';
  return (
    <div className={`grid rounded-md border bg-muted/20 ${container} grid-cols-${itens.length}`}
         style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
      {itens.map(i => (
        <div key={i.rotulo} className="min-w-0">
          <div className={`${rotulo} font-normal text-muted-foreground leading-none`}>{i.rotulo}</div>
          <div className={`${valor} truncate whitespace-nowrap font-medium tabular-nums`}>
            {i.valor ?? '—'}
          </div>
          {i.contexto && (
            <div className={`${contexto} truncate whitespace-nowrap text-muted-foreground`}>{i.contexto}</div>
          )}
        </div>
      ))}
    </div>
  );
}
