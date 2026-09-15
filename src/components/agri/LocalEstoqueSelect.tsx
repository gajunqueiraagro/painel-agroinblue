/**
 * LOCAL DE ESTOQUE — o campo, e a REGRA, num lugar só (EL-03, spec 2.3).
 *
 * ⚠⚠ ELE EXISTE PORQUE A REGRA SE REPETE EM QUATRO MODAIS, e regra repetida quatro vezes diverge
 * na primeira correção. Colheita, venda avulsa, venda de barter e quebra fazem a MESMA pergunta —
 * "de onde sai / para onde entra este grão" — e têm de fazê-la com as mesmas palavras e a mesma
 * obrigatoriedade.
 *
 * ⚠ A REGRA, inteira:
 *   0 ou 1 local ativo → o campo NÃO aparece e o payload NÃO manda local. Quem resolve é o banco
 *     (`agri_local_estoque_resolver`, e a trigger `agri_local_estoque_default` como rede). Com um
 *     local só, oferecer a escolha ensinaria que existe um recorte onde não existe.
 *   2 ou mais → o campo aparece, é OBRIGATÓRIO e NASCE VAZIO. Sem default: a spec 2.3 diz que
 *     silêncio grava errado, e um default silencioso é exatamente o silêncio.
 *   registro já gravado → o campo aparece SEMPRE, mesmo com um local, porque ali ele é
 *     informação, não escolha — e some numa tela de leitura seria esconder o que foi decidido.
 *
 * ⚠ O RÓTULO MUDA E O VOCABULÁRIO NÃO: "Local de entrada" na colheita, "Sai de" na venda, "Local"
 * na quebra — nunca "armazém" nem "depósito" (spec 7). A opção diz o tipo junto do nome porque
 * "Próprio" e "Terceiro" mudam quem responde pelo saldo daquele lugar.
 */
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocaisEstoque, type LocalEstoque } from '@/hooks/useEstoqueGraos';
import { rotuloTipoLocal } from '@/lib/agri/locaisEstoque';
import { cn } from '@/lib/utils';

/**
 * A REGRA EM NÚMEROS, para quem precisa dela sem o campo (o `impedimento` do rodapé, o payload).
 *
 * ⚠ `precisaEscolher` É A ÚNICA PERGUNTA QUE OS MODAIS FAZEM. Contar locais em cada um deles
 * deixaria quatro contagens para manter; aqui é uma.
 */
export function useRegraLocalEstoque(clienteId: string | null | undefined) {
  const { locais, carregando } = useLocaisEstoque(clienteId);
  const ativos = locais.filter(l => l.ativo);
  return {
    locais,
    ativos,
    /** 2+ locais ativos: o operador tem de dizer qual. */
    precisaEscolher: ativos.length > 1,
    carregando,
  };
}

/** O nome de um local pelo id — para exibir o gravado em modo leitura. */
export const nomeDoLocal = (locais: readonly LocalEstoque[], id: string | null | undefined) =>
  (id ? (locais.find(l => l.id === id)?.nome ?? '—') : '—');

export function LocalEstoqueSelect({
  clienteId, value, onChange, rotulo, disabled, className, mostrarSempre,
}: {
  clienteId: string | null | undefined;
  value: string;
  onChange: (v: string) => void;
  /** "Local de entrada" | "Sai de" | "Local" — a pergunta daquele modal. */
  rotulo: string;
  disabled?: boolean;
  className?: string;
  /** Registro gravado: o campo aparece mesmo com um local só, como informação. */
  mostrarSempre?: boolean;
}) {
  const { ativos, locais, precisaEscolher } = useRegraLocalEstoque(clienteId);
  if (!precisaEscolher && !mostrarSempre) return null;

  /* ⚠ AS OPÇÕES INCLUEM O LOCAL GRAVADO MESMO INATIVO: desativar um local no cadastro não apaga
     o grão que passou por ele, e um `Select` sem a opção do próprio valor mostraria vazio num
     campo que tem conteúdo. É a mesma regra do `agri_local_estoque_resolver`, que aceita local
     inativo quando informado. */
  const doValor = value ? locais.find(l => l.id === value) : null;
  const opcoes = doValor && !ativos.some(l => l.id === value) ? [...ativos, doValor] : ativos;

  return (
    <div className={className}>
      <Label className="text-[10px]">
        {rotulo} {precisaEscolher && <span className="text-destructive">*</span>}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={cn('mt-0.5 h-8 text-[12px]',
          disabled && 'border-border/60 bg-muted text-muted-foreground')}>
          <SelectValue placeholder="Escolha" />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map(l => (
            <SelectItem key={l.id} value={l.id} className="text-[12px]">
              {l.nome} · {rotuloTipoLocal(l.tipo)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
