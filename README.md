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

## Summary of this update

Everything below was added on top of the existing architecture without
changing it: still a non-upgradable Intelligent Contract, still the
same two-stage (numeric → AI classification) flow, still a
share-based pool, still fully permissionless. Nothing here required
touching `check_depeg`'s core control flow, the validator functions'
signatures, or anything the frontend calls.

| Area | Change |
|---|---|
| Supported coins | 4 → 8 (`COIN_SYMBOLS` in the contract, `SUPPORTED_COINS` in the frontend) — adding another is two one-line edits |
| AI classification | Prompt sharpened with an explicit tie-breaker rule and a requirement to cite the cross-exchange comparison in `reasoning` |
| Confidence thresholds | Recalibrated (`MIN_STRUCTURAL_CONFIDENCE` 70→75, `MIN_TRANSIENT_CONFIDENCE` 40→35) against two documented historical depegs (USDC/SVB, TerraUSD) instead of arbitrary defaults |
| Price sources | Stage 2 now also fetches Coinbase and Kraken spot prices as corroborating evidence (`_fetch_cross_exchange_context`); Stage 1's core numeric consensus is untouched |
| Documentation | This README expanded with the sections above; nothing removed |
| Pool reusability | Underwriting pool code documented as a copy-paste-reusable pattern for future parametric contracts (see Design notes) — no functional changes |
| Frontend build | Fixed a TypeScript build failure (`GenLayerChain` isn't an exported type from `genlayer-js/chains`) that was blocking `npm run build` |
| Deployment | Added a Vercel deployment section, since the frontend lives in a subdirectory and needs its Root Directory set explicitly |

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
market cap) *and* independent spot prices from other exchanges, and an
LLM classifies what's happening:

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

## Supported stablecoins

Any coin CoinGecko lists can technically be passed as `coin_id` — the
contract doesn't enforce an allowlist — but the frontend's `Buy cover`
form and Stage 2's cross-exchange lookup both key off two small,
easy-to-extend maps:

| Stablecoin | CoinGecko id (`coin_id`) | Exchange symbol (`COIN_SYMBOLS`) |
|---|---|---|
| USDT — Tether | `tether` | `USDT` |
| USDC — USD Coin | `usd-coin` | `USDC` |
| DAI — Dai | `dai` | `DAI` |
| FRAX — Frax | `frax` | `FRAX` |
| FDUSD — First Digital USD | `first-digital-usd` | `FDUSD` |
| PYUSD — PayPal USD | `paypal-usd` | `PYUSD` |
| GHO — Aave GHO | `gho` | `GHO` |
| USDe — Ethena USDe | `ethena-usde` | `USDE` |

Adding a future coin is two one-line additions, no logic changes:
`COIN_SYMBOLS` in `contracts/sepadan.py`, and `SUPPORTED_COINS` in
`frontend/lib/contract.ts`. `COIN_SYMBOLS` only feeds Stage 2's
best-effort cross-exchange lookup (see below) — if a coin isn't listed
there, `_fetch_cross_exchange_context` just falls back to the CoinGecko
id uppercased, and if that guess doesn't match a real symbol on
Coinbase/Kraken, the lookup simply comes back empty rather than
failing anything.

## Multiple price sources for classification

Stage 1's numeric breach check still reads CoinGecko only — that part
of the pipeline is unchanged on purpose, since widening a
tolerance-based consensus check to multiple sources would be a much
bigger, riskier change than the rest of this update. What changed is
Stage 2: `_fetch_cross_exchange_context` now pulls the same asset's
spot price from **Coinbase** and **Kraken** (both free, public, no API
key) as corroborating evidence for the classifier.

This exists because of a real failure mode: in November 2025, Ethena's
USDe showed an apparent depeg on one exchange that its own team
attributed to that exchange's price oracle, not a problem with USDe's
actual collateral. A single-source numeric check has no way to tell
that apart from a genuine, broad depeg — but a classifier that can see
"CoinGecko shows a breach, but Coinbase and Kraken both show the asset
sitting near $1.00" has a concrete, checkable reason to lean toward
`MANIPULATION_SUSPECTED` instead of paying out immediately. The
updated classification prompt in `_classify_and_resolve` asks the
model to treat that specific disagreement as its strongest signal for
that class.

CoinMarketCap was considered too (per the original request) and
deliberately left out: unlike Coinbase and Kraken, it doesn't have a
free, keyless endpoint for spot prices, and this project's design
principle throughout has been avoiding external dependencies that
need secrets management inside a non-upgradable contract. If a future
version adds it, `_fetch_cross_exchange_context` is exactly where it
would go, following the same try/except-and-omit-on-failure pattern
already used for Coinbase and Kraken.

Both new sources are best-effort and additive: a source that errors,
times out, or doesn't list a given coin is silently omitted from the
context handed to the classifier rather than failing the check. Stage
2 already tolerated a completely unavailable CoinGecko markets fetch
before this change (falling back to `MANIPULATION_SUSPECTED` with
`payout_bps = 0`); cross-exchange data is treated the same way, just
one tier down in how much it's relied on.

## Confidence calibration

`MIN_STRUCTURAL_CONFIDENCE` (75) and `MIN_TRANSIENT_CONFIDENCE` (35)
aren't arbitrary — they're set relative to two well-documented,
contrasting historical depegs:

- **USDC, March 2023** — fell to roughly $0.87 (~13% off peg) on news
  of SVB exposure, and fully recovered within days once the US
  Treasury confirmed deposits were guaranteed. Mechanism intact,
  volatility real: `TRANSIENT_VOLATILITY`.
- **TerraUSD (UST), May 2022** — fell toward zero and never recovered,
  because the mint/burn arbitrage mechanism backing it broke entirely.
  `STRUCTURAL_FAILURE`.

Those two outcomes are about as far apart as a depeg can get, which is
why the bar for the harsher label sits meaningfully higher: calling
something a structural collapse should take more convincing evidence
than calling it a sharp-but-recoverable wobble, especially since the
policy is still paying out identically either way — the distinction
only affects the recorded classification, not whether the buyer gets
paid. `MIN_TRANSIENT_CONFIDENCE`'s lower bar reflects that most real
stablecoin depegs in practice turn out to be transient, not
structural, so treating "temporary" as the more readily-reached
conclusion matches that base rate rather than fighting it.

The classification prompt itself was also sharpened to reduce
ambiguous calls: it now gives the model an explicit tie-breaker
("when in doubt between `TRANSIENT_VOLATILITY` and
`STRUCTURAL_FAILURE`, prefer `TRANSIENT_VOLATILITY`") instead of
leaving borderline cases to the model's own judgment with no stated
default, and it explicitly asks for the cross-exchange comparison to
be cited in `reasoning` when it influenced the call, so a verdict's
justification is checkable against the same evidence a human reviewer
would look at.

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
in `contracts/sepadan.py` for the full rule set.

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

Expiry is checked independently of whether the price fetch succeeds —
a policy whose duration has passed will resolve to `expired` (and
release its reserved capital) the next time anyone calls
`check_depeg`, even if the price feed happens to be unreachable at
that moment. It won't stay stuck `active` forever waiting for a
`RELIABLE` fetch that may never come.

## Project structure

```
sepadan/
├── contracts/
│   └── sepadan.py          # The Intelligent Contract (non-upgradable)
├── frontend/                 # Next.js 15 app (App Router, TypeScript, Tailwind)
│   ├── app/
│   │   ├── page.tsx                  # Home / live pool stats
│   │   ├── underwrite/page.tsx       # Deposit / withdraw
│   │   ├── policy/new/page.tsx       # Buy cover
│   │   ├── policies/page.tsx         # Browse every policy
│   │   └── policy/[id]/page.tsx      # Policy detail, checks, history
│   ├── components/          # NavBar, StatusPill, PoolStats, ActivityFeed
│   ├── lib/                 # genlayer.ts, contract.ts, useWallet.ts, activityLog.ts
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

# 2. Frontend dependencies
cd frontend && npm install && cd ..

# 3. Network
genlayer network   # choose studionet (fund via the 💧 faucet) or testnetBradbury

# 4. Lint — non-upgradable, so this matters more than usual
genvm-lint check contracts/sepadan.py

# 5. Deploy directly from the CLI (no deploy script)
genlayer deploy --contract contracts/sepadan.py

# 6. Copy the printed contract address into frontend/.env
cd frontend && cp .env.example .env
# paste the address as NEXT_PUBLIC_CONTRACT_ADDRESS, then:
npm run dev
```

Sepadan's constructor (`__init__`) takes no arguments — every
parameter that matters (thresholds, tolerances, cooling/grace periods)
is a module-level constant in `contracts/sepadan.py`, checked at
write-time rather than passed in at deploy time.

> **Redeploying after any contract change?** `upgraders` is never
> populated in `__init__`, so GenVM permanently locks the code slot the
> instant `__init__` finishes running. There is no in-place upgrade
> path — every contract edit needs a fresh deploy to a new address, and
> the old address's pool/policies are left behind, inaccessible from
> the new one.

## Testing

There's no separate test suite in this repo — verification happens in
two places:

**`genvm-lint check contracts/sepadan.py`** before every deploy. Since
the contract can't be patched afterward, this is the primary
correctness gate.

**Manual QA against the deployed app**, in this order:

1. **Connect / disconnect wallet** — connect, confirm the address
   shows in the navbar, disconnect, refresh, confirm it stays
   disconnected (doesn't silently reconnect).
2. **Underwrite** — deposit GEN, confirm pool stats update; withdraw a
   portion, confirm your MetaMask balance actually increases (not
   just the on-page pool numbers — this is the step that broke before
   the `_Wallet` EOA-transfer fix, worth checking every time).
3. **Buy cover** — create a policy, confirm it redirects to the
   correct new policy ID, confirm it shows up in `/policies`.
4. **Check for depeg** — trigger a check, open the transaction in the
   [GenLayer Explorer](https://explorer-studio.genlayer.com/), confirm
   `Initial Validators: 5` and a `RELIABLE`/`STALE` `data_quality` under
   Equivalence Principle Outputs.
5. **If a real breach happens** (e.g. testing with a very tight
   threshold like the contract's `0.1%` minimum): confirm the
   resulting `claimed` payout actually lands in the buyer's wallet, or
   that `cooling` shows the right classification and a working
   "Resolve cooling period" action once `cooling_until_day` passes.
6. **Activity feed** — confirm transactions eventually show
   "Finalized" and don't stay stuck on "Pending" after a page reload.

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
  door to manipulation.
- **`str()`, not `copy_to_memory()`, for plain string fields.**
  Attributes read off a `TreeMap`-stored dataclass (e.g.
  `policy.coin_id`) come back as plain Python values, not live storage
  references — passing them to `gl.storage.copy_to_memory()` throws
  `AssertionError: assert td is not None`. Fields used inside a
  non-deterministic block are wrapped with `str()`/`int()` instead.
- **`_Wallet`, not `gl.get_contract_at()`, for payouts.**
  `gl.get_contract_at(addr).emit_transfer(...)` is for Intelligent
  Contract-to-Intelligent Contract transfers only. Sending GEN to a
  buyer's or underwriter's MetaMask address (an EOA) needs the
  `@gl.evm.contract_interface` pattern instead — using the wrong one
  looks fine at the outer call level but the actual value transfer
  fails silently at execution time.
- **`last_checked_day` / `last_price_micros` persist the last check.**
  Without these, the result of a `check_depeg` call only existed in
  the frontend's transient state and vanished on reload. The contract
  now remembers it.
- **The underwriting pool is documented as a copy-paste-reusable
  pattern**, not a shared library — GenVM's single-file deploy model
  means there's no import mechanism between separately-deployed
  contracts. `deposit`/`withdraw`/`get_available_capacity` and their
  backing fields never reference anything depeg-specific, so a future
  parametric coverage contract can lift that whole block into its own
  file unmodified. See the comment above `deposit()`.
- **Adding a stablecoin is two dict entries, not a code change.**
  `COIN_SYMBOLS` (contract) and `SUPPORTED_COINS` (frontend) are the
  only places that need touching to support a new coin — every
  function that uses them (price fetch, cross-exchange lookup, the
  buy-cover form) reads from the map rather than hardcoding coins.

## Deploying the frontend to Vercel

The frontend lives in `frontend/`, not the repo root, so Vercel needs
one non-default setting:

1. Import the repo in Vercel as usual.
2. In **Project Settings → General → Root Directory**, set it to
   `frontend`. Vercel auto-detects Next.js from there — no custom
   build command needed.
3. In **Project Settings → Environment Variables**, add the same
   values `frontend/.env.example` documents (`.env` itself is
   gitignored and never reaches Vercel):
   - `NEXT_PUBLIC_GENLAYER_NETWORK` = `studionet` (or `testnetBradbury`)
   - `NEXT_PUBLIC_GENLAYER_RPC_URL` = `https://studio.genlayer.com/api`
   - `NEXT_PUBLIC_CHAIN_ID` = `61999`
   - `NEXT_PUBLIC_EXPLORER_URL` = `https://explorer-studio.genlayer.com`
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` = the address from your own
     `genlayer deploy` (see Setup above) — Vercel only serves the
     frontend, it doesn't deploy the contract.
4. Deploy. Redeploy (or update the env var and redeploy) any time the
   contract address changes, e.g. after a fresh deploy following a
   contract edit — see the non-upgradability note below for why that
   happens more than you might expect.

## Non-upgradability

`contracts/sepadan.py` never populates the `upgraders` list in
`__init__`. GenVM automatically calls `root.lock_default()` right after
`__init__` returns, permanently locking the code slot. There is no
admin function and no override anywhere in the contract.

## Path forward

- **Continued development.** Stablecoin support widened from 4 to 8
  coins and Stage 2 now cross-checks CoinGecko against Coinbase and
  Kraken (see Supported stablecoins / Multiple price sources above).
  Next up: tuning `MIN_STRUCTURAL_CONFIDENCE`/`MIN_TRANSIENT_CONFIDENCE`
  against a larger sample of real depeg events as they occur (the
  current calibration is grounded in two well-known historical cases,
  not a full dataset), and potentially a third cross-exchange source
  once one exists with a free, keyless spot-price endpoint.
- **Real external use.** Parametric depeg cover is a genuine gap for
  anyone holding stablecoin treasury on-chain — DAOs, small protocols,
  and individual holders currently have no on-chain way to hedge this
  risk without trusting a centralized insurer's claims process. Sepadan's
  claims process is the point: nobody has to trust anyone.
- **Community angle.** The share-based underwriting pool is documented
  as a copy-paste-reusable pattern (see Design notes above) — the same
  structure (deposit → shares → reserve-then-payout → release)
  applies to any parametric coverage product, not just stablecoin
  depegs. No other insurance products are implemented yet; this is
  scoped to keeping the pool code lift-able, not building a second
  product.

## License

MIT
