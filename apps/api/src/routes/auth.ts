import "../types.js";
import type { FastifyInstance } from "fastify";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db, users, credentials } from "@sat/db";
import { seal } from "@sat/shared";

const scryptAsync = promisify(scrypt);

async function generateIdentificationCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const num = (randomBytes(3).readUIntBE(0, 3) % 900000) + 100000;
    const code = num.toString();
    const existing = await db().select().from(users).where(eq(users.identificationCode, code)).limit(1);
    if (existing.length === 0) return code;
  }
  throw new Error("No se pudo generar un código único");
}

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
    const identificationCode = await generateIdentificationCode();
    const inserted = await db()
      .insert(users)
      .values({ email, displayName: name, passwordHash, identificationCode })
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
      user: { id: user.id, email: user.email, displayName: user.displayName, identificationCode: user.identificationCode },
    });
  });

  // POST /auth/login
  app.post<{
    Body: { email: string; password: string };
  }>("/auth/login", async (req, reply) => {
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
      user: { id: user.id, email: user.email, displayName: user.displayName, identificationCode: user.identificationCode },
    });
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
      identificationCode: user.identificationCode,
      credentialId: cred?.id ?? null,
      rfc: cred?.rfc ?? null,
    });
  });
}
