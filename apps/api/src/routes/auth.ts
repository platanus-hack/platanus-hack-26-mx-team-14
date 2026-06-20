import "../types.js";
import type { FastifyInstance } from "fastify";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db, users, credentials } from "@sat/db";
import { seal } from "@sat/shared";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derivedHash = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(derivedHash, Buffer.from(hash, "hex"));
}

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/register
  app.post<{
    Body: { name: string; email: string; password: string; rfc?: string; ciecPassword?: string };
  }>("/auth/register", async (req, reply) => {
    try {
      const { name, email, password, rfc, ciecPassword } = req.body;

      if (!name || !email || !password) {
        return reply.code(400).send({ error: "name, email y password son requeridos" });
      }
      if (password.length < 8) {
        return reply.code(400).send({ error: "La contraseña debe tener al menos 8 caracteres" });
      }

      const existing = await db().select().from(users).where(eq(users.email, email)).limit(1);
      if (existing.length > 0) {
        return reply.code(409).send({ error: "Ya existe una cuenta con ese correo" });
      }

      const passwordHash = await hashPassword(password);
      const inserted = await db()
        .insert(users)
        .values({ email, displayName: name, passwordHash })
        .returning();
      const user = inserted[0];
      if (!user) return reply.code(500).send({ error: "Error al crear usuario" });

      let credentialId: string | null = null;
      let finalRfc: string | null = null;

      if (rfc && rfc.length >= 12) {
        finalRfc = rfc.toUpperCase();
        let encPassword: string | null = null;
        if (ciecPassword) {
          try { encPassword = seal(ciecPassword); } catch { /* ENCRYPTION_KEY not set */ }
        }
        const credRows = await db()
          .insert(credentials)
          .values({ userId: user.id, rfc: finalRfc, kind: "ciec", encPassword })
          .returning();
        credentialId = credRows[0]?.id ?? null;
      }

      const token = app.jwt.sign(
        { userId: user.id, credentialId, rfc: finalRfc },
        { expiresIn: "7d" },
      );

      return reply.code(201).send({
        token,
        user: { id: user.id, email: user.email, displayName: user.displayName },
      });
    } catch (err) {
      app.log.error(err, "Error en registro de usuario");
      const message = err instanceof Error ? err.message : "Error desconocido al crear la cuenta";
      return reply.code(500).send({ error: message });
    }
  });

  // POST /auth/login
  app.post<{
    Body: { email: string; password: string };
  }>("/auth/login", async (req, reply) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return reply.code(400).send({ error: "email y password son requeridos" });
      }

      const userRows = await db().select().from(users).where(eq(users.email, email)).limit(1);
      const user = userRows[0];
      if (!user || !user.passwordHash) {
        return reply.code(401).send({ error: "Credenciales incorrectas" });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return reply.code(401).send({ error: "Credenciales incorrectas" });
      }

      const credRows = await db()
        .select()
        .from(credentials)
        .where(eq(credentials.userId, user.id))
        .limit(1);
      const cred = credRows[0];

      const token = app.jwt.sign(
        {
          userId: user.id,
          credentialId: cred?.id ?? null,
          rfc: cred?.rfc ?? null,
        },
        { expiresIn: "7d" },
      );

      return reply.send({
        token,
        user: { id: user.id, email: user.email, displayName: user.displayName },
      });
    } catch (err) {
      app.log.error(err, "Error en inicio de sesión");
      const message = err instanceof Error ? err.message : "Error desconocido al iniciar sesión";
      return reply.code(500).send({ error: message });
    }
  });

  // POST /credentials/efirma — connect SAT via e.firma (FIEL).
  // multipart: fields rfc + keyPassword, files cer (.cer) + key (.key).
  app.post("/credentials/efirma", { onRequest: [app.authenticate] }, async (req, reply) => {
    const { userId } = req.user;

    let rfc: string | null = null;
    let keyPassword: string | null = null;
    let cerBuf: Buffer | null = null;
    let keyBuf: Buffer | null = null;

    try {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          const buf = await part.toBuffer();
          if (part.fieldname === "cer") cerBuf = buf;
          else if (part.fieldname === "key") keyBuf = buf;
        } else if (part.fieldname === "rfc") {
          rfc = String(part.value);
        } else if (part.fieldname === "keyPassword") {
          keyPassword = String(part.value);
        }
      }
    } catch {
      return reply
        .code(400)
        .send({ error: "No se pudieron leer los archivos. Verifica el tamaño (máx. 1 MB)." });
    }

    if (!rfc || rfc.trim().length < 12) {
      return reply.code(400).send({ error: "RFC inválido (debe tener 12 o 13 caracteres)" });
    }
    if (!keyPassword) {
      return reply.code(400).send({ error: "La contraseña de la llave privada es requerida" });
    }
    if (!cerBuf || cerBuf.length === 0) {
      return reply.code(400).send({ error: "El certificado (.cer) es requerido" });
    }
    if (!keyBuf || keyBuf.length === 0) {
      return reply.code(400).send({ error: "La llave privada (.key) es requerida" });
    }

    const finalRfc = rfc.trim().toUpperCase();

    let encCer: string, encKey: string, encKeyPassword: string;
    try {
      encCer = seal(cerBuf);
      encKey = seal(keyBuf);
      encKeyPassword = seal(keyPassword);
    } catch {
      return reply
        .code(500)
        .send({ error: "No se pudo cifrar la credencial (ENCRYPTION_KEY no configurada)" });
    }

    const existing = await db()
      .select()
      .from(credentials)
      .where(eq(credentials.userId, userId))
      .limit(1);

    let credentialId: string | null;
    if (existing[0]) {
      const updated = await db()
        .update(credentials)
        .set({ rfc: finalRfc, kind: "efirma", encCer, encKey, encKeyPassword, encPassword: null })
        .where(eq(credentials.id, existing[0].id))
        .returning();
      credentialId = updated[0]?.id ?? existing[0].id;
    } else {
      const inserted = await db()
        .insert(credentials)
        .values({ userId, rfc: finalRfc, kind: "efirma", encCer, encKey, encKeyPassword })
        .returning();
      credentialId = inserted[0]?.id ?? null;
    }

    const token = app.jwt.sign({ userId, credentialId, rfc: finalRfc }, { expiresIn: "7d" });

    return reply.code(201).send({ token, credentialId, rfc: finalRfc });
  });

  // GET /auth/me
  app.get("/auth/me", { onRequest: [app.authenticate] }, async (req, reply) => {
    const { userId } = req.user;
    const userRows = await db().select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userRows[0];
    if (!user) return reply.code(404).send({ error: "Usuario no encontrado" });

    const credRows = await db()
      .select()
      .from(credentials)
      .where(eq(credentials.userId, user.id))
      .limit(1);
    const cred = credRows[0];

    return reply.send({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      credentialId: cred?.id ?? null,
      rfc: cred?.rfc ?? null,
    });
  });
}
