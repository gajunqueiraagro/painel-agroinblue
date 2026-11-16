/**
 * PROD-CAMPOS-01 · a classe das três camadas, SÓ em Cadastros › Produtores (a ficha e, desde LIMPEZA-TELAS-01 item 3 de 16/11, os modais de
 * composição e de acordo de rateio). Movida VERBATIM do ProdutoresTela (o comentário e as classes byte a byte).
 */
import { cn } from '@/lib/utils';

/* PROD-CAMPOS-01 (mock aprovado pelo Gabriel 16/11 09:09): três camadas que não se confundem, SÓ nesta ficha (o padrão global fica como está;
   se aprovado em uso, vira o padrão dos formulários): fundo cinza · bloco (e quadro de tabela) branco com borda e sombra leve · campo
   BRANCO com borda mais escura e foco azul. O campo pendente (âmbar) e o com erro (vermelho) mantêm a borda deles. Classes literais
   (o Tailwind só gera o que está escrito por inteiro). */
export const CAMPOS_DA_FICHA = cn(
  'bg-[#e9edf2]',
  '[&_section]:border-[#d5dce5] [&_section]:bg-white [&_section]:shadow-[0_1px_2px_rgba(20,40,70,0.05)]',
  '[&_.bg-card]:border-[#d5dce5] [&_.bg-card]:bg-white',
  '[&_.border-input]:bg-white [&_.border-input:not([class*=amber]):not([class*=destructive])]:border-[#aab6c4]',
  '[&_.border-input:focus-visible]:border-[#1F3A5F] [&_.border-input:focus-visible]:ring-2 [&_.border-input:focus-visible]:ring-[#1F3A5F]/15 [&_.border-input:focus-visible]:ring-offset-0',
);
