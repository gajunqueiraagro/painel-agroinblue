# Documentação AGROinBLUE

> Mapa oficial da documentação versionada. Estrutura alinhada à
> Documentation Architecture do projeto (6 artefatos). Diretórios
> são criados quando recebem o primeiro arquivo.

| Diretório | Artefato | Conteúdo |
|---|---|---|
| constituicao/ | Constituição | Princípios permanentes do produto (fonte normativa máxima) |
| adr/ | ADRs | Decisões arquiteturais datadas e imutáveis |
| specs/ | Specs/WSs | Especificações travadas de features e work streams |
| runbooks/ | Engineering Manual | Procedimentos operacionais passo a passo |
| modules/ | Engineering Manual | Regras e invariantes por módulo do sistema |
| evolution/ | Evolution | Histórico de evolução e post-mortems de sessão |

## Hierarquia de autoridade
Constituição > ADRs > specs/modules/runbooks > código comentado.
Em conflito, prevalece o nível superior. CLAUDE.md (raiz) é o manual
operacional de execução e referencia esta árvore.

## Regra soberana
A verdade técnica vive AQUI (versionada), nunca em contexto de chat
ou Project Knowledge. Estado atual do sistema se descobre
empiricamente, nunca se assume de documento.
