# Sepadan — Stablecoin Depeg Adjudication

Sepadan ("on par" / "equivalent" in Indonesian) is a parametric
insurance market for stablecoin depegs, built as an adjudication
contract in the sense GenLayer itself uses that word. GenLayer
positions itself as the [adjudication layer for the agentic
economy](https://genlayer.com/): *"Every layer engineers the happy
path. None ships dispute resolution. GenLayer fills that gap."*
Sepadan applies that idea to DeFi insurance specifically — most of a
depeg claim is a plain numeric fact, but *why* a stablecoin is off peg
is a judgment call, and that's the part this contract hands to AI
consensus rather than a threshold check alone.

## Why two stages, not one

**Stage 1 — numeric, no LLM.** Validators independently fetch
CoinGecko's live price for the insured coin. If it isn't off $1 by
more than the policy's threshold, nothing happens — the policy stays
active. This is arithmetic on a number every validator fetched
themselves; it doesn't need AI judgment, and earlier versions of this
contract stopped here. That's also its weakness: a pure threshold
check can't tell a genuine mechanism failure apart from a five-minute
liquidity wobble or an anomalous quote from one exchange, and all
three would trigger an identical payout.

**Stage 2 — classification, LLM judgment, only runs on a real numeric
breach.** Validators fetch supplementary market data (24h volume,
market cap) and an LLM classifies what's happening:

| Classification | Meaning | Payout |
|---|---|---|
| `STRUCTURAL_FAILURE` | Broad, sustained depeg consistent with a genuine peg-mechanism collapse | Full, immediate |
| `TRANSIENT_VOLATILITY` | Real but likely temporary — liquidity stress, not mechanism failure | Full, immediate |
| `MANIPULATION_SUSPECTED` | Price action looks isolated or anomalous | Delayed — opens a cooling period |

`STRUCTURAL_FAILURE` and `TRANSIENT_VOLATILITY` pay the same amount —
coverage doesn't depend on which one it is — but the classification
itself is recorded, since a real insurer's actuarial reporting cares
about *why* claims happened, not just that they did.
`MANIPULATION_SUSPECTED` doesn't refuse the claim; it just waits
(`resolve_cooling`, after `COOLING_PERIOD_DAYS`) and takes a second,
purely numeric look before paying out or standing down.

## Validators enforce consistency, not just matching fields

Both stages use a custom `gl.vm.run_nondet_unsafe` validator instead of
`gl.eq_principle.strict_eq`. Neither just checks "did every field come
back the same" — each rejects internally *inconsistent* combinations
outright:

- A `STRUCTURAL_FAILURE` claim with `confidence_score < 70` is
  rejected, even if every individual field is well-typed.
- A `MANIPULATION_SUSPECTED` classification with `payout_bps = 10000`
  is rejected — that combination contradicts itself.
- Any classification riding on `data_quality != RELIABLE` is rejected
  unless it's `MANIPULATION_SUSPECTED` with `payout_bps = 0` — bad
  data can never justify a payout, regardless of what label a model
  attaches to it.

See `_validate_price_payload` and `_validate_classification_payload`
in `contracts/sepadan.py` for the full rule set, and
`test/test_sepadan_validators.py` for combinations that must be
accepted and rejected.

## Fetch failures don't crash or silently misprice

`_fetch_price_micros` never lets a network or parsing exception
propagate — it's caught and turned into an explicit `STALE` result. A
payout can only happen when `data_quality == RELIABLE`; anything else
leaves the policy exactly where it was, for a retry. If CoinGecko stays
down long enough to rack up `MAX_FETCH_FAILURES` consecutive failed
checks, the buyer can call `request_manual_review()` for a grace-period
extension — there's no privileged admin who could otherwise intervene
(see Non-upgradability below), so this is a permissionless,
buyer-triggered safety valve rather than a human review queue.

## Project structure

```
sepadan/
├── contracts/
│   └── sepadan.py                     # The Intelligent Contract (non-upgradable)
├── deploy/
│   └── deployScript.ts                # export default main(client) — run via `genlayer deploy`
├── test/
│   ├── test_sepadan_validators.py     # offline pytest — payload validator logic
│   └── test_sepadan_integration.py    # gltest — full lifecycle against a live network
├── frontend/                          # Next.js 15 app (App Router, TypeScript, Tailwind)
│   ├── app/
│   │   ├── page.tsx                   # Home / live pool stats
│   │   ├── underwrite/page.tsx        # Deposit / withdraw
│   │   ├── policy/new/page.tsx        # Buy cover
│   │   ├── policies/page.tsx          # Browse every policy
│   │   └── policy/[id]/page.tsx       # Policy detail + trigger checks + history
│   ├── components/                    # NavBar, StatusPill, PoolStats, ActivityFeed
│   ├── lib/                           # genlayer.ts, contract.ts, useWallet.ts, activityLog.ts
│   └── .env.example
├── genlayer.config.json               # Network definitions (Studionet + Testnet Bradbury)
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

To switch to **Testnet Bradbury**, select it via `genlayer network` and
set `NEXT_PUBLIC_GENLAYER_NETWORK=testnetBradbury` in `frontend/.env`:

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

```bash
# 1. Tooling
npm install -g genlayer
py -3.12 -m pip install genvm-linter

# 2. Dependencies
npm install
cd frontend && npm install && cd ..

# 3. Network
genlayer network   # choose studionet (fund via the 💧 faucet) or testnetBradbury

# 4. Lint — non-upgradable, so this matters more than usual
genvm-lint check contracts/sepadan.py

# 5. Deploy
genlayer deploy
# copy the printed address into frontend/.env as NEXT_PUBLIC_CONTRACT_ADDRESS

# 6. Frontend
cd frontend && cp .env.example .env && npm run dev
```

> **Redeploying after any contract change?** `upgraders` is never
> populated in `__init__`, so GenVM permanently locks the code slot the
> instant `__init__` finishes running. There is no in-place upgrade
> path — every contract edit needs a fresh `genlayer deploy` to a new
> address, and the old address's pool/policies are left behind,
> inaccessible from the new one.

## Testing

```bash
# Fast, offline — validator schema/business-rule logic
pytest test/test_sepadan_validators.py -v

# Full lifecycle against a live network
gltest --network studionet test/test_sepadan_integration.py
```

`test_sepadan_validators.py` deliberately duplicates
`_validate_price_payload` and `_validate_classification_payload` from
the contract rather than importing it — `contracts/sepadan.py` starts
with `from genlayer import *`, which pulls in GenVM-only symbols
(`u256`, `gl`, `TreeMap`, ...) that don't exist outside the sandboxed
GenVM runtime. Splitting the validators into a separate importable
module would fix that but would also break `genlayer deploy`, which
reads the contract as a single file. The tradeoff is documented in
both files: keep the two copies in sync by hand if the validators
change.

## Non-upgradability

`contracts/sepadan.py` never populates `upgraders` in `__init__`.
GenVM's automatic `root.lock_default()` call after `__init__` returns
permanently locks the code slot. There is no admin function, no fee
setter, and no override anywhere in the contract — this is also why
`request_manual_review()` is a permissionless grace-period extension
rather than a queue someone privileged resolves.

## What changed from v1

The original version only ran Stage 1 (numeric threshold check) — a
depeg of any cause paid out identically, and there was no LLM
reasoning step anywhere in the contract. This revision adds Stage 2
classification, JestoraArena-style business-rule validators (rejecting
inconsistent field *combinations*, not just malformed individual
fields), explicit `data_quality` gating, non-crashing fetch-failure
handling with a manual-review fallback, and a division-by-zero guard
in the share-minting math (`deposit()` when `pool_balance == 0` but
`total_shares > 0`, e.g. after a full pool drain).

## License

MIT
