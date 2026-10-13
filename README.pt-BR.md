<div align="center">

# code-control

**Um painel de controle de código para o Claude Code.**<br>
Todo repositório git da sua sessão, num olhar: o que mudou, o que puxar, o que enviar e o que está em conflito. Faça commit, troque de branch, guarde no stash, puxe e resolva conflitos sem sair da conversa.

[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)
![Mod do Claude Code](https://img.shields.io/badge/Claude%20Code-mod-d97757)
![Superfícies](https://img.shields.io/badge/superf%C3%ADcies-desktop%20%C2%B7%20terminal%20%C2%B7%20VS%20Code-555)
![Idiomas](https://img.shields.io/badge/interface-English%20%C2%B7%20Portugu%C3%AAs-555)

[Read in English](README.md)

</div>

---

O Claude edita seus arquivos; o code-control mostra, ao vivo, o que isso significa no git. Ele fica ao lado da conversa, como o Source Control do VS Code, mas acompanha **todos** os repositórios das pastas que a sessão alcança, ordena pelo que precisa de você e mantém um resumo de uma linha logo acima do campo de mensagem.

```
 ⌄ Repositórios (12)                                   há 5 min   ↻   ⋯
   ▣ api-server       ⑂ feature/login               ● 14   ↓ 3   ↑ 2
   ▣ docs             ⑂ main                        !      ● 1
   ▣ web-app          ⑂ main                                ↓ 120
   › mais 9 · 7 em dia

 ▣ api-server   ⑂ feature/login ⌄                               ↓3   ↑2
 [ Mensagem do commit    ]  ✦   ✓ Commit   ⋯

 ⌄ Preparadas                                                         2
     TS  session.ts           src/auth                                M
 ⌄ Alterações                                                        12
     {}  package.json                                                 M
     #   login.css            src/styles                              U
 › ⤓ Para puxar                                                       3
 › ▤ Stash                                                            1
 › ⑂ Gráfico
```

<sub>Um esboço do layout. O app desktop desenha ícones de verdade, selos coloridos e dicas ao passar o mouse onde aqui aparecem caracteres; o terminal desenha caracteres bem parecidos com estes.</sub>

## Destaques

- **Todo repositório, ordenado pelo que precisa de você.** Conflitos e alterações primeiro, depois o que está atrás ou à frente, e os em dia recolhidos numa linha. Cada linha mostra o estado em selos coloridos: `!` problema, `●` alterações, `↓` para puxar, `↑` para enviar.
- **Uma linha de status acima do campo de mensagem.** O repositório selecionado, a branch e os selos ficam à vista enquanto você conversa com o Claude. Um clique abre o painel.
- **Commit como num editor.** Prepare, tire da preparação e descarte por arquivo ou tudo de uma vez, leia o diff no próprio painel, escreva a mensagem ou deixe o **✦** escrever no estilo do seu repositório. Corrija ou desfaça o último commit, ou guarde no stash, pelo menu **⋯**.
- **Branches e sincronização.** Troque de branch, acompanhe uma branch remota, crie uma nova, ou guarde e troque quando suas alterações estiverem no caminho. Puxe com fast-forward e escolha merge ou rebase quando as branches divergirem. Envie, ou publique uma branch sem upstream.
- **Conflitos resolvidos.** Um aviso do merge, rebase ou cherry-pick em andamento; manter a minha, manter a deles, marcar resolvido ou entregar o arquivo ao Claude para resolver; depois concluir ou abortar.
- **Histórico fácil de seguir.** Os commits para puxar com seus arquivos e um gráfico da sua branch e do upstream. Todo hash de commit é um link para a página dele no Azure DevOps, GitHub, GitLab ou Bitbucket.
- **Sempre atualizado.** Status a cada 30 segundos e logo depois que o Claude edita um arquivo; fetch silencioso a cada 5 minutos.
- **Cuidadoso por princípio.** Nada faz commit, pull ou push sozinho. Ações destrutivas pedem confirmação. Scripts são mostrados na pasta, nunca executados.

## Instalar

Num terminal:

```bash
claude plugin install code-control --marketplace elpicollon/code-control
```

Isso adiciona o marketplace e instala o plugin para o seu usuário, então ele carrega em todo projeto, no terminal e no Code tab do app desktop. Depois, abra uma sessão nova.

Já está numa sessão do Claude Code no terminal? O mesmo em dois passos:

```
/plugin marketplace add elpicollon/code-control
/plugin install code-control@code-control
```

> No app desktop, o `/plugin` abre o catálogo de plugins do próprio app, que não lista o code-control. Instale pelo terminal como acima; o Code tab carrega o plugin.

Para atualizar depois, rode `claude plugin update code-control@code-control`; para remover, `claude plugin uninstall code-control@code-control`.

**Requisitos**

- Claude Code com mods liberados. O code-control é um *mod*, um plugin de hooks de função. Os mods estão sendo liberados aos poucos: onde estão desligados, o plugin instala mas não carrega. Feito e testado no Claude Code 2.1.293 e 2.1.295.
- `git` no `PATH`.

## Primeiros passos

1. Digite `/code-control`. O painel abre ao lado da conversa.
2. Escolha um repositório na lista. O detalhe dele abre embaixo: branch, sincronização, commit e arquivos.
3. Trabalhe com o Claude normalmente. O painel e a linha de status acompanham cada mudança.

## Um passeio pelo painel

### Repositórios

Os repositórios são procurados na pasta de trabalho da sessão, na raiz do projeto e em qualquer pasta adicional que você tenha liberado, até três níveis abaixo. `node_modules`, pastas de build e pastas ocultas ficam de fora.

| Selo | Significa |
|---|---|
| `!` vermelho | Merge, rebase ou cherry-pick em andamento, um conflito ou um erro |
| `● 14` âmbar | Arquivos alterados |
| `↓ 3` azul | Commits para puxar |
| `↑ 2` verde | Commits para enviar |

Passe o mouse nos selos para ler o mesmo por extenso. Clique em qualquer ponto de uma linha para selecionar o repositório. O cabeçalho recolhe a lista, o `↻` faz fetch em todos agora e o `⋯` guarda os ajustes do painel.

### O repositório selecionado

- **Seletor de branch.** Troque para uma branch local ou acompanhe uma remota, ou crie uma nova. Quando há mais branches do que a lista comporta, *Outras branches…* abre um filtro. Se suas alterações seriam sobrescritas, *Guardar e trocar* faz as duas coisas.
- **`↓3` `↑2`.** Puxar e enviar. O pull é só fast-forward; se as branches divergiram, você escolhe **Mesclar** ou **Rebase**. Uma branch sem upstream ganha **Publicar branch** (`push -u`).
- **Linha do commit.** Escreva a mensagem e aperte Enter ou **✓ Commit**. Sem nada preparado, o Commit prepara tudo antes (menos durante um merge, rebase ou cherry-pick). O **✦** escreve a mensagem com o Claude, no estilo e no idioma dos seus dez últimos commits. O **⋯** tem *Corrigir último commit*, *Desfazer último commit* (um reset suave, as alterações continuam) e *Guardar alterações*. Corrigir e desfazer recusam um commit que já foi enviado.

### Alterações

Os arquivos ficam nos grupos **Conflitos**, **Preparadas** e **Alterações**, cada um com sua contagem e cada um recolhível. Todo arquivo mostra uma marca colorida do tipo, a pasta e a letra de status: `M` modificado, `A` adicionado, `U` novo, `D` excluído, `R` renomeado.

- Clique no nome de um arquivo para ver o diff no painel.
- Passe o mouse numa linha para `↗` abrir, `↶` descartar (pede confirmação), `+` preparar, `−` tirar da preparação. Passe no título de um grupo para preparar ou tirar tudo.
- O `↗` abre o arquivo no programa padrão. Script, executável ou arquivo sem extensão só é mostrado no Finder ou no Explorer, para nunca ser executado.

### Conflitos

Durante um merge, rebase ou cherry-pick, um aviso mostra a operação e conta os conflitos. Em cada arquivo você pode ver o conflito, **manter a minha** ou **manter a deles** (cada uma pede confirmação), abrir, **marcar resolvido** ou **resolver com o Claude**: o Claude recebe o arquivo e o que é cada lado, junta à mão e conta o que manteve. Sem mais conflitos, **Concluir** termina a operação; **Abortar** desfaz (pede confirmação).

Um conflito deixado por `stash apply` não tem operação por trás; manter a minha, manter a deles e resolver com o Claude continuam funcionando.

### Para puxar, Gráfico e Stash

- **Para puxar** lista os commits que você puxaria, com os arquivos de cada um.
- **Gráfico** desenha a sua branch e o upstream, 20 commits de início e mais quando você pedir.
- Clique no **hash** de um commit para abri-lo no site do seu remote; clique no **título** para ver os arquivos dele no painel.
- **Stash** lista os seus stashes: aplicar, aplicar e remover, ver o diff ou excluir (pede confirmação).

Os links de commit saem do remote que a sua branch acompanha:

| Servidor | Página do commit |
|---|---|
| Azure DevOps (`dev.azure.com`, `*.visualstudio.com`) | `…/_git/repo/commit/<hash>` |
| GitHub, GitHub Enterprise, Gitea | `…/commit/<hash>` |
| GitLab | `…/-/commit/<hash>` |
| Bitbucket Cloud | `…/commits/<hash>` |
| Bitbucket Server / Data Center | `…/projects/CHAVE/repos/repo/commits/<hash>` |

Remotes HTTPS e SSH funcionam, inclusive apelidos do `~/.ssh/config` (resolvidos com `ssh -G`, que só lê a configuração). Um remote em `http://` sem S ou numa pasta local fica sem link.

## Sempre atualizado

| Quando | O quê |
|---|---|
| A cada 30 segundos | `git status` de todos os repositórios |
| 1 segundo depois que o Claude edita um arquivo | `git status` de novo (depois de `Edit`, `Write`, `NotebookEdit` ou `Bash`) |
| A cada 5 minutos | `git fetch --prune`, em silêncio, sem pedido de credencial |
| `↻` | Procura repositórios novos e faz fetch na hora |

Com a linha de status ligada, isso roda desde o início da sessão; desligada, só com o painel aberto.

## Ajustes

Mude pelo `/config` num terminal do Claude Code. A linha de status também liga e desliga pelo menu `⋯` do painel.

| Ajuste | Padrão | |
|---|---|---|
| `showStatusRow` | `true` | A linha acima do campo de mensagem. Desligada, os repositórios só são lidos com o painel aberto. |
| `fetchIntervalMinutes` | `5` | Minutos entre os fetches automáticos, no mínimo 1. `0` desliga o fetch automático; o `↻` continua fazendo fetch. |
| `language` | `auto` | `en` ou `pt-BR`. `auto` escolhe português quando a configuração `language` do Claude Code, o `LANG` ou o idioma do sistema dizem isso, e inglês nos outros casos. |
| `commitMessageModel` | `sonnet` | O apelido ou id do modelo que o ✦ usa. |

## Segurança e privacidade

- **Nada acontece sozinho**, exceto o fetch. Commit, pull, push, descarte e stash só rodam quando você aperta.
- **Ações destrutivas pedem confirmação:** descartar, excluir um stash, manter a minha, manter a deles, abortar.
- **O git roda com cuidado.** Caminhos vão sempre ao pé da letra (`--literal-pathspecs`): um arquivo chamado `[ab].txt` é esse arquivo, nunca um padrão. As leituras de status não travam o índice (`--no-optional-locks`), então nunca atrapalham os comandos git do próprio Claude. O commit é recusado enquanto houver conflito.
- **O fetch automático nunca pergunta nada.** Ele desliga o pedido de credencial do próprio git (`GIT_TERMINAL_PROMPT=0`) e o do Git Credential Manager (`GCM_INTERACTIVE=never`). Não consegue desligar o pedido de senha da chave SSH, a confirmação de host do SSH nem um programa de askpass.
- **Hooks do repositório não rodam.** Os mods rodam o git com hooks desligados. Se o projeto depende de um hook de pre-commit, faça esse commit pelo terminal.
- **O que sai da sua máquina:** só o que o ✦ envia, que é o diff (até 60.000 caracteres), os nomes dos arquivos novos e os títulos dos seus dez últimos commits, pela sua própria sessão do Claude Code. *Resolver com o Claude* pede na sua conversa. Nada mais vai para lugar nenhum.

## Bom saber

- **O campo de mensagem é estreito** no app desktop: o Claude Code desenha o campo de texto de um mod com largura fixa. Uma mensagem maior que o campo aparece inteira logo abaixo dele.
- **Painéis muito cheios ficam mais leves.** O Claude Code não desenha um painel acima de certo tamanho. Perto disso, o code-control fecha os diffs abertos e mostra menos commits e arquivos, e avisa, em vez de ficar em branco.
- **O primeiro clique num painel que você não estava usando** só dá o foco a ele. Linhas, títulos de grupo e títulos de commit agem nesse clique mesmo assim; os outros botões podem precisar de um segundo.
- **No celular** o painel é só leitura: o app mobile ainda não desenha campos de texto.

## Como funciona

O code-control é um módulo de hooks para o motor de mods do Claude Code. Ele desenha o painel e a linha de status a partir do estado que guarda na sessão e fala com o git pelo executor de processos do motor, com uma fila por repositório e outra separada para a rede. Veja [docs/architecture.md](docs/architecture.md) (em inglês) para o mapa dos módulos e as decisões por trás deles.

## Desenvolver

```bash
claude plugin validate --strict .
claude plugin test .
npx -p typescript@5.6.3 tsc -p .
```

Para testar uma mudança ao vivo, inicie o Claude Code com `--plugin-dir .`, ou ligue a pasta à pasta de mods da sua sessão e deixe o Claude Code recarregar sozinho.

Os testes carregam o módulo real com um git roteirizado e montam o painel em todas as superfícies (desktop, terminal, VS Code e mobile), então layout, comportamento e as verificações do próprio motor ficam cobertos sem tocar num repositório de verdade.

## Licença

[MIT](LICENSE) © Rodrigo Picolo
