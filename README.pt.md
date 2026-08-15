# Sellfile Creator for RSL Helper

O Sellfile Creator facilita a criação de Sellfiles para o RSL Helper — defina filtros de equipamento por set, slot, stat principal, substats e mais, visualize os resultados em tempo real e exporte Sellfiles prontos a usar em segundos.

> Ferramenta criada por fãs. Não tem ligação com a Plarium, Raid: Shadow Legends ou RSL Helper. Todas as marcas mencionadas pertencem aos respetivos proprietários.

## Funcionalidades

- **Construtor de receitas** — crie receitas de manter/vender com filtros por slot,
  set, rank, raridade, stat principal, substats (com mínimos de rolagens e
  objetivos), facção e marcos de nível. Construa uma biblioteca reutilizável e exporte-a
  como Sellfile do RSL Helper (`.hsf`) com um clique.
- **Prévia Sellfile** — pré-visualize o Sellfile do RSL Helper
  gerado no separador Pré-visualização antes de exportar.
- **Metasets** — agrupe sets de equipamento (ex. Velocidade + Percepção) em
  coleções com nome e reutilize-os em receitas e salvaguardas.
- **Inspetor de Equipamento** — ligue ao RSL Helper para sincronização em tempo real ou carregue um ficheiro `.db` para pré-visualizar quais os itens que correspondem a cada receita e quantos seriam mantidos ou vendidos.
- **Comparação de equipamento** — ative uma vista de antes/depois para ver exatamente quais peças mudam entre *manter* e *vender* enquanto ajusta receitas ou experimenta as substituições dinâmicas. Um chip mostra os totais atuais; uma lista lado a lado mostra cada peça que mudou.
- **Simulador de masmorras** — consulte as percentagens de probabilidade de manter para o
  Cavaleiro do Fogo, o Dragão e o Golem de Gelo em níveis de dificuldade e atualização
  para confirmar o efeito do seu Sellfile ao farmar ou melhorar equipamento.
- **Salvaguardas** — defina combinações de slot/set/stat que nunca quer perder; o
  scanner injeta automaticamente regras de manter no Sellfile quando a sua
  configuração reduziria uma combinação protegida abaixo da sua quota.
- **Análise de Equipamento** — painel analítico com cartões KPI, gráficos de filtro cruzado
  (slot, rank, raridade, fonte, nível), um mapa de árvore de sets, barras de
  stats principais e um radar de substats. Clique em qualquer gráfico para
  filtrar todos os outros; envie o filtro ativo diretamente para o Inspetor de Equipamento.
- **Venda final** — um único botão adiciona regras de venda catch-all para equipamento não
  correspondente em intervalos de nível configuráveis, para que nada escape.
- **Temas** — alterne entre o modo escuro e o claro, personalize cores e raio dos cantos
  com o editor de temas integrado, ou ative uma paleta para daltónicos.

## Como utilizar

### Ficheiro de receitas
- SFC (`.sfc`): ficheiro de projeto da aplicação. Pense nele como um “save” que pode carregar ou partilhar. O RSL Helper não lê SFC diretamente.
- HSF (`.hsf`): o Sellfile consumido pelo RSL Helper. Exporte-o aqui e carregue-o depois no RSL Helper.
- O nome padrão ao guardar é `SellfileCreatorRecipes_AAAA MM DD_HHMM.sfc`.

### Receitas Builder
- Preencha o Receitas Builder e atribua um nome claro à receita.
- Clique em «Adicionar como nova receita» para guardar. Depois selecione a receita na lista por baixo do builder para a editar e confirme com «Atualizar receita selecionada».
- Carregar/Guardar: use «Carregar receitas» e «Guardar receitas» para reutilizar as regras. Estas ações mantêm tudo o que é necessário para reconstruir a prévia.
  - Clique no chevron (▾) junto a **Carregar ficheiro SFC** para abrir o respetivo menu: **Carregar do ficheiro…** abre o seletor de ficheiros do sistema como de costume; **Carregar predefinição: Principiante** ou **Carregar predefinição: Midgame ao Endgame** carrega uma das predefinições integradas após uma confirmação (a sua configuração atual será substituída).
- Menus de Reset/Insert/Apply: clique com o botão direito em «Reset», «Insert as receita» ou «Apply as receita» para abrir o menu partilhado. Guarde o estado atual do builder como modelo predefinido, volte às definições de fábrica, ative «Auto reset after Insert» (limpa o builder imediatamente após inserir uma receita) ou ative «Auto apply to selected receita» (envia as edições para a receita destacada automaticamente após ~400 ms de inatividade). Auto reset e Auto apply não podem ficar ativos ao mesmo tempo — ligar um desliga o outro — e ambas as preferências mantêm-se entre sessões.
- Nota: clique em «Adicionar nota…» (ou «Editar nota…») para anexar um texto ao ficheiro de receitas. Ao carregar um ficheiro que contenha nota, esta é mostrada automaticamente. Use `<!-- recipes:1,0 -->` para inserir chips de receitas específicas (0 escolhe a seguinte). Use `<!-- recipes-re:"speed" -->` para mostrar todas as receitas cujo nome corresponde ao padrão (ignorando maiúsculas/minúsculas). Adiciona `<!-- dungeon-simulator -->` para mostrar uma tabela em direto de probabilidade de retenção para o Cavaleiro do Fogo, o Dragão e o Golem de Gelo em três níveis de dificuldade (N20/N25/H10) e dois modos de boost, com as taxas de retenção a +0/+4/+8/+12/+16. Adiciona `<!-- recipe-overrides [columns=N] -->` para incorporar cartões de perguntas interativas (grupos de rádio/caixa de seleção) que substituem os modos de exportação e definições de receitas na sessão — as receitas armazenadas nunca são modificadas. Adiciona `<!-- safeguard-overrides [columns=N] -->` para incorporar cartões de controlos deslizantes e opções que substituem propriedades das salvaguardas (contagem, ativação, substats, probabilidade de melhoria e mais) na sessão — as salvaguardas armazenadas nunca são modificadas. Não é preciso escrever estes blocos à mão: ao editar a nota, o botão de lápis num cartão de pergunta (ou o botão correspondente na barra do editor para uma nova pergunta) abre um editor visual que permite montar as perguntas, opções e efeitos com controlos comuns. Quando algum destes marcadores estiver presente, o rodapé da nota mostra um botão **Desativar / Ativar substituições dinâmicas** e um botão **Repor opções**. Use **Guardar seleção atual…** (no menu «Substituições dinâmicas») para guardar as respostas atuais com um nome — os conjuntos de substituições guardados aparecem no mesmo menu e podem ser recarregados com um clique. Apenas as seleções presentes na nota atual são guardadas; ao carregar um conjunto, as perguntas que já não existem são ignoradas.
- Restauro do Autosave: ao iniciar, o diálogo lista cada secção auto-guardada com a sua própria caixa. Restaure apenas o que precisa — receitas (incluindo o chip selecionado), metasets, Alvos de substats, resto da Venda final, nota fixada, painel de filtros (estado aberto, chips, secções recolhidas) e importações do Inspetor de Equipamento. Deixe uma caixa desmarcada para manter o trabalho atual. O Autosave também recorda quais os interruptores da Venda final (Artefactos, Acessórios e intervalos de nível) estavam ativos, por isso reabrir Ferramentas reflete exatamente o que exportou da última vez.

### Estrutura do builder (de cima para baixo)
- Ação e Ativo: Defina o que acontece quando um item coincide.
  - `Manter` marca o item como Manter; o RSL Helper deixa-o intacto.
  - `Vender` marca o item como Vender; o RSL Helper coloca-o na fila de venda automática.
  - O interruptor «Ativado no Sellfile» decide se as linhas exportadas permanecem ativas. Receitas desativadas ficam riscadas na prévia e não têm efeito no RSL Helper; ativa «Omitir regras desativadas ao exportar» no menu de exportação se quiseres deixá-las de fora.
- Rank: Limite a regra a determinados ranks de estrelas caso queira tratar as peças de 6★ de forma diferente das de 5★. `Qualquer` mantém todos os ranks elegíveis.
- Níveis: Escolha Nível mínimo e máximo entre os marcos +0, +4, +8, +12, +16. As linhas só são geradas dentro dessa janela.
- Raridade: `Auto` (recomendado) escolhe a raridade mais baixa que continua a satisfazer os requisitos nos níveis selecionados.
  - Sem mínimos por stat ou soma global? Auto mantém a regra abrangente, compatível com todas as raridades.
  - A pedir 1/2/3/4 substats iniciais? Auto garante que a raridade pode começar com essa quantidade (1→≥ Incomum, 2→≥ Rara, 3→≥ Épica, 4→≥ Lendária).
  - A pedir um total de rolagens? Auto escolhe a raridade mais baixa que atinge essa soma em +16 (5 rolagens exigem Mítica).
  - Chip `Auto ≥` (abaixo de Limiar por marcos): eleva o piso e, com o modo Tarde, acrescenta ramos ≥ extra em +4/+8/+12.
    - Sequência: Incomum → Raro → Épico. «Auto ≥ Raro» exclui Incomum.
    - Só fica ativo quando Raridade = Auto e Limiar por marcos = Tarde. Caso contrário vê uma barra diagonal.
    - Exemplo: estandarte com SPD e ATK%, onde ATK% precisa de 2 rolagens. Raridade = Auto, Limiar = Tarde, Auto ≥ Épico. Resultado: linhas Épicas em todos os marcos e ≥ Lendária em +8/+12 para manter peças raras elegíveis.
  - Antes de +16 o builder usa o número de substats que a raridade suporta nesse momento. Em +16 aplica o objetivo completo.
- Facção: Restrinja regras de acessórios a uma facção específica quando está a montar uma equipa. Anéis, Amuletos e Estandartes respeitam o filtro; os artefactos ignoram a facção, pelo que `Qualquer` é a opção segura.
- Slots: Foque a regra em slots específicos (Arma, Botas, etc.) para impedir que itens fora do slot coincidam. Vazio = todos os slots.
- Sets e Metasets: Filtre para sets específicos ou metasets nomeados quando só pretende essas combinações. Vazio = todos os sets.
- Stats principais: Defina quais os stats principais aceites.
  - Pode selecionar vários; sem seleção = qualquer stat principal.
  - Ao escolher vários stats principais, o export gera uma linha por stat principal para manter tudo explícito.
- Substats: Indique quais contam.
  - Clique para ativar ou desativar um substat. Os bloqueados aparecem sempre nas linhas geradas.
  - Use o cadeado (🔒) junto ao rótulo para o tornar obrigatório; o clique direito abre as ações rápidas de bloqueio e limites de rolagem.
  - `Qualquer` repõe a seleção e significa «sem restrições». Ao escolher substats concretos, `Qualquer` desativa-se.
  - Cada linha usa `max(Obrigatórios, bloqueados)` até um máximo de quatro substats; bloquear reserva sempre um espaço.
- Interruptor Flex: Se houver mais opções do que o total obrigatório, o Flex roda essas opções por todas as permutações válidas para gerar cada mistura. Os bloqueados mantêm-se e o interruptor desliga-se sozinho quando já não há nada para rodar.
- Indicador de rolagens: Cada substat selecionado mostra um círculo para as melhorias.
  - Clique esquerdo aumenta a expectativa; direito diminui.
- A partir de ★: esquerda passa para mínimo verde (0→1→…→5), direita para limite superior vermelho (0→1→…→4).
- Com um limite superior vermelho, esquerda reduz o teto (1→0→★) e direita aumenta (0→1→…→4→★). Mínimo e limite superior são exclusivos.
- Alvos de rolagem (Base/+1…+5): Clique com o botão direito num substat selecionado para abrir a grelha de alvos. Base guarda o valor em +0 e cada campo +N representa o valor após esse número de rolagens extra. Deixe um campo em branco para reutilizar os seus Alvos de substats ou escolha «Usar alvos globais de substats» para limpar. As fichas da prévia atualizam-se no momento para que confirme os números antes de exportar.
- Substats obrigatórios: Defina quantos substats escolhidos o item precisa de ter.
  - `Auto` mantém a contagem alinhada com a seleção (até quatro).
  - Substats bloqueados (🔒) contam sempre e surgem avisos quando a combinação é impossível.
- Rolagens mínimas (global): Defina o total de rolagens partilhado pelos substats selecionados ou bloqueados. `0` ignora a verificação global. Cedo mostra apenas misturas que ainda conseguem chegar ao objetivo em +16.
- Rolagens mínimas bloqueadas (🔒) aparece quando pelo menos um substat está bloqueado. Clique num número da fila do cadeado para reservar essa quantidade de rolagens apenas para os stats bloqueados; o resto do builder continua a seguir o mínimo global. Se o cadeado igualar ou exceder o número realçado no badge global, esse badge limpa-se e o cadeado torna-se o único piso agregado. Ao desbloquear o substat (ou tocar em Auto) ambos os indicadores são limpos; ao escolher um valor global mais pequeno, o badge global volta a acender-se ao lado do cadeado para indicar que piso se aplica a cada grupo de stats.
- Exemplo: Bloqueie SPD e CR%, defina Rolagens mínimas = 3 e depois coloque a fila 🔒 em 2. O builder agora precisa de 3 rolagens no total entre todos os substats selecionados, pelo menos 2 delas nos picks bloqueados de SPD/CR%. Com o cadeado em 3, o badge global limpa automaticamente porque ambos os pisos seriam idênticos.
- Limiar por marcos: Controla como os mínimos por stat se aplicam antes de +16 quando exige rolagens mínimas.
  - `Cedo` acompanha as rolagens já obtidas em cada marco.
  - `Tarde` pede apenas o que tem de existir agora para que a meta de +16 se mantenha possível.
  - Só faz diferença se algum substat tiver Min > 0 ou se o mínimo global for > 0.

### Níveis e rolagens: guia rápido
- Limiares cedo: Quando as exigências podem ser cumpridas, as linhas ficam pelos seus Alvos de substats e estabilizam. Antes disso, Cedo mostra apenas combinações viáveis.
- Soma de rolagens (Σ): As rolagens mínimas referem-se à soma total sobre os substats selecionados no nível alvo.
- Curingas com soma mínima: Com apenas substats ★ e uma soma mínima > 0, Cedo apresenta apenas as divisões mínimas por marco. Tarde repete essas divisões nos marcos iniciais e em +16.
- Mítica (5 rolagens): A raridade Mítica pode atingir cinco rolagens num substat em +16 (o resto fica pelas quatro). Se Mítica estiver disponível, o gerador conta a rolagem extra logo em +0.

### Alvos de substats
- O botão «Alvos de substats…» no canto superior direito do builder abre o separador **Alvos de substats** no diálogo Ferramentas.
- Os alvos são globais e afetam todas as receitas.
- Estes alvos definem os limiares usados por intervalo de nível (0–3, 4–7, 8–11, 12–15, 16) e servem de fallback na grelha de Alvos de rolagem.
- Use «Repor predefinições» dentro da janela para voltar aos alvos recomendados.

### Metasets
- Clique em «Gerir metasets…» para abrir o diálogo.
- Crie ou renomeie metasets e escolha os sets que contêm. A interface usa a mesma pesquisa do seletor de sets.
- Existem metasets iniciais prontos a usar; pode editá-los ou removê-los.
- «Repor predefinições» oferece opções seguras quando um metaset está em uso (remover, substituir por sets explícitos ou por outro metaset).

### Venda final
- Use o interruptor `Venda final` no cabeçalho da pré-visualização para ativar regras de venda para os itens restantes. A etiqueta não muda; o preenchimento âmbar indica que está ativa e o contorno neutro indica que está desligada.
- Clique em «Ferramentas» ao lado do interruptor para abrir o separador `Venda final` e decidir se abrange Artefactos, Acessórios e quais os intervalos de nível (0–3, 4–7, 8–11, 12–15, 16). A predefinição cobre 0–15, por isso o `+16` só entra quando o ativares.
- Sem `Venda final`, o RSL Helper mantém tudo o que não coincide com uma regra. Só vende quando uma regra explícita diz Vender.
- Com `Venda final` ativa, as regras geradas incluem todos os sets conhecidos. Na prévia surge «Todos os sets conhecidos» para reduzir ruído; o ficheiro exportado lista os sets um a um.

### Salvaguardas
- Muda o builder para o modo **Salvaguardas** usando o botão de alternância acima do painel do builder para marcar as combinações que nunca queres perder. Ativa `Ativar Salvaguardas` para deixar o scanner adicionar linhas de manter (editar uma salvaguarda também ativa automaticamente).
- As salvaguardas não «consomem» itens—cada salvaguarda avalia o mesmo conjunto de candidatos. Se uma peça corresponder a várias salvaguardas, conta para todas.
- Cada salvaguarda permite escolher slot, sets ou metasets, ranks, raridades, stats principais e, no caso dos acessórios, facções. Deixar um seletor vazio significa «qualquer».
- `Modo` decide o que a salvaguarda faz — os nomes correspondem aos botões da app: `Desligar` desativa a regra, `Proteger` mantém apenas o equipamento correspondente que já possui (até à quantidade necessária), `Antecipar` protege também as novas peças enquanto tiver menos correspondências do que a quantidade necessária, e `Melhorar` continua a vigiar mesmo com a quantidade atingida: uma nova peça só fica protegida enquanto a hipótese de melhoria configurada indicar que ainda pode superar o seu equipamento atual (verificado em cada etapa de melhoria); sem hipótese de melhoria configurada funciona como `Antecipar`.
- Os substats são opcionais: escolhe um ou mais para contar apenas itens que tenham esses substats. Os chips de correspondência definem quantos dos substats selecionados uma peça tem de ter — `≥1`–`≥4` (os chips acima do número que escolheste ficam a cinzento) — ou `Por Substat`, que aplica a quota a cada substat selecionado individualmente. Deixar os substats vazios permite qualquer substat.
- Os substats selecionados são sempre ordenados pela fórmula normalizada (glifos ignorados); os controlos de peso aparecem em todos os modos de quantidade mínima (`≥1`–`≥4`), enquanto `Por Substat` mantém a ponderação igual (empates no corte continuam protegidos).
- `Ponderar por rank` (a chip ao lado de `Por stat principal`) integra o rank na própria pontuação, em vez de o deixar apenas como desempate exato. O bónus é escalado pelo **stat principal**, e o tamanho exato depende do slot e do stat principal — um stat principal 5★ pontua cerca de 81–89% do 6★ do mesmo slot, e um 4★ ainda menos. A diferença entre ranks adjacentes é pequena: suficiente para deixar um 6★ ganhar um *quase*-empate contra um 5★ do mesmo stat principal com substats apenas ligeiramente melhores, mas não para superar uma verdadeira vantagem de substats. Usa o stat principal +16 do rank, por isso subir de nível uma peça nunca altera a sua pontuação, e as pontuações de substats ficam intactas. Requer pelo menos um substat selecionado; as regras novas têm-no ligado por predefinição.
  - O botão de ajuste na chip `Ponderar por rank` abre o painel de pesos, onde o stat principal surge como a sua própria linha ponderada (`Stat principal (por rank)`) ao lado dos substats. O seu peso é um multiplicador sobre o bónus de rank acima: deixe-o em `1.0` para o comportamento predefinido, aumente-o para que o stat principal de uma peça de rank superior supere os melhores substats de uma inferior, ou baixe-o para `0` para se apoiar apenas nos substats. É assim que decide se ganha o rank ou os substats quando divergem — a lista de candidatos reordena-se em tempo real enquanto ajusta.
- `≥ Quantidade necessária` é a promessa que queres manter. Os chips de âmbito logo abaixo de cada seletor (tudo exceto `Rank` e `Raridade`) decidem como a quota é dividida: `Por slot`, `Por set`, `Por facção` e `Por stat principal` podem ser combinados livremente. Desligar todos volta automaticamente para `Por salvaguarda`.
- A dica de `Quantidade necessária` mostra a divisão ativa de âmbito (`X por slot × por set × ...`) e uma linha simples de falta (`({missing} em falta)`).
- O scanner só adiciona linhas de manter para itens correspondentes que seriam vendidos, e só quando a quantidade necessária não é atingida. Com `Antecipar`, salvaguardas fictícias cobrem as correspondências que ainda faltam; com `Melhorar`, permanecem ativas regras extra de manter com a quantidade atingida — mas apenas para peças cuja hipótese de melhoria ainda supere o limite da regra.
- **Opções ignorar** (chips ao lado do interruptor de ativação da salvaguarda) afinam o que cada salvaguarda conta:
  - `Ignorar salvaguardas anteriores` – quando a salvaguarda classifica candidatos por substats, descarta do seu pool as peças que salvaguardas anteriores já mantiveram e escolhe em vez delas as seguintes melhores por pontuação. Útil quando empilhas uma segunda salvaguarda de SPD/CR depois de uma genérica e queres que vá mais fundo no ranking em vez de proteger redundantemente as mesmas peças. Salvaguardas sem substats não são afetadas. Padrão: desligado.
  - `Ignorar equipados (Coleção)` – exclui peças atualmente equipadas em campeões da coleção do contador de correspondências desta salvaguarda, para que não satisfaçam a sua quota. Padrão: desligado.
  - `Ignorar equipados (Cofre)` – mesma ideia mas para campeões do cofre. Padrão: desligado.
- **`Hipótese de Melhoria ≥ N%`** (explorador de talentos opcional): alarga a rede de segurança além do top-N padrão. O scanner mantém sempre primeiro as peças do top-N pelo seu valor de substat **atual** — essas nunca estão em risco. Depois, protege também qualquer peça *fora* desse top-N cuja hipótese de melhoria atinja o limiar. O raciocínio é: «guardar os drops em bruto que têm boas hipóteses de ser competitivos depois de melhorados».

  **O que é a hipótese de melhoria?** A app simula todas as formas possíveis como uma peça pode rolar durante as melhorias até +16 — algumas rolagens afetam o substat que te interessa, outras não — e conta quantas vezes a peça acaba no teu top N em todos esses futuros. Uma peça com 68 % de hipótese de melhoria chega ao top N em cerca de dois em cada três caminhos simulados.

  **A hipótese de melhoria é uma *previsão*, não a regra que mantém o teu equipamento — são dois sistemas distintos.** Isto costuma confundir, por isso vale a pena ser claro:

  - O safeguard **mantém sempre as peças do top-N pelo seu valor de substat *neste momento***. É essa ordenação pelo valor atual que realmente protege uma peça.
  - A hipótese de melhoria responde a uma pergunta *diferente*: *«quando tudo estiver melhorado para +16, esta peça continuará entre as minhas melhores?»*. Pontua **tanto a peça como os seus concorrentes pelos valores projetados a +16** e conta quantas vezes a peça acaba no top N.

  Como fazem perguntas diferentes, as duas podem divergir — e isso é esperado, não é um erro:

  - Uma peça pode mostrar **0 % de hipótese de melhoria e ainda assim estar protegida.** É uma das tuas melhores *hoje* (por isso o top-N pelo valor atual mantém-na), mas a simulação espera que rivais que também estão a ser melhoradas a ultrapassem até +16 (logo a hipótese *futura* de top-N é ~0 %). Uma única boa rolagem que coloque uma peça no teu top-N atual protege-a de imediato — a hipótese de melhoria pode ficar nos 0 % o tempo todo, porque esse número nunca foi o que a protegia.
  - Uma peça pode mostrar uma **hipótese de melhoria alta e ainda assim não estar protegida (ainda).** É um drop promissor que não está no teu top-N atual: só é mantido se ativares o limiar abaixo.

  **Regra fundamental: o limiar só pode adicionar à proteção, nunca retirar.** O teu top-N atual é sempre conservado, independentemente da sua pontuação de hipótese de melhoria. Uma peça completamente melhorada (+16) conta diretamente o seu valor atual bloqueado — não pode sair da proteção por ter «esgotado o potencial de melhoria».

  **Exemplo — estandartes SPD, Quantidade necessária = 2, Por facção (rank 6 lendário):**

  | Estandarte | SPD | Nível | Hipótese de melhoria | Padrão | Limiar ≥ 50 % | Limiar ≥ 25 % |
  | --- | --- | --- | --- | --- | --- | --- |
  | A | 12 | +16 | 100 % | ✔ top-2 | ✔ top-2 | ✔ top-2 |
  | B | 6 | +16 | 0 % | ✔ top-2 | ✔ top-2 | ✔ top-2 |
  | C | 5 | +0 | 26 % | ✗ vendido | ✗ vendido | ✔ limiar adiciona |

  Os estandartes de rank 6 rolam SPD em incrementos de **5 ou 6** por evento, pelo que os únicos valores realistas em estado fresco são **5** (mínimo) ou **6** (máximo). O SPD=12 do estandarte A significa que recebeu exatamente uma rolagem SPD bónus durante as melhorias (6 inicial + 1 rolagem de 6). O estandarte B foi totalmente melhorado sem rolagens SPD bónus — o seu valor está bloqueado em 6.

  O estandarte B tem 0 % de hipótese de melhoria: o seu SPD=6 fixo perderá previsivelmente contra qualquer concorrente não melhorado cujas rolagens futuras possam superá-lo. Mesmo assim, permanece protegido porque está no top-2 padrão pelo valor **atual**. A hipótese de melhoria nunca pode remover itens do top-N — apenas a lógica de expansão por limiar a utiliza.

  O estandarte C (SPD=5, fresco) fica mesmo fora do top-2 pelo valor atual. A sua hipótese de melhoria de 26 % significa que acabaria no top-2 em cerca de 1 em cada 4 caminhos simulados. Com limiar ≥ **25 %** fica protegido; com limiar ≥ 50 % continua vendido.

  Se o estandarte C tivesse começado com **SPD=6**, a sua hipótese de melhoria sobe para **68 %** — um candidato muito mais forte. Limiar ≥ **65 %** protegê-lo-ia.

  **Os estandartes épicos de rank 6** recebem apenas **3 eventos de rolagem SPD** (contra 4 para os lendários, porque a melhoria +4 adiciona um novo substat em vez de rolar um existente). As hipóteses resultantes são quase idênticas: SPD=6 fresco → **70 %**, SPD=5 fresco → **26 %**.

  **Limiares sugeridos (equipamento de rank 6):**
  - **65 %** — protege drops frescos com rolagem máxima (SPD=6, ~68–70 % de hipótese). Bom padrão se quiseres que drops promissores sobrevivam enquanto são melhorados.
  - **25 %** — também protege drops com rolagem mínima (SPD=5, ~26 % de hipótese). Rede mais abrangente; usa quando o espaço no inventário não é uma preocupação.
  - Evita **100 %**: só coincide com peças totalmente melhoradas já mantidas pelo top-N padrão, pelo que não acrescenta nada além do modo padrão.

#### Âmbitos de quota num relance
Empilhar os chips de âmbito altera quem recebe quota própria. Mantém `Por salvaguarda` ligado para partilhar um único pool e ativa `Por slot`, `Por set`, `Por facção` e `Por stat principal` para impor misturas Slot × Set × Facção × Stat principal de forma independente.

| Botão de âmbito | Comportamento da quota | Quando usar |
| --- | --- | --- |
| `Por salvaguarda` | Um único pool para toda a salvaguarda. | Mantém cinco botas SPD independentemente do set. |
| `Por slot` | Duplica a quota para cada slot. | Protege dois anéis, dois amuletos e dois estandartes em separado. |
| `Por set` | Duplica a quota para cada set/metaset da salvaguarda. | Acompanha duas quedas de Stoneskin e duas de Protection individualmente. |
| `Por facção` | Duplica a quota para cada facção. | Garante três anéis Merciless para cada facção. |
| `Por stat principal` | Duplica a quota para cada stat principal selecionado. | Mantém pools separados para estandartes ACC vs. RES. |

#### Grupos: várias proteções a partilhar uma quantidade necessária
Duas proteções podem acabar por descrever a *mesma* promessa sem querer. Uma mantém 3 bons anéis, outra mantém 2 — mas só querias 3 anéis no total, e agora estás a manter 5.

Um **grupo** resolve isso. Seleciona as proteções (clique e depois Ctrl+clique) e escolhe `Agrupar salvaguardas selecionadas` no menu de contexto. Cada membro mostra agora uma margem colorida na lista, e no formulário aparece uma pequena faixa de grupo mesmo ao lado da sua `Quantidade necessária`: a quantidade própria do grupo e os seus botões de âmbito.

- Cada proteção num grupo continua a procurar **exatamente** o que sempre procurou — os seus próprios slots, sets, substats, pesos e modo. Um grupo nunca muda o que elas procuram.
- O que muda é para onde vão os achados. Uma proteção num grupo já não mantém equipamento por conta própria: **oferece** os seus achados ao grupo, e a sua própria `Quantidade necessária` decide quantos oferece.
- A quantidade do grupo (o campo `⊚ ≥` ao lado de `Quantidade necessária`) é o número que decide de facto. Escreve-o diretamente: é quanto o grupo mantém de tudo o que as suas proteções ofereceram. Começa como a soma das quantidades dos membros, pelo que agrupar não muda nada até a reduzires. Editá-la em qualquer membro edita o grupo.
- Os botões de âmbito do grupo decidem o que conta como o mesmo conjunto. Põe `facção` no grupo e cada facção terá a sua própria quantidade, seja qual for a divisão das proteções lá dentro.
- Quando várias proteções oferecem peças para o mesmo conjunto, **as melhores peças ganham**. Cada peça é julgada pelas substats e pesos da proteção que a ofereceu, por isso uma peça da segunda proteção pode perfeitamente superar uma da primeira. O painel de candidatos marca na cor do grupo as peças que o grupo vendeu, e o seu botão `Grupo` mostra todo o conjunto ordenado em conjunto.
- Os grupos são contíguos: arrasta uma proteção para dentro de um grupo (larga-a dentro do parêntese colorido) ou para fora (larga-a rente), ou usa o menu de contexto — `Remover do grupo`, `Juntar ao grupo acima/abaixo`, `Desagrupar`. Mover uma proteção para cima ou para baixo nunca muda o seu grupo; um grupo inteiro move-se como um bloco.

**Exemplo.** Queres cinco bons acessórios de VEL por facção, mas «bom» significa duas coisas diferentes: `VEL + TC + DC` para quem faz dano, `VEL + PV + DEF` para tanques. Cria uma proteção para cada perfil, agrupa-as e define o grupo como `5` com `facção`. Cada proteção oferece as suas melhores peças, e o grupo mantém as cinco que saíram melhor entre as duas — em vez de cinco de cada.

#### Exemplos reais
| Cenário | Filtros | Quantidade necessária | Botões de âmbito | O que o scanner garante |
| --- | --- | --- | --- | --- |
| A faltar botas SPD | Slot = Botas, Stat principal = SPD, Sets vazios | `5` | `Por salvaguarda` | Pelo menos cinco botas SPD sobrevivem, independentemente do set. |
| Misturar luvas Savage e Lethal | Slot = Luvas, Sets = Savage + Lethal, Stat principal = CDMG% | `3` | `Por salvaguarda` | Três luvas de dano continuam seguras mesmo quando a mistura de sets muda. |
| Anéis Merciless por facção | Slot = Anel, Set = Merciless, Facção em branco | `3` | `Por facção` | Cada facção guarda três anéis Merciless próprios. |
| Anéis de HP% por facção | Slot = Anel, Stat principal = HP%, Sets vazios | `2` | `Por facção` | Permanecem dois anéis de HP% por facção. |
| Acessórios básicos por facção | Três regras (Anel, Amuleto, Estandarte), Sets/Stat principal vazios | `5` | `Por facção` | Cada facção conserva cinco anéis, amuletos e estandartes. |
| Cinco acessórios por facção, em qualquer slot | As mesmas três regras, dentro de um grupo | `5` no grupo | `Por facção` no grupo | Cada facção mantém cinco acessórios no total, em quaisquer slots que sejam. |
| Acessórios Stoneskin + Protection | Slot = Anel/Amuleto/Estandarte, Sets = Stoneskin + Protection, Stat principal vazio | `2` | `Por set` + `Por facção` + `Por slot` | Cada facção guarda duas peças Stoneskin e duas Protection em cada slot de acessório. |
| Acessórios com SPD mais alto | Slot = Anel/Amuleto/Estandarte, Substats = SPD | `5` | `Por salvaguarda` | Mantém as cinco melhores rolagens de SPD entre os acessórios (empates incluídos). |
| Estandartes de ACC com SPD | Slot = Estandarte, Stat principal = ACC, Substats = SPD + ACC, Pesos: SPD mais alto | `3` | `Por facção` | Cada facção guarda os melhores estandartes de ACC onde SPD conta mais. |

Dica: importa a tua `.db` ou cola itens no diálogo Equipamento antes de ativar o modo Salvaguardas para que o scanner veja equipamento real. Clica numa salvaguarda para realçar o equipamento correspondente; muda `Filtro` para `Seleção` para veres apenas essas correspondências.

### Drops de masmorra (Simulador)
Abra «Ferramentas» e mude para **Drops de masmorra**. Simula o farm em masmorras com as suas regras atuais do Sellfile para ver quanto equipamento manteria por set e nível de melhoria.

- Escolha uma masmorra e uma etapa.
- Modo de simulação:
  - `Subida de nível`: as rolagens param assim que o item seria vendido, por isso reflete o nível real.
  - `Instantâneo`: as rolagens vão sempre até +16, mesmo que o item fosse vendido antes.
- A tabela mostra drops mantidos divididos por todos os drops dessa etapa em +0 / +4 / +8 / +12 / +16.
- Clique numa célula para o detalhe de slot + stat principal e depois abra **Probabilidades de substats específicos** para ver chances exatas e estimativas de execuções.

Notas:
- Usa as suas regras atuais de Manter/Vender, incluindo Venda final e Salvaguardas.
- Corre cerca de 100.000 drops por etapa e atualiza enquanto corre.
- As taxas de drop e as rolagens são simuladas, por isso os números são estimativas.

### Análise de Equipamento
Abra «Ferramentas» e mude para o separador **Análise de Equipamento** para uma visão analítica do seu equipamento importado.

**Cartões KPI (linha superior):** Oito cartões de percentagem — **Taxa 6★**, **Lendária+**, **Maxed (+16)**, **Equipada**, **Bloqueada no cofre**, **Chaos'd**, **Glyphed**, **Ascendida** — cada um com um tooltip.

**Donuts de filtro cruzado:** Seis gráficos — **Slots**, **Rank**, **Raridade**, **Resultado**, **Fonte**, **Nível** — atualizam-se mutuamente ao clicar.
- Clique num segmento para o adicionar como filtro dessa dimensão; todos os outros gráficos restringem-se imediatamente ao equipamento correspondente. Cada gráfico exclui a sua própria dimensão para mostrar sempre o intervalo completo.
- Duplo clique num segmento do donut **Slots** para selecionar um grupo inteiro de uma vez: qualquer peça de artefacto (Arma, Elmo, Escudo, Luvas, Couraça, Botas) seleciona os seis slots de artefacto; qualquer acessório (Anel, Amuleto, Estandarte) seleciona os três.
- Os donuts **Slots** e **Fonte** mostram ícones de categoria. O donut **Nível** etiqueta cada arco com o texto do nível.


**Treemap de Sets:** Apresentado abaixo dos donuts. Cada mosaico representa um set de equipamento; a área do mosaico é proporcional ao número de itens. O fundo do mosaico está dividido da esquerda para a direita em bandas de cor por resultado (Vender / Salvaguardado / Guardar / Sem correspondência). Clique num mosaico para adicionar esse set como filtro cruzado.

**Chips de filtro:** As seleções ativas para cada dimensão aparecem como chips abaixo dos donuts; clique no ícone de eliminar num chip para remover apenas esse filtro. As seleções de stat principal também aparecem como chips. O botão **Limpar filtros** repõe todas as dimensões de uma vez.

**Barra de Stats principais:** Mostra a frequência de cada stat principal no equipamento filtrado. Clique numa barra para aprofundar — o gráfico de frequência de substats atualiza-se para mostrar apenas substats do equipamento com esse stat principal selecionado. Clique novamente para desselecionar.

**Hipótese de melhoria:** Probabilidade de o seu equipamento melhorar, agrupada em intervalos de 10 %. O número à direita indica quantos itens pertencem a cada grupo. O equipamento sem salvaguarda e o equipamento +16 totalmente melhorado ficam de fora. Clique num grupo para mostrar apenas esse equipamento.

**Radar de Frequência de Substats:** Mostra a frequência de cada substat no equipamento filtrado (e opcionalmente limitado por stat principal) como gráfico de radar. Clique numa marca de eixo para a selecionar como pivô de co-ocorrência — o radar restringe-se então ao equipamento que contém todos os substats selecionados ao mesmo tempo (até 4 pivôs). Os pivôs ativos aparecem como chips abaixo do gráfico; × remove um, **Limpar filtros** remove todos.

**Mapa de calor Slot × Stat principal:** Contagem de itens por slot (colunas) × stat principal (linhas). Clique num cabeçalho de coluna ou numa célula para filtrar por esse slot.

**Separador Estatísticas de campeões:** Totais de substats somados nas peças equipadas por campeão. Filtre por localização (**Todos** / **Coleção** / **Cofre**), ative apenas **Totalmente equipado** e inclua ou exclua os glifos. Mostra séries Min/Média/Mediana/Máx.

**Equipamento de campeões:** Cobertura de slots de equipamento por campeão em duas tabelas compactas (**Coleção** / **Cofre**). Cada linha mostra uma grelha 3×3 (preenchido = equipado, contorno = vazio, tracejado = bloqueado até ascender). Clique num slot preenchido para selecionar essa peça — a seleção é partilhada com o Inspetor de Equipamento. Ative **Simular venda** para pintar a vermelho os slots cuja peça seria vendida e contá-los como em falta, ou **Mostrar completos** para também listar campeões totalmente equipados.

**Botões:**
- **Copiar instantâneo:** Renderiza a vista analítica completa como PNG e copia-a para o porta-papéis. Nota: o Equipamento de campeões não é incluído no instantâneo.
- **Aplicar ao Inspetor de Equipamento:** Envia o filtro cruzado ativo para o filtro de lista do Inspetor de Equipamento (apenas visível quando há um filtro ativo).

### Gestão de receitas
- As receitas guardadas aparecem como etiquetas sob o builder. Clique para selecionar; clique direito para duplicar, mover, copiar ou eliminar.
- «Eliminar todas as receitas» remove todas (com confirmação).
- Ligação por hover: passar o cursor sobre uma etiqueta destaca as linhas associadas na prévia e vice-versa.
- Ligação por clique: clicar uma linha da tabela seleciona a receita de origem (linhas da HSF base não alteram a seleção).
- Cópia alternativa: Se o acesso ao porta‑papéis falhar, abre-se um diálogo com o texto já selecionado para copiar manualmente.
- Ativar/desativar receitas: o botão no cabeçalho do builder desativa globalmente todas as receitas sem as eliminar, pausando a pipeline de prévia — útil para verificar rapidamente uma exportação apenas com salvaguardas ou confirmar o que a Venda Final produz sozinha.

### Prévia Sellfile (Regras e Inspetor de Equipamento)
- O cabeçalho da prévia mantém o interruptor «Prévia Sellfile»/«Inspetor de Equipamento», o botão «Ferramentas» e o botão “Carregar Sellfile do RSL Helper” juntos para saber sempre onde alternar de tabela ou abrir o diálogo Equipamento.
- Vista «Prévia Sellfile» (predefinição): mostra todas as linhas que serão exportadas, incluindo quaisquer `.hsf` base opcionais. Os contadores mantêm o resumo Manter vs Vender, a linha de filtros conserva os chips Qualquer/Apenas para Slots/Rank/Raridade/Nível e agora apresenta os dois botões de Receitas em paralelo: «Restringir» decide se as etiquetas fora dos filtros atuais ficam ocultas e a «Seleção» funciona como um interruptor Ligado/Desligado que limita as linhas do Sellfile às etiquetas selecionadas (deixando a mesma seleção pronta para o Inspetor de Equipamento).
- Vista «Inspetor de Equipamento»: muda a tabela para a lista de equipamento importado ou criado sem precisares de reabrir Ferramentas. Os contadores passam a Manter/Vender/Âmbito/Sem regra segundo a regra “a primeira coincidência ganha” e a linha de filtros mantém ambos os botões de Receitas («Restringir» + «Seleção»). O primeiro continua a gerir a visibilidade das etiquetas, enquanto a «Seleção» aplica o triestado (`Desativado` → `Primeira` → `Por correspondência`) para isolar as linhas do Inspetor de Equipamento e continua a limitar as regras do Sellfile à mesma seleção quando regressas a «Prévia Sellfile». Importar um `.db` alterna automaticamente para esta vista, mas podes voltar a «Prévia Sellfile» a qualquer momento.
- O botão “Carregar Sellfile do RSL Helper” comporta-se da mesma forma que o arrastar-e-largar: `.sfc` substitui o estado do builder, `.hsf` adiciona o Sellfile base opcional e `.db` envia itens para o Inspetor de Equipamento sem tocar em receitas ou export. «Limpar» remove o `.hsf` base quando existir.
- O ícone da paleta abre a gestão de cores para personalizar texto e fundo dos substats.
- Na vista «Prévia Sellfile» a tabela continua a mostrar «Idx» e «Receita» (linhas do ficheiro base deixam «Receita» em branco). Na vista «Inspetor de Equipamento», o mesmo espaço lista slot/set, stats e o chip da primeira receita correspondente para veres diretamente o que acontece a cada artefacto.

### Controlos da prévia
- Gerir cores: através do ícone da paleta; «Repor predefinições» restaura as recomendações.
- Filtros: prima `Ctrl+F` (`Cmd+F` no macOS) para abrir o painel e focar de imediato a pesquisa de receitas. Clique direito em qualquer cabeçalho de secção (ou `Ctrl`/`Cmd`+clique no respetivo chevron) para recolher ou expandir todas as secções de uma só vez. `Restringir` oculta chips que não correspondem ao filtro ativo para manter a tabela legível. `Seleção` decide quais as receitas permitidas na tabela: em «Prévia Sellfile» funciona como um simples interruptor Ligado/Desligado, e no Inspetor de Equipamento alterna por `Desativado` → `Primeira` → `Por correspondência` para controlares também como respondem as linhas do Inspetor de Equipamento.
- Menu de colunas (clique direito na cabeça da tabela):
  - Repor colunas: restaura colunas e larguras padrão.
  - Ajustar largura: adapta as colunas à janela.
  - Permitir linhas multilinha: ativa quebras de linha (útil para Substats).
  - Mostrar/Ocultar colunas: caixas individuais por coluna.
- Reordenar: arraste uma cabeça horizontalmente.
- Redimensionar: arraste o bordo direito da cabeça.
- Comportamento de clique: uma linha seleciona a receita correspondente (sem deslocação automática). Clicar uma etiqueta de receita desloca a tabela até à primeira linha associada.

### Inspetor de Equipamento
- Clique em «Ferramentas» no cabeçalho da Prévia Sellfile para abrir o diálogo Equipamento. Crie equipamento de exemplo. Os itens sincronizam imediatamente com a prévia, por isso fechar o diálogo não limpa a grelha do Inspetor de Equipamento.
- Ligue ao RSL Helper para sincronização em tempo real (o botão Ligar no cabeçalho da prévia) ou arraste um ficheiro `.db` para a aplicação ou use o botão “Carregar Sellfile do RSL Helper”.- Cada linha do Inspetor de Equipamento mostra slot, set, nível, stat principal, substats (com glifos e rolagens), a origem (inventário vs entrada) e os chips Manter/Vender + a primeira receita/regra correspondente. Regras desativadas nunca correspondem, portanto `Sem acerto` identifica peças que o Sellfile deixaria passar.
- Os contadores no cabeçalho mostram os totais de Manter/Vender/Âmbito/Sem regra. Os quatro botões de filtro de resultado — **Manter**, **Vender**, **Âmbito** e **Sem regra** — funcionam como interruptores independentes: activa qualquer combinação para reduzir a lista. **Âmbito** esvanece (mas mantém visíveis) os itens que partilham o mesmo set+slot que uma peça que as tuas regras venderiam, para poderes comparar um candidato com a sua concorrência numa só vista sem precisar de duas passagens de filtro. Quando também estão selecionadas uma ou mais **Fontes**, essas fontes funcionam como conjunto de referência — apenas os itens marcados para venda das fontes selecionadas tornam-se itens principais, enquanto os acompanhantes são recolhidos de *todas* as fontes, permitindo ver cada exemplar dessa peça independentemente de onde esteja. **Sem regra** mostra equipamento que nenhuma regra toca — útil para detetar lacunas nas tuas receitas. Combina com o seletor `Primeira`/`Por correspondência` de Receitas para te focares nos casos limite antes de exportar.
- Usa o interruptor da prévia para alternar entre a tabela de Regras e o Inspetor de Equipamento sem reabrir Ferramentas — ideal para comparar as linhas geradas com o equipamento que as ativou.

- **Sobreposição de Posição da Salvaguarda:** o menu da grelha tem um botão **Posição da Salvaguarda** que alterna o que o chip de posição de cada peça mostra (pelo valor de substat atual; **#1** é a melhor; verde = mantida, vermelho = seria vendida). **Desligado** oculta-o; **Balde** mostra a posição dentro do próprio balde da peça — o âmbito de slot / set / facção / stat principal que a regra mantém separadamente (ex.: **#2**); **Salvaguarda** mostra a posição em toda a salvaguarda (ex.: **#7**); **Ambos** mostra balde e depois salvaguarda como **#2 · #7** (2.ª no balde, 7.ª no total). O chip e a dica são ordenados pela posição exibida, o chip reflete a regra correspondente mais bem posicionada da peça, e clicar vai até essa regra. Com regras selecionadas, o chip reflete essas regras; uma peça classificada só por *outra* regra mostra ainda a sua melhor posição, ligeiramente esbatida. Requer Salvaguardas ativadas.

### Comparação de equipamento (Antes / Depois)
- O botão **Diff** no cabeçalho do Inspetor de Equipamento ativa uma comparação que mostra quais peças mudam entre **Manter** e **Vender** quando muda algo — útil ao ajustar receitas ou experimentar as substituições dinâmicas na caixa de diálogo Nota.
- Um pequeno chip ao lado do botão mostra a alteração atual em relação ao seu ponto de referência: quantas peças a mais (ou a menos) estão agora **Vendidas**, **Mantidas** e protegidas por **Salvaguardas**.
- Clique esquerdo em **Diff** abre uma vista **lado a lado de antes/depois** das peças alteradas (esquerda = antes, direita = depois) com deslocamento sincronizado. Clique novamente para fechar.
- Clique direito no botão para opções:
  - **Definir referência** — fixa o estado atual como o «antes» com o qual compara.
  - **Acompanhar referência automaticamente** (ativado por predefinição) — mantém o «antes» na sua última edição de receita/salvaguarda, para que a comparação reflita sempre a sua alteração mais recente.
- Duas coisas que vale a pena saber:
  - Alternar as **substituições dinâmicas** na caixa de diálogo Nota **acumula** — várias substituições mostram o efeito combinado, não apenas a última.
  - Editar uma receita ou salvaguarda no construtor move a referência para essa edição (enquanto «Acompanhar referência automaticamente» estiver ativado). Desative-o (ou use «Definir referência») para comparar tudo contra um ponto fixo.
- Os seus filtros normais do Inspetor de Equipamento continuam a aplicar-se: uma peça aparece se corresponder ao filtro antes ou depois da alteração.

### Exportar
- «Exportar Sellfile do RSL Helper combinado» aparece quando existe ficheiro base; caso contrário verá «Exportar Sellfile do RSL Helper».
- Use «Guardar receitas» e «Carregar receitas» no builder para salvaguardar o trabalho.
- O nome padrão do export é `Sellfile_AAAA MM DD_HHMM.hsf`.

### Contas

O Sellfile Creator pode manter documentos separados (receitas, salvaguardas, nota, equipamento) para várias contas do jogo. O seletor de contas fica na barra superior (e no diálogo da vista simples): clique para mudar de conta ou criar novas, e use o ícone de engrenagem junto a uma conta para abrir o gestor de contas. Aí pode renomear uma conta, escolher a cor de destaque, introduzir o id de conta do RSL Helper a que pertence, ligar ou desligar o envio automático por conta, marcar uma conta como predefinida para dados que chegam sem id, decidir se os dados de equipamento recebidos são guardados neste dispositivo e eliminar uma conta com todos os seus dados. Mantenha Shift ao escolher uma conta no seletor para fundir o documento atual nessa conta.

**Como funciona a transição:**

- Após a atualização, todos os seus dados existentes passam a viver numa conta chamada "Default" — nada muda para si.
- O suporte de contas está a ser introduzido por etapas em conjunto com o RSL Helper, pelo que parte dele ainda não está totalmente ativa.
- Por agora, o RSL Helper ainda não indica ao Sellfile Creator que conta do jogo está a enviar. Esses dados vão para a sua conta ativa — ou para a conta que marcou como "predefinida para dados sem id de conta" no gestor.
- Assim que o RSL Helper passar o id da conta ao abrir o Sellfile Creator, a sua conta "Default" existente será associada automaticamente a esse id — os seus dados simplesmente a acompanham. Uma segunda conta do jogo recebe então a sua própria conta nova no Sellfile Creator.
- Quando o RSL Helper também etiquetar os seus pacotes de dados com o id da conta, tudo é encaminhado automaticamente: dados de outra conta nunca se misturam com a conta em que está a trabalhar e, se essa outra conta tiver o envio automático ligado, o sellfile dela é reconstruído e reenviado em segundo plano.

## Exemplos

Todos os exemplos usam alvos de substats de 6★ por unidade de rolagem: SPD=5, CR%=5, CDMG%=5.

**Cedo vs. Tarde**
- **Cedo**: os limiares refletem as rolagens já obtidas. Com ★ + soma mínima, apresenta apenas divisões mínimas por marco (lista estável). Caso contrário enumera o progresso dos stats selecionados até a meta de +16 ficar viável e depois fixa-se nos teus alvos por stat (a menos que uma soma global exija mais).
- **Tarde**: exige apenas o que precisa existir agora para que a meta de +16 continue possível. Com ★ + soma mínima repete essas divisões nos primeiros marcos e novamente em +16. Com alvos por stat fornece os limites inferiores obrigatórios em cada nível.

#### Cenários do builder num relance

| Cenário | Receita | O que o builder emite |
| --- | --- | --- |
| Cedo (2 substats) | SPD mín = 2, CR% mín = 1, Níveis +0..+16 | `+0:` SPD ≥ 5, CR ≥ 5<br>`+4:` [10,5] e [5,10]<br>`+8:` [15,5], [10,10], [5,15]<br>`+12/+16:` [15,10] |
| Tarde (2 substats) | Mesmo cenário acima | `+0/+4:` [5,5]<br>`+8:` [10,5] ou [5,10]<br>`+12:` [15,5] ou [10,10]<br>`+16:` [15,10] |
| Cedo (3 substats) | SPD mín = 2, CR% mín = 1, CDMG% selecionado, Obrigatórios = 3 | `+0:` [SPD, CR, CDMG] ≥ [5,5,5]<br>`+4:` divisões de uma rolagem (10/5/5)<br>`+8:` todas as permutações de duas rolagens (respeitando limites superiores)<br>`+12/+16:` [15,10,5] |
| Tarde (3 substats) | Mesmos stats do cenário anterior | `+0/+4:` [5,5,5]<br>`+8:` [10,5,5] ou [5,10,5]<br>`+12:` [15,5,5] ou [10,10,5]<br>`+16:` [15,10,5] |
| Bloquear um e exigir dois | Substats SPD/HP/ATK; bloqueia SPD (🔒); Substats obrigatórios = 2 | Só surgem linhas SPD+HP e SPD+ATK; HP+ATK é excluído porque o SPD bloqueado tem de aparecer em todas. |
| Focar rolagens em 3 stats e congelar o slot flex | Substats SPD/CR%/CDMG%/HP%/ATK%/DEF%; Substats obrigatórios = 4; SPD/CR%/CDMG% com Rolagens mín = 1; HP%/ATK%/DEF% com limite superior = 0 | SPD/CR%/CDMG% recebem sempre as rolagens enquanto o quarto stat (qualquer um de HP%/ATK%/DEF%) fica no valor base. Usa limites superiores (clique direito a partir de ★) quando um stat não pode ganhar rolagens. |
| Cedo com curinga | Substats SPD (mín = 2) e ACC (★ curinga); Substats obrigatórios = Auto; Níveis +0..+16 | Os marcos iniciais destacam qualquer item que ainda possa atingir SPD(2) em +16 (linhas onde SPD ou ACC receberam rolagem). Assim que duas rolagens em SPD forem possíveis, surge a linha SPD ≥. |
| Soma de rolagens com curingas | Substats SPD e ACC ambos em ★; Substats obrigatórios = 2; Rolagens mínimas = 1 | **Cedo:** em +4/+8/+12/+16 a grelha mostra as duas divisões mínimas (SPD ≥ 10 & ACC ≥ 9 e SPD ≥ 5 & ACC ≥ 18).<br>**Tarde:** +0/+4/+8/+12 mostram linhas base e +16 repete essas duas divisões. Com metas maiores, Tarde exige a soma necessária mais cedo (p. ex., com mínimo 2, +12 mostra divisões de uma rolagem e +16 as de duas). |

## Notas para contribuidores

- Traduções: Os pacotes de release incluem modelos de localização em `i18n/` (p. ex., `i18n/pt-PT.l10n.json`).
- Editar e testar: Abre a app e arrasta o teu `*.l10n.json` editado para o aplicar de imediato à sessão atual (não é necessária nem possível qualquer instalação).
- Enviar correções: Envia o JSON atualizado por mensagem no Discord. Mantém as chaves inalteradas; as chaves em falta voltam ao inglês.
- Idiomas integrados: Todos os idiomas incluídos são compilados no único HTML, por isso a app funciona totalmente offline. As tuas correções entram na próxima versão.
- `Stream-Helper-DB-to-Creator.bat` inicia o DB watcher e transmite a base padrão do RSL Helper para o Sellfile Creator para facilitar a verificação das receitas ao vivo.

## Agradecimentos

Muito obrigado a **[STBL] Nasgor** pelos contributos inestimáveis,  
a **[SP] Panda** pelos seus Sellfiles,  
a **KruYseN** pelos vídeos de limpeza de equipamento,  
e claro a **Farbstoff** pelo RSL Helper!

## Autor
Criado por [STBL] Nusi㊷  
Localização por AI

© Nusi㊷ - 2026
