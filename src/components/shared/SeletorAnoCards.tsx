/**
 * O ANO EM CARDS, LADO A LADO — AGRI-RATEIO-TELA-01.
 *
 * ⚠ CARDS, NÃO LISTA SUSPENSA, e a razão é o gesto: são sete anos, todos visíveis, e trocar
 * de ano é o que mais se faz nesta tela. Um `Select` esconde as opções atrás de um clique e
 * cobra dois gestos por troca — e some com a informação de QUAIS anos existem.
 * ⚠ LARGURA FIXA, E NADA MUDA DE TAMANHO AO TROCAR: "2026" e "2027" ocupam o mesmo espaço, o
 * selecionado muda só de cor. Fita que se reorganiza ao clicar faz o operador perder o lugar.
 * ⚠ O SELECIONADO É VERDE (`success`), não `primary`: aqui o verde diz "é este o ano que
 * estou editando", e o azul do tema já é a cor de botão de ação nesta tela.
 */
import { cn } from '@/lib/utils';

interface Props {
  anos: readonly number[];
  valor: number;
  onChange: (ano: number) => void;
  /** Anos que já têm dado gravado — ganham um ponto, para o vazio se distinguir do salvo. */
  anosComDado?: readonly number[];
  className?: string;
}

export function SeletorAnoCards({ anos, valor, onChange, anosComDado = [], className }: Props) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {anos.map((a) => {
        const marcado = a === valor;
        const temDado = anosComDado.includes(a);
        return (
          <button
            key={a}
            type="button"
            onClick={() => onChange(a)}
            title={temDado ? `${a} — chave já cadastrada` : `${a} — sem chave cadastrada`}
            className={cn(
              'flex w-[58px] shrink-0 flex-col items-center justify-center rounded-md border py-1 text-[11px] font-bold transition-colors',
              marcado
                ? 'border-success bg-success text-success-foreground'
                : 'bg-card hover:bg-muted/60',
            )}
          >
            <span className="tabular-nums leading-none">{a}</span>
            {/* ⚠ O PONTO É DADO, NÃO ENFEITE: sem ele, um ano com chave e um ano vazio são o
                mesmo card, e só se descobre qual é qual clicando um por um. */}
            <span className={cn(
              'mt-0.5 h-1 w-1 rounded-full',
              temDado ? (marcado ? 'bg-success-foreground/70' : 'bg-success') : 'bg-transparent',
            )} />
          </button>
        );
      })}
    </div>
  );
}
