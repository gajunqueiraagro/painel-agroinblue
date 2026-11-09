/**
 * LOTES-03 F1 — o campo Lote do modal do pasto (o MESMO modal do P1). Altura do cabeçalho não muda: o botão mostra o lote do card
 * ("DF-NE-RC-05", "2 lotes", "Sem lote"); o painel tem o lote do PASTO INTEIRO e, abaixo, o lote de cada categoria com cabeça.
 * Seletor com busca (o `SearchableSelect` da casa) + "+ Novo lote", que abre o assistente e volta com o lote escolhido.
 * O lote não grava nada sozinho: entra nos itens e vai no Salvar do modal (`fn_fechamento_pasto_salvar` com `lote_id`).
 */
import { useState } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchableSelect, type OpcaoSearchable } from '@/components/ui/searchable-select';
import { codigoAoLado, nomeNaTela, type LoteDaLista } from '@/lib/lotes/tipos';
import { comLoteEmTodos, comLoteNaCategoria, loteDoCard, rotuloDoLote, type ItemComLote } from '@/lib/lotes/loteDoPasto';

export const ROTULO_NOVO_LOTE = '+ Novo lote';
export const DICA_DO_LOTE = 'O lote é o grupo de animais manejado junto. Ele vai em cada categoria deste pasto e pode estar em mais de um pasto. Cabeças e peso continuam sendo os do fechamento.';

export function opcoesDosLotes(lotes: readonly LoteDaLista[]): OpcaoSearchable[] {
  return lotes.filter(l => l.situacao === 'ativo').map(l => ({
    value: l.id,
    /* LOTES-05: a cria com carimbo aparece como "7.1"; o código vai em cinza ao lado (separa os "7.1" da mesma categoria) e na busca.
     * L1: a cria sem carimbo, "sem carimbo · definir" (o código ao lado) */
    label: nomeNaTela(l),
    sub: [codigoAoLado(l), l.nomeCampeiro].filter(Boolean).join(' · ') || undefined,
    busca: [l.codigo, ...l.codigosAntigos].join(' '),
  }));
}

export function CampoLoteDoPasto<T extends ItemComLote>({ itens, nomeDaCategoria, lotes, disabled, onChange, onNovoLote }: {
  itens: readonly T[];
  nomeDaCategoria: (categoriaId: string) => string;
  lotes: readonly LoteDaLista[];
  disabled?: boolean;
  onChange: (itens: T[]) => void;
  /** abre o assistente; `categoriaId` nulo = o lote novo vai no pasto inteiro */
  onNovoLote: (categoriaId: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const card = loteDoCard(itens);
  const rotulo = rotuloDoLote(card, lotes);
  const opcoes = opcoesDosLotes(lotes);
  const comCabeca = itens.filter(i => i.quantidade > 0);
  const novo = (categoriaId: string | null) => ({ label: ROTULO_NOVO_LOTE, onSelect: () => { setAberto(false); onNovoLote(categoriaId); } });

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} title={rotulo.title} data-testid="campo-lote-do-pasto"
          className="h-7 w-[150px] truncate rounded-md border border-white/15 bg-white/10 px-2 text-left text-xs font-semibold text-white disabled:opacity-50">
          {rotulo.texto}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-2" data-testid="painel-lote-do-pasto">
        <div className="mb-1 flex h-[16px] items-center gap-1 text-[10.5px] font-semibold">
          Lote do pasto inteiro
          <span title={DICA_DO_LOTE} className="text-muted-foreground"><Info className="h-3 w-3" /></span>
        </div>
        <SearchableSelect value={card.tipo === 'um' && card.semLote === 0 ? card.loteId : ''} options={opcoes}
          onValueChange={v => onChange(comLoteEmTodos(itens, v || null))} allLabel="Sem lote" allValue="" acaoFinal={novo(null)}
          placeholder="Buscar lote, código ou nome" disabled={disabled || comCabeca.length === 0} />
        <div className="mb-1 mt-2 h-[16px] text-[10.5px] font-semibold">Por categoria</div>
        {comCabeca.length === 0 ? (
          <div className="h-[22px] text-[10.5px] text-muted-foreground">Lance as cabeças para escolher o lote.</div>
        ) : (
          <div className="flex flex-col gap-1" data-testid="lote-por-categoria">
            {comCabeca.map(i => (
              <div key={i.categoria_id} className="grid grid-cols-[96px_40px_minmax(0,1fr)] items-center gap-1.5">
                <span className="truncate text-[10.5px]" title={nomeDaCategoria(i.categoria_id)}>{nomeDaCategoria(i.categoria_id)}</span>
                <span className="text-right text-[10.5px] tabular-nums">{i.quantidade}</span>
                <SearchableSelect value={i.lote_id ?? ''} options={opcoes} allLabel="Sem lote" allValue="" acaoFinal={novo(i.categoria_id)}
                  onValueChange={v => onChange(comLoteNaCategoria(itens, i.categoria_id, v || null))} placeholder="Buscar lote, código ou nome" disabled={disabled} />
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
