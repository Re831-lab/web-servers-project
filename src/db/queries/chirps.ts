import { asc, eq } from "drizzle-orm";
import { db } from "../index.js";
import { NewChirp, chirps } from "../schema.js";

export async function createChirp(chirp: NewChirp) {
  const [result] = await db.insert(chirps).values(chirp).returning();
  return result;
}

export async function getAllChirps(authorId?: string) {
  if (authorId) {
    const result = await db
      .select()
      .from(chirps)
      .where(eq(chirps.userId, authorId))
      .orderBy(asc(chirps.createdAt));
    return result;
  }

  const result = await db
    .select()
    .from(chirps)
    .orderBy(asc(chirps.createdAt));
  return result;
}

export async function getChirpById(chirpId: string) {
  const [result] = await db
    .select()
    .from(chirps)
    .where(eq(chirps.id, chirpId));
  return result;
}

export async function deleteChirp(chirpId: string) {
  await db.delete(chirps).where(eq(chirps.id, chirpId));
}
