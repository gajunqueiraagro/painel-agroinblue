import { Fragment, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { CheckCircle2, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useImportacaoExtrato } from '@/hooks/useImportacaoExtrato';
import { detectarTipoArquivo, type TipoArquivoImport } from '@/lib/financeiro/parser/detectarTipoArquivo';
import { V2ImportLancamentosExcel } from '@/v2/pages/V2ImportLancamentosExcel';
import CusteioTxtImportTab from '@/v2/pages/CusteioTxtImportTab';
import { decodeTxtParcial } from '@/v2/lib/custeio/parseCusteioTxt';

/**
 * ImportarBancoInline — a aba "Importar Extrato" do Financas, clonada INTEIRA:
 * casca E fluxo. FIN-CONCIL-INTEGRAR-01, correção do B-24.
 *
 * ⚠ A CASCA SOZINHA NÃO BASTAVA, e a homologação mostrou por quê: o botão
 * clonado abria o modal antigo ("Gerar preview", aviso de parser PDF, passos
 * numerados) — a linha era do original e o miolo era o legado. Igual = igual
 * inclui o GESTO: escolher o arquivo abre um `input file` ali mesmo, o arquivo é
 * lido no navegador e a prévia nasce NA PRÓPRIA ABA, sem modal nenhum.
 *
 * ⚠ O MOTOR É O NOSSO, e de propósito: `useImportacaoExtrato` já lê o OFX no
 * navegador, calcula o hash, marca o que já existe e grava. Portar o motor do
 * Financas seria trocar um mecanismo testado por outro para ganhar aparência —
 * e a aparência é o que se pediu para trocar. Aqui muda a APRESENTAÇÃO.
 *
 * ⚠ O MODAL ANTIGO NÃO ABRE MAIS DESTA ABA. Ele segue existindo nas telas
 * velhas, que só morrem na rodada 2 — nada é derrubado antes da homologação.
 */
/**
 * Os quatro formatos que este hub aceita — 133b. Um lugar só: a lista alimenta as
 * pílulas E o "?" que junta as quatro explicações.
 */
const FORMATOS: readonly { ext: string; dica: string }[] = [
  { ext: '.ofx', dica: 'Extrato do banco. Lido aqui no navegador; a prévia mostra o que é novo e o que já existe antes de gravar.' },
  { ext: '.xlsx', dica: 'Planilha de lançamentos, com de-para memorizado e atualização por ID.' },
  { ext: '.csv/.txt', dica: 'Extrato em texto — mesmo fluxo do .ofx.' },
  { ext: '.txt custeio', dica: 'Relatório de custeio: prévia e lançamento um a um pelo modal — conta, fornecedor e subcentro são escolha sua por linha.' },
];

interface Props {
  /* `tipo_conta` entrou em 132: é o que agrupa o dropdown como a aba Conciliação agrupa os
     saldos. Ausente, a conta cai em "Outros" — nunca some da lista. */
  contas: { id: string; label: string; tipo_conta?: string | null }[];
  contaId: string;
  onContaChange: (id: string) => void;
  /** Recarrega a lista do mês depois de gravar. */
  onImportado?: () => void;
  /** O "Ver importações (N)" que vive na mesma linha, montado por quem tem o modal. */
  acoes?: React.ReactNode;
}

export function ImportarBancoInline({ contas, contaId, onContaChange, onImportado, acoes }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const { preview, loading, gerarPreview, confirmarImportacao, reset,
    toggleImportarSuspeita, marcarTodasSuspeitas } = useImportacaoExtrato();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [gravando, setGravando] = useState(false);
  /**
   * O tipo do arquivo escolhido — B-36, o hub.
   *
   * ⚠ QUATRO FORMATOS, UM LUGAR. Antes o operador tinha de saber de antemão em
   * qual tela cada arquivo entrava: extrato aqui, planilha num item de menu,
   * custeio noutro. O arquivo é que diz o que é; a tela roteia.
   * ⚠ CONCENTRAÇÃO, NÃO UNIFORMIDADE: cada formato desagua no fluxo que já tem —
   * o extrato confirma em lote, o custeio abre o modal linha a linha. Uniformizar
   * seria inventar comportamento que nenhum deles pediu.
   */
  const [tipo, setTipo] = useState<TipoArquivoImport | null>(null);

  const escolher = async (a: File) => {
    /* ⚠ SÓ O COMEÇO DO ARQUIVO É LIDO PARA DETECTAR: as âncoras do custeio e a
       tag do OFX vivem no topo, e ler um extrato inteiro em memória só para
       decidir o tipo seria caro à toa. O parser do fluxo escolhido lê o resto. */
    /* ⚠ `.text()` DECODIFICA SEMPRE COMO UTF-8, e o relatório de custeio vem em
       cp1252: os acentos viravam U+FFFD, "Família:" não casava com a âncora e o
       arquivo era mandado para o motor do extrato, que respondia "não está num
       layout reconhecido". `decodeTxtParcial` é a mesma decisão que o parser do
       custeio já tomava para o arquivo inteiro — faltava tomá-la aqui, onde se
       escolhe o caminho. */
    const cabeca = a.name.toLowerCase().endsWith('.xlsx') || a.name.toLowerCase().endsWith('.xls')
      ? ''
      : decodeTxtParcial(await a.slice(0, 64_000).arrayBuffer());
    const { tipo: t, aviso } = detectarTipoArquivo(a.name, cabeca);
    if (!t) {
      /* ⚠ O AVISO NOMEIA O QUE PARECE SER. "Formato não reconhecido" manda o
         operador adivinhar; "isto parece um relatório de custeio" diz o que
         fazer a seguir. */
      toast.error(aviso ?? 'Formato não reconhecido.');
      return;
    }
    setTipo(t);
    setArquivo(a);
    /* Excel e custeio têm fluxo próprio e não passam pelo motor do extrato. */
    if (t !== 'ofx' && t !== 'csv-extrato') return;
    try { await gerarPreview({ arquivo: a, contaBancariaId: contaId }); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao ler o arquivo.'); setArquivo(null); setTipo(null); }
  };

  const cancelar = () => { reset(); setArquivo(null); setTipo(null); };

  const importar = async () => {
    if (!arquivo || !preview) return;
    setGravando(true);
    try {
      /* ⚠ O FORMATO GRAVADO É O QUE O PARSER USOU, não o que esta tela supôs.
         Enquanto só havia OFX aqui, o literal era verdadeiro; com o CSV entrando
         pelo mesmo botão, ele viraria mentira gravada em `tipo_arquivo`. O hook
         já detecta e devolve — a resposta certa é ler dele, não redecidir. */
      await confirmarImportacao({ contaBancariaId: contaId, nomeArquivo: arquivo.name, formato: preview.formato });
      toast.success('Extrato importado.');
      cancelar();
      onImportado?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao gravar o extrato.');
    } finally {
      setGravando(false);
    }
  };

  /* ⚠ UM COMPONENTE SÓ DE SELETOR DE CONTA — 133g item 9. Este dropdown montava a lista à
     mão (chamando `agruparContasPorTipo` direto) enquanto o `ContaBancariaSelect` fazia o
     MESMO agrupamento por dentro, com outro rótulo de grupo: dois vocabulários para as
     mesmas gavetas, na mesma tela. A regra agora é uma — quem agrupa é o componente.
     ⚠ O `label` DO CALLER VIRA `nome_conta`: esta tela já resolve o rótulo (`getContaLabel`)
     antes de passar a lista, e o componente exibe `nome_exibicao || nome_conta`. Sem
     `nome_exibicao`, o rótulo pronto do caller é o que aparece — sem reescrever regra de
     nome em dois lugares. */
  const seletor = (
    <div className="w-[190px]">
      <ContaBancariaSelect
        /* ⚠ A SENTINELA `__none__` FICA, e não é sobra do código antigo: `value=""` faria o
           Radix tratar o Select como NÃO-CONTROLADO, e voltar de uma conta para "todas"
           deixaria a escolha anterior na tela. Um valor sem item correspondente é
           controlado e mostra o placeholder — que é exatamente o comportamento de antes. */
        value={contaId || '__none__'}
        onValueChange={v => onContaChange(v === '__none__' ? '' : v)}
        contas={contas.map(c => ({
          id: c.id, nome_conta: c.label, nome_exibicao: null, tipo_conta: c.tipo_conta ?? null,
        }))}
        placeholder="Conta"
        className="h-7 text-xs"
      />
    </div>
  );

  return (
    <div className="space-y-2">
      {/* ⚠ O INPUT ESCONDIDO DESCEU PARA O FIM — PR-SISTEMA-BARRA-COMPACTA-01, e são 8px de
          altura que ninguém decidiu dar. `space-y-2` aplica `margin-top` do SEGUNDO filho em
          diante; com o input `hidden` ocupando a primeira posição, a linha do seletor era a
          segunda e ganhava 8px de margem — sobre um elemento que não ocupa espaço nenhum.
          ⚠ MEDIDO: o seletor desta aba começava a 8px do topo e o da aba Sistema a 0px, e foi
          essa diferença que o Gabriel viu na tela. Igualar por cima (dar 8px à Sistema) tiraria
          altura da Mesa, que é o que este PR veio devolver; igualar por baixo devolve os 8px às
          DUAS abas. Nada de comportamento mudou aqui: o input continua escondido e continua
          sendo o mesmo `ref`. */}

      {/* ⚠ UMA LINHA — o card de quatro linhas do legado explicava o que a prévia
          já mostra, e ocupava o topo da tela inclusive nas dezenas de vezes em
          que o operador já sabe o que é um OFX. O resto do texto virou `title`:
          continua disponível, deixa de custar altura. */}
      {/* ⚠ A LINHA DO SELETOR SÓ SAI QUANDO ALGO TOMA O LUGAR DELA: a prévia do
          extrato, ou o fluxo do Excel/custeio. Escondê-la por `tipo` sozinho
          deixaria a tela vazia entre escolher o OFX e a prévia chegar. */}
      {/* ⚠ LINHA, NÃO CARD — PR-IMPORTAR-CORPO-01. O card custava 46px (32 do mais alto + 12 de
          padding + 2 de borda) para dizer "escolha a conta e o arquivo", e essa altura saía da
          tabela de movimentos, que é a tela. A moldura não informava nada: o que está aqui já se
          entende sem borda em volta. Sem card e com os controles em 28px, a linha cai para 28px.
          ⚠ E OS 28px NÃO SÃO ESCOLHA SOLTA: é a altura do `h-7` do repo, a mesma do botão de
          voltar do cabeçalho e da régua de meses. */}
      {!preview && tipo !== 'excel' && tipo !== 'custeio-txt' && (
        <div className="flex items-center gap-2">
          {seletor}
          <Button type="button" size="sm" className="h-7 gap-1.5 text-xs"
            disabled={!contaId || loading}
            title={contaId ? undefined : 'Escolha a conta primeiro'}
            onClick={() => input.current?.click()}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Escolher arquivo
          </Button>
          {/* ⚠ QUATRO PÍLULAS NO LUGAR DO PARÁGRAFO — 133b. O texto dizia o que cada
              formato faz e ocupava três linhas da largura útil em TODA abertura da aba,
              inclusive nas dezenas em que o operador já sabe. A informação não some: cada
              pílula é o formato, e a explicação de uma linha mora no `title` dela e no "?". */}
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {FORMATOS.map((f) => (
              <span key={f.ext} title={f.dica}
                className="cursor-help rounded border border-border bg-muted/60 px-1.5 py-[1px] font-mono text-[10px] leading-tight text-muted-foreground">
                {f.ext}
              </span>
            ))}
            <span
              title={FORMATOS.map((f) => `${f.ext} — ${f.dica}`).join('\n')}
              className="flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full border border-border text-[9px] font-semibold text-muted-foreground">
              ?
            </span>
          </span>
          {acoes}
        </div>
      )}

      {/* ⚠ CADA FORMATO NO SEU FLUXO, INLINE — o padrão da prévia do OFX. O
          Excel monta a tela da Importação de Lançamentos (com de-para, dedup e
          modo update por ID); o custeio monta a prévia dele, que grava linha a
          linha pelo modal. Nenhum dos dois foi reescrito: são os motores que já
          existiam, agora alcançáveis daqui. */}
      {tipo === 'excel' && arquivo && (
        <div className="rounded-lg border border-border bg-card p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Planilha de lançamentos
            </span>
            <span className="truncate font-mono text-[10px]">{arquivo.name}</span>
            <div className="flex-1" />
            <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]"
              onClick={cancelar}>
              <X className="h-3 w-3" /> Trocar arquivo
            </Button>
          </div>
          {/* ⚠ O ARQUIVO DESCE — 133b. Ela tinha seletor próprio e chegava VAZIA: o
              operador escolhia a planilha aqui em cima e precisava escolhê-la de novo lá
              dentro. Agora vale o mesmo contrato do custeio (L~223): com `arquivoInicial`,
              o seletor interno some e o "Trocar arquivo" desta linha é o único caminho. */}
          <V2ImportLancamentosExcel arquivoInicial={arquivo} />
        </div>
      )}

      {tipo === 'custeio-txt' && arquivo && (
        <div className="rounded-lg border border-border bg-card p-2">
          {/* ⚠ O CABEÇALHO DA SEÇÃO TAMBÉM NÃO ROLA — CUSTEIO-TXT-02b. Ele diz de qual
              arquivo é a prévia; rolar 43 itens sem ele é conferir números sem saber de
              onde vieram. `z-30` acima do bloco de números (z-20), que gruda logo abaixo
              em `top-[30px]` — 24px de altura + os 6px do `pb-1.5` que substituiu o `mb`,
              para o próprio espaçamento ficar coberto e as linhas não aparecerem na fresta. */}
          <div className="sticky top-0 z-30 flex items-center gap-2 bg-card pb-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Relatório de custeio
            </span>
            <span className="truncate font-mono text-[10px]">{arquivo.name}</span>
            <div className="flex-1" />
            <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]"
              onClick={cancelar}>
              <X className="h-3 w-3" /> Trocar arquivo
            </Button>
          </div>
          {/* A conta da régua desce para o modal: é a mesma que o operador escolheu
              acima para conciliar, e pedir de novo seria perguntar o que já foi dito. */}
          <CusteioTxtImportTab arquivoInicial={arquivo} contaBancariaId={contaId} />
        </div>
      )}

      {preview && (() => {
        /* ⚠ A COLUNA DA CAIXA SÓ APARECE QUANDO HÁ PROVÁVEL REIMPORTAÇÃO no arquivo — e o
           "marcar todos" do cabeçalho reflete o estado real das linhas, não um estado próprio. */
        /**
         * O PERFIL DO ARQUIVO — PR-IMPORTAR-PERFIL-01. Cada cliente usa o extrato de um jeito:
         * uns lançam tudo e o OFX só confere, outros não lançam nada e o extrato vira a base.
         * A tela lê o que aconteceu e diz — sem configuração de perfil.
         *
         * ⚠ NENHUM CÁLCULO NOVO: os quatro números já existiam em `PreviewResult` e nenhuma tela
         * os mostrava. O motor de candidatos roda em toda prévia e o resultado era descartado.
         *
         * ⚠ "PROVÁVEL", E NUNCA "JÁ LANÇADO" — e a diferença foi medida, não escolhida. O score
         * do candidato COMEÇA em 70 e o limiar é 50: todo candidato viável nasce acima do corte,
         * porque para entrar na lista ele já precisou ter o MESMO VALOR (tolerância 0,01) dentro
         * de 7 DIAS. Texto e proximidade de data só levam 70 a 100. Então `matchEncontrado` quer
         * dizer "existe um lançamento com o mesmo valor por perto", não "este movimento já está
         * lançado" — o vínculo só existe depois da conciliação. Escrever "já lançado" faria o
         * operador PULAR a conferência do passo 2.
         *
         * ⚠ E A BASE É `acionaveis`, NÃO O ARQUIVO INTEIRO: os quatro são contados sobre os
         * movimentos ainda não gravados ou gravados em aberto/parcial. Por isso a frase declara o
         * recorte quando ele existe — número que não fecha na cara do operador derruba a
         * confiança em todos os outros da tela.
         */
        const provaveis = preview.matchDireto + preview.matchAgrupados;
        const acionaveis = provaveis + preview.semMatch + preview.ambiguos;
        const perfilDoArquivo = ((): string => {
          if (acionaveis === 0) return '';
          /* O recorte só aparece quando há movimentos FORA da conta — senão ele seria ruído. */
          const sujeito = acionaveis < preview.movimentos.length
            ? `Dos ${acionaveis} movimentos ainda em aberto, `
            : '';
          const virarao = preview.semMatch === 1 ? 'virará' : 'virarão';
          /* Um movimento só é caso real (conta nova, primeiro arquivo do mês) e "dos 1 movimentos"
             é o tipo de frase que faz o operador desconfiar da tela inteira. */
          const um = acionaveis === 1;
          let frase: string;
          if (provaveis === 0) {
            frase = sujeito
              ? `${sujeito}nenhum tem lançamento no sistema — o extrato vai ser a base dos lançamentos.`
              : um
                ? 'O único movimento não tem lançamento no sistema — o extrato vai ser a base dos lançamentos.'
                : `Nenhum dos ${acionaveis} movimentos tem lançamento no sistema — o extrato vai ser a base dos lançamentos.`;
          } else if (preview.semMatch === 0) {
            frase = sujeito
              ? `${sujeito}todos têm um lançamento provável no sistema — o extrato vai conferir o que já foi lançado.`
              : um
                ? 'O único movimento tem um lançamento provável no sistema — o extrato vai conferir o que já foi lançado.'
                : `Os ${acionaveis} movimentos têm um lançamento provável no sistema — o extrato vai conferir o que já foi lançado.`;
          } else if (provaveis >= preview.semMatch) {
            /* A maioria tem candidato: o verbo é CONFERIR, e o resto vira lançamento novo. */
            frase = `${sujeito || ''}${sujeito ? provaveis : `${provaveis} dos ${acionaveis} movimentos`} têm um lançamento provável no sistema — o extrato vai conferir o que já foi lançado. ${preview.semMatch} sem candidato ${virarao} lançamento novo.`;
          } else {
            /* Metade a metade, ou mais sem candidato: a frase não escolhe verbo, diz os dois lados. */
            frase = `${sujeito || ''}${sujeito ? provaveis : `${provaveis} dos ${acionaveis} movimentos`} têm um lançamento provável no sistema; ${preview.semMatch} não têm e ${virarao} lançamento novo.`;
          }
          if (preview.ambiguos > 0) {
            frase += ` · ${preview.ambiguos} com mais de um candidato ${preview.ambiguos === 1 ? 'exigirá' : 'exigirão'} escolha no passo seguinte.`;
          }
          return frase;
        })();

        /* ⚠ DATA CRESCENTE, E DENTRO DO DIA O MAIOR VALOR PRIMEIRO — PR-IMPORT-DUPLICATA-LEITURA-01.
           A ordem de antes era a FÍSICA DO ARQUIVO (não havia `sort` nenhum): parecia por data
           porque o OFX do Itaú vem assim, não porque a tela decidia. Ordenar deixa os candidatos
           a duplicata vizinhos — mesmo dia e mesmo valor caem lado a lado, que é como o olho
           confere.
           ⚠ POR VALOR ABSOLUTO, não pelo sinal: com sinal, as SAÍDAS maiores — que é por onde o
           dinheiro sai — iriam para o fim da lista, e é justamente onde se olha primeiro.
           ⚠ E ISSO CUSTA O ALINHAMENTO COM O ARQUIVO, de propósito: não dá mais para conferir
           linha a linha contra o extrato em PDF. A conferência por TOTAL, que é a que importa,
           o portão do saldo já faz sozinho no painel abaixo. */
        const movimentosOrdenados = [...preview.movimentos].sort((a, b) => {
          const da = a.data.slice(0, 10), db = b.data.slice(0, 10);
          if (da !== db) return da < db ? -1 : 1;
          return Math.abs(b.valor) - Math.abs(a.valor);
        });
        const suspeitas = preview.movimentos.filter((m) => m.dupClassificacao && !m.existeNoDB);
        const temSuspeitas = suspeitas.length > 0;
        const todasSuspeitasMarcadas = temSuspeitas && suspeitas.every((m) => m.dupImportar === true);
        /* ⚠ UM ARQUIVO SÓ → A DATA DELE; VÁRIOS → A CONTAGEM. Uma data escolhida entre
           três representaria mal o conjunto, e "já no extrato (arquivo de 18/08)" seria
           falso para as outras duas. */
        const datas = [...new Set(
          preview.movimentos
            .filter((m) => m.existeNoDB && m.criadoEmExistente)
            .map((m) => (m.criadoEmExistente ?? '').slice(0, 10)),
        )];
        const origemDosExistentes = datas.length === 1
          ? ` (arquivo de ${brData(datas[0])})`
          : datas.length > 1 ? ` (${datas.length} arquivos)` : '';
        return (
        <div className="rounded-lg border border-border bg-card">
          {/* cabeçalho da prévia — o seletor NÃO some: saber de qual conta é o
              arquivo prestes a ser gravado é o contexto mais importante agora */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
            {seletor}
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Prévia</span>
            <span className="truncate font-mono text-[10px] text-foreground">{arquivo?.name}</span>
            <div className="flex-1" />
            <Badge className="h-5 gap-1 px-1.5 text-[9px]">
              <CheckCircle2 className="h-2.5 w-2.5" />
              {preview.novosParaSalvar} novo{preview.novosParaSalvar === 1 ? '' : 's'}
            </Badge>
            {/* ⚠ "JÁ EXISTE" ASSUSTAVA SEM INFORMAR — parte C. O operador lia como "o
                sistema já lançou isto" e parava a importação; o fato é outro e é banal: a
                linha já está no extrato, veio de um arquivo anterior, e não será duplicada.
                Dizer QUANDO transforma o susto em informação. */}
            {/* ⚠ O NÚMERO DO MEIO — PR-IMPORT-REIMPORTACAO-01. Ele fica ENTRE o novo e o já
                existente porque é isso que ele é: nem um nem outro, e a decisão é do operador.
                O contador de "novos" à esquerda sobe conforme ele marca as caixas, então o
                botão de gravar sempre diz quantos vão entrar de verdade. */}
            {preview.suspeitasForaDaImportacao > 0 && (
              <Badge variant="secondary" className="h-5 border-warning/40 bg-warning/15 px-1.5 text-[9px] text-warning"
                title="Movimentos com a mesma data e o mesmo valor de linhas que já estão no extrato, e com histórico parecido ou documento igual. Por segurança NÃO entram; marque na lista o que for movimento novo mesmo.">
                {preview.suspeitasForaDaImportacao} duplicado?
              </Badge>
            )}
            {preview.existentesNoBanco > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[9px]"
                title="Estas linhas já estão no extrato; não serão duplicadas.">
                {preview.existentesNoBanco} já no extrato{origemDosExistentes}
              </Badge>
            )}
          </div>

          {/* ⚠ O QUE O BANCO DECLAROU — e agora declara mesmo: FIN-OFX-LEDGERBAL-PARSER-01
              fez o `parseOFX` ler `LEDGERBAL/BALAMT` + `DTASOF`, que ele descartava.
              O número é do BANCO, atravessou o motor sem transformação e existe para
              ser comparado com o que a casa apurou — é a única conferência da
              prévia que confere com alguém de fora.
              ⚠ O TRAÇO CONTINUA SENDO TRAÇO quando o arquivo não traz a tag. Somar os
              movimentos aqui daria um número que bate consigo mesmo e não confere
              nada — pior que o vazio, porque parece conferência. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-border px-3 py-2 sm:grid-cols-4">
            {/* ⚠ O PERÍODO DECLARADO GANHA DO DERIVADO — carona da rodada 2. O
                arquivo diz de quando até quando ele cobre (`DTSTART`/`DTEND`);
                o primeiro e o último movimento só coincidem com isso quando o
                mês começa e termina com lançamento. Sem a tag, cai para os
                movimentos, que é o que se sabe. */}
            <Campo rotulo="Período">
              <span title={preview.periodoDeclaradoInicio || preview.periodoDeclaradoFim
                ? 'Período declarado pelo próprio arquivo (tags DTSTART e DTEND).'
                : 'O arquivo não declara período — este vem do primeiro e do último movimento lidos.'}>
                {periodoDoArquivo(preview)}
              </span>
            </Campo>
            <Campo rotulo="Movimentos">{preview.movimentos.length}</Campo>
            <Campo rotulo="Saldo declarado pelo banco">
              {preview.saldoDeclarado == null ? (
                <span title="Este arquivo não traz a tag LEDGERBAL — o banco não declarou saldo nele. O traço é ausência, não zero: somar os movimentos daria um número nosso, não o do banco.">—</span>
              ) : (
                <span title="Tag LEDGERBAL/BALAMT do arquivo — o saldo contábil que o próprio banco afirma. Não é a soma dos movimentos acima nem o saldo gerencial da casa.">
                  {formatMoeda(preview.saldoDeclarado)}
                </span>
              )}
            </Campo>
            <Campo rotulo="Na data de">
              {preview.saldoDeclaradoData == null ? (
                <span title="Vem junto do saldo declarado (tag DTASOF). Sem LEDGERBAL no arquivo, não há data.">—</span>
              ) : (
                <span title="Tag LEDGERBAL/DTASOF — a data a que o saldo declarado se refere. Pode não ser o último dia do período acima.">
                  {brData(preview.saldoDeclaradoData)}
                </span>
              )}
            </Campo>
          </div>

          {/* ⚠ ALTURA RESERVADA, MESMO VAZIA — Lei de Estabilidade Visual. A frase muda de tamanho
              com o arquivo (dois dígitos viram três, o caso curto vira o longo) e some quando não
              há nada acionável; sem o `min-h` a tabela subiria e desceria entre um arquivo e
              outro. `truncate` mantém UMA linha sempre, e o texto inteiro fica no `title`. */}
          <div className="min-h-[18px] truncate px-3 pt-1 text-[10px] leading-tight text-muted-foreground"
            title={perfilDoArquivo || undefined}>
            {perfilDoArquivo}
          </div>

          {/* linha a linha, com o que já existe apagado */}
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted/60">
                <tr>
                  <Th className="text-left">Data</Th>
                  <Th className="text-left">Descrição</Th>
                  <Th className="text-left">Doc</Th>
                  <Th className="text-right">Valor</Th>
                  <Th className="text-center">Situação</Th>
                  {/* ⚠ A COLUNA SÓ EXISTE QUANDO HÁ O QUE DECIDIR — PR-IMPORT-REIMPORTACAO-01.
                      Uma coluna de caixas vazias em todo arquivo normal seria ruído permanente
                      para um caso que é a exceção. */}
                  {temSuspeitas && (
                    <Th className="text-center">
                      <label className="flex cursor-pointer items-center justify-center gap-1"
                        title="Marcar todas as linhas suspeitas como movimento novo — elas passam a entrar na importação.">
                        <input type="checkbox" className="h-3 w-3"
                          checked={todasSuspeitasMarcadas}
                          onChange={(e) => marcarTodasSuspeitas(e.target.checked)} />
                        importar
                      </label>
                    </Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {movimentosOrdenados.map((m, i) => {
                  const repetido = m.existeNoDB || !!m.jaExistenteChave;
                  /* ⚠ APAGADA ENQUANTO NÃO FOR MARCADA: a provável reimportação não entra, então
                     ela se parece com o que já existe — e volta ao normal quando o operador diz
                     que é movimento novo. */
                  const suspeita = m.dupClassificacao ?? null;
                  const suspeitaFora = !!suspeita && m.dupImportar === false;
                  const chave = `${m.data}-${m.documento ?? i}-${i}`;
                  return (
                    <Fragment key={chave}>
                    <tr className={cn((repetido || suspeitaFora) && 'opacity-45',
                      /* ⚠ A BORDA DE BAIXO SAI QUANDO HÁ LINHA DO PAR: ela pertence ao CONJUNTO
                         (movimento + par), e riscar entre os dois separaria o que é uma coisa só. */
                      suspeita ? '' : 'border-b border-border/60')}>
                      <td className="whitespace-nowrap px-2 py-0.5 font-mono">{brData(m.data)}</td>
                      <td className="max-w-[280px] truncate px-2 py-0.5" title={m.descricao}>{m.descricao || '—'}</td>
                      <td className="px-2 py-0.5 font-mono text-muted-foreground">{m.documento ?? '—'}</td>
                      <td className={cn('whitespace-nowrap px-2 py-0.5 text-right font-medium tabular-nums',
                        m.valor < 0 ? 'text-destructive' : 'text-success')}>
                        {formatMoeda(m.valor)}
                      </td>
                      <td className="px-2 py-0.5 text-center">
                        {/* ⚠ TRÊS ESTADOS — PR-IMPORT-REIMPORTACAO-01. O do meio PERGUNTA, e a
                            interrogação é o ponto: o sistema não tem como saber se aquilo é o
                            mesmo movimento com documento novo ou um pagamento igual repetido no
                            mesmo dia. Afirmar qualquer um dos dois seria prometer certeza que
                            não existe; perguntar devolve a decisão a quem sabe. */}
                        {/* ⚠ UM SELO, TRÊS GRAUS — PR-IMPORT-DUPLICATA-UNIFICA-01. A régua é a
                            suspeita por SEMELHANÇA, e o grau diz de quanta certeza se trata:
                            FORTE é o mesmo documento (o banco reenviou a mesma linha), duplicado?
                            é texto parecido com documento diferente, e "mesmo dia e valor" é só a
                            coincidência de data e valor — que na pecuária é rotina.
                            ⚠ O `title` MOSTRA O PAR, que o motor já guardava e ninguém exibia: é
                            o lado a lado que faltou quando "RESGATE CDB" entrou duplicando
                            "INT RESGATE CDB" na Vera Ligia. */}
                        <span className={cn('rounded px-1 py-0 text-[9px] font-semibold uppercase',
                          repetido ? 'bg-muted text-muted-foreground'
                            : suspeita === 'FORTE' ? 'bg-destructive/15 text-destructive'
                            : suspeita === 'PROVAVEL' ? 'bg-warning/15 text-warning'
                            : suspeita ? 'bg-muted text-muted-foreground'
                            : 'bg-success/15 text-success')}
                          title={repetido ? 'esta linha já está no extrato; não será duplicada'
                            : suspeita
                              ? `${m.dupResumo ?? ''}\nJá no extrato: ${m.dupExistenteDescricao ?? '—'}${m.dupExistenteDocumento ? ` (doc ${m.dupExistenteDocumento})` : ''}.${m.dupImportar === false ? '\nNão será importado — marque se for movimento novo mesmo.' : '\nSerá importado — desmarque se for repetição.'}`
                              : undefined}>
                          {repetido
                            ? (m.criadoEmExistente ? `já importado ${brData(m.criadoEmExistente.slice(0, 10))}` : 'já no extrato')
                            : suspeita === 'FORTE' ? 'mesmo documento'
                            : suspeita === 'PROVAVEL' ? 'duplicado?'
                            : suspeita ? 'mesmo dia e valor'
                            : 'novo'}
                        </span>
                      </td>
                      {temSuspeitas && (
                        <td className="px-2 py-0.5 text-center">
                          {suspeita && (
                            <input type="checkbox" className="h-3 w-3 cursor-pointer"
                              checked={m.dupImportar === true}
                              onChange={() => toggleImportarSuspeita(m.hash)}
                              title="Importar esta linha assim mesmo — é movimento novo, não repetição." />
                          )}
                        </td>
                      )}
                    </tr>
                    {/* ⚠ O PAR NA PRÓPRIA LINHA, E NÃO SÓ NO HOVER — PR-IMPORT-DUPLICATA-LEITURA-01.
                        O selo acusava sem mostrar a prova: para saber POR QUE a linha foi marcada,
                        o operador tinha de passar o mouse uma a uma. Na Vera Ligia, cinco marcadas
                        e a leitura foi "não achei valores iguais" — o sistema estava certo e a tela
                        não deixava ver.
                        ⚠ SEGUNDA `<tr>` COM `colSpan`, e a escolha foi MEDIDA: pôr o par dentro da
                        célula da descrição, ou numa coluna própria, re-largava TODAS as colunas
                        (a tabela é `table-layout: auto`) — a coluna Descrição ia de 325px para
                        396px numa, e caía para 232px na outra. Atravessando a largura toda, a linha
                        do par não disputa espaço com coluna nenhuma: as seis ficam idênticas. */}
                    {suspeita && (
                      <tr className={cn('border-b border-border/60', suspeitaFora && 'opacity-45')}>
                        <td colSpan={temSuspeitas ? 6 : 5}
                          className="truncate px-2 pb-0.5 pt-0 pl-6 text-[9px] text-muted-foreground">
                          ↳ já no extrato: {m.dupExistenteDescricao ?? '—'}
                          {m.dupExistenteDocumento ? ` (doc ${m.dupExistenteDocumento})` : ''}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 border-t border-border bg-accent px-3 py-2">
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={cancelar}>
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <div className="flex-1" />
            {/* ⚠ O BOTÃO DIZ QUANTOS VAI GRAVAR, e desabilita com o motivo quando
                não há nada novo — a regra do botão que explica. */}
            <Button type="button" size="sm" className="h-8 gap-1.5 px-5 text-xs font-semibold"
              disabled={gravando || preview.novosParaSalvar === 0}
              title={preview.novosParaSalvar === 0 ? 'Todos os movimentos já foram importados' : undefined}
              onClick={() => { void importar(); }}>
              {gravando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Importar {preview.novosParaSalvar}
            </Button>
          </div>
        </div>
        );
      })()}
      {/* ⚠ ÚLTIMO FILHO, e é isso que devolve os 8px — ver o comentário no topo deste bloco. */}
      <input ref={input} type="file" accept=".ofx,.OFX,.xlsx,.xls,.txt,.csv" className="hidden"
        onChange={e => {
          const a = e.target.files?.[0];
          if (a) void escolher(a);
          // permite reescolher o MESMO arquivo depois de cancelar
          e.target.value = '';
        }} />
    </div>
  );
}

/**
 * O período do arquivo: o DECLARADO quando existe, o dos movimentos quando não.
 *
 * ⚠ AS DUAS PONTAS CAEM SEPARADO. Um OFX pode trazer `DTSTART` e não `DTEND`;
 * completar a que falta com a data do movimento é melhor que descartar a que
 * veio — e a que veio continua sendo a do arquivo.
 */
function periodoDoArquivo(p: {
  movimentos: readonly { data: string }[];
  periodoDeclaradoInicio: string | null;
  periodoDeclaradoFim: string | null;
}): string {
  const datas = p.movimentos.map(m => m.data).sort();
  const ini = p.periodoDeclaradoInicio ?? datas[0] ?? null;
  const fim = p.periodoDeclaradoFim ?? datas[datas.length - 1] ?? null;
  if (!ini && !fim) return '—';
  return `${brData(ini ?? '')} – ${brData(fim ?? '')}`;
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground ${className ?? ''}`}>
      {children}
    </th>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="truncate text-[11px] font-medium tabular-nums text-foreground">{children}</p>
    </div>
  );
}

const brData = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
