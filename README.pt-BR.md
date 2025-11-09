# RSL Helper Sellfile Creator

Crie, reveja e exporte regras de venda para o RSL Helper com uma interface simples.

> Ferramenta criada por fãs. Não tem ligação com a Plarium, Raid: Shadow Legends ou RSL Helper. Todas as marcas mencionadas pertencem aos respectivos proprietários.

## Funcionalidades
- Criar e salvar regras: construa configs e mantenha uma biblioteca reutilizável.
- Interruptor da Prévia do Sellfile: alterne entre a tabela `Rules` e a tabela `Rule Tester` direto no cabeçalho. Os contadores/badges mudam (Manter/Vender para regras, `Matched`/`No Match` para o tester) e os filtros acompanham a tabela escolhida.
- Arrastar e soltar ou botão “Load RSL Helper Sellfile”: solte `.hsfc`, `.hsf` ou `.db` em qualquer ponto (a sobreposição confirma) ou clique no botão. Ambos fazem exatamente a mesma coisa: `.hsfc` substitui o builder, `.hsf` adiciona o Sellfile base opcional e `.db` vai direto para a fila do Rule Tester sem tocar no builder/export.
- Meta-sets: agrupe conjuntos de equipamento (por exemplo, Velocidade + Percepção) e reutilize-os em várias regras.
- Exportação com um clique: gere um arquivo HSF (Sellfile do RSL Helper) pronto a carregar no RSL Helper.
- Prévia do Rule Tester + botão «Gear...»: crie equipamentos de exemplo, cole linhas ou arraste o banco de dados do RSL Helper (geralmente `%APPDATA%\RslHelper\Config`) para o diálogo. Depois feche-o e use o interruptor da prévia para manter as linhas do tester visíveis enquanto compara esses itens com as suas regras.

## Como utilizar

### Arquivo de configs
- HSFC (`.hsfc`): arquivo de projeto do aplicativo. Pense nele como um “save” que pode carregar ou compartilhar. O RSL Helper não lê HSFC diretamente.
- HSF (`.hsf`): o Sellfile consumido pelo RSL Helper. Exporte-o aqui e carregue-o depois no RSL Helper.
- O nome padrão ao salvar é `SellfileCreatorRules_AAAA MM DD_HHMM.hsfc`.

### Construtor de configs
- Preencha o Construtor de configs e atribua um nome claro à config.
- Clique em «Adicionar como nova config» para salvar. Depois selecione a config na lista abaixo do construtor para editá-la e confirme com «Atualizar config selecionada».
- Carregar/Salvar: use «Carregar configs» e «Salvar configs» para reutilizar as regras. Essas ações mantêm tudo o que é necessário para reconstruir a prévia.
- Nota: clique em «Adicionar nota…» (ou «Editar nota…») para anexar um texto ao arquivo de configs. Ao carregar um arquivo que contenha nota, ela é exibida automaticamente. Use `<!-- configs:1,0 -->` para inserir chips de configs específicas (0 pega a próxima). Use `<!-- configs-re:"speed" -->` para mostrar todas as configs cujo nome corresponde ao padrão (ignorando maiúsculas/minúsculas).

### Estrutura do construtor (de cima para baixo)
- Ação e Ativo: Defina o que acontece quando um item coincide.
  - `Manter` marca o item como Manter; o RSL Helper deixa-o intacto.
  - `Vender` marca o item como Vender; o RSL Helper coloca-o na fila de venda automática.
  - O interruptor «Ativado no Sellfile» decide se as linhas exportadas permanecem ativas. Configs desativadas exportam com Use = false (ficam riscadas na prévia); ative «Omitir regras desativadas ao exportar» no menu de exportação se quiser deixá-las de fora.
- Rank: Limite a regra a determinados ranks de estrelas caso queira tratar as peças de 6★ de forma diferente das de 5★. `Todos` mantém todos os ranks elegíveis.
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
- Facção: Restrinja regras de acessórios a uma facção específica ao montar uma equipe. Anéis, Amuletos e Estandartes respeitam o filtro; a armadura ignora a facção, então `Todos` é a escolha segura.
- Slots: Foque a regra em peças específicas (Arma, Botas, etc.) para impedir que itens fora do slot coincidam. Vazio = todos os slots.
- Sets e Meta-sets: Filtre para conjuntos específicos ou meta-sets nomeados quando quiser apenas essas combinações. Vazio = todos os sets.
- Mainstats: Defina quais os mainstats aceitos.
  - Pode selecionar vários; sem seleção = qualquer mainstat.
  - Ao escolher vários mainstats, o export gera uma linha por mainstat para manter tudo explícito.
- Substats: Indique quais contam.
  - Clique para ativar ou desativar um substat. Os bloqueados sempre aparecem nas linhas geradas.
  - Use o cadeado (🔒) ao lado do rótulo para tornar o stat obrigatório; o clique direito abre as ações rápidas de bloqueio e limites de rolagem.
  - `Any` redefine a seleção e significa «sem restrições». Ao escolher substats específicos, `Any` fica desativado.
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
- Abra o diálogo «Alvos de substats…» no canto superior direito do construtor.
- Os alvos são globais e afetam todas as configs.
- Esses alvos definem os limiares usados por intervalo de nível (0–3, 4–7, 8–11, 12–15, 16) e servem como fallback na grade de Alvos de rolagem.
- Use «Restaurar padrões» para voltar aos alvos recomendados.

### Meta-sets
- Clique em «Gerenciar meta-sets…» para abrir o diálogo.
- Crie ou renomeie meta-sets e escolha os sets que contêm. A interface usa a mesma pesquisa do seletor de sets.
- Existem meta-sets iniciais prontos a usar; pode editá-los ou removê-los.
- «Repor predefinições» oferece opções seguras quando um meta-set está em uso (remover, substituir por sets explícitos ou por outro meta-set).

### Venda final
- Interruptor ao lado de Exportar que ativa regras de venda para itens restantes. Vem ligado por padrão.
- Defina se deve abranger Artefatos e/ou Acessórios e quais os intervalos de nível (0–3, 4–7, 8–11, 12–15, 16). Por defeito é 0–15 para evitar vender peças +16.
- Sem venda final, o RSL Helper mantém tudo o que não coincide com uma regra. Só vende quando uma regra explícita diz Vender.
- Com venda final ativa, as regras geradas incluem todos os sets conhecidos. Na prévia surge «Todos os sets conhecidos» para reduzir ruído; o arquivo exportado lista os sets um a um.

### Gestão de configs
- As configs salvas aparecem como etiquetas sob o construtor. Clique para selecionar; clique direito para duplicar, mover, copiar ou eliminar.
- «Excluir todas as configs» remove todas (com confirmação).
- Ligação por hover: passar o cursor sobre uma etiqueta destaca as linhas associadas na prévia e vice-versa.
- Ligação por clique: clicar uma linha da tabela seleciona a config de origem (linhas da HSF base não alteram a seleção).
- Cópia alternativa: Se o acesso ao porta‑papéis falhar, um diálogo é aberto com o texto já selecionado para copiar manualmente.

### Prévia do Sellfile (Rules e Rule Tester)
- O cabeçalho da prévia mantém o interruptor «Rules»/«Rule Tester», o botão «Gear...» e o botão “Load RSL Helper Sellfile” juntos para saber sempre onde alternar de tabela ou abrir o diálogo do tester.
- Vista «Rules» (padrão): mostra todas as linhas que serão exportadas, incluindo quaisquer `.hsf` base opcionais. Os contadores permanecem em Manter vs Vender, a faixa de filtros mantém os chips Todos/Só (Any/Only) para Slot/Rank/Raridade/Nível e o botão «Configs» define se as etiquetas aparecem.
- Vista «Rule Tester»: muda a tabela para a lista de itens testados sem precisar reabrir o diálogo. Os contadores passam a `Matched` vs `No Match` (mais Manter/Vender) e a faixa de filtros troca para o filtro de resultado do tester e para o botão triestado de configs (`Off` → `First` → `Any`) para isolar peças cujo primeiro match pertence à seleção. Importar um `.db` alterna automaticamente para esta vista, mas pode voltar a «Rules» quando quiser.
- O botão “Load RSL Helper Sellfile” se comporta exatamente como o arrastar e soltar: `.hsfc` substitui o estado do builder, `.hsf` adiciona o Sellfile base opcional e `.db` envia itens para a prévia do tester sem tocar em configs nem na exportação. «Limpar» remove o `.hsf` base quando existir.
- O ícone da paleta abre Gerenciar Cores para personalizar texto e fundo dos substats.
- Na vista «Rules» a tabela continua a mostrar «Idx» e «Cfg» (linhas do arquivo base deixam «Cfg» em branco). Na vista «Rule Tester», o mesmo espaço lista slot/set, stats do item e o badge da primeira config correspondente para ver diretamente o que acontece a cada artefato.

### Controles da prévia
- Gerenciar cores: através do ícone da paleta; «Repor predefinições» restaura as recomendações.
- Filtros: na vista «Rules» há chips Todos/Ocultar/Só para Slots/Rank/Raridade/Nível e o botão «Configs» para mostrar/ocultar etiquetas. Em «Rule Tester» a faixa troca para os filtros Manter/Vender + `Matched`/`No Match` e para o botão triestado (`Off` → `First` → `Any`). «Repor filtros» devolve o controlo para `Off`.
- Menu de colunas (clique direito na cabeça da tabela):
  - Repor colunas: restaura colunas e larguras padrão.
  - Ajustar largura: adapta as colunas à janela.
  - Permitir linhas multilinha: ativa quebras de linha (útil para Substats).
  - Mostrar/Ocultar colunas: caixas individuais por coluna.
- Reordenar: arraste uma cabeça horizontalmente.
- Redimensionar: arraste o bordo direito da cabeça.
- Comportamento de clique: uma linha seleciona a config correspondente (sem deslocação automática). Clicar uma etiqueta de config desloca a tabela até à primeira linha associada.

### Prévia do Rule Tester
- Clique em «Gear...» no cabeçalho da prévia para abrir o diálogo do Rule Tester. Crie equipamento de exemplo ou cole linhas (JSON/texto). Os itens sincronizam imediatamente com a prévia, então fechar o diálogo não limpa a grade do tester.
- Importe o banco de dados do RSL Helper arrastando `.db` para a aplicação ou usando o botão “Load RSL Helper Sellfile” (mesmo comportamento). Esses imports enfileiram milhares de artefatos (incluindo inbox), mudam a prévia para a tabela do tester e deixam o builder/export intactos.
- Cada linha do tester mostra slot, set, nível, main stat, substats (com glifos e rolagens), a origem (inventário vs inbox) e os chips Keep/Sell + a primeira config/regra correspondente. Regras desativadas nunca fazem match, então `No Match` representa o que o Sellfile deixaria passar.
- Os contadores no cabeçalho passam para `Matched` vs `No Match` junto com o resumo Manter/Vender. Combine-os com os filtros do tester (resultado + botão `Off`/`First`/`Any`) para focar casos-limite antes de exportar.
- Use o interruptor da prévia para alternar entre as tabelas «Rules» e «Rule Tester» sem reabrir o diálogo — perfeito para comparar as linhas geradas com o item que disparou cada resultado.

### Exportar
- «Exportar Sellfile do RSL Helper combinada» aparece quando existe arquivo base; caso contrário verá «Exportar Sellfile do RSL Helper».
- Use «Salvar configs» e «Carregar configs» no construtor para salvar o trabalho.
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
- Monitorar o banco de dados do RSL Helper: execute `scripts/run-sample-server.ps1 -WatchGearDb` (ou informe `-GearDbPath <arquivo>`) para observar `%APPDATA%\\RslHelper\\Config`. Cada atualização da `.db` é enviada diretamente para o Rule Tester iniciado pelo script e, se houver vários arquivos, o utilitário pergunta qual acompanhar.
- Atalho de duplo clique: `Stream-Helper-DB-to-Creator.bat` inicia o servidor de exemplo no PowerShell com `-WatchGearDb "%APPDATA%\\RslHelper\\Config"`, transmitindo o banco padrão do RSL Helper sem abrir o console; adicione outros parâmetros depois do nome do `.bat` para ajustar a execução.

## Agradecimentos

Muito obrigado a **[STBL] Nasgor** pelas contribuições inestimáveis,  
a **[SP] Panda** pelos seus Sellfiles,  
a **[IPЯ] KruYseN** pelos vídeos de limpeza de equipamento,  
e claro a **Farbstoff** pelo RSL Helper!

## Autor
Criado por [STBL] Nusi㊷  
Localização por Codex

© Nusi㊷ - 2025
