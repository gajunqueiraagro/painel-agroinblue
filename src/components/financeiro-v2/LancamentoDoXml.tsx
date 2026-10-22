/**
 * O QUE O "NOVO LANCAMENTO" MOSTRA A MAIS QUANDO NASCE DE UM XML — FIN-NFE-XML-01d. So' desenha: quem decide e'
 * `proporLancamento` / `resolverEmitente` (`src/lib/financeiro/nfe/`). Sem `doXml`, nada daqui e' montado.
 *
 * ⚠ AMBAR = VEIO DO XML OU E' SUGESTAO. O estilo e' o MESMO da faixa "Preenchido com o que o lançamento diz" da aba
 *   Documentos (`border-amber-300 bg-amber-50 text-amber-900`); nao nasce segundo estilo.
 * ⚠ UMA LINHA POR FAIXA: o texto que nao cabe corta na faixa, com a frase inteira no `title`.
 */
import type { ReactNode } from 'react';
import type { DoXml } from '@/lib/financeiro/nfePrefill';
import type { CampoDoXml } from '@/lib/financeiro/nfe/proporLancamento';
import { dataCurta, documentoFormatado, reais, soDigitos } from '@/lib/financeiro/nfe/formatos';
import type { OcorrenciaDaNota } from '@/lib/financeiro/nfeConsultas';

/** As classes do campo em ambar — para somar ao fundo do campo. */
export const CAMPO_AMBAR = 'border-amber-300 bg-amber-50 dark:bg-amber-950/30';
/* ⚠ `min-w-0 overflow-hidden` NA FAIXA: a linha nunca pede ao hospedeiro mais largura que a que ele tem — o que nao cabe corta DENTRO
   dela (FORN-MESCLAR-02a / faixa do XML, 19/10/2026). Os gestos (caixa, "trocar fornecedor") sao `shrink-0`: sempre a' vista. */
const FAIXA = 'flex h-6 min-w-0 items-center gap-2 overflow-hidden rounded border border-amber-300 bg-amber-50 px-2 text-[10px] text-amber-900';
const LINK = 'shrink-0 font-medium underline underline-offset-2 hover:text-amber-950';

/** A origem escrita pequena ao lado do rotulo do campo. */
export function OrigemDoXml({ campo, origem }: { campo: CampoDoXml; origem: string }) {
  return <span className="float-right text-[9.5px] font-normal text-amber-800" data-testid={`origem-xml-${campo}`}>{origem}</span>;
}

/** A pilula do cabecalho: "do XML · NF 000.178.766". */
export function PilulaDoXml({ rotuloNota }: { rotuloNota: string }) {
  return (
    <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-px text-[10px] font-medium leading-none text-amber-900" data-testid="pilula-do-xml">
      do XML · {rotuloNota}
    </span>
  );
}

function Faixa({ testid, titulo, children }: { testid: string; titulo: string; children: ReactNode }) {
  return <div className={FAIXA} data-testid={testid} title={titulo}>{children}</div>;
}

/** Onde a nota ja' esta': "<descricao> · dd/mm/aa". */
export function ondeEsta(o: OcorrenciaDaNota): string {
  const partes = [o.origem === 'oc' ? `Operação · ${o.descricao ?? 'sem descrição'}` : (o.descricao ?? 'lançamento'), dataCurta(o.data)];
  return partes.join(' · ');
}

/**
 * A FAIXA DO FORNECEDOR — uma so', conforme o caso. `null` quando o fornecedor foi achado pelo documento, unico e ativo
 * (nada a decidir), ou quando o operador ja' resolveu (`fechada`).
 */
export function FaixaDoFornecedor({ xml, fechada, cadastro = null, onTrocar, onEscolher, onCriar, criando, conflito = null, onUsarConflito }: {
  xml: DoXml;
  fechada: boolean;
  /** NOTA-FORNECEDOR-COMPARAR-01 — atualizar o cadastro pela nota SO' pela comparacao (campo · hoje · da nota, confirmar): `oferece` =
   *  a nota traz algo que o cadastro nao tem (achado pelo CNPJ); `atualizado` = ja' confirmado nesta abertura. Nunca grava ao salvar. */
  cadastro?: { oferece: boolean; atualizado: boolean; abrindo: boolean; onComparar: () => void } | null;
  onTrocar: () => void;
  onEscolher: (fornecedorId: string) => void;
  onCriar: () => void;
  criando: boolean;
  /** NOTA-FORNECEDOR-DUPLICA-01 — o CNPJ ja' e' de um cadastro (conferido no banco antes de criar): a frase pronta e "usar este". */
  conflito?: { id: string; nome: string; ativo: boolean } | null;
  onUsarConflito?: (id: string) => void;
}) {
  if (fechada) return null;
  if (conflito) {
    const frase = `Este ${soDigitos(xml.emitenteDocumento).length === 11 ? 'CPF' : 'CNPJ'} já é de "${conflito.nome}" (${conflito.ativo ? 'ativo' : 'inativo'}). Nada foi criado.`;
    return (
      <Faixa testid="xml-faixa-fornecedor" titulo={frase}>
        <span className="min-w-0 truncate" data-testid="xml-conflito">{frase}</span>
        {conflito.ativo && onUsarConflito && (
          <button type="button" className={`${LINK} ml-auto`} onClick={() => onUsarConflito(conflito.id)} data-testid="xml-usar-este">usar este</button>
        )}
      </Faixa>
    );
  }
  const r = xml.resolucao;
  const doc = documentoFormatado(xml.emitenteDocumento);
  const rotuloDoc = soDigitos(xml.emitenteDocumento).length === 11 ? 'CPF' : 'CNPJ';
  const trocar = <button type="button" className={LINK} onClick={onTrocar} data-testid="xml-trocar-fornecedor">trocar fornecedor</button>;
  const comparar = cadastro && (cadastro.atualizado
    ? <span className="shrink-0 font-medium" data-testid="xml-cadastro-atualizado">cadastro atualizado</span>
    : <button type="button" className={LINK} disabled={cadastro.abrindo} onClick={cadastro.onComparar} data-testid="xml-comparar-cadastro">
        {cadastro.abrindo ? 'lendo o cadastro…' : 'comparar e atualizar o cadastro'}
      </button>);

  if (!r.achadoPor) {
    const frase = `Fornecedor não encontrado no cadastro · "${xml.emitenteNome}" · ${rotuloDoc} ${doc}`;
    return (
      <Faixa testid="xml-faixa-fornecedor" titulo={frase}>
        <span className="min-w-0 truncate">{frase}</span>
        <button type="button" className={`${LINK} ml-auto`} disabled={criando} onClick={onCriar} data-testid="xml-criar-fornecedor">
          {criando ? 'criando…' : 'criar fornecedor com estes dados'}
        </button>
      </Faixa>
    );
  }
  if (r.candidatos.length > 1) {
    const frase = `Dois cadastros com o ${rotuloDoc} ${doc} · escolha:`;
    return (
      <Faixa testid="xml-faixa-fornecedor" titulo={`${frase} ${r.candidatos.map((c) => c.nome).join(' | ')}`}>
        <span className="shrink-0">{frase}</span>
        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
          {r.candidatos.map((c) => (
            <button key={c.id} type="button" className={`${LINK} min-w-0 truncate`} title={c.nome} onClick={() => onEscolher(c.id)} data-testid={`xml-escolher-${c.id}`}>{c.nome}</button>
          ))}
        </span>
      </Faixa>
    );
  }
  const nome = r.candidatos[0]?.nome ?? '';
  if (r.inativo) {
    const frase = `Fornecedor "${nome}" está inativo no cadastro · achado ${r.achadoPor === 'documento' ? `pelo ${rotuloDoc}` : 'pelo nome'}`;
    return <Faixa testid="xml-faixa-fornecedor" titulo={frase}><span className="min-w-0 truncate">{frase}</span><span className="ml-auto">{trocar}</span></Faixa>;
  }
  if (r.achadoPor === 'nome' && r.cadastroSemDocumento) {
    const frase = `Fornecedor achado pelo nome · "${nome}" · cadastro sem ${rotuloDoc} · o XML traz ${doc}`;
    /* O NOME encolhe primeiro (reticencias; inteiro no `title` dele, a frase toda no `title` da faixa), ate' 72px; so' depois o fim da frase
       cede. "comparar e atualizar o cadastro" e "trocar fornecedor" nao encolhem nunca. */
    return (
      <Faixa testid="xml-faixa-fornecedor" titulo={frase}>
        <span className="flex min-w-0 items-center">
          <span className="shrink-0 whitespace-pre">{'Fornecedor achado pelo nome · '}</span>
          <span className="min-w-[72px] shrink-[10] truncate font-medium" title={nome} data-testid="xml-nome-do-fornecedor">"{nome}"</span>
          <span className="min-w-0 truncate whitespace-pre">{` · cadastro sem ${rotuloDoc} · o XML traz ${doc}`}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">{comparar}{trocar}</span>
      </Faixa>
    );
  }
  /* FORN-FILIAL-01 — o cadastro achado pelo nome é OUTRA filial (mesma raiz, CNPJ diferente): não é proposto e nunca recebe este CNPJ;
     a faixa oferece criar o cadastro DESTA filial (nome, CNPJ e cidade do XML) */
  if (r.achadoPor === 'nome' && r.filialDiferente) {
    const docDoCadastro = documentoFormatado(r.candidatos[0]?.cpf_cnpj ?? '');
    const frase = `Fornecedor achado pelo nome · "${nome}" é outra filial (CNPJ ${docDoCadastro}) · o XML traz ${doc}`;
    return (
      <Faixa testid="xml-faixa-fornecedor" titulo={frase}>
        <span className="flex min-w-0 items-center">
          <span className="shrink-0 whitespace-pre">{'Fornecedor achado pelo nome · '}</span>
          <span className="min-w-[72px] shrink-[10] truncate font-medium" title={nome} data-testid="xml-nome-do-fornecedor">"{nome}"</span>
          <span className="min-w-0 truncate whitespace-pre" data-testid="xml-outra-filial">{` é outra filial (CNPJ ${docDoCadastro}) · o XML traz ${doc}`}</span>
        </span>
        <button type="button" className={`${LINK} ml-auto shrink-0`} disabled={criando} onClick={onCriar} data-testid="xml-criar-filial">
          {criando ? 'criando…' : 'criar o cadastro desta filial'}
        </button>
        {trocar}
      </Faixa>
    );
  }
  if (r.achadoPor === 'nome') {
    const frase = `Fornecedor achado pelo nome · "${nome}" · o cadastro tem outro documento · o XML traz ${doc}`;
    return (
      <Faixa testid="xml-faixa-fornecedor" titulo={frase}>
        <span className="flex min-w-0 items-center">
          <span className="shrink-0 whitespace-pre">{'Fornecedor achado pelo nome · '}</span>
          <span className="min-w-[72px] shrink-[10] truncate font-medium" title={nome} data-testid="xml-nome-do-fornecedor">"{nome}"</span>
          <span className="min-w-0 truncate whitespace-pre">{` · o cadastro tem outro documento · o XML traz ${doc}`}</span>
        </span>
        <span className="ml-auto shrink-0">{trocar}</span>
      </Faixa>
    );
  }
  /* achado pelo CNPJ, unico e ativo: so' ha' faixa quando a nota traz algo que o cadastro nao tem (endereco, IE, fantasia) */
  if (r.achadoPor === 'documento' && cadastro && (cadastro.oferece || cadastro.atualizado)) {
    const frase = `Fornecedor achado pelo ${rotuloDoc} · "${nome}" · a nota traz dados que o cadastro não tem`;
    return (
      <Faixa testid="xml-faixa-fornecedor" titulo={frase}>
        <span className="flex min-w-0 items-center">
          <span className="shrink-0 whitespace-pre">{`Fornecedor achado pelo ${rotuloDoc} · `}</span>
          <span className="min-w-[72px] shrink-[10] truncate font-medium" title={nome} data-testid="xml-nome-do-fornecedor">"{nome}"</span>
          <span className="min-w-0 truncate whitespace-pre">{' · a nota traz dados que o cadastro não tem'}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">{comparar}</span>
      </Faixa>
    );
  }
  return null;
}

/** OS AVISOS — uma faixa por frase. A de "nota ja' registrada" oferece abrir e seguir; as outras so' dizem. */
export function AvisosDoXml({ xml, registradaDispensada, onDispensarRegistrada, onAbrirOcorrencia }: {
  xml: DoXml;
  registradaDispensada: boolean;
  onDispensarRegistrada: () => void;
  onAbrirOcorrencia: (o: OcorrenciaDaNota) => void;
}) {
  const primeira = xml.ocorrencias[0];
  const mais = xml.ocorrencias.length - 1;
  const fraseRegistrada = primeira
    ? `Nota já registrada. ${xml.proposta.rotuloNota} · ${ondeEsta(primeira)}${mais > 0 ? ` · e mais ${mais}` : ''}`
    : '';
  return (
    <>
      {primeira && !registradaDispensada && (
        <Faixa testid="xml-aviso-registrada" titulo={`Nota já registrada. ${xml.ocorrencias.map(ondeEsta).join(' | ')}`}>
          <span className="min-w-0 truncate">{fraseRegistrada}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <button type="button" className={LINK} onClick={() => onAbrirOcorrencia(primeira)} data-testid="xml-abrir-registrada">abrir</button>
            <span>|</span>
            <button type="button" className={LINK} onClick={onDispensarRegistrada} data-testid="xml-seguir-mesmo-assim">seguir mesmo assim</button>
          </span>
        </Faixa>
      )}
      {xml.proposta.avisos.map((a) => (
        <Faixa key={a} testid="xml-aviso" titulo={a}><span className="min-w-0 truncate">{a}</span></Faixa>
      ))}
    </>
  );
}
