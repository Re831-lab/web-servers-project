import express, { Request, Response, NextFunction } from "express";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "./config.js";
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from "./errors.js";
import {
  createUser,
  deleteAllUsers,
  getUserByEmail,
  updateUser,
  upgradeUserToChirpyRed,
} from "./db/queries/users.js";
import {
  createChirp,
  getAllChirps,
  getChirpById,
  deleteChirp,
} from "./db/queries/chirps.js";
import { NewUser, NewChirp } from "./db/schema.js";
import {
  hashPassword,
  checkPasswordHash,
  makeJWT,
  validateJWT,
  getBearerToken,
  getAPIKey,
} from "./auth.js";

const migrationClient = postgres(config.db.url, { max: 1 });
await migrate(drizzle(migrationClient), config.db.migrationConfig);

const app = express();
const PORT = 8080;

app.use(express.json());

function middlewareLogResponses(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    const statusCode = res.statusCode;
    if (statusCode < 200 || statusCode >= 300) {
      console.log(`[NON-OK] ${req.method} ${req.url} - Status: ${statusCode}`);
    }
  });
  next();
}

function middlewareMetricsInc(req: Request, res: Response, next: NextFunction) {
  config.api.fileserverHits++;
  next();
}

function handlerMetrics(req: Request, res: Response) {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<html>
  <body>
    <h1>Welcome, Chirpy Admin</h1>
    <p>Chirpy has been visited ${config.api.fileserverHits} times!</p>
  </body>
</html>`);
}

async function handlerReset(req: Request, res: Response) {
  if (config.api.platform !== "dev") {
    throw new ForbiddenError("Reset is only allowed in dev environment");
  }
  config.api.fileserverHits = 0;
  await deleteAllUsers();
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send("Hits reset to 0 and all users deleted");
}

function handlerReadiness(req: Request, res: Response) {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send("OK");
}

function cleanBody(body: string): string {
  const profaneWords = ["kerfuffle", "sharbert", "fornax"];
  const words = body.split(" ");
  const cleanedWords = words.map((word) => {
    if (profaneWords.includes(word.toLowerCase())) {
      return "****";
    }
    return word;
  });
  return cleanedWords.join(" ");
}

type CreateUserRequestBody = {
  email: string;
  password: string;
};

async function handlerCreateUser(req: Request, res: Response) {
  const params: CreateUserRequestBody = req.body;

  const hashedPassword = await hashPassword(params.password);

  const newUser: NewUser = {
    email: params.email,
    hashedPassword: hashedPassword,
  };

  const user = await createUser(newUser);

  res.header("Content-Type", "application/json");
  res.status(201).send(
    JSON.stringify({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isChirpyRed: user.isChirpyRed,
    }),
  );
}

type UpdateUserRequestBody = {
  email: string;
  password: string;
};

async function handlerUpdateUser(req: Request, res: Response) {
  let userId: string;
  try {
    const token = getBearerToken(req);
    userId = validateJWT(token, config.api.jwtSecret);
  } catch (err) {
    throw new UnauthorizedError("Access token is invalid or missing");
  }

  const params: UpdateUserRequestBody = req.body;
  const hashedPassword = await hashPassword(params.password);

  const user = await updateUser(userId, params.email, hashedPassword);

  res.header("Content-Type", "application/json");
  res.status(200).send(
    JSON.stringify({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isChirpyRed: user.isChirpyRed,
    }),
  );
}

type LoginRequestBody = {
  email: string;
  password: string;
};

async function handlerLogin(req: Request, res: Response) {
  const params: LoginRequestBody = req.body;

  try {
    const user = await getUserByEmail(params.email);
    if (!user) {
      throw new UnauthorizedError("incorrect email or password");
    }

    const passwordMatches = await checkPasswordHash(
      params.password,
      user.hashedPassword,
    );

    if (!passwordMatches) {
      throw new UnauthorizedError("incorrect email or password");
    }

    const oneHour = 3600;
    const token = makeJWT(user.id, oneHour, config.api.jwtSecret);

    res.header("Content-Type", "application/json");
    res.status(200).send(
      JSON.stringify({
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        isChirpyRed: user.isChirpyRed,
        token: token,
      }),
    );
  } catch (err) {
    throw new UnauthorizedError("incorrect email or password");
  }
}

type CreateChirpRequestBody = {
  body: string;
};

async function handlerCreateChirp(req: Request, res: Response) {
  let userId: string;
  try {
    const token = getBearerToken(req);
    userId = validateJWT(token, config.api.jwtSecret);
  } catch (err) {
    throw new UnauthorizedError("Access token is invalid or missing");
  }

  const params: CreateChirpRequestBody = req.body;

  const maxChirpLength = 140;
  if (params.body.length > maxChirpLength) {
    throw new BadRequestError("Chirp is too long. Max length is 140");
  }

  const cleanedBody = cleanBody(params.body);

  const newChirp: NewChirp = {
    body: cleanedBody,
    userId: userId,
  };

  const chirp = await createChirp(newChirp);

  res.header("Content-Type", "application/json");
  res.status(201).send(
    JSON.stringify({
      id: chirp.id,
      createdAt: chirp.createdAt,
      updatedAt: chirp.updatedAt,
      body: chirp.body,
      userId: chirp.userId,
    }),
  );
}

async function handlerGetAllChirps(req: Request, res: Response) {
  let authorId = "";
  const authorIdQuery = req.query.authorId;
  if (typeof authorIdQuery === "string") {
    authorId = authorIdQuery;
  }

  let sortOrder = "asc";
  const sortQuery = req.query.sort;
  if (typeof sortQuery === "string" && sortQuery === "desc") {
    sortOrder = "desc";
  }

  let chirpsList = await getAllChirps(authorId || undefined);

  if (sortOrder === "desc") {
    chirpsList = chirpsList.reverse();
  }

  const response = chirpsList.map((chirp) => ({
    id: chirp.id,
    createdAt: chirp.createdAt,
    updatedAt: chirp.updatedAt,
    body: chirp.body,
    userId: chirp.userId,
  }));

  res.header("Content-Type", "application/json");
  res.status(200).send(JSON.stringify(response));
}

async function handlerGetChirp(req: Request, res: Response) {
  const chirpId = req.params.chirpId as string;

  const chirp = await getChirpById(chirpId);

  if (!chirp) {
    throw new NotFoundError("Chirp not found");
  }

  res.header("Content-Type", "application/json");
  res.status(200).send(
    JSON.stringify({
      id: chirp.id,
      createdAt: chirp.createdAt,
      updatedAt: chirp.updatedAt,
      body: chirp.body,
      userId: chirp.userId,
    }),
  );
}

async function handlerDeleteChirp(req: Request, res: Response) {
  let userId: string;
  try {
    const token = getBearerToken(req);
    userId = validateJWT(token, config.api.jwtSecret);
  } catch (err) {
    throw new UnauthorizedError("Access token is invalid or missing");
  }

  const chirpId = req.params.chirpId as string;

  const chirp = await getChirpById(chirpId);
  if (!chirp) {
    throw new NotFoundError("Chirp not found");
  }

  if (chirp.userId !== userId) {
    throw new ForbiddenError("You are not the author of this chirp");
  }

  await deleteChirp(chirpId);

  res.status(204).send();
}

type PolkaWebhookRequestBody = {
  event: string;
  data: {
    userId: string;
  };
};

async function handlerPolkaWebhook(req: Request, res: Response) {
  let apiKey: string;
  try {
    apiKey = getAPIKey(req);
  } catch (err) {
    throw new UnauthorizedError("API key is invalid or missing");
  }

  if (apiKey !== config.api.polkaKey) {
    throw new UnauthorizedError("API key is invalid or missing");
  }

  const params: PolkaWebhookRequestBody = req.body;

  if (params.event !== "user.upgraded") {
    res.status(204).send();
    return;
  }

  const user = await upgradeUserToChirpyRed(params.data.userId);

  if (!user) {
    throw new NotFoundError("User not found");
  }

  res.status(204).send();
}

function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  console.log(err.message);

  if (err instanceof BadRequestError) {
    res.status(400).json({ error: err.message });
  } else if (err instanceof UnauthorizedError) {
    res.status(401).json({ error: err.message });
  } else if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message });
  } else if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
  } else {
    res.status(500).json({ error: "Something went wrong on our end" });
  }
}

app.use(middlewareLogResponses);
app.use("/app", middlewareMetricsInc, express.static("./src/app"));

app.get("/api/healthz", handlerReadiness);
app.post("/api/users", handlerCreateUser);
app.put("/api/users", handlerUpdateUser);
app.post("/api/login", handlerLogin);
app.post("/api/chirps", handlerCreateChirp);
app.get("/api/chirps", handlerGetAllChirps);
app.get("/api/chirps/:chirpId", handlerGetChirp);
app.delete("/api/chirps/:chirpId", handlerDeleteChirp);
app.post("/api/polka/webhooks", handlerPolkaWebhook);
app.get("/admin/metrics", handlerMetrics);
app.post("/admin/reset", handlerReset);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
