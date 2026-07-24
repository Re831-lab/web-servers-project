import argon2 from "argon2";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import type { Request } from "express";
import { randomBytes } from "crypto";

export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password);
}

export async function checkPasswordHash(
  password: string,
  hash: string,
): Promise<boolean> {
  return await argon2.verify(hash, password);
}

type payload = Pick<JwtPayload, "iss" | "sub" | "iat" | "exp">;

export function makeJWT(
  userID: string,
  expiresIn: number,
  secret: string,
): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const p: payload = {
    iss: "chirpy",
    sub: userID,
    iat: issuedAt,
    exp: issuedAt + expiresIn,
  };
  return jwt.sign(p, secret);
}

export function validateJWT(tokenString: string, secret: string): string {
  let decoded: payload;
  try {
    decoded = jwt.verify(tokenString, secret) as JwtPayload;
  } catch (err) {
    throw new Error("Invalid or expired token");
  }

  if (!decoded.sub) {
    throw new Error("Invalid token: no subject found");
  }

  return decoded.sub;
}

export function getBearerToken(req: Request): string {
  const authHeader = req.get("Authorization");
  if (!authHeader) {
    throw new Error("Authorization header not found");
  }

  const token = authHeader.replace("Bearer", "").trim();
  if (!token) {
    throw new Error("Bearer token not found");
  }

  return token;
}

export function makeRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function getAPIKey(req: Request): string {
  const authHeader = req.get("Authorization");
  if (!authHeader) {
    throw new Error("Authorization header not found");
  }

  const apiKey = authHeader.replace("ApiKey", "").trim();
  if (!apiKey) {
    throw new Error("API key not found");
  }

  return apiKey;
}
