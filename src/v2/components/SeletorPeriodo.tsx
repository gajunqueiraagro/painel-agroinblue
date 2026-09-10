/**
 * O PERÍODO MORA NA TELA — PR-BARRA-UNICA-01a · intervalo em PR-SELETOR-PERIODO-02.
 *
 * ⚠ NASCEU DA BARRA QUE SAIU. A `V2FilterBar` era global: uma fita de ano/mês no topo do
 * shell, igual nas 58 seções, alimentando um estado que — medido na FASE 0 — só CINCO telas
 * liam de verdade. Um controle que a maioria das telas ignora ensina que ele não faz nada.
 *
 * ⚠ NADA MUDA DE TAMANHO AO SELECIONAR — A23. O desenho anterior era o da Conciliação:
 * `outline` de 2,5px com `offset` 2 e `transform: scale(1.09)` no mês ativo. Os dois
 * EMPURRAM — o `scale` cresce sobre os vizinhos e o `outline` com offset pede folga que a
 * fita não tem —, e cada clique reflowava a linha inteira. Selecionar é dizer QUAL, não
 * mudar o tamanho de nada: o mês ativo muda de COR, e só. A fonte é 12px/500 sempre,
 * inclusive no ativo, porque negrito só no selecionado desloca as três letras.
 *
 * ⚠ NA CONCILIAÇÃO A COR JÁ É INFORMAÇÃO, e por isso o selecionado ali é um ANEL INTERNO
 * (`box-shadow: inset`). Pintar o mês de azul apagaria o status — verde conciliado, âmbar
 * parcial, vermelho divergente — que é o que aquela tela veio mostrar. Anel interno não
 * ocupa espaço fora da caixa: marca sem empurrar, que é a mesma regra da A23 dita para um
 * fundo que não pode ser trocado.
 *
 * ⚠ O PERÍODO É UM INTERVALO, e o mês único é `de === ate`. O botão "Ano" do 01b saiu: "o
 * ano inteiro" deixou de ser um valor especial (`mes === 0`) e passou a ser o que sempre
 * foi — janeiro a dezembro. Um conceito a menos para as telas traduzirem.
 *
 * ⚠ `modoUnico` NÃO É UMA VERSÃO REDUZIDA, É A VERDADE DE SEIS TELAS. Conciliação,
 * Auditoria Bancária, Indicadores, Visão Geral do Rebanho, Planejamento e Painel do
 * Consultor fazem aritmética de UM mês — mês anterior, último dia, `${ano}-${mes}` para o
 * banco. Oferecer-lhes um intervalo seria oferecer um filtro que elas não sabem honrar, e
 * um filtro que não filtra é pior do que filtro nenhum.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  MESES_CURTOS, anoMes, contarMeses, descreverDias, descreverPeriodo, ehMesUnico,
  mesCorrente, mesUnico, ordenar, type Periodo,
} from '@/v2/lib/periodo';

export { MESES_CURTOS };

/** A cor de um mês quando ela carrega informação (status, alerta). */
export interface TomDoMes { bg: string; border: string; txt: string; title?: string }

export interface SeletorPeriodoProps {
  /** `'ano'` esconde a fita de meses; `'ano-mes'` a mostra. */
  modo?: 'ano' | 'ano-mes';
  /**
   * A tela só sabe filtrar UM mês: sem toggle, sem "Personalizado…", sem intervalo.
   * O que ela recebe é sempre `de === ate`.
   */
  modoUnico?: boolean;
  /** Os anos oferecidos. Sem lista, o ano corrente e os quatro anteriores. */
  anos?: readonly string[];
  periodo: Periodo;
  onPeriodoChange: (p: Periodo) => void;
  /** A cor de cada mês (1..12) quando ela significa algo. */
  tomPorMes?: Readonly<Record<number, TomDoMes>>;
  /** Enquanto carrega os tons, a fita vira esqueleto — não some. */
  carregando?: boolean;
  className?: string;
}

/* ⚠ AS CORES DO MEIO DO INTERVALO SÃO LITERAIS — A24. Elas não existem na paleta: são um
   azul MAIS CLARO que o `--primary`, para dizer "dentro do período, mas não é o extremo que
   você clicou". Inventá-las como token novo obrigaria a mexer na paleta que o sistema todo
   usa, por causa de um estado de um controle. Se uma segunda peça precisar do mesmo azul,
   aí vira token — a segunda cópia é o momento, não a primeira. */
const MEIO_BG = '#dbe7f5';
const MEIO_BORDA = '#b6cbe6';
const CHIP_MARCADO_BG = '#eef3fa';

/**
 * ⚠ A FITA — `min-w-0` E `overflow-x-auto` SÃO O MESMO PEDIDO POR DOIS LADOS. A linha não
 * quebra entre o ano e os meses (A25, estado 6), e para não quebrar ela precisa poder ser
 * mais estreita que o próprio conteúdo: sem o `min-w-0`, um filho flex se recusa a encolher
 * abaixo do conteúdo e quem espreme não é a fita — é a linha do chamador.
 */
const FITA = 'flex min-w-0 flex-1 gap-1 overflow-x-auto';

const BOTAO_BASE: React.CSSProperties = {
  flex: '1 0 58px', height: 32, textAlign: 'center', padding: '0 4px',
  fontSize: 12, fontWeight: 500, borderRadius: 8, borderWidth: 1, borderStyle: 'solid',
  cursor: 'pointer', lineHeight: 1, transition: 'background-color .12s, border-color .12s',
};

type Segmento = 'mes' | 'periodo';

export function SeletorPeriodo({
  modo = 'ano-mes', modoUnico, anos, periodo, onPeriodoChange, tomPorMes,
  carregando, className,
}: SeletorPeriodoProps) {
  const hoje = new Date();
  const entreAnos = periodo.de.ano !== periodo.ate.ano;

  /* ⚠ O SEGMENTO É DE QUEM OLHA, NÃO DO DADO. Um intervalo já escolhido abre em "Período"
     porque é o que ele é; mas escolher "Período" e ainda não ter clicado nada não muda
     período nenhum — por isso o modo é estado local, e o valor só sai daqui quando os dois
     cliques acontecem. */
  const [segmento, setSegmento] = useState<Segmento>(() => (ehMesUnico(periodo) ? 'mes' : 'periodo'));
  const [inicioParcial, setInicioParcial] = useState<{ ano: number; mes: number } | null>(null);
  const [popoverAberto, setPopoverAberto] = useState(false);

  /* Um período que chega de fora (link, drill, F5) manda no segmento. */
  const chave = `${anoMes(periodo.de)}|${anoMes(periodo.ate)}`;
  const chaveAnterior = useRef(chave);
  useEffect(() => {
    if (chaveAnterior.current === chave) return;
    chaveAnterior.current = chave;
    setInicioParcial(null);
    if (!ehMesUnico(periodo)) setSegmento('periodo');
  }, [chave, periodo]);

  const listaAnos = useMemo(() => {
    if (anos && anos.length) return anos;
    const a = hoje.getFullYear();
    return [a, a - 1, a - 2, a - 3, a - 4].map(String);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anos]);

  /* ⚠ TROCAR DE ANO PRESERVA O RECORTE, não o zera. Quem está vendo fev→abr e troca para
     2025 quer fev→abr de 2025; devolver "o ano inteiro" ou "janeiro" faria o operador
     reconstruir o recorte a cada troca de ano. O intervalo desloca junto. */
  const trocarAno = (texto: string) => {
    const novo = Number(texto);
    const salto = novo - periodo.de.ano;
    onPeriodoChange({
      de: { ano: novo, mes: periodo.de.mes },
      ate: { ano: periodo.ate.ano + salto, mes: periodo.ate.mes },
    });
  };

  const clicarMes = (m: number, comShift: boolean) => {
    const ano = periodo.de.ano;
    /* ⚠ SHIFT É ATALHO ESCONDIDO — não aparece na tela, de propósito: quem já sabe usa, e
       quem não sabe tem o toggle, que ensina. Documentar os dois seria ensinar duas
       maneiras de fazer a mesma coisa. */
    const querPeriodo = !modoUnico && (segmento === 'periodo' || comShift);
    if (!querPeriodo) {
      setInicioParcial(null);
      onPeriodoChange(mesUnico(ano, m));
      return;
    }
    if (inicioParcial === null) {
      setInicioParcial({ ano, mes: m });
      return;
    }
    setInicioParcial(null);
    onPeriodoChange(ordenar({ de: inicioParcial, ate: { ano, mes: m } }));
  };

  const mesesDoAnoVisivel = (m: number) => {
    const alvo = `${periodo.de.ano}-${String(m).padStart(2, '0')}`;
    if (inicioParcial && inicioParcial.mes === m && inicioParcial.ano === periodo.de.ano) return 'extremo';
    if (inicioParcial) return 'fora';
    if (alvo === anoMes(periodo.de) || alvo === anoMes(periodo.ate)) return 'extremo';
    if (alvo > anoMes(periodo.de) && alvo < anoMes(periodo.ate)) return 'meio';
    return 'fora';
  };

  const frase = (() => {
    if (inicioParcial) {
      return `Início ${MESES_CURTOS[inicioParcial.mes - 1].toLowerCase()}/${inicioParcial.ano} · agora clique no mês final`;
    }
    const n = contarMeses(periodo);
    return n === 1
      ? `Mostrando ${descreverPeriodo(periodo)}`
      : `Mostrando ${descreverPeriodo(periodo)} · ${n} meses`;
  })();

  const podeLimpar = !inicioParcial && !ehMesUnico(periodo);

  return (
    <div className={className}>
      {/* ⚠ A LINHA QUEBRA DEPOIS DA FITA, NUNCA DENTRO DELA — A25/estado 6. O ano e os meses
          moram num grupo `flex-nowrap` próprio; o toggle e o chip são irmãos DESSE grupo, e
          só eles descem para a segunda linha quando não cabem. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
          {/* CARD DE ANO — A25: mesmo desenho dos meses, nunca cinza sobre cinza. */}
          {entreAnos ? (
            <div
              className="flex shrink-0 items-center justify-center rounded-lg border bg-card text-foreground"
              style={{ width: 74, height: 32, fontSize: 12, fontWeight: 500 }}
              title="Período personalizado entre anos"
            >
              {periodo.de.ano}–{periodo.ate.ano}
            </div>
          ) : (
            <Select value={String(periodo.de.ano)} onValueChange={trocarAno}>
              <SelectTrigger
                className="shrink-0 rounded-lg border bg-card text-foreground [&>svg]:opacity-100"
                style={{ width: 74, height: 32, fontSize: 12, fontWeight: 500 }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {listaAnos.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {modo === 'ano-mes' && (carregando ? (
            <div className={FITA}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-8 min-w-[58px] flex-1 shrink-0 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : (
            <div className={FITA} style={entreAnos ? { opacity: 0.45, pointerEvents: 'none' } : undefined}>
              {MESES_CURTOS.map((rotulo, i) => {
                const m = i + 1;
                const tom = tomPorMes?.[m];
                const papel = mesesDoAnoVisivel(m);
                /* ⚠ COM `tomPorMes`, O FUNDO É DA CONCILIAÇÃO E A SELEÇÃO É UM ANEL INTERNO.
                   Sem ele, o extremo é azul cheio e o meio é o azul claro. */
                const estilo: React.CSSProperties = tom
                  ? {
                      background: tom.bg, borderColor: tom.border, color: tom.txt,
                      ...(papel !== 'fora' ? { boxShadow: 'inset 0 0 0 2px hsl(var(--primary))' } : {}),
                    }
                  : papel === 'extremo'
                    ? { background: 'hsl(var(--primary))', borderColor: 'hsl(var(--primary))', color: '#fff' }
                    : papel === 'meio'
                      ? { background: MEIO_BG, borderColor: MEIO_BORDA, color: 'hsl(var(--primary))' }
                      : { background: 'hsl(var(--card))', borderColor: 'hsl(var(--border) / 0.6)', color: 'hsl(var(--foreground))' };
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={(e) => clicarMes(m, e.shiftKey)}
                    title={tom?.title}
                    aria-pressed={papel !== 'fora'}
                    className={papel === 'fora' && !tom ? 'hover:!bg-muted' : undefined}
                    style={{ ...BOTAO_BASE, ...estilo }}
                  >
                    {rotulo}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {modo === 'ano-mes' && !modoUnico && (
          <>
            {/* TOGGLE "Mês | Período" — dois segmentos, o ativo em bg-primary. */}
            <div className="flex shrink-0 overflow-hidden rounded-lg border" style={{ height: 32 }}>
              {(['mes', 'periodo'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSegmento(s); setInicioParcial(null); }}
                  style={{
                    padding: '0 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer', lineHeight: 1,
                    background: segmento === s ? 'hsl(var(--primary))' : 'hsl(var(--card))',
                    color: segmento === s ? '#fff' : 'hsl(var(--foreground))',
                  }}
                >
                  {s === 'mes' ? 'Mês' : 'Período'}
                </button>
              ))}
            </div>

            <Popover open={popoverAberto} onOpenChange={setPopoverAberto}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 rounded-full border"
                  style={{
                    height: 28, padding: '0 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    background: entreAnos ? CHIP_MARCADO_BG : 'hsl(var(--card))',
                    borderColor: entreAnos ? MEIO_BORDA : 'hsl(var(--border) / 0.6)',
                    color: entreAnos ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                  }}
                >
                  Personalizado…
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-3">
                <PopoverPersonalizado
                  periodo={periodo}
                  anos={listaAnos}
                  onCancelar={() => setPopoverAberto(false)}
                  onAplicar={(p) => { setPopoverAberto(false); setInicioParcial(null); onPeriodoChange(p); }}
                />
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

      {/* ⚠ A FRASE ESTÁ SEMPRE PRESENTE, inclusive no mês único. Um texto que aparece só às
          vezes é um texto que o olho aprende a não procurar — e é justamente quando o
          recorte é incomum que ele precisa ser lido. */}
      {modo === 'ano-mes' && (
        <div className="mt-1 flex items-center gap-1.5" style={{ fontSize: 12 }}>
          <span className="text-foreground">{frase}</span>
          {podeLimpar && (
            <button
              type="button"
              onClick={() => onPeriodoChange(mesCorrente())}
              title="Voltar ao mês corrente"
              aria-label="Voltar ao mês corrente"
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * O popover do "Personalizado…".
 *
 * ⚠ O ESTADO É RASCUNHO ATÉ "APLICAR". Mexer nos combos não pode refiltrar a tela a cada
 * clique: escolher "de jan/2024" com o "até" ainda em dez/2026 pediria três anos de dado
 * que ninguém quis ver. Cancelar descarta; só Aplicar fala com a tela.
 */
function PopoverPersonalizado({
  periodo, anos, onCancelar, onAplicar,
}: {
  periodo: Periodo;
  anos: readonly string[];
  onCancelar: () => void;
  onAplicar: (p: Periodo) => void;
}) {
  const [rascunho, setRascunho] = useState<Periodo>(periodo);
  const previa = ordenar(rascunho);

  const combo = (
    valor: number, opcoes: readonly { v: string; r: string }[], aoTrocar: (v: string) => void, largura: number,
  ) => (
    <Select value={String(valor)} onValueChange={aoTrocar}>
      <SelectTrigger className="rounded-md border bg-card" style={{ width: largura, height: 28, fontSize: 12 }}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opcoes.map((o) => <SelectItem key={o.v} value={o.v}>{o.r}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const OPC_MES = MESES_CURTOS.map((r, i) => ({ v: String(i + 1), r: r.toLowerCase() }));
  const OPC_ANO = anos.map((a) => ({ v: a, r: a }));

  const linha = (
    rotulo: string, ponto: { ano: number; mes: number }, trocar: (p: { ano: number; mes: number }) => void,
  ) => (
    <div className="flex items-center gap-2">
      <span className="w-8 text-muted-foreground" style={{ fontSize: 12 }}>{rotulo}</span>
      {combo(ponto.mes, OPC_MES, (v) => trocar({ ...ponto, mes: Number(v) }), 78)}
      {combo(ponto.ano, OPC_ANO, (v) => trocar({ ...ponto, ano: Number(v) }), 78)}
    </div>
  );

  return (
    <div className="flex flex-col gap-2" style={{ minWidth: 220 }}>
      <p className="font-medium text-foreground" style={{ fontSize: 12 }}>Período personalizado</p>
      {linha('de', rascunho.de, (p) => setRascunho({ ...rascunho, de: p }))}
      {linha('até', rascunho.ate, (p) => setRascunho({ ...rascunho, ate: p }))}
      <p className="text-muted-foreground" style={{ fontSize: 11 }}>
        {contarMeses(previa)} {contarMeses(previa) === 1 ? 'mês' : 'meses'} · {descreverDias(previa)}
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button" onClick={onCancelar}
          className="rounded-md border bg-card px-3 text-foreground transition-colors hover:bg-muted"
          style={{ height: 28, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
        >
          Cancelar
        </button>
        <button
          type="button" onClick={() => onAplicar(previa)}
          className="rounded-md bg-cta px-3 text-cta-foreground transition-colors hover:bg-cta-hover"
          style={{ height: 28, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}
