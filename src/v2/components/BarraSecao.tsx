/**
 * BarraSecao — a faixa azul de 32px no topo das telas de seção. [PR-REC-01]
 *
 * ⚠ NASCEU DE UMA CÓPIA QUE IA VIRAR DUAS. O bloco é da `FinanciamentosListaPage`
 * (PR-PARC-01) e a Recorrências ia recebê-lo igual; a segunda cópia é o momento em que
 * um trecho vira componente, não a terceira — a terceira já é a divergência.
 * ⚠ MOVIDO VERBATIM: classes, ordem dos elementos e a fonte do e-mail são as mesmas. A
 * lista não muda um pixel; se mudar, o move está errado.
 * ⚠ AGORA ELA É A BARRA DO SHELL — PR-BARRA-UNICA-01a. Deixou de ser a faixa de duas telas
 * e passou a ser montada UMA vez no `V2Index`, com `area`/`secao` saindo do `navGrupos` —
 * a mesma fonte dos rótulos do menu, para o topo nunca discordar da lateral. Os dois usos
 * locais (Parcelamentos e Recorrências) saíram: com o shell montando a barra, eles
 * empilhavam duas.
 * ⚠ O E-MAIL VIROU NOME. Ele vinha do `useAuth` porque era o que existia; `profiles.nome`
 * diz quem está operando, e o e-mail fica de fallback dentro do `useProfileAtual` — a
 * decisão de qual mostrar não é desta barra.
 * ⚠ "SAIR" NÃO MORA AQUI. Ele já existe no `V2Sidebar`, e um segundo botão de sair é a
 * segunda porta para o mesmo ato: a que ninguém testa.
 */
import { useProfileAtual } from '@/v2/hooks/useProfileAtual';

export interface BarraSecaoProps {
  /** O primeiro nível do caminho — "Financeiro", "Rebanho"… */
  area: string;
  /** O segundo nível: onde se está. */
  secao: string;
}

export function BarraSecao({ area, secao }: BarraSecaoProps) {
  const { nome } = useProfileAtual();
  return (
    <header className="sticky top-0 z-40 shrink-0 bg-primary shadow-md">
      <div className="flex items-center justify-between gap-2 px-3 py-1">
        {/* 13px — a barra deixou de ser detalhe de tela e virou o topo do sistema. O grupo
            recua (white/70, normal) e a tela é quem se afirma (white, 500). */}
        <p className="min-w-0 truncate text-[13px] tracking-wide text-primary-foreground/70">
          {area}<span className="mx-1 text-primary-foreground/40">/</span>
          <span className="font-medium text-primary-foreground">{secao}</span>
        </p>
        <span className="max-w-[220px] truncate text-[12px] text-primary-foreground/80" title={nome}>
          {nome}
        </span>
      </div>
    </header>
  );
}
