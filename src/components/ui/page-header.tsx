/**
 * PageHeader — o cabeçalho de identidade de uma tela: título e subtítulo.
 *
 * ⚠ A MÉTRICA É CÓPIA VERBATIM da Conciliação (`ConciliacaoBancariaTab:809-814`), que é a
 * referência declarada do padrão — `text-[15px] font-semibold leading-none` no título e
 * `mt-1 text-[11px] text-muted-foreground` no subtítulo. O diff contra a origem é vazio, de
 * propósito: quem mudar a régua muda aqui, e as telas andam juntas.
 * ⚠ O RESPIRO DO TOPO NÃO MORA AQUI, mora no container da tela (`p-3`). Se o componente
 * trouxesse padding próprio, toda tela que já tem o seu somaria dois — e o bloco fixo do A21
 * precisa que o padding seja do container para poder cobri-lo com `-mt/pt`.
 * ⚠ NEM AÇÕES, NEM LINHA. O componente é só o BLOCO de identidade; a linha que o põe ao lado
 * dos botões ou dos seletores é de cada tela, porque só ela sabe se o que está à direita é um
 * botão de 32px (alinha embaixo) ou um par rótulo+campo de 49px (alinha em cima). Um
 * `items-end` cego foi o que empurrou o título do Estoque de Grãos 34px para baixo.
 *
 * Módulo folha: não importa nada do repo — só o tipo do React.
 */
import type { ReactNode } from 'react';

export function PageHeader({ titulo, subtitulo }: {
  /* ⚠ `ReactNode` TAMBEM NO TITULO, desde o PR-ESTOQUE-BREADCRUMB-ORDEM: o titulo do Estoque de
     Graos e' um breadcrumb com a raiz CLICAVEL ("Estoque de Graos › Amendoim (25kg saca)"). A
     regua nao muda — o `h2` continua sendo o mesmo `text-[15px] font-semibold leading-none`, e o
     `button` de dentro herda fonte e peso pelo preflight do Tailwind. Nasceu `string` e foi
     alargado quando a primeira tela precisou; texto puro segue sendo o caso comum. */
  titulo: ReactNode;
  /* ⚠ `ReactNode`, NÃO `string`: o subtítulo do detalhe do Barter é uma linha composta
     (parceiro · cultura · aberto em), e obrigá-la a virar string mataria o `—` de cultura
     ausente, que é informação. */
  subtitulo?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h2 className="text-[15px] font-semibold leading-none">{titulo}</h2>
      {subtitulo && (
        <p className="mt-1 text-[11px] text-muted-foreground">{subtitulo}</p>
      )}
    </div>
  );
}
