/**
 * MARCA-PADRAO-01 — o ÚNICO componente do logo AGROinBLUE nas telas (menu, login, definir senha, abertura, página não encontrada, Header v1).
 * Nenhum ponto recria o nome em texto nem guarda cópia própria do arquivo: tudo passa por aqui (`src/lib/marca/marca.ts`).
 * A altura manda; a largura sai da proporção do arquivo. Abaixo de 28 px o horizontal vira compacto (regra do briefing).
 */
import { arquivoDoCarregando, arquivoDoLogo, NOME_DA_MARCA, ASSINATURA_DA_MARCA, type FundoDoLogo, type VarianteDoLogo } from '@/lib/marca/marca';

export function LogoAgroinblue({ variante = 'compacto', fundo = 'claro', alturaPx, className }: {
  variante?: VarianteDoLogo; fundo?: FundoDoLogo; alturaPx: number; className?: string;
}) {
  return (
    <img src={arquivoDoLogo(variante, fundo, alturaPx)} alt={`${NOME_DA_MARCA} · ${ASSINATURA_DA_MARCA}`} style={{ height: alturaPx, width: 'auto' }}
      className={className} data-testid="logo-agroinblue" data-variante={variante} draggable={false} />
  );
}

/** A abertura/carregando: o logo + as colunas animadas do kit (a animação respeita `prefers-reduced-motion` dentro do próprio SVG). */
export function CarregandoAgroinblue({ frase, fundo = 'claro' }: { frase: string; fundo?: FundoDoLogo }) {
  return (
    <div className="text-center flex flex-col items-center gap-3" data-testid="carregando-agroinblue">
      <LogoAgroinblue variante="compacto" fundo={fundo} alturaPx={32} />
      <img src={arquivoDoCarregando(fundo)} alt="" aria-hidden style={{ width: 44, height: 44 }} />
      <p className="text-muted-foreground font-semibold">{frase}</p>
    </div>
  );
}
