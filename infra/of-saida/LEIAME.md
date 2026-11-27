# agro-of-saida — a saída do Open Finance com IP FIXO (OF-IP-FIXO-01)

Decisão do Gabriel (26/11): AWS — Lambda do OF numa VPC + NAT Gateway + Elastic IP em sa-east-1, 1 NAT / 1 IP agora. **Nenhum Code tem
chave da AWS: o Gabriel sobe a pilha pelo console, a partir deste template.**

**Resposta da TecnoSpeed (Bruno, 26/11 13:56):** aceitam IPv4 ou IPv6; o único requisito é IP FIXO; não pedem mTLS nem quantidade
mínima de IPs. → O template atende SEM mudança: 1 Elastic IP v4 (Retain), sem certificado de cliente.

**Os segredos nunca saem da rede da AWS** (Gabriel 26/11): a Lambda lê o Secrets Manager por um endpoint PRIVADO dentro da VPC, e o cofre
RECUSA a leitura do papel da função que não venha por esse endpoint. Pela NAT (o IP fixo) só sai a chamada ao provedor.

Arquivos: `template.yaml` (a pilha) · `src/` (o código da Lambda) · `npm run zip` gera `of-saida.zip` (o código para enviar no passo 9).

## Passo a passo no console da AWS
(Os nomes abaixo são os do console em português; se o seu estiver em inglês, o nome em inglês vem entre colchetes.)

1. **Entrar no console da AWS** com o usuário que administra a conta. No canto superior direito, trocar a região para
   **América do Sul (São Paulo) sa-east-1**. ⚠ A pilha recusa subir em outra região.
2. Na busca do topo, digitar **CloudFormation** e abrir. Clicar em **Criar pilha** [Create stack] → **Com novos recursos (padrão)** [With new resources (standard)].
3. Em "Especificar modelo": **Escolher um modelo existente** [Choose an existing template] → **Fazer upload de um arquivo de modelo**
   [Upload a template file] → **Escolher arquivo** → `template.yaml` → **Próximo**.
4. **Nome da pilha**: `agro-of-saida`. **Parâmetros**:
   - `DestinoBase`: o endereço da API que a TecnoSpeed passar, só `https://host` (sem caminho, sem barra no fim). **Se ainda não tiver
     o endereço**, pôr `https://a-definir.invalid` (nada passa mesmo, porque os caminhos estão vazios) e trocar depois pelo
     "Atualizar a pilha" (seção abaixo) — **o IP não muda** na troca;
   - `CaminhosPermitidos`: **deixar vazio por enquanto** (a função sobe FECHADA: nenhum caminho passa; preenche-se depois da documentação);
   - `EmailDosAlertas`: o e-mail que recebe os alarmes;
   - `ZonaDeDisponibilidade`: `sa-east-1a` (já vem);
   - `IpFixoExistente`: **vazio** = a pilha cria um IP novo. **Para reaproveitar um IP guardado** (o caso depois de um ROLLBACK ou de
     apagar a pilha), colar o `eipalloc-…` dele (como achar: seção "Recriar a pilha com o MESMO IP");
   - `EnderecoDoIpExistente`: **vazio** quando o `IpFixoExistente` estiver vazio. Com o `IpFixoExistente` preenchido, é **obrigatório**:
     o número do IP guardado (o da coluna "Endereço IPv4 alocado"). O CloudFormation não lê o número de um IP que não criou; é ele que aparece na
     saída `IpDeSaida`. ⚠ É o número que VOCÊ digitou: confira com o EC2 no fim;
   - `TetoDeExecucoes`: **vazio** (sem reserva). ⚠ Conta nova tem cota de 10 execuções simultâneas e a AWS recusa qualquer reserva
     (foi a falha de 26/11 14:36). Só preencher (ex.: `5`) depois de a cota subir.
   → **Próximo**.
5. "Configurar opções da pilha": não mexer em nada → **Próximo**.
6. "Revisar": descer até o fim, marcar **"Eu reconheço que o AWS CloudFormation pode criar recursos do IAM com nomes personalizados"**
   [I acknowledge that AWS CloudFormation might create IAM resources with custom names] → **Enviar** [Submit].
7. Esperar o status **CREATE_COMPLETE** (5 a 10 min; a NAT é a que demora). Se aparecer ROLLBACK, a AWS desfaz tudo sozinha: me mande o
   texto da aba **Eventos** [Events].
8. Abrir a aba **Saídas** [Outputs]:
   - **`IpDeSaida`** → este é o IP para o Bruno (TecnoSpeed) cadastrar;
   - **`EnderecoDaFuncao`** → vai ao Supabase (passo 11).
   Na caixa do e-mail dos alertas: abrir "AWS Notification - Subscription Confirmation" e clicar em **Confirm subscription**.
9. **O código da função**: buscar **Lambda** → **Funções** → `agro-of-saida` → aba **Código** [Code] → **Carregar de** [Upload from] →
   **Arquivo .zip** → escolher `of-saida.zip` → **Salvar**. (Até este passo, a função só responde "sem_codigo".)
10. **O token da TecnoSpeed**: buscar **Secrets Manager** → `agro-of-saida/provedor` → **Recuperar valor do segredo** [Retrieve secret value]
    → **Editar** [Edit] → aba **Texto simples** [Plaintext] → apagar o `{}` e colar, trocando pelo que a TecnoSpeed der:
    `{"cabecalhos":{"Authorization":"Bearer COLE-AQUI-O-TOKEN"}}`
    (a TecnoSpeed NÃO pede certificado de cliente: só o cabeçalho; se a documentação deles usar outro nome de cabeçalho, troca-se só o
    nome, o formato do JSON é o mesmo)
    → **Salvar**. ⚠ O token nunca vai para a FILA, o chat ou o repositório. Trocar o token depois = repetir este passo (sem deploy;
    a função relê o segredo em até 5 min).
11. **O lado Supabase** (os 2 segredos + a sonda): a seção "Ligar o lado Supabase" abaixo.
    **Não criar `OF_PROVEDOR`**: sem ele, o Open Finance segue pela Pluggy.

## Ligar o lado Supabase (PROTO) e testar de ponta a ponta — sem o token da TecnoSpeed
Você copia e cola os segredos. Nenhum Code vê os valores: eles não vão à FILA, ao chat nem a print.
1. **Copiar o HMAC:** console da AWS (sa-east-1) → **Secrets Manager** → **Segredos** → `agro-of-saida/hmac` → **Recuperar valor do
   segredo** [Retrieve secret value] → aba **Texto simples** [Plaintext] → selecionar e copiar o valor inteiro (64 letras e números,
   uma linha, sem espaço).
2. **Colar no Supabase do PROTO:** painel do Supabase → projeto **proto** (`binbcdfbisgscrifztia` — ⚠ NUNCA o de produção) →
   **Edge Functions** → **Secrets** [Edge Function Secrets] → **Add new secret**:
   - `OF_SAIDA_HMAC` = o valor copiado (colar direto, sem aspas e sem espaço ou quebra de linha no fim);
   - `OF_SAIDA_URL` = o **`EnderecoDaFuncao`** (CloudFormation → `agro-of-saida` → **Saídas**), o endereço inteiro
     `https://….lambda-url.sa-east-1.on.aws/`;
   → **Save**. Limpe a área de transferência copiando outra coisa qualquer.
   **Não** criar nem mudar `OF_PROVEDOR`: o Open Finance continua no provedor de hoje.
3. **Publicar a sonda** (só depois do seu OK; o Code publica): a função `openfinance-saida-sonda`, só para o admin. Ela manda UM pedido
   assinado para um caminho que nunca é permitido e devolve só o resultado. Não lê o token do provedor, não chama a TecnoSpeed, não
   grava nada.
4. **Rodar a sonda:** logado como admin no proto, o Code chama a sonda pelo navegador (ou você, pelo botão que ele indicar). A resposta
   esperada:
   `{"ok":true,"resultado":"caminho",…}` = a volta inteira de pé: os 2 segredos certos, a assinatura conferida nos dois sentidos, o
   cofre lido pelo endpoint privado, o nonce gravado pelo caminho privado do DynamoDB, e o caminho fechado recusado.
   | Se vier | Quer dizer | O que fazer |
   |---|---|---|
   | `configuracao_supabase` | um dos 2 segredos falta, ou a URL não é a da Lambda | conferir os nomes e a URL do passo 2 |
   | `nao_autorizado` | o HMAC colado não é igual ao do cofre | colar de novo (espaço ou quebra de linha no fim) |
   | `sem_assinatura_500` | a Lambda falhou por dentro (cofre ou tabela) | print do CloudWatch › `/aws/lambda/agro-of-saida` |
   | `sem_assinatura_503` | o `of-saida.zip` não foi enviado | passo 9 |
   | `sem_assinatura_403` | falta uma permissão do endereço | print de Configuração › Permissões |
   | `conexao` | o endereço não respondeu | conferir o `OF_SAIDA_URL` |
   | `caminho_aberto` | ⚠ o caminho de teste PASSOU | NÃO ligar nada; print dos parâmetros da pilha |
5. **Conferir no CloudWatch** (opcional): **Grupos de logs** → `/aws/lambda/agro-of-saida` → a linha mais nova tem
   `"resultado":"caminho"` e nenhum caminho, corpo ou segredo.

## O que conferir depois (2 minutos)
- **EC2 → IPs elásticos** [Elastic IPs]: 1 IP, "Associado" à NAT `agro-of-saida`.
- **VPC → Grupos de segurança** → `agro-of-saida`: **Regras de entrada = nenhuma**; regras de saída = só **TCP 443**.
  E `agro-of-saida-endpoint-secrets`: entrada só **TCP 443 vinda do grupo `agro-of-saida`**; saída = só `127.0.0.1/32` (ou seja, nenhuma).
- **VPC → Endpoints** [Endpoints]: 2 endpoints, ambos **Disponível** [Available]:
  `com.amazonaws.sa-east-1.secretsmanager` (tipo **Interface**, "DNS privado" = **Sim**, sub-rede `agro-of-saida-privada`) e
  `com.amazonaws.sa-east-1.dynamodb` (tipo **Gateway**).
- **Secrets Manager → `agro-of-saida/hmac` → Permissões de recursos** [Resource permissions]: uma regra **Deny** "SoPeloEndpointPrivado"
  (o mesmo em `agro-of-saida/provedor`).
- **Lambda → agro-of-saida → Configuração → VPC**: a sub-rede `agro-of-saida-privada`.
- **As 2 permissões do endereço** (a mudança de 2025 da AWS: a Function URL pública pede `lambda:InvokeFunctionUrl` E `lambda:InvokeFunction`;
  o template já traz as duas): **Lambda → agro-of-saida → Configuração → Permissões → Política baseada em recursos** [Resource-based policy
  statements] → **2 declarações**: uma `lambda:InvokeFunctionUrl` (condição `FunctionUrlAuthType = NONE`) e uma `lambda:InvokeFunction`
  (condição `InvokedViaFunctionUrl = true` — só vale para quem chega PELO endereço; ninguém invoca a função direto pela API por ela).
- **Abrir o `EnderecoDaFuncao` no navegador**: tem de responder `{"ok":false,"falha":"nao_autorizado"}` (depois do passo 9) ou
  `"sem_codigo"` (antes) — **nunca dado nenhum**. ⚠ Se aparecer "Forbidden" (403) mesmo com as 2 declarações acima, me mande o print da
  política: não mexa à mão.
- **A leitura do segredo pelo endpoint** (depois do passo 10): **CloudWatch → Grupos de logs → `/aws/lambda/agro-of-saida`**: nenhuma linha
  `"resultado":"interno"` ou `"configuracao"` após um teste assinado (eu faço o teste quando a borda estiver pronta). Se o endpoint falhar,
  a trava do cofre recusa e o alarme `agro-of-saida-falhas` dispara — o segredo não sai pela internet.
- **CloudWatch → Alarmes**: 4 alarmes `agro-of-saida-*`, todos **OK**.

## Quanto custa (estimativa, 1 zona, uso baixo; conferir na calculadora da AWS antes de subir)
| Item | Por mês (US$) |
|---|---|
| NAT Gateway (sa-east-1, ~730 h) | ~65–70 |
| Dados processados na NAT (centenas de MB/mês) | < 1 |
| IP público (Elastic IP associado, cobrado desde 2024) | ~3,65 |
| **Endpoint privado do Secrets Manager** (Interface, 1 zona, ~730 h) | **~10–12** |
| Endpoint do DynamoDB (Gateway) | 0 |
| Secrets Manager (2 segredos + leituras) | ~0,80 |
| Lambda, DynamoDB sob demanda, logs (uso baixo) | < 1 |
| 4 alarmes do CloudWatch | ~0,40 |
| **Total** | **~US$ 80–90/mês** |
Os preços de sa-east-1 são mais altos que os dos EUA; os números acima são de memória e arredondados para cima. A 2ª zona (2º IP) dobra a NAT e o
endpoint (~+US$ 80).

## Atualizar a pilha (trocar o `DestinoBase` ou os `CaminhosPermitidos`)
CloudFormation → `agro-of-saida` → **Atualizar** [Update] → **Usar o modelo atual** [Use existing template] → Próximo → trocar só o
parâmetro → Próximo → Próximo → marcar o reconhecimento do IAM → **Enviar** → esperar **UPDATE_COMPLETE**. Só a configuração da função
muda; a NAT e o IP ficam os mesmos.
**Para levar um template NOVO** (ex.: o de 27/11, que faz a `IpDeSaida` trazer o número): no lugar de "Usar o modelo atual", escolher
**Substituir o modelo atual** [Replace current template] → upload do `template.yaml` novo. Os parâmetros que já existiam vêm
preenchidos; preencher o novo **`EnderecoDoIpExistente`** = o número do IP guardado (EC2 › IPs elásticos) (a pilha de 27/11 usa o IP guardado e recusa o update
sem o número). Antes de **Enviar**, a tela de revisão mostra o **conjunto de alterações** [change set]: tem de ser só **Modificar**
[Modify], nunca **Substituir** [Replacement] na NAT nem na função. Se aparecer Substituir, cancele e me mande o print.

## Recriar a pilha com o MESMO IP (depois de um ROLLBACK ou de apagar a pilha)
1. **Achar o AllocationId do IP guardado:** **EC2** → menu da esquerda **Rede e segurança** [Network & Security] → **IPs elásticos**
   [Elastic IPs] → a linha **`agro-of-saida-ip-fixo`** → coluna **ID de alocação** [Allocation ID] = `eipalloc-…` (copiar). A coluna
   **Endereço IPv4 alocado** [Allocated IPv4 address] é o IP que o Bruno cadastra — anote para conferir no fim. Se a linha aparecer
   "Associado" a alguma coisa, PARE e me mande o print.
2. **Apagar a pilha que falhou:** **CloudFormation** → `agro-of-saida` (status **ROLLBACK_COMPLETE**) → **Excluir** [Delete] →
   confirmar → esperar sumir da lista (ou **DELETE_COMPLETE** com o filtro "Excluídas"). O IP **não** é apagado (`Retain`).
3. **Conferir os nomes livres (30 s):** **Secrets Manager** → **Segredos** → não pode haver `agro-of-saida/hmac` nem
   `agro-of-saida/provedor` (o CloudFormation apaga sem janela de recuperação; se ainda aparecerem, esperar 5 min e recarregar).
4. **Criar de novo**: o passo a passo do início, com o `template.yaml` NOVO e, no passo 4, **`IpFixoExistente` = o `eipalloc-…`**
   do item 1, **`EnderecoDoIpExistente` = o endereço anotado no item 1** e **`TetoDeExecucoes` vazio**.
5. No fim, **Saídas** → `AlocacaoDoIp` = o mesmo `eipalloc-…` e `IpDeSaida` = o número que você digitou. **EC2 → IPs elásticos** →
   `agro-of-saida-ip-fixo` **associado** à NAT `agro-of-saida`, com o MESMO endereço. O EC2 é a prova: a `IpDeSaida` repete o que
   você digitou. (O IP também está sempre em **EC2 › IPs elásticos › agro-of-saida-ip-fixo › Endereço IPv4 alocado**.)

## Desfazer
- **Apagar a pilha e GUARDAR o IP** (o padrão): CloudFormation → `agro-of-saida` → **Excluir** [Delete] → confirmar. Some tudo (NAT,
  função, endpoints, segredos, tabela, alarmes, logs), **menos o Elastic IP**, que a pilha guarda de propósito (`Retain`). Custo que
  sobra: só o IP parado (~US$ 3,65/mês). Para subir de novo com o MESMO IP: a seção acima (`IpFixoExistente`).
  ⚠ Se a pilha foi criada COM `IpFixoExistente`, o IP nunca foi dela: apagar a pilha só o desassocia.
- **Apagar a pilha E o IP** (abandonar de vez): o passo acima e depois **EC2 → IPs elásticos** [Elastic IPs] → marcar
  `agro-of-saida-ip-fixo` → **Ações** [Actions] → **Liberar endereços IP elásticos** [Release Elastic IP addresses] → confirmar.
  ⚠ Liberado, o IP não volta: avisar o Bruno para tirar da lista.
