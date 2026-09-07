# SendResQPls — Backend API

![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma&logoColor=white)
![Render](https://img.shields.io/badge/Hosted_on-Render-46E3B7?logo=render&logoColor=white)

> **Production base URL:** `https://sendresqpls.onrender.com`

---

## Overview

`SendResQPls-backend` is the live REST API powering the **SendResQPls** disaster-response platform. It handles citizen account management, real-time incident reporting and dispatch coordination, AI-assisted hazard classification, push and email notifications, and media uploads — all secured behind JWT authentication, OTP verification, rate limiting, and security hardening via Helmet.

---

## Features

| Feature | Details |
|---|---|
| **Auth** | JWT access tokens · OTP email verification · password reset via email |
| **Incident Reporting** | Create, view, update, and delete incident reports with status workflow |
| **Incident Locking** | Real-time lock / heartbeat / unlock / force-unlock to prevent double-dispatch |
| **AI Classification** | Automatic hazard-type tagging via Google Gemini (`@google/generative-ai`) |
| **Push Notifications** | Firebase Cloud Messaging via `firebase-admin` |
| **Email Notifications** | Status update emails to reporters via Brevo (HTTP + `axios`) |
| **Image Uploads** | Cloudinary + Multer for incident media |
| **Job Queues** | Background tasks with BullMQ + ioredis |
| **Department Management** | BFP · PNP · Medical · Engineering · MDRRMO Rescue |
| **Admin Management** | Create, deactivate, and delete responder accounts |
| **Activity Logging** | Resolution form submission and audit trail |
| **Security** | `helmet` security headers · `express-rate-limit` · bcrypt password hashing |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| Framework | Express 5 |
| ORM | Prisma |
| Database | PostgreSQL (Supabase) |
| Cache / Queue | Redis (BullMQ + ioredis) |
| Auth | JWT + bcrypt |
| Push | Firebase Admin SDK |
| Email | Brevo API via Axios |
| AI | Google Gemini (`@google/generative-ai`) |
| Media | Cloudinary + Multer |
| Hosting | Render (auto-deploy from GitHub) |

---

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- A running **PostgreSQL** instance (Supabase recommended)
- A running **Redis** instance (Upstash or local)
- Firebase service account JSON file
- Accounts / API keys for: Brevo · Cloudinary · Google AI Studio

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/<your-org>/SendResQPls-backend.git
cd SendResQPls-backend

# 2. Install dependencies
npm install

# 3. Copy and fill in environment variables
cp .env.example .env
```

---

## Environment Variables

Create a `.env` file at the project root with the following keys:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `JWT_SECRET` | Secret used to sign and verify JWT tokens |
| `BREVO_API_KEY` | Brevo transactional email API key |
| `SYSTEM_EMAIL` | Sender email address for outgoing notifications |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to Firebase service account JSON file |
| `REDIS_URL` | Redis connection URL (used by BullMQ) |

> **Never commit `.env` or the Firebase service account JSON to version control.**

---

## API Overview

### Auth — `/api/auth`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new citizen account |
| `POST` | `/api/auth/login` | Authenticate and receive a JWT |
| `POST` | `/api/auth/send-code` | Send OTP verification email |
| `POST` | `/api/auth/verify-code` | Verify OTP code |
| `POST` | `/api/auth/forgot-password` | Request a password reset email |
| `POST` | `/api/auth/reset-password` | Reset password with token |
| `GET` | `/api/auth/admin/:id` | Get admin account details |
| `PATCH` | `/api/auth/admin/:id` | Update admin account |
| `DELETE` | `/api/auth/admin/:id` | Deactivate / delete admin account |

### Incidents — `/api/incidents`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/incidents` | List all incidents |
| `POST` | `/api/incidents` | Submit a new incident report |
| `GET` | `/api/incidents/:id` | Get a specific incident |
| `PATCH` | `/api/incidents/:id` | Update incident details or status |
| `DELETE` | `/api/incidents/:id` | Delete an incident |
| `POST` | `/api/incidents/:id/lock` | Acquire dispatch lock |
| `POST` | `/api/incidents/:id/heartbeat` | Renew dispatch lock |
| `POST` | `/api/incidents/:id/unlock` | Release dispatch lock |
| `POST` | `/api/incidents/:id/force-unlock` | Force-release a stale lock (admin) |

### Departments — `/api/departments`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/departments` | List all departments |
| `GET` | `/api/departments/:id` | Get a specific department |
| `PATCH` | `/api/departments/:id` | Update department information |

### Notifications — `/api/notifications`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/notifications/send` | Send a Firebase push notification |

---

## Running Locally

```bash
# Development — hot reload with tsx watch
npm run dev

# Build — run prisma generate + db push, then compile
npm run build

# Start production build
npm start
```

> The dev server defaults to `http://localhost:3000` unless overridden by the `PORT` environment variable.

---

## Deployment Notes

This API is hosted on **Render** with automatic deploys triggered on every push to the `main` branch.

- **Build command:** `npm run build`
- **Start command:** `npm start`
- All environment variables listed above must be configured in the Render dashboard under **Environment → Secret Files / Env Vars**.
- The Firebase service account JSON should be uploaded as a **Secret File** and its path set in `GOOGLE_APPLICATION_CREDENTIALS`.
- Render spins down free-tier instances after inactivity; consider upgrading to a paid plan or using an uptime monitor to keep the service warm.

---

## License

This project is proprietary. All rights reserved.
