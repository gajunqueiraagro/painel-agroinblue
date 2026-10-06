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
const FAIXA = 'flex h-6 items-center gap-2 rounded border border-amber-300 bg-amber-50 px-2 text-[10px] text-amber-900';
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
export function FaixaDoFornecedor({ xml, fechada, gravarDocumento, onGravarDocumento, onTrocar, onEscolher, onCriar, criando }: {
  xml: DoXml;
  fechada: boolean;
  gravarDocumento: boolean;
  onGravarDocumento: (v: boolean) => void;
  onTrocar: () => void;
  onEscolher: (fornecedorId: string) => void;
  onCriar: () => void;
  criando: boolean;
}) {
  if (fechada) return null;
  const r = xml.resolucao;
  const doc = documentoFormatado(xml.emitenteDocumento);
  const rotuloDoc = soDigitos(xml.emitenteDocumento).length === 11 ? 'CPF' : 'CNPJ';
  const trocar = <button type="button" className={LINK} onClick={onTrocar} data-testid="xml-trocar-fornecedor">trocar fornecedor</button>;

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
    return (
      <Faixa testid="xml-faixa-fornecedor" titulo={frase}>
        <span className="min-w-0 truncate">{frase}</span>
        <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1">
          <input type="checkbox" className="h-3 w-3 accent-amber-700" checked={gravarDocumento} onChange={(e) => onGravarDocumento(e.target.checked)} data-testid="xml-gravar-documento" />
          Gravar o {rotuloDoc} neste cadastro ao salvar
        </label>
        {trocar}
      </Faixa>
    );
  }
  if (r.achadoPor === 'nome') {
    const frase = `Fornecedor achado pelo nome · "${nome}" · o cadastro tem outro documento · o XML traz ${doc}`;
    return <Faixa testid="xml-faixa-fornecedor" titulo={frase}><span className="min-w-0 truncate">{frase}</span><span className="ml-auto">{trocar}</span></Faixa>;
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
