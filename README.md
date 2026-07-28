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

## Non-upgradability

`contracts/sepadan.py` never populates the `upgraders` list in
`__init__`. GenVM automatically calls `root.lock_default()` right after
`__init__` returns, permanently locking the code slot. There is no
admin function and no override anywhere in the contract.

## Path forward

- **Continued development.** The two-stage design (numeric → AI
  classification) extends to more coins and more classification
  nuance without changing the core contract shape — next up is
  widening `SUPPORTED_COINS` past the four majors and tuning the
  confidence thresholds against real depeg history rather than the
  estimated defaults currently in `contracts/sepadan.py`.
- **Real external use.** Parametric depeg cover is a genuine gap for
  anyone holding stablecoin treasury on-chain — DAOs, small protocols,
  and individual holders currently have no on-chain way to hedge this
  risk without trusting a centralized insurer's claims process. Sepadan's
  claims process is the point: nobody has to trust anyone.
- **Community angle.** The share-based underwriting pool is
  reusable as a pattern beyond this specific contract — the same
  structure (deposit → shares → reserve-then-payout → release)
  applies to any parametric coverage product, not just stablecoin
  depegs.

## License

MIT
