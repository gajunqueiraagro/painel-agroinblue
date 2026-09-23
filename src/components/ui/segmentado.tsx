/**
 * O CONTROLE SEGMENTADO DA CASA — abas e escolhas de duas a quatro opções.
 *
 * ⚠ REGRA PERMANENTE (CLAUDE.md, seção UI): selecionado = preenchimento navy (`bg-primary`, o
 * mesmo do item ativo do menu lateral) + texto branco; não selecionado = fundo transparente +
 * `text-muted-foreground`. Sublinhado, pílula clara, negrito sozinho — nenhum deles marca
 * seleção nesta casa.
 * ⚠ ELE NASCEU DE TRÊS CÓPIAS que já discordavam: o seletor de atividade do cabeçalho do DRE
 * (navy), as abas Resultado|Produção|Histórico (sublinhado) e as abas do `RateioDetalheModal`
 * (a pílula do Radix). Três marcações para a mesma pergunta — "qual está aberta?" — obrigavam o
 * operador a reaprender a resposta em cada tela. Sobreviveu o do cabeçalho do DRE.
 * ⚠ ELE NÃO É UM `Tabs`: não controla conteúdo, só devolve a escolha. Onde o Radix já governa as
 * abas, ele entra no lugar da `TabsList` e o `TabsContent` continua lendo o valor do contexto.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface OpcaoSegmentada<T extends string> {
  valor: T;
  rotulo: ReactNode;
  /** Desligada e visível — diz para onde a tela vai sem fingir que já chegou. */
  desabilitada?: boolean;
  title?: string;
}

export function Segmentado<T extends string>({
  valor, onEscolher, opcoes, altura = 26, fonte, className,
}: {
  valor: T;
  /* ⚠ `NoInfer` AQUI TAMBÉM, e pelo mesmo motivo: um `setState` chega como
     `Dispatch<SetStateAction<T>>`, cujo parâmetro é `T | ((p: T) => T)` — inferir a partir dele
     arrastava a função para dentro de `T`. Quem define `T` é o `valor`, e só ele. */
  onEscolher: (v: NoInfer<T>) => void;
  /**
   * ⚠ `NoInfer` NÃO É DECORAÇÃO: sem ele o TS junta os candidatos de `valor` (a união literal) e
   * de `opcoes` (onde `valor: string` alarga na literal de objeto) e resolve `T` como `string` —
   * aí `onEscolher` passa a pedir `(v: string) => void` e um `setState` tipado não encaixa. Com
   * `NoInfer`, quem decide `T` é só o `valor`, e as opções são CONFERIDAS contra ele. De quebra,
   * uma opção com chave errada vira erro de compilação em vez de um botão que não seleciona.
   */
  opcoes: ReadonlyArray<OpcaoSegmentada<NoInfer<T>>>;
  /** 26 é o padrão (abas e linhas de controle); 22 para as réguas de cabeçalho; 20 dentro de um
      card da faixa, onde ele ocupa o lugar do número (DRE-CASCATA-03b-fix4). */
  altura?: 20 | 22 | 26;
  /** ⚠ 9px SÓ DENTRO DO CARD, e é a exceção declarada do DRE: fora dela o piso da casa é 9,5. */
  fonte?: number;
  className?: string;
}) {
  return (
    /* ⚠ `overflow-hidden` + `rounded-md` NO PAI: é ele que recorta o preenchimento do botão
       selecionado nos cantos. Arredondar o botão faria o navy descolar da borda. */
    <div className={cn('inline-flex shrink-0 overflow-hidden rounded-md border', className)}
      style={{ height: altura }}>
      {opcoes.map(o => {
        const ativa = o.valor === valor;
        return (
          <button key={o.valor} type="button" disabled={o.desabilitada} title={o.title}
            onClick={() => { if (!o.desabilitada) onEscolher(o.valor); }}
            style={fonte ? { fontSize: fonte, paddingLeft: 5, paddingRight: 5 } : undefined}
            className={cn('whitespace-nowrap px-2 text-[10px] font-medium transition-colors',
              ativa
                ? 'bg-primary text-primary-foreground'
                : 'bg-transparent text-muted-foreground hover:bg-muted',
              o.desabilitada && 'cursor-default opacity-50 hover:bg-transparent')}>
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
