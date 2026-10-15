# Blog

![Blog homepage](public/img/home.png)

A small blogging engine built with Node.js, Express and MongoDB.

The public side lists posts with pagination, opens a single post and
searches by title and body. The admin side is password protected and
allows creating, editing and deleting posts.

Learning project, written to practise server-side rendering,
routing and authentication without a frontend framework.

## Stack

- Node.js, Express 5
- EJS with express-ejs-layouts
- MongoDB, Mongoose
- bcrypt for password hashing, JWT in an httpOnly cookie for auth

## Features

- Post list with pagination, single post page
- Search across post title and body
- Admin login, passwords stored as bcrypt hashes
- Create, edit and delete posts from the dashboard
- Custom 404 page and a central error handler

## Getting started

Requires Node.js 18+ and a running MongoDB instance (local or Atlas).

```bash
git clone <repository-url>
cd my-site
npm install
cp .env.example .env
npm run dev
```

The app starts on http://localhost:3000

### Environment variables

| Variable         | Description                             |
| ---------------- | --------------------------------------- |
| `MONGODB_URI`    | MongoDB connection string               |
| `JWT_SECRET`     | Secret used to sign auth tokens         |
| `SESSION_SECRET` | Secret used by the session middleware   |
| `PORT`           | Port to listen on (defaults to 3000)    |

### Creating the first admin

Registration is closed by design. Create the initial user once from a
throwaway script that hashes a password with bcrypt and inserts it
into the `users` collection, then delete the script.

## ModsHub Post Studio (`/modshub`)

A private tool for planning and preparing ModsHub posts: a publication
calendar (month / week / day / list), a Markdown editor with live preview,
and export to Markdown, plain text, JSON and PNG images. It prepares and
exports content only, nothing is published automatically.

- Opens at `/modshub` for signed-in admins (`/admin` login, then back to the Studio).
- Every account has its own calendar; data lives in MongoDB (`modshub_posts`,
  `modshub_settings`, `modshub_assets`). The browser only keeps unsaved drafts.
- Autosave with conflict detection, JSON / `.md` / `.txt` / `.zip` import,
  copy as Markdown, plain text or rich text, PNG export with slide splitting.

Source lives in `client/modshub` (React, bundled with esbuild) and
`server/modshub` (Express router, API, Mongoose store). The built bundle in
`public/modshub-studio` is committed, so production only needs
`npm install && npm start`. After changing anything in `client/`:

```bash
npm run build:modshub      # one-off build
npm run dev:modshub        # rebuild on change
npm test                   # unit + API tests (node:test)
npx playwright test        # browser tests (in-memory store, no MongoDB)
```

### Adding an admin user

Registration is closed. Create a user from your own terminal; the password
is typed at a hidden prompt and stored as a bcrypt hash:

```bash
node scripts/create-user.js <username>
node scripts/create-user.js <username> --reset   # change an existing password
```

## Scripts

| Command       | Description                     |
| ------------- | ------------------------------- |
| `npm run dev` | Start with nodemon, auto-reload |
| `npm start`   | Start with node                 |

## Project structure

```
app.js              entry point: middleware, view engine, routes
server/config       database connection
server/models       Mongoose schemas (Post, User)
server/routes       main.js for public pages, admin.js for the dashboard
views               EJS templates, layouts and partials
public              stylesheet, client script, images
```

## How it works

A request passes through the middleware chain in `app.js` (body parsing,
cookies, method override, static files), reaches a route, which queries
MongoDB through Mongoose and renders an EJS template. Templates are
wrapped by a layout that holds the shared header and footer.

Admin routes sit behind `authMiddleware`: it reads the JWT from the
cookie, verifies the signature and either passes the request on or
responds with 401. Errors from any route are forwarded with `next(error)`
to a single error handler at the bottom of `app.js`.
