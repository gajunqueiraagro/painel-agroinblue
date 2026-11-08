/**
 * CampoCatalogo — LISTAS-DIGITAVEIS-01 (mock aprovado pelo Gabriel 03/11 13:47: ui-validar/listas-digitaveis.html). O campo de uma
 * lista do catálogo (`lista="motivo_morte"`): o `SearchableSelect` da casa com os grupos da semente, a busca pelos apelidos
 * ("curso" acha Diarreia) e o '+ Criar "Texto"' no fim, que passa pelo escritor único (`fn_catalogo_item_criar`). O "Outro (digitar)" saiu.
 *
 * ⚠ O VALOR É A ESCOLHA (`{ itemId, nome }`), NÃO UM TEXTO. Um lançamento ANTIGO tem só o texto gravado (sem item): ele aparece como
 *   está ("Gravado antes"), e nada se troca sozinho — ligar o antigo a um item é o mapeamento com prévia (PR 3) ou o operador escolhendo.
 * ⚠ A RECUSA FICA NO PAINEL, NUNCA EM TOAST: o parecido ("Usar" / "Criar mesmo assim") e a frase do banco.
 */
import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { SearchableSelect, type FaixaDoCriar, type OpcaoSearchable } from '@/components/ui/searchable-select';
import { useCatalogo, catalogoMudou } from '@/hooks/useCatalogo';
import {
  criarItemDoCatalogo, ESCOLHA_VAZIA, fraseDoCatalogo, itemExato,
  type EscolhaDoCatalogo, type ListaDoCatalogo,
} from '@/lib/catalogo/catalogo';

/** O valor do campo para o texto gravado antes, sem item. Nunca é gravado: escolhê-lo não muda nada. */
export const VALOR_GRAVADO_ANTES = '__gravado_antes__';
export const GRUPO_GRAVADO_ANTES = 'Gravado antes';

interface Props {
  lista: ListaDoCatalogo;
  clienteId: string | null | undefined;
  valor: EscolhaDoCatalogo;
  aoMudar: (e: EscolhaDoCatalogo) => void;
  /** o rótulo do campo vazio */
  vazio?: string;
  /** pendente de preenchimento: a borda vermelha (a mensagem é de quem monta) */
  pendente?: boolean;
  disabled?: boolean;
  dense?: boolean;
  className?: string;
  triggerClassName?: string;
  tabIndex?: number;
}

export function CampoCatalogo({
  lista, clienteId, valor, aoMudar, vazio = 'Escolha ou digite', pendente = false, disabled = false, dense = true,
  className, triggerClassName, tabIndex,
}: Props) {
  const cat = useCatalogo(lista, clienteId);
  const [faixa, setFaixa] = useState<FaixaDoCriar | null>(null);
  /* o item que acabou de nascer ainda não está na lista relida: o escolher o acha aqui */
  const criados = useRef(new Map<string, string>());

  const opcoes = useMemo<OpcaoSearchable[]>(() => {
    const base: OpcaoSearchable[] = cat.itens.map((i) => ({ value: i.id, label: i.nome, grupo: i.grupo, apelidos: i.apelidos }));
    const nome = valor.nome.trim();
    if (valor.itemId && !cat.itens.some((i) => i.id === valor.itemId) && nome) {
      return [{ value: valor.itemId, label: nome, grupo: GRUPO_GRAVADO_ANTES }, ...base];
    }
    if (!valor.itemId && nome) return [{ value: VALOR_GRAVADO_ANTES, label: nome, grupo: GRUPO_GRAVADO_ANTES }, ...base];
    return base;
  }, [cat.itens, valor.itemId, valor.nome]);

  const valorDoCampo = valor.itemId ?? (valor.nome.trim() ? VALOR_GRAVADO_ANTES : '');

  const escolher = (v: string) => {
    setFaixa(null);
    if (v === '') { aoMudar(ESCOLHA_VAZIA); return; }
    if (v === VALOR_GRAVADO_ANTES || v === valor.itemId) return;
    const item = cat.itens.find((i) => i.id === v);
    const nome = item?.nome ?? criados.current.get(v);
    if (nome) aoMudar({ itemId: v, nome });
  };

  const podeCriar = !!clienteId && cat.estado === 'ok';

  return (
    <div className={cn('min-w-0', className)}>
      <SearchableSelect
        value={valorDoCampo}
        onValueChange={escolher}
        options={opcoes}
        semTodos
        allValue=""
        allLabel={cat.estado === 'carregando' && !valorDoCampo ? 'Carregando…' : vazio}
        placeholder="Digite para buscar ou criar…"
        disabled={disabled}
        dense={dense}
        tabIndex={tabIndex}
        triggerClassName={cn(triggerClassName, pendente && 'border-destructive')}
        criarComTexto={podeCriar ? {
          frase: fraseDoCatalogo,
          jaExiste: (t) => !!itemExato(cat.itens, t),
          aoCriar: async (texto, mesmoAssim) => {
            if (!clienteId) return null;
            const r = await criarItemDoCatalogo(lista, clienteId, texto, mesmoAssim);
            if (r.tipo === 'item') {
              criados.current.set(r.item.id, r.item.nome);
              setFaixa(null);
              catalogoMudou(lista, clienteId);
              return r.item.id;
            }
            if (r.tipo === 'parecido') {
              setFaixa({
                texto, mensagem: `Já existe parecido com "${r.nome || fraseDoCatalogo(texto)}":`, mesmoAssim: true,
                opcoes: r.parecidos.map((p) => ({ value: p.id, label: p.nome })),
              });
              return null;
            }
            setFaixa({ texto, mensagem: r.mensagem, opcoes: [], mesmoAssim: false });
            return null;
          },
          faixa,
        } : undefined}
      />
      {cat.estado === 'erro' && (
        <p className="mt-[3px] text-[10px] text-destructive" data-testid="catalogo-erro">
          {cat.mensagem}{' '}
          <button type="button" className="underline underline-offset-2" onClick={cat.tentarDeNovo}>Tentar de novo</button>
        </p>
      )}
    </div>
  );
}
