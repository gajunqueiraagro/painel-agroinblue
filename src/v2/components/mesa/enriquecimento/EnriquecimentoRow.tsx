/**
 * EnriquecimentoRow — a linha da lista do passo 2. DUMB.
 *
 * ⚠ A IDENTIDADE É A DESCRIÇÃO DA PLANILHA (11px/500) — 133b. A linha mostrava
 * "data · banco · valor" em cima e "estado · fornecedor" embaixo: quatro contextos e
 * nenhum nome. O texto pelo qual o operador reconhece a linha é o que ele escreveu no
 * Excel, e é ele que ocupa a largura agora.
 *
 * ⚠ O CONTEXTO É O `porQue` DO BANCO — 133a. "casou pelo pagamento de 12/08" diz mais que
 * "Pronto", e não é dedução do front: veio do `casamento_meta` que o casador gravou.
 *
 * ⚠ 22px EXATOS, UMA LINHA SÓ — 133h-b item 1b. Eram 36 (duas alturas de texto mais
 * padding), e a lista mostrava ~18 linhas onde cabem 30: o operador rolava para conferir o
 * que caberia na tela. As duas informações que ocupavam a segunda linha viraram COLUNAS —
 * contexto elástico no meio, situação em 110px à direita —, e a altura passa a ser
 * declarada (`h-[22px]` + `items-center`), não derivada de padding.
 *
 * ⚠ A DATA SAIU DA LINHA — 133b-b. Ela viveu aqui por um envelope: a faixa do grupo já diz
 * "dd/mm/aaaa · conta", e repetir a data em cada uma das linhas daquela faixa gastava 64px
 * de largura para dizer quinze vezes o que estava escrito uma vez logo acima. O que a
 * coluna fixa resolvia — o valor da direita dançando conforme o tamanho da descrição —
 * resolve-se com a coluna de 96px do próprio valor.
 *
 * ⚠ SEM QUEBRA DE LINHA, NAS DUAS: `min-w-0` no filho flexível e `truncate` no texto. Sem
 * os dois, uma descrição longa empurra o valor para fora e a lista deixa de alinhar.
 */
import { STATUS_META } from './fmt';
import { estaRevisada } from '@/v2/lib/mesa/enriquecimentoView';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoRowProps {
  row: EnriqRowVM;
  selecionado: boolean;
  onSelecionar: () => void;
  hideBanco?: boolean;   // U2 — sob filtro por conta, Banco é redundante
  /**
   * 133b-a correção 2 — a linha foi editada e ainda NÃO foi gravada no lançamento.
   *
   * ⚠ PONTO ÂMBAR, e não sumiço: o operador acabou de mexer nela e precisa vê-la onde
   * estava. O que mudou não está no banco, e o rodapé diz isso com todas as letras.
   */
  editadaNaoGravada?: boolean;
}

export function EnriquecimentoRow({ row, selecionado, onSelecionar, editadaNaoGravada }: EnriquecimentoRowProps) {
  const meta = STATUS_META[row.status] ?? { label: row.statusLabel, cls: 'text-muted-foreground', dot: 'bg-muted-foreground' };
  /* ⚠ O SINAL É PARTE DO NÚMERO — 129d item 4. Uma lista onde saída e entrada têm a mesma
     cara faz o operador conferir R$ 164,38 sem saber se saiu ou entrou. `null` (linha sem
     lançamento) não afirma nenhum dos dois: fica na cor do texto. */
  const corValor =
    row.entradaOuSaida === 'saida' ? 'text-red-600 dark:text-red-400'
    : row.entradaOuSaida === 'entrada' ? 'text-emerald-700 dark:text-emerald-400'
    : '';
  const sinal = row.entradaOuSaida === 'saida' ? '−' : '';
  /* ⚠ DOIS EIXOS, DOIS SINAIS — PR-MESA-ORDEM-REVISADO-01 item B. A bolinha responde "este
     dinheiro achou par?"; o ✓ responde "eu já passei por aqui?". Elas são independentes: uma
     linha sem par pode estar revisada (o operador olhou e decidiu deixar), e uma linha que
     casou perfeitamente pode nunca ter sido olhada. Empilhar as duas respostas num único
     ponto de 7px obrigava o operador a lembrar uma tabela de cores para ler o que agora se
     lê de relance. */
  const revisada = estaRevisada(row);

  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={`grid h-[22px] w-full items-center gap-1.5 rounded px-3 text-left transition-colors ${
        selecionado
          ? 'bg-primary/10 outline outline-1 outline-primary'
          : 'bg-card hover:bg-muted/50'
      }`}
      /* ✓ · bolinha · identidade · contexto (elástico) · valor 96px · situação 110px */
      style={{ gridTemplateColumns: '10px 7px minmax(0,auto) minmax(0,1fr) 96px 110px' }}
    >
      {/* ⚠ A COLUNA EXISTE SEMPRE, COM OU SEM ✓ — item B. Se ela nascesse só na linha
          revisada, o texto de todas as outras andaria 10px para a esquerda e a lista
          pareceria desalinhada a cada gravação. Espaço reservado é o que faz a marca
          aparecer sem mover nada.
          ⚠ A DATA NÃO MORA NA LINHA desde o 133b-b: ela é a faixa do grupo, logo acima.
          "À esquerda da data" virou, então, a primeira coluna da linha — antes da bolinha,
          que continua onde estava. */}
      <span className={`text-[10px] leading-none ${revisada ? 'text-emerald-600 dark:text-emerald-400' : 'text-transparent'}`}
        aria-hidden={!revisada}
        title={revisada ? 'Revisada.' : undefined}>
        {revisada ? '✓' : ''}
      </span>
      {/* ⚠ TRÊS ESTADOS, NESTA PRECEDÊNCIA — 133h item 9: gravada (verde) vence tudo,
          porque é fim de linha; editada-e-não-gravada (âmbar) vem antes de revisada,
          porque é a que ainda pede o gesto; revisada-não-gravada é azul; o resto segue
          a cor do status. Sem o azul, conferir uma linha não deixava rastro. */}
      <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${
        row.aplicado ? 'bg-emerald-500'
        : editadaNaoGravada ? 'bg-amber-500'
        : row.revisadaEm ? 'bg-sky-500'
        : meta.dot}`}
        title={
          row.aplicado ? 'Gravada no lançamento.'
          : editadaNaoGravada ? 'Editada e ainda não gravada no lançamento.'
          : row.revisadaEm ? 'Revisada — ainda não gravada.'
          : meta.label} />

      {/* ⚠ A IDENTIDADE NÃO CEDE PRIMEIRO: `minmax(0,auto)` a deixa pedir o que precisa e o
          contexto (`1fr`) é quem encolhe. Trocar os dois faria a descrição sumir para caber
          um "casou pelo pagamento de 12/08" que ninguém procura. */}
      <span className="min-w-0 truncate text-[11px] font-medium leading-[1.3]" title={row.descricaoExcel}>
        {row.descricaoExcel}
      </span>

      <span className="min-w-0 truncate text-[10px] leading-[1.3] text-muted-foreground"
        title={row.contexto ?? row.porQue}>
        {row.contexto ?? row.porQue ?? ''}
      </span>

      {/* ⚠ 96px FIXOS — 133b-b: sem largura fixa o valor encosta na descrição e a coluna da
          direita deixa de alinhar entre as linhas, que é justamente o que se confere. */}
      <span className={`truncate text-right text-[11px] font-medium leading-[1.3] tabular-nums ${corValor}`}
        title={row.valor}>
        {sinal}{row.valor}
      </span>

      <span className={`truncate text-right text-[10px] leading-[1.3] ${meta.cls}`} title={meta.label}>
        {meta.label}
      </span>
    </button>
  );
}
