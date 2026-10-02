/**
 * O PAINEL POR CONTA do Enriquecer v2 — PR-CONC-ENRIQUECER-V2-01, quadro 1 do mock (artifact ARVdH5WxqNSPJ6jQ7nuiuf v9).
 *
 * Cabeçalho navy com o seletor de sessão, seis números, a barra (filtro + botões) e a TABELA DE CONTAS: uma linha de
 * 20px por conta, com o Total no pé. Nada aqui calcula — os números vêm prontos de `montarPainelContas`/`totalPainel`
 * (`painelContas.ts`), e o Total é a SOMA das linhas.
 *
 * ⚠ LAYOUT FIXO (regra soberana, a5cab3c8/e1bafcb7): `table-layout: fixed` + colgroup medido; cabeçalho e Total
 *   CONGELADOS, só o corpo rola; nada quebra (`whitespace-nowrap` e largura que cabe o pior texto); zero em cinza.
 * ⚠ O SLOT DE AVISO É FIXO (18px) e sempre presente: a sessão mais nova do mês e as linhas sem conta disputam o MESMO
 *   lugar, juntos, com o texto inteiro no `title`.
 */
import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmentado } from '@/components/ui/segmentado';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  filtrarPainel, totalPainel, type FiltroPainel, type LinhaPainelConta,
} from '@/v2/lib/mesa/painelContas';

/**
 * O COLGROUP — medido no navegador pelo pior texto renderizado + 8 de folga + padding (régua do CLAUDE.md). A Conta é
 * a coluna elástica: ela cede, e o nome inteiro fica no `title`.
 */
export const COLUNAS_PAINEL: ReadonlyArray<{ chave: string; titulo: string; largura: string | null }> = [
  { chave: 'conta', titulo: 'Conta', largura: null },
  /* medido em 01/10 na janela de 1135 (o pior texto é o cabeçalho, a 9,5px): Linhas 30, Andamento 70, Gravadas 43,
     Prontas 35, Decide 32, Sem banco 51, Fora plan. 45, R$ prontos 57 (o valor de 7 dígitos, "1.234.567,89", ~62),
     ações 176 ("Extrato da planilha" + "Revisar 74"; "Revisar 999" +5). Conta: "Cartão BB - Ourocard Visa" 128 → sobra
     159 na de 1135. */
  { chave: 'linhas', titulo: 'Linhas', largura: '52px' },
  { chave: 'andamento', titulo: 'Andamento', largura: '92px' },
  { chave: 'gravadas', titulo: 'Gravadas', largura: '65px' },
  { chave: 'prontas', titulo: 'Prontas', largura: '57px' },
  { chave: 'decide', titulo: 'Decide', largura: '54px' },
  { chave: 'semBanco', titulo: 'Sem banco', largura: '73px' },
  { chave: 'foraPlan', titulo: 'Fora plan.', largura: '67px' },
  { chave: 'valorProntas', titulo: 'R$ prontos', largura: '88px' },
  { chave: 'acoes', titulo: '', largura: '196px' },
];
export const ALTURA_LINHA_PAINEL = '20px';

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** O número da célula: zero em cinza, nunca em branco — zero é valor real (sentinelas do CLAUDE.md). */
function Num({ n, cor }: { n: number; cor?: string }) {
  return <span className={n === 0 ? 'text-muted-foreground/60' : (cor ?? '')}>{n}</span>;
}

/** A barra de andamento: verde gravadas · âmbar prontas · vermelho você decide · cinza sem banco (e o resto). */
export function BarraAndamento({ l }: { l: Pick<LinhaPainelConta, 'linhas' | 'gravadas' | 'prontas' | 'decide' | 'semBanco' | 'aguarda' | 'outras'> }) {
  const pct = (n: number) => (l.linhas > 0 ? `${(100 * n) / l.linhas}%` : '0%');
  const titulo = `${l.gravadas} gravadas · ${l.prontas} prontas · ${l.decide} você decide · ${l.semBanco + l.outras} sem banco`
    + (l.aguarda > 0 ? ` · ${l.aguarda} aguardam agrupamento` : '');
  return (
    <div data-testid="barra-andamento" title={titulo} className="flex h-[6px] w-full overflow-hidden rounded-full bg-muted">
      <span data-segmento="gravadas" className="h-full bg-emerald-500" style={{ width: pct(l.gravadas) }} />
      <span data-segmento="prontas" className="h-full bg-amber-400" style={{ width: pct(l.prontas) }} />
      <span data-segmento="decide" className="h-full bg-red-500" style={{ width: pct(l.decide) }} />
      <span data-segmento="semBanco" className="h-full bg-slate-400" style={{ width: pct(l.semBanco + l.outras) }} />
      {/* PR-CONC-ENRIQ-AGRUP-2a — resolvido como grupo, sem gravação até o 2b: não é pronta nem feita */}
      <span data-segmento="aguarda" className="h-full bg-violet-400" style={{ width: pct(l.aguarda) }} />
    </div>
  );
}

export interface PainelContasEnriquecerProps {
  /** "set/2026" e o nome do cliente, para o cabeçalho navy. */
  mesRotulo: string;
  clienteNome: string;
  /** O seletor de sessão (o mesmo menu da tela — com "(mais recente)" e a lixeira), montado por quem é dono dela. */
  seletorSessao: ReactNode;
  linhas: readonly LinhaPainelConta[];
  /** As contas sem OFX levam o mês no selo: "falta OFX set/26" (mm/aa por extenso curto). */
  mesCurto: string;
  filtro: FiltroPainel;
  onFiltro: (f: FiltroPainel) => void;
  /** "1 · Planilha e de-para N" — `null` quando a planilha não foi lida nesta sessão do navegador (sem N). */
  pendentesDePara: number | null;
  onPlanilha?: () => void;
  onExtrato: (contaId: string | null) => void;
  onRevisar: (contaId: string) => void;
  /** O "Gravar N" da tela — o MESMO número da fila do lote (`linhasDoLote`). */
  gravarN: number;
  gravando: boolean;
  gravarRotulo?: string;
  onGravar: () => void;
  /** Clicar no card "No sistema, fora da planilha". */
  onForaPlanilha?: () => void;
  /** Os gestos que não têm lugar fixo na barra (recasar, importar, transferências, CSV). */
  menu: ReadonlyArray<{ rotulo: string; onClick: () => void; desabilitado?: boolean; title?: string }>;
  avisos: ReadonlyArray<{ id: string; conteudo: ReactNode; texto: string; cls: string }>;
  carregando?: boolean;
}

export function PainelContasEnriquecer({
  mesRotulo, clienteNome, seletorSessao, linhas, mesCurto, filtro, onFiltro, pendentesDePara, onPlanilha,
  onExtrato, onRevisar, gravarN, gravando, gravarRotulo, onGravar, onForaPlanilha, menu, avisos, carregando,
}: PainelContasEnriquecerProps) {
  const total = totalPainel(linhas);
  const visiveis = filtrarPainel(linhas, filtro);
  const nPendentes = linhas.filter((l) => !l.concluida).length;
  const nConcluidas = linhas.length - nPendentes;

  const kpis: Array<{ id: string; rotulo: string; n: number; cor: string; onClick?: () => void; title?: string }> = [
    { id: 'linhas', rotulo: 'Linhas da planilha', n: total.linhas, cor: '' },
    { id: 'gravadas', rotulo: 'Já gravadas', n: total.gravadas, cor: 'text-emerald-700 dark:text-emerald-400' },
    { id: 'prontas', rotulo: 'Prontas para gravar', n: total.prontas, cor: 'text-amber-700 dark:text-amber-400' },
    { id: 'decide', rotulo: 'Você decide', n: total.decide, cor: 'text-red-700 dark:text-red-400' },
    { id: 'semBanco', rotulo: 'Sem par no banco', n: total.semBanco, cor: 'text-slate-600 dark:text-slate-300' },
    { id: 'foraPlanilha', rotulo: 'No sistema, fora da planilha', n: total.foraPlanilha, cor: 'text-slate-600 dark:text-slate-300',
      onClick: onForaPlanilha, title: 'Lançamentos realizados do mês, nas contas da planilha, que nenhuma linha dela explica — clique para ver.' },
  ];

  return (
    <div data-testid="painel-contas" className="flex min-h-0 flex-1 flex-col gap-1">
      {/* ═══ CABEÇALHO NAVY ═══════════════════════════════════════════════════ */}
      <div className="flex h-8 shrink-0 items-center gap-2 rounded-md bg-primary px-2.5 text-primary-foreground">
        <span className="shrink-0 whitespace-nowrap text-[12px] font-medium">Enriquecer · {mesRotulo} · {clienteNome}</span>
        <div className="flex min-w-0 flex-1 justify-end">{seletorSessao}</div>
      </div>

      {/* ═══ SEIS NÚMEROS ═════════════════════════════════════════════════════ */}
      <div className="grid shrink-0 grid-cols-6 gap-1">
        {kpis.map((k) => {
          const corpo = (
            <>
              {/* ⚠ NADA COM "…": o rótulo que não cabe QUEBRA em duas linhas (regra da reticência); o número fica à direita */}
              <span className="min-w-0 flex-1 text-[10px] leading-[12px] text-muted-foreground">{k.rotulo}</span>
              <span className={`shrink-0 text-[20px] font-medium leading-none tabular-nums ${k.n === 0 ? 'text-muted-foreground/60' : k.cor}`}>{k.n}</span>
            </>
          );
          return k.onClick ? (
            <button key={k.id} type="button" data-testid={`kpi-${k.id}`} title={k.title} onClick={k.onClick}
              className="flex h-9 min-w-0 items-center gap-1.5 rounded-md border bg-card px-2 text-left hover:bg-muted/50">{corpo}</button>
          ) : (
            <div key={k.id} data-testid={`kpi-${k.id}`} className="flex h-9 min-w-0 items-center gap-1.5 rounded-md border bg-card px-2">{corpo}</div>
          );
        })}
      </div>

      {/* ═══ BARRA ════════════════════════════════════════════════════════════ */}
      <div className="flex h-8 shrink-0 flex-nowrap items-center gap-1.5 overflow-hidden rounded-md border bg-card px-2">
        <Segmentado<FiltroPainel> valor={filtro} onEscolher={onFiltro} altura={22} opcoes={[
          { valor: 'todas', rotulo: `Todas ${linhas.length}` },
          { valor: 'pendentes', rotulo: `Com pendência ${nPendentes}` },
          { valor: 'concluidas', rotulo: `Concluídas ${nConcluidas}` },
        ]} />
        <div className="flex-1" />
        {onPlanilha && (
          <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 whitespace-nowrap px-2 text-[10px]"
            data-testid="botao-planilha" onClick={onPlanilha}
            title="Voltar à planilha e ao de-para (passo 1).">
            1 · Planilha e de-para{pendentesDePara !== null ? ` ${pendentesDePara}` : ''}
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 whitespace-nowrap px-2 text-[10px]"
          data-testid="botao-extrato-todas" disabled={linhas.length === 0} onClick={() => onExtrato(null)}>
          Extrato da planilha · todas
        </Button>
        <Button type="button" size="sm" className="h-6 shrink-0 whitespace-nowrap px-2 text-[10px]"
          data-testid="botao-gravar" disabled={gravarN === 0 || gravando}
          title={gravarN === 0 ? 'Nada pronto para gravar.' : `Aplica ${gravarN} linha(s) uma a uma, com progresso. Nada é criado.`}
          onClick={onGravar}>
          {gravarRotulo ?? `Gravar ${gravarN} prontas`}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="ghost" className="h-6 w-6 shrink-0 p-0" aria-label="Mais ações" data-testid="menu-painel">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[220px]">
            {menu.map((m) => (
              <DropdownMenuItem key={m.rotulo}  disabled={m.desabilitado} title={m.title}
                onSelect={() => m.onClick()}>
                {m.rotulo}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ═══ SLOT DE AVISO — fixo, sempre presente ════════════════════════════ */}
      <div data-testid="slot-aviso-painel" title={avisos.map((a) => a.texto).join(' · ') || undefined}
        className="flex h-[18px] shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap px-1 text-[10px]">
        {avisos.length === 0 ? (
          <span className="text-muted-foreground">
            {carregando ? 'Carregando…' : 'Escolha a conta: o Extrato da planilha confere; Revisar abre a Mesa nas linhas que pedem você.'}
          </span>
        ) : avisos.map((a) => (
          <span key={a.id} data-testid={a.id} className={`flex min-w-0 shrink items-center gap-1 ${a.cls}`}>{a.conteudo}</span>
        ))}
      </div>

      {/* ═══ TABELA DE CONTAS — o único scrollport ════════════════════════════ */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-card md:flex-1">
        <table data-testid="tabela-contas" className="w-full table-fixed border-collapse text-[10px] tabular-nums">
          <colgroup>
            {COLUNAS_PAINEL.map((c) => (
              <col key={c.chave} data-testid={`col-${c.chave}`} style={c.largura ? { width: c.largura } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ height: ALTURA_LINHA_PAINEL }}>
              {COLUNAS_PAINEL.map((c, i) => (
                <th key={c.chave}
                  className={`sticky top-0 z-[2] whitespace-nowrap bg-primary px-[7px] text-center text-[9.5px] font-medium text-primary-foreground ${
                    i === 2 || i === 8 ? 'border-l border-primary-foreground/30' : ''}`}>
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr style={{ height: ALTURA_LINHA_PAINEL }}>
                <td colSpan={COLUNAS_PAINEL.length} className="px-2 text-center text-muted-foreground">
                  {linhas.length === 0 ? (carregando ? 'Carregando…' : 'Nenhuma linha nesta importação.') : 'Nenhuma conta neste filtro.'}
                </td>
              </tr>
            ) : visiveis.map((l) => (
              <tr key={l.contaId} data-testid={`conta-${l.contaId}`} style={{ height: ALTURA_LINHA_PAINEL }}
                className={`border-b border-border/50 ${l.concluida ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : ''}`}>
                <td className="overflow-hidden text-ellipsis whitespace-nowrap px-[7px] font-medium" title={l.nome}>{l.nome}</td>
                <td className="whitespace-nowrap px-[7px] text-right"><Num n={l.linhas} /></td>
                <td className="border-l px-[7px]"><BarraAndamento l={l} /></td>
                <td className="whitespace-nowrap px-[7px] text-right"><Num n={l.gravadas} cor="text-emerald-700 dark:text-emerald-400" /></td>
                <td className="whitespace-nowrap px-[7px] text-right"><Num n={l.prontas} cor="text-amber-700 dark:text-amber-400" /></td>
                <td className="whitespace-nowrap px-[7px] text-right"><Num n={l.decide} cor="text-red-700 dark:text-red-400" /></td>
                <td className="whitespace-nowrap px-[7px] text-right"><Num n={l.semBanco} /></td>
                <td className="whitespace-nowrap px-[7px] text-right"><Num n={l.foraPlanilha} /></td>
                <td className="whitespace-nowrap border-l px-[7px] text-right">
                  {l.valorProntas === 0 ? <span className="text-muted-foreground/60">0,00</span> : fmtBRL(l.valorProntas)}
                </td>
                <td className="whitespace-nowrap px-[5px]">
                  <div className="flex items-center justify-end gap-1">
                    {l.concluida ? (
                      <span data-testid="concluida" className="text-emerald-700 dark:text-emerald-400">concluída ✓</span>
                    ) : (
                      <>
                        {/* ⚠ SEM OFX NO MÊS, O SELO NO LUGAR DO EXTRATO: não há banco para conferir a planilha; a Mesa
                            continua aberta (o "Revisar" fica), porque classificar não depende do OFX. */}
                        {l.contaId === '__sem__' ? (
                          /* linha sem conta não tem lado Sistema para conferir — o caminho é reimportar (aviso no slot) */
                          <span className="text-muted-foreground">sem conta</span>
                        ) : l.faltaOfx === true ? (
                          <span data-testid="falta-ofx" className="font-medium text-red-600 dark:text-red-400">falta OFX {mesCurto}</span>
                        ) : (
                          <button type="button" data-testid="acao-extrato" onClick={() => onExtrato(l.contaId)}
                            className="h-[16px] rounded border px-1.5 text-[9.5px] hover:bg-muted">Extrato da planilha</button>
                        )}
                        <button type="button" data-testid="acao-revisar" disabled={l.revisar === 0}
                          onClick={() => onRevisar(l.contaId)}
                          title={l.revisar === 0 ? 'Nada a revisar: as pendências desta conta são sem par no banco.' : undefined}
                          className="h-[16px] rounded bg-primary px-1.5 text-[9.5px] font-medium text-primary-foreground disabled:opacity-40">
                          Revisar {l.revisar}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-testid="linha-total" style={{ height: ALTURA_LINHA_PAINEL }} className="font-medium">
              <td className="sticky bottom-0 z-[2] whitespace-nowrap border-t bg-muted px-[7px]">Total · {total.contas} contas</td>
              <td className="sticky bottom-0 z-[2] whitespace-nowrap border-t bg-muted px-[7px] text-right"><Num n={total.linhas} /></td>
              <td className="sticky bottom-0 z-[2] border-l border-t bg-muted px-[7px]"><BarraAndamento l={total} /></td>
              <td className="sticky bottom-0 z-[2] whitespace-nowrap border-t bg-muted px-[7px] text-right"><Num n={total.gravadas} cor="text-emerald-700 dark:text-emerald-400" /></td>
              <td className="sticky bottom-0 z-[2] whitespace-nowrap border-t bg-muted px-[7px] text-right"><Num n={total.prontas} cor="text-amber-700 dark:text-amber-400" /></td>
              <td className="sticky bottom-0 z-[2] whitespace-nowrap border-t bg-muted px-[7px] text-right"><Num n={total.decide} cor="text-red-700 dark:text-red-400" /></td>
              <td className="sticky bottom-0 z-[2] whitespace-nowrap border-t bg-muted px-[7px] text-right"><Num n={total.semBanco} /></td>
              <td className="sticky bottom-0 z-[2] whitespace-nowrap border-t bg-muted px-[7px] text-right"><Num n={total.foraPlanilha} /></td>
              <td className="sticky bottom-0 z-[2] whitespace-nowrap border-l border-t bg-muted px-[7px] text-right">
                {total.valorProntas === 0 ? <span className="text-muted-foreground/60">0,00</span> : fmtBRL(total.valorProntas)}
              </td>
              <td className="sticky bottom-0 z-[2] border-t bg-muted px-[7px]" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
