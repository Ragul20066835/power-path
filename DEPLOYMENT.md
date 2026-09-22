# POWERPATH — Production Deployment Guide

This guide documents the complete end-to-end production deployment process for the **POWERPATH** circuit tournament engine.

---

## Architecture Overview

```
Frontend (React + Vite + Vanilla CSS) ──► Vercel (SPA)
                                              │ HTTPS / WSS
                                              ▼
Backend (FastAPI + SQLAlchemy + AnyIO) ─► Render Web Service
                                              │ Pooling (SSL)
                                              ▼
Database (PostgreSQL + RLS + WAL) ─────► Supabase PostgreSQL
```

---

## 1. Supabase PostgreSQL Database Setup

1. **Create Supabase Project**:
   - Create a new project in [Supabase](https://supabase.com).
   - Set region closest to your Render service (e.g. `us-east` or `ap-south-1`).
2. **Execute Schema Migration**:
   - Open Supabase SQL Editor.
   - Run the complete script from [`backend/supabase_schema.sql`](file:///d:/DROP&CONNECT/backend/supabase_schema.sql).
   - This provisions all 8 relational tables (`events`, `questions`, `sockets`, `participant_sessions`, `socket_placements`, `question_attempts`, `tournament_results`, `tournament_settings`, `admin_users`), composite indexes, unique constraints, and Row Level Security (RLS).
3. **Get Connection String**:
   - Go to Project Settings ➔ Database ➔ Connection Pooling.
   - Copy the Transaction / Session connection URI (`postgresql://postgres.[ref]:[password]@...:6543/postgres?sslmode=require`).

---

## 2. Render Backend Deployment

1. **Create Web Service on Render**:
   - Connect your Git repository to [Render](https://render.com).
   - Alternatively, apply [`render.yaml`](file:///d:/DROP&CONNECT/render.yaml) using Render Blueprints.
2. **Configure Settings**:
   - **Root Directory**: `backend`
   - **Environment**: Python 3.11.9
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/api/v1/health`
3. **Set Environment Variables**:
   | Variable | Value Description | Example |
   |---|---|---|
   | `ENVIRONMENT` | `production` | `production` |
   | `DATABASE_URL` | Supabase PostgreSQL Connection URI | `postgresql://postgres...` |
   | `JWT_SECRET` | 32+ character random secret string | `a7d8e9f0...` |
   | `CORS_ORIGINS` | Comma-separated list of allowed domains | `https://powerpath.vercel.app` |
   | `ADMIN_BOOTSTRAP_USERNAME` | Production super admin username | `admin` |
   | `ADMIN_BOOTSTRAP_EMAIL` | Production super admin email | `admin@college.edu` |
   | `ADMIN_BOOTSTRAP_PASSWORD` | Strong password for initial login | `SecureTournamentPass2026!` |

---

## 3. Vercel Frontend Deployment

1. **Import Project to Vercel**:
   - Connect Git repository to [Vercel](https://vercel.com).
   - **Framework Preset**: Vite
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
2. **Configure Environment Variables**:
   | Variable | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://powerpath-api.onrender.com` (Your Render Backend URL) |
3. **Routing Verification**:
   - The included [`vercel.json`](file:///d:/DROP&CONNECT/vercel.json) routes all direct browser navigation requests (e.g. `/admin/login`, `/admin/dashboard`) to `/index.html`.

---

## 4. Health Check & Validation

1. **Backend Health Check**:
   ```bash
   curl -i https://powerpath-api.onrender.com/api/v1/health
   ```
   *Expected Response (`HTTP 200 OK`)*:
   ```json
   {
     "status": "ok",
     "database": "connected",
     "environment": "production",
     "version": "1.0.0"
   }
   ```
2. **WebSocket Live Telemetry Verification**:
   - Connect via `wss://powerpath-api.onrender.com/api/v1/ws/monitor?token=[JWT_TOKEN]`.
   - Client automatically falls back to live HTTP polling if WebSocket is blocked or disconnected.

---

## 5. Rollback & Troubleshooting Guidance

* **Database Schema Rollback**:
  - All foreign keys enforce `ON DELETE CASCADE` down the `Event ➔ Question ➔ Socket` tree.
  - To clear test rounds without affecting settings or admins, execute `DELETE FROM events WHERE custom_id LIKE 'TEST_%';`.
* **CORS Rejections (`403 / Network Error`)**:
  - Verify `CORS_ORIGINS` in Render contains the exact Vercel protocol and domain (`https://powerpath.vercel.app` without trailing slash).
* **WebSocket Fallback**:
  - In restricted campus proxy environments where `wss://` is blocked, `apiService.js` automatically engages live HTTP polling (`GET /api/v1/admin/monitor/telemetry`) without disrupting judge operations.
