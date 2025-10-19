# RSL Helper Sellfile Creator

Crea, revisa y exporta reglas de venta para RSL Helper con una interfaz sencilla.

> Herramienta creada por fans. No está afiliada a Plarium, Raid: Shadow Legends ni RSL Helper. Todas las marcas mencionadas pertenecen a sus dueños.

## Funciones
- Construir y guardar reglas: crea configuraciones y conserva una biblioteca reutilizable.
- Vista previa del Sellfile: revisa las reglas generadas, con o sin tu Sellfile actual.
- Vista previa con tu Sellfile (opcional): arrastra tu `.hsf` a la app para verla junto con tus reglas. También puedes soltar un archivo de configuraciones (`.hsfc`). La superposición confirma qué archivos se aceptan.
- Metasets: agrupa conjuntos de equipo (por ejemplo, Velocidad + Percepción) y reutilízalos en varias reglas.
- Exportación con un clic: genera un archivo HSF (Sellfile de RSL Helper) listo para cargar en RSL Helper.

## Cómo usarlo

### Archivo de configuraciones
- HSFC (`.hsfc`): archivo de proyecto para esta app. Piénsalo como una partida guardada que puedes cargar o compartir. RSL Helper no usa HSFC directamente.
- HSF (`.hsf`): el Sellfile que consume RSL Helper. Expórtalo desde la app y luego cárgalo dentro de RSL Helper.
- El nombre predeterminado al guardar es `SellfileCreatorRules_AAAA MM DD_HHMM.hsfc`.

### Configs Builder
- Completa el Configs Builder y da un nombre claro a tu configuración.
- Pulsa «Agregar como nueva config» para guardarla. Después selecciónala en la lista debajo del builder para editarla y guarda los cambios con «Actualizar config seleccionada».
- Cargar/Guardar: usa «Cargar configs» y «Guardar configs» para reutilizar tus reglas. Estas acciones guardan todo lo necesario para reconstruir la vista previa.
- Nota: pulsa «Agregar nota…» (o «Editar nota…») para adjuntar un texto al archivo de configuraciones. Al cargar un archivo que contiene nota, se mostrará automáticamente. Usa `<!-- configs:1,0 -->` para insertar chips de configs concretas (0 toma la siguiente config). Usa `<!-- configs-re:"speed" -->` para mostrar todas las configs cuyo nombre coincide con el patrón (sin distinguir mayúsculas/minúsculas).

### Diseño del builder (de arriba hacia abajo)
- Acción y Activado: Indica qué debe ocurrir cuando un objeto coincide con la configuración.
  - `Conservar` marca el objeto como Conservar; RSL Helper lo deja intacto.
  - `Vender` marca el objeto como Vender; RSL Helper lo pone en la cola de venta.
  - El interruptor «Activado en el Sellfile» decide si las filas exportadas siguen activas. Las configuraciones desactivadas se exportan igual, pero en RSL Helper aparecen tachadas y no actúan.
- Rango: Limita la regla a ciertos rangos de estrellas si quieres tratar las piezas de 6★ distinto a 5★. `Todos` deja todos los rangos válidos.
- Niveles: Elige Nivel mínimo y máximo entre los hitos +0, +4, +8, +12, +16. Solo se generan filas dentro de esa ventana.
- Rareza: `Auto` (recomendado) escoge la rareza más baja que sigue cumpliendo tus requisitos en los niveles seleccionados.
  - ¿Sin mínimos por stat ni suma global? Auto mantiene la regla amplia para que todas las rarezas sigan siendo válidas.
  - ¿Pides 1/2/3/4 substats iniciales? Auto garantiza que la rareza puede empezar con esa cantidad (1→≥ Poco común, 2→≥ Rara, 3→≥ Épica, 4→≥ Legendaria).
  - ¿Pides una suma de tiradas? Auto elige la rareza más baja que alcanza esa suma a +16 (5 tiradas requieren Mítica).
- Chip `Auto ≥` (debajo de Umbrales por hitos): eleva el piso y, si el modo es Tardío, añade ramas ≥ extra en +4/+8/+12.
    - Ciclo: Poco común → Raro → Épico. «Auto ≥ Raro» deja fuera Poco común.
    - Solo está activo cuando Rareza = Auto y Umbrales por hitos = Tardío. En caso contrario verás una barra diagonal.
    - Ejemplo: Estandarte con SPD y ATK%, donde ATK% necesita 2 tiradas. Rareza = Auto, Umbrales = Tardío, Auto ≥ Épico. Obtienes filas épicas en todos los niveles y ≥ Legendaria en +8 y +12, de modo que las piezas más raras siguen contando.
  - Antes de +16 el builder usa el número de substats que la rareza puede tener en ese momento. A +16 aplica tu objetivo completo.
- Facción: Restringe las reglas de accesorios a una facción concreta cuando construyes un equipo específico. Anillos, Amuletos y Estandartes respetan el filtro; la armadura lo ignora, así que `Todos` es la opción segura para ella.
- Ranuras: Centra la regla en piezas concretas (Arma, Botas, etc.) para evitar que coincidan objetos fuera de slot. Déjalo vacío para abarcar todas las ranuras.
- Sets y Metasets: Filtra por conjuntos concretos o metasets nombrados cuando solo quieres esas combinaciones. Vacío = todos los sets.
- Mainstats: Define qué mainstats son aceptables.
  - Se pueden seleccionar varios. Sin selección = cualquier mainstat.
  - Al elegir varios mainstats se genera una fila por mainstat para mantenerlas explícitas en la exportación.
- Substats: Indica qué substats importan.
  - Haz clic para activar o desactivar un substat. Los bloqueados siempre aparecen en las filas generadas.
  - Usa el candado (🔒) junto a la etiqueta para exigirlo; con clic derecho abres las opciones rápidas de bloqueo y límites de tiradas.
  - `Any` restablece la selección y significa «sin restricciones». Al elegir substats concretos, `Any` se desactiva.
  - Cada fila usa `max(Requeridos, bloqueados)` con un máximo de cuatro substats, así que un substat bloqueado siempre reserva hueco.
- Interruptor Flex: Si tienes más opciones que la cantidad requerida, Flex rota esas opciones por todas las permutaciones válidas para generar cada mezcla posible. Los bloqueados permanecen fijos y el interruptor se apaga solo cuando ya no hay nada que rotar.
- Indicador de tiradas: Cada substat seleccionado muestra un círculo para las mejoras.
  - Clic izquierdo aumenta la expectativa; derecho la reduce.
- Desde ★: Izquierda cambia a mínimo verde (0→1→…→5) y derecha a límite superior rojo (0→1→…→4).
- Con un límite superior rojo, izquierda reduce el máximo (1→0→★) y derecha lo aumenta (0→1→…→4→★). Mínimo y límite superior se excluyen mutuamente.
- Substats requeridos: Define cuántos substats seleccionados debe tener el objeto.
  - `Auto` mantiene la cuenta alineada con lo que eliges (hasta cuatro).
  - Los substats bloqueados (🔒) siempre cuentan y aparecen avisos cuando la combinación es imposible.
- Tiradas mínimas (global): Marca cuántas tiradas totales deben repartirse los substats seleccionados o bloqueados. `0` salta la comprobación agregada. Temprano muestra solo combinaciones que aún pueden alcanzar tu objetivo a +16.
- Umbrales por hitos: Controla cómo se aplican los mínimos por stat antes de +16 cuando pides tiradas mínimas.
  - `Temprano` sigue las tiradas que ya tienes en cada hito.
  - `Tardío` exige solo lo que debe existir ahora para que la meta de +16 siga siendo alcanzable.
  - El cambio solo importa si algún substat tiene Min > 0 o si la suma global es mayor que 0.

### Guía rápida de niveles y tiradas
- Umbrales tempranos: En cuanto tus requisitos se pueden cumplir, las filas dejan de cambiar. Antes de eso, Temprano muestra únicamente combinaciones viables.
- Suma de tiradas (Σ): Las tiradas mínimas se refieren a la suma total de tiradas en los substats seleccionados en el nivel objetivo.
- Comodines con suma mínima: Con solo substats ★ y una suma mínima > 0, Temprano muestra únicamente las divisiones mínimas por hito. Tardío repite esas divisiones en los niveles tempranos y de nuevo en +16.
- Mítico (5 tiradas): El equipo Mítico puede alcanzar cinco tiradas en un substat a +16 (el resto se queda en cuatro). Cuando las opciones incluyen Mítico, el generador deja constancia del roll extra desde +0.

### Valores de Substats (mínimos)
- Abre el diálogo mediante «Valores de substats…» en la esquina superior derecha del builder.
- Los valores son globales: afectan a todas las configuraciones.
- Estos valores definen las referencias por rango de nivel (0–3, 4–7, 8–11, 12–15, 16).

### Metasets
- Pulsa «Gestionar metasets…» para abrir el diálogo.
- Crea o renombra metasets y asigna los sets que contiene cada uno. La vista usa la misma búsqueda que el selector de sets.
- Se incluyen metasets iniciales para empezar rápido; puedes editarlos o eliminarlos.
- «Restablecer valores predeterminados» ofrece opciones seguras cuando un metaset está en uso (eliminar, sustituir por sets explícitos o por otro metaset).

### Venta final
- Interruptor junto al botón Exportar que añade reglas de venta para lo que no coincidió en otras configuraciones. Está activado por defecto.
- Decide si afecta a Artefactos y/o Accesorios y qué rangos de nivel (0–3, 4–7, 8–11, 12–15, 16). El valor por defecto cubre 0–15 para no vender piezas ya subidas a +16.
- Sin venta final, RSL Helper conserva todo lo que no coincide con una regla. Solo se vende si una regla explícita indica Vender.
- Con venta final activa, las reglas generadas incluyen todos los sets conocidos. En la vista previa se muestra «Todos los sets conocidos» para reducir ruido, pero el archivo exportado enumera cada set.

### Gestión de configuraciones
- Las configuraciones guardadas aparecen como chips debajo del builder. Haz clic para seleccionarlas, o clic derecho para duplicar, mover, copiar o borrar.
- «Delete Configs» elimina todas (con confirmación).
- Vínculo por hover: al pasar el cursor sobre un chip se iluminan las filas asociadas en la vista previa y viceversa.
- Vínculo por clic: al hacer clic en una fila de la tabla se selecciona la configuración de origen (las filas de la HSF base no cambian tu selección).
- Copia alternativa: Si el acceso al portapapeles falla, se abre un diálogo con el texto seleccionado para copiarlo manualmente.

### Vista previa del Sellfile (y archivo base opcional)
- Puedes combinar tus reglas con una `.hsf` existente.
  - Pulsa «Cargar Sellfile de RSL Helper» (o arrastra el archivo).
  - «Limpiar» elimina el archivo cargado.
- El icono de paleta abre el gestor de colores para personalizar texto y fondo de los substats.
- La tabla muestra todas las reglas que se exportarán. Las columnas «Idx» y «Cfg» indican qué configuración generó la fila; las que vienen del archivo base dejan «Cfg» vacío.

### Controles de la vista previa
- Gestionar colores: usa el icono de la paleta; «Restablecer valores predeterminados» recupera los recomendados.
- Menú de columnas (clic derecho en la cabecera):
  - Restablecer columnas: vuelve a los valores iniciales.
  - Ajustar anchura: adapta las columnas al ancho de la ventana.
  - Permitir filas multilínea: habilita el salto de línea (útil para Substats).
  - Mostrar/Ocultar columnas: casillas individuales por columna.
- Reordenar columnas: arrastra una cabecera horizontalmente.
- Redimensionar columnas: arrastra el borde derecho de la cabecera.
- Comportamiento de clic: una fila selecciona la configuración correspondiente (sin desplazamiento automático). Un clic en el chip de la configuración desplaza la tabla a la primera coincidencia.

### Exportar
- «Exportar Sellfile de RSL Helper combinada» aparece cuando hay archivo base; si no, verás «Exportar Sellfile de RSL Helper».
- Usa «Guardar configs» y «Cargar configs» en el builder para conservar tu trabajo.
- El nombre predeterminado del archivo exportado es `Sellfile_AAAA MM DD_HHMM.hsf`.

## Ejemplos

Todos los ejemplos usan mínimos de 6★ por unidad de tirada: SPD=5, CR%=5, CDMG%=5.

Temprano vs. Tardío
- Temprano: los umbrales reflejan las tiradas que ya llevas. Con ★ + suma mínima, solo muestra las divisiones mínimas en cada hito (lista estable). En otros casos enumera el progreso posible hasta que la condición se vuelve viable y luego se queda en los mínimos (a menos que una suma global exija más).
- Tardío: solo exige lo que debe existir ahora para que la meta de +16 siga posible. Con ★ + suma mínima repite esas divisiones en los primeros hitos y otra vez en +16. Con mínimos por stat emite los límites inferiores necesarios en cada nivel.

Ejemplo: Temprano (2 substats) — SPD mín=2, CR% mín=1 (niveles 0..16)
- +0: SPD ≥ 5, CR ≥ 5
- +4: [10,5] y [5,10]
- +8: [15,5], [10,10], [5,15]
- +12/+16: [15,10]

Ejemplo: Tardío (2 substats) — SPD mín=2, CR% mín=1 (niveles 0..16)
- +0/+4: [5,5]
- +8: [10,5] o [5,10]
- +12: [15,5] o [10,10]
- +16: [15,10]

Ejemplo: Temprano (3 substats) — SPD mín=2, CR% mín=1, CDMG% libre, Requeridos=3
- +0: [SPD, CR, CDMG] ≥ [5,5,5]
- +4: divisiones de una tirada: [10,5,5], [5,10,5], [5,5,10]
- +8: divisiones de dos tiradas (respetando límites superiores)
- +12/+16: [15,10,5]

Ejemplo: Tardío (3 substats) — SPD mín=2, CR% mín=1, CDMG% libre, Requeridos=3
- +0/+4: [5,5,5]
- +8: [10,5,5] o [5,10,5]
- +12: [15,5,5] o [10,10,5]
- +16: [15,10,5]

Consejo: Usa límites superiores de tiradas para prohibir mejoras en un stat. Desde ★ haz clic derecho, elige límite superior y ponlo en 0. Así CDMG% se queda base mientras SPD/CR reciben las tiradas.

Ejemplo: Bloquear uno y exigir dos
- Substats: SPD, HP, ATK. Pulsa SPD y luego el candado (🔒) para bloquearlo.
- Substats requeridos = 2.
- Resultado: aparecen SPD+HP y SPD+ATK. HP+ATK sin SPD nunca se genera (lo bloqueado siempre cuenta).

Ejemplo: Focalizar tiradas en 3 stats y bloquear el 4.º
- Objetivo: Conservar piezas con SPD, CR%, CDMG% y uno de HP%/ATK%/DEF%, pero sin tiradas en ese cuarto stat.
- Substats seleccionados: SPD, CR%, CDMG%, HP%, ATK%, DEF%.
- Substats requeridos = 4.
- Indicadores:
  - Desde ★, clic izquierdo (mínimos): pon SPD/CR%/CDMG% en los mínimos deseados (p. ej. 1 cada uno).
  - Desde ★, clic derecho (límite superior): fija HP%/ATK%/DEF% en límite superior 0.
- Resultado: el cuarto substat rota entre los tres, pero no recibe tiradas; SPD/CR%/CDMG% acumulan las mejoras.

Ejemplo: Temprano con comodín (solo seleccionados)
- Substats: SPD y ACC.
- Indicadores: SPD mín = 2; ACC = ★.
- Substats requeridos: Auto (2).
- Niveles: +0 a +16.
- Efecto: Temprano muestra piezas que pueden llegar a SPD(2) en +16 (filas donde SPD o ACC ha recibido tirada). En cuanto son posibles dos tiradas en SPD, aparece la fila mínima.

Ejemplo: Suma de tiradas con comodines (2 substats)
- Substats: SPD y ACC, ambos en ★.
- Substats requeridos: 2. Tiradas mínimas: 1.
- Temprano:
  - +4/+8/+12/+16: dos filas — SPD ≥ 10, ACC ≥ 9 y SPD ≥ 5, ACC ≥ 18 (repartos mínimos; lista estable).
- Tardío:
  - +0/+4/+8/+12: filas base (no se pide extra todavía); +16: las dos filas anteriores. Con mínimos más altos, Tardío fuerza las divisiones necesarias en los hitos adecuados (por ejemplo, con mínimo 2, +12 muestra divisiones de una tirada y +16 las de dos).

## Notas para colaboradores

- Traducciones: Los paquetes de lanzamiento incluyen plantillas de localización en `i18n/` (p. ej., `i18n/es-ES.l10n.json`).
- Editar y probar: Abre la app y arrastra tu `*.l10n.json` editado para aplicarlo de inmediato en la sesión actual (no se necesita ni se puede instalar nada).
- Enviar correcciones: Envía el JSON actualizado por mensaje de Discord. Mantén las claves sin cambios; las claves que falten volverán al inglés.
- Idiomas integrados: Todos los idiomas incluidos se compilan en el único HTML, por lo que la app funciona completamente sin conexión. Tus correcciones se integrarán en la siguiente versión.

## Agradecimientos

Muchas gracias a [STBL] Nasgor por sus aportes invaluables,  
y gracias también a Farbstoff por RSL Helper.

## Autoría
Hecho por [STBL] Nusi㊷  
Localización de Codex
