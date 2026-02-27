# TrackMyLife Alexa Skill

Repositorio de la skill de Alexa.

## Estructura

- `skill-package/skill.json`: manifiesto de la skill
- `skill-package/interactionModels/`: modelo de interacción
- `lambda/`: código backend de la skill

## Configuración local

1. Copiar `.env.example` a `.env`.
2. Definir `WEBHOOK_URL` apuntando a tu dashboard.
3. Instalar dependencias en `lambda/`:
   - `cd lambda && npm install`
