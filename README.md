# NewZealankans Marketplace Backend

A progressive, high-performance NestJS backend API powering the **NewZealankans Marketplace** — a classifieds and advertising platform tailored for New Zealand. 

Built using NestJS, TypeScript, and Prisma 7 with PostgreSQL, the backend provides robust authentication, listing management, admin workflows, and SEO capabilities.

---

## 🚀 Tech Stack

- **Core Framework**: [NestJS](https://nestjs.com/) (v11) & TypeScript
- **Database & ORM**: [Prisma](https://www.prisma.io/) (v7) with PostgreSQL (`@prisma/adapter-pg` driver pool adapter)
- **Authentication**: JWT (JSON Web Tokens) & Passport
- **File Processing**: [Sharp](https://sharp.pixelplumbing.com/) (image optimization) & Multer
- **API Documentation**: [Swagger Open API](https://swagger.io/)
- **Validation**: `class-validator` & `class-transformer`
- **Email Delivery**: Nodemailer

---

## ✨ Features

- **🔐 Robust Auth System**: 
  - JWT-based authentication with secure token handling.
  - Email verification workflow and password reset tokens.
  - Role-based Access Control (`USER` and `ADMIN` roles).
- **📋 Listings (Ads) Management**:
  - CRUD operations with automated slug generation for SEO.
  - Image upload with auto-resizing and format optimization via `sharp`.
  - Expiry dates and status transitions (`PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`).
  - Featured listings control.
- **📁 Categories & Locations**:
  - Hierarchical categories supporting infinite nesting (parent-child relationships).
  - Region/City support mapping New Zealand locations.
- **📢 Advertising Banners**:
  - Banner slots mapped by placements (`HOME`, `SIDEBAR`, `CATEGORY`, `LISTING`, `FOOTER`).
- **🔔 Notifications System**:
  - Real-time and database-persisted notifications for listing updates, password requests, and reviews.
- **✉️ Admin Contact Center**:
  - Form submissions from site visitors routed to admins.
- **🔍 SEO Integration**:
  - Auto-generated dynamic sitemaps mapping categories, locations, and approved listings.
  - Swagger documentation available at `/api/docs`.

---

## 📂 Project Structure

```
├── prisma/
│   ├── schema.prisma      # Prisma schema (models, relations, indexes)
│   └── seed.ts            # Seed script (supports both production lookup and mock data)
├── src/
│   ├── ad/                # Listings module (CRUD, uploads, admin validation)
│   ├── auth/              # JWT strategy, login/register logic, and guards
│   ├── banner/            # Sponsored banner ads management
│   ├── category/          # Nested categories management
│   ├── contact/           # User contact message handlers
│   ├── email/             # Nodemailer templates for verification & updates
│   ├── location/          # New Zealand regional directory
│   ├── notification/      # DB notifications service
│   ├── prisma/            # Shared PrismaService database driver adapter pool
│   ├── seo/               # Dynamic sitemap generation
│   ├── user/              # User profile & administrative user control
│   └── main.ts            # NestJS bootstrapping & entrypoint
├── prisma.config.ts       # Prisma 7 configurations mapping environments
└── check_db.js            # Independent database connectivity validation helper
```

---

## 🛠️ Local Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [PNPM](https://pnpm.io/) package manager
- A running [PostgreSQL](https://www.postgresql.org/) database

### 1. Clone the repository and install dependencies:
```bash
pnpm install
```

### 2. Configure Environment Variables:
Create a `.env` file in the root directory:
```env
# Database connection
DATABASE_URL="postgresql://user:password@localhost:5432/dbname?schema=public"

# NestJS Server Configuration
PORT=3000
CORS_ORIGIN="http://localhost:5173"

# JWT configurations
JWT_SECRET="your-secure-jwt-development-secret-key"
JWT_EXPIRES_IN="7d"

# App configurations
PUBLIC_SITE_URL="http://localhost:5173"
MAX_UPLOAD_BYTES=5000000

# Seeding configurations
DEFAULT_ADMIN_EMAIL="admin@newzealankans.local"
DEFAULT_ADMIN_PASSWORD="AdminPassword123!"
INCLUDE_SAMPLE_DATA="true"
```

### 3. Generate the Prisma Client
Run client generation to compile TypeScript types:
```bash
pnpm prisma:generate
```

### 4. Apply Database Migrations & Seeds
Push the schema to your database and seed initial mock listings/categories:
```bash
pnpm prisma:migrate
pnpm prisma:seed
```

### 5. Start Development Server
```bash
pnpm dev
```
The application will start on: `http://localhost:3000`  
Interactive Swagger docs will be available at: `http://localhost:3000/api/docs`

---

## ⚡ Deployment & Production (e.g. Render)

### Database Configuration (Prisma 7)
Prisma 7 separates database connection URLs from schema models to enable serverless driver adapters. When deploying to platforms like **Render**:
1. Keep the connection string defined only inside **Render Environment Settings** (as `DATABASE_URL`).
2. Do **not** commit environment credentials directly into `schema.prisma`. 
3. The build phase automatically uses fallback options mapped inside `prisma.config.ts` to allow compilation without a live connection during the build step.
