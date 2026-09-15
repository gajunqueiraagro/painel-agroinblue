# SPEC — ESTOQUE-LOCAIS-01: o grao tem lugar, e o lugar tem dono do saldo

Status: CONGELADA 15/09/2026. EL-01 e EL-02 FEITOS (b0d6a8d2, 953785cb).
Escopo: o estoque de graos passa a saber ONDE cada saca esta (galpao proprio,
silo proprio, cooperativa, armazem geral) e QUEM manda no saldo de cada lugar
(extrato de deposito do terceiro; contagem fisica no proprio). Cobre todos os
tipos de cliente: quem deposita tudo na coop, quem tem galpao, quem tem os dois.

Regra soberana: um dado, um dono. O livro de movimentos (agri_estoque_movimentacoes)
e a unica fonte de saida sem dinheiro; o saldo e sempre soma de movimentos por
local; nenhuma tela guarda saldo.

## 0. POR QUE
1. O lugar do grao era implicito (destino NULL, filial texto livre com duas grafias).
2. Quebra tecnica de armazenagem nao existia no modelo (na coop e o extrato que a traz).
3. Inventario fisico nao existia (em galpao proprio a verdade e a contagem).
4. Transferencia entre locais nao existia.
5. Sem local, balanco plurianual e "onde esta" sao impossiveis com 2+ lugares.

## 2. MODELO
2.1 agri_locais_estoque (FEITO EL-01): id, cliente_id, nome, tipo proprio|terceiro,
    fazenda_id (proprio), fornecedor_id (terceiro), codigo_externo, aliases,
    observacoes, ativo.
2.2 agri_contratos_armazenagem (FEITO EL-01): local terceiro; quebra_tecnica_tipo
    percentual_mes|tabela|nenhuma, pct, base, taxa_armazenagem, documento_ref.
2.3 local_estoque_id NOT NULL em agri_colheita, agri_oc_entregas,
    agri_estoque_movimentacoes (FEITO EL-02, backfill NJ -> Coop Parapua - 0136).
    Regra: cliente com UM local ativo -> campo preenchido sozinho nos modais e
    nem aparece (trigger agri_local_estoque_default e agri_local_estoque_resolver);
    DOIS ou mais -> obrigatorio, sem default silencioso.
2.4 Tipos de movimento e sentido (EL-04): sentido entrada|saida, transferencia_id,
    origem manual|extrato|inventario; tipos quebra, quebra_tecnica, ajuste_inventario,
    transferencia, consumo_proprio. quantidade > 0; o sinal e o sentido.
2.5 Leitura por local (FEITO EL-02): fn_estoque_graos/_resumo/_balanco com
    p_local_id default null (null = todos); fn_estoque_graos_por_local.
2.6 Inventario fisico, so local proprio (EL-05): agri_inventarios + itens;
    RPC agri_inventario_fechar grava ajuste_inventario; fechar e irreversivel.
2.7 Extrato de deposito, so local terceiro (EL-06): agri_extrato_deposito;
    conciliacao no padrao do Espelho; quebra_tecnica so nasce do extrato;
    saldo do extrato x livro: informacao, nao alarme (tolerancia meio saco).

## 3. TELAS E MODAIS (A23: nenhum slot muda de lugar)
- Cadastros > Locais de estoque (FEITO EL-01).
- Estoque de Graos: filtro Local no slot 2, rotulo do slot 4 com o local,
  card "Onde esta" so com 2+ locais (FEITO EL-02).
- Modal Colheita: "Local de entrada" (obrigatorio com 2+; some com 1);
  filial vem do codigo_externo do local (EL-03).
- VendaAvulsa e BarterVendaModal: "Sai de"; saldo DO local (EL-03).
- QuebraModal: campo local; em terceiro, aviso de que a quebra vem do extrato (EL-03).
- Modal Transferencia (EL-04), Modal Inventario (EL-05), Importar extrato +
  Espelho de deposito (EL-06).
- Balanco por safra: filtro Local (FEITO EL-02). Cotacao: sem mudanca.

## 4. SEQUENCIA
EL-01 FEITO · EL-02 FEITO · EL-03 modais · EL-04 sentido/transferencia/consumo
· EL-05 inventario · EL-06 extrato (BLOQUEADO ate um extrato real da coop)
· EL-07 agri_quebra_registrar_lote transacional.

## 5. NAO FAZ
Nao toca DRE nem patrimonio; nao resolve CLASSES POR CULTURA; nao modela
silvicultura nem cana; nao mexe em RLS.

## 7. VOCABULARIO
"Local de estoque" (nao armazem/deposito); "Proprio" / "Terceiro (cooperativa
ou armazem geral)"; "Quebra tecnica" (da cooperativa) x "Quebra" (perda vista);
"Inventario" = contagem fisica; "Extrato de deposito" = documento da coop.

## 8. DECISOES (Gabriel, 15/09)
a. Quebra tecnica: depende de um extrato real da coop (pendente).
b. Local terceiro permite quebra por evento alem da tecnica: SIM, com aviso.
c. Transferencia nao muda classe: classe e do grao, local e do lugar.
d. Colheita com 2+ locais: sem default.
e. consumo_proprio entra so como tipo no EL-04; a tela e frente propria.
