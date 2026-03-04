---
description: How to build and run the Smart Hotel Management System
---

# Build and Run Workflow

## Prerequisites
- Node.js 18+ 
- PostgreSQL 16+ (or Docker)
- Redis (or Docker)

## Development Setup

// turbo-all

1. Install root dependencies:
```bash
npm install
```

2. Start the database (if using Docker):
```bash
docker-compose up -d postgres redis
# Optional: Start FreePBX for communication testing
docker-compose up -d freepbx

# Optional: Start Mock MoMo Server for payment testing
docker-compose up -d mock-momo
```

3. Run database migrations:
```bash
cd backend && npm run migrate
```

4. Start the backend in development mode:
```bash
cd backend && npm run dev
```

5. Start the staff frontend dashboard:
```bash
cd frontend && npm run dev
```

6. Start the tablet dashboard:
```bash
cd tablet-dashboard && npm run dev
```

## Production Build

1. Build all packages:
```bash
npm run build
```

2. Start production server:
```bash
npm start
```

## Running Tests

```bash
npm test
```
