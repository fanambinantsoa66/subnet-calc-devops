# 🌐 Subnetting Calculator — DevOps Demo

A full-featured network subnetting tool built as a **complete DevOps workflow demo**.

## Features

- **Subnetting** — IP/CIDR → network, broadcast, hosts, wildcard mask
- **VLSM Calculator** — Variable Length Subnet Masking
- **IP Class Detector** — A/B/C/D/E classification + private/public detection
- **Base Converter** — Decimal ↔ Binary ↔ Hex ↔ Octal

## DevOps Workflow

```
Code (React) → Lint → Test → Build → Docker → CI/CD → K8s → Monitoring
```

| Stage | Tool | File |
|-------|------|------|
| App | React + Vite | `src/` |
| Tests | Vitest | `tests/subnet.test.js` |
| Containerize | Docker (multi-stage) | `Dockerfile` |
| CI/CD | GitHub Actions | `.github/workflows/ci-cd.yml` |
| Deploy | Kubernetes | `k8s/deployment.yaml` |
| Monitor | Prometheus + Grafana | `k8s/monitoring.yaml` |

## Quick Start

```bash
# Development
npm install
npm run dev

# Tests
npm test
npm run test:coverage

# Docker
docker build -t subnet-calc .
docker run -p 8080:8080 subnet-calc

# Kubernetes
kubectl apply -f k8s/
```

## CI/CD Pipeline

```
push to main
  ├── lint        → ESLint checks
  ├── test        → Vitest + coverage report
  ├── build       → Vite production bundle
  ├── docker      → Build & push to ghcr.io (multi-arch)
  ├── staging     → Auto-deploy + smoke tests
  └── production  → Manual approval gate → deploy
```

## Architecture

```
Internet → Ingress (TLS) → Service → Deployment (3 replicas)
                                           │
                               ┌──────────────────────┐
                               │  nginx:alpine (8080)  │
                               │  React SPA (static)   │
                               └──────────────────────┘
                                           │
                               Prometheus scrape → Grafana
```
