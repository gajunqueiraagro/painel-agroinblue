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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  MESES_CURTOS, anoInteiro, anoMes, contarMeses, descreverPeriodo,
  ehAnoInteiro, ehMesUnico, intervaloDoPeriodo, mesCorrente, mesUnico, ordenar, periodoDoIntervalo, type Periodo,
} from '@/v2/lib/periodo';
import { SeletorDePeriodo } from '@/components/ui/seletor-de-periodo';

export { MESES_CURTOS };

/**
 * O ESTADO DE UM MÊS — UI-MESES-PADRAO-01 (Gabriel 18/11, mock aprovado). O estado é um PONTO de 6px, nunca a cor do mês:
 * verde fechado/conciliado · âmbar pendente · vermelho divergência. É o MESMO estado que a tela já calcula (quem monta o tom
 * traduz o seu status para estes três); o seletor não inventa estado. Mês futuro (sem estado, depois do mês corrente) = contorno.
 */
export type EstadoDoMes = 'ok' | 'pend' | 'err';
export const COR_DO_ESTADO: Record<EstadoDoMes, string> = { ok: '#2FA36B', pend: '#D99A2B', err: '#D9534F' };

/** O que um mês carrega quando ele significa algo (status, alerta). */
export interface TomDoMes {
  /** O estado do mês: o ponto. Sem estado, o mês não tem ponto. */
  estado?: EstadoDoMes;
  title?: string;
  /** AVISO no canto (ponto âmbar de 5px), somado ao `title`; não muda o estado nem a medida do mês (PR-CONC-STATUS-SALDO-01b). */
  marca?: string;
  /** CONTADOR VERMELHO no canto esquerdo (CONC-SEM-CLASSIFICACAO-01), com o `title` somado ao do mês; posição absoluta. */
  contador?: { qtde: number; title: string };
}

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
  /** O estado de cada mês (1..12) quando ele significa algo. */
  tomPorMes?: Readonly<Record<number, TomDoMes>>;
  /** A legenda curta à direita (só com `tomPorMes`): o rótulo de cada estado que a tela usa. */
  legenda?: readonly { estado: EstadoDoMes | 'fut'; rotulo: string }[];
  /** Enquanto carrega os tons, a fita vira esqueleto — não some. */
  carregando?: boolean;
  className?: string;
}

/* ⚠ UI-MESES-PADRAO-01 — A FITA É UMA BARRA ÚNICA DE 12 SEGMENTOS SOBRE O NAVY: 30px, raio 6, borda 1px branca a 14%, Inter
   12/500; o mês aberto = fundo `--mes-aberto` (#1F56B8) e texto branco; o meio de um intervalo = o mesmo azul a 38%. A LINHA
   TRAZ O PRÓPRIO NAVY, para ser legível também numa tela cujo cabeçalho ainda não é navy; sobre o cabeçalho navy ela se funde.
   Nada muda de tamanho ao selecionar (A23): os segmentos têm a mesma base e o ponto vem antes do rótulo em todos os estados.
   ⚠ O ESCOLHIDO FICA EM 500 (o mock dizia 600): negrito só no selecionado desloca as três letras — A23, presa no teste.
   ⚠ `CARA` SEGUE EXPORTADA: os papéis extremo/meio/fora são a regra; o `data-papel` é o que o teste prende. */
export const CARA = {
  extremo: { background: 'hsl(var(--mes-aberto))', borderColor: 'transparent', color: '#fff' },
  meio: { background: 'hsl(var(--mes-aberto) / 0.38)', borderColor: 'transparent', color: '#fff' },
  fora: { background: 'transparent', borderColor: 'transparent', color: '#C9D4E5' },
} as const;

const ALTURA = 30;
const COR_FUTURO = '#5F7290';

/** A linha inteira (ano + barra + botões + legenda) no navy: legível sobre qualquer cabeçalho. */
const LINHA: React.CSSProperties = { background: 'hsl(var(--navy))', borderRadius: 8 };

/**
 * ⚠ A BARRA — `min-w-0` E `overflow-x-auto` SÃO O MESMO PEDIDO POR DOIS LADOS: a linha não quebra entre o ano e os meses (A25),
 * e no celular os 12 segmentos rolam no lugar em vez de espremer as letras.
 */
const FITA = 'flex min-w-0 flex-1 overflow-x-auto';
const FITA_ESTILO: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.14)', borderRadius: 6, background: 'rgba(255,255,255,.03)',
};

const BOTAO_BASE: React.CSSProperties = {
  /* base 36px: os 12 + o ano cabem nos 530px da tabela do Fechamento; onde há largura, crescem por igual */
  flex: '1 0 36px', height: ALTURA - 2, padding: '0 2px', fontSize: 12, fontWeight: 500, cursor: 'pointer', lineHeight: 1,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, position: 'relative', border: 0,
  borderLeft: '1px solid rgba(255,255,255,.08)', transition: 'background-color .12s',
};

const PONTO: React.CSSProperties = { width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flex: 'none' };
const PONTO_FUTURO: React.CSSProperties = { ...PONTO, background: 'transparent', border: `1px solid ${COR_FUTURO}` };

/** O aviso do canto (5px, fora do fluxo): avisa sem mudar o estado nem a medida do mês. */
const MARCA_DO_MES: React.CSSProperties = {
  position: 'absolute', top: 4, right: 6, width: 5, height: 5, borderRadius: '50%',
  background: COR_DO_ESTADO.pend, pointerEvents: 'none',
};

/** O contador vermelho do mês: canto superior ESQUERDO (o direito é do aviso), fora do fluxo. */
const CONTADOR_DO_MES: React.CSSProperties = {
  position: 'absolute', top: 1, left: 2, minWidth: 11, height: 11, padding: '0 2px', borderRadius: 6,
  background: '#C62828', color: '#fff', fontSize: 8, lineHeight: '11px', fontWeight: 600, textAlign: 'center',
  fontVariantNumeric: 'tabular-nums', pointerEvents: 'none',
};

/** O ano, o "Ano" e o "Personalizado…": a mesma altura da barra, no idioma do navy. */
const CONTROLE: React.CSSProperties = {
  height: ALTURA, borderRadius: 6, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.04)',
  color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const CONTROLE_ESCOLHIDO: React.CSSProperties = { background: CARA.extremo.background, borderColor: 'transparent' };

/** O mês é futuro? (só se usa quando a tela dá estado aos meses) */
function ehFuturo(ano: number, mes: number, hoje: Date): boolean {
  return ano > hoje.getFullYear() || (ano === hoje.getFullYear() && mes > hoje.getMonth() + 1);
}

export function SeletorPeriodo({
  modo = 'ano-mes', modoUnico, anos, periodo, onPeriodoChange, tomPorMes, legenda,
  carregando, className,
}: SeletorPeriodoProps) {
  const hoje = new Date();
  const entreAnos = periodo.de.ano !== periodo.ate.ano;

  const [inicioParcial, setInicioParcial] = useState<{ ano: number; mes: number } | null>(null);
  /* PROD-LANC-FILTROS-01 — o "Personalizado…" abre o SeletorDePeriodo (o único do produto) */
  const [personalizado, setPersonalizado] = useState(false);

  /* Um período que chega de fora (link, drill, F5) descarta um shift pela metade. */
  const chave = `${anoMes(periodo.de)}|${anoMes(periodo.ate)}`;
  const chaveAnterior = useRef(chave);
  useEffect(() => {
    if (chaveAnterior.current === chave) return;
    chaveAnterior.current = chave;
    setInicioParcial(null);
  }, [chave]);

  /* UI-MESES-PADRAO-01 (Gabriel 18/11, BUG): o ano do período SEMPRE está na lista — fora dela o `Select` do Radix mostra o
     campo VAZIO (só a seta). Acontecia quando a tela mostrava um ano que a lista dela não trazia. */
  const anoDoPeriodo = String(periodo.de.ano);
  const listaAnos = useMemo(() => {
    const a = hoje.getFullYear();
    const base = anos && anos.length ? [...anos] : [a, a - 1, a - 2, a - 3, a - 4].map(String);
    return base.includes(anoDoPeriodo) ? base : [...base, anoDoPeriodo].sort((x, y) => Number(y) - Number(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anos, anoDoPeriodo]);

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
       quem não sabe tem o "Personalizado…", que mostra os dois extremos por escrito. */
    const querPeriodo = !modoUnico && comShift;
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

  const anoTodo = ehAnoInteiro(periodo);

  /* ⚠ O ANO INTEIRO NÃO TEM EXTREMOS — item B. Em jan→dez, Jan e Dez seriam "extremo" pela
     regra geral e sairiam em azul cheio, sugerindo que ALGUÉM escolheu janeiro e dezembro.
     Ninguém escolheu: escolheu-se o ano. Os doze saem iguais, em azul claro, e quem carrega
     o azul cheio é o botão "Ano" — a cor mostra ONDE está a escolha. */
  const papelDoMes = (m: number): keyof typeof CARA => {
    if (anoTodo) return 'meio';
    const alvo = `${periodo.de.ano}-${String(m).padStart(2, '0')}`;
    if (inicioParcial) {
      return inicioParcial.mes === m && inicioParcial.ano === periodo.de.ano ? 'extremo' : 'fora';
    }
    if (alvo === anoMes(periodo.de) || alvo === anoMes(periodo.ate)) return 'extremo';
    if (alvo > anoMes(periodo.de) && alvo < anoMes(periodo.ate)) return 'meio';
    return 'fora';
  };

  /* ⚠ A FRASE SÓ APARECE QUANDO HÁ O QUE EXPLICAR — item D. Ela nasceu "sempre presente"
     para o olho não aprender a ignorá-la; medida na tela, virou o contrário: repetir
     "Mostrando agosto/2026" embaixo de um Ago já pintado de azul é ocupar uma linha para
     dizer o que a fita já diz. Fica para o intervalo, que a fita sozinha não consegue
     nomear — e para o shift pela metade, que sem ela pareceria um clique perdido. */
  const frase = (() => {
    if (inicioParcial) {
      return `Início ${MESES_CURTOS[inicioParcial.mes - 1].toLowerCase()}/${inicioParcial.ano} · agora clique no mês final`;
    }
    if (ehMesUnico(periodo)) return null;
    return `Mostrando ${descreverPeriodo(periodo)} · ${contarMeses(periodo)} meses`;
  })();

  const podeLimpar = !inicioParcial && !ehMesUnico(periodo);

  const botaoPersonalizado = (
    <button
      type="button"
      className="shrink-0"
      data-testid="periodo-personalizado-gatilho"
      onClick={() => setPersonalizado(true)}
      style={{ ...CONTROLE, padding: '0 10px', fontWeight: 500, ...(entreAnos ? CONTROLE_ESCOLHIDO : {}) }}
    >
      Personalizado…
    </button>
  );

  return (
    <div className={className}>
      {/* ⚠ NADA POR CIMA DE NADA, E ISSO É ESTRUTURA: o grupo da direita é IRMÃO do scrollport, não vizinho sobreposto. */}
      <div className="flex flex-nowrap items-center gap-1" style={LINHA} data-testid="seletor-periodo-linha">
        {entreAnos ? (
          <div className="flex shrink-0 items-center justify-center" style={{ ...CONTROLE, width: 72 }}
            title="Período personalizado entre anos">
            {periodo.de.ano}–{periodo.ate.ano}
          </div>
        ) : (
          <Select value={String(periodo.de.ano)} onValueChange={trocarAno}>
            <SelectTrigger className="shrink-0 justify-center gap-1 px-2 [&>span]:!break-normal [&>svg]:opacity-70" style={{ ...CONTROLE, width: 72 }}
              title="Ano">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {listaAnos.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {modo === 'ano-mes' && (carregando ? (
          <div className={FITA} style={FITA_ESTILO}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="min-w-[36px] flex-1 shrink-0 animate-pulse bg-white/10" style={{ height: ALTURA - 2 }} />
            ))}
          </div>
        ) : (
          <div className={FITA} style={{ ...FITA_ESTILO, ...(entreAnos ? { opacity: 0.45, pointerEvents: 'none' } : {}) }}
            data-testid="seletor-periodo-meses">
            {MESES_CURTOS.map((rotulo, i) => {
              const m = i + 1;
              const tom = tomPorMes?.[m];
              const papel = papelDoMes(m);
              const futuro = !!tomPorMes && !tom?.estado && papel === 'fora' && ehFuturo(periodo.de.ano, m, hoje);
              const estilo: React.CSSProperties = {
                ...CARA[papel],
                ...(futuro ? { color: COR_FUTURO } : {}),
                ...(i === 0 ? { borderLeft: 0 } : {}),
              };
              const ponto: React.CSSProperties | null = tom?.estado
                ? { ...PONTO, background: COR_DO_ESTADO[tom.estado] }
                : futuro ? PONTO_FUTURO : null;
              const titulo = tom?.marca || tom?.contador
                ? [tom.title, tom.marca, tom.contador?.title].filter(Boolean).join(' — ')
                : (tom?.title ?? (futuro ? 'Mês futuro' : undefined));
              return (
                <button
                  key={m}
                  type="button"
                  onClick={(e) => clicarMes(m, e.shiftKey)}
                  title={titulo}
                  aria-pressed={papel !== 'fora'}
                  data-papel={papel}
                  data-estado={tom?.estado ?? (futuro ? 'fut' : undefined)}
                  data-marca={tom?.marca ? 'aviso' : undefined}
                  className={papel === 'fora' ? 'hover:!bg-white/[.07] hover:!text-white' : undefined}
                  data-contador={tom?.contador ? tom.contador.qtde : undefined}
                  style={{ ...BOTAO_BASE, ...estilo }}
                >
                  {ponto && <i aria-hidden data-testid="ponto-do-mes" style={ponto} />}
                  {rotulo}
                  {tom?.marca && (
                    <span aria-hidden data-testid="marca-aviso-mes" style={MARCA_DO_MES} />
                  )}
                  {tom?.contador && (
                    <span aria-hidden data-testid="contador-mes" style={CONTADOR_DO_MES}>{tom.contador.qtde}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        {modo === 'ano-mes' && !modoUnico && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => { setInicioParcial(null); onPeriodoChange(anoInteiro(periodo.de.ano)); }}
              title="O ano inteiro — janeiro a dezembro"
              aria-pressed={anoTodo}
              data-papel={anoTodo ? 'extremo' : 'fora'}
              style={{ ...CONTROLE, width: 48, fontWeight: 500, ...(anoTodo ? CONTROLE_ESCOLHIDO : {}) }}
            >
              Ano
            </button>

            {/* PROD-LANC-FILTROS-01 (Gabriel 19/11): o "Personalizado…" abre o SeletorDePeriodo do DRE — o ÚNICO seletor de período
                personalizado do produto (um campo, 2 calendários Início/Fim + atalhos, Cancelar/Aplicar); por MÊS (a fita fala em meses: o
                clique no calendário escolhe o mês inteiro). A conversão mês ↔ data mora na borda (`intervaloDoPeriodo`/`periodoDoIntervalo`). */}
            {/* o seletor só MONTA no clique (nasce aberto) e desmonta ao fechar: a fita está em quase toda tela e ele lê o cliente */}
            {personalizado ? (
              <SeletorDePeriodo porMes compacto testid="periodo-personalizado" abertoInicial onFechar={() => setPersonalizado(false)}
                valor={intervaloDoPeriodo(periodo)}
                anoMaisAntigo={listaAnos.length ? Math.min(...listaAnos.map(Number)) : null}
                onChange={(i) => { const p = periodoDoIntervalo(i); if (p) { setInicioParcial(null); onPeriodoChange(p); } }}
                gatilho={botaoPersonalizado}
              />
            ) : botaoPersonalizado}
          </div>
        )}

        {/* A LEGENDA CURTA À DIREITA (o mock): só com estado nos meses, e só onde cabe (no celular a barra precisa da largura). */}
        {modo === 'ano-mes' && tomPorMes && legenda && legenda.length > 0 && (
          <div className="hidden shrink-0 items-center gap-3.5 whitespace-nowrap px-1 xl:flex" style={{ fontSize: 11, color: '#9FB0C8' }}
            data-testid="seletor-periodo-legenda">
            {legenda.map((l) => (
              <span key={l.estado} className="inline-flex items-center gap-[5px]">
                <i aria-hidden style={l.estado === 'fut' ? PONTO_FUTURO : { ...PONTO, background: COR_DO_ESTADO[l.estado] }} />
                {l.rotulo}
              </span>
            ))}
          </div>
        )}
      </div>

      {modo === 'ano-mes' && !modoUnico && (
        <div className="mt-1 flex items-center"
          style={{ fontSize: 11, minHeight: 18, lineHeight: '18px' }}>
          {/* ⚠ A FRASE VIROU CHIP PORQUE ELA PRECISAVA SER BRANCA. Em texto escuro sobre o
              fundo da tela ela não se lia; branco sobre branco não existe, então o branco
              trouxe o fundo junto. O verde é o MESMO da seleção — o chip não é um aviso, é
              a escolha escrita por extenso, e usar outra cor faria parecer um terceiro
              estado.
              ⚠ O CHIP NÃO EXISTE VAZIO, mas a LINHA existe sempre: quem reserva os 18px é o
              `minHeight` da div de fora, não o conteúdo. Um chip vazio seria uma mancha
              verde dizendo nada; uma linha que some leva a tabela junto (A23). */}
          {frase && (
            <span
              style={{
                background: 'hsl(var(--mes-aberto))',
                color: '#fff',
                fontSize: 11, fontWeight: 500, height: 18, lineHeight: '18px',
                padding: '0 8px', borderRadius: 8,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {frase}
              {podeLimpar && (
                <button
                  type="button"
                  onClick={() => onPeriodoChange(mesCorrente())}
                  title="Voltar ao mês corrente"
                  aria-label="Voltar ao mês corrente"
                  className="shrink-0 transition-opacity hover:opacity-80"
                  style={{ color: 'inherit', cursor: 'pointer', lineHeight: 0 }}
                >
                  <X style={{ width: 11, height: 11 }} />
                </button>
              )}
            </span>
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
