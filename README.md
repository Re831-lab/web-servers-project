# Chirpy

A Twitter-like REST API built with TypeScript, Express, and PostgreSQL. Built while learning backend development on [Boot.dev](https://www.boot.dev).

## Features

- User auth (hashed passwords, JWT access + refresh tokens)
- CRUD for chirps, with sorting and filtering
- Authorization (users only edit/delete their own data)
- Webhooks with API key verification
- PostgreSQL + Drizzle ORM

## Getting Started

```bash
npm install
npx drizzle-kit migrate
npm run dev
```

Requires a `.env` file with `DB_URL`, `PLATFORM`, `JWT_SECRET`, and `POLKA_KEY`.

Server runs on `http://localhost:8080`.
