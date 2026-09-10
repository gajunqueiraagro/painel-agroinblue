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
    /* ⚠ COR LITERAL, UMA VEZ, AQUI — adendo do 01c. O azul da barra é o do Finanças, mais
       escuro que o `--primary` do AGRO; escrevê-lo como token exigiria mexer na paleta que
       o resto do sistema usa, e a barra é uma superfície só. Se um dia uma segunda peça
       precisar deste azul, ele vira token — a segunda cópia é o momento, não a primeira.
       ⚠ 44px DECLARADOS, não derivados de padding: a barra é o topo de TODAS as telas, e a
       altura dela entra na conta de altura útil de cada lista abaixo. Medida declarada é
       medida que não muda quando o conteúdo muda. */
    <header className="sticky top-0 z-40 flex h-[44px] shrink-0 items-center justify-between gap-3 px-6 shadow-md"
      style={{ background: '#1e4b7a' }}>
      {/* ⚠ 16px, E A HIERARQUIA MUDOU DE LADO: agora o GRUPO é que se afirma (500, branco) e
          a TELA acompanha (400, white/90). O separador recua para white/60 — ele organiza,
          não informa. */}
      <p className="min-w-0 truncate text-[16px] leading-none text-white">
        <span className="font-medium">{area}</span>
        <span className="mx-1 text-white/60"> / </span>
        <span className="font-normal text-white/90">{secao}</span>
      </p>
      <span className="flex shrink-0 items-center" style={{ gap: '14px' }}>
        <span className="max-w-[260px] truncate text-[13px] text-white/80" title={nome}>{nome}</span>
        {/* ⚠ "SAIR" PASSA A VIVER AQUI — adendo do 01c. Ele estava no rodapé da sidebar, que
            no mobile nem existe: quem operava pelo celular não tinha por onde sair. Um
            lugar só, e é este; o ícone da sidebar saiu no mesmo PR. */}
        <button type="button" onClick={signOut} title="Sair" aria-label="Sair"
          className="shrink-0 text-white/80 transition-colors hover:text-white">
          <LogOut style={{ width: 18, height: 18 }} />
        </button>
      </span>
    </header>
  );
}
