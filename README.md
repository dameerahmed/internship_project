# 🚀 Dameer Webhook Gateway - Internship Project

Full-stack production-ready Webhook Gateway built with **FastAPI**, **React (Vite)**, **PostgreSQL**, **Redis**, **RabbitMQ**, and **Celery**.

---

## ⚡ New Laptop Quickstart Guide (Fresh Setup)

For anyone running this project on a brand new laptop or machine, follow these simple steps:

### 📋 Prerequisites
Make sure the machine has:
1. **[Git](https://git-scm.com/)** installed.
2. **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** installed and running.

---

### 🛠️ Step-by-Step Setup (Zero Configuration Required)

1. **Clone the Repository**
   ```bash
   git clone https://github.com/dameerahmed/internship_project.git
   cd internship_project
   ```

2. **Copy Environment Configuration (Optional)**
   *(If skipped, Docker Compose and `git.sh` will automatically use default configurations)*
   ```bash
   cp .env.example .env
   ```

3. **Start All Services with Docker**
   ```bash
   docker-compose up -d --build
   ```
   *(Or run `./git.sh` and select option `1`)*

   > 💡 **What happens automatically:**
   > - PostgreSQL, Redis, and RabbitMQ spin up with health checks.
   > - Database migrations (`alembic upgrade head`) execute automatically.
   > - FastAPI backend, Celery worker, and Vite frontend launch with live-reloading.

---

## 🌐 Running Services & Endpoints

| Service | Endpoint / URL | Default Credentials |
| :--- | :--- | :--- |
| **Frontend Web App** | [http://localhost](http://localhost) | — |
| **Backend API Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | — |
| **RabbitMQ Dashboard** | [http://localhost:15672](http://localhost:15672) | User: `admin` \| Pass: `admin123` |
| **PostgreSQL Database** | `localhost:5432` | User: `postgres` \| Pass: `postgres` \| DB: `internship_db` |
| **Redis Cache** | `localhost:6379` | — |

---

## 🛑 Stop / Shutdown Project

To stop all services:
```bash
docker-compose down
```

---

## ❓ Troubleshooting Common Errors

### 🚨 Error: `bind: address already in use (5432)`
**Reason:** PostgeSQL base service standard port `5432` is already running locally on the host system (common in Linux/Ubuntu).

**Solution 1 (Recommended on Linux):**
Stop local PostgreSQL service on the host machine:
```bash
sudo systemctl stop postgresql
# Then retry:
docker-compose up -d
```

**Solution 2 (Change Port in `.env`):**
Edit `.env` file and change `POSTGRES_PORT` to `5433`:
```env
POSTGRES_PORT=5433
```
Then run `docker-compose up -d`.

---

## 🔄 Daily Workflow / Git Helper

Use the built-in `git.sh` helper script for pulling and pushing updates:
```bash
./git.sh
```
- **Option 1**: Pulls latest code from GitHub and automatically applies any new DB migrations.
- **Option 2**: Stages, commits, and pushes your changes to GitHub.
