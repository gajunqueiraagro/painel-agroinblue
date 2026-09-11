/**
 * DrillDownEconomico — descer do macro ao lançamento, um degrau por vez.
 * FIN-PAINEL-SAFRA-02 (B1).
 *
 * ⚠ NÃO HAVIA O QUE REUSAR, e o briefing supunha que sim. O `DrillDownMacro` do Finanças tem
 * nome parecido e é outra peça: uma TABELA MENSAL expansível — monta a árvore inteira de uma
 * vez, exibe colunas de meses, expande com chevron, não tem breadcrumb, não chega ao
 * lançamento e é presa a `{ano, meses}` e ao tipo do `useFinanceiro` (outro hook, outro
 * modelo). Medido antes de escrever; está registrado em `drillEconomico.ts`.
 *
 * ⚠ ELE SUBSTITUI A LISTA DIRETA, e é a diferença que o operador pediu: clicar em "Custeio
 * Produção" abrindo 429 lançamentos não é conferência, é despejo. Abrindo os três GRUPOS, a
 * pergunta seguinte é escolhível.
 *
 * ⚠ A NAVEGAÇÃO É ESTADO DESTE COMPONENTE, e é o que faz o item B4 funcionar de graça: abrir
 * o `LancamentoV2Dialog` não desmonta o drawer (o modal é irmão dele), então voltar do modal
 * encontra o mesmo caminho, a mesma ordenação e o mesmo recorte — sem nada ser guardado.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, ArrowDown, ArrowUp } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { TabelaLancamentosCompacta } from '@/components/financeiro-v2/TabelaLancamentosCompacta';
import {
  agruparPorNivel, ordenarNos, ordenarLancamentos, semNivel, ROTULO_NIVEL,
  type ItemDrill, type NivelDrill, type CampoOrdem, type CampoOrdemLanc, type Direcao,
} from '@/lib/analise/drillEconomico';

interface Props<T extends ItemDrill> {
  /** Os itens do balde clicado — já filtrados por lado do caixa e sem tesouraria. */
  itens: T[];
  /** O nome do balde de onde se partiu (a fatia da rosca). Primeiro segmento do caminho. */
  raiz: string;
  /** Os degraus que ainda restam abaixo da raiz, na ordem. */
  niveis: readonly NivelDrill[];
  onAbrirLancamento?: (id: string) => void;
}

export function DrillDownEconomico<T extends ItemDrill>({ itens, raiz, niveis, onAbrirLancamento }: Props<T>) {
  /** O caminho descido: um valor escolhido por degrau. `[]` = na raiz. */
  const [caminho, setCaminho] = useState<string[]>([]);
  const [ordemNo, setOrdemNo] = useState<{ campo: CampoOrdem; direcao: Direcao }>({ campo: 'valor', direcao: 'desc' });
  const [ordemLanc, setOrdemLanc] = useState<{ campo: CampoOrdemLanc; direcao: Direcao }>({ campo: 'data', direcao: 'asc' });

  /* Filtra pelos degraus já escolhidos. Cada passo estreita o conjunto — e é o MESMO conjunto
     que o nível seguinte agrupa, então os filhos sempre somam o pai. */
  const itensDoCaminho = useMemo(() => {
    let atual = itens;
    caminho.forEach((valor, i) => {
      const nivel = niveis[i];
      atual = atual.filter((it) => ((it[nivel] || '').trim() || semNivel(nivel)) === valor);
    });
    return atual;
  }, [itens, caminho, niveis]);

  const nivelAtual: NivelDrill | null = caminho.length < niveis.length ? niveis[caminho.length] : null;

  const filhos = useMemo(() => {
    if (!nivelAtual) return [];
    return ordenarNos(agruparPorNivel(itensDoCaminho, nivelAtual), ordemNo.campo, ordemNo.direcao, semNivel(nivelAtual));
  }, [itensDoCaminho, nivelAtual, ordemNo]);

  const folhas = useMemo(
    () => (nivelAtual ? [] : ordenarLancamentos(itensDoCaminho, ordemLanc.campo, ordemLanc.direcao)),
    [itensDoCaminho, nivelAtual, ordemLanc]);

  const total = useMemo(() => itensDoCaminho.reduce((s, it) => s + Math.abs(it.mov), 0), [itensDoCaminho]);

  /* Clicar na coluna já ativa inverte; clicar em outra começa pelo sentido mais útil dela —
     nome sobe (a-z), valor desce (maior primeiro). É o idioma da lista do Financeiro. */
  const trocarOrdemNo = (campo: CampoOrdem) => setOrdemNo((o) => (
    o.campo === campo ? { campo, direcao: o.direcao === 'asc' ? 'desc' : 'asc' }
      : { campo, direcao: campo === 'nome' ? 'asc' : 'desc' }));
  const trocarOrdemLanc = (campo: CampoOrdemLanc) => setOrdemLanc((o) => (
    o.campo === campo ? { campo, direcao: o.direcao === 'asc' ? 'desc' : 'asc' }
      : { campo, direcao: campo === 'mov' ? 'desc' : 'asc' }));

  const segmentos = [raiz, ...caminho];

  return (
    <div className="space-y-1.5">
      {/* ── CAMINHO — cada segmento sobe até ele; a seta sobe um degrau ── */}
      <div className="flex items-center gap-1 border-b pb-1 text-[10px]">
        {caminho.length > 0 && (
          <button type="button" title="Voltar um nível"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setCaminho((c) => c.slice(0, -1))}>
            <ArrowLeft className="h-3 w-3" />
          </button>
        )}
        <div className="flex flex-wrap items-center gap-0.5">
          {segmentos.map((seg, i) => {
            const ultimo = i === segmentos.length - 1;
            return (
              <span key={`${seg}-${i}`} className="inline-flex items-center gap-0.5">
                {i > 0 && <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/60" />}
                {ultimo ? (
                  <span className="font-medium text-foreground">{seg}</span>
                ) : (
                  /* ⚠ SUBIR É TRUNCAR O CAMINHO, não refazer a navegação: clicar no primeiro
                     segmento com quatro degraus descidos volta direto, sem passar pelos três. */
                  <button type="button" className="text-primary hover:underline"
                    onClick={() => setCaminho((c) => c.slice(0, i))}>{seg}</button>
                )}
              </span>
            );
          })}
        </div>
        <span className="ml-auto whitespace-nowrap tabular-nums text-muted-foreground">
          {itensDoCaminho.length} lanç. · <b className="text-foreground">{formatMoeda(total)}</b>
        </span>
      </div>

      {nivelAtual ? (
        <table className="w-full border-collapse text-[10px]">
          <thead className="sticky top-0 bg-[#1e3a5f]/[0.06]">
            <tr>
              {([['nome', ROTULO_NIVEL[nivelAtual], 'text-left'], ['valor', 'Valor', 'text-right']] as const).map(
                ([campo, rotulo, align], i) => (
                  <th key={campo}
                    className={`cursor-pointer select-none px-1.5 py-1 text-[8px] font-semibold uppercase text-[#1e3a5f] ${align}${i === 0 ? ' border-r border-slate-100' : ''}`}
                    title={`Ordenar por ${rotulo}`}
                    onClick={() => trocarOrdemNo(campo)}>
                    <span className={`inline-flex items-center gap-0.5 ${align === 'text-right' ? 'flex-row-reverse' : ''}`}>
                      {rotulo}
                      {ordemNo.campo === campo && (ordemNo.direcao === 'asc'
                        ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />)}
                    </span>
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {filhos.map((f) => (
              <tr key={f.chave}
                className="cursor-pointer border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03] hover:bg-[#1e3a5f]/[0.06]"
                title={`Abrir ${f.chave}`}
                onClick={() => setCaminho((c) => [...c, f.chave])}>
                <td className="border-r border-slate-100 px-1.5 py-1">
                  <span className="inline-flex items-center gap-1">
                    <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />
                    <span className="font-medium">{f.chave}</span>
                    <span className="text-muted-foreground">· {f.count}</span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-1.5 py-1 text-right tabular-nums">{formatMoeda(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        /* ⚠ O CENTRO SAI DA TABELA AQUI porque ele já é um segmento do caminho acima —
           repeti-lo em toda linha gasta 100px para dizer o que o breadcrumb já disse. */
        <TabelaLancamentosCompacta
          itens={folhas.map((it) => ({
            id: it.id, data: it.data, produto: it.produto, fornecedor: it.fornecedor,
            centro: it.centroPlano, doc: it.doc, mov: it.mov,
          }))}
          mostrarCentro={false}
          ordem={ordemLanc}
          onOrdenar={trocarOrdemLanc}
          onAbrir={onAbrirLancamento}
        />
      )}
    </div>
  );
}
