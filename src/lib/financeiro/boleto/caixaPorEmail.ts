/**
 * BOLETO D3d — A REGRA DA TELA da caixa por e-mail v2 (mock boleto-caixa-email-v2 aprovado 18/11 07:50, "D1–D7 sim"). Pura.
 *
 * ⚠ TRÊS ABAS (D1): A resolver · Resolvidos · Ignorados. "A resolver" junta, em GRUPOS: cada e-mail (os anexos juntos, D5), os PDFs
 *   arrastados nesta sessão e os boletos guardados na caixa sem lançamento.
 * ⚠ UMA LINHA POR COISA: a nota (o XML e o DANFE da MESMA chave no mesmo e-mail = uma linha, DOC-NOTA-XML-PDF-01) e cada boleto do
 *   arquivo (D7: o PDF com 2 fichas = 2 linhas).
 * ⚠ TRÊS VERBOS: Lançar (a nota vai à prévia do "+ Da nota") · Vincular (liga a um lançamento que já existe) · Ignorar (com motivo,
 *   volta pelo "Ignorados"). O boleto sem lançamento parecido ganha "Guardar" (entra na caixa e liga depois, como hoje).
 * ⚠ ANTIGO (D4): vencido há mais de 60 dias = selo vermelho e a ação sugerida vira "Ignorar" — nunca sozinha.
 * ⚠ "No sistema" é FRASE ("parcela 1/3 · …", "nenhum lançamento com esta nota"); a consulta que falhou diz "não consegui verificar"
 *   (P146), nunca "não lançada".
 * ⚠ CAIXA-GUARDAR-01 (D1 a, Gabriel 23/11): o grupo dos GUARDADOS vem PRIMEIRO; o guardado tem "Desfazer" (o e-mail volta para A resolver
 *   e o boleto vai para `descartado` com MOTIVO_DO_DESFEITO, nada se apaga); a linha do e-mail com o boleto descartado oferece "Guardar"
 *   de novo (reabre o MESMO boleto); em Resolvidos o guardado diz "guardado · sem lançamento" (âmbar), o ligado diz a que lançamento.
 */
import type { DetalheDoResolvido, EntradaDoEmail, NotaNoSistema } from './entradaEmailApi';
import type { ItemDaCaixa, RespostaDeEntrar } from './caixaApi';
import { dataBR, seloDoAchado, situacaoAVista, textoDoAchado, valorBR, type Selo } from './caixaDeBoletos';
import type { FolhaLida } from '@/lib/folha/lerFolha';
import { ROTULO_DO_TIPO, competenciaBR, fraseDaLinhaDaFolha } from '@/lib/folha/folhaNaCaixa';

export type AbaDaCaixaV2 = 'a_resolver' | 'resolvidos' | 'ignorados';
export const ABAS_DA_CAIXA_V2: readonly { valor: AbaDaCaixaV2; rotulo: string }[] = [
  { valor: 'a_resolver', rotulo: 'A resolver' }, { valor: 'resolvidos', rotulo: 'Resolvidos' }, { valor: 'ignorados', rotulo: 'Ignorados' },
];

/* ═══ o que a leitura do arquivo deu ═══ */
export interface ResumoDaNota {
  chave: string; numero: string; emitente: string | null; valor: number | null;
  /** O 1º vencimento das duplicatas (sem duplicata: null). */
  vencimento: string | null;
}
export interface BoletoLido { codigoBarras: string; linha: string; vencimento: string | null; valor: number | null; beneficiario: string | null }
export type Lido =
  | { k: 'lendo' }
  | { k: 'nota'; nota: ResumoDaNota }
  | { k: 'boletos'; boletos: BoletoLido[] }
  /** FOLHA-NA-CAIXA-01: o recibo do contador (o `lerFolha` reconheceu) */
  | { k: 'folha'; folha: FolhaLida }
  | { k: 'nada'; frase: string }
  | { k: 'senha'; errada: boolean }
  | { k: 'erro'; frase: string };

/** O resultado da consulta "esta nota já está num lançamento?": `undefined` = perguntando; `'erro'` = não deu para saber. */
export type ConsultaDaNota = NotaNoSistema | null | 'erro' | undefined;
/** A prévia da caixa para UM boleto (a `fn_boleto_entrar` com `p_simular`): `undefined` = perguntando. */
export type ConsultaDoBoleto = RespostaDeEntrar | { ok: 'erro'; frase: string } | undefined;

export type Acao = 'lancar_nota' | 'vincular_nota' | 'vincular_boleto' | 'guardar' | 'desfazer' | 'ignorar' | 'senha' | 'abrir_folha';

/** CAIXA-GUARDAR-01: o motivo do boleto tirado da caixa pelo "Desfazer" do guardado (a trilha do boleto o guarda). */
export const MOTIVO_DO_DESFEITO = 'guardado por engano — desfeito';
export type TipoDaLinha = 'nota' | 'boleto' | 'folha' | 'nada' | 'lendo' | 'senha' | 'erro' | 'sem_anexo' | 'recusado' | 'gmail';

export interface LinhaDaCaixa {
  chave: string;
  tipo: TipoDaLinha;
  /** As fontes (entrada de e-mail ou arquivo arrastado) por trás da linha: a nota XML + PDF tem duas. A 1ª é a que se VÊ (o PDF). */
  fontes: string[];
  arquivo: string; arquivoTitulo: string;
  emitente: string | null; vencimento: string | null; valor: number | null;
  antigo: boolean;
  noSistema: { selo: Selo | null; texto: string; titulo: string };
  /** A 1ª é a principal (o botão dourado). Vazia = nada a fazer (feito nesta sessão). */
  acoes: Acao[];
  nota: ResumoDaNota | null; notaNoSistema: NotaNoSistema | null;
  boleto: BoletoLido | null; previa: RespostaDeEntrar | null;
  /** FOLHA-NA-CAIXA-01: o recibo do contador lido (a prévia abre pelo "Abrir") */
  folha: FolhaLida | null;
  /** O boleto que JÁ está gravado na caixa (o grupo "guardados", ou o "já está no sistema"). */
  boletoGuardadoId: string | null;
  /** Nesta sessão já foi resolvido (o PDF com 2 boletos: um feito, o outro não). */
  feito: boolean;
}
export interface GrupoDaCaixa {
  chave: string; tipo: 'email' | 'local' | 'guardados';
  titulo: string; assunto: string | null;
  linhas: LinhaDaCaixa[];
  /** As fontes cujas linhas são TODAS antigas (o "Ignorar os N antigos" do grupo). */
  fontesAntigas: string[];
}

export const DIAS_PARA_ANTIGO = 60;
const DIA = 86_400_000;
const diasDesde = (iso: string, hoje: string) => Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T12:00:00Z`)) / DIA);
export const ehAntigo = (vencimento: string | null, hoje: string): boolean => !!vencimento && diasDesde(vencimento, hoje) > DIAS_PARA_ANTIGO;
/** "venceu há 1 ano e 7 meses" · "venceu há 3 meses" (só para o antigo: mais de 60 dias). */
export function fraseDoVencido(vencimento: string, hoje: string): string {
  const meses = Math.floor(diasDesde(vencimento, hoje) / 30.44);
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anos === 0) return `venceu há ${meses} meses`;
  const a = anos === 1 ? '1 ano' : `${anos} anos`;
  return resto === 0 ? `venceu há ${a}` : `venceu há ${a} e ${resto} ${resto === 1 ? 'mês' : 'meses'}`;
}

export const numeroDaNota = (n: string): string => {
  const d = n.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return d ? Number(d).toLocaleString('pt-BR') : n;
};
/** O número da NF no formato dos DOCUMENTOS do lançamento ("000.122.048": 9 dígitos em grupos de 3, como o "+ Da nota" grava). */
export const numeroDaNotaComPontos = (n: string): string => {
  const d = n.replace(/\D/g, '');
  if (!d || d.length > 9) return n;
  return d.padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
};

/* ═══ as linhas ═══ */
const SELO: Record<string, Selo> = {
  procurando: { texto: 'procurando…', tom: 'cinza' },
  nao_lancada: { texto: 'não lançada', tom: 'ambar' },
  nao_verificada: { texto: 'não verificada', tom: 'ambar' },
  ja_lancada: { texto: 'já lançada', tom: 'ok' },
  antigo: { texto: 'antigo', tom: 'vermelho' },
  nao_entra: { texto: 'não entra', tom: 'vermelho' },
  ja_ligado: { texto: 'já ligado', tom: 'ok' },
  sem_lancamento: { texto: 'sem lançamento', tom: 'ambar' },
  feito: { texto: 'feito', tom: 'ok' },
  desfeito: { texto: 'fora da caixa', tom: 'cinza' },
  guardado: { texto: 'guardado · sem lançamento', tom: 'ambar' },
};

/** O que fazer com o que não tem arquivo para ler (sem anexo, recusado, a confirmação do Gmail). */
function linhaSemArquivo(e: EntradaDoEmail, fonte: string): LinhaDaCaixa {
  const tipo: TipoDaLinha = e.estado === 'sem_anexo' ? 'sem_anexo' : e.estado === 'recusado' ? 'recusado' : 'gmail';
  const texto = tipo === 'sem_anexo' ? 'Chegou sem PDF nem XML. Se o boleto vem por link, baixe-o no seu e-mail e arraste aqui.'
    : tipo === 'recusado' ? (e.motivo ?? 'O arquivo foi recusado na entrada.')
      : 'O Gmail pede para confirmar o encaminhamento: o código está no assunto. Digite-o no Gmail e ignore esta linha.';
  return base(`${fonte}`, tipo, [fonte], e.arquivoNome ?? '—', e.arquivoNome ?? (tipo === 'gmail' ? (e.assunto ?? '') : '—'),
    { selo: null, texto, titulo: texto }, ['ignorar']);
}

function base(chave: string, tipo: TipoDaLinha, fontes: string[], arquivo: string, arquivoTitulo: string,
  noSistema: LinhaDaCaixa['noSistema'], acoes: Acao[]): LinhaDaCaixa {
  return {
    chave, tipo, fontes, arquivo, arquivoTitulo, emitente: null, vencimento: null, valor: null, antigo: false, noSistema, acoes,
    nota: null, notaNoSistema: null, boleto: null, previa: null, folha: null, boletoGuardadoId: null, feito: false,
  };
}

/** A linha da nota (uma ou mais fontes com a MESMA chave). */
export function linhaDaNota(chave: string, fontes: string[], tiposDosArquivos: ('xml' | 'pdf')[], nota: ResumoDaNota, consulta: ConsultaDaNota,
  podeLancar: boolean): LinhaDaCaixa {
  const tem = (t: 'xml' | 'pdf') => tiposDosArquivos.includes(t);
  const arquivo = `NF ${numeroDaNota(nota.numero)} · ${tem('xml') && tem('pdf') ? 'XML + PDF' : tem('xml') ? 'XML' : 'PDF'}`;
  let noSistema: LinhaDaCaixa['noSistema'];
  let acoes: Acao[];
  if (consulta === undefined) {
    noSistema = { selo: SELO.procurando, texto: 'procurando a nota nos lançamentos', titulo: 'procurando a nota nos lançamentos' };
    acoes = ['ignorar'];
  } else if (consulta === 'erro') {
    const t = 'Não consegui verificar se esta nota já está lançada. "Lançar nota" abre a prévia, que confere de novo.';
    noSistema = { selo: SELO.nao_verificada, texto: t, titulo: t };
    acoes = podeLancar ? ['lancar_nota', 'ignorar'] : ['ignorar'];
  } else if (consulta === null) {
    const t = podeLancar ? 'nenhum lançamento com esta nota · "Lançar nota" abre a prévia do "+ Da nota"'
      : 'nenhum lançamento com esta nota · lance pelo "+ Novo › Da nota fiscal" da tela de Lançamentos';
    noSistema = { selo: SELO.nao_lancada, texto: 'nenhum lançamento com esta nota', titulo: t };
    acoes = podeLancar ? ['lancar_nota', 'ignorar'] : ['ignorar'];
  } else {
    const t = `${consulta.descricao ?? 'lançamento'} · ${dataBR(consulta.vencimento)} · ${valorBR(consulta.valor)}`;
    noSistema = { selo: SELO.ja_lancada, texto: t, titulo: `a nota já está neste lançamento: ${t} · "Vincular" marca como resolvido` };
    acoes = ['vincular_nota', 'ignorar'];
  }
  return {
    ...base(chave, 'nota', fontes, arquivo, arquivo, noSistema, acoes),
    emitente: nota.emitente, vencimento: nota.vencimento, valor: nota.valor, nota, notaNoSistema: consulta && consulta !== 'erro' ? consulta : null,
  };
}

/** A linha de UM boleto (lido de um arquivo, ou guardado na caixa). */
export function linhaDoBoleto(chave: string, fontes: string[], arquivo: string, arquivoTitulo: string, b: BoletoLido, consulta: ConsultaDoBoleto,
  hoje: string, guardadoId: string | null): LinhaDaCaixa {
  const antigo = ehAntigo(b.vencimento, hoje);
  let noSistema: LinhaDaCaixa['noSistema'];
  let acoes: Acao[];
  let previa: RespostaDeEntrar | null = null;
  let boletoGuardadoId = guardadoId;
  if (consulta === undefined) {
    noSistema = { selo: SELO.procurando, texto: 'procurando o lançamento', titulo: 'procurando o lançamento' };
    acoes = ['ignorar'];
  } else if (consulta.ok === 'erro' || consulta.ok === false) {
    noSistema = { selo: SELO.nao_entra, texto: consulta.frase, titulo: consulta.frase };
    acoes = ['ignorar'];
  } else {
    previa = consulta;
    if (consulta.jaExiste) boletoGuardadoId = consulta.id;
    const ligado = consulta.jaExiste ? consulta.situacao.lancamentos[0] : undefined;
    if (ligado) {
      const t = `${ligado.descricao ?? 'lançamento'} · ${dataBR(ligado.vencimento)} · ${situacaoAVista(ligado)}`;
      noSistema = { selo: SELO.ja_ligado, texto: t, titulo: `o boleto já está na caixa, ligado a: ${t} · "Vincular" marca como resolvido` };
      acoes = ['vincular_boleto', 'ignorar'];
    } else if (consulta.jaExiste && consulta.boleto.situacao === 'descartado') {
      /* CAIXA-GUARDAR-01: o boleto foi tirado da caixa (Desfazer ou Ignorar): "Guardar" reabre o MESMO boleto (nunca um segundo) */
      const t = 'tirado da caixa · "Guardar" põe de volta o mesmo boleto';
      noSistema = { selo: SELO.desfeito, texto: t, titulo: t };
      acoes = ['guardar', 'ignorar'];
    } else if (consulta.candidatos.length) {
      const t = textoDoAchado(consulta.candidatos);
      noSistema = { selo: seloDoAchado(consulta.candidatos), texto: t, titulo: t };
      acoes = ['vincular_boleto', 'ignorar'];
    } else {
      const t = 'nenhum lançamento parecido · "Guardar" põe na caixa e ele liga quando o lançamento existir';
      noSistema = { selo: SELO.sem_lancamento, texto: 'nenhum lançamento parecido', titulo: t };
      acoes = guardadoId || consulta.jaExiste ? ['ignorar'] : ['guardar', 'ignorar'];
    }
  }
  if (antigo && b.vencimento) {
    const t = fraseDoVencido(b.vencimento, hoje);
    noSistema = { selo: SELO.antigo, texto: t, titulo: `${t} (${dataBR(b.vencimento)}) · ${noSistema.titulo}` };
    acoes = ['ignorar', ...acoes.filter((a) => a !== 'ignorar')];
  }
  return {
    ...base(chave, 'boleto', fontes, arquivo, arquivoTitulo, noSistema, acoes),
    emitente: b.beneficiario, vencimento: b.vencimento, valor: b.valor, antigo, boleto: b, previa, boletoGuardadoId,
  };
}

/** A linha de um arquivo lido que não é boleto nem nota, ainda lendo, com senha ou com erro. */
export function linhaSemConteudo(chave: string, fonte: string, nome: string, lido: Exclude<Lido, { k: 'nota' } | { k: 'boletos' } | { k: 'folha' }>): LinhaDaCaixa {
  switch (lido.k) {
    case 'lendo': return base(chave, 'lendo', [fonte], nome, nome, { selo: null, texto: 'lendo o arquivo…', titulo: 'lendo o arquivo…' }, []);
    case 'senha': {
      const t = lido.errada ? 'A senha não abriu o PDF. Confira e tente de novo (ela não é guardada).' : 'PDF com senha: digite a senha para ler (ela não é guardada).';
      return base(chave, 'senha', [fonte], nome, nome, { selo: { texto: 'com senha', tom: 'ambar' }, texto: t, titulo: t }, ['senha', 'ignorar']);
    }
    case 'erro': return base(chave, 'erro', [fonte], nome, nome, { selo: { texto: 'erro', tom: 'vermelho' }, texto: lido.frase, titulo: lido.frase }, ['ignorar']);
    case 'nada': return base(chave, 'nada', [fonte], nome, nome, { selo: null, texto: lido.frase, titulo: `${lido.frase} Clique na linha para ver o arquivo.` }, ['ignorar']);
  }
}

/** FOLHA-NA-CAIXA-01 — a linha do recibo do contador: "Folha" · o arquivo · tipo e competência · N pessoas · o total; "Abrir" = a prévia
 *  por funcionário (nada grava antes do Aprovar). */
export function linhaDaFolha(chave: string, fonte: string, nome: string, folha: FolhaLida): LinhaDaCaixa {
  const t = fraseDaLinhaDaFolha(folha);
  return {
    ...base(chave, 'folha', [fonte], nome, nome,
      { selo: { texto: 'a aplicar', tom: 'ambar' }, texto: t, titulo: `${t} · "Abrir" mostra a prévia por funcionário (nada grava antes do Aprovar)` },
      ['abrir_folha', 'ignorar']),
    emitente: `${ROTULO_DO_TIPO[folha.tipo]} · ${competenciaBR(folha.competencia)}`, valor: folha.total, folha,
  };
}

export const FRASE_NEM_BOLETO_NEM_NOTA = 'Sem linha digitável nem chave de nota.';
/** CAIXA-FOLHA-AVISO-01: o PDF que parece recibo de pagamento, enquanto a Folha não é lida pela Caixa. */
export const FRASE_FOLHA_AINDA_NAO = 'Folha ainda não é lida aqui — fale com o consultor.';

/* ═══ os grupos de "A resolver" ═══ */
export interface FonteParaMontar {
  /** A chave da fonte: o id da entrada ou a chave do arquivo arrastado. */
  chave: string;
  nome: string;
  tipoDoArquivo: 'xml' | 'pdf';
  lido: Lido;
}
export interface EntradaParaMontar { tipo: 'email'; entrada: EntradaDoEmail; lido: Lido | null }

/** As linhas de um conjunto de fontes (um e-mail, ou os arrastados): junta as notas pela chave; um boleto por linha. */
export function linhasDasFontes(fontes: readonly FonteParaMontar[], notas: Record<string, ConsultaDaNota>, boletos: Record<string, ConsultaDoBoleto>,
  hoje: string, podeLancar: boolean, feitos: ReadonlySet<string>): LinhaDaCaixa[] {
  const linhas: LinhaDaCaixa[] = [];
  const porChave = new Map<string, { fontes: string[]; tipos: ('xml' | 'pdf')[]; nota: ResumoDaNota; i: number }>();
  for (const f of fontes) {
    const l = f.lido;
    if (l.k === 'nota') {
      const ja = porChave.get(l.nota.chave);
      if (ja) {
        /* o PDF é o que se vê: vai à frente */
        if (f.tipoDoArquivo === 'pdf') ja.fontes.unshift(f.chave); else ja.fontes.push(f.chave);
        ja.tipos.push(f.tipoDoArquivo);
        /* o XML manda sobre o PDF (ITENS-NOTA-01) */
        if (f.tipoDoArquivo === 'xml') ja.nota = l.nota;
        continue;
      }
      porChave.set(l.nota.chave, { fontes: [f.chave], tipos: [f.tipoDoArquivo], nota: l.nota, i: linhas.length });
      linhas.push(base('', 'nota', [], '', '', { selo: null, texto: '', titulo: '' }, []));   // reservado: a ordem do e-mail
    } else if (l.k === 'boletos') {
      l.boletos.forEach((b, i) => {
        const chave = `${f.chave}#${b.codigoBarras}`;
        const arquivo = l.boletos.length > 1 ? `${f.nome} · ${i + 1} de ${l.boletos.length}` : f.nome;
        const linha = linhaDoBoleto(chave, [f.chave], arquivo, f.nome, b, boletos[chave], hoje, null);
        linhas.push(feitos.has(chave) ? comoFeito(linha) : linha);
      });
    } else if (l.k === 'folha') {
      const linha = linhaDaFolha(`folha:${f.chave}`, f.chave, f.nome, l.folha);
      linhas.push(feitos.has(linha.chave) ? comoFeito(linha) : linha);
    } else {
      linhas.push(linhaSemConteudo(f.chave, f.chave, f.nome, l));
    }
  }
  for (const [chave, g] of porChave) {
    const linha = linhaDaNota(`nota:${g.fontes[0]}`, g.fontes, g.tipos, g.nota, notas[chave], podeLancar);
    linhas[g.i] = feitos.has(linha.chave) ? comoFeito(linha) : linha;
  }
  return linhas;
}

const comoFeito = (l: LinhaDaCaixa): LinhaDaCaixa => ({
  ...l, feito: true, acoes: [], noSistema: { selo: SELO.feito, texto: l.noSistema.texto, titulo: `feito nesta sessão · ${l.noSistema.titulo}` },
});

const horaBR = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** "Natalino Cavalli Junior ADM <x@y>" → "Natalino Cavalli Junior ADM"; sem nome, o endereço. */
export const nomeDoRemetente = (r: string | null): string => {
  if (!r) return '—';
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(r);
  return m ? (m[1].trim() || m[2].trim()) : r.trim();
};

/** As entradas ABERTAS (a ler, não reconhecido, sem anexo, recusado, confirmação) → um grupo por e-mail, mais novo primeiro. */
export function gruposDosEmails(entradas: readonly EntradaDoEmail[], lidos: Record<string, Lido | undefined>, notas: Record<string, ConsultaDaNota>,
  boletos: Record<string, ConsultaDoBoleto>, hoje: string, podeLancar: boolean, feitos: ReadonlySet<string>): GrupoDaCaixa[] {
  const abertas = entradas.filter((e) => ['a_ler', 'nao_reconhecido', 'sem_anexo', 'recusado', 'confirmacao_gmail'].includes(e.estado));
  const porMensagem = new Map<string, EntradaDoEmail[]>();
  for (const e of abertas) porMensagem.set(e.mensagemId, [...(porMensagem.get(e.mensagemId) ?? []), e]);
  const grupos: GrupoDaCaixa[] = [];
  for (const [mensagem, es] of porMensagem) {
    const ordenadas = [...es].sort((a, b) => (a.arquivoNome ?? '').localeCompare(b.arquivoNome ?? ''));
    const comArquivo: FonteParaMontar[] = [];
    const semArquivo: LinhaDaCaixa[] = [];
    for (const e of ordenadas) {
      if (!e.storagePath || !e.tipo) { semArquivo.push(linhaSemArquivo(e, e.id)); continue; }
      comArquivo.push({ chave: e.id, nome: e.arquivoNome ?? 'arquivo', tipoDoArquivo: e.tipo, lido: lidos[e.id] ?? { k: 'lendo' } });
    }
    const linhas = [...linhasDasFontes(comArquivo, notas, boletos, hoje, podeLancar, feitos), ...semArquivo];
    const primeira = es[0];
    grupos.push({
      chave: `email:${mensagem}`, tipo: 'email', titulo: `${horaBR(primeira.recebidoEm)} · ${nomeDoRemetente(primeira.remetente)}`,
      assunto: primeira.assunto, linhas, fontesAntigas: fontesAntigas(linhas),
      /* a ordem: o mais novo primeiro (pelo recebido_em do 1º anexo) */
    });
  }
  const quando = (g: GrupoDaCaixa) => es0(entradas, g)?.recebidoEm ?? '';
  return grupos.sort((a, b) => quando(b).localeCompare(quando(a)));
}
const es0 = (entradas: readonly EntradaDoEmail[], g: GrupoDaCaixa) => entradas.find((e) => `email:${e.mensagemId}` === g.chave);

/** As fontes em que TODA linha (não feita) é antiga: o "Ignorar os N antigos" do grupo (precisa de 2+ linhas). */
export function fontesAntigas(linhas: readonly LinhaDaCaixa[]): string[] {
  const vivas = linhas.filter((l) => !l.feito);
  const fontes = [...new Set(vivas.flatMap((l) => l.fontes))];
  const antigas = fontes.filter((f) => vivas.filter((l) => l.fontes.includes(f)).every((l) => l.antigo));
  return vivas.filter((l) => l.antigo).length >= 2 ? antigas : [];
}

/** O grupo dos boletos já GUARDADOS na caixa sem lançamento (novo / sem par). */
export function grupoDosGuardados(itens: readonly ItemDaCaixa[], boletos: Record<string, ConsultaDoBoleto>, hoje: string,
  feitos: ReadonlySet<string>): GrupoDaCaixa | null {
  const sem = itens.filter((i) => (i.boleto.situacao === 'novo' || i.boleto.situacao === 'sem_par') && i.boleto.id);
  if (!sem.length) return null;
  const linhas = sem.map((i) => {
    const id = i.boleto.id ?? '';
    const chave = `guardado:${id}`;
    const b: BoletoLido = { codigoBarras: i.boleto.codigoBarras, linha: i.boleto.linhaDigitavel, vencimento: i.boleto.vencimento, valor: i.boleto.valor,
      beneficiario: i.boleto.beneficiarioNome };
    const nome = i.boleto.arquivoNome ?? 'boleto na caixa';
    const l = linhaDoBoleto(chave, [chave], nome, nome, b, boletos[chave], hoje, id);
    if (feitos.has(chave)) return comoFeito(l);
    /* CAIXA-GUARDAR-01: o guardado se desfaz — antes do "Ignorar" do fim; no ANTIGO o "Ignorar" segue sugerido (1º) e o Desfazer vai ao fim */
    const acoes: Acao[] = l.antigo ? [...l.acoes, 'desfazer'] : [...l.acoes.filter((a) => a !== 'ignorar'), 'desfazer', 'ignorar'];
    return { ...l, acoes };
  });
  return { chave: 'guardados', tipo: 'guardados', titulo: 'Na caixa, sem lançamento', assunto: 'boletos guardados que ainda não ligaram a um lançamento',
    linhas, fontesAntigas: fontesAntigas(linhas) };
}

/** CAIXA-GUARDAR-01 — o "O que virou" de uma linha de Resolvidos. O boleto GUARDADO (novo / sem par) diz que está sem lançamento, em
 *  âmbar, e só ele tem o Desfazer completo (`guardadoId`); o ligado diz a que lançamento. */
export function virouDaEntrada(e: EntradaDoEmail, itens: readonly ItemDaCaixa[] | null, detalhe?: DetalheDoResolvido): { selo: Selo | null; texto: string; guardadoId: string | null } {
  if (e.estado === 'nota') {
    const d = detalhe?.nota?.descricao;
    return { selo: null, texto: d ? `nota no lançamento ${d}` : e.lancamentoId ? 'nota no lançamento' : 'nota lançada', guardadoId: null };
  }
  if (e.estado === 'folha') {
    /* FOLHA-NA-CAIXA-01b (Gabriel 14:03): o que gerou — "13º 1ª parcela · 11/2026 · 3 lançamentos" (118610, pela trilha do recibo) */
    const f = detalhe?.folha;
    const tipo = f?.tipo === '13_1' || f?.tipo === '13_2' || f?.tipo === 'mensal' ? ROTULO_DO_TIPO[f.tipo] : null;
    return { selo: null, texto: f && tipo ? `${tipo} · ${competenciaBR(f.competencia ?? '')} · ${f.lancamentos} ${f.lancamentos === 1 ? 'lançamento' : 'lançamentos'}` : 'folha aplicada', guardadoId: null };
  }
  const i = e.boletoId ? itens?.find((x) => x.boleto.id === e.boletoId) : undefined;
  if (i && (i.boleto.situacao === 'novo' || i.boleto.situacao === 'sem_par')) {
    return { selo: SELO.guardado, texto: 'guardado · sem lançamento', guardadoId: i.boleto.id };
  }
  const l = i?.boleto.situacao === 'ligado' ? i.situacao.lancamentos[0] : undefined;
  if (l) return { selo: null, texto: `ligado a ${l.descricao ?? 'lançamento'} · ${dataBR(l.vencimento)}`, guardadoId: null };
  return { selo: null, texto: 'boleto na caixa', guardadoId: null };
}

/** Quantos pedem gesto (o contador da aba): as linhas com ação, sem contar as "lendo". */
export const contarAResolver = (grupos: readonly GrupoDaCaixa[]): number =>
  grupos.reduce((n, g) => n + g.linhas.filter((l) => l.acoes.length > 0).length, 0);

/* ═══ os botões ═══ */
export const ROTULO_DA_ACAO: Record<Acao, string> = {
  lancar_nota: 'Lançar nota', vincular_nota: 'Vincular', vincular_boleto: 'Vincular', guardar: 'Guardar', desfazer: 'Desfazer', ignorar: 'Ignorar',
  senha: 'Senha', abrir_folha: 'Abrir',
};
/** A prévia diz que o boleto já existe E já está ligado a lançamento (o "Vincular" só resolve a linha). */
export function boletoJaLigado(p: LinhaDaCaixa['previa']): boolean {
  return !!p && 'jaExiste' in p && p.jaExiste && p.situacao.lancamentos.length > 0;
}
export function tituloDaAcao(a: Acao, l: LinhaDaCaixa): string {
  switch (a) {
    case 'lancar_nota': return 'abre a prévia do "+ Da nota" com este arquivo: nada é gravado antes de você confirmar';
    case 'vincular_nota': return 'a nota já está no lançamento: marca como resolvido';
    case 'vincular_boleto': return boletoJaLigado(l.previa)
      ? 'o boleto já está ligado: marca como resolvido' : `liga o boleto a: ${l.noSistema.texto}`;
    case 'guardar': return 'põe o boleto na caixa sem lançamento (liga depois, quando o lançamento existir)';
    case 'desfazer': return 'o e-mail volta para A resolver e o boleto sai da caixa (nada se apaga); "Guardar" de novo reabre o mesmo boleto';
    case 'ignorar': return 'pede o motivo; nada é apagado e volta pelo "Ignorados"';
    case 'senha': return 'digite a senha do PDF (ela não é guardada)';
    case 'abrir_folha': return 'mostra a prévia por funcionário (o que casa, o que cria, o valor e o vencimento): nada grava antes do Aprovar';
  }
}
