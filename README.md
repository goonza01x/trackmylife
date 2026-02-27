# TrackMyLife Alexa Skill

Repositorio de la skill de Alexa.

## Estructura

- `skill.json`: manifiesto de la skill
- `lambda/`: código backend de la skill
- `interactionModels/`: modelo de interacción

## Configuración local

1. Copiar `.env.example` a `.env`.
2. Definir `WEBHOOK_URL` apuntando a tu dashboard.
3. Instalar dependencias en `lambda/`:
   - `cd lambda && npm install`

