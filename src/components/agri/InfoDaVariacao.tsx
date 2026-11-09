/**
 * O ⓘ DA EXPLICAÇÃO DA VARIAÇÃO — DRE-VARIACAO-EXPLICA-01 fatia 1b.
 *
 * ⚠ REGRA DA TELA (Gabriel 07/11): o texto da tela é curto, uma linha no máximo; a explicação longa mora AQUI, num popover
 * curto em três partes — o que é · por que · como ler. Um componente só para todas as barras, cards e colunas do modal.
 * ⚠ FICA AO LADO DO MODAL (não em `ui/`) de propósito: só a Variação o usa, e um `ui/*` novo obrigaria o gate de tela inteiro.
 */
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface TextoDoInfo { titulo: string; oQue: string; porQue: string; comoLer: string }

export function InfoDaVariacao({ texto, testid }: { texto: TextoDoInfo; testid?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Sobre ${texto.titulo}`} data-testid={testid}
          className="inline-flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
          <Info className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[260px] p-2 text-[10px] leading-[14px]">
        <div className="mb-1 text-[11px] font-semibold">{texto.titulo}</div>
        <div><span className="font-medium">O que é · </span>{texto.oQue}</div>
        <div className="mt-0.5"><span className="font-medium">Por que · </span>{texto.porQue}</div>
        <div className="mt-0.5"><span className="font-medium">Como ler · </span>{texto.comoLer}</div>
      </PopoverContent>
    </Popover>
  );
}

/** Os textos de cada ⓘ — num lugar só, para a tela e o teste lerem os mesmos. `p0` = "dez/AA" da coluna clicada. */
export const textosDoInfo = (p0: string): Record<'ponte' | 'producao' | 'evolucao' | 'mercado' | 'reposicao' | 'quantidade' | 'composicao' | 'v6' | 'v3' | 'v4' | 'cadastro', TextoDoInfo> => ({
  ponte: { titulo: 'De onde veio a variação', oQue: `O valor do rebanho no início e no fim, e as três parcelas que levam de um ao outro.`,
    porQue: 'Separa o que o rebanho produziu do que foi só troca de categoria e do que foi preço.', comoLer: 'As barras somam: a última é a soma das anteriores, ao centavo.' },
  producao: { titulo: 'Produção', oQue: `O que o rebanho ganhou ou perdeu em arrobas, tudo a R$/@ de ${p0}.`,
    porQue: 'É o trabalho do campo, sem preço nenhum mudando.', comoLer: 'Quantidade + Composição (os cards abaixo) = esta barra.' },
  evolucao: { titulo: 'Evolução de categoria', oQue: `As reclassificações do período (desmama → garrote, novilha → vaca) a R$/@ de ${p0}, na categoria de destino.`,
    porQue: 'O mesmo animal muda de preço só por trocar de categoria; isso não é produção.', comoLer: 'Negativo: o gado foi para categorias de R$/@ mais baixo. Está dentro da linha "Variação por produção" do DRE.' },
  mercado: { titulo: 'Mercado', oQue: `O rebanho do fim, do R$/@ de ${p0} para o do fim.`,
    porQue: 'É o preço da arroba mudando, sem o rebanho mudar.', comoLer: 'Linha própria no DRE. "—" quando o fim não tem fechamento validado.' },
  reposicao: { titulo: 'Reposição', oQue: 'O custo das compras de gado do período.',
    porQue: 'Na linha "Variação do estoque" do Resumido ela é descontada: o gado comprado não saiu do rebanho.', comoLer: 'A última barra é a linha da grade.' },
  quantidade: { titulo: 'Quantidade', oQue: `A diferença de arrobas × o R$/@ médio de ${p0}.`,
    porQue: 'Responde: tenho mais ou menos arrobas?', comoLer: 'Positivo: há mais arroba no fim do que no início.' },
  composicao: { titulo: 'Composição', oQue: 'Produção − Quantidade.',
    porQue: 'Responde: o tipo de gado mudou? Mais bezerro (@ cara) e menos vaca muda o valor sem mudar a arroba.', comoLer: 'Já sem a evolução de categoria, que tem barra própria.' },
  v6: { titulo: `Rebanho de ${p0}`, oQue: 'O rebanho do início e quanto mudou até o fim. Jovens = mamotes e desmama (machos e fêmeas); adultos = garrotes, novilhas, bois, vacas e touros.',
    porQue: 'Mostra de onde a arroba saiu ou entrou.', comoLer: 'Participação: quanto da arroba total cada grupo é, no início e no fim.' },
  v3: { titulo: 'Por categoria', oQue: `Cada categoria com a Produção, a Evolução de categoria e o Mercado, a R$/@ de ${p0}.`,
    porQue: 'Mostra quais categorias puxaram a variação.', comoLer: 'Passe o mouse em Evolução para ver as cabeças que entraram e saíram.' },
  v4: { titulo: 'Mês a mês', oQue: `As arrobas do fim de cada mês e o R$/@ médio a preço de ${p0} e a preço do mês.`,
    porQue: 'Mostra quando a variação aconteceu.', comoLer: 'Mês sem fechamento validado: o preço do mês é "—" (ponto vazio).' },
  cadastro: { titulo: 'Fim pelo cadastro', oQue: 'O mês do fim não tem fechamento validado: as cabeças e o peso vêm do cadastro.',
    porQue: 'Sem fechamento não há preço do mês.', comoLer: 'O mercado fica "—"; o DRE não muda.' },
});
