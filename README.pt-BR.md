# Sellfile Creator for RSL Helper

O Sellfile Creator facilita a criação de arquivos de venda para o RSL Helper — defina filtros de equipamento por conjunto, slot, stat principal, substats e mais, visualize os resultados ao vivo e exporte arquivos de venda prontos para uso em segundos.

> Ferramenta criada por fãs. Não tem ligação com a Plarium, Raid: Shadow Legends ou RSL Helper. Todas as marcas mencionadas pertencem aos respectivos proprietários.

## Funcionalidades

- **Construtor de receitas** — crie receitas de manter/vender com filtros por slot,
  conjunto, rank, raridade, stat principal, substats (com mínimos de rolagens e
  objetivos), facção e marcos de nível. Construa uma biblioteca reutilizável e exporte como
  arquivo de venda RSL Helper (`.hsf`) com um clique.
- **Prévia Sellfile** — pré-visualize o arquivo de venda RSL Helper
  gerado na aba Pré-visualização antes de exportar.
- **Metaconjuntos** — agrupe conjuntos de equipamentos (ex. Velocidade + Percepção) em
  coleções nomeadas e reutilize-os em receitas e salvaguardas.
- **Inspetor de Equipamento** — conecte-se ao RSL Helper para sincronização ao vivo ou carregue um arquivo `.db` para pré-visualizar quais itens correspondem a cada receita e quantos seriam mantidos ou vendidos.
- **Comparação de equipamento** — ative uma visão de antes/depois para ver exatamente quais peças mudam entre *manter* e *vender* enquanto você ajusta receitas ou testa as substituições dinâmicas. Um chip mostra os totais atuais; uma lista lado a lado mostra cada peça que mudou.
- **Simulador de masmorras** — veja os percentuais de chance de manter para o Cavaleiro do
  Fogo, o Dragão e o Golem de Gelo nos níveis de dificuldade e aprimoramento para confirmar
  o efeito do seu arquivo de venda ao farmar ou melhorar equipamentos.
- **Salvaguardas** — defina combinações de slot/conjunto/stat que nunca quer perder; o scanner
  injeta automaticamente regras de manter no arquivo de venda quando sua configuração
  reduziria uma combinação protegida abaixo de sua cota.
- **Análise de Equipamentos** — painel analítico com cards KPI, gráficos de filtro cruzado
  (slot, rank, raridade, fonte, nível), um mapa de árvore de conjuntos, barras de
  stats principais e um radar de substats. Clique em qualquer gráfico para
  filtrar todos os outros; envie o filtro ativo diretamente para o Inspetor de Equipamento.
- **Venda final** — um único toggle adiciona regras de venda coringa para equipamentos não
  correspondidos em intervalos de nível configuráveis, para que nada escape.
- **Temas** — alterne entre o modo escuro e o claro, personalize cores e raio de borda com
  o editor de temas integrado, ou ative uma paleta para daltônicos.

## Como utilizar

### Arquivo de receitas
- SFC (`.sfc`): arquivo de projeto do aplicativo. Pense nele como um “save” que pode carregar ou compartilhar. O RSL Helper não lê SFC diretamente.
- HSF (`.hsf`): o Sellfile consumido pelo RSL Helper. Exporte-o aqui e carregue-o depois no RSL Helper.
- O nome padrão ao salvar é `SellfileCreatorRecipes_AAAA MM DD_HHMM.sfc`.

### Construtor de receitas
- Preencha o Construtor de receitas e atribua um nome claro à receita.
- Clique em «Adicionar como nova receita» para salvar. Depois selecione a receita na lista abaixo do construtor para editá-la e confirme com «Atualizar receita selecionada».
- Carregar/Salvar: use «Carregar receitas» e «Salvar receitas» para reutilizar as regras. Essas ações mantêm tudo o que é necessário para reconstruir a prévia.
  - Clique no chevron (▾) ao lado de **Carregar arquivo SFC** para abrir o respectivo menu: **Carregar do arquivo…** abre o seletor de arquivos do sistema como de costume; **Carregar preset: Iniciante** ou **Carregar preset: Midgame ao Endgame** carrega um dos presets integrados após uma confirmação (sua configuração atual será substituída).
- Menus de Reset/Insert/Apply: clique com o botão direito em «Reset», «Insert as receita» ou «Apply as receita» para abrir o menu compartilhado. Salve o estado atual do builder como modelo padrão, retorne aos padrões de fábrica, ative «Auto reset after Insert» (limpa o builder imediatamente após inserir uma receita) ou ative «Auto apply to selected receita» (envia as edições para a receita destacada automaticamente após ~400 ms de inatividade). Auto reset e Auto apply não podem ficar ativos ao mesmo tempo — ligar um desliga o outro — e ambas as preferências continuam válidas entre sessões.
- Nota: clique em «Adicionar nota…» (ou «Editar nota…») para anexar um texto ao arquivo de receitas. Ao carregar um arquivo que contenha nota, ela é exibida automaticamente. Use `<!-- recipes:1,0 -->` para inserir chips de receitas específicas (0 pega a próxima). Use `<!-- recipes-re:"speed" -->` para mostrar todas as receitas cujo nome corresponde ao padrão (ignorando maiúsculas/minúsculas). Adicione `<!-- dungeon-simulator -->` para exibir uma tabela em tempo real de probabilidade de retenção para o Cavaleiro do Fogo, o Dragão e o Golem de Gelo em três níveis de dificuldade (N20/N25/H10) e dois modos de boost, com as taxas de retenção em +0/+4/+8/+12/+16. Adicione `<!-- recipe-overrides [columns=N] -->` para incorporar cartões de perguntas interativas (grupos de rádio/caixa de seleção) que substituem os modos de exportação e configurações de receitas na sessão — as receitas armazenadas nunca são modificadas. Adicione `<!-- safeguard-overrides [columns=N] -->` para incorporar cartões de controles deslizantes e opções que substituem propriedades das salvaguardas (contagem, ativação, substats, chance de melhoria e mais) na sessão — as salvaguardas armazenadas nunca são modificadas. Quando algum desses marcadores estiver presente, o rodapé da nota exibe um botão **Desativar / Ativar substituições dinâmicas** e um botão **Redefinir opções**. Use **Salvar seleção atual…** (no menu «Substituições dinâmicas») para salvar as respostas atuais com um nome — os conjuntos de substituições salvos aparecem no mesmo menu e podem ser carregados com um clique. Apenas as seleções presentes na nota atual são salvas; ao carregar um conjunto, perguntas que não existem mais são ignoradas.
- Restauração do Autosave: ao iniciar, o diálogo lista cada seção salva com a sua própria caixa de seleção. Restaure só o que precisar — receitas (incluindo o chip selecionado), meta-sets, Alvos de substats, restante da Venda final, nota fixada, painel de filtros (estado aberto/fechado, chips, seções recolhidas) e as importações do Inspetor de Equipamento. Deixe a caixa desmarcada para preservar o trabalho atual. O Autosave também lembra quais interruptores da Venda final (Artefatos, Acessórios e faixas de nível) estavam ativos, então reabrir Ferramentas reflete exatamente o que exportou da última vez.

### Estrutura do construtor (de cima para baixo)
- Ação e Ativo: Defina o que acontece quando um item coincide.
  - `Manter` marca o item como Manter; o RSL Helper deixa-o intacto.
  - `Vender` marca o item como Vender; o RSL Helper coloca-o na fila de venda automática.
  - O interruptor «Ativado no Sellfile» decide se as linhas exportadas permanecem ativas. Receitas desativadas ficam riscadas na prévia e não têm efeito no RSL Helper; ative «Omitir regras desativadas ao exportar» no menu de exportação se quiser deixá-las de fora.
- Rank: Limite a regra a determinados ranks de estrelas caso queira tratar as peças de 6★ de forma diferente das de 5★. `Qualquer` mantém todos os ranks elegíveis.
- Níveis: Escolha Nível mínimo e máximo entre os marcos +0, +4, +8, +12, +16. As linhas só são geradas dentro dessa janela.
- Raridade: `Auto` (recomendado) escolhe a raridade mais baixa que continua a satisfazer os requisitos nos níveis selecionados.
  - Sem mínimos por stat ou soma global? Auto mantém a regra abrangente, compatível com todas as raridades.
  - A pedir 1/2/3/4 substats iniciais? Auto garante que a raridade pode começar com essa quantidade (1→≥ Incomum, 2→≥ Rara, 3→≥ Épica, 4→≥ Lendária).
  - A pedir um total de rolagens? Auto escolhe a raridade mais baixa que atinge essa soma em +16 (5 rolagens exigem Mítica).
  - Chip `Auto ≥` (abaixo de Limiar por marcos): eleva o piso e, com o modo Tarde, acrescenta ramos ≥ extra em +4/+8/+12.
    - Sequência: Incomum → Raro → Épico. «Auto ≥ Raro» exclui Incomum.
    - Só fica ativo quando Raridade = Auto e Limiar por marcos = Tarde. Caso contrário aparece uma barra diagonal.
    - Exemplo: estandarte com SPD e ATK%, onde ATK% precisa de 2 rolagens. Raridade = Auto, Limiar = Tarde, Auto ≥ Épico. Resultado: linhas Épicas em todos os marcos e ≥ Lendária em +8/+12 para manter peças raras elegíveis.
- Antes de +16 o construtor usa o número de substats que a raridade suporta nesse momento. Em +16 aplica o objetivo completo.
- Facção: Restrinja regras de acessórios a uma facção específica ao montar uma equipe. Anéis, Amuletos e Estandartes respeitam o filtro; os artefatos ignoram a facção, então `Qualquer` é a escolha segura.
- Slots: Foque a regra em peças específicas (Arma, Botas, etc.) para impedir que itens fora do slot coincidam. Vazio = todos os slots.
- Sets e Meta-sets: Filtre para conjuntos específicos ou meta-sets nomeados quando quiser apenas essas combinações. Vazio = todos os sets.
- Stats principais: Defina quais os stats principais aceitos.
  - Pode selecionar vários; sem seleção = qualquer stat principal.
  - Ao escolher vários stats principais, o export gera uma linha por stat principal para manter tudo explícito.
- Substats: Indique quais contam.
  - Clique para ativar ou desativar um substat. Os bloqueados sempre aparecem nas linhas geradas.
  - Use o cadeado (🔒) ao lado do rótulo para tornar o stat obrigatório; o clique direito abre as ações rápidas de bloqueio e limites de rolagem.
  - `Qualquer` redefine a seleção e significa «sem restrições». Ao escolher substats específicos, `Qualquer` fica desativado.
  - Cada linha usa `max(Obrigatórios, bloqueados)` até um máximo de quatro substats; bloquear reserva sempre um espaço.
- Interruptor Flex: Se houver mais opções do que o total obrigatório, o Flex roda essas opções por todas as permutações válidas para gerar cada mistura. Os bloqueados mantêm-se e o interruptor desliga-se sozinho quando já não há nada para rodar.
- Indicador de rolagens: Cada substat selecionado mostra um círculo para as melhorias.
  - Clique esquerdo aumenta a expectativa; direito diminui.
- A partir de ★: esquerda passa para mínimo verde (0→1→…→5), direita para limite superior vermelho (0→1→…→4).
- Com um limite superior vermelho, esquerda reduz o teto (1→0→★) e direita aumenta (0→1→…→4→★). Mínimo e limite superior são exclusivos.
- Alvos de rolagem (Base/+1…+5): Clique com o botão direito em um substat selecionado para abrir a grade de alvos. Base guarda o valor em +0 e cada campo +N representa o valor após aquela quantidade de rolagens extras. Deixe um campo em branco para reutilizar seus Alvos de substats ou escolha «Usar alvos globais de substats» para limpar. As fichas da prévia se atualizam na hora para você conferir os números antes de exportar.
- Substats obrigatórios: Defina quantos substats escolhidos o item precisa de ter.
  - `Auto` mantém a contagem alinhada com a seleção (até quatro).
  - Substats bloqueados (🔒) contam sempre e surgem avisos quando a combinação é impossível.
- Rolagens mínimas (global): Defina o total de rolagens compartilhado pelos substats selecionados ou bloqueados. `0` ignora a verificação global. Cedo mostra apenas misturas que ainda conseguem chegar ao objetivo em +16.
- Rolagens mínimas bloqueadas (🔒) aparece quando pelo menos um substat está bloqueado. Clique em um número da linha do cadeado para reservar essa quantidade de rolagens só para os stats bloqueados; o resto do builder continua seguindo o mínimo global. Se o cadeado igualar ou ultrapassar o número destacado no badge global, esse badge é limpo e o cadeado vira o único piso agregado. Ao desbloquear o substat (ou tocar em Auto) ambos os indicadores são apagados; ao escolher um valor global menor, o badge global reacende junto do cadeado para deixar claro qual piso se aplica a cada grupo de stats.
- Exemplo: bloqueie SPD e CR%, defina Rolagens mínimas = 3 e depois coloque a linha 🔒 em 2. O builder agora pede 3 rolagens no total entre todos os substats selecionados, pelo menos 2 delas nos picks bloqueados de SPD/CR%. Com o cadeado em 3, o badge global limpa automaticamente porque ambos os pisos seriam idênticos.
- Limiar por marcos: Controla como os mínimos por stat se aplicam antes de +16 quando exige rolagens mínimas.
  - `Cedo` acompanha as rolagens já obtidas em cada marco.
  - `Tarde` pede apenas o que tem de existir agora para que a meta de +16 se mantenha possível.
  - Só faz diferença se algum substat tiver Min > 0 ou se o mínimo global for > 0.

### Níveis e rolagens: guia rápido
- Limiares cedo: Quando as exigências podem ser cumpridas, as linhas caem nos seus Alvos de substats e estabilizam. Antes disso, Cedo mostra apenas combinações viáveis.
- Soma de rolagens (Σ): As rolagens mínimas referem-se à soma total sobre os substats selecionados no nível alvo.
- Curingas com soma mínima: Com apenas substats ★ e uma soma mínima > 0, Cedo apresenta apenas as divisões mínimas por marco. Tarde repete essas divisões nos marcos iniciais e em +16.
- Mítica (5 rolagens): A raridade Mítica pode atingir cinco rolagens num substat em +16 (o resto fica pelas quatro). Se Mítica estiver disponível, o gerador conta a rolagem extra logo em +0.

### Alvos de substats
- O botão «Alvos de substats…» no canto superior direito do construtor abre a aba **Alvos de substats** no diálogo Ferramentas.
- Os alvos são globais e afetam todas as receitas.
- Esses alvos definem os limiares usados por intervalo de nível (0–3, 4–7, 8–11, 12–15, 16) e servem como fallback na grade de Alvos de rolagem.
- Use «Restaurar padrões» para voltar aos alvos recomendados.

### Meta-sets
- Clique em «Gerenciar meta-sets…» para abrir o diálogo.
- Crie ou renomeie meta-sets e escolha os sets que contêm. A interface usa a mesma pesquisa do seletor de sets.
- Existem meta-sets iniciais prontos a usar; pode editá-los ou removê-los.
- «Repor predefinições» oferece opções seguras quando um meta-set está em uso (remover, substituir por sets explícitos ou por outro meta-set).

### Venda final
- Use o interruptor `Venda final` no cabeçalho da prévia para ativar regras de venda para os itens restantes. A etiqueta não muda; o preenchimento âmbar indica que está ativa e o contorno neutro indica que está desligada.
- Clique em «Ferramentas» ao lado do interruptor para abrir a aba `Venda final` e decidir se ela abrange Artefatos, Acessórios e quais intervalos de nível (0–3, 4–7, 8–11, 12–15, 16). A predefinição cobre 0–15, então peças +16 só entram se você ativar `+16`.
- Sem `Venda final`, o RSL Helper mantém tudo o que não coincide com uma regra. Só vende quando uma regra explícita diz Vender.
- Com `Venda final` ativa, as regras geradas incluem todos os sets conhecidos. Na prévia surge «Todos os sets conhecidos» para reduzir ruído; o arquivo exportado lista os sets um a um.

### Salvaguardas
- Mude o construtor para o modo **Salvaguardas** usando o botão de alternância acima do painel do construtor para marcar as combinações que não quer vender nunca. Ative `Ativar Salvaguardas` para deixar o scanner adicionar linhas de manter (editar uma salvaguarda também ativa automaticamente).
- As regras de Salvaguardas não “consomem” itens—cada regra avalia o mesmo conjunto de candidatos. Se uma peça corresponder a várias regras, conta para todas.
- Cada salvaguarda permite escolher slot, sets ou meta-sets, ranks, raridades, stats principais e, no caso dos acessórios, facções. Deixar um seletor vazio significa «qualquer».
- `Modo` decide como a regra é emitida: `Desativada` desliga, `Proteger existentes` injeta linhas de manter para itens que seriam vendidos até cumprir a quota, e `Antecipar lacunas` também emite regras fictícias para combinações que ainda faltam para proteger novos drops até a próxima atualização da BD.
- Substats são opcionais: escolha um ou mais para contar somente itens que tenham esses substats. Os chips de correspondência definem quantos dos substats selecionados uma peça precisa ter — `≥1`–`≥4` (os chips acima do número que você escolheu ficam esmaecidos) — ou `Por Substat`, que aplica a quota a cada substat selecionado separadamente. Deixe os substats vazios para permitir qualquer substat.
- Os substats selecionados sempre são ranqueados pela fórmula normalizada (glifos ignorados); os controles de peso aparecem em todos os modos de quantidade mínima (`≥1`–`≥4`), enquanto `Por Substat` mantém a ponderação igual (empates no corte continuam protegidos).
- `Ponderar por rank` (a chip ao lado de `Por stat principal`) integra o rank à própria pontuação em vez de deixá-lo apenas como critério exato de desempate. O bônus é escalado pelo **stat principal**, e o tamanho exato depende do slot e do stat principal — um stat principal 5★ pontua cerca de 81–89% do 6★ do mesmo slot, um 4★ menos ainda. A diferença entre ranks adjacentes é pequena: suficiente para um 6★ vencer um *quase*-empate contra um 5★ de mesmo stat principal com substats só um pouco melhores, mas não suficiente para superar uma vantagem real de substats. Usa o stat principal +16 do rank, então subir de nível nunca muda a pontuação, e as pontuações de substats não são afetadas. Requer ao menos um substat selecionado; ligado por padrão em regras novas.
- `≥ Quantidade necessária` é a promessa que você quer manter. Os chips de escopo logo abaixo de cada seletor (todos exceto `Rank` e `Raridade`) decidem como essa quota se divide: `Por slot`, `Por conjunto`, `Por facção` e `Por stat principal` podem ser combinados livremente. Desligar todos volta automaticamente para `Por salvaguarda`.
- O tooltip de `Quantidade necessária` mostra a divisão ativa de escopo (`X por slot × por conjunto × ...`) e uma linha simples de faltantes (`({missing} faltando)`).
- O scanner só adiciona linhas de manter para itens correspondentes que seriam vendidos, e só quando a quota não é atendida. Em `Antecipar lacunas`, regras fictícias cobrem as combinações que faltam.
- **Opções ignorar** (chips ao lado do interruptor de ativação da regra) afinam o que cada regra conta:
  - `Ignorar salvaguardas anteriores` – quando a salvaguarda classifica candidatos por substats, descarta do seu pool as peças que salvaguardas anteriores já mantiveram e escolhe em vez delas as próximas melhores por pontuação. Útil quando você empilha uma segunda salvaguarda de SPD/CR depois de uma genérica e quer que ela vá mais fundo no ranking em vez de proteger redundantemente as mesmas peças. Salvaguardas sem substats não são afetadas. Padrão: desligado.
  - `Ignorar equipados (Coleção)` – exclui peças atualmente equipadas em campeões da coleção do contador de correspondências desta regra, para que não satisfaçam a sua quota. Padrão: desligado.
  - `Ignorar equipados (Cofre)` – mesma ideia mas para campeões do cofre. Padrão: desligado.
- **`Chance de Melhoria ≥ N%`** (explorador de talentos opcional): amplia a rede de segurança além do top-N padrão. O scanner sempre mantém primeiro as peças do top-N pelo seu valor de substat **atual** — essas nunca estão em risco. Além disso, protege qualquer peça *fora* desse top-N cuja chance de melhoria atinja o limite. A ideia é: «segurar os drops brutos que têm boas chances de ser competitivos após serem melhorados».

  **O que é a chance de melhoria?** O app simula todos os caminhos possíveis que uma peça pode seguir durante as melhorias até +16 — algumas rolagens acertam o substat que você quer, outras não — e conta quantas vezes a peça acaba no seu top N em todos esses futuros. Uma peça com 68 % de chance de melhoria chega ao top N em aproximadamente dois de cada três caminhos simulados.

  **A chance de melhoria é uma *previsão*, não a regra que mantém seu equipamento — são dois sistemas separados.** Isso costuma confundir, então vale deixar claro:

  - O safeguard **sempre mantém as peças do top-N pelo valor de substat *agora***. É essa classificação por valor atual que de fato protege uma peça.
  - A chance de melhoria responde a uma pergunta *diferente*: *«quando tudo estiver melhorado para +16, esta peça ainda estará entre as minhas melhores?»*. Ela pontua **tanto a peça quanto seus concorrentes pelos valores projetados em +16** e conta quantas vezes a peça acaba no top N.

  Como fazem perguntas diferentes, as duas podem divergir — e isso é esperado, não é um bug:

  - Uma peça pode mostrar **0 % de chance de melhoria e ainda assim estar protegida.** Ela é uma das suas melhores *hoje* (então o top-N por valor atual a mantém), mas a simulação espera que rivais que também estão sendo melhoradas a ultrapassem até +16 (por isso a chance *futura* de top-N é ~0 %). Uma única boa rolagem que coloque uma peça no seu top-N atual a protege imediatamente — a chance de melhoria pode ficar em 0 % o tempo todo, porque esse número nunca foi o que a protegia.
  - Uma peça pode mostrar uma **chance de melhoria alta e ainda assim não estar protegida (ainda).** É um drop promissor que não está no seu top-N atual: só é mantido se você ativar o limite abaixo.

  **Regra principal: o limite só pode adicionar à proteção, nunca remover.** Seu top-N atual é sempre mantido, independentemente da pontuação de chance de melhoria. Uma peça completamente melhorada (+16) conta diretamente seu valor atual bloqueado — ela não pode sair da proteção por ter «esgotado o potencial de melhoria».

  **Exemplo — estandartes SPD, Quantidade necessária = 2, Por facção (rank 6 lendário):**

  | Estandarte | SPD | Nível | Chance de melhoria | Padrão | Limite ≥ 50 % | Limite ≥ 25 % |
  | --- | --- | --- | --- | --- | --- | --- |
  | A | 12 | +16 | 100 % | ✔ top-2 | ✔ top-2 | ✔ top-2 |
  | B | 6 | +16 | 0 % | ✔ top-2 | ✔ top-2 | ✔ top-2 |
  | C | 5 | +0 | 26 % | ✗ vendido | ✗ vendido | ✔ limite adiciona |

  Os estandartes de rank 6 rolam SPD em incrementos de **5 ou 6** por evento, então os únicos valores realistas em estado fresco são **5** (mínimo) ou **6** (máximo). O SPD=12 do estandarte A significa que recebeu exatamente uma rolagem SPD de bônus durante as melhorias (6 inicial + 1 rolagem de 6). O estandarte B foi completamente melhorado sem rolagens SPD de bônus — sua pontuação está bloqueada em 6.

  O estandarte B tem 0 % de chance de melhoria: seu SPD=6 fixo perderá previsivelmente para qualquer concorrente não melhorado cujas rolagens futuras possam superá-lo. Mesmo assim, permanece protegido porque está no top-2 padrão pelo valor **atual**. A chance de melhoria nunca pode remover itens do top-N — apenas a lógica de expansão por limite a usa.

  O estandarte C (SPD=5, fresco) fica logo fora do top-2 pelo valor atual. Sua chance de melhoria de 26 % significa que acabaria no top-2 em aproximadamente 1 de cada 4 caminhos simulados. Com limite ≥ **25 %** fica protegido; com limite ≥ 50 % continua vendido.

  Se o estandarte C tivesse começado com **SPD=6**, sua chance de melhoria sobe para **68 %** — um candidato muito mais forte. Limite ≥ **65 %** o protegeria.

  **Os estandartes épicos de rank 6** recebem apenas **3 eventos de rolagem SPD** (contra 4 para os lendários, porque a melhoria +4 adiciona um novo substat em vez de rolar um existente). As chances resultantes são quase idênticas: SPD=6 fresco → **70 %**, SPD=5 fresco → **26 %**.

  **Limites sugeridos (equipamento de rank 6):**
  - **65 %** — protege drops frescos com rolagem máxima (SPD=6, ~68–70 % de chance). Bom padrão se você quiser que drops promissores sobrevivam enquanto são melhorados.
  - **25 %** — também protege drops com rolagem mínima (SPD=5, ~26 % de chance). Rede mais ampla; use quando espaço no inventário não for um problema.
  - Evite **100 %**: só coincide com peças completamente melhoradas já mantidas pelo top-N padrão, então não adiciona nada além do modo padrão.

#### Escopos de quota em resumo
Empilhar chips de escopo decide quem recebe uma quota própria. Deixe «Por salvaguarda» ligado para compartilhar um único pool e vá ativando `Por slot`, `Por conjunto`, `Por facção` e `Por stat principal` para impor misturas Slot × Set × Facção × Stat principal de forma independente.

| Botão de escopo | Comportamento da cota | Quando brilha |
| --- | --- | --- |
| `Por salvaguarda` | Um pool único para toda a salvaguarda. | Manter cinco botas SPD sem importar o set. |
| `Por slot` | Duplica a cota por slot. | Trava dois anéis, dois amuletos e dois estandartes separadamente. |
| `Por conjunto` | Duplica a cota por set/metaset. | Acompanha Stoneskin e Protection sem misturar os drops. |
| `Por facção` | Duplica a cota por facção. | Garante três anéis Merciless para cada facção. |
| `Por stat principal` | Duplica a cota por stat principal. | Mantém ACC e RES em banners separados. |

#### Exemplos do mundo real
| Cenário | Filtros | Quantidade necessária | Botões de escopo | O que o scanner garante |
| --- | --- | --- | --- | --- |
| Acabando as botas SPD | Slot = Botas, Stat principal = SPD, Sets vazios | `5` | `Por salvaguarda` | Pelo menos cinco botas SPD sobrevivem, independentemente do set. |
| Misturar luvas Savage e Lethal | Slot = Luvas, Sets = Savage + Lethal, Stat principal = CDMG% | `3` | `Por salvaguarda` | Três luvas de dano ficam seguras mesmo quando a divisão entre sets muda. |
| Anéis Merciless por facção | Slot = Anel, Set = Merciless, Facção em branco | `3` | `Por facção` | Cada facção mantém três anéis Merciless próprios. |
| Anéis HP% por facção | Slot = Anel, Stat principal = HP%, Sets vazios | `2` | `Por facção` | Duas cópias HP% sobrevivem para cada facção. |
| Acessórios básicos por facção | Três regras (Anel/Amuleto/Estandarte), Sets/Stat principal vazios | `5` | `Por facção` | Cinco anéis, amuletos e estandartes por facção permanecem no inventário. |
| Acessórios Stoneskin + Protection | Slot = Anel/Amuleto/Estandarte, Sets = Stoneskin + Protection, Stat principal vazio | `2` | `Por conjunto` + `Por facção` + `Por slot` | Cada facção guarda dois Stoneskin e dois Protection para cada slot de acessório. |
| Acessórios com SPD mais alto | Slot = Anel/Amuleto/Estandarte, Substats = SPD | `5` | `Por salvaguarda` | Mantém as cinco melhores rolagens de SPD entre os acessórios (empates incluídos). |
| Estandartes de ACC com SPD | Slot = Estandarte, Stat principal = ACC, Substats = SPD + ACC, Pesos: SPD maior | `3` | `Por facção` | Cada facção guarda os melhores estandartes de ACC onde SPD pesa mais. |

Dica: importe a sua `.db` ou cole itens no diálogo Equipamento antes de ativar o modo Salvaguardas para que o scanner veja equipamentos reais. Clique numa salvaguarda para realçar o equipamento correspondente; mude `Filtro` para `Seleção` para ver apenas essas correspondências.

### Drops de masmorra (Simulador)
Abra «Ferramentas» e vá para **Drops de masmorra**. Ele simula o farm em masmorras com suas regras atuais do Sellfile para ver quanto equipamento você manteria por conjunto e nível de melhoria.

- Escolha uma masmorra e um estágio.
- Modo de simulação:
  - `Subida de nível`: as rolagens param assim que o item seria vendido, então reflete o up real.
  - `Instantâneo`: as rolagens sempre vão até +16, mesmo se o item teria sido vendido antes.
- A tabela mostra drops mantidos divididos por todos os drops daquele estágio em +0 / +4 / +8 / +12 / +16.
- Clique em uma célula para o detalhamento de slot + stat principal, depois abra **Chances de substats específicos** para ver chances exatas e estimativas de execuções.

Notas:
- Usa suas regras atuais de Manter/Vender, incluindo Venda final e Salvaguardas.
- Roda cerca de 100.000 drops por estágio e atualiza enquanto roda.
- Taxas de drop e rolagens são simuladas; trate os números como estimativas.

### Análise de Equipamentos
Abra «Ferramentas» e vá para a aba **Análise de Equipamentos** para uma visão analítica do seu equipamento importado.

**Cartões KPI (linha superior):** Oito cartões de porcentagem — **Taxa 6★**, **Lendária+**, **Maxed (+16)**, **Equipada**, **Bloqueada no cofre**, **Chaos'd**, **Glyphed**, **Ascendida** — cada um com um tooltip.

**Donuts de filtro cruzado:** Seis gráficos — **Slots**, **Rank**, **Raridade**, **Resultado**, **Fonte**, **Nível** — atualizam-se mutuamente ao clicar.
- Clique em um segmento para adicioná-lo como filtro dessa dimensão; todos os outros gráficos se restringem imediatamente ao equipamento correspondente. Cada gráfico exclui sua própria dimensão para sempre mostrar seu intervalo completo.
- Duplo clique em um segmento do donut **Slots** para selecionar um grupo inteiro de uma vez: qualquer peça de artefato (Arma, Elmo, Escudo, Luvas, Couraça, Botas) seleciona os seis slots de artefato; qualquer acessório (Anel, Amuleto, Estandarte) seleciona os três.
- Os donuts **Slots** e **Fonte** exibem ícones de categoria. O donut **Nível** rotula cada arco com o texto do nível.


**Treemap de Sets:** Exibido abaixo dos donuts. Cada bloco representa um set de equipamento; a área do bloco é proporcional ao número de itens. O fundo do bloco é dividido da esquerda para a direita em faixas coloridas por resultado (Vender / Protegido / Guardar / Sem correspondência). Clique em um bloco para adicionar aquele set como filtro cruzado.

**Chips de filtro:** As seleções ativas para cada dimensão aparecem como chips abaixo dos donuts; clique no ícone de excluir em um chip para remover apenas aquele filtro. As seleções de stat principal também aparecem como chips. O botão **Limpar filtros** redefine todas as dimensões de uma vez.

**Barra de Stats principais:** Mostra a frequência de cada stat principal no equipamento filtrado. Clique em uma barra para detalhar — o gráfico de frequência de substats se atualiza para mostrar apenas substats do equipamento com aquele stat principal selecionado. Clique novamente para desmarcar.

**Chance de melhoria:** Quão provável é que seu equipamento melhore, agrupado em faixas de 10%. O número à direita indica quantos itens caem em cada faixa. Equipamentos sem salvaguarda e equipamentos maximizados em +16 ficam de fora. Clique em uma faixa para mostrar apenas aquele equipamento.

**Radar de Frequência de Substats:** Mostra a frequência de cada substat no equipamento filtrado (e opcionalmente limitado por stat principal) como gráfico de radar. Clique em uma marca de eixo para selecioná-la como pivô de co-ocorrência — o radar se restringe então ao equipamento que contém todos os substats selecionados ao mesmo tempo (até 4 pivôs). Os pivôs ativos aparecem como chips abaixo do gráfico; × remove um, **Limpar filtros** remove todos.

**Mapa de calor Slot × Stat principal:** Contagem de itens por slot (colunas) × stat principal (linhas). Clique em um cabeçalho de coluna ou em uma célula para filtrar por aquele slot.

**Aba Estatísticas de campeões:** Totais de substats somados nas peças equipadas por campeão. Filtre por localização (**Todos** / **Coleção** / **Cofre**), ative apenas **Totalmente equipado** e inclua ou exclua os glifos. Exibe séries Min/Média/Mediana/Máx.

**Equipamento de campeões:** Cobertura de slots de equipamento por campeão em duas tabelas compactas (**Coleção** / **Cofre**). Cada linha mostra uma grade 3×3 (preenchido = equipado, contorno = vazio, tracejado = bloqueado até ascender). Clique em um slot preenchido para selecionar essa peça — a seleção é compartilhada com o Inspetor de Equipamento. Ative **Simular venda** para pintar de vermelho os slots cuja peça seria vendida e contá-los como ausentes, ou **Mostrar completos** para também listar campeões totalmente equipados.

**Botões:**
- **Copiar instantâneo:** Renderiza a vista analítica completa como PNG e a copia para a área de transferência. Nota: o Equipamento de campeões não é incluído no instantâneo.
- **Aplicar ao Inspetor de Equipamento:** Envia o filtro cruzado ativo para o filtro de lista do Inspetor de Equipamento (visível apenas quando há um filtro ativo).

### Gestão de receitas
- As receitas salvas aparecem como etiquetas sob o construtor. Clique para selecionar; clique direito para duplicar, mover, copiar ou eliminar.
- «Excluir todas as receitas» remove todas (com confirmação).
- Ligação por hover: passar o cursor sobre uma etiqueta destaca as linhas associadas na prévia e vice-versa.
- Ligação por clique: clicar uma linha da tabela seleciona a receita de origem (linhas da HSF base não alteram a seleção).
- Cópia alternativa: Se o acesso ao porta‑papéis falhar, um diálogo é aberto com o texto já selecionado para copiar manualmente.
- Ativar/desativar receitas: o botão no cabeçalho do builder desativa globalmente todas as receitas sem excluí-las, pausando a pipeline de prévia — útil para verificar rapidamente uma exportação apenas com salvaguardas ou confirmar o que a Venda Final produz sozinha.

### Prévia Sellfile (Rules e Inspetor de Equipamento)
- O cabeçalho da prévia mantém o interruptor «Rules»/«Inspetor de Equipamento», o botão «Ferramentas» e o botão “Load RSL Helper Sellfile” juntos para saber sempre onde alternar de tabela ou abrir o diálogo Equipamento.
- Vista «Rules» (padrão): mostra todas as linhas que serão exportadas, incluindo quaisquer `.hsf` base opcionais. Os contadores permanecem em Manter vs Vender, a faixa de filtros mantém os chips Qualquer/Apenas (`Any/Only`) para Slot/Rank/Raridade/Nível e agora exibe os dois botões de Receitas lado a lado: «Restringir» decide se as etiquetas fora dos filtros atuais ficam escondidas e a «Seleção» funciona como um interruptor Ligado/Desligado que limita as linhas do Sellfile às etiquetas selecionadas (deixando o mesmo filtro pronto para o Inspetor de Equipamento).
- Vista «Inspetor de Equipamento»: muda a tabela para a lista de itens importados sem precisar reabrir Ferramentas. Os contadores passam a Manter/Vender/Escopo/Sem regra seguindo a regra de que “a primeira receita que dá match vence”, e a faixa de filtros mantém os dois botões «Receitas» («Restringir» + «Seleção»). O primeiro continua controlando a visibilidade das etiquetas, enquanto a «Seleção» aplica o triestado (`Off` → `Primeira` → `Por correspondência`) para isolar as linhas do Inspetor de Equipamento e continua limitando as regras do Sellfile à mesma seleção quando você retornar a «Rules». Importar um `.db` alterna automaticamente para esta vista, mas pode voltar a «Rules» quando quiser.
- O botão “Load RSL Helper Sellfile” se comporta exatamente como o arrastar e soltar: `.sfc` substitui o estado do builder, `.hsf` adiciona o Sellfile base opcional e `.db` envia itens para o Inspetor de Equipamento sem tocar em receitas nem na exportação. «Limpar» remove o `.hsf` base quando existir.
- O ícone da paleta abre Gerenciar Cores para personalizar texto e fundo dos substats.
- Na vista «Rules» a tabela continua a mostrar «Idx» e «Receita» (linhas do arquivo base deixam «Receita» em branco). Na vista «Inspetor de Equipamento», o mesmo espaço lista slot/set, stats do item e o badge da primeira receita correspondente para ver diretamente o que acontece a cada artefato.

### Controles da prévia
- Gerenciar cores: através do ícone da paleta; «Repor predefinições» restaura as recomendações.
- Filtros: pressione `Ctrl+F` (`Cmd+F` no macOS) para abrir o painel e focar a pesquisa de receitas na hora. Clique com o botão direito em qualquer cabeçalho de seção (ou use `Ctrl`/`Cmd`+clique no chevron) para recolher ou expandir todas as seções de uma só vez. «Restringir» esconde chips que não combinam com o filtro ativo para manter a prévia legível. «Seleção» decide quais receitas podem aparecer na tabela: em «Rules» ele funciona como um interruptor simples Ligado/Desligado, e na vista do Inspetor de Equipamento percorre `Off` → `Primeira` → `Por correspondência` para controlar também como as linhas do Inspetor de Equipamento reagem.
- Menu de colunas (clique direito na cabeça da tabela):
  - Repor colunas: restaura colunas e larguras padrão.
  - Ajustar largura: adapta as colunas à janela.
  - Permitir linhas multilinha: ativa quebras de linha (útil para Substats).
  - Mostrar/Ocultar colunas: caixas individuais por coluna.
- Reordenar: arraste uma cabeça horizontalmente.
- Redimensionar: arraste o bordo direito da cabeça.
- Comportamento de clique: uma linha seleciona a receita correspondente (sem deslocação automática). Clicar uma etiqueta de receita desloca a tabela até à primeira linha associada.

### Inspetor de Equipamento
- Clique em «Ferramentas» no cabeçalho da prévia para abrir o diálogo Equipamento. Crie equipamento de exemplo. Os itens sincronizam imediatamente com a prévia, então fechar o diálogo não limpa a grade do Inspetor de Equipamento.
- Conecte-se ao RSL Helper para sincronização ao vivo (o botão Connect no cabeçalho da prévia) ou arraste um arquivo `.db` para o aplicativo ou use o botão “Load RSL Helper Sellfile”.- Cada linha do Inspetor de Equipamento mostra slot, set, nível, main stat, substats (com glifos e rolagens), a origem (inventário vs inbox) e os chips Keep/Sell + a primeira receita/regra correspondente. Regras desativadas nunca fazem match, então `No Match` representa o que o Sellfile deixaria passar.
- Os contadores no cabeçalho mostram os totais de Manter/Vender/Escopo/Sem regra. Os quatro botões de filtro de resultado — **Manter**, **Vender**, **Escopo** e **Sem regra** — funcionam como interruptores independentes: ative qualquer combinação para restringir a lista. **Escopo** esmaece (mas mantém visíveis) os itens que compartilham o mesmo set+slot que uma peça que suas regras venderiam, para que você possa comparar um candidato com sua concorrência em uma única visualização, sem precisar de dois filtros. Quando uma ou mais **Fontes** também estão selecionadas, essas fontes atuam como conjunto de referência — apenas os itens marcados para venda das fontes selecionadas se tornam itens principais, enquanto os acompanhantes são buscados em *todas* as fontes, permitindo ver cada cópia dessa peça de equipamento independentemente de onde esteja. **Sem regra** mostra equipamentos que nenhuma regra toca — útil para identificar lacunas nas suas receitas. Combine com o seletor `Primeira`/`Por correspondência` de Receitas para focar nos casos-limite antes de exportar.
- Use o interruptor da prévia para alternar entre as tabelas «Rules» e «Inspetor de Equipamento» sem reabrir Ferramentas — perfeito para comparar as linhas geradas com o item que disparou cada resultado.

- **Sobreposição de Posição da Salvaguarda:** o menu da grade tem um botão **Posição da Salvaguarda** que alterna o que o chip de posição de cada peça mostra (pelo valor de substat atual; **#1** é a melhor; verde = mantida, vermelho = seria vendida). **Desligado** o oculta; **Grupo** mostra a posição dentro do próprio grupo da peça — o escopo de slot / set / facção / status principal que a regra mantém separadamente (ex.: **#2**); **Salvaguarda** mostra a posição em toda a salvaguarda (ex.: **#7**); **Ambos** mostra grupo e depois salvaguarda como **#2 · #7** (2ª no grupo, 7ª no total). O chip e a dica são ordenados pela posição exibida, o chip reflete a regra correspondente mais bem posicionada da peça, e clicar vai até essa regra. Com regras selecionadas, o chip reflete essas regras; uma peça classificada só por *outra* regra ainda mostra sua melhor posição, levemente esmaecida. Requer Salvaguardas ativadas.

### Comparação de equipamento (Antes / Depois)
- O botão **Diff** no cabeçalho do Inspetor de Equipamento ativa uma comparação que mostra quais peças mudam entre **Manter** e **Vender** quando você muda algo — útil ao ajustar receitas ou testar as substituições dinâmicas na caixa de diálogo Nota.
- Um pequeno chip ao lado do botão mostra a mudança atual em relação ao seu ponto de referência: quantas peças a mais (ou a menos) estão agora **Vendidas**, **Mantidas** e protegidas por **Salvaguardas**.
- Clique esquerdo em **Diff** abre uma visão **lado a lado de antes/depois** das peças alteradas (esquerda = antes, direita = depois) com rolagem sincronizada. Clique de novo para fechar.
- Clique direito no botão para opções:
  - **Definir referência** — congela o estado atual como o «antes» com o qual você compara.
  - **Acompanhar referência automaticamente** (ativado por padrão) — mantém o «antes» na sua última edição de receita/salvaguarda, então a comparação sempre reflete sua mudança mais recente.
- Duas coisas que vale saber:
  - Alternar as **substituições dinâmicas** na caixa de diálogo Nota **soma** — várias substituições mostram o efeito combinado, não apenas a última.
  - Editar uma receita ou salvaguarda no construtor move a referência para essa edição (enquanto «Acompanhar referência automaticamente» estiver ativado). Desative-o (ou use «Definir referência») para comparar tudo contra um ponto fixo.
- Seus filtros normais do Inspetor de Equipamento continuam valendo: uma peça aparece se corresponder ao filtro antes ou depois da mudança.

### Exportar
- «Exportar Sellfile do RSL Helper combinada» aparece quando existe arquivo base; caso contrário verá «Exportar Sellfile do RSL Helper».
- Use «Salvar receitas» e «Carregar receitas» no construtor para salvar o trabalho.
- O nome padrão do export é `Sellfile_AAAA MM DD_HHMM.hsf`.

## Exemplos

Todos os exemplos usam alvos de substats de 6★ por unidade de rolagem: SPD=5, CR%=5, CDMG%=5.

Cedo vs. Tarde
- Cedo: os limiares refletem as rolagens já obtidas. Com ★ + soma mínima, apresenta apenas divisões mínimas por marco (lista estável). Caso contrário enumera o progresso possível até a condição ficar viável e depois fica nos seus alvos por stat (a menos que uma soma global exija mais).
- Tarde: só exige o que tem de existir agora para que a meta de +16 continue possível. Com ★ + soma mínima repete essas divisões nos primeiros marcos e em +16. Com alvos por stat fornece os limites inferiores exigidos em cada nível.

Exemplo: Cedo (2 substats) — SPD min=2, CR% min=1 (níveis 0..16)
- +0: SPD ≥ 5, CR ≥ 5
- +4: [10,5] e [5,10]
- +8: [15,5], [10,10], [5,15]
- +12/+16: [15,10]

Exemplo: Tarde (2 substats) — SPD min=2, CR% min=1 (níveis 0..16)
- +0/+4: [5,5]
- +8: [10,5] ou [5,10]
- +12: [15,5] ou [10,10]
- +16: [15,10]

Exemplo: Cedo (3 substats) — SPD min=2, CR% min=1, CDMG% livre, Obrigatórios=3
- +0: [SPD, CR, CDMG] ≥ [5,5,5]
- +4: divisões de uma rolagem: [10,5,5], [5,10,5], [5,5,10]
- +8: divisões de duas rolagens (respeitando limites superiores)
- +12/+16: [15,10,5]

Exemplo: Tarde (3 substats) — SPD min=2, CR% min=1, CDMG% livre, Obrigatórios=3
- +0/+4: [5,5,5]
- +8: [10,5,5] ou [5,10,5]
- +12: [15,5,5] ou [10,10,5]
- +16: [15,10,5]

Dica: Use limites superiores de rolagem para proibir melhorias num stat. A partir de ★, clique direito → limite superior e defina 0. Assim CDMG% mantém o valor base enquanto SPD/CR recebem as rolagens.

Exemplo: Bloquear um e exigir dois
- Substats: SPD, HP, ATK. Clique em SPD e depois no cadeado (🔒) para bloqueá-lo.
- Substats obrigatórios = 2.
- Resultado: surgem SPD+HP e SPD+ATK. HP+ATK sem SPD nunca é gerado (o bloqueado conta sempre).

Exemplo: Focar rolagens em 3 stats e bloquear o 4.º
- Objetivo: Manter itens com SPD, CR%, CDMG% e um de HP%/ATK%/DEF%, mas sem rolagens nesse quarto stat.
- Substats: SPD, CR%, CDMG%, HP%, ATK%, DEF%.
- Substats obrigatórios = 4.
- Indicadores:
  - De ★, clique esquerdo (mínimos): defina SPD/CR%/CDMG% nos mínimos desejados (ex. 1 cada).
  - De ★, clique direito (limite superior): defina HP%/ATK%/DEF% com limite superior 0.
- Resultado: o quarto substat roda entre os três, mas não recebe rolagens; SPD/CR%/CDMG% ficam com as melhorias.

Exemplo: Cedo com curinga (apenas selecionados)
- Substats: SPD e ACC.
- Indicadores: SPD min = 2; ACC = ★.
- Substats obrigatórios: Auto (2).
- Níveis: +0 a +16.
- Efeito: Cedo mostra itens que conseguem atingir SPD(2) até +16 (linhas onde SPD ou ACC ganhou rolagem). Assim que duas rolagens em SPD são possíveis, a linha mínima aparece.

Exemplo: Soma de rolagens com curingas (2 substats)
- Substats: SPD e ACC, ambos em ★.
- Substats obrigatórios: 2. Rolagens mínimas: 1.
- Cedo:
  - +4/+8/+12/+16: duas linhas — SPD ≥ 10, ACC ≥ 9 e SPD ≥ 5, ACC ≥ 18 (divisões mínimas; lista estável).
- Tarde:
  - +0/+4/+8/+12: apenas linhas base (ainda sem exigência extra); +16: as duas linhas acima. Com mínimos maiores, Tarde aplica as divisões necessárias nos marcos adequados (p. ex., mínimo 2 → +12 mostra divisões de uma rolagem, +16 as de duas).

## Notas para contribuidores

- Traduções: Os pacotes de lançamento incluem modelos de localização em `i18n/` (por exemplo, `i18n/pt-BR.l10n.json`).
- Editar e testar: Abra o app e arraste o seu `*.l10n.json` editado para aplicá-lo imediatamente à sessão atual (nenhuma instalação é necessária ou possível).
- Enviar correções: Envie o JSON atualizado por mensagem no Discord. Mantenha as chaves inalteradas; as chaves ausentes voltam para o inglês.
- Idiomas integrados: Todos os idiomas distribuídos são compilados no único HTML, então o app funciona totalmente offline. Suas correções serão incluídas no próximo lançamento.
- `Stream-Helper-DB-to-Creator.bat` inicia o DB watcher e transmite o banco padrão do RSL Helper para o Sellfile Creator para facilitar a checagem das receitas ao vivo.

## Agradecimentos

Muito obrigado a **[STBL] Nasgor** pelas contribuições inestimáveis,  
a **[SP] Panda** pelos seus Sellfiles,  
a **KruYseN** pelos vídeos de limpeza de equipamento,  
e claro a **Farbstoff** pelo RSL Helper!

## Autor
Criado por [STBL] Nusi㊷  
Localização por AI

© Nusi㊷ - 2026
