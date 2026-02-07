# RSL Helper Sellfile Creator

Crie, reveja e exporte regras de venda para o RSL Helper com uma interface simples.

> Ferramenta criada por fãs. Não tem ligação com a Plarium, Raid: Shadow Legends ou RSL Helper. Todas as marcas mencionadas pertencem aos respetivos proprietários.

## Funcionalidades
- Criar e guardar regras: construa configs e mantenha uma biblioteca reutilizável.
- Interruptor da Prévia Sellfile: alterna entre a tabela de Regras e a tabela do Teste de Regras diretamente no cabeçalho. Os contadores/badges adaptam-se (Manter/Vender para regras, `Matched`/`No Match` para o tester) e os filtros seguem a tabela escolhida.
- Arrastar e largar ou botão “Load RSL Helper Sellfile”: larga `.hsfc`, `.hsf` ou `.db` em qualquer ponto (a sobreposição confirma) ou clica no botão para carregar. Ambos os caminhos fazem exatamente o mesmo: `.hsfc` substitui o builder, `.hsf` acrescenta o Sellfile base opcional e `.db` entra diretamente na fila do Teste de Regras sem tocar no builder/export.
- Meta-sets: agrupe conjuntos de equipamento (por exemplo, Velocidade + Perceção) e volte a usá-los em várias regras.
- Exportação com um clique: gere um ficheiro HSF (Sellfile do RSL Helper) pronto a carregar no RSL Helper.
- Botão «Logic Hub»: abre o diálogo no cabeçalho para aceder a `Venda final`, `Conservar únicos` e ao diálogo Equipamento (separador Equipamento dentro do Logic Hub) num só lugar. Cria equipamento de exemplo, cola linhas ou arrasta `%APPDATA%\\RslHelper\\Config`; depois fecha o diálogo e mantém o interruptor da pré-visualização na tabela que precisares — a fila do Teste de Regras continua visível sem reabrir.
- Aba «Manter únicos»: define as combinações que não queres perder. Quando as tuas configs mais as tuas regras de venda atualmente ativas removerem todas as cópias, o scanner gera automaticamente regras de manutenção.
- Diálogo de restauro do Autosave: quando existe um autosave, escolhe exatamente o que carregar — configs, meta-sets, Alvos de substats, resto da Venda final, nota fixada, estado do painel de filtros e até importações do Teste de Regras.
- Copiar a pasta da base de dados do RSL Helper: o cabeçalho da prévia mostra um botão que copia `%APPDATA%\RslHelper\Config` para o porta‑papéis para que possas colar a rota no Explorador antes de arrastar a `.db` para o Sellfile Creator.

## Como utilizar

### Ficheiro de configs
- HSFC (`.hsfc`): ficheiro de projeto da aplicação. Pense nele como um “save” que pode carregar ou partilhar. O RSL Helper não lê HSFC diretamente.
- HSF (`.hsf`): o Sellfile consumido pelo RSL Helper. Exporte-o aqui e carregue-o depois no RSL Helper.
- O nome padrão ao guardar é `SellfileCreatorRules_AAAA MM DD_HHMM.hsfc`.

### Configs Builder
- Preencha o Configs Builder e atribua um nome claro à config.
- Clique em «Adicionar como nova config» para guardar. Depois selecione a config na lista por baixo do builder para a editar e confirme com «Atualizar config selecionada».
- Carregar/Guardar: use «Carregar configs» e «Guardar configs» para reutilizar as regras. Estas ações mantêm tudo o que é necessário para reconstruir a prévia.
- Menus de Reset/Insert/Apply: clique com o botão direito em «Reset», «Insert as config» ou «Apply as config» para abrir o menu partilhado. Guarde o estado atual do builder como modelo predefinido, volte às definições de fábrica, ative «Auto reset after Insert» (limpa o builder imediatamente após inserir uma config) ou ative «Auto apply to selected config» (envia as edições para a config destacada automaticamente após ~400 ms de inatividade). Auto reset e Auto apply não podem ficar ativos ao mesmo tempo — ligar um desliga o outro — e ambas as preferências mantêm-se entre sessões.
- Nota: clique em «Adicionar nota…» (ou «Editar nota…») para anexar um texto ao ficheiro de configs. Ao carregar um ficheiro que contenha nota, esta é mostrada automaticamente. Use `<!-- configs:1,0 -->` para inserir chips de configs específicas (0 escolhe a seguinte). Use `<!-- configs-re:"speed" -->` para mostrar todas as configs cujo nome corresponde ao padrão (ignorando maiúsculas/minúsculas).
- Restauro do Autosave: ao iniciar, o diálogo lista cada secção auto-guardada com a sua própria caixa. Restaure apenas o que precisa — configs (incluindo o chip selecionado), meta-sets, Alvos de substats, resto da Venda final, nota fixada, painel de filtros (estado aberto, chips, secções recolhidas) e importações do Teste de Regras. Deixe uma caixa desmarcada para manter o trabalho atual. O Autosave também recorda quais os interruptores da Venda final (Artefactos, Acessórios e intervalos de nível) estavam ativos, por isso reabrir o Logic Hub reflete exatamente o que exportou da última vez.

### Estrutura do builder (de cima para baixo)
- Ação e Ativo: Defina o que acontece quando um item coincide.
  - `Manter` marca o item como Manter; o RSL Helper deixa-o intacto.
  - `Vender` marca o item como Vender; o RSL Helper coloca-o na fila de venda automática.
  - O interruptor «Ativado no Sellfile» decide se as linhas exportadas permanecem ativas. Configs desativadas exportam com Use = false (ficam riscadas na prévia); ativa «Omitir regras desativadas ao exportar» no menu de exportação se quiseres deixá-las de fora.
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
- Fação: Restrinja regras de acessórios a uma fação específica quando está a montar uma equipa. Anéis, Amuletos e Estandartes respeitam o filtro; a armadura ignora a fação, pelo que `Qualquer` é a opção segura.
- Slots: Foque a regra em slots específicos (Arma, Botas, etc.) para impedir que itens fora do slot coincidam. Vazio = todos os slots.
- Sets e Meta-sets: Filtre para conjuntos específicos ou meta-sets nomeados quando só pretende essas combinações. Vazio = todos os sets.
- Mainstats: Defina quais os mainstats aceites.
  - Pode selecionar vários; sem seleção = qualquer mainstat.
  - Ao escolher vários mainstats, o export gera uma linha por mainstat para manter tudo explícito.
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
- Mítica (5 rolagens): A raridade Mítica pode atingir cinco rolagens num substat em +16 (o resto fica pelas quatro). Se Mítica estiver disponível, o gerador conta o roll extra logo em +0.

### Alvos de substats
- Abra o diálogo «Alvos de substats…» no canto superior direito do builder.
- Os alvos são globais e afetam todas as configs.
- Estes alvos definem os limiares usados por intervalo de nível (0–3, 4–7, 8–11, 12–15, 16) e servem de fallback na grelha de Alvos de rolagem.
- Use «Repor predefinições» dentro da janela para voltar aos alvos recomendados.

### Meta-sets
- Clique em «Gerir meta-sets…» para abrir o diálogo.
- Crie ou renomeie meta-sets e escolha os sets que contêm. A interface usa a mesma pesquisa do seletor de sets.
- Existem meta-sets iniciais prontos a usar; pode editá-los ou removê-los.
- «Repor predefinições» oferece opções seguras quando um meta-set está em uso (remover, substituir por sets explícitos ou por outro meta-set).

### Venda final
- Use o interruptor `Venda final` no cabeçalho da pré-visualização para ativar regras de venda para os itens restantes. A etiqueta não muda; o preenchimento âmbar indica que está ativa e o contorno neutro indica que está desligada.
- Clique em «Logic Hub» ao lado do interruptor para abrir o separador `Venda final` e decidir se abrange Artefactos, Acessórios e quais os intervalos de nível (0–3, 4–7, 8–11, 12–15, 16). A predefinição cobre 0–15, por isso o `+16` só entra quando o ativares.
- Sem `Venda final`, o RSL Helper mantém tudo o que não coincide com uma regra. Só vende quando uma regra explícita diz Vender.
- Com `Venda final` ativa, as regras geradas incluem todos os sets conhecidos. Na prévia surge «Todos os sets conhecidos» para reduzir ruído; o ficheiro exportado lista os sets um a um.

### Manter únicos
- Clica em «Logic Hub» no cabeçalho da pré-visualização e muda para o separador `Manter únicos` para marcar as combinações que nunca queres perder. Ativa `Manter únicos` para deixar o scanner adicionar linhas de manter (editar uma regra também ativa automaticamente).
- Cada regra de Manter únicos permite escolher slot, sets ou meta-sets, ranks, raridades, atributos principais e, no caso dos acessórios, facções. Deixar um seletor vazio significa «qualquer».
- `Modo` decide como a regra é emitida: `Desligada` desliga, `Proteger existentes` injeta linhas de manter para itens que seriam vendidos até cumprir a quota, e `Antecipar lacunas` também emite regras fictícias para combinações em falta para proteger novos drops até a BD ser atualizada.
- Os substats são opcionais: escolhe um ou mais para contar apenas itens que tenham pelo menos um desses substats (vários = «qualquer um deles»). Deixar vazio permite qualquer substat.
- `Modo de substats` controla como esses substats são usados: `Sem ranking` conta cada item correspondente, enquanto `Classificado` pontua com a fórmula normalizada de substats (glifos ignorados) e mantém apenas os melhores rolls por grupo de âmbito. Empates no corte continuam protegidos.
- Usa `Pesos` (apenas em `Classificado`) para indicar o que importa mais — pesos maiores fazem essa substat contar mais no ranking.
- `≥ Quantidade necessária` é a promessa que queres manter. Os chips de âmbito logo abaixo de cada seletor (tudo exceto `Rank` e `Raridade`) decidem como a quota é dividida: `Por slot`, `Por conjunto`, `Por facção` e `Por atributo principal` podem ser combinados livremente. Desligar todos volta automaticamente para `Por regra`.
- O contador `Existem {have} / Manter {keep}` mostra: **Existem** = itens correspondentes (em `Classificado`, conta só os melhores rolls + empates), **Manter** = a quota após os âmbitos. O chip fica vermelho quando a quota não é atingida.
- O scanner só adiciona linhas de manter para itens correspondentes que seriam vendidos, e só quando a quota não é atendida. Em `Antecipar lacunas`, regras fictícias cobrem as combinações em falta.

#### Âmbitos de quota num relance
Empilhar os chips de âmbito altera quem recebe quota própria. Mantém `Por regra` ligado para partilhar um único pool e ativa `Por slot`, `Por conjunto`, `Por facção` e `Por atributo principal` para impor misturas Slot × Set × Facção × Atributo principal de forma independente.

| Botão de âmbito | Comportamento da quota | Quando usar |
| --- | --- | --- |
| `Por regra` | Um único pool para toda a regra. | Mantém cinco botas SPD independentemente do set. |
| `Por slot` | Duplica a quota para cada slot. | Protege dois anéis, dois amuletos e dois estandartes em separado. |
| `Por conjunto` | Duplica a quota para cada set/metaset da carta. | Acompanha duas quedas de Stoneskin e duas de Protection individualmente. |
| `Por facção` | Duplica a quota para cada facção. | Garante três anéis Merciless para cada facção. |
| `Por atributo principal` | Duplica a quota para cada atributo principal selecionado. | Mantém pools separados para estandartes ACC vs. RES. |

#### Exemplos reais
| Cenário | Filtros | Quantidade necessária | Botões de âmbito | O que o scanner garante |
| --- | --- | --- | --- | --- |
| A faltar botas SPD | Slot = Botas, Atributo principal = SPD, Sets vazios | `5` | `Por regra` | Pelo menos cinco botas SPD sobrevivem, independentemente do set. |
| Misturar luvas Savage e Lethal | Slot = Luvas, Sets = Savage + Lethal, Atributo principal = CDMG% | `3` | `Por regra` | Três luvas de dano continuam seguras mesmo quando a mistura de sets muda. |
| Anéis Merciless por facção | Slot = Anel, Set = Merciless, Facção em branco | `3` | `Por facção` | Cada facção guarda três anéis Merciless próprios. |
| Anéis de HP% por facção | Slot = Anel, Atributo principal = HP%, Sets vazios | `2` | `Por facção` | Permanecem dois anéis de HP% por facção. |
| Acessórios básicos por facção | Três regras (Anel, Amuleto, Estandarte), Sets/Atributo principal vazios | `5` | `Por facção` | Cada facção conserva cinco anéis, amuletos e estandartes. |
| Acessórios Stoneskin + Protection | Slot = Anel/Amuleto/Estandarte, Sets = Stoneskin + Protection, Atributo principal vazio | `2` | `Por conjunto` + `Por facção` + `Por slot` | Cada facção guarda duas peças Stoneskin e duas Protection em cada slot de acessório. |
| Acessórios com SPD mais alto | Slot = Anel/Amuleto/Estandarte, Substats = SPD, Modo de substats = Classificado | `5` | `Por regra` | Mantém os cinco melhores rolls de SPD entre os acessórios (empates incluídos). |
| Estandartes de ACC com SPD | Slot = Estandarte, Atributo principal = ACC, Substats = SPD + ACC, Modo de substats = Classificado, Pesos: SPD mais alto | `3` | `Por facção` | Cada facção guarda os melhores estandartes de ACC onde SPD conta mais. |

Dica: importa a tua `.db` ou cola itens no diálogo Equipamento antes de abrir Manter únicos para que o scanner veja equipamento real. Clica numa carta de regra para realçar o equipamento correspondente; muda `Filtro` para `Seleção` para veres apenas essas correspondências.

### Gestão de configs
- As configs guardadas aparecem como etiquetas sob o builder. Clique para selecionar; clique direito para duplicar, mover, copiar ou eliminar.
- «Delete Configs» remove todas (com confirmação).
- Ligação por hover: passar o cursor sobre uma etiqueta destaca as linhas associadas na prévia e vice-versa.
- Ligação por clique: clicar uma linha da tabela seleciona a config de origem (linhas da HSF base não alteram a seleção).
- Cópia alternativa: Se o acesso ao porta‑papéis falhar, abre-se um diálogo com o texto já selecionado para copiar manualmente.

### Prévia Sellfile (Regras e Teste de Regras)
- O cabeçalho da prévia mantém o interruptor «Rules»/«Teste de Regras», o botão «Logic Hub» e o botão “Load RSL Helper Sellfile” juntos para saber sempre onde alternar de tabela ou abrir o diálogo Equipamento (Logic Hub → separador Equipamento).
- Vista «Rules» (padrão): mostra todas as linhas que serão exportadas, incluindo quaisquer `.hsf` base opcionais. Os contadores mantêm o resumo Manter vs Vender, a linha de filtros conserva os chips Qualquer/Apenas (`Any/Only`) para Slots/Rank/Raridade/Nível e agora apresenta os dois botões de Configs em paralelo: «Configs prévia» decide se as etiquetas fora dos filtros atuais ficam ocultas e o «Filtro de configs» funciona como um interruptor Ligado/Desligado que limita as linhas do Sellfile às etiquetas selecionadas (deixando a mesma seleção pronta para o tester).
- Vista «Teste de Regras»: muda a tabela para a lista de equipamento importado ou criado sem precisares de reabrir o Logic Hub. Os contadores passam a `Matched` vs `No Match` (mais Manter/Vender) segundo a regra “a primeira coincidência ganha” e a linha de filtros mantém ambos os botões de Configs («Configs prévia» + «Filtro de configs»). O primeiro continua a gerir a visibilidade das etiquetas, enquanto o «Filtro de configs» aplica o triestado (`Off` → `Primeira` → `Qualquer`) para isolar as linhas do Teste de Regras e continua a limitar as regras do Sellfile à mesma seleção quando regressas a «Rules». Soma-se ainda o filtro de resultados (Manter/Vender vs `Matched`/`No Match`), permitindo isolar peças cujo primeiro — ou qualquer — match pertence à tua seleção sem esconder as etiquetas. Importar um `.db` alterna automaticamente para esta vista, mas podes voltar a «Rules» a qualquer momento.
- O botão “Load RSL Helper Sellfile” comporta-se da mesma forma que o arrastar-e-largar: `.hsfc` substitui o estado do builder, `.hsf` adiciona o Sellfile base opcional e `.db` envia itens para a prévia do Teste de Regras sem tocar em configs ou export. «Limpar» remove o `.hsf` base quando existir.
- O ícone da paleta abre a gestão de cores para personalizar texto e fundo dos substats.
- Na vista «Rules» a tabela continua a mostrar «Idx» e «Cfg» (linhas do ficheiro base deixam «Cfg» em branco). Na vista «Teste de Regras», o mesmo espaço lista slot/set, estatísticas e o chip da primeira config correspondente para veres diretamente o que acontece a cada artefacto.

### Controlos da prévia
- Gerir cores: através do ícone da paleta; «Repor predefinições» restaura as recomendações.
- Filtros: prima `Ctrl+F` (`Cmd+F` no macOS) para abrir o painel e focar de imediato a pesquisa de configs. Clique direito em qualquer cabeçalho de secção (ou `Ctrl`/`Cmd`+clique no respetivo chevron) para recolher ou expandir todas as secções de uma só vez. `Configs prévia` oculta chips que não correspondem ao filtro ativo para manter a tabela legível. `Filtro de configs` decide quais as configs permitidas na tabela: em «Rules» funciona como um simples interruptor Ligado/Desligado, e na vista do Teste de Regras alterna por `Off` → `Primeira` → `Qualquer` para controlares também como respondem as linhas do Teste de Regras.
- Menu de colunas (clique direito na cabeça da tabela):
  - Repor colunas: restaura colunas e larguras padrão.
  - Ajustar largura: adapta as colunas à janela.
  - Permitir linhas multilinha: ativa quebras de linha (útil para Substats).
  - Mostrar/Ocultar colunas: caixas individuais por coluna.
- Reordenar: arraste uma cabeça horizontalmente.
- Redimensionar: arraste o bordo direito da cabeça.
- Comportamento de clique: uma linha seleciona a config correspondente (sem deslocação automática). Clicar uma etiqueta de config desloca a tabela até à primeira linha associada.

### Prévia do Teste de Regras
- Clique em «Logic Hub» no cabeçalho da Prévia Sellfile para abrir o diálogo Equipamento (Logic Hub → separador Equipamento). Crie equipamento de exemplo ou cole linhas (JSON/texto). Os itens sincronizam imediatamente com a prévia, por isso fechar o diálogo não limpa a grelha do Teste de Regras.
- Importe a base de dados do RSL Helper arrastando `.db` para a aplicação ou usando o botão “Load RSL Helper Sellfile” (mesmo comportamento). Estes imports enfileiram milhares de artefactos (incluindo itens da caixa de entrada), mudam a prévia para a tabela do Teste de Regras e deixam o estado do builder/export inalterado.
- Cada linha do Teste de Regras mostra slot, set, nível, mainstat, substats (com glifos e rolagens), a origem (inventário vs inbox) e os chips Keep/Sell + a primeira config/regra correspondente. Regras desativadas nunca fazem match, portanto `No Match` identifica peças que o Sellfile deixaria passar.
- Os contadores no cabeçalho passam a `Matched` vs `No Match` juntamente com o resumo Manter/Vender. Combina-os com os filtros do Teste de Regras (resultado + «Configs tester» em `Off`/`Primeira`/`Qualquer`) para focar casos-limite antes de exportar.
- Usa o interruptor da prévia para alternar entre as tabelas de Regras e do Teste de Regras sem reabrir o Logic Hub — ideal para comparar as linhas geradas com o equipamento que as ativou.

### Exportar
- «Exportar Sellfile do RSL Helper combinado» aparece quando existe ficheiro base; caso contrário verá «Exportar Sellfile do RSL Helper».
- Use «Guardar configs» e «Carregar configs» no builder para salvaguardar o trabalho.
- O nome padrão do export é `Sellfile_AAAA MM DD_HHMM.hsf`.

## Exemplos

Todos os exemplos usam alvos de substats de 6★ por unidade de rolagem: SPD=5, CR%=5, CDMG%=5.

**Cedo vs. Tarde**
- **Cedo**: os limiares refletem as rolagens já obtidas. Com ★ + soma mínima, apresenta apenas divisões mínimas por marco (lista estável). Caso contrário enumera o progresso dos stats selecionados até a meta de +16 ficar viável e depois fixa-se nos teus alvos por stat (a menos que uma soma global exija mais).
- **Tarde**: exige apenas o que precisa existir agora para que a meta de +16 continue possível. Com ★ + soma mínima repete essas divisões nos primeiros marcos e novamente em +16. Com alvos por stat fornece os limites inferiores obrigatórios em cada nível.

#### Cenários do builder num relance

| Cenário | Configuração | O que o builder emite |
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
- `Stream-Helper-DB-to-Creator.bat` inicia o DB watcher e transmite a base padrão do RSL Helper para o Sellfile Creator para facilitar a verificação das configs ao vivo.

## Agradecimentos

Muito obrigado a **[STBL] Nasgor** pelos contributos inestimáveis,  
a **[SP] Panda** pelos seus Sellfiles,  
a **KruYseN** pelos vídeos de limpeza de equipamento,  
e claro a **Farbstoff** pelo RSL Helper!

## Autor
Criado por [STBL] Nusi㊷  
Localização por Codex

© Nusi㊷ - 2026
