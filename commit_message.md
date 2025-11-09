fix(checklist): Corrige bugs na exportação e validação do checklist

Este commit corrige dois bugs identificados na V2.4:

1.  **Correção da Validação do Checklist:**

    - A lógica em `saveAndValidateCurrentChecklistPdv` foi ajustada.
    - Anteriormente, ela exigia uma observação se o status _mudasse_ (ex: de "Atenção" para "Ok"), o que era incorreto.
    - Agora, a observação só é obrigatória se o _novo status selecionado_ **não** for "Ok" (ou seja, "Atenção" ou "Manutenção"), corrigindo o fluxo de trabalho do usuário.

2.  **Correção do "Copiar Texto" em HTTP:**
    - A API `navigator.clipboard.writeText` falha em conexões não seguras (HTTP), o que gerava um erro e exibia o toast "Falha ao copiar".
    - A função `handleCopyChecklistText` foi reescrita para incluir um _fallback_.
    - Ela agora tenta a API moderna primeiro e, se falhar, usa o método legado (`document.execCommand('copy')`), que funciona em HTTP, garantindo que a funcionalidade opere em ambientes de teste.

Refs: V2.5
