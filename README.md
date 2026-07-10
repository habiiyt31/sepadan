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

---

## For reviewers: how to test this in 5 minutes

You don't need to read the code first — the fastest way to understand
Sepadan is to trigger a transaction and watch it go through validator
consensus.

### Step 0 — what you're looking at

Four pages:

| Page | What it does |
|---|---|
| `/` | Home — pool stats and a live feed of recent transactions from this browser |
| `/underwrite` | Put GEN into the shared pool, get shares back |
| `/policy/new` | Buy a policy: pick a coin, a depeg threshold, a payout amount |
| `/policies` | Browse every policy that's been created, click into any of them |
| `/policy/[id]` | One policy's detail — trigger the price check, see its own history |

The core of the project is `/policy/[id]`'s **"Check for depeg now"**
button — that's where GenLayer validators independently fetch a live
price and have to agree before anything pays out.

### Step 1 — connect a wallet

1. Open the deployed app (or run it locally, see [Setup](#setup)).
2. Click **Connect Wallet** top-right. MetaMask will prompt you.
3. On Studionet, use the 💧 faucet button in
   [studio.genlayer.com](https://studio.genlayer.com)'s account selector
   to fund an account, then send some GEN to your MetaMask address.
4. Click your address (top-right) any time to **disconnect** — this is
   remembered explicitly, so it won't silently reconnect you on the
   next page load.

### Step 2 — fund the pool

1. Go to **Underwrite**.
2. Deposit a small amount, e.g. `5` GEN, and confirm in MetaMask.
3. This takes a few seconds because 5 validators need to agree on the
   transaction, not just one node. Consensus on Studionet can
   occasionally take longer than expected — the app now waits up to
   ~6 minutes before giving up, and if it does time out it points you
   at the Explorer link rather than just failing silently.
4. Once confirmed, the pool stats update: **Total pool**, **Reserved**,
   **Available capacity**, **Total shares**.

### Step 3 — buy a policy

1. Go to **Buy cover**.
2. Pick a coin (e.g. USDT), a threshold (e.g. `3`%), a payout amount
   smaller than what you deposited (e.g. `1` GEN), a duration
   (e.g. `1` day), and a premium (e.g. `0.05` GEN).
3. Submit — you'll land on `/policy/<id>` once confirmed.
4. Repeat this a couple of times with different coins/thresholds, then
   check **Policies** in the nav — every policy you created shows up
   there, not just the first one.

### Step 4 — trigger the price check (the actual demo moment)

1. On the policy page, click **Check for depeg now**.
2. Open this transaction in the
   [GenLayer Studio Explorer](https://explorer-studio.genlayer.com/txs)
   and look at the **Consensus** tab.
3. You'll see `check_depeg` move through
   `Pending → Proposing → Committing → Revealing → Accepted → Finalized`.
   Each of the 5 validators independently called CoinGecko's public
   price API during this step — that's the "oracle" part happening
   on-chain, not in the frontend.
4. Back in the app, scroll down on the policy page to **"History for
   this policy"** — every `check_depeg` call you've made against it
   shows up there with its status and a direct Explorer link, without
   needing to leave the app or dig through the Explorer's global
   transaction list.
5. Since real stablecoins are almost always stable, the result will
   normally be `active` (no depeg) or, after the duration passes,
   `expired`. To see the `claimed` payout path without waiting for a
   real depeg, see below.

### What "good" looks like when reviewing

- Transactions show **5 Initial Validators** and reach **Accepted** /
  **Finalized** in the Explorer — consensus actually running, not one
  centralized call.
- `check_depeg`'s result is `active`, `claimed`, or `expired` — never
  something derived from text a buyer or seller typed in. The frontend
  never asks anyone what the price is; it only displays what the
  contract itself decided.
- Wallet connect/disconnect is predictable — disconnecting doesn't
  silently reconnect on refresh.
- Every policy you create is visible and selectable from `/policies` —
  nothing is hardcoded to a single ID.
- The **Recent activity** panel on the home page and the per-policy
  history section update live as transactions finalize, each linking
  straight to its Explorer page.

### Testing the payout (claimed) path

Real depegs aren't reproducible on demand against the live CoinGecko
endpoint. To exercise the `claimed` branch during a demo, temporarily
set a very low `threshold_bps` when creating a policy (e.g. `1` =
0.01%) — ordinary intraday price noise is often enough to cross a
threshold that tight. Use a realistic threshold (e.g. `300` = 3%) for
any policy meant to demonstrate real insurance economics.

---

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
│   │   ├── page.tsx                  # Home / live pool stats / recent activity
│   │   ├── underwrite/page.tsx       # Deposit / withdraw
│   │   ├── policy/new/page.tsx       # Buy cover
│   │   ├── policies/page.tsx         # Browse every policy
│   │   └── policy/[id]/page.tsx      # Policy detail + trigger price check + its history
│   ├── components/          # NavBar, StatusPill, PoolStats, ActivityFeed
│   ├── lib/                 # genlayer.ts (client), contract.ts (typed calls),
│   │                        # useWallet.ts, activityLog.ts (local tx history)
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

## Setup

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

> **Redeploying after a contract change?** Because `contracts/sepadan.py`
> never populates `upgraders`, GenVM permanently locks its code the
> instant `__init__` finishes running (see
> [Non-upgradability](#non-upgradability)). Any edit to the `.py` file —
> even adding a single read-only view function — means the previously
> deployed address is now running different code than what's in this
> repo. There is no in-place upgrade path. Deploying again gets you a
> **new contract address** with a **fresh, empty pool** — any policies
> or deposits made against the old address stay there, inaccessible
> from the new one. Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in
> `frontend/.env` to the new address afterward.

### 6. Run the frontend

```bash
cd frontend
cp .env.example .env   # then paste in the deployed contract address
npm run dev
```

Open `http://localhost:3000`, connect MetaMask — the app prompts you to
add/switch to the configured GenLayer network automatically.

## Automated testing

```bash
gltest --network studionet
```

Price-dependent tests (`check_depeg`) hit the real CoinGecko public API.
Use a genuinely stable coin (`usd-coin`, `tether`) to test the "no
depeg" and "expired" paths predictably — there's no free, reliable way
to reproduce an actual historical depeg against the live endpoint on
demand, which is why the manual low-threshold workaround under
"Testing the payout path" above exists for live demos.

## Design notes worth knowing

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
  validators' independently-fetched prices — deliberate, to tolerate
  normal fetch-timing drift in live market data without opening the
  door to manipulation. Documented in `contracts/sepadan.py`.
- **`str()`, not `copy_to_memory()`, for plain string fields.**
  Attributes read off a `TreeMap`-stored dataclass (e.g.
  `policy.coin_id`) come back as plain Python values, not live storage
  references — passing them to `gl.storage.copy_to_memory()` throws
  `AssertionError: assert td is not None`. Fields used inside a
  non-deterministic block are wrapped with `str()`/`int()` instead.
- **`get_policy_count()` exists purely so the frontend can list every
  policy** — without it, the UI had no way to discover how many
  policies exist besides guessing IDs, which meant a second buyer's
  policy was effectively invisible in the app.
- **The activity log is local, not on-chain.** `frontend/lib/activityLog.ts`
  keeps a browser-side record (via `localStorage`) of every
  transaction this browser has submitted, purely so the UI has
  something to show without needing a separate indexing service. It's
  a convenience layer, not a source of truth — the Explorer link next
  to every entry is the source of truth.

## Non-upgradability

`contracts/sepadan.py` never populates the `upgraders` list in
`__init__`. GenVM automatically calls `root.lock_default()` right after
`__init__` returns, permanently locking the code slot. There is no
admin function and no override anywhere in the contract. Run
`genvm-lint` and the `gltest` suite before you deploy, not after — and
expect to redeploy to a new address for every contract change, since
there is no upgrade path by design.

## License

MIT
