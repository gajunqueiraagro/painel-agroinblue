/**
 * CabecalhoDaTela — UI-MESES-PADRAO-01 (Gabriel 18/11, D1: "navy em todas as telas"; mock aprovado, tom C).
 *
 * ⚠ UMA LINHA SÓ, ~40px (REGRA DO GABRIEL 11:23: "nunca blocos gigantes deslocando tudo para baixo"): o título (15/600) e o subtítulo
 *   CURTO na mesma linha, em cinza; a fita de meses (`SeletorPeriodo`), quando a tela tem, no meio da MESMA linha; as ações da tela
 *   (Novo · Exportar · Ampliar…) à direita. As abas, quando há, são a única segunda linha (a aberta tem a cor do corpo e "encaixa").
 *   A meta é a 1ª linha da tabela no terço de cima a 1366×768.
 * ⚠ OS FILTROS NÃO SOBEM PARA CÁ: ficam num card branco compacto logo abaixo, no corpo.
 * ⚠ ALTURA FIXA da linha (40px) e sem borda: nada abaixo anda quando o subtítulo ou as ações mudam.
 * ⚠ ABAS NO MESMO PESO (500) em todas: trocar de aba não muda a largura de nenhuma (P166 / A23).
 */
import type { ReactNode } from 'react';

export interface AbaDoCabecalho<T extends string> { chave: T; rotulo: string; title?: string }

export const ALTURA_DO_CABECALHO = 40;

export function CabecalhoDaTela<T extends string>({
  titulo, subtitulo, meses, acoes, abas, aba, onAba, direitaDasAbas, className, testId = 'cabecalho-da-tela',
}: {
  titulo: ReactNode;
  /** curto: cabe na mesma linha do título (o inteiro vai no `title`) */
  subtitulo?: string;
  /** a fita de meses (`SeletorPeriodo`), na mesma linha */
  meses?: ReactNode;
  /** as ações da tela, à direita, na mesma linha */
  acoes?: ReactNode;
  abas?: readonly AbaDoCabecalho<T>[];
  aba?: T;
  onAba?: (a: T) => void;
  /** na linha das abas, à direita */
  direitaDasAbas?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const temAbas = !!abas && abas.length > 0;
  return (
    <div className={`shrink-0 bg-navy px-3 text-white ${className ?? ''}`} data-testid={testId}>
      <div className="flex min-w-0 items-center gap-3" style={{ height: ALTURA_DO_CABECALHO }}>
        <h2 className="shrink-0 whitespace-nowrap text-[15px] font-semibold leading-none text-white">{titulo}</h2>
        {subtitulo && (
          <span className={`min-w-0 overflow-hidden whitespace-nowrap text-[12px] leading-none text-[#9FB0C8] ${meses ? 'hidden 2xl:block 2xl:max-w-[260px]' : 'flex-1'}`}
            title={subtitulo} data-testid="cabecalho-subtitulo">{subtitulo}</span>
        )}
        {meses ? <div className="min-w-0 flex-1">{meses}</div> : !subtitulo && <span className="flex-1" />}
        {acoes && <div className="flex shrink-0 items-center gap-1.5">{acoes}</div>}
      </div>
      {temAbas && (
        <div className="flex items-end gap-0.5" role="tablist">
          {abas.map((a) => (
            <button key={a.chave} type="button" role="tab" aria-selected={a.chave === aba} data-aba={a.chave} title={a.title}
              onClick={() => onAba?.(a.chave)}
              className={`rounded-t-md px-3.5 py-[7px] text-[12px] font-medium leading-none transition-colors ${a.chave === aba ? 'bg-corpo text-navy' : 'bg-transparent text-[#B5C2D6] hover:text-white'}`}>
              {a.rotulo}
            </button>
          ))}
          <span className="flex-1" />
          {direitaDasAbas}
        </div>
      )}
    </div>
  );
}

/** Um botão de ação no idioma do navy (Exportar, Ampliar…): contorno claro, 28px. A ação principal (Novo) leva `principal`. */
export function AcaoDoCabecalho({ children, onClick, principal, title, testId, disabled }: {
  children: ReactNode; onClick?: () => void; principal?: boolean; title?: string; testId?: string; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} title={title} data-testid={testId} disabled={disabled}
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${principal ? 'bg-cta text-cta-foreground hover:bg-cta-hover' : 'border border-white/20 bg-white/[.06] text-white hover:bg-white/[.12]'}`}>
      {children}
    </button>
  );
}
