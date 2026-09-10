/**
 * BarraSecao — a faixa azul de 32px no topo das telas de seção. [PR-REC-01]
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
    /* ⚠ TODOS OS NÚMEROS DAQUI FORAM MEDIDOS, NÃO ESCOLHIDOS — PR-BARRA-FINANCAS-01. Saíram
       de `getComputedStyle` na barra do Finanças em 10/09/2026, e é por isso que são
       exatos até o `letter-spacing` de 0,275px: a barra tem de ser a MESMA nos dois
       produtos, e "parecida" é o que produz duas barras.
       ⚠ ELA JÁ FOI `#1e4b7a`, depois `bg-primary`, agora `--barra`. As duas primeiras eram
       tentativas de acertar de memória; esta é a medida. O token é próprio porque a sidebar
       do Agro NÃO acompanha — quando a barra usava `bg-primary`, mexer numa arrastava a
       outra.
       ⚠ 32px DECLARADOS, não derivados de padding: a barra é o topo de TODAS as telas, e a
       altura dela entra na conta de altura útil de cada lista abaixo. Medida declarada é
       medida que não muda quando o conteúdo muda. */
    <header
      className="sticky top-0 z-40 flex h-8 shrink-0 items-center justify-between gap-2 px-3 shadow-md"
      style={{ background: 'hsl(var(--barra))' }}
    >
      {/* ⚠ 11px NOS TRÊS, e a hierarquia é só de PESO e de opacidade: o grupo se afirma
          (600, branco), a tela acompanha (400, /90) e o separador recua (/40) — ele
          organiza, não informa. Tamanhos diferentes fariam a linha subir e descer. */}
      <p className="min-w-0 truncate text-[11px] leading-none text-white" style={{ letterSpacing: '0.275px' }}>
        <span className="font-semibold">{area}</span>
        <span className="mx-1 font-semibold text-white/40">/</span>
        <span className="font-normal text-white/90">{secao}</span>
      </p>
      <span className="flex shrink-0 items-center" style={{ gap: '8px' }}>
        <span className="max-w-[260px] truncate text-[10px] font-normal text-white/65" title={nome}>{nome}</span>
        {/* ⚠ "SAIR" PASSA A VIVER AQUI — adendo do 01c. Ele estava no rodapé da sidebar, que
            no mobile nem existe: quem operava pelo celular não tinha por onde sair. Um
            lugar só, e é este; o ícone da sidebar saiu no mesmo PR. */}
        <button type="button" onClick={signOut} title="Sair" aria-label="Sair"
          className="shrink-0 text-white/80 transition-colors hover:text-white">
          <LogOut style={{ width: 16, height: 16 }} />
        </button>
      </span>
    </header>
  );
}
