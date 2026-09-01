import { CUSTEIO_FORMAT } from '@/v2/lib/custeio/parseCusteioTxt';

/**
 * O que este arquivo é — a decisão que roteia o hub de importação.
 * FIN-IMPORTAR-HUB-UNICO-01 (B-36).
 *
 * ⚠ EXTENSÃO PRIMEIRO, CONTEÚDO DESEMPATA, e a ordem é o argumento: a extensão
 * é a intenção declarada de quem salvou o arquivo e acerta na esmagadora
 * maioria; o conteúdo é a única coisa que não mente. Só conteúdo seria lento e
 * frágil (um Excel é binário); só extensão erraria no caso que existe de
 * verdade — ver abaixo.
 *
 * ⚠ DOIS FORMATOS LEGÍTIMOS USAM `.txt`, e é por isso que este módulo existe:
 *   · extrato bancário em texto delimitado → vira MOVIMENTO de extrato;
 *   · relatório de custeio (Raul/Monterrey) → vira LANÇAMENTO, um a um.
 * Roteados pela extensão, os dois cairiam no mesmo parser. O relatório de
 * custeio no leitor de extrato não daria erro: daria "nenhum movimento
 * encontrado", que é a mensagem errada para o arquivo certo — e o operador
 * concluiria que o arquivo está vazio.
 *
 * ⚠ AS ÂNCORAS DO CUSTEIO SÃO AS DELE, importadas de `CUSTEIO_FORMAT`. Copiar os
 * regex para cá criaria o segundo lugar onde o formato é descrito, e o dia em
 * que o relatório mudasse de cabeçalho os dois discordariam.
 */

export type TipoArquivoImport = 'ofx' | 'excel' | 'custeio-txt' | 'csv-extrato';

export interface DeteccaoArquivo {
  tipo: TipoArquivoImport | null;
  /**
   * Preenchido quando a extensão promete uma coisa e o conteúdo mostra outra.
   *
   * ⚠ AVISO NOMEIA O QUE PARECE SER — a regra da extensão mentirosa. "Formato
   * não reconhecido" manda o operador adivinhar; "isto parece um relatório de
   * custeio, não um extrato" diz o que fazer a seguir.
   */
  aviso: string | null;
}

/** O custeio se reconhece pelos três prefixos ANCORADOS, nunca por `includes`. */
export function pareceCusteio(conteudo: string): boolean {
  const linhas = conteudo.split(/\r?\n/, 400).map(l => l.trim());
  const tem = (re: RegExp) => linhas.some(l => re.test(l));
  /* As três juntas: "Fazenda:" sozinho aparece em relatório de qualquer coisa.
     É a combinação que identifica o formato. */
  return tem(CUSTEIO_FORMAT.prefixoFazenda)
    && tem(CUSTEIO_FORMAT.prefixoFamilia)
    && tem(CUSTEIO_FORMAT.prefixoSubfamilia);
}

/** OFX se reconhece pela própria tag, com ou sem a extensão certa. */
export function pareceOFX(conteudo: string): boolean {
  return /<OFX>/i.test(conteudo) || /<STMTTRN>/i.test(conteudo);
}

/**
 * @param nome     nome do arquivo, para a extensão
 * @param conteudo primeiros bytes em texto; vazio para binários (Excel)
 */
export function detectarTipoArquivo(nome: string, conteudo: string): DeteccaoArquivo {
  const lower = nome.toLowerCase();

  /* ⚠ EXCEL É BINÁRIO e não tem conteúdo de texto para conferir: a extensão é
     tudo o que há, e o parser dele falha alto se o arquivo não for um xlsx. */
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return { tipo: 'excel', aviso: null };
  }

  if (lower.endsWith('.ofx')) {
    /* Extensão diz OFX e o conteúdo não tem a tag: parar aqui é melhor que
       entregar zero movimentos como se o extrato estivesse vazio. */
    if (!pareceOFX(conteudo)) {
      return {
        tipo: null,
        aviso: pareceCusteio(conteudo)
          ? 'O arquivo tem extensão .ofx, mas o conteúdo é um relatório de custeio. Renomeie para .txt e envie de novo.'
          : 'O arquivo tem extensão .ofx, mas não contém as marcações de um extrato OFX. Confira se é o arquivo certo do banco.',
      };
    }
    return { tipo: 'ofx', aviso: null };
  }

  /* ⚠ O DESEMPATE DO `.txt` — o caso que motivou este módulo. */
  if (lower.endsWith('.txt')) {
    if (pareceCusteio(conteudo)) return { tipo: 'custeio-txt', aviso: null };
    if (pareceOFX(conteudo)) return { tipo: 'ofx', aviso: null };
    return { tipo: 'csv-extrato', aviso: null };
  }

  if (lower.endsWith('.csv')) {
    /* Custeio salvo como .csv: a extensão mente, e as âncoras não. */
    if (pareceCusteio(conteudo)) {
      return {
        tipo: null,
        aviso: 'O arquivo tem extensão .csv, mas o conteúdo é um relatório de custeio. Renomeie para .txt e envie de novo.',
      };
    }
    if (pareceOFX(conteudo)) return { tipo: 'ofx', aviso: null };
    return { tipo: 'csv-extrato', aviso: null };
  }

  /* Extensão desconhecida: o conteúdo ainda pode salvar o arquivo, e tentar é
     melhor que recusar quem exportou com nome estranho. */
  if (pareceOFX(conteudo)) return { tipo: 'ofx', aviso: null };
  if (pareceCusteio(conteudo)) return { tipo: 'custeio-txt', aviso: null };
  return {
    tipo: null,
    aviso: 'Formato não reconhecido. Esta tela aceita extrato do banco (.ofx), planilha de lançamentos (.xlsx) e relatório de custeio (.txt).',
  };
}
