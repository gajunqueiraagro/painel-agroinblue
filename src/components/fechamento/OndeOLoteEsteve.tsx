/**
 * FECH-ROTACAO-01 · FATIA 3 — "Onde o lote esteve" no modal do pasto do Fechamento (decisões 2, 3 e 5).
 *
 * O botão mora no RODAPÉ do modal (o modal tem altura fixa e a grade das categorias já está no limite: um bloco a mais embaixo dos
 * itens a espremeria). Ele diz onde o lote do card fica ("Lote no grupo P10 inteiro · 64,30 ha") e abre o quadro de escolha:
 *  · pasto num grupo: ◉ no grupo inteiro (o padrão — gravado no salvar, F3-2) ○ em parte do grupo (caixas; o próprio fica marcado);
 *  · qualquer pasto: "Também esteve em" (rotação avulsa, sem datas): outros pastos vigentes da fazenda;
 *  · no grupo, vedado ou fechado no mês não recebe lote (decisão 4): aparece apagado, com o porquê;
 *  · ROTACAO-LISTA-01 (Gabriel 08/11): "Também esteve em" lista TODOS os pastos vigentes do mês, sem filtro por situação. O escolhido vedado
 *    passa à atividade deste pasto naquele mês e o fechado reabre, no MESMO salvar (o banco faz, `fn_fechamento_pasto_salvar_com_alocacao`);
 *    o texto curto ao lado do nome diz antes ("vedado · passa a Cria ao salvar", "fechado · reabre ao salvar").
 * A linha de efeito mostra a lotação que o lote passa a ter (UA do card ÷ Σ das áreas), antes de gravar. Quem grava é o Salvar do modal.
 */
import { useMemo, useState } from 'react';
import { Info, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { BlocoFormulario, CorpoFormulario } from '@/components/ui/bloco-formulario';
import { formatarAreaBR } from '@/lib/areaBR';
import { formatNum } from '@/lib/calculos/formatters';
import { grupoInteiro, somaDasAreas, type PastoDoLote } from '@/lib/fechamento/loteNoGrupo';

export interface ContextoDoLote {
  /** o pasto do card, com a área do mês */
  proprio: PastoDoLote;
  nomeDoGrupo: string | null;
  /** os membros do grupo vigentes no mês, com o próprio pasto (vazio = pasto sem grupo) */
  membros: PastoDoLote[];
  /** os outros pastos vigentes da fazenda (para "também esteve em") */
  outrosPastos: PastoDoLote[];
  /** quem não pode receber lote no mês, e por quê */
  impedidos: ReadonlyMap<string, 'vedado' | 'fechado'>;
  /** a alocação gravada do card (null = nenhuma) */
  gravada: string[] | null;
}

/** O que o modal começa mostrando: o gravado; sem gravado, o grupo inteiro (F3-2) ou só o próprio pasto. */
export function escolhaInicial(pastoId: string, c: ContextoDoLote): string[] {
  if (c.gravada && c.gravada.length > 0) return [pastoId, ...c.gravada.filter((id) => id !== pastoId)];
  return c.membros.length > 1 ? grupoInteiro(pastoId, c.membros, new Set(c.impedidos.keys())) : [pastoId];
}

const ADICIONAR = '__adicionar__';
const MOTIVO: Record<'vedado' | 'fechado', string> = { vedado: 'vedado no mês', fechado: 'fechado no mês' };

/** ROTACAO-LISTA-01 — o texto inteiro da dica de "Também esteve em" (no ⓘ; na linha fica só "rotação no mês") */
export const DICA_DA_ROTACAO = 'Rotação no mês, sem datas: a lotação divide pela área dos pastos.';

/** ROTACAO-LISTA-01 — o que acontece ao salvar com o pasto escolhido em "Também esteve em" (nada, se ele está livre) */
export function notaDoDestino(impedido: 'vedado' | 'fechado' | undefined, atividade: string): string | null {
  if (impedido === 'vedado') return `vedado · passa a ${atividade} ao salvar`;
  if (impedido === 'fechado') return 'fechado · reabre ao salvar';
  return null;
}

export function OndeOLoteEsteve({ pasto, contexto, escolhidos, onChange, uaDoCard, disabled, atividadeDoMes = 'a atividade deste pasto' }: {
  pasto: PastoDoLote;
  contexto: ContextoDoLote;
  escolhidos: readonly string[];
  onChange: (ids: string[]) => void;
  uaDoCard: number;
  disabled?: boolean;
  /** ROTACAO-LISTA-01 — a atividade do mês deste pasto ("Cria"): o vedado escolhido passa a ela ao salvar */
  atividadeDoMes?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const temGrupo = contexto.membros.length > 1;
  const idsDoGrupo = useMemo(() => new Set(contexto.membros.map((m) => m.id)), [contexto.membros]);
  const inteiro = useMemo(() => grupoInteiro(pasto.id, contexto.membros, new Set(contexto.impedidos.keys())), [pasto.id, contexto]);
  const porId = useMemo(() => new Map([...contexto.membros, ...contexto.outrosPastos, pasto].map((p) => [p.id, p])), [contexto, pasto]);

  const doGrupo = escolhidos.filter((id) => idsDoGrupo.has(id) || id === pasto.id);
  const extras = escolhidos.filter((id) => !idsDoGrupo.has(id) && id !== pasto.id);
  const ehInteiro = temGrupo && inteiro.every((id) => doGrupo.includes(id)) && doGrupo.length === inteiro.length;
  const pastos = escolhidos.flatMap((id) => { const p = porId.get(id); return p ? [p] : []; });
  const area = somaDasAreas(pastos);
  const areaSo = somaDasAreas([pasto]);

  const resumo = escolhidos.length <= 1
    ? 'Lote só neste pasto'
    : ehInteiro && extras.length === 0
      ? `Lote no grupo ${contexto.nomeDoGrupo ?? ''} inteiro · ${formatarAreaBR(area) || '—'} ha`
      : `Lote em ${escolhidos.length} pastos · ${formatarAreaBR(area) || '—'} ha`;

  const marcar = (id: string, sim: boolean) => onChange(sim ? [...escolhidos, id] : escolhidos.filter((x) => x !== id));
  const nota = (id: string) => notaDoDestino(contexto.impedidos.get(id), atividadeDoMes);
  const opcoesExtras = contexto.outrosPastos
    .filter((p) => !escolhidos.includes(p.id))
    .map((p) => ({ value: p.id, label: p.nome,
      hint: [formatarAreaBR(p.area) ? `${formatarAreaBR(p.area)} ha` : null, nota(p.id)].filter(Boolean).join(' · ') || undefined }));
  const nomes = (ids: readonly string[]) => ids.map((id) => porId.get(id)?.nome ?? '').filter(Boolean).join(', ');

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 max-w-[260px] gap-1 px-2 text-[11px]" disabled={disabled} data-testid="lote-onde" title={resumo}>
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="uma-linha-que-rola min-w-0">{resumo}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[380px] p-0" data-testid="lote-quadro">
        <CorpoFormulario className="rounded-md">
          {temGrupo && (
            <BlocoFormulario titulo={`Grupo ${contexto.nomeDoGrupo ?? ''}`} dica="a lotação do lote divide pela soma das áreas">
              <RadioGroup value={ehInteiro ? 'inteiro' : 'parte'} className="gap-1"
                onValueChange={(v) => onChange(v === 'inteiro' ? [...inteiro, ...extras] : [pasto.id, ...extras])}>
                <label className="flex items-center gap-2 text-[11px]">
                  <RadioGroupItem value="inteiro" data-testid="lote-grupo-inteiro" />
                  <span className="min-w-0">No grupo inteiro <span className="text-muted-foreground">({nomes(inteiro)} · {formatarAreaBR(somaDasAreas(inteiro.flatMap((id) => { const p = porId.get(id); return p ? [p] : []; }))) || '—'} ha)</span></span>
                </label>
                <label className="flex items-center gap-2 text-[11px]">
                  <RadioGroupItem value="parte" data-testid="lote-grupo-parte" />
                  <span>Em parte do grupo</span>
                </label>
              </RadioGroup>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 pl-5" data-testid="lote-membros">
                {contexto.membros.map((m) => {
                  const proprio = m.id === pasto.id;
                  const impedido = contexto.impedidos.get(m.id);
                  return (
                    <label key={m.id} className={`flex min-w-0 items-center gap-1.5 text-[11px] ${impedido ? 'text-muted-foreground' : ''}`} title={m.nome}>
                      <Checkbox checked={proprio || escolhidos.includes(m.id)} disabled={proprio || !!impedido}
                        onCheckedChange={(v) => marcar(m.id, v === true)} data-testid="lote-membro" />
                      <span className="uma-linha-que-rola min-w-0">{m.nome}{impedido ? ` · ${MOTIVO[impedido]}` : proprio ? ' · este' : ''}</span>
                    </label>
                  );
                })}
              </div>
            </BlocoFormulario>
          )}
          {/* ROTACAO-LISTA-01 (Gabriel 08/11): a dica inteira cortava no quadro de 380px — fica "rotação no mês" e o resto no ⓘ */}
          <BlocoFormulario titulo="Também esteve em" dica="rotação no mês"
            acao={<span title={DICA_DA_ROTACAO} aria-label={DICA_DA_ROTACAO} className="text-muted-foreground" data-testid="dica-da-rotacao"><Info className="h-3 w-3" /></span>}>
            <SearchableSelect value={ADICIONAR} allValue={ADICIONAR} semTodos placeholder="Buscar pasto"
              allLabel={opcoesExtras.length ? 'Adicionar pasto' : 'Nenhum outro pasto pode receber'}
              onValueChange={(v) => { if (v && v !== ADICIONAR) onChange([...escolhidos, v]); }}
              options={opcoesExtras} disabled={opcoesExtras.length === 0} triggerClassName="h-7 text-[11px]" />
            {/* a linha das chips reserva o lugar SEMPRE (uma linha, rola no lugar): pôr ou tirar um pasto não muda a altura do quadro,
                que abre para CIMA e moveria tudo (gate de deslocamento) */}
            <div className="mt-1 flex h-[18px] flex-nowrap gap-1 overflow-x-auto" data-testid="lote-extras">
                {extras.map((id) => (
                  <span key={id} className="inline-flex shrink-0 items-center gap-1 rounded border bg-muted px-1.5 text-[10px]" data-testid="lote-extra"
                    title={[porId.get(id)?.nome, nota(id)].filter(Boolean).join(' · ')}>
                    <span className="uma-linha-que-rola min-w-0">{porId.get(id)?.nome}{nota(id) ? ` · ${nota(id)}` : ''}</span>
                    <button type="button" className="text-muted-foreground hover:text-destructive" title={`Tirar ${porId.get(id)?.nome ?? ''}`} onClick={() => marcar(id, false)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              {extras.length === 0 && <span className="text-[10px] leading-[18px] text-muted-foreground">Nenhum outro pasto no mês.</span>}
            </div>
          </BlocoFormulario>
          <BlocoFormulario titulo="Efeito" testId="lote-efeito">
            {/* 2 linhas de altura FIXA: a frase muda de tamanho com a escolha e não pode mudar a altura do quadro */}
            <p className="h-[30px] overflow-hidden text-[11px] leading-[15px]" data-testid="lote-efeito-frase">
              {escolhidos.length <= 1
                ? (areaSo && uaDoCard > 0 ? `O lote fica só neste pasto: ${formatNum(uaDoCard / areaSo, 2)} UA/ha.` : 'O lote fica só neste pasto.')
                : area && uaDoCard > 0
                  ? `O lote fica em ${escolhidos.length} pastos, ${formatarAreaBR(area)} ha: ${formatNum(uaDoCard / area, 2)} UA/ha em cada${areaSo ? ` (só neste pasto: ${formatNum(uaDoCard / areaSo, 2)} UA/ha)` : ''}.`
                  : `O lote fica em ${escolhidos.length} pastos, ${formatarAreaBR(area) || '—'} ha.`}
            </p>
          </BlocoFormulario>
        </CorpoFormulario>
      </PopoverContent>
    </Popover>
  );
}
