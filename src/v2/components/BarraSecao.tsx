/**
 * BarraSecao — a faixa azul no topo das telas de seção. [PR-REC-01]
 *
 * ⚠ NASCEU DE UMA CÓPIA QUE IA VIRAR DUAS. O bloco é da `FinanciamentosListaPage`
 * (PR-PARC-01) e a Recorrências ia recebê-lo igual; a segunda cópia é o momento em que
 * um trecho vira componente, não a terceira — a terceira já é a divergência.
 * ⚠ AGORA ELA É A BARRA DO SHELL — PR-BARRA-UNICA-01a. Deixou de ser a faixa de duas telas
 * e passou a ser montada UMA vez no `V2Index`, com `area`/`secao` saindo do `navGrupos` —
 * a mesma fonte dos rótulos do menu, para o topo nunca discordar da lateral. Os dois usos
 * locais (Parcelamentos e Recorrências) saíram: com o shell montando a barra, eles
 * empilhavam duas.
 * ⚠ O E-MAIL VIROU NOME. Ele vinha do `useAuth` porque era o que existia; `profiles.nome`
 * diz quem está operando, e o e-mail fica de fallback dentro do `useProfileAtual` — a
 * decisão de qual mostrar não é desta barra.
 * ⚠ "SAIR" PASSOU A MORAR AQUI (adendo do 01c) e SAIU DA SIDEBAR no mesmo PR. Continua
 * havendo uma porta só — o que mudou foi qual: a sidebar não existe no mobile, e ali o
 * operador ficava sem saída.
 */
import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileAtual } from '@/v2/hooks/useProfileAtual';

export interface BarraSecaoProps {
  /** O primeiro nível do caminho — "Financeiro", "Rebanho"… */
  area: string;
  /** O segundo nível: onde se está. */
  secao: string;
}

export function BarraSecao({ area, secao }: BarraSecaoProps) {
  const { nome } = useProfileAtual();
  const { signOut } = useAuth();
  return (
    /* ⚠ O LITERAL SAIU — adendo do SELETOR-PERIODO-02. A barra usa o MESMO azul da sidebar
       (`bg-primary`), e o par certo do fundo é o `primary-foreground`, não um branco solto:
       trocar a paleta um dia move os dois juntos. O `#1e4b7a` que morava aqui era o azul do
       Finanças, e o comentário que o defendia dizia que ele era mais escuro que o `--primary`
       — é o contrário (#1E4B7A contra #1D3A5D). Some com a cor e some com a confusão.
       ⚠ 28px DECLARADOS, não derivados de padding: a barra é o topo de TODAS as telas, e a
       altura dela entra na conta de altura útil de cada lista abaixo. Medida declarada é
       medida que não muda quando o conteúdo muda. É a altura que a barra tinha no
       `c01a10e3`, onde ela caía do conteúdo (`py-1` mais 13px de linha, ≈27,5px) — o
       mesmo tamanho, agora dito em vez de acontecido. */
    <header className="sticky top-0 z-40 flex h-7 shrink-0 items-center justify-between gap-3 bg-primary px-5 shadow-md">
      {/* ⚠ 14px, E A HIERARQUIA É A DO MENU: o GRUPO se afirma (500) e a TELA acompanha
          (400, /90). O separador recua para /60 — ele organiza, não informa. */}
      <p className="min-w-0 truncate text-[14px] leading-none text-primary-foreground">
        <span className="font-medium">{area}</span>
        <span className="mx-1 text-primary-foreground/60"> / </span>
        <span className="font-normal text-primary-foreground/90">{secao}</span>
      </p>
      <span className="flex shrink-0 items-center" style={{ gap: '14px' }}>
        <span className="max-w-[260px] truncate text-[12px] text-primary-foreground/80" title={nome}>{nome}</span>
        {/* ⚠ "SAIR" PASSA A VIVER AQUI — adendo do 01c. Ele estava no rodapé da sidebar, que
            no mobile nem existe: quem operava pelo celular não tinha por onde sair. Um
            lugar só, e é este; o ícone da sidebar saiu no mesmo PR. */}
        <button type="button" onClick={signOut} title="Sair" aria-label="Sair"
          className="shrink-0 text-primary-foreground/80 transition-colors hover:text-primary-foreground">
          <LogOut style={{ width: 16, height: 16 }} />
        </button>
      </span>
    </header>
  );
}
