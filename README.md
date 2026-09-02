# JARVIS

JARVIS is the system. AI models are replaceable brains used by JARVIS.

The active engineering foundation is a TypeScript modular monorepo, version
0.3.0. J0.1 provides a local API, Next.js status interface, queue worker,
PostgreSQL/pgvector, encrypted development credentials, versioned contracts and
continuous integration. J0.2 adds passkey authentication, cryptographic browser
device trust, restricted delegation and offline identity recovery. Personal-data
endpoints, external tools and production deployment remain disabled.

The owner's [Master Definition v0.1](docs/JARVIS_Master_Definition_v0.1.md) remains
unchanged. [Current gate status](docs/STATUS.md) distinguishes J0.1 from the full
J0 Foundation v1 GO decision.

## Start locally

Prerequisites: Git access to this private repository, Node **24.19.0** with npm
11, and a running Docker Engine/Desktop with Compose v2. Linux is the CI target;
macOS and WSL2 are supported development targets pending host-specific checks.
No AI-provider account, Vercel project or Supabase project is needed.

```bash
git clone https://github.com/sawantvaishnav1994-ai/jarvis.git
cd jarvis
npm run setup
npm start
```

`setup` installs locked dependencies, builds packages, generates development
credentials, starts PostgreSQL and Redis, applies reviewed SQL migrations, and
builds the web app. `start` checks infrastructure and migrations, starts all three
Node services, and prints `JARVIS_READY` after their readiness checks pass.
Open http://localhost:3000. Keep the terminal open. Use `localhost`, not the IP
address, for the configured passkey RP/origin.

In a second local terminal, run `npm run identity:bootstrap` and enter its private
claim code at http://localhost:3000/identity to create your initial owner/passkey.
Do not paste that code into chat. The assistant has not created your real owner.
Enroll another browser from that page, then approve its displayed device ID on
the privileged primary browser with fresh passkey confirmation. Trusted devices
can inspect identity; privileged enrollment explicitly grants identity management.
Create an offline identity recovery kit and store its package/key separately.
It is **not a personal-data or vault backup**. See [identity boundaries](docs/security/j0.2-identity.md).

```bash
npm stop          # or Ctrl+C; stops this supervisor's Node services
npm run infra:down # optional; stops containers and preserves database volumes
```

Ports are bound to loopback: web 3000, API 4000, worker 4001, PostgreSQL 5433,
Redis 6380. Keep this development stack off public networks. Never point it at
production. Staging and production templates deliberately refuse startup.

## Verify

```bash
npm run check            # lint, architecture boundaries, types, unit/contracts/security
npm run test:integration # real development PostgreSQL; synthetic fixtures
npm run smoke            # service health plus a real queued worker job
npx playwright install chromium
npm run test:e2e          # browser -> API -> readiness
npm run test:failures     # stops/restarts dev Redis and PostgreSQL; run on test data
```

GitHub Actions runs these with freshly generated development credentials and
Docker volumes, plus the preserved Python regression suite. It deploys nothing.

## Repository guide

| Path | Responsibility |
| --- | --- |
| `apps/api`, `apps/worker`, `apps/web` | Composition and interface/service processes |
| `apps/desktop` | Reserved desktop interface boundary |
| `packages/*` | Core, identity, security, memory, knowledge, models, agents, tools, events, audit, storage, devices, config, shared |
| `config/*` | Validated environment templates containing secret references |
| `infrastructure/*` | Docker, reviewed migrations, deployment and monitoring designs |
| `tests/*` | Contract, security, integration, browser and reference tests |
| `docs/decisions/*` | ADRs for the active TypeScript architecture |
| `src/jarvis` | Preserved Python 0.2.0 reference; no automatic data migration |

Read [architecture](docs/architecture/system.md), [development](docs/architecture/development.md),
[security scope](docs/security/j0.1-boundaries.md), [contracts](docs/protocols/contracts-v1.md),
and [J0.1 acceptance](docs/roadmap/j0.1.md), plus [J0.2 acceptance](docs/roadmap/j0.2.md). The historical Python documents remain
in `docs/` and `docs/reference/`; they do not describe the active TypeScript API.
The cumulative [work log](JARVIS_WORK_LOG.md) retains the owner's prompts verbatim.
