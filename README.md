# Sepadan — Stablecoin Depeg Insurance

Sepadan ("on par" / "equivalent" in Indonesian) is a GenLayer Intelligent
Contract for parametric stablecoin depeg insurance. Underwriters fund a
shared pool; buyers pay a premium for a policy that pays out
automatically if a stablecoin's price strays past a chosen threshold
from $1 during the policy window.

**Why this needs validator consensus, not just an oracle:** the payout
decision comes from a price validators fetch live from CoinGecko's
public API themselves — never from anything a buyer or seller claims.
There's no LLM reasoning step here (unlike a dispute-resolution
contract); this uses GenLayer as a **decentralized price oracle**: five
independent validators each fetch the same public endpoint and must
agree within a tight numeric tolerance before a claim pays out. That
replaces the need for separate oracle infrastructure (e.g. a Chainlink
feed) while still preventing any single validator from moving the
outcome. Full rationale is documented at the top of
`contracts/sepadan.py`.

## Project structure

Follows the official [`genlayer-project-boilerplate`](https://github.com/genlayerlabs/genlayer-project-boilerplate) layout:

```
sepadan/
├── contracts/
│   └── sepadan.py           # The Intelligent Contract (non-upgradable)
├── deploy/
│   └── deployScript.ts      # export default main(client) — run via `genlayer deploy`
├── test/
│   └── test_sepadan.py      # gltest integration tests
├── frontend/                  # Next.js 15 app (App Router, TypeScript, Tailwind)
│   ├── app/
│   │   ├── page.tsx                  # Home / how it works / live pool stats
│   │   ├── underwrite/page.tsx       # Deposit / withdraw
│   │   ├── policy/new/page.tsx       # Buy cover
│   │   └── policy/[id]/page.tsx      # Policy detail + trigger price check
│   ├── components/          # NavBar, StatusPill, PoolStats
│   ├── lib/                 # genlayer.ts (client), contract.ts (typed calls), useWallet.ts
│   └── .env.example
├── genlayer.config.json     # Network definitions (Studionet + Testnet Bradbury)
└── package.json
```

## Networks

Configured for **Studionet** by default (hosted, no local setup):

| Setting      | Value                              |
| ------------ | ----------------------------------- |
| GenLayer RPC | `https://studio.genlayer.com/api`  |
| Chain ID     | `61999`                            |
| Currency     | GEN                                |
| Explorer     | `explorer-studio.genlayer.com`     |
| Faucet       | Built-in 💧 button in Studio's account selector |

To switch to **Testnet Bradbury** (production-like, real AI/LLM
workloads), select it via `genlayer network` and set
`NEXT_PUBLIC_GENLAYER_NETWORK=testnetBradbury` in `frontend/.env`:

| Setting            | Value                                        |
| ------------------- | --------------------------------------------- |
| GenLayer RPC        | `https://rpc-bradbury.genlayer.com`          |
| GenLayer Chain RPC  | `https://rpc.testnet-chain.genlayer.com`     |
| Chain ID            | `4221`                                       |
| Currency            | GEN                                          |
| Explorer            | `explorer-bradbury.genlayer.com`             |
| Chain Explorer      | `explorer.testnet-chain.genlayer.com`        |
| Faucet              | `testnet-faucet.genlayer.foundation`         |

## Setup (official GenLayer CLI flow)

### 1. Install the GenLayer CLI and the GenVM linter

```bash
npm install -g genlayer
py -3.12 -m pip install genvm-linter
```

```bash
genlayer --version
genvm-lint --version
```

### 2. Install dependencies

```bash
npm install
cd frontend && npm install && cd ..
```

### 3. Select your network

```bash
genlayer network
```

Choose `studionet` (or `testnetBradbury` with a funded account). If
using Studionet, open [studio.genlayer.com](https://studio.genlayer.com),
select/create an account, and use the built-in 💧 faucet button.

### 4. Lint before deploying

```bash
genvm-lint check contracts/sepadan.py
```

Fix anything flagged — the contract is non-upgradable once deployed
(see below), so this matters more than usual.

### 5. Deploy

```bash
genlayer deploy
```

Runs `deploy/deployScript.ts` against your selected network and prints
the deployed address. Copy it into `frontend/.env` as
`NEXT_PUBLIC_CONTRACT_ADDRESS`.

### 6. Run the frontend

```bash
cd frontend
cp .env.example .env   # then paste in the deployed contract address
npm run dev
```

Open `http://localhost:3000`, connect MetaMask — the app prompts you to
add/switch to the configured GenLayer network automatically.

## Testing

```bash
gltest --network studionet
```

Price-dependent tests (`check_depeg`) hit the real CoinGecko public API.
Use a genuinely stable coin (`usd-coin`, `tether`) to test the "no
depeg" and "expired" paths predictably — there's no free, reliable way
to reproduce an actual historical depeg against the live endpoint on
demand, so that path is best covered with a stubbed/offline unit test
if you add one.

## Design notes worth knowing before you deploy

- **Share-based underwriting pool.** Deposits mint shares proportional
  to the pool's current value (like a simple vault), so premiums earned
  over time increase the redemption value of every share — not just
  the depositor who happened to fund a specific policy.
- **Solvency by construction.** `create_policy` reserves the payout
  amount out of the pool immediately; the pool can never promise more
  than it can pay, and underwriters can only withdraw the unreserved
  balance.
- **Price tolerance, not exact match.** `check_depeg` uses a custom
  validator (not `gl.eq_principle.strict_eq`) that accepts a small,
  fixed tolerance (`PRICE_TOLERANCE_MICROS`, 0.2% of $1) between
  validators' independently-fetched prices. This is a deliberate
  design choice to tolerate normal fetch-timing drift in live market
  data without opening the door to manipulation — documented in
  `contracts/sepadan.py`.

## Non-upgradability

`contracts/sepadan.py` never populates the `upgraders` list in
`__init__`. GenVM automatically calls `root.lock_default()` right after
`__init__` returns, permanently locking the code slot. There is no
admin function and no override anywhere in the contract. Run
`genvm-lint` and the `gltest` suite before you deploy, not after.

## License

MIT
