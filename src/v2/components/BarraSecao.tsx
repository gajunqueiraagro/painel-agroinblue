/**
 * BarraSecao — a faixa azul de 32px no topo das telas de seção. [PR-REC-01]
 *
 * ⚠ NASCEU DE UMA CÓPIA QUE IA VIRAR DUAS. O bloco é da `FinanciamentosListaPage`
 * (PR-PARC-01) e a Recorrências ia recebê-lo igual; a segunda cópia é o momento em que
 * um trecho vira componente, não a terceira — a terceira já é a divergência.
 * ⚠ MOVIDO VERBATIM: classes, ordem dos elementos e a fonte do e-mail são as mesmas. A
 * lista não muda um pixel; se mudar, o move está errado.
 * ⚠ O E-MAIL VEM DO `useAuth` QUE JÁ EXISTE (`contexts/AuthContext`), não de um hook novo:
 * o Header e outras telas já leem `user?.email` dali. Lê-lo AQUI evita que cada chamador
 * repita a mesma linha.
 */
import { useAuth } from '@/contexts/AuthContext';

export interface BarraSecaoProps {
  /** O primeiro nível do caminho — "Financeiro", "Rebanho"… */
  area: string;
  /** O segundo nível: onde se está. */
  secao: string;
}

export function BarraSecao({ area, secao }: BarraSecaoProps) {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-40 shrink-0 bg-primary shadow-md">
      <div className="flex items-center justify-between gap-2 px-3 py-1">
        <p className="min-w-0 truncate text-[11px] font-semibold tracking-wide text-primary-foreground">
          {area}<span className="mx-1 text-primary-foreground/40">/</span>
          <span className="font-normal text-primary-foreground/90">{secao}</span>
        </p>
        <span className="max-w-[220px] truncate text-[10px] text-primary-foreground/65">
          {user?.email ?? ''}
        </span>
      </div>
    </header>
  );
}
