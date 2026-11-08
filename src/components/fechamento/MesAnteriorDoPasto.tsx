/**
 * FECH-PASTO-UNIDADE-01 F2 — o mês anterior no topo do modal do pasto COM piquetes (no lugar do "Copiar anterior"): o botão do cabeçalho
 * diz o total ("Mês anterior · set/26 · 215 cab") e abre a tabela SOMADA no pasto, com o piquete e o lote de cada linha; "Usar" por linha
 * e "Usar tudo" copiam para o modo de agora (pasto inteiro ou por piquetes). A altura do modal não muda: a tabela é um painel por cima.
 */
import { useState } from 'react';
import { Copy } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatNum } from '@/lib/calculos/formatters';
import { juntarAbas, cabecasDe, type LinhaDoCard } from '@/lib/fechamento/porPiquetes';

/** "2026-09" → "set/26" */
export function mesCurto(anoMes: string): string {
  const [a, m] = anoMes.split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[Number(m) - 1]}/${a.slice(2)}`;
}

export function MesAnteriorDoPasto({ anoMes, linhas, nomeDoPiquete, nomeDaCategoria, rotuloDoLote, usadas, onUsar, onUsarTudo, disabled, erro, nomeDoPasto }: {
  anoMes: string;
  linhas: readonly LinhaDoCard[];
  nomeDoPiquete: (id: string | null | undefined) => string;
  nomeDaCategoria: (id: string) => string;
  rotuloDoLote: (l: LinhaDoCard) => string;
  /** as linhas já usadas neste modal (o "Usar" não soma duas vezes) */
  usadas: ReadonlySet<number>;
  onUsar: (indice: number) => void;
  onUsarTudo: () => void;
  disabled?: boolean;
  /** a leitura falhou: a frase fica no painel */
  erro?: string | null;
  nomeDoPasto: string;
}) {
  const [aberto, setAberto] = useState(false);
  const cab = cabecasDe(linhas);
  const porPiquetes = linhas.some(l => !!l.piquete_id);
  const soma = juntarAbas(Array.from(new Set(linhas.map(l => l.categoria_id))).map(id => ({ id })), [linhas]);
  const pesoTotal = soma.reduce((s, i) => s + i.quantidade * (i.peso_medio_kg ?? 0), 0);
  const cabComPeso = soma.reduce((s, i) => s + ((i.peso_medio_kg ?? 0) > 0 ? i.quantidade : 0), 0);
  const rotulo = erro ? 'Mês anterior' : `Mês anterior · ${mesCurto(anoMes)} · ${cab > 0 ? `${formatNum(cab, 0)} cab` : 'vazio'}`;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} data-testid="mes-anterior-do-pasto" title={erro ?? rotulo}
          className="flex h-6 items-center gap-1 whitespace-nowrap rounded px-2 text-[10px] text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50">
          <Copy className="h-3 w-3" />{rotulo}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[460px] p-2" data-testid="painel-mes-anterior">
        <div className="mb-1 flex h-[18px] items-center gap-2 whitespace-nowrap text-[10.5px] font-semibold">
          Mês anterior · {mesCurto(anoMes)}
          <span className="font-normal text-muted-foreground">{porPiquetes ? 'lançado por piquetes · somado no pasto' : 'pasto inteiro'}</span>
          {linhas.length > 0 && !erro && (
            <button type="button" className="ml-auto text-[10.5px] font-semibold text-primary hover:underline disabled:opacity-50" disabled={disabled}
              data-testid="usar-tudo" onClick={() => { onUsarTudo(); setAberto(false); }}>Usar tudo</button>
          )}
        </div>
        {erro ? (
          <div className="h-[22px] text-[10.5px] text-red-600">{erro}</div>
        ) : linhas.length === 0 ? (
          <div className="h-[22px] text-[10.5px] text-muted-foreground">Sem animais no mês anterior.</div>
        ) : (
          <table className="w-full table-fixed border-collapse text-[10.5px] tabular-nums" data-testid="tabela-mes-anterior">
            <colgroup><col style={{ width: 62 }} /><col style={{ width: 112 }} /><col /><col style={{ width: 50 }} /><col style={{ width: 58 }} /><col style={{ width: 44 }} /></colgroup>
            <thead>
              <tr className="text-left text-[9.5px] font-medium text-muted-foreground">
                <th className="px-1 font-medium">Piquete</th><th className="px-1 font-medium">Lote</th><th className="px-1 font-medium">Categoria</th>
                <th className="px-1 text-right font-medium">Cab</th><th className="px-1 text-right font-medium">Peso kg</th><th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const lote = rotuloDoLote(l);
                const pq = nomeDoPiquete(l.piquete_id);
                const cat = nomeDaCategoria(l.categoria_id);
                return (
                  <tr key={i} className="h-[19px] border-t border-border/60" data-testid="linha-mes-anterior">
                    <td className="truncate px-1" title={pq}>{pq}</td>
                    <td className="truncate px-1 font-semibold" title={lote}>{lote}</td>
                    <td className="truncate px-1" title={cat}>{cat}</td>
                    <td className="whitespace-nowrap px-1 text-right">{formatNum(l.quantidade, 0)}</td>
                    <td className="whitespace-nowrap px-1 text-right">{l.peso_medio_kg ? formatNum(l.peso_medio_kg, 0) : '—'}</td>
                    <td className="px-1 text-right">
                      <button type="button" className="text-[10px] font-semibold text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                        disabled={disabled || usadas.has(i)} onClick={() => onUsar(i)} data-testid="usar-linha">{usadas.has(i) ? 'Usado' : 'Usar'}</button>
                    </td>
                  </tr>
                );
              })}
              <tr className="h-[19px] border-t border-border font-bold" data-testid="total-mes-anterior">
                <td className="truncate px-1" title={nomeDoPasto}>{nomeDoPasto}</td><td /><td />
                <td className="whitespace-nowrap px-1 text-right">{formatNum(cab, 0)}</td>
                <td className="whitespace-nowrap px-1 text-right">{cabComPeso > 0 ? formatNum(pesoTotal / cabComPeso, 0) : '—'}</td><td />
              </tr>
            </tbody>
          </table>
        )}
      </PopoverContent>
    </Popover>
  );
}
