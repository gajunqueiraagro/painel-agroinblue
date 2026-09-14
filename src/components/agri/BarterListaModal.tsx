/**
 * A CASCA DOS TRÊS MODAIS DE LISTA DO BARTER — PR-AGRI-BARTER-RESUMO-MODAL.
 *
 * ⚠ NÃO É O `LancamentoModalEnvelope`, e medi antes de decidir. Aquele é a casca de um
 * FORMULÁRIO de lançamento: o cabeçalho exige `data` e `fazendaNome` e imprime a pílula
 * "Realizado"; o corpo é duas colunas (campos à esquerda, resumo à direita); o rodapé aceita
 * UMA ação. Uma lista de 26 insumos não tem data nem fazenda próprias, não tem resumo lateral e
 * tem duas ações por LINHA. Forçá-la ali obrigaria a inventar um cabeçalho falso — e a pílula
 * "Realizado" sobre uma lista é ruído que parece informação.
 *
 * ⚠ O QUE SE REUSA É O PADRÃO, e ele está aqui inteiro: faixa `bg-primary` no topo e no rodapé,
 * corpo rolando entre as duas, cabeçalho de tabela grudado e total fixo. É o mesmo chassi que as
 * três listas já tinham na tela — elas só mudaram de moldura.
 *
 * ⚠ TRÊS USOS NO MESMO PR, e é por isso que a casca existe em vez de três cópias: insumos,
 * vendas e extrato. A quarta cópia é que costuma cobrar o preço; aqui a terceira já bastou.
 */
import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BarterListaModal({
  aberto, titulo, subtitulo, acao, rodapeEsquerda, rodapeDireita, onFechar, children, corRodape,
}: {
  aberto: boolean;
  titulo: string;
  /** Uma linha de contexto — o que a lista responde. */
  subtitulo: string;
  /** Botão de ação do cabeçalho ("Adicionar insumo"), opcional. */
  acao?: ReactNode;
  /** O rótulo do total, no rodapé fixo. */
  rodapeEsquerda: ReactNode;
  /** O número do total. */
  rodapeDireita: ReactNode;
  onFechar: () => void;
  /** A tabela. O cabeçalho dela usa `sticky top-0` e gruda neste scrollport. */
  children: ReactNode;
  /**
   * A cor da faixa do total. Sem ela, o `bg-primary` de sempre.
   *
   * ⚠ OPT-IN, E O MOTIVO É A REGRA DA CASA: o rodapé tem de ter o MESMO tom do cabeçalho da
   * tabela que ele fecha. Quando uma das três listas muda de tom, só ela muda — e sem a prop a
   * alternativa seria mudar as três de uma vez por causa de uma.
   */
  corRodape?: string;
}) {
  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* ⚠ ALTURA FIXA EM 80vh, NÃO `max-h`. Com `max-h` o modal encolheria para caber em 3
          linhas e cresceria em 26 — e a lista, que é onde o operador trabalha, mudaria de
          tamanho conforme o dado. Altura fixa mantém o rodapé no mesmo lugar sempre. */}
      <DialogContent
        className={cn('flex h-[80vh] max-w-4xl flex-col gap-0 overflow-hidden p-0',
          '[&>button.absolute]:hidden')}>
        <div className="flex shrink-0 items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold leading-tight">{titulo}</h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">{subtitulo}</p>
          </div>
          <div className="flex-1" />
          {acao}
          <Button variant="ghost" size="icon"
            className="h-7 w-7 shrink-0 text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            title="Fechar" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ⚠ RECUO INTERNO — item 10 do polish. A tabela nascia colada nas bordas do modal, e
            texto encostado na moldura se lê pior e parece corte.
            ⚠⚠ MAS O RECUO DE CIMA SAIU, e é o conserto do cabeçalho vazado. `sticky top-0` ancora
            no PADDING BOX do scrollport, não na borda dele: com `py-2`, o cabeçalho grudava 8px
            ABAIXO do topo — medido — e nessa faixa de 8px as linhas passavam à vista, por cima
            da faixa escura. O fundo do cabeçalho sempre esteve opaco e o `z-10` sempre
            funcionou; o que existia era um vão.
            ⚠ `pb-2` FICA: padding embaixo não cria vão nenhum, porque nada gruda no rodapé deste
            scrollport — o total é irmão dele, fora da rolagem. E o respiro do topo deixou de ser
            necessário: quem encosta na moldura agora é a faixa escura do cabeçalho, que é
            justamente onde ela deve estar. */}
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-2">{children}</div>

        <div className={cn('flex shrink-0 items-center justify-between gap-2 px-4 py-1.5',
          'text-[11px] font-semibold text-primary-foreground', corRodape ?? 'bg-primary')}>
          <span className="truncate">{rodapeEsquerda}</span>
          <span className="tabular-nums">{rodapeDireita}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O cartão de resumo que fica NA TELA no lugar de cada lista.
 *
 * ⚠ ELE NÃO REPETE O DINHEIRO DOS CARDS DE TOPO. "Recebido (insumos) R$ 390.000" já está lá em
 * cima; repetir aqui gastaria a altura que este PR existe para economizar, e dois números iguais
 * em telas diferentes é como nascem as divergências de leitura.
 * ⚠ OS BOTÕES FICAM SEMPRE NOS MESMOS LUGARES, inclusive quando não há o que ver: "Ver" com
 * lista vazia continua abrindo e dizendo que está vazia. Botão que some conforme o dado é
 * exatamente o que a lei de estabilidade visual proíbe.
 */
export function BarterResumoCard({
  titulo, estado, valor, cor, children,
}: {
  titulo: string;
  /** A contagem: "26 insumos". Nunca vazia — use "—". */
  estado: ReactNode;
  /**
   * O DINHEIRO, em destaque — item 2 do polish.
   *
   * ⚠ ELE SAIU DA MESMA LINHA DA CONTAGEM. "26 insumos · R$ 390.252,59" em 11px cinza punha o
   * número que importa no mesmo peso do que é só contexto, e o olho não achava nenhum dos dois.
   */
  valor?: string;
  /** Verde para receita, vermelho para custo — o padrão de cor da casa. */
  cor?: string;
  /** Os botões. */
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border bg-card px-2.5 py-2">
      <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</div>
      {/* ⚠ A LINHA DO VALOR OCUPA ALTURA SEMPRE, com ou sem número: o card de materializar não tem
          valor, e sem o `min-h` os três cartões da linha teriam alturas diferentes. */}
      <div className={cn('min-h-[19px] truncate text-[16px] font-medium leading-none tabular-nums', cor)}>
        {valor ?? ''}
      </div>
      <div className="min-h-[13px] truncate text-[10px] leading-tight text-muted-foreground">{estado}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

/**
 * OS TRÊS ESTADOS DE UMA LISTA — carregando, falhou, vazia — numa linha só de tabela.
 *
 * ⚠ ELE EXISTE PORQUE OS TRÊS CAÍAM NO MESMO TEXTO. As listas do barter renderizavam "Nenhum
 * insumo lançado" tanto ao carregar quanto ao falhar: o `queryFn` lança, a tela ignorava, e uma
 * falha de rede ficava indistinguível de uma lista de fato vazia. Custou uma investigação inteira
 * — uma venda "sumiu" e nunca tinha saído do banco.
 * ⚠ VAZIO É AFIRMAÇÃO, NÃO PADRÃO. "Nenhuma venda lançada" diz que o operador não lançou nada, e
 * isso só se pode afirmar depois de carregar sem erro. Nos outros dois casos a tela não sabe, e
 * tem de dizer que não sabe.
 * ⚠ DEVOLVE `null` QUANDO HÁ LINHAS: o chamador o põe antes do `map` e não precisa de condicional
 * própria — quem decide se há o que dizer é este componente.
 */
export function EstadoDaLista({ carregando, erro, vazio, colunas, mensagemVazio, onTentarDeNovo }: {
  carregando: boolean;
  erro: Error | null;
  /** A lista carregou e não tem linhas. */
  vazio: boolean;
  /** Quantas colunas a tabela tem — o `colSpan` da linha. */
  colunas: number;
  /** O texto do vazio REAL, próprio de cada lista. */
  mensagemVazio: string;
  onTentarDeNovo?: () => void;
}) {
  /* ⚠ O ERRO VEM ANTES DO CARREGANDO: numa nova tentativa os dois são verdade ao mesmo tempo, e
     trocar a mensagem de falha por "carregando…" esconderia que houve falha. */
  if (erro) {
    return (
      <tr>
        <td colSpan={colunas} className="px-2 py-6 text-center">
          <div className="flex flex-col items-center gap-1.5 text-[11px] text-destructive">
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Não foi possível carregar.
            </span>
            {/* ⚠ A MENSAGEM CRUA NÃO VAI PARA A TELA: ela é da biblioteca, em inglês, e não diz
                nada ao operador. Fica no `title`, para quem for reportar o problema copiar. */}
            <span className="text-[10px] text-muted-foreground" title={erro.message}>
              A lista não foi lida — o dado continua no banco.
            </span>
            {onTentarDeNovo && (
              <button type="button" onClick={onTentarDeNovo}
                className="mt-0.5 rounded border px-2 py-0.5 text-[10px] text-foreground hover:bg-muted">
                Tentar de novo
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }
  if (carregando) {
    return (
      <tr>
        <td colSpan={colunas} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
          </span>
        </td>
      </tr>
    );
  }
  if (vazio) {
    return (
      <tr>
        <td colSpan={colunas} className="px-2 py-6 text-center text-[10px] text-muted-foreground">
          {mensagemVazio}
        </td>
      </tr>
    );
  }
  return null;
}
