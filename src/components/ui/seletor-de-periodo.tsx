/**
 * UI-PERIODO-01 (Gabriel 04/11/2026, mock ui-validar/periodo.html aprovado 09:33) — o COMPONENTE ÚNICO DE PERÍODO, modelo AgriWebb nas
 * cores do AGROinBLUE (o azul `primary` da casa):
 *   · um gatilho só (24 px, 11 px) com o período escolhido ("out/2026", "2026", "Safra 26/27 · jul/26–jun/27", "01/09/2026 – 15/10/2026");
 *   · o popup: os atalhos no topo (Este mês · Mês passado · Este ano · Último ano · Esta safra · Última safra · Últimos 12 meses ·
 *     Selecionar o ano · Redefinir) e, conforme o `modo`:
 *       `datas` — dois calendários lado a lado (Início | Fim), cada um com ‹ › de mês; 1º clique = início, 2º = fim;
 *       `mes`   — a grade dos 12 meses com ‹ › de ano (telas de UM mês);
 *       `ano`   — a grade dos anos;
 *   · "Aplicar" grava; "Cancelar" (ou Esc, ou clicar fora) deixa como estava.
 * A safra vem do cadastro (`useSafrasDoCliente`), pela atividade da tela; as regras moram em `lib/periodo/intervaloDeDatas.ts`.
 */
import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCliente } from '@/contexts/ClienteContext';
import { useSafrasDoCliente } from '@/hooks/useSafrasDoCliente';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import {
  anosDaGrade, atalhosDoPeriodo, cliqueNoDia, dataCurta, gradeDoMes, intervaloDoAno, intervaloDoMes, MESES_CURTOS, MESES_LONGOS, partes,
  nomePeloAtalho, rotuloDoIntervalo, type AtividadeDaSafra, type Intervalo, type ModoDoPeriodo, type Rascunho,
} from '@/lib/periodo/intervaloDeDatas';

const DIAS_DA_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
/* UI-PERIODO-01b (Gabriel 04/11 18:03) — COMPACTO, no tamanho do modelo AgriWebb: chips de 12 px em uma ou duas linhas; dias de 13 px numa
   casa de 32 × 28 px (largura FIXA: antes a casa esticava até 40 px e o popup ia a 560 × 347); mês/ano em 14 px; rodapé baixo (30 px).
   Os 2 calendários lado a lado: ~480 × 310 px. */
const CHIP = 'inline-flex h-[22px] flex-none items-center whitespace-nowrap rounded-full border px-2 text-[12px] leading-none';
const CHIP_LIGADO = 'border-primary bg-primary text-primary-foreground';
const CHIP_DESLIGADO = 'border-border bg-card hover:bg-muted';
interface MesDoCalendario { ano: number; mes0: number }
/** o mês somado (−1/+1), com a virada de ano */
const somarMes = (m: MesDoCalendario, n: number): MesDoCalendario => {
  const t = m.ano * 12 + m.mes0 + n;
  return { ano: Math.floor(t / 12), mes0: ((t % 12) + 12) % 12 };
};
const BOTAO_NAV = 'inline-flex h-[22px] w-[22px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted';
/* DRE-LAYOUT-04 (Gabriel 09/11) — o calendário COMPACTO (`compacto`, só o DRE por ora): popup de 360 px (era 481), dias de 24 × 20 a 10 px
   (a fonte da régua), atalhos numa linha só (chips de 18 px a 9,5; "Últimos 12 meses" → "12 meses" e "Selecionar o ano" → "Ano…", o
   nome inteiro no `title`), rodapé de 26 px. As outras telas seguem no tamanho do UI-PERIODO-01b. */
const CHIP_C = 'inline-flex h-[18px] flex-none items-center whitespace-nowrap rounded-full border px-[5px] text-[9.5px] leading-none';
const ROTULO_CURTO: Readonly<Record<string, string>> = { 'ultimos-12': '12 meses' };

export interface SeletorDePeriodoProps {
  valor: Intervalo | null;
  onChange: (i: Intervalo) => void;
  modo?: ModoDoPeriodo;
  /** as atividades da tela (os atalhos de safra); vazio = sem atalho de safra */
  atividades?: readonly AtividadeDaSafra[];
  /** o ano mais antigo com dado (a grade de anos começa nele); sem ele, os 5 anteriores */
  anoMaisAntigo?: number | null;
  /** o período do "Redefinir" (o padrão da tela) */
  padrao?: Intervalo;
  /** só para teste e bancada: o "hoje" fixo */
  hoje?: string;
  /** o rótulo do gatilho quando não há período ("Escolher datas" na CPR) */
  rotuloVazio?: string;
  /** telas de dado MENSAL (DRE): o clique no calendário escolhe o mês inteiro */
  porMes?: boolean;
  /** os atalhos que a tela não aceita (a DRE pecuária não tem mês solto: ['este-mes', 'mes-passado']) */
  atalhosOcultos?: readonly string[];
  /** a regra da tela para um atalho (a DRE pecuária: "Este ano" corrente vai até o mês fechado) */
  ajustarAtalho?: (id: string, i: Intervalo) => Intervalo;
  /** DRE-LAYOUT-04 — o popup compacto (360 px, dias de 24 × 20, atalhos numa linha) */
  compacto?: boolean;
  className?: string;
  testid?: string;
}

export function SeletorDePeriodo({
  valor, onChange, modo = 'datas', atividades = [], anoMaisAntigo = null, padrao, hoje: hojeFixo, rotuloVazio, className, testid = 'seletor-de-periodo',
  porMes = false, atalhosOcultos, ajustarAtalho, compacto = false,
}: SeletorDePeriodoProps) {
  const chip = compacto ? CHIP_C : CHIP;
  const hoje = hojeFixo ?? hojeLocal();
  const { clienteAtual } = useCliente();
  const { safras } = useSafrasDoCliente(clienteAtual?.id, atividades);
  const atalhos = useMemo(() => atalhosDoPeriodo({ hoje, modo, safras, atividades })
    .filter((a) => !atalhosOcultos?.includes(a.id))
    .map((a) => (ajustarAtalho ? { ...a, intervalo: ajustarAtalho(a.id, a.intervalo) } : a)), [hoje, modo, safras, atividades, atalhosOcultos, ajustarAtalho]);
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho>({ de: null, ate: null, nome: null });
  const [vista, setVista] = useState<'datas' | 'meses' | 'anos'>(modo === 'ano' ? 'anos' : modo === 'mes' ? 'meses' : 'datas');
  const [mesIni, setMesIni] = useState({ ano: partes(hoje).ano, mes0: partes(hoje).mes0 });
  const [mesFim, setMesFim] = useState(somarMes({ ano: partes(hoje).ano, mes0: partes(hoje).mes0 }, 1));
  const [anoDaGrade, setAnoDaGrade] = useState(partes(hoje).ano);

  /* abre com o período atual no rascunho e os calendários nos meses do início e do fim (o fim nunca no mesmo mês do início) */
  const mostrar = (i: { de: string | null; ate: string | null; nome?: string | null }) => {
    setRascunho({ de: i.de, ate: i.ate, nome: i.nome ?? null });
    const base = partes(i.de ?? hoje);
    setMesIni({ ano: base.ano, mes0: base.mes0 });
    const fim = i.ate ? partes(i.ate) : null;
    setMesFim(fim && (fim.ano !== base.ano || fim.mes0 !== base.mes0) ? { ano: fim.ano, mes0: fim.mes0 } : somarMes({ ano: base.ano, mes0: base.mes0 }, 1));
    setAnoDaGrade(base.ano);
  };
  const abrir = (sim: boolean) => {
    setAberto(sim);
    if (!sim) return;
    mostrar(valor ? { ...valor, nome: nomePeloAtalho(valor, atalhos) } : { de: null, ate: null });
    setVista(modo === 'ano' ? 'anos' : modo === 'mes' ? 'meses' : 'datas');
  };
  const escolherAtalho = (i: Intervalo) => { mostrar(i); if (modo === 'datas') setVista('datas'); };
  const aplicar = () => {
    if (!rascunho.de || !rascunho.ate) return;
    onChange({ de: rascunho.de, ate: rascunho.ate, nome: rascunho.nome });
    setAberto(false);
  };
  const largura = compacto ? 'w-[360px]' : modo === 'datas' ? 'w-[481px]' : 'w-[300px]';
  const gradeDeAnos = (
          <div className="px-2.5 pb-2 pt-2">
            <div className="grid grid-cols-4 gap-1.5">
              {anosDaGrade(hoje, anoMaisAntigo).map((a) => {
                const i = intervaloDoAno(a);
                return (
                  <button key={a} type="button" data-ano={a} onClick={() => (modo === 'datas' ? escolherAtalho(i) : setRascunho({ de: i.de, ate: i.ate, nome: null }))}
                    className={cn('h-[28px] rounded-md border text-[12px] font-semibold', rascunho.de === i.de && rascunho.ate === i.ate ? CHIP_LIGADO : CHIP_DESLIGADO)}>
                    {a}
                  </button>
                );
              })}
            </div>
            {modo === 'datas' && (
              <button type="button" onClick={() => setVista('datas')} className={cn(chip, CHIP_DESLIGADO, 'mt-2')}>‹ Voltar às datas</button>
            )}
          </div>
  );
  const pronto = !!rascunho.de && !!rascunho.ate;

  return (
    <Popover open={aberto} onOpenChange={abrir}>
      <PopoverTrigger asChild>
        <button type="button" data-testid={testid}
          className={cn('inline-flex h-[24px] flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card px-2 text-[11px] font-semibold hover:border-primary/60', className)}>
          <CalendarDays className="h-3 w-3 text-muted-foreground" />
          {valor ? rotuloDoIntervalo({ ...valor, nome: nomePeloAtalho(valor, atalhos) }) : (rotuloVazio ?? 'Escolher período')}
        </button>
      </PopoverTrigger>
      {/* o foco fica no gatilho ao abrir: o contorno de foco no 1º atalho parecia uma escolha. `data-painel-por-cima`: o popup cobre a tela
          DE PROPÓSITO (a exceção declarada do check:ui-cortes) — o que está embaixo dele não está "sob um botão" */}
      <PopoverContent align="start" side="bottom" sideOffset={4} className={cn('p-0', largura)} data-testid={`${testid}-popup`} data-painel-por-cima onOpenAutoFocus={(ev) => ev.preventDefault()}>
        <div className={cn('flex gap-1 border-b border-border', compacto ? 'flex-nowrap gap-[3px] px-1.5 py-1' : 'flex-wrap px-2 py-1.5')}>
          {atalhos.map((a) => (
            <button key={a.id} type="button" title={a.titulo ?? (compacto && ROTULO_CURTO[a.id] ? a.rotulo : undefined)} data-atalho={a.id}
              onClick={() => escolherAtalho(a.intervalo)}
              className={cn(chip, rascunho.de === a.intervalo.de && rascunho.ate === a.intervalo.ate ? CHIP_LIGADO : CHIP_DESLIGADO)}>
              {compacto ? (ROTULO_CURTO[a.id] ?? a.rotulo) : a.rotulo}
            </button>
          ))}
          {modo === 'datas' && (
            <button type="button" data-atalho="selecionar-ano" onClick={() => setVista('anos')} title={compacto ? 'Selecionar o ano' : undefined}
              className={cn(chip, vista === 'anos' ? CHIP_LIGADO : CHIP_DESLIGADO)}>
              {compacto ? 'Ano…' : 'Selecionar o ano'}
            </button>
          )}
          {padrao && (
            <button type="button" data-atalho="redefinir" onClick={() => escolherAtalho(padrao)} className={cn(chip, 'border-dashed border-border text-muted-foreground hover:bg-muted')}>
              Redefinir
            </button>
          )}
        </div>

        {/* no modo datas os calendários ficam SEMPRE montados e a grade de anos abre POR CIMA deles, no mesmo lugar: a altura do popup não
            muda e o Aplicar não pula ("nada pula ao selecionar") */}
        {modo === 'datas' && (
          <div className="relative grid grid-cols-2">
            <CalendarioDoMes titulo="Início" m={mesIni} onMes={setMesIni} rascunho={rascunho} hoje={hoje} onDia={(d) => setRascunho((r) => cliqueNoDia(r, d, porMes))}
              testid={`${testid}-cal-inicio`} compacto={compacto} />
            <CalendarioDoMes titulo="Fim" m={mesFim} onMes={setMesFim} rascunho={rascunho} hoje={hoje} onDia={(d) => setRascunho((r) => cliqueNoDia(r, d, porMes))}
              testid={`${testid}-cal-fim`} borda compacto={compacto} />
            {vista === 'anos' && <div className="absolute inset-0 z-[1] bg-popover" data-painel-por-cima>{gradeDeAnos}</div>}
          </div>
        )}

        {vista === 'meses' && (
          <div className="px-2.5 pb-2 pt-2">
            <div className="mb-1.5 flex h-[24px] items-center justify-between">
              <button type="button" aria-label="ano anterior" className={BOTAO_NAV} onClick={() => setAnoDaGrade((a) => a - 1)}><ChevronLeft className="h-3 w-3" /></button>
              <b className="text-[12px]">{anoDaGrade}</b>
              <button type="button" aria-label="próximo ano" className={BOTAO_NAV} onClick={() => setAnoDaGrade((a) => a + 1)}><ChevronRight className="h-3 w-3" /></button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {MESES_CURTOS.map((rot, m0) => {
                const i = intervaloDoMes(anoDaGrade, m0);
                return (
                  <button key={rot} type="button" data-mes={`${anoDaGrade}-${m0 + 1}`} onClick={() => setRascunho({ de: i.de, ate: i.ate, nome: null })}
                    className={cn('h-[28px] rounded-md border text-[12px] font-semibold', rascunho.de === i.de && rascunho.ate === i.ate ? CHIP_LIGADO : CHIP_DESLIGADO)}>
                    {rot}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {modo === 'ano' && gradeDeAnos}

        <div className={cn('flex items-center gap-2 border-t border-border px-2', compacto ? 'h-[26px]' : 'h-[30px]')}>
          <span className={cn('min-w-0 flex-1 whitespace-nowrap text-muted-foreground', compacto ? 'text-[10px]' : 'text-[11px]')} data-testid={`${testid}-resumo`}>
            {pronto && rascunho.de && rascunho.ate
              ? <><b className="text-foreground">{rotuloDoIntervalo({ de: rascunho.de, ate: rascunho.ate, nome: rascunho.nome })}</b>
                {/* as datas só no modo datas (no de mês/ano o rótulo já diz tudo, e o popup é estreito) */}
                {modo === 'datas' && <> · {dataCurta(rascunho.de)} a {dataCurta(rascunho.ate)}</>}</>
              : rascunho.de ? <>Início <b className="text-foreground">{dataCurta(rascunho.de)}</b> · escolha o fim</> : 'Escolha o início e o fim'}
          </span>
          <button type="button" onClick={() => setAberto(false)} className="h-[22px] rounded-md border border-border bg-card px-2.5 text-[11px] font-semibold hover:bg-muted">Cancelar</button>
          <button type="button" disabled={!pronto} onClick={aplicar} data-testid={`${testid}-aplicar`}
            className="h-[22px] rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50">Aplicar</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Um dos dois calendários (Início ou Fim): o mês com ‹ ›, os dias da semana e as 42 casas; a faixa escolhida pinta no azul da casa. */
function CalendarioDoMes({ titulo, m, onMes, rascunho, hoje, onDia, testid, borda = false, compacto = false }: {
  titulo: string; m: MesDoCalendario; onMes: (m: MesDoCalendario) => void; rascunho: Rascunho; hoje: string; onDia: (data: string) => void;
  testid: string; borda?: boolean; compacto?: boolean;
}) {
  const nav = compacto ? 'inline-flex h-[18px] w-[18px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted' : BOTAO_NAV;
  return (
    <div className={cn(compacto ? 'px-1.5 pb-1 pt-0.5' : 'px-2 pb-1 pt-1', borda && 'border-l border-border')} data-testid={testid}>
      {/* o "Início"/"Fim" na mesma linha do mês (antes era uma linha a mais) */}
      <div className={cn('flex items-center gap-1', compacto ? 'h-[20px]' : 'h-[24px]')}>
        <button type="button" aria-label="mês anterior" className={nav} onClick={() => onMes(somarMes(m, -1))}><ChevronLeft className="h-3.5 w-3.5" /></button>
        <span className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5 whitespace-nowrap">
          <span className={cn('text-muted-foreground', compacto ? 'text-[9.5px]' : 'text-[10px]')}>{titulo}</span>
          <b className={cn('font-semibold', compacto ? 'text-[11px]' : 'text-[14px]')}>{MESES_LONGOS[m.mes0]} {m.ano}</b>
        </span>
        <button type="button" aria-label="próximo mês" className={nav} onClick={() => onMes(somarMes(m, 1))}><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
      <div className={compacto ? 'grid grid-cols-[repeat(7,24px)]' : 'grid grid-cols-[repeat(7,32px)]'}>
        {DIAS_DA_SEMANA.map((d) => (
          <div key={d} className={cn('text-center text-muted-foreground', compacto ? 'h-[14px] text-[9.5px] leading-[14px]' : 'h-[16px] text-[10px] leading-[16px]')}>
            {compacto ? d.slice(0, 1) : d}
          </div>
        ))}
        {gradeDoMes(m.ano, m.mes0).map((c) => {
          const ponta = c.doMes && (c.data === rascunho.de || c.data === rascunho.ate);
          const entre = c.doMes && !!rascunho.de && !!rascunho.ate && c.data > rascunho.de && c.data < rascunho.ate;
          return (
            <button key={c.data} type="button" data-dia={c.data} onClick={() => onDia(c.data)}
              className={cn('rounded-[5px] tabular-nums', compacto ? 'h-[20px] w-[24px] text-[10px]' : 'h-[28px] w-[32px] text-[13px]',
                !c.doMes && 'text-muted-foreground/40', c.data === hoje && 'ring-1 ring-inset ring-primary/50',
                entre && 'rounded-none bg-primary/15', ponta ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              {c.dia}
            </button>
          );
        })}
      </div>
    </div>
  );
}
