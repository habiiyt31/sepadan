# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Sepadan v2 ("on par" / "equivalent" in Indonesian) — Stablecoin Depeg
Adjudication
-----------------------------------------------------------------------------
A parametric insurance market for stablecoin depegs, built as an
adjudication contract in the sense GenLayer's own positioning uses that
word: most of a depeg claim is a plain numeric fact (is the price off
peg by more than X%?), but *why* it's off peg -- a genuine structural
failure, transient liquidity stress, or an anomalous/manipulated quote
-- is a judgment call that benefits from AI reasoning over evidence, not
a threshold check. This contract keeps the numeric part numeric and
only escalates to AI once there's something worth judging.

TWO-STAGE RESOLUTION (this is the core design change from v1):

  Stage 1 -- Numeric (deterministic-tolerance consensus, no LLM):
    Validators independently fetch CoinGecko's spot price. If it isn't
    within PRICE_TOLERANCE_MICROS of $1 by threshold_bps, nothing
    happens yet -- the policy stays active. This stage answers "is
    something wrong?" and needs no AI judgment: it's arithmetic on a
    number every validator fetched themselves.

  Stage 2 -- Classification (LLM judgment, only runs if Stage 1 finds
    a real numeric breach):
    Validators fetch supplementary market data (24h volume, market
    cap) and an LLM classifies the depeg as:
      - STRUCTURAL_FAILURE   -> broad, sustained, mechanism-level break
      - TRANSIENT_VOLATILITY -> real but likely temporary
      - MANIPULATION_SUSPECTED -> anomalous/isolated, don't pay out yet
    STRUCTURAL_FAILURE and TRANSIENT_VOLATILITY both pay the policy in
    full -- the buyer's coverage doesn't depend on which one it is, but
    the classification itself is recorded for actuarial reporting.
    MANIPULATION_SUSPECTED opens a cooling period instead of an
    immediate payout, and a second look is taken once it elapses.

VALIDATOR DESIGN (business-rule consistency, not just field matching):
  Both stages use a custom gl.vm.run_nondet_unsafe validator instead of
  gl.eq_principle.strict_eq. Neither validator just checks "did every
  field match" -- each enforces that the *combination* of fields is
  internally consistent (e.g. classification=STRUCTURAL_FAILURE forces
  confidence_score >= 70 AND payout_bps == 10000; if the model returns
  an inconsistent combination, the response is rejected outright, not
  silently accepted). See _validate_price_payload and
  _validate_classification_payload below.

DATA QUALITY GATING:
  Every non-deterministic response carries an explicit data_quality
  field (RELIABLE / STALE / SUSPICIOUS). A payout can only happen on
  data_quality == RELIABLE. If CoinGecko is down, returns malformed
  data, or a price of zero, the contract does not guess -- it records
  the failure and leaves the policy active for a retry, rather than
  either crashing or paying out on bad data.

FETCH FAILURES AND MANUAL REVIEW:
  _fetch_price_micros never lets a network/parsing exception escape
  into consensus-breaking territory -- it's caught and turned into an
  explicit STALE result. If a policy accumulates MAX_FETCH_FAILURES
  consecutive failed checks (e.g. sustained CoinGecko downtime), the
  buyer can call request_manual_review() for a grace-period extension,
  since there is no privileged admin in this contract who could
  otherwise intervene (see NON-UPGRADABLE below).

CLOSURE SAFETY:
  Every value a leader_fn/validator_fn closure reads is copied to a
  plain local variable *before* the closure is defined -- never read
  from `self` or a method parameter inside the closure body itself.
  This avoids relying on how the GenVM sandbox serializes captured
  outer-scope state across the validator environment.

SINGLE-FILE CONSTRAINT:
  All logic -- including the two payload validators -- lives in this
  one file on purpose. The deploy pipeline (`genlayer deploy` via
  deploy/deployScript.ts) reads and deploys this file as a single
  contract source; splitting validator logic into a separate importable
  module would break that deploy path. The tradeoff is duplicated pure
  validation logic in this project's test suite (see
  test/test_sepadan_validators.py) purely for standalone testability.

NON-UPGRADABLE: `upgraders` is never populated in __init__, so GenVM's
automatic root.lock_default() call after __init__ permanently freezes
the code slot. There is no admin, no fee setter, no override anywhere.
"""

from genlayer import *

from dataclasses import dataclass
import json
import typing


# ── Constants ────────────────────────────────────────────────────────────

USD_MICROS = 1_000_000

# 2000 micros = $0.002 = 0.2% of $1 -- generous enough for normal API
# fetch-timing drift between validators, tight enough that no single
# validator can move the outcome by picking a stale/manipulated quote.
PRICE_TOLERANCE_MICROS = 2000

MAX_FETCH_FAILURES = 3          # consecutive failures before manual review unlocks
GRACE_PERIOD_DAYS = 2            # duration extension granted by manual review
COOLING_PERIOD_DAYS = 2          # wait before re-checking a MANIPULATION_SUSPECTED case

# Calibrated against two well-documented historical reference points
# rather than picked arbitrarily:
#   - USDC's March 2023 SVB-exposure depeg: price fell to roughly
#     $0.87 (~13% off peg) and fully recovered within days once the
#     Treasury announced deposits were guaranteed. A clean example of
#     TRANSIENT_VOLATILITY -- real, sharp, but mechanism-intact.
#   - TerraUSD's May 2022 collapse: price fell toward zero and never
#     recovered, because the mechanism itself (the mint/burn arbitrage
#     with LUNA) broke. A clean example of STRUCTURAL_FAILURE.
# The gap between those two outcomes is large, which is why
# STRUCTURAL_FAILURE keeps a meaningfully higher bar than
# TRANSIENT_VOLATILITY: claiming "the mechanism is broken" should take
# more convincing evidence than claiming "this is a sharp but
# explainable, recoverable wobble", since the former is the harsher
# label to apply to a still-live stablecoin. TRANSIENT_VOLATILITY's
# lower bar reflects that most real depeg events in stablecoin history
# have turned out to be transient, not structural -- treating
# "temporary" as the more readily-reached conclusion matches that base
# rate.
MIN_STRUCTURAL_CONFIDENCE = 75
MIN_TRANSIENT_CONFIDENCE = 35

# CoinGecko ids (used for Stage 1's price + Stage 2's market-data
# fetch) mapped to the ticker symbol other exchanges use for the same
# asset (used only for Stage 2's supplementary cross-exchange check --
# see _fetch_cross_exchange_context). Adding a new supported coin is a
# single line here; no function below needs to change.
COIN_SYMBOLS = {
    "tether": "USDT",
    "usd-coin": "USDC",
    "dai": "DAI",
    "frax": "FRAX",
    "first-digital-usd": "FDUSD",
    "paypal-usd": "PYUSD",
    "gho": "GHO",
    "ethena-usde": "USDE",
}


# Sending GEN to a regular wallet (EOA) is different from sending to
# another Intelligent Contract. gl.get_contract_at(...).emit_transfer()
# is for IC-to-IC transfers only; an EOA recipient (a buyer's or
# underwriter's MetaMask address) must go through this EVM contract
# interface instead. See "Value Transfers > Sending Value to an EOA or
# EVM Contract" in the GenLayer docs.
@gl.evm.contract_interface
class _Wallet:
    class View:
        pass

    class Write:
        pass


@allow_storage
@dataclass
class Policy:
    buyer: Address
    coin_id: str                        # CoinGecko coin id, e.g. "tether", "usd-coin"
    threshold_bps: u32                   # deviation from $1 (bps) that counts as a numeric breach
    payout_amount: u256
    premium_paid: u256
    start_day: u32
    duration_days: u32
    status: str                          # active -> claimed | expired | cooling | (back to active/expired)
    classification: str                  # "" | STRUCTURAL_FAILURE | TRANSIENT_VOLATILITY | MANIPULATION_SUSPECTED
    resolved_note: str                   # short LLM reasoning or system note from the last resolution step
    consecutive_fetch_failures: u32
    cooling_until_day: u32
    manual_reviews_requested: u32
    last_checked_day: u32                # 0 until the first successful (RELIABLE) price check
    last_price_micros: u32               # last RELIABLE price seen, 1_000_000 == $1.00


# ── Pure helpers (no genlayer imports needed; duplicated in tests) ────────


def _validate_price_payload(d: dict) -> bool:
    """
    Schema + business-rule check for a price-fetch response. Not just
    "is this the right shape" -- data_quality gates whether a numeric
    price is even allowed to be present.
    """
    if not isinstance(d, dict):
        return False
    if d.get("data_quality") not in ("RELIABLE", "STALE", "SUSPICIOUS"):
        return False

    if d["data_quality"] == "RELIABLE":
        pm = d.get("price_micros")
        return isinstance(pm, int) and not isinstance(pm, bool) and pm > 0

    # STALE/SUSPICIOUS responses must not smuggle in a usable price.
    return d.get("price_micros") is None


def _validate_classification_payload(d: dict) -> bool:
    """
    JestoraArena-style validator: rejects any response where the
    fields are individually well-typed but *inconsistent as a whole*
    (e.g. STRUCTURAL_FAILURE with low confidence, or a payout_bps that
    doesn't match the classification's required payout behavior).
    """
    if not isinstance(d, dict):
        return False

    classification = d.get("classification")
    if classification not in (
        "STRUCTURAL_FAILURE",
        "TRANSIENT_VOLATILITY",
        "MANIPULATION_SUSPECTED",
    ):
        return False

    if d.get("data_quality") not in ("RELIABLE", "STALE", "SUSPICIOUS"):
        return False

    conf = d.get("confidence_score")
    if not (isinstance(conf, int) and not isinstance(conf, bool) and 0 <= conf <= 100):
        return False

    payout_bps = d.get("payout_bps")
    if not (isinstance(payout_bps, int) and not isinstance(payout_bps, bool) and payout_bps in (0, 10000)):
        return False

    reasoning = d.get("reasoning")
    if not (isinstance(reasoning, str) and 0 < len(reasoning.strip()) <= 300):
        return False

    # Bad data can never justify a payout, regardless of what
    # classification label the model attaches to it.
    if d["data_quality"] != "RELIABLE":
        return classification == "MANIPULATION_SUSPECTED" and payout_bps == 0

    if classification == "STRUCTURAL_FAILURE":
        return conf >= MIN_STRUCTURAL_CONFIDENCE and payout_bps == 10000
    if classification == "TRANSIENT_VOLATILITY":
        return conf >= MIN_TRANSIENT_CONFIDENCE and payout_bps == 10000
    if classification == "MANIPULATION_SUSPECTED":
        return payout_bps == 0
    return False


def _fetch_price_micros(coin_id: str) -> typing.Tuple[typing.Optional[int], str]:
    """
    Must be called from inside a non-deterministic block. Never raises
    -- network/parsing failures are caught and turned into an explicit
    STALE result instead of crashing the leader/validator execution.
    Returns (price_micros_or_None, data_quality).
    """
    try:
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies=usd"
        response = gl.nondet.web.get(url)
        body = response.body.decode("utf-8")
        data = json.loads(body)
        price = float(data[coin_id]["usd"])
    except Exception:
        return None, "STALE"

    if price <= 0:
        return None, "SUSPICIOUS"

    return round(price * USD_MICROS), "RELIABLE"


def _fetch_cross_exchange_context(symbol: str) -> str:
    """
    Must be called from inside a non-deterministic block. Best-effort
    and supplementary only: fetches the same asset's spot price from
    two other free, keyless public exchange APIs (Coinbase, Kraken) so
    Stage 2's classifier can tell "this coin looks off everywhere"
    (a real, broad depeg) apart from "this coin looks fine except on
    the one feed Stage 1 already checked" (an isolated or anomalous
    quote). This is exactly the kind of thing a single exchange's bad
    data can cause -- e.g. Ethena's USDe saw an apparent depeg on one
    exchange in November 2025 that its own team attributed to that
    exchange's oracle, not a problem with USDe's collateral.

    Never raises, and a source that fails or doesn't list the asset is
    just omitted from the summary -- this deliberately does NOT touch
    Stage 1's price-tolerance consensus (still CoinGecko-only, still
    the same PRICE_TOLERANCE_MICROS mechanism), since adding more
    sources to a byte-for-byte-style consensus check would be a much
    bigger change to the adjudication pipeline than adding
    corroborating context to a step that already fetches supplementary
    market data.
    """
    lines = []

    try:
        cb_url = f"https://api.coinbase.com/v2/prices/{symbol}-USD/spot"
        cb_resp = gl.nondet.web.get(cb_url)
        cb_data = json.loads(cb_resp.body.decode("utf-8"))
        cb_price = cb_data.get("data", {}).get("amount")
        if cb_price:
            lines.append(f"Coinbase spot: ${cb_price}")
    except Exception:
        pass

    try:
        kr_url = f"https://api.kraken.com/0/public/Ticker?pair={symbol}USD"
        kr_resp = gl.nondet.web.get(kr_url)
        kr_data = json.loads(kr_resp.body.decode("utf-8"))
        result = kr_data.get("result", {})
        if result and not kr_data.get("error"):
            first_pair = next(iter(result.values()))
            last_trade = first_pair.get("c", [None])[0]
            if last_trade:
                lines.append(f"Kraken last trade: ${last_trade}")
    except Exception:
        pass

    if not lines:
        return "No cross-exchange data available."
    return " | ".join(lines)


class Sepadan(gl.Contract):
    # ---------------- underwriting pool (share-based) ----------------
    pool_balance: u256        # total GEN actually held by the contract
    reserved: u256             # portion earmarked for active policies' payouts
    total_shares: u256
    shares: TreeMap[Address, u256]

    # ---------------- policies ----------------
    policies: TreeMap[u32, Policy]
    next_policy_id: u32

    def __init__(self):
        self.pool_balance = u256(0)
        self.reserved = u256(0)
        self.total_shares = u256(0)
        self.next_policy_id = u32(0)
        # `upgraders` intentionally left empty -> permanently locked.

    # ==================== UNDERWRITING ====================
    # ---------------------------------------------------------------
    # REUSABLE PATTERN, not a shared library: GenVM deploys each
    # contract from a single file (see the SINGLE-FILE CONSTRAINT note
    # at the top of this file), so there's no import mechanism for one
    # deployed Intelligent Contract to share code with another. What
    # "reusable" means here is narrower but still real: everything in
    # this section (deposit, withdraw, get_available_capacity, plus
    # the pool_balance/reserved/total_shares/shares fields above) is
    # self-contained and asset-agnostic -- it never references
    # policies, coin_id, threshold_bps, or anything depeg-specific.
    # A future parametric coverage contract (flight delays, weather,
    # anything with a "reserve capital on write, release or pay out on
    # resolve" shape) can copy this block verbatim into its own
    # single-file contract and it will work unmodified, as long as it
    # also calls reserved += payout_amount / reserved -= payout_amount
    # at the right points in its own resolution logic, the same way
    # create_policy/check_depeg/_classify_and_resolve/resolve_cooling
    # do below.
    # ---------------------------------------------------------------

    @gl.public.write.payable
    def deposit(self) -> u256:
        """Underwriters provide capital and receive shares in return."""
        amount = gl.message.value
        if amount <= u256(0):
            raise gl.vm.UserError("deposit must be positive")

        if self.total_shares == u256(0) or self.pool_balance == u256(0):
            # Bootstrap case -- including the edge case where the pool
            # was fully drained (pool_balance == 0) while total_shares
            # is still nonzero from earlier withdrawals. Rather than
            # dividing by zero, treat this as a fresh 1:1 mint.
            minted = amount
        else:
            minted = (amount * self.total_shares) // self.pool_balance

        depositor = gl.message.sender_address
        current = self.shares.get(depositor, u256(0))
        self.shares[depositor] = u256(int(current) + int(minted))
        self.total_shares = u256(int(self.total_shares) + int(minted))
        self.pool_balance = u256(int(self.pool_balance) + int(amount))
        return minted

    @gl.public.write
    def withdraw(self, shares_to_burn: u256) -> u256:
        holder = gl.message.sender_address
        owned = self.shares.get(holder, u256(0))
        if shares_to_burn <= u256(0) or shares_to_burn > owned:
            raise gl.vm.UserError("invalid share amount")
        if self.total_shares == u256(0):
            raise gl.vm.UserError("pool has no shares outstanding")

        amount = (shares_to_burn * self.pool_balance) // self.total_shares
        available = u256(int(self.pool_balance) - int(self.reserved))
        if amount > available:
            raise gl.vm.UserError(
                "amount exceeds unreserved pool balance -- too much capital "
                "is backing active policies right now"
            )

        self.shares[holder] = u256(int(owned) - int(shares_to_burn))
        self.total_shares = u256(int(self.total_shares) - int(shares_to_burn))
        self.pool_balance = u256(int(self.pool_balance) - int(amount))

        _Wallet(holder).emit_transfer(value=amount)
        return amount

    @gl.public.view
    def get_available_capacity(self) -> u256:
        return u256(int(self.pool_balance) - int(self.reserved))

    # ==================== POLICIES ====================

    @gl.public.write.payable
    def create_policy(
        self,
        coin_id: str,
        threshold_bps: u32,
        payout_amount: u256,
        duration_days: u32,
        current_day: u32,
    ) -> u32:
        premium = gl.message.value
        if premium <= u256(0):
            raise gl.vm.UserError("premium must be positive")
        if int(threshold_bps) < 10 or int(threshold_bps) > 5000:
            raise gl.vm.UserError("threshold_bps must be between 0.1% and 50%")
        if int(duration_days) < 1 or int(duration_days) > 365:
            raise gl.vm.UserError("duration_days must be between 1 and 365")

        available = int(self.pool_balance) - int(self.reserved)
        if int(payout_amount) > available:
            raise gl.vm.UserError(
                "pool cannot currently underwrite a payout this large -- "
                "not enough unreserved capital from underwriters"
            )

        pid = self.next_policy_id
        self.policies[pid] = Policy(
            buyer=gl.message.sender_address,
            coin_id=coin_id,
            threshold_bps=threshold_bps,
            payout_amount=payout_amount,
            premium_paid=premium,
            start_day=current_day,
            duration_days=duration_days,
            status="active",
            classification="",
            resolved_note="",
            consecutive_fetch_failures=u32(0),
            cooling_until_day=u32(0),
            manual_reviews_requested=u32(0),
            last_checked_day=u32(0),
            last_price_micros=u32(0),
        )
        self.next_policy_id = u32(pid + 1)

        self.reserved = u256(int(self.reserved) + int(payout_amount))
        self.pool_balance = u256(int(self.pool_balance) + int(premium))
        return pid

    # ---------------- Stage 1: numeric check ----------------

    @gl.public.write
    def check_depeg(self, policy_id: u32, current_day: u32) -> str:
        """
        Anyone can call this. Fetches the live price (Stage 1, numeric,
        no LLM). If a real breach is found, hands off to Stage 2
        (_classify_and_resolve) for AI classification before any
        payout happens. Returns the resulting status.
        """
        policy = self.policies[policy_id]
        if policy.status != "active":
            raise gl.vm.UserError("policy is not active")

        coin_id = str(policy.coin_id)
        threshold_bps = int(policy.threshold_bps)

        def price_leader_fn() -> str:
            price_micros, quality = _fetch_price_micros(coin_id)
            return json.dumps(
                {"price_micros": price_micros, "data_quality": quality}, sort_keys=True
            )

        def price_validator_fn(leaders_res: typing.Any) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return False
            try:
                leader = json.loads(leaders_res.calldata)
            except Exception:
                return False
            if not _validate_price_payload(leader):
                return False
            mine = json.loads(price_leader_fn())
            if not _validate_price_payload(mine):
                return False
            if mine["data_quality"] != leader["data_quality"]:
                return False
            if leader["data_quality"] == "RELIABLE":
                return abs(int(mine["price_micros"]) - int(leader["price_micros"])) <= PRICE_TOLERANCE_MICROS
            return True

        price_raw = gl.vm.run_nondet_unsafe(price_leader_fn, price_validator_fn)
        price_result = json.loads(price_raw)
        data_quality = str(price_result["data_quality"])

        if data_quality != "RELIABLE":
            # Expiry doesn't need a price at all -- it's just a day
            # count. Checking it here too, not only on the RELIABLE
            # path below, matters: without this, a policy whose
            # duration has already passed would stay stuck "active"
            # forever if the price feed happened to be unreachable on
            # every check after expiry, leaving its reserved capital
            # locked out of the pool indefinitely.
            expired_without_price = int(current_day) > int(policy.start_day) + int(policy.duration_days)
            policy.consecutive_fetch_failures = u32(int(policy.consecutive_fetch_failures) + 1)
            if expired_without_price:
                self.reserved = u256(int(self.reserved) - int(policy.payout_amount))
                policy.status = "expired"
                return "expired"
            return "active"

        policy.consecutive_fetch_failures = u32(0)
        price_micros = int(price_result["price_micros"])
        policy.last_checked_day = current_day
        policy.last_price_micros = u32(price_micros)
        deviation_bps = abs(price_micros - USD_MICROS) * 10000 // USD_MICROS
        expired = int(current_day) > int(policy.start_day) + int(policy.duration_days)

        if deviation_bps >= threshold_bps:
            return self._classify_and_resolve(policy_id, policy, price_micros, current_day)

        if expired:
            self.reserved = u256(int(self.reserved) - int(policy.payout_amount))
            policy.status = "expired"
            return "expired"

        return "active"

    # ---------------- Stage 2: AI classification ----------------

    def _classify_and_resolve(
        self, policy_id: u32, policy: "Policy", price_micros: int, current_day: u32
    ) -> str:
        coin_id = str(policy.coin_id)
        price_micros_local = int(price_micros)
        # Copied to a local before the closure, per this contract's
        # closure-safety rule -- never read COIN_SYMBOLS (a module-level
        # dict) from inside classify_leader_fn itself.
        exchange_symbol = COIN_SYMBOLS.get(coin_id, coin_id.upper())

        def classify_leader_fn() -> str:
            market_url = (
                f"https://api.coingecko.com/api/v3/coins/markets"
                f"?vs_currency=usd&ids={coin_id}"
            )
            try:
                resp = gl.nondet.web.get(market_url)
                market_body = resp.body.decode("utf-8")
                fetch_ok = len(market_body) > 0
            except Exception:
                market_body = ""
                fetch_ok = False

            if not fetch_ok:
                return json.dumps(
                    {
                        "classification": "MANIPULATION_SUSPECTED",
                        "confidence_score": 0,
                        "data_quality": "STALE",
                        "payout_bps": 0,
                        "reasoning": "supplementary market data unavailable",
                    },
                    sort_keys=True,
                )

            cross_exchange = _fetch_cross_exchange_context(exchange_symbol)
            price_usd = price_micros_local / USD_MICROS
            prompt = f"""
A stablecoin depeg has been numerically confirmed for {coin_id}.
Source of the confirmed breach: CoinGecko, price ${price_usd:.6f} (target: $1.00)

Supplementary CoinGecko market data (24h volume, market cap, exchange info):
{market_body[:2500]}

Independent cross-exchange spot prices for the same asset (corroborating
evidence only -- these were NOT used to confirm the breach itself):
{cross_exchange}

Classify this depeg using the evidence above:

- STRUCTURAL_FAILURE: the depeg shows up broadly, not just on the one
  feed that triggered this check -- cross-exchange prices (if
  available) are also meaningfully off peg, and/or 24h volume or
  market cap data suggests a real, sustained break rather than a
  momentary print. This is the harsher of the two "real depeg" labels
  and should reflect real conviction that the mechanism itself is
  compromised, not just that the price is currently low.
- TRANSIENT_VOLATILITY: the depeg looks real (cross-exchange data
  roughly agrees something is off) but nothing here suggests the
  mechanism is broken -- consistent with a liquidity crunch or a
  sharp but explainable move that plausibly self-corrects. When in
  doubt between this and STRUCTURAL_FAILURE, prefer this label: most
  real-world stablecoin depegs turn out to be transient, not
  structural, so STRUCTURAL_FAILURE should only be chosen when the
  evidence clearly rules out a temporary explanation.
- MANIPULATION_SUSPECTED: the breach looks isolated to the single feed
  that triggered this check -- e.g. cross-exchange prices show the
  asset trading close to $1.00 even though CoinGecko showed a breach,
  or the supplementary data looks implausible or internally
  inconsistent. Treat a clear disagreement between CoinGecko and the
  cross-exchange prices as the single strongest signal for this class.

Respond ONLY as compact JSON, no markdown fences, exactly:
{{"classification": "STRUCTURAL_FAILURE" | "TRANSIENT_VOLATILITY" | "MANIPULATION_SUSPECTED",
  "confidence_score": <integer 0-100>,
  "data_quality": "RELIABLE" | "STALE" | "SUSPICIOUS",
  "payout_bps": <integer 0 or 10000>,
  "reasoning": "<short factual reason, cite the cross-exchange comparison if it influenced the call>"}}

Rules you must follow exactly:
- STRUCTURAL_FAILURE requires confidence_score >= {MIN_STRUCTURAL_CONFIDENCE} and payout_bps = 10000.
- TRANSIENT_VOLATILITY requires confidence_score >= {MIN_TRANSIENT_CONFIDENCE} and payout_bps = 10000.
- MANIPULATION_SUSPECTED requires payout_bps = 0.
- If the supplementary market data looks empty, malformed, or
  implausible, set data_quality to STALE or SUSPICIOUS and use
  MANIPULATION_SUSPECTED with payout_bps = 0 -- never pay out on data
  you flagged as unreliable.
- No cross-exchange data being available is not by itself a reason to
  suspect manipulation -- fall back to the CoinGecko market data alone
  in that case.
"""
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            data = json.loads(raw)
            return json.dumps(
                {
                    "classification": str(data.get("classification", "")),
                    "confidence_score": int(data.get("confidence_score", 0)),
                    "data_quality": str(data.get("data_quality", "")),
                    "payout_bps": int(data.get("payout_bps", 0)),
                    "reasoning": str(data.get("reasoning", ""))[:280],
                },
                sort_keys=True,
            )

        def classify_validator_fn(leaders_res: typing.Any) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return False
            try:
                leader = json.loads(leaders_res.calldata)
            except Exception:
                return False
            if not _validate_classification_payload(leader):
                return False
            mine = json.loads(classify_leader_fn())
            if not _validate_classification_payload(mine):
                return False
            return mine["classification"] == leader["classification"]

        raw_result = gl.vm.run_nondet_unsafe(classify_leader_fn, classify_validator_fn)
        result = json.loads(raw_result)

        classification = str(result["classification"])
        reasoning = str(result["reasoning"])

        policy.classification = classification
        policy.resolved_note = reasoning

        if classification == "MANIPULATION_SUSPECTED":
            policy.status = "cooling"
            policy.cooling_until_day = u32(int(current_day) + COOLING_PERIOD_DAYS)
            return "cooling"

        # STRUCTURAL_FAILURE or TRANSIENT_VOLATILITY -- both pay the
        # policy in full; the classification is what differs for
        # actuarial reporting, not the payout amount.
        self.reserved = u256(int(self.reserved) - int(policy.payout_amount))
        self.pool_balance = u256(int(self.pool_balance) - int(policy.payout_amount))
        _Wallet(policy.buyer).emit_transfer(value=policy.payout_amount)
        policy.status = "claimed"
        return "claimed"

    # ---------------- Cooling period resolution ----------------

    @gl.public.write
    def resolve_cooling(self, policy_id: u32, current_day: u32) -> str:
        """
        After a MANIPULATION_SUSPECTED classification, anyone can call
        this once the cooling period has elapsed to take a second,
        numeric-only look. No second AI classification here on
        purpose -- if the numeric breach persists after the cooling
        window, that persistence itself is treated as sufficient
        confirmation to pay out; if the price recovered, it was a
        false alarm.
        """
        policy = self.policies[policy_id]
        if policy.status != "cooling":
            raise gl.vm.UserError("policy is not in a cooling period")
        if int(current_day) < int(policy.cooling_until_day):
            raise gl.vm.UserError("cooling period has not elapsed yet")

        coin_id = str(policy.coin_id)
        threshold_bps = int(policy.threshold_bps)

        def leader_fn() -> str:
            price_micros, quality = _fetch_price_micros(coin_id)
            return json.dumps(
                {"price_micros": price_micros, "data_quality": quality}, sort_keys=True
            )

        def validator_fn(leaders_res: typing.Any) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return False
            try:
                leader = json.loads(leaders_res.calldata)
            except Exception:
                return False
            if not _validate_price_payload(leader):
                return False
            mine = json.loads(leader_fn())
            if not _validate_price_payload(mine):
                return False
            if mine["data_quality"] != leader["data_quality"]:
                return False
            if leader["data_quality"] == "RELIABLE":
                return abs(int(mine["price_micros"]) - int(leader["price_micros"])) <= PRICE_TOLERANCE_MICROS
            return True

        raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        result = json.loads(raw)

        if result["data_quality"] != "RELIABLE":
            # Still can't get trustworthy data -- stay in cooling
            # rather than guessing; callable again later.
            return "cooling"

        price_micros = int(result["price_micros"])
        policy.last_checked_day = current_day
        policy.last_price_micros = u32(price_micros)
        deviation_bps = abs(price_micros - USD_MICROS) * 10000 // USD_MICROS

        if deviation_bps >= threshold_bps:
            self.reserved = u256(int(self.reserved) - int(policy.payout_amount))
            self.pool_balance = u256(int(self.pool_balance) - int(policy.payout_amount))
            _Wallet(policy.buyer).emit_transfer(value=policy.payout_amount)
            policy.status = "claimed"
            policy.resolved_note = "depeg persisted through cooling period, confirmed"
            return "claimed"

        expired = int(current_day) > int(policy.start_day) + int(policy.duration_days)
        self.reserved = u256(int(self.reserved) - int(policy.payout_amount))
        policy.status = "expired" if expired else "active"
        policy.resolved_note = "price recovered during cooling period, false alarm"
        return str(policy.status)

    # ---------------- Manual review (fetch-failure fallback) ----------------

    @gl.public.write
    def request_manual_review(self, policy_id: u32) -> None:
        """
        If CoinGecko has been unreachable for MAX_FETCH_FAILURES
        consecutive check_depeg calls, the buyer can call this for a
        grace-period extension instead of losing coverage to an API
        outage. There is no privileged admin who could otherwise
        intervene (see NON-UPGRADABLE), so this is a permissionless,
        buyer-triggered safety valve rather than a human review queue.
        """
        policy = self.policies[policy_id]
        if policy.status != "active":
            raise gl.vm.UserError("policy is not active")
        if int(policy.consecutive_fetch_failures) < MAX_FETCH_FAILURES:
            raise gl.vm.UserError(
                f"manual review requires {MAX_FETCH_FAILURES} consecutive fetch failures first"
            )

        policy.duration_days = u32(int(policy.duration_days) + GRACE_PERIOD_DAYS)
        policy.consecutive_fetch_failures = u32(0)
        policy.manual_reviews_requested = u32(int(policy.manual_reviews_requested) + 1)

    # ---------------- Views ----------------

    @gl.public.view
    def get_policy(self, policy_id: u32) -> Policy:
        return self.policies[policy_id]

    @gl.public.view
    def get_policy_count(self) -> u32:
        return self.next_policy_id

    @gl.public.view
    def get_pool_state(self) -> dict:
        return {
            "pool_balance": self.pool_balance,
            "reserved": self.reserved,
            "available": u256(int(self.pool_balance) - int(self.reserved)),
            "total_shares": self.total_shares,
        }
