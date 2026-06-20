# Brisk Camel — Voice-native SAT for Mexico

> Track:  **New Interfaces** · Platanus Hack 26 CDMX · team-14

A new way to interact with Mexico's tax authority (**SAT**). You make a call (or
speak), and an AI assistant — grounded in **your real SAT data** — issues
invoices, pulls your emitted/received invoices, fetches your *Constancia de
Situación Fiscal* (CSF), and renders a UI tailored to your *régimen fiscal* that
shows only what you actually need.

Under the hood, an event-driven backend drives a resilient SAT **scraper**
(codename **Brisk Camel**), persists every scraper response, vectorizes it, and
serves a **RAG client** that gives you reminders and recommendations based on
your particular fiscal situation.

```
 Voice (ElevenLabs / Whisper)
        │  "Emíteme una factura a Acme por 10,000 + IVA"
        ▼
 Claude agent  ──tool call──▶  Event bus  ──▶  Brisk Camel (Playwright)  ──▶  SAT portals
        ▲                          │                     │
        │                          ▼                     ▼
   RAG client  ◀── pgvector ◀── normalize + embed ◀── scraper result (success/err)
        │
        ▼
 Dynamic UI (régimen-aware) + voice reply
```

## The three deliverables

| # | Doc | What it answers |
|---|-----|-----------------|
| 1 | [01-plan.md](./01-plan.md) | The plan — phases, milestones, hackathon scope, demo path |
| 2 | [02-tech-stack.md](./02-tech-stack.md) | The stack, chosen *ad hoc* to our needs, with rationale |
| 3 | [04-skills.md](./04-skills.md) | The assistant's skills (agent tools) — schemas + scraper flows |

## Supporting docs

- [03-architecture.md](./03-architecture.md) — event-driven architecture, resilience, components
- [05-data-and-rag.md](./05-data-and-rag.md) — data model, vectorization, RAG client
- [06-events.md](./06-events.md) — event catalog and contracts
- [07-security.md](./07-security.md) — credential handling, e.firma, captcha, compliance
- [08-scraper-decision.md](./08-scraper-decision.md) — Firecrawl `/interact` vs. Playwright (decision record)

## Principles

1. **Real data, smooth surface.** The UI is intuitive; the source of truth is the
   actual SAT, scraped live.
2. **Event-driven.** Every assistant action is an event; every scraper response
   is persisted and replayable.
3. **Resilient.** Captchas, timeouts, and SAT outages are expected, not
   exceptional — retries, dead-letter queues, and idempotency are first-class.
4. **Grounded AI.** The agent acts through typed tools; the RAG client cites real
   stored documents, never hallucinated tax advice.
