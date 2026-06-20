import type { FastifyInstance } from "fastify";
import { makeAnthropic } from "@sat/agent";
import { env } from "@sat/shared";

const SAT_EXPERT_PROMPT = `Eres SATI, un asistente fiscal virtual experto en el SAT de México. Estás en la demo pública de SATI.

En esta demo NO tienes acceso a datos fiscales reales del usuario. Si preguntan por sus facturas, declaraciones o datos concretos del SAT, invítalos amablemente a crear una cuenta gratuita en SATI para conectarse con el SAT real.

Puedes responder con conocimiento general sobre:
- Regímenes fiscales: RESICO, Actividad Empresarial, Personas Morales, asalariados, arrendamiento
- CFDI y facturas: tipos (ingreso, gasto, traslado, nómina), cancelaciones, complementos
- Impuestos: IVA 16%, ISR, retenciones, PTU, pagos provisionales
- Fechas clave: declaraciones mensuales (día 17), declaración anual (abril PF, marzo PM), DIOT
- Trámites SAT: RFC, e.firma, buzón tributario, CSF, cambios de régimen
- Multas, EFOS, listas negras, auditorías y actos de fiscalización

Responde en español mexicano, tono amigable y profesional. TU RESPUESTA SE CONVIERTE A VOZ: máximo 2 oraciones cortas y directas, sin listas ni markdown ni caracteres especiales.`;

type OpenAIMessage = { role: "user" | "assistant" | "system"; content: string };

/**
 * Custom LLM endpoint compatible con VAPI.
 * VAPI lo llama como si fuera OpenAI: POST /public/voice/llm
 * con el historial de mensajes y espera una respuesta en formato OpenAI.
 */
export async function publicLlmRoutes(app: FastifyInstance) {
  const anthropic = env.ANTHROPIC_API_KEY ? makeAnthropic(env.ANTHROPIC_API_KEY) : null;

  app.post<{ Body: { messages: OpenAIMessage[]; stream?: boolean } }>(
    "/public/voice/llm",
    async (req, reply) => {
      if (!anthropic) {
        return reply.code(503).send({ error: "IA no disponible" });
      }

      const { messages = [], stream = false } = req.body;

      // Filtra el system message que VAPI puede mandar y queda solo con user/assistant
      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      if (stream) {
        reply
          .header("Content-Type", "text/event-stream; charset=utf-8")
          .header("Cache-Control", "no-cache")
          .header("Connection", "keep-alive");

        const claudeStream = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 120,
          system: SAT_EXPERT_PROMPT,
          messages: history,
          stream: true,
        });

        let text = "";
        const send = (data: object) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);

        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            // Formato OpenAI streaming que VAPI espera
            send({
              choices: [{ delta: { content: event.delta.text, role: "assistant" }, index: 0 }],
            });
          }
        }

        send({ choices: [{ delta: {}, finish_reason: "stop", index: 0 }] });
        reply.raw.write("data: [DONE]\n\n");
        reply.raw.end();
        return;
      }

      // Non-streaming
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 120,
        system: SAT_EXPERT_PROMPT,
        messages: history,
      });

      const block = response.content.find((c) => c.type === "text");
      const text = block && "text" in block ? block.text : "No pude procesar tu pregunta.";

      // Formato OpenAI que VAPI espera
      return reply.send({
        choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop", index: 0 }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    },
  );
}
