/**
 * O PERÍODO MORA NA TELA — PR-BARRA-UNICA-01a.
 *
 * ⚠ NASCEU DA BARRA QUE SAIU. A `V2FilterBar` era global: uma fita de ano/mês no topo do
 * shell, igual nas 58 seções, alimentando um estado que — medido na FASE 0 — só CINCO telas
 * liam de verdade. Vinte e quatro recebiam apenas o valor inicial (`initialAno`,
 * `filtroAnoInicial`) e mantinham o próprio; vinte e nove não recebiam nada e mesmo assim
 * exibiam o seletor. Um controle que a maioria das telas ignora ensina que ele não faz nada.
 *
 * ⚠ A GEOMETRIA É A DA CONCILIAÇÃO, e é a única do repo que o operador já usa há meses:
 * um seletor de ano à esquerda e doze botões em `flex-1` ocupando a largura. Copiá-la em
 * vez de inventar outra é o que faz esta troca ser invisível para quem já sabe usar.
 *
 * ⚠ `tomPorMes` EXISTE PORQUE A COR É INFORMAÇÃO NA CONCILIAÇÃO. Lá cada mês é pintado pelo
 * status de conciliação — verde conciliado, âmbar parcial, vermelho divergente, cinza
 * pendente — e o seletor é, ao mesmo tempo, um painel de status. Um componente que só
 * soubesse selecionar obrigaria a Conciliação a ficar com o dela, e a segunda coisa
 * parecida é exatamente o que este PR veio evitar. Sem a prop, os botões saem neutros.
 *
 * ⚠ CONTROLADO OU DONO DO PRÓPRIO ESTADO, e quem decide é o chamador. Passando `ano`/`mes`
 * com os respectivos `onChange`, o estado é de quem chama (é o caso da Conciliação, que já
 * tem o seu, e das cinco telas cujo período o `V2Index` guarda por causa dos drills). Sem
 * eles, o componente guarda o período na URL (`f_ano`/`f_mes`, via `useFiltroUrl`) — e aí o
 * F5 e o link compartilhado respeitam o recorte de graça.
 */
import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFiltroUrl } from '@/v2/hooks/useFiltroUrl';

/** Os rótulos são os da Conciliação — três letras, sem acento, largura igual. */
export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const;

/** A cor de um mês quando ela carrega informação (status, alerta). */
export interface TomDoMes { bg: string; border: string; txt: string; title?: string }

export interface SeletorPeriodoProps {
  /** `'ano'` esconde a fita de meses; `'ano-mes'` a mostra. */
  modo?: 'ano' | 'ano-mes';
  /** Os anos oferecidos. Sem lista, o ano corrente e os quatro anteriores. */
  anos?: readonly string[];
  /** Controlado: passe os dois. Omitindo, o componente usa a URL. */
  ano?: string;
  onAnoChange?: (v: string) => void;
  /** Mês 1..12. Controlado junto com `ano`. */
  mes?: number;
  onMesChange?: (v: number) => void;
  /** A cor de cada mês (1..12) quando ela significa algo. */
  tomPorMes?: Readonly<Record<number, TomDoMes>>;
  /**
   * Oferece "Ano" antes dos doze — PR-BARRA-UNICA-01b.
   *
   * ⚠ NÃO É ENFEITE, É CAPACIDADE. Três das telas que adotam este componente tinham "Todos
   * os meses" no seletor que ele substitui (Lançamentos zoot, Conferência de Lançamentos e
   * Saldos Mensais), e nelas ver o ano inteiro é leitura de rotina — trocar o controle sem
   * isso não seria unificar, seria tirar uma resposta que o operador tem hoje.
   * ⚠ O ANO TODO É `mes === 0`. Zero não é mês nenhum, e é justamente por isso que serve:
   * quem recebe converte para o vocabulário da sua tela ('todos', '__all__'), e quem não
   * habilita a opção nunca vê o valor.
   */
  permiteAnoTodo?: boolean;
  /** Enquanto carrega os tons, a fita vira esqueleto — não some. */
  carregando?: boolean;
  className?: string;
}

const NUM = { ler: (b: string) => Number(b) || 0, escrever: (v: number) => String(v) };
const TXT = { ler: (b: string) => b, escrever: (v: string) => v };

export function SeletorPeriodo({
  modo = 'ano-mes', anos, ano, onAnoChange, mes, onMesChange, tomPorMes, permiteAnoTodo,
  carregando, className,
}: SeletorPeriodoProps) {
  const hoje = new Date();
  const anoPadrao = String(hoje.getFullYear());
  const mesPadrao = hoje.getMonth() + 1;

  /* ⚠ OS HOOKS RODAM SEMPRE, controlado ou não: chamá-los sob condição quebraria a ordem
     dos hooks entre renders. O que muda é qual valor vence, logo abaixo. */
  const [anoUrl, setAnoUrl] = useFiltroUrl('f_ano', anoPadrao, TXT.ler, TXT.escrever);
  const [mesUrl, setMesUrl] = useFiltroUrl('f_mes', mesPadrao, NUM.ler, NUM.escrever);

  const controlado = ano !== undefined && !!onAnoChange;
  const anoAtivo = controlado ? ano : anoUrl;
  const mesAtivo = controlado ? (mes ?? mesPadrao) : mesUrl;
  const trocarAno = controlado ? onAnoChange : setAnoUrl;
  const trocarMes = controlado ? (onMesChange ?? (() => {})) : setMesUrl;

  const listaAnos = useMemo(() => {
    if (anos && anos.length) return anos;
    const a = hoje.getFullYear();
    return [a, a - 1, a - 2, a - 3, a - 4].map(String);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anos]);

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      <Select value={anoAtivo} onValueChange={trocarAno}>
        <SelectTrigger className="h-7 w-[68px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {listaAnos.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
        </SelectContent>
      </Select>

      {modo === 'ano-mes' && (carregando ? (
        <div className="flex flex-1 gap-0.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-7 flex-1 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 gap-0.5">
          {permiteAnoTodo && (
            /* ⚠ ELE VEM ANTES DOS DOZE e é mais estreito: é o recorte que CONTÉM os outros,
               não um deles. Mesmo desenho de selecionado, para o olho não aprender dois. */
            <button
              type="button"
              onClick={() => trocarMes(0)}
              title="O ano inteiro"
              style={{
                flex: '0 0 34px', textAlign: 'center', padding: '5px 3px',
                fontSize: '10px', borderRadius: '8px',
                border: '1.5px solid hsl(var(--border))', cursor: 'pointer',
                background: 'hsl(var(--card))', color: 'hsl(var(--muted-foreground))',
                fontWeight: mesAtivo === 0 ? 700 : 500,
                ...(mesAtivo === 0 ? {
                  outline: '2.5px solid #185FA5', outlineOffset: '2px',
                  transform: 'scale(1.09)', position: 'relative', zIndex: 1,
                } : {}),
              }}
            >
              Ano
            </button>
          )}
          {MESES_CURTOS.map((rotulo, i) => {
            const m = i + 1;
            const tom = tomPorMes?.[m];
            const sel = mesAtivo === m;
            /* ⚠ O ESTILO INLINE É O DA CONCILIAÇÃO, copiado: `outline` de 2,5px, `offset` de
               2 e `scale(1.09)` no selecionado. Trocá-lo por classes mudaria o desenho que o
               operador já conhece — e este componente existe para que nada mude para ele. */
            return (
              <button
                key={m}
                type="button"
                onClick={() => trocarMes(m)}
                title={tom?.title}
                style={{
                  flex: 1, textAlign: 'center', padding: '5px 3px',
                  fontSize: '10px', borderRadius: '8px',
                  border: `1.5px solid ${tom?.border ?? 'hsl(var(--border))'}`,
                  cursor: 'pointer',
                  background: tom?.bg ?? 'hsl(var(--card))',
                  color: tom?.txt ?? 'hsl(var(--muted-foreground))',
                  fontWeight: sel ? 700 : 500,
                  ...(sel ? {
                    outline: '2.5px solid #185FA5', outlineOffset: '2px',
                    transform: 'scale(1.09)', position: 'relative', zIndex: 1,
                  } : {}),
                }}
              >
                {rotulo}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
