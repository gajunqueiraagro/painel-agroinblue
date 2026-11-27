/**
 * MARCA-PADRAO-01 (marca aprovada pelo Gabriel 17/11, reconfirmada 24/11) — a marca AGROinBLUE num lugar só.
 * Os arquivos são os do kit (`src/assets/marca/`, SVG com o texto em CURVAS: nunca redigitar o nome em texto nem recriar em CSS).
 * Telas usam o componente `LogoAgroinblue`; PDFs usam `carregarLogoParaPdf` + `medidaDoLogoPdf` (o PNG certo e a proporção certa —
 * jsPDF não desenha SVG). O logo antigo (`assets/logo.png`, barras + boi + a assinatura antiga desenhada na imagem) saiu do repositório.
 */
import horizontalClaro from '@/assets/marca/logo-horizontal-fundo-claro.svg';
import horizontalEscuro from '@/assets/marca/logo-horizontal-fundo-escuro.svg';
import compactoClaro from '@/assets/marca/logo-compacto-fundo-claro.svg';
import compactoEscuro from '@/assets/marca/logo-compacto-fundo-escuro.svg';
import verticalClaro from '@/assets/marca/login-logo-vertical-fundo-claro.svg';
import carregandoClaro from '@/assets/marca/carregando-fundo-claro.svg';
import carregandoEscuro from '@/assets/marca/carregando-fundo-escuro.svg';
import pngHorizontalClaro from '@/assets/marca/logo-horizontal-fundo-claro.png';
import pngCompactoClaro from '@/assets/marca/logo-compacto-fundo-claro.png';

export const NOME_DA_MARCA = 'AGROinBLUE';
export const ASSINATURA_DA_MARCA = 'Gestão rural inteligente';
/** Rodapé de PDF e texto de rodapé: o nome + a assinatura, sempre assim. */
export const RODAPE_DA_MARCA = `${NOME_DA_MARCA} · ${ASSINATURA_DA_MARCA}`;

export type VarianteDoLogo = 'horizontal' | 'compacto' | 'vertical';
export type FundoDoLogo = 'claro' | 'escuro';

/** largura ÷ altura de cada arquivo (do viewBox do SVG; o PNG do kit tem a mesma proporção). */
export const PROPORCAO_DO_LOGO: Record<VarianteDoLogo, number> = {
  horizontal: 822 / 161,
  compacto: 793 / 132,
  vertical: 700 / 414,
};

const ARQUIVOS: Record<VarianteDoLogo, Partial<Record<FundoDoLogo, string>>> = {
  horizontal: { claro: horizontalClaro, escuro: horizontalEscuro },
  compacto: { claro: compactoClaro, escuro: compactoEscuro },
  vertical: { claro: verticalClaro },
};

/** O arquivo do logo. Abaixo de 28 px de altura o briefing manda o COMPACTO (a assinatura fica ilegível): `alturaPx` decide. */
export function arquivoDoLogo(variante: VarianteDoLogo, fundo: FundoDoLogo, alturaPx?: number): string {
  const v: VarianteDoLogo = variante === 'horizontal' && alturaPx !== undefined && alturaPx < 28 ? 'compacto' : variante;
  return ARQUIVOS[v][fundo] ?? ARQUIVOS[v].claro ?? compactoClaro;
}

export function arquivoDoCarregando(fundo: FundoDoLogo): string {
  return fundo === 'escuro' ? carregandoEscuro : carregandoClaro;
}

/** Medida do logo no PDF (mm): pela largura, a altura sai da proporção do arquivo — nunca "2:1" fixo (o logo antigo era 1,84:1). */
export function medidaDoLogoPdf(larguraMm: number, variante: 'horizontal' | 'compacto' = 'horizontal'): { w: number; h: number } {
  return { w: larguraMm, h: Math.round((larguraMm / PROPORCAO_DO_LOGO[variante]) * 100) / 100 };
}

/** O PNG (fundo claro) do PDF como dataURL — jsPDF e react-pdf recebem o mesmo. */
export function carregarLogoParaPdf(variante: 'horizontal' | 'compacto' = 'horizontal'): Promise<string> {
  const src = variante === 'compacto' ? pngCompactoClaro : pngHorizontalClaro;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = src;
  });
}
