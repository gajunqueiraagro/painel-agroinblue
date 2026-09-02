// ============================================================================
// V2ImportLancamentosExcel — PR-IMPORT-EXCEL-LANC-01. Porta de entrada de
// lançamentos por planilha, ao lado do OFX e do CSV.
//
// Quatro passos: ler o arquivo · mapear o de-para · conferir a prévia · confirmar.
// A confirmação é o ÚNICO ponto que grava, e só por ação explícita do operador.
//
// NÃO envolve conciliação bancária: nada é escrito em conciliacao_bancaria_itens
// nem em conciliado_em.
// ============================================================================
import { useMemo, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { formatMoeda } from '@/lib/calculos/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useImportLancamentosExcel } from '@/v2/hooks/useImportLancamentosExcel';
import { ImportLancDeParaPanel } from '@/v2/components/importacao/ImportLancDeParaPanel';
import { ImportLancPrevia } from '@/v2/components/importacao/ImportLancPrevia';
import { tipoPorContaPlano } from '@/v2/lib/importLanc/importLancamentosView';
import { baixarModeloPlanilha } from '@/v2/lib/importLanc/modeloPlanilha';
import { linhasDoExtrato, type MovimentoParaPlanilha } from '@/v2/lib/importLanc/linhasDoExtrato';
import { Download } from 'lucide-react';
import type { CampoDePara } from '@/v2/hooks/useImportLancamentosExcel';

/** Os cinco grupos do de-para, na ordem em que o trabalho acontece. */
const GRUPOS_DEPARA: readonly { campo: CampoDePara; rotulo: string }[] = [
  { campo: 'subcentro',  rotulo: 'Conta do plano' },
  { campo: 'fazenda',    rotulo: 'Fazenda' },
  { campo: 'fornecedor', rotulo: 'Fornecedor' },
  { campo: 'conta',      rotulo: 'Conta bancária' },
  { campo: 'safra',      rotulo: 'Safra' },
];

/** Um número do resumo por balde. Zero fica apagado, mas NÃO some: a ausência de
 *  ambíguos é informação, e um balde que desaparece faz o operador se perguntar
 *  se ele existia. */
function Balde({ n, rotulo, cor, dica }: { n: number; rotulo: string; cor: string; dica: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1 ${n === 0 ? 'opacity-45' : ''}`} title={dica}>
      <b className={`tabular-nums ${cor}`}>{n}</b>
      <span className="text-muted-foreground">{rotulo}</span>
    </span>
  );
}

/**
 * ⚠ O MODO ENRIQUECER É ESTA MESMA TELA, e é a razão das props serem opcionais.
 * A aba Enriquecer da Conciliação não recria o fluxo: monta este componente
 * passando os movimentos do mês/conta da régua. Tudo o mais — leitura, de-para,
 * prévia, confirmação, memória de apelidos — é o motor que já existe, exercido
 * pelo mesmo caminho. Duas telas divergiriam na primeira regra nova.
 *
 * ⚠ SEM AS PROPS, NADA MUDA: a rota `importacao-lanc-excel` do menu segue
 * baixando o modelo em branco, com os três exemplos, como sempre.
 */
export interface V2ImportLancamentosExcelProps {
  /** Movimentos que saem pré-preenchidos no modelo. Ausente = modelo em branco. */
  movimentosDoExtrato?: readonly MovimentoParaPlanilha[];
  /** Nome da conta, escrito na coluna "Conta bancária" de cada linha. */
  contaNome?: string;
  /** Sufixo do arquivo baixado, para o operador não confundir dois downloads. */
  sufixoArquivo?: string;
}

export function V2ImportLancamentosExcel({
  movimentosDoExtrato, contaNome, sufixoArquivo,
}: V2ImportLancamentosExcelProps = {}) {
  const {
    classificacoes, fornecedores, fazendas, contasBancarias, safras, criarFornecedor,
    arquivo, parse, dePara, previa, pendentes, lendo, erro,
    exigeFazendaCabecalho, fazendaCabecalhoId, setFazendaCabecalhoId,
    lerArquivo, resolverManualmente, alternarDescarte, alternarReinclusao, checandoDup, limpar,
    alternarSemClassificacao, limparSelecao, esquecerApelido, aliasIdPorTexto,
    criacoesAprovadas, alternarCriacao, marcarTodasCriacoes, contasComExtrato,
    confirmarImportacao, gravando, resultado,
  } = useImportLancamentosExcel();
  const [confirmando, setConfirmando] = useState(false);

  /* ⚠ O PRÉ-PREENCHIDO SÓ EXISTE COM MOVIMENTO. Com a régua num mês sem extrato,
     o botão continua entregando o modelo em branco — que é o arquivo certo para
     quem vai digitar do zero, e não uma planilha de zero linhas. */
  const temMovimentos = !!movimentosDoExtrato?.length;
  const baixar = () => {
    if (!temMovimentos) { baixarModeloPlanilha(); return; }
    baixarModeloPlanilha({
      linhas: linhasDoExtrato(movimentosDoExtrato!, contaNome ?? ''),
      nomeArquivo: `enriquecer-lancamentos${sufixoArquivo ? `-${sufixoArquivo}` : ''}.xlsx`,
    });
  };

  /* ⚠ O GRUPO ABERTO É ESTADO DE UI e nasce no primeiro: sem escolha do
     operador, abrir onde o trabalho começa é melhor que abrir vazio. */
  const [grupoDePara, setGrupoDePara] = useState<CampoDePara>('subcentro');

  const totalValoresDePara = useMemo(() => (dePara
    ? Object.keys(dePara.subcentro).length + Object.keys(dePara.fazenda).length
      + Object.keys(dePara.fornecedor).length + Object.keys(dePara.conta).length
      + Object.keys(dePara.safra).length
    : 0), [dePara]);

  const tipoPorTexto = useMemo(
    () => (parse ? tipoPorContaPlano(parse.rows) : {}),
    [parse],
  );

  // Fazenda do cabeçalho é obrigatória quando a planilha não traz a coluna.
  // '__global__' é sentinela de contexto, NUNCA uma fazenda — não entra na lista.
  const faltaFazendaCabecalho = exigeFazendaCabecalho && !fazendaCabecalhoId;

  /* ⚠ B-40 item 1b — PENDÊNCIA DE DE-PARA DEIXOU DE SER BLOQUEIO. Ela era, e o
     custo foi medido: nove valores sem mapeamento seguravam 409 linhas prontas.
     Uma pendência não impede as OUTRAS linhas de existirem — ela só decide o que
     acontece com as linhas daquele valor, e a prévia já as mostra fora. O botão
     agora confirma o que está resolvido e DIZ quantas ficam para trás. */
  const bloqueios: string[] = [];
  if (faltaFazendaCabecalho) bloqueios.push('a planilha não traz Fazenda — escolha uma no cabeçalho');
  if (previa && previa.totais.entram.qtd === 0) bloqueios.push('nenhuma linha elegível para importar');
  /* Placeholder — o bloqueio real por aprovação é montado abaixo, depois de
     `nVaiGravar` existir. */

  /* Linhas que ficam de fora POR CAUSA de de-para pendente — o número que o
     botão promete deixar para trás. Os outros motivos (mês fechado, duplicata)
     não são resolvíveis mapeando, e por isso não entram nesta conta. */
  const linhasPendentes = previa
    ? previa.totais.porMotivo
        .filter((m) => m.motivo === 'subcentro_nao_resolvido' || m.motivo === 'fazenda_nao_resolvida')
        .reduce((acc, m) => acc + m.qtd, 0)
    : 0;

  /* ⚠ B-42 — O BOTÃO CONTA O QUE VAI ACONTECER, não o que é elegível. Criação
     sem aprovação não grava; somá-la ao número do botão prometeria um resultado
     que o gravador não entrega. */
  const nAtualizam = previa
    ? previa.linhas.filter((l) => l.entra && l.modo === 'atualizar').length : 0;
  const nCriamAprovadas = previa
    ? previa.linhas.filter((l) => l.entra && l.modo === 'criar' && criacoesAprovadas.has(l.indice)).length : 0;
  const nVaiGravar = nAtualizam + nCriamAprovadas;
  /* ⚠ NADA A GRAVAR É BLOQUEIO, e é diferente de "nenhuma linha elegível": com
     todas as criações desmarcadas há linhas elegíveis e mesmo assim o confirmar
     não faria nada. O motivo diz qual dos dois é. */
  if (previa && previa.totais.entram.qtd > 0 && nVaiGravar === 0) {
    bloqueios.push('nenhuma criação aprovada — marque ao menos uma, ou não há o que gravar');
  }

  return (
    // PR-IMPORT-EXCEL-LANC-06 — conteúdo limitado (~70% num monitor grande) e ALINHADO
    // À ESQUERDA, sem mx-auto. Ocupando 100% da largura, os extremos de cada linha do
    // de-para ficavam distantes demais e a relação entre o valor de origem e o seu
    // estado se perdia. max-w em pixel, e não em %, para que telas menores usem tudo
    // o que têm em vez de encolher proporcionalmente.
    <div className="space-y-1.5 p-2 w-full max-w-[1100px]">
      {/* ── Passo 1 — arquivo. Cabeçalho congelado: com a lista longa de de-para,
             o operador perde o contexto do arquivo ao rolar. ── */}
      <div className="rounded-lg border bg-card p-2 space-y-1.5 sticky top-0 z-30">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[13px] font-semibold">Importar lançamentos por planilha</span>
          <span className="text-[10px] text-muted-foreground">
            Planilha no plano de contas do cliente · você mapeia cada conta uma vez · sem conciliação bancária
          </span>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div className="min-w-[220px]">
            <Label className="text-[10px]">Arquivo (.xlsx, .xls)</Label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              className="h-8 text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void lerArquivo(f);
              }}
            />
          </div>

          <Button
            variant="outline"
            className="h-8 text-[11px] gap-1"
            onClick={baixar}
            title={temMovimentos
              ? `Baixa o MESMO modelo, já preenchido com os ${movimentosDoExtrato!.length} movimentos do mês: data, valor, tipo, conta, descrição e documento. Você completa a classificação no Excel e sobe aqui.`
              : 'Baixa a planilha modelo, com os cabeçalhos que esta tela lê e uma aba de instruções.'}
          >
            <Download className="h-3.5 w-3.5" />
            {temMovimentos ? `Baixar preenchido (${movimentosDoExtrato!.length})` : 'Baixar modelo'}
          </Button>

          {exigeFazendaCabecalho && (
            <div className="min-w-[180px]">
              <Label className="text-[10px] text-amber-800">Fazenda (planilha não traz) *</Label>
              <Select value={fazendaCabecalhoId ?? ''} onValueChange={setFazendaCabecalhoId}>
                <SelectTrigger className="h-8 text-[11px]"><SelectValue placeholder="Escolher fazenda" /></SelectTrigger>
                <SelectContent>
                  {fazendas.filter((f) => f.id !== '__global__').map((f) => (
                    <SelectItem key={f.id} value={f.id} className="text-[11px]">{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {arquivo && (
            <Button variant="ghost" className="h-8 text-[11px]" onClick={limpar} disabled={lendo}>
              Limpar
            </Button>
          )}
        </div>

        {lendo && <div className="text-[10px] text-muted-foreground">Lendo a planilha…</div>}
        {/* ⚠ O ESTADO DA CHECAGEM É DITO: enquanto o banco não responde, a prévia
            ainda não sabe o que é duplicata, e uma lista que muda sozinha
            depois se lê como defeito. */}
        {checandoDup && <div className="text-[10px] text-muted-foreground">Procurando lançamentos equivalentes…</div>}
        {erro && <div className="text-[10px] text-destructive">{erro}</div>}

        {/* Coluna de plano ausente: avisar em vez de deixar o operador descobrir pela
            prévia inteira em vermelho. Foi o sintoma da homologação. */}
        {/* Nenhuma linha de cabeçalho reconhecida no topo. Dizer QUANTAS foram testadas,
            para o operador saber onde procurar em vez de adivinhar. */}
        {parse && parse.linhaCabecalho === null && parse.linhasTestadas > 0 && (
          <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
            <strong>Nenhuma linha de cabeçalho foi reconhecida</strong> nas {parse.linhasTestadas} primeiras
            linhas da aba <span className="font-mono">{parse.nomeSheet}</span>. Confira se os títulos das
            colunas estão no topo da planilha — ou use o botão <b>Baixar modelo</b>.
          </div>
        )}

        {parse && parse.linhaCabecalho !== null && parse.linhasValidas > 0 && !parse.colunaPlanoDetectada && (
          <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
            <strong>Nenhuma coluna de plano de contas foi encontrada</strong> na linha {parse.linhaCabecalho},
            reconhecida como cabeçalho. Sem ela nenhuma linha pode ser importada. Renomeie a coluna para
            {' '}<span className="font-mono">Conta (plano do cliente)</span> — ou use o botão <b>Baixar modelo</b>.
            Atenção: uma coluna chamada apenas <span className="font-mono">Conta</span> com valores como
            {' '}<span className="font-mono">cc-001 | bradesco</span> é conta <b>bancária</b>, não plano de contas.
          </div>
        )}

        {parse && (
          <div className="text-[10px] text-muted-foreground flex gap-3 flex-wrap">
            <span>Aba: <span className="font-mono">{parse.nomeSheet ?? '—'}</span></span>
            <span>
              Cabeçalho: {parse.linhaCabecalho !== null
                ? <>linha <span className="font-mono">{parse.linhaCabecalho}</span></>
                : <span className="text-amber-700 font-semibold">não reconhecido</span>}
            </span>
            <span>{parse.linhasValidas} linha(s) lida(s)</span>
            <span>
              Plano de contas:{' '}
              {parse.colunaPlanoDetectada
                ? <span className="font-mono">{parse.colunaPlanoDetectada}</span>
                : <span className="text-amber-700 font-semibold">coluna não encontrada</span>}
            </span>
            {parse.linhasComErro > 0 && (
              <span className="text-red-700">{parse.linhasComErro} linha(s) ilegível(is)</span>
            )}
          </div>
        )}

        {parse && parse.erros.length > 0 && (
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1 max-h-24 overflow-y-auto">
            {parse.erros.slice(0, 20).map((e) => (
              <div key={e.linha} className="text-[10px] text-red-800">
                Linha {e.linha}: {e.motivo}
              </div>
            ))}
            {parse.erros.length > 20 && (
              <div className="text-[10px] text-red-700">+{parse.erros.length - 20} outras</div>
            )}
          </div>
        )}
      </div>

      {/* ── Passo 2 — de-para ── */}
      {dePara && pendentes && (
        /* ⚠ B-42 — GRUPOS NAVEGÁVEIS, NÃO CINCO BLOCOS EMPILHADOS. Os cinco
           abertos faziam a tela ter metros de altura, e o contador de pendências
           — a única informação que diz se falta trabalho — saía do campo de
           visão assim que o operador começava a rolar. Agora um grupo por vez, e
           o cabeçalho com os contadores fica CONGELADO no topo.

           ⚠ E A LARGURA TOTAL DE CADA PAINEL FOI PRESERVADA: mapear é comparar
           dois textos, e a grade 2x2 de outrora truncava os dois. O que mudou é
           quantos aparecem ao mesmo tempo, nunca a largura de cada um. */
        <div className="rounded-lg border bg-card">
          <div className="sticky top-0 z-20 rounded-t-lg border-b bg-card px-2 py-1.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[11px] font-semibold">De-para</span>
              <span className="text-[10px] text-muted-foreground">
                <b className="tabular-nums">{totalValoresDePara}</b> valores ·{' '}
                <b className={`tabular-nums ${pendentes.total > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {pendentes.total}
                </b> a resolver
              </span>
              <div className="flex-1" />
              {/* ⚠ AVISO, NÃO TRAVA — B-40 item 1b. Âmbar e não vermelho:
                  vermelho promete impedimento, e a pendência já não impede. */}
              <span className={`text-[10px] font-semibold ${pendentes.total > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {pendentes.total > 0
                  ? 'as demais linhas entram assim mesmo'
                  : 'todos os valores resolvidos'}
              </span>
            </div>

            {/* As abas: cada uma carrega o "a resolver" do próprio grupo, para o
                operador saber ONDE está o trabalho sem abrir os cinco. */}
            <div className="mt-1 flex flex-wrap gap-1">
              {GRUPOS_DEPARA.filter(g => g.campo !== 'safra' || Object.keys(dePara.safra).length > 0)
                .map((g) => {
                  const nPend = pendentes[g.campo];
                  const ativo = grupoDePara === g.campo;
                  return (
                    <button key={g.campo} type="button"
                      onClick={() => setGrupoDePara(g.campo)}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        ativo ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                      {g.rotulo}
                      {/* Zero fica apagado mas NÃO some: um grupo que desaparece
                          faz o operador se perguntar se ele existia. */}
                      <span className={`ml-1 tabular-nums ${
                        nPend > 0 ? (ativo ? '' : 'text-amber-700 font-semibold') : 'opacity-50'}`}>
                        {nPend}
                      </span>
                    </button>
                  );
                })}
            </div>

            {/* ⚠ A ORIENTAÇÃO — B-40 item 6. O de-para parece um formulário a
                preencher inteiro; ele é uma pergunta que se responde UMA vez por
                valor e fica memorizada. Sem isto escrito, o operador não sabe nem
                que a memória existe, nem que a célula vazia é resposta legítima. */}
            <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
              O de-para pergunta uma vez por <b>conta do plano</b> do arquivo e memoriza para os
              próximos. Linha sem conta: deixe a célula vazia — entra sem classificação e você
              resolve na tela.
            </p>
          </div>

          {/* ⚠ SÓ O GRUPO ATIVO ROLA, e dentro de um teto: com 300 valores
              distintos, a página inteira crescia atrás do cabeçalho congelado —
              que então congelava fora da tela. */}
          <div className="max-h-[46vh] overflow-y-auto p-1.5">
            {grupoDePara === 'subcentro' && (
              <ImportLancDeParaPanel
                titulo="Conta do plano do cliente → Subcentro"
                campo="subcentro"
                mapa={dePara.subcentro}
                pendentes={pendentes.subcentro}
                tipoPorTexto={tipoPorTexto}
                classificacoes={classificacoes}
                onSemClassificacao={alternarSemClassificacao}
                onLimparSelecao={limparSelecao}
                onEsquecerApelido={esquecerApelido}
                temApelido={aliasIdPorTexto}
                onResolver={resolverManualmente}
                onDescartar={alternarDescarte}
              />
            )}
            {grupoDePara === 'fazenda' && (
              <ImportLancDeParaPanel
                titulo="Fazenda"
                campo="fazenda"
                mapa={dePara.fazenda}
                pendentes={pendentes.fazenda}
                fazendas={fazendas}
                onResolver={resolverManualmente}
                onDescartar={alternarDescarte}
              />
            )}
            {grupoDePara === 'fornecedor' && (
              <ImportLancDeParaPanel
                titulo="Fornecedor"
                campo="fornecedor"
                mapa={dePara.fornecedor}
                pendentes={pendentes.fornecedor}
                fornecedores={fornecedores}
                onResolver={resolverManualmente}
                onDescartar={alternarDescarte}
                onCriarFornecedor={criarFornecedor}
              />
            )}
            {grupoDePara === 'conta' && (
              <ImportLancDeParaPanel
                titulo="Conta bancária / cartão"
                campo="conta"
                mapa={dePara.conta}
                pendentes={pendentes.conta}
                contas={contasBancarias}
                onResolver={resolverManualmente}
                onDescartar={alternarDescarte}
              />
            )}
            {/* ⚠ O GRUPO DE SAFRA SÓ EXISTE QUANDO A PLANILHA TRAZ SAFRA — B-22d.
                Uma aba vazia permanente ensinaria que falta preencher algo que a
                maioria das planilhas não tem. */}
            {grupoDePara === 'safra' && Object.keys(dePara.safra).length > 0 && (
              <ImportLancDeParaPanel
                titulo="Safra"
                campo="safra"
                mapa={dePara.safra}
                pendentes={pendentes.safra}
                safras={safras}
                onResolver={resolverManualmente}
                onDescartar={alternarDescarte}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Passo 3 — prévia ── */}
      {previa && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold">Prévia</span>

          {/* ⚠ O QUE ESTE ARQUIVO VAI FAZER COM O MÊS, antes de confirmar — B-41.
              O total de entradas não respondia isso: 409 linhas entrando podem
              ser 409 lançamentos novos, duplicando o mês, ou 409 classificações
              sobre o que já existe. Resultados opostos, o mesmo número. */}
          <div className="flex flex-wrap items-center gap-1.5 rounded border bg-muted/30 px-2 py-1 text-[10px]">
            <Balde n={previa.totais.porBalde.atualizamPorId} rotulo="atualizam por ID"
              cor="text-primary"
              dica="A planilha trouxe o ID do lançamento — declaração explícita de quem atualizar." />
            <Balde n={previa.totais.porBalde.atualizamPorCasamento} rotulo="atualizam por casamento"
              cor="text-primary"
              dica="Sem ID, mas casaram com um lançamento existente por conta, valor e data — únicos dos dois lados." />
            <Balde n={previa.totais.porBalde.ambiguos} rotulo="ambíguos"
              cor="text-amber-700"
              dica="Casaram com mais de um lançamento, ou mais de uma linha disputa o mesmo. Ficam de fora: escolher por conta própria seria chutar. Informe o ID para resolver." />
            <Balde n={previa.totais.porBalde.criam} rotulo="criam"
              cor="text-emerald-700"
              dica="Não acharam par no sistema — entram como lançamento novo." />
            <Balde n={previa.totais.porBalde.fora} rotulo="fora"
              cor="text-muted-foreground"
              dica="Excluídas por outro motivo — mês fechado, transferência, duplicata, de-para pendente. A lista abaixo diz qual." />
          </div>

          <ImportLancPrevia linhas={previa.linhas} totais={previa.totais} aoReincluir={alternarReinclusao}
            criacoesAprovadas={criacoesAprovadas}
            aoAlternarCriacao={alternarCriacao}
            aoMarcarTodasCriacoes={marcarTodasCriacoes}
            contasComExtrato={contasComExtrato} />

          <div className="flex items-center justify-end gap-2 flex-wrap">
            {bloqueios.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {bloqueios.join(' · ')}
              </span>
            )}
            <Button
              size="sm"
              disabled={bloqueios.length > 0 || gravando || resultado !== null}
              title={bloqueios[0] ?? (linhasPendentes > 0
                ? `Importa as ${previa.totais.entram.qtd} linhas resolvidas. As ${linhasPendentes} pendentes continuam aqui — mapeie o valor, ou use "sem classificação" para elas entrarem cruas.`
                : undefined)}
              onClick={() => setConfirmando(true)}
            >
              {gravando
                ? 'Gravando…'
                /* O botão diz o que faz E o que deixa para trás, no próprio
                   rótulo: confirmar sem saber o que acontece é o que fazia o
                   operador descobrir a perda — ou a duplicata — depois. */
                : `Confirmar: ${nAtualizam} atualizam · ${nCriamAprovadas} criam (aprovadas)`
                  + (linhasPendentes > 0 ? ` — ${linhasPendentes} pendentes ficam de fora` : '')}
            </Button>
          </div>
        </div>
      )}

      {/* ── Resultado da gravação ── */}
      {resultado && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 space-y-1">
          <div className="text-[12px] font-semibold text-emerald-900">
            {resultado.criados} lançamento(s) criado(s)
            {/* B-22b — o modo atualização só aparece quando aconteceu; no fluxo
                de sempre a frase fica idêntica à de antes. */}
            {resultado.atualizados > 0 && ` · ${resultado.atualizados} atualizado(s)`}
            {resultado.falhas > 0 && ` · ${resultado.falhas} falha(s)`}
            {resultado.ignorados > 0 && ` · ${resultado.ignorados} fora da importação`}
          </div>
          <div className="text-[11px] text-emerald-800">
            Apelidos memorizados: {resultado.apelidos.subcentro} de conta do plano ·{' '}
            {resultado.apelidos.fornecedor} de fornecedor · {resultado.apelidos.conta} de conta bancária.
            Eles valem para as PRÓXIMAS importações — nada já lançado foi reclassificado.
          </div>
          {resultado.erros.length > 0 && (
            <div className="max-h-24 overflow-y-auto">
              {resultado.erros.slice(0, 20).map((e, i) => (
                <div key={i} className="text-[10px] text-red-800">{e}</div>
              ))}
            </div>
          )}
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={limpar}>
            Importar outra planilha
          </Button>
        </div>
      )}

      {/* ── Confirmação: o ponto sem volta ── */}
      <AlertDialog open={confirmando} onOpenChange={(v) => { if (!v) setConfirmando(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar a importação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-[13px]">
                <div>
                  Serão criados <strong>{previa?.totais.entram.qtd ?? 0}</strong> lançamento(s),
                  somando <strong>{formatMoeda(previa?.totais.entram.valor ?? 0)}</strong>.
                </div>
                {(previa?.totais.ficamDeFora.qtd ?? 0) > 0 && (
                  <div className="text-muted-foreground">
                    {previa?.totais.ficamDeFora.qtd} linha(s) ficam de fora
                    ({formatMoeda(previa?.totais.ficamDeFora.valor ?? 0)}) pelos motivos listados na prévia.
                  </div>
                )}
                <div className="text-amber-800">
                  Os apelidos que você resolveu à mão ficam memorizados para as próximas
                  importações. <strong>Nenhum lançamento já existente é reclassificado.</strong>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={gravando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={gravando}
              onClick={() => {
                setConfirmando(false);
                void confirmarImportacao().then((r) => {
                  if (!r) return;
                  if (r.falhas > 0) toast.warning(`${r.criados} criado(s), ${r.falhas} falha(s).`);
                  else toast.success(`${r.criados} lançamento(s) criado(s).`);
                });
              }}
            >
              {gravando ? 'Gravando…' : 'Confirmar e criar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default V2ImportLancamentosExcel;
