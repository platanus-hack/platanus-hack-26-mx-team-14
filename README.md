# SATI — Tu agente fiscal, por voz

**Track:** 👁️ New Interfaces · Platanus Hack 26 CDMX · team-14

<img src="./project-logo.png" alt="SATI Logo" width="200" />

Interactuar con el SAT es una pesadilla: captchas, portales rotos, flujos opacos y una interfaz diferente por régimen fiscal. Hoy tienes que hacerlo a mano o pagarle a un contador.

**SATI** cambia eso. Hablas — SATI ejecuta.

## ¿Qué hace?

Conectado a tu portal del SAT real vía **e.firma** (.cer + .key), en una sola conversación de voz puedes:

- 📄 **Consultar facturas emitidas y recibidas** por fecha o período
- 🪪 **Descargar tu Constancia de Situación Fiscal** (CSF/PDF) con extracción de campos
- 🔍 **Recibir recomendaciones fiscales** basadas en tus datos reales (RAG sobre tus documentos)
- 🧾 **Emitir una factura CFDI** con confirmación explícita antes de enviarla

## ¿Cómo funciona?

```
Voz (ElevenLabs / Whisper)
       │
       ▼
 Agente Claude  ──▶  Event bus  ──▶  Brisk Camel (Playwright)  ──▶  Portales SAT
       ▲                                      │
       │                                      ▼
  RAG client  ◀── pgvector ◀── normaliza + embeds documentos
       │
       ▼
 UI dinámica por régimen + respuesta de voz
```

El scraper **Brisk Camel** (Playwright) resuelve captchas con Claude Vision, maneja timeouts y reintenta automáticamente. Cada respuesta del SAT se persiste, vectoriza y alimenta al cliente RAG.

## Stack

| Capa | Tecnología |
|------|-----------|
| Agente | Claude claude-sonnet-4-6 con herramientas tipadas |
| Voz | ElevenLabs Conversational AI + Whisper STT |
| Scraper | Playwright + Claude Vision para captchas |
| Base de datos | PostgreSQL + pgvector |
| Cola | BullMQ (Redis) |
| Frontend | React + Vite, UI adaptativa por régimen fiscal |

## Equipo

- Yue Wang ([@missmathwizz](https://github.com/missmathwizz))
- Andrick Daniel Ramos Ortega ([@0xadanteees](https://github.com/0xadanteees))
- Roberto Quintana Ramírez ([@rrquintana](https://github.com/rrquintana))
- Eduardo Varela Hernandez ([@eduardovarela0144](https://github.com/eduardovarela0144))
- Diego Larrieta ([@DiegoLarrieta](https://github.com/DiegoLarrieta))

## Deploy

```bash
# Frontend
cd web && npm install && npm run dev

# Backend
cd api && npm install && npm run dev
```
