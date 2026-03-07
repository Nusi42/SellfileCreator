# RSL Helper Sellfile Creator

Crie, reveja e exporte regras de venda para o RSL Helper com uma interface simples.

> Ferramenta criada por fãs. Não tem ligação com a Plarium, Raid: Shadow Legends ou RSL Helper. Todas as marcas mencionadas pertencem aos respectivos proprietários.

## Funcionalidades
- Criar e salvar regras: construa receitas e mantenha uma biblioteca reutilizável.
- Interruptor da Prévia Sellfile: alterne entre a tabela `Rules` e a tabela `Inspetor de Equipamento` direto no cabeçalho. Os contadores/badges mudam (Manter/Vender para regras, `Matched`/`No Match` para o Inspetor de Equipamento) e os filtros acompanham a tabela escolhida.
- Arrastar e soltar ou botão “Load RSL Helper Sellfile”: solte `.sfr`, `.hsf` ou `.db` em qualquer ponto (a sobreposição confirma) ou clique no botão. Ambos fazem exatamente a mesma coisa: `.sfr` substitui o builder, `.hsf` adiciona o Sellfile base opcional e `.db` vai direto para a fila do Inspetor de Equipamento sem tocar no builder/export.
- Segure `Shift` ao abrir/carregar um `.sfr` (seletor de arquivos ou arrastar e soltar) para abrir um diálogo de importação adicional onde você escolhe separadamente Receitas, Nota, Metasets e Salvaguardas.
- Meta-sets: agrupe conjuntos de equipamento (por exemplo, Velocidade + Percepção) e reutilize-os em várias regras.
- Exportação com um clique: gere um arquivo HSF (Sellfile do RSL Helper) pronto a carregar no RSL Helper.
- Botão «Ferramentas»: abra o diálogo pelo cabeçalho para acessar `Venda final`, `Alvos de substats`, `Drops de masmorra` e o diálogo Equipamento no mesmo lugar. Crie peças de exemplo, cole linhas ou arraste `%APPDATA%\\RslHelper\\Config`; depois feche o diálogo e deixe o interruptor da prévia na tabela que precisar — a fila do Inspetor de Equipamento continua visível sem reabrir nada.
- Modo Salvaguardas: defina as combinações que você não quer perder. Quando as suas receitas mais as suas regras de venda atualmente ativas removerem todas as cópias, o scanner gera automaticamente regras de manutenção.
- Diálogo de restauração do Autosave: quando existe um autosave, escolha exatamente o que recuperar — receitas, meta-sets, Alvos de substats, restante da Venda final, nota fixada, estado do painel de filtros e até as importações do Inspetor de Equipamento.
- Copiar a pasta do banco de dados do RSL Helper: o cabeçalho da prévia mostra um botão que copia `%APPDATA%\\RslHelper\\Config` para o porta‑papéis para colar o caminho no Explorer antes de arrastar a `.db` para o Sellfile Creator.

## Como utilizar

### Arquivo de receitas
- SFR (`.sfr`): arquivo de projeto do aplicativo. Pense nele como um “save” que pode carregar ou compartilhar. O RSL Helper não lê SFR diretamente.
- HSF (`.hsf`): o Sellfile consumido pelo RSL Helper. Exporte-o aqui e carregue-o depois no RSL Helper.
- O nome padrão ao salvar é `SellfileCreatorRecipes_AAAA MM DD_HHMM.sfr`.

### Construtor de receitas
- Preencha o Construtor de receitas e atribua um nome claro à receita.
- Clique em «Adicionar como nova receita» para salvar. Depois selecione a receita na lista abaixo do construtor para editá-la e confirme com «Atualizar receita selecionada».
- Carregar/Salvar: use «Carregar receitas» e «Salvar receitas» para reutilizar as regras. Essas ações mantêm tudo o que é necessário para reconstruir a prévia.
- Menus de Reset/Insert/Apply: clique com o botão direito em «Reset», «Insert as receita» ou «Apply as receita» para abrir o menu compartilhado. Salve o estado atual do builder como modelo padrão, retorne aos padrões de fábrica, ative «Auto reset after Insert» (limpa o builder imediatamente após inserir uma receita) ou ative «Auto apply to selected receita» (envia as edições para a receita destacada automaticamente após ~400 ms de inatividade). Auto reset e Auto apply não podem ficar ativos ao mesmo tempo — ligar um desliga o outro — e ambas as preferências continuam válidas entre sessões.
- Nota: clique em «Adicionar nota…» (ou «Editar nota…») para anexar um texto ao arquivo de receitas. Ao carregar um arquivo que contenha nota, ela é exibida automaticamente. Use `<!-- recipes:1,0 -->` para inserir chips de receitas específicas (0 pega a próxima). Use `<!-- recipes-re:"speed" -->` para mostrar todas as receitas cujo nome corresponde ao padrão (ignorando maiúsculas/minúsculas).
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
- Facção: Restrinja regras de acessórios a uma facção específica ao montar uma equipe. Anéis, Amuletos e Estandartes respeitam o filtro; a armadura ignora a facção, então `Qualquer` é a escolha segura.
- Slots: Foque a regra em peças específicas (Arma, Botas, etc.) para impedir que itens fora do slot coincidam. Vazio = todos os slots.
- Sets e Meta-sets: Filtre para conjuntos específicos ou meta-sets nomeados quando quiser apenas essas combinações. Vazio = todos os sets.
- Mainstats: Defina quais os mainstats aceitos.
  - Pode selecionar vários; sem seleção = qualquer mainstat.
  - Ao escolher vários mainstats, o export gera uma linha por mainstat para manter tudo explícito.
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
- Mítica (5 rolagens): A raridade Mítica pode atingir cinco rolagens num substat em +16 (o resto fica pelas quatro). Se Mítica estiver disponível, o gerador conta o roll extra logo em +0.

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

### Manter únicos
- Mude o construtor para o modo **Salvaguardas** usando o botão de alternância acima do painel do construtor para marcar as combinações que não quer vender nunca. Ative `Manter únicos` para deixar o scanner adicionar linhas de manter (editar uma regra também ativa automaticamente).
- As regras de Manter únicos não “consomem” itens—cada regra avalia o mesmo conjunto de candidatos. Se uma peça corresponder a várias regras, conta para todas.
- Cada regra de Manter únicos permite escolher slot, sets ou meta-sets, ranks, raridades, atributos principais e, no caso dos acessórios, facções. Deixar um seletor vazio significa «qualquer».
- `Modo` decide como a regra é emitida: `Desativada` desliga, `Proteger existentes` injeta linhas de manter para itens que seriam vendidos até cumprir a quota, e `Antecipar lacunas` também emite regras fictícias para combinações que ainda faltam para proteger novos drops até a próxima atualização da BD.
- Substats são opcionais: escolha um ou mais para contar somente itens que tenham esses substats. O chip de correspondência (`Qualquer Substat` / `Todas as Substats` / `Por Substat`) decide se basta um, se precisam estar todos ou se cada substat tem sua própria quota. Deixar vazio permite qualquer substat.
- As substats selecionadas sempre são ranqueadas pela fórmula normalizada (glifos ignorados); os pesos aparecem com `Qualquer Substat` e `Todas as Substats`, `Por Substat` mantém a ponderação igual (empates no corte continuam protegidos).
- `≥ Quantidade necessária` é a promessa que você quer manter. Os chips de escopo logo abaixo de cada seletor (todos exceto `Rank` e `Raridade`) decidem como essa quota se divide: `Por slot`, `Por conjunto`, `Por facção` e `Por atributo principal` podem ser combinados livremente. Desligar todos volta automaticamente para `Por regra`.
- O tooltip de `Quantidade necessária` mostra a divisão ativa de escopo (`X por slot × por conjunto × ...`) e uma linha simples de faltantes (`({missing} faltando)`).
- O scanner só adiciona linhas de manter para itens correspondentes que seriam vendidos, e só quando a quota não é atendida. Em `Antecipar lacunas`, regras fictícias cobrem as combinações que faltam.
- `Superar equipados ≥ N%` (piso de qualidade opcional): um candidato só se qualifica se seu score ponderado de substats superar ao menos **N%** do equipamento de coleção equipado que também corresponde ao slot, stat principal, set, rank, raridade e facção da regra. **50** = superar a mediana (bom padrão), **75** = quartil superior, **100** = superar cada peça equipada correspondente. As peças equipadas na coleção sempre passam — formam o pool de referência. Equipamento abaixo do nível 12 está isento. Se nenhum equipamento de coleção corresponder aos filtros da regra, o piso é 0 (todos os candidatos passam).

#### Escopos de quota em resumo
Empilhar chips de escopo decide quem recebe uma quota própria. Deixe «Por regra» ligado para compartilhar um único pool e vá ativando `Por slot`, `Por conjunto`, `Por facção` e `Por atributo principal` para impor misturas Slot × Set × Facção × Atributo principal de forma independente.

| Botão de escopo | Comportamento da cota | Quando brilha |
| --- | --- | --- |
| `Por regra` | Um pool único para toda a regra. | Manter cinco botas SPD sem importar o set. |
| `Por slot` | Duplica a cota por slot. | Trava dois anéis, dois amuletos e dois estandartes separadamente. |
| `Por conjunto` | Duplica a cota por set/metaset. | Acompanha Stoneskin e Protection sem misturar os drops. |
| `Por facção` | Duplica a cota por facção. | Garante três anéis Merciless para cada facção. |
| `Por atributo principal` | Duplica a cota por mainstat. | Mantém ACC e RES em banners separados. |

#### Exemplos do mundo real
| Cenário | Filtros | Quantidade necessária | Botões de escopo | O que o scanner garante |
| --- | --- | --- | --- | --- |
| Acabando as botas SPD | Slot = Botas, Atributo principal = SPD, Sets vazios | `5` | `Por regra` | Pelo menos cinco botas SPD sobrevivem, independentemente do set. |
| Misturar luvas Savage e Lethal | Slot = Luvas, Sets = Savage + Lethal, Atributo principal = CDMG% | `3` | `Por regra` | Três luvas de dano ficam seguras mesmo quando a divisão entre sets muda. |
| Anéis Merciless por facção | Slot = Anel, Set = Merciless, Facção em branco | `3` | `Por facção` | Cada facção mantém três anéis Merciless próprios. |
| Anéis HP% por facção | Slot = Anel, Atributo principal = HP%, Sets vazios | `2` | `Por facção` | Duas cópias HP% sobrevivem para cada facção. |
| Acessórios básicos por facção | Três regras (Anel/Amuleto/Estandarte), Sets/Atributo principal vazios | `5` | `Por facção` | Cinco anéis, amuletos e estandartes por facção permanecem no inventário. |
| Acessórios Stoneskin + Protection | Slot = Anel/Amuleto/Estandarte, Sets = Stoneskin + Protection, Atributo principal vazio | `2` | `Por conjunto` + `Por facção` + `Por slot` | Cada facção guarda dois Stoneskin e dois Protection para cada slot de acessório. |
| Acessórios com SPD mais alto | Slot = Anel/Amuleto/Estandarte, Substats = SPD | `5` | `Por regra` | Mantém os cinco melhores rolls de SPD entre os acessórios (empates incluídos). |
| Estandartes de ACC com SPD | Slot = Estandarte, Atributo principal = ACC, Substats = SPD + ACC, Pesos: SPD maior | `3` | `Por facção` | Cada facção guarda os melhores estandartes de ACC onde SPD pesa mais. |

Dica: importe a sua `.db` ou cole itens no diálogo Equipamento antes de ativar o modo Salvaguardas para que o scanner veja equipamentos reais. Clique numa regra de salvaguarda para realçar o equipamento correspondente; mude `Filtro` para `Seleção` para ver apenas essas correspondências.

### Drops de masmorra (Simulador)
Abra «Ferramentas» e vá para **Drops de masmorra**. Ele simula o farm em masmorras com suas regras atuais do Sellfile para ver quanto equipamento você manteria por conjunto e nível de melhoria.

- Escolha uma masmorra e um estágio.
- Modo de simulação:
  - `Subida de nível`: os rolls param assim que o item seria vendido, então reflete o up real.
  - `Instantâneo`: os rolls sempre vão até +16, mesmo se o item teria sido vendido antes.
- A tabela mostra drops mantidos divididos por todos os drops daquele estágio em +0 / +4 / +8 / +12 / +16.
- Clique em uma célula para o detalhamento de slot + stat principal, depois abra **Chances de subatributos específicos** para ver chances exatas e estimativas de execuções.

Notas:
- Usa suas regras atuais de Manter/Vender, incluindo Venda final e Manter únicos.
- Roda cerca de 100.000 drops por estágio e atualiza enquanto roda.
- Taxas de drop e rolls são simulados; trate os números como estimativas.

### Gestão de receitas
- As receitas salvas aparecem como etiquetas sob o construtor. Clique para selecionar; clique direito para duplicar, mover, copiar ou eliminar.
- «Excluir todas as receitas» remove todas (com confirmação).
- Ligação por hover: passar o cursor sobre uma etiqueta destaca as linhas associadas na prévia e vice-versa.
- Ligação por clique: clicar uma linha da tabela seleciona a receita de origem (linhas da HSF base não alteram a seleção).
- Cópia alternativa: Se o acesso ao porta‑papéis falhar, um diálogo é aberto com o texto já selecionado para copiar manualmente.

### Prévia Sellfile (Rules e Inspetor de Equipamento)
- O cabeçalho da prévia mantém o interruptor «Rules»/«Inspetor de Equipamento», o botão «Ferramentas» e o botão “Load RSL Helper Sellfile” juntos para saber sempre onde alternar de tabela ou abrir o diálogo Equipamento.
- Vista «Rules» (padrão): mostra todas as linhas que serão exportadas, incluindo quaisquer `.hsf` base opcionais. Os contadores permanecem em Manter vs Vender, a faixa de filtros mantém os chips Qualquer/Apenas (`Any/Only`) para Slot/Rank/Raridade/Nível e agora exibe os dois botões de Receitas lado a lado: «Restringir» decide se as etiquetas fora dos filtros atuais ficam escondidas e a «Seleção» funciona como um interruptor Ligado/Desligado que limita as linhas do Sellfile às etiquetas selecionadas (deixando o mesmo filtro pronto para o Inspetor de Equipamento).
- Vista «Inspetor de Equipamento»: muda a tabela para a lista de itens importados sem precisar reabrir Ferramentas. Os contadores passam a `Matched` vs `No Match` (mais Manter/Vender) seguindo a regra de que “a primeira receita que dá match vence”, e a faixa de filtros mantém os dois botões «Receitas» («Restringir» + «Seleção»). O primeiro continua controlando a visibilidade das etiquetas, enquanto a «Seleção» aplica o triestado (`Off` → `Primeira` → `Por correspondência`) para isolar as linhas do Inspetor de Equipamento e continua limitando as regras do Sellfile à mesma seleção quando você retornar a «Rules». Soma-se ainda o filtro de resultado (Manter/Vender vs `Matched`/`No Match`), permitindo destacar peças cujo primeiro — ou qualquer — match pertence à seleção sem esconder os chips. Importar um `.db` alterna automaticamente para esta vista, mas pode voltar a «Rules» quando quiser.
- O botão “Load RSL Helper Sellfile” se comporta exatamente como o arrastar e soltar: `.sfr` substitui o estado do builder, `.hsf` adiciona o Sellfile base opcional e `.db` envia itens para o Inspetor de Equipamento sem tocar em receitas nem na exportação. «Limpar» remove o `.hsf` base quando existir.
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
- Importe o banco de dados do RSL Helper arrastando `.db` para o aplicativo ou usando o botão “Load RSL Helper Sellfile” (mesmo comportamento). Esses imports enfileiram milhares de artefatos (incluindo inbox), mudam a prévia para a tabela do Inspetor de Equipamento e deixam o builder/export intactos.
- Cada linha do Inspetor de Equipamento mostra slot, set, nível, main stat, substats (com glifos e rolagens), a origem (inventário vs inbox) e os chips Keep/Sell + a primeira receita/regra correspondente. Regras desativadas nunca fazem match, então `No Match` representa o que o Sellfile deixaria passar.
- Os contadores no cabeçalho passam para `Matched` vs `No Match` junto com o resumo Manter/Vender. Combine-os com os filtros do Inspetor de Equipamento (resultado + «Seleção» em `Off`/`Primeira`/`Por correspondência`) para focar casos-limite antes de exportar.
- Use o interruptor da prévia para alternar entre as tabelas «Rules» e «Inspetor de Equipamento» sem reabrir Ferramentas — perfeito para comparar as linhas geradas com o item que disparou cada resultado.

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
