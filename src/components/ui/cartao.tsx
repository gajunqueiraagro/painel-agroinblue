/**
 * CARTÃO DE NÚMERO — o cartão pequeno de rótulo + valor, com a unidade miúda ao lado.
 *
 * ⚠ MOVIDO VERBATIM de `PainelSafraTab`, onde nasceu privado. O Estoque de Grãos tinha uma
 * SEGUNDA cópia (`AgriEstoqueGraosTab`), com o mesmo markup byte a byte e só os comentários
 * diferentes — conferido antes de mover: as duas rendiam a mesma árvore. Duas cópias de um
 * cartão é onde uma delas ganha um `py` diferente e as duas telas param de bater.
 * ⚠ O DIFF CONTRA A ORIGEM É VAZIO menos por uma palavra: `function` virou `export function`.
 * Nada de aparência mudou, de propósito.
 * ⚠ A PROSA ABAIXO É A DO PAINEL DA SAFRA, e as medidas que ela cita (~72px, ~264px, o bloco de
 * cinco cartões, a linha do DRE) são de LÁ. Elas ficam porque explicam POR QUE o cartão é assim —
 * unidade ao lado, `nowrap`, centavos, `title` — não porque descrevam esta tela ou aquela.
 * ⚠ E A NOTA QUE O ESTOQUE DE GRÃOS GUARDAVA DIZIA O MESMO, em uma linha: "o cartão é o do Painel
 * da Safra, com a unidade miúda ao lado do número e `nowrap` — a mesma lei anti-quebra: 'R$'
 * sozinho numa segunda linha é a quebra clássica destes cartões". Ela vem junto para não se
 * perder com o arquivo de origem.
 *
 * Módulo folha: só o `cn`.
 */
import { cn } from '@/lib/utils';

/**
 * O CARTÃO DA RÉGUA — quatro deles, todos POR HECTARE.
 *
 * ⚠ A UNIDADE VOLTOU PARA O LADO DO NÚMERO, e o motivo de ela ter subido para o rótulo deixou
 * de existir. No F2 o bloco Colheita tinha CINCO cartões em meia tela (~72px de texto cada na
 * tela mais estreita) e "R$ 2.742.022,26" pedia 157px: foi preciso tirar o "R$" do número,
 * tirar os centavos e descer a fonte para 13px. Agora são DOIS por bloco — ~264px cada — e os
 * valores que sobraram têm 4 ou 5 dígitos, não 7. O aperto que justificava a gambiarra sumiu
 * junto com os cartões de total.
 * ⚠ O `nowrap` É LEI, não zelo: o número e a unidade são uma coisa só, e "R$" sozinho numa
 * segunda linha é a quebra clássica deste cartão.
 * ⚠ OS CENTAVOS VOLTARAM. Eles saíram no F2 por causa de um número de SETE dígitos — o
 * faturamento de 2,7 milhões num cartão de ~72px — e essa razão morreu com o bloco de cinco.
 * Por-hectare tem 4 ou 5 dígitos: "14.822,37" pede ~110px num cartão de ~264px. A regra tinha
 * sobrevivido ao motivo dela, e o custo era real — o cartão não batia com a linha do DRE logo
 * abaixo sem passar o mouse.
 * ⚠ O `title` FICA MESMO ASSIM: ele é a defesa do `truncate`, não o esconderijo do centavo.
 */
export function Cartao({ rotulo, valor, unidade, titulo, cor }: {
  rotulo: string;
  valor: string;
  /** "R$", "ha" — miúdo, colado no número. */
  unidade?: string;
  /** O valor por extenso, com centavos, no hover. */
  titulo?: string;
  /**
   * A cor do VALOR — vermelho para custo, verde para receita.
   *
   * ⚠ SÓ NOS CARTÕES DE DINHEIRO, e é o que dá sentido à cor: Área e sc/ha ficam neutros porque
   * não são custo nem receita, e pintá-los faria a cor virar decoração em vez de sinal.
   * ⚠ O RÓTULO E A UNIDADE NÃO ACOMPANHAM: quem carrega o sinal é o número.
   */
  cor?: string;
}) {
  return (
    /* ⚠ `py-1` E `leading-none` NO VALOR: a altura do cartão é multiplicada por dois blocos e
       some da tela em toda rolagem. Cada pixel aqui é pixel de tabela lá embaixo. */
    <div className="min-w-0 rounded-md border bg-card px-2.5 py-1">
      <div className="truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </div>
      {/* ⚠ O `truncate` FICA como última defesa, mesmo com a conta folgada: uma safra futura
          pode passar da casa dos milhões, e cortar com o inteiro no `title` é melhor que
          empurrar o cartão vizinho para fora do bloco. */}
      <div className="mt-0.5 flex items-baseline gap-1 truncate whitespace-nowrap" title={titulo}>
        {unidade && (
          <span className="shrink-0 text-[11px] font-medium leading-none text-muted-foreground">
            {unidade}
          </span>
        )}
        <span className={cn('truncate text-[16px] font-medium leading-[1.1] tabular-nums', cor)}>
          {valor}
        </span>
      </div>
    </div>
  );
}
