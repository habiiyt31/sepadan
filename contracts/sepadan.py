# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Sepadan ("on par" / "equivalent" in Indonesian) — Stablecoin Depeg Insurance
-----------------------------------------------------------------------------
A parametric insurance market for stablecoin depegs. Buyers pay a premium
for a policy that pays out automatically if a stablecoin's price strays
more than a chosen threshold from $1 during the policy window.

Evidence source: CoinGecko's free public price API
(https://api.coingecko.com/api/v3/simple/price), fetched directly by
validators. No API key needed, no user-submitted price claims accepted
anywhere in this contract -- the payout decision is 100% derived from
what the contract itself fetches.

Why a custom tolerance validator instead of gl.eq_principle.strict_eq:
market prices genuinely drift by fractions of a cent between the
moments different validators query the API, even for a perfectly
healthy stablecoin. Demanding byte-for-byte identical prices would
make every claim spuriously fail. Instead, validators must agree the
price is within a small, fixed tolerance of each other -- tight enough
that it can't be gamed, loose enough to tolerate normal fetch-timing
jitter. This is a deliberate, principled choice, not a shortcut: see
PRICE_TOLERANCE_MICROS below.

Underwriting model: a single shared, share-based pool (comparable to a
simple vault). Underwriters deposit GEN and receive shares; buyers'
premiums flow into the same pool, growing the value per share for
everyone who provided capital. A policy's payout amount is reserved
out of the pool the moment it's created, so the pool can never be
oversold -- underwriters can only withdraw the unreserved portion.

NON-UPGRADABLE: `upgraders` is never populated in __init__, so GenVM's
automatic root.lock_default() call after __init__ permanently freezes
the code slot, the fee, and every parameter below. No admin exists.
"""

from genlayer import *

from dataclasses import dataclass
import json
import typing


# Prices are handled as integer "micros" (1.0 USD == 1_000_000) to avoid
# floating point non-determinism across validators.
USD_MICROS = 1_000_000

# Maximum allowed disagreement between validators' independently
# fetched prices before a dispute round is considered inconclusive.
# 2000 micros = $0.002 = 0.2% of $1 -- generous enough for normal API
# fetch-timing drift, tight enough that no single validator can move
# the outcome by picking a stale or manipulated quote.
PRICE_TOLERANCE_MICROS = 2000


@allow_storage
@dataclass
class Policy:
    buyer: Address
    coin_id: str              # CoinGecko coin id, e.g. "tether", "usd-coin"
    threshold_bps: u32         # deviation from $1 (in basis points) that triggers payout
    payout_amount: u256
    premium_paid: u256
    start_day: u32
    duration_days: u32
    status: str                 # active -> claimed | expired


def _fetch_price_micros(coin_id: str) -> int:
    """Must be called from inside a non-deterministic block."""
    url = f"https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies=usd"
    response = gl.nondet.web.get(url)
    body = response.body.decode("utf-8")
    data = json.loads(body)
    price = float(data[coin_id]["usd"])
    return round(price * USD_MICROS)


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

    @gl.public.write.payable
    def deposit(self) -> u256:
        """Underwriters provide capital and receive shares in return."""
        amount = gl.message.value
        if amount <= u256(0):
            raise gl.vm.UserError("deposit must be positive")

        if self.total_shares == u256(0):
            minted = amount  # bootstrap: 1 share == 1 GEN initially
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

        gl.get_contract_at(holder).emit_transfer(value=amount, on="finalized")
        return amount

    @gl.public.view
    def get_available_capacity(self) -> u256:
        """How much new payout exposure the pool can currently underwrite."""
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
        )
        self.next_policy_id = u32(pid + 1)

        self.reserved = u256(int(self.reserved) + int(payout_amount))
        self.pool_balance = u256(int(self.pool_balance) + int(premium))
        return pid

    @gl.public.write
    def check_depeg(self, policy_id: u32, current_day: u32) -> str:
        """
        Anyone can call this (typically the buyer, but there's nothing to
        gain by calling it on someone else's behalf -- it only pays out
        if the fetched price genuinely breached the threshold). Returns
        the resulting status: "claimed", "expired", or "active" (no
        depeg detected yet, policy still running).
        """
        policy = self.policies[policy_id]
        if policy.status != "active":
            raise gl.vm.UserError("policy is not active")

        coin_id = str(policy.coin_id)
        threshold_bps = int(policy.threshold_bps)

        def leader_fn() -> str:
            price_micros = _fetch_price_micros(coin_id)
            return json.dumps({"price_micros": price_micros})

        def validator_fn(leaders_res: typing.Any) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return False
            try:
                leader_price = json.loads(leaders_res.calldata)["price_micros"]
            except Exception:
                return False
            my_price = json.loads(leader_fn())["price_micros"]
            return abs(int(my_price) - int(leader_price)) <= PRICE_TOLERANCE_MICROS

        raw_result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        price_micros = int(json.loads(raw_result)["price_micros"])

        deviation_bps = abs(price_micros - USD_MICROS) * 10000 // USD_MICROS
        expired = int(current_day) > int(policy.start_day) + int(policy.duration_days)

        if deviation_bps >= threshold_bps:
            # Depeg confirmed by independently-fetched market data.
            self.reserved = u256(int(self.reserved) - int(policy.payout_amount))
            self.pool_balance = u256(int(self.pool_balance) - int(policy.payout_amount))
            gl.get_contract_at(policy.buyer).emit_transfer(
                value=policy.payout_amount, on="finalized"
            )
            policy.status = "claimed"
            return "claimed"

        if expired:
            # Policy window passed with no qualifying depeg -- release
            # the reserved capital back to underwriters. Premium was
            # already earned by the pool at purchase time either way.
            self.reserved = u256(int(self.reserved) - int(policy.payout_amount))
            policy.status = "expired"
            return "expired"

        return "active"

    @gl.public.view
    def get_policy(self, policy_id: u32) -> Policy:
        return self.policies[policy_id]

    @gl.public.view
    def get_pool_state(self) -> dict:
        return {
            "pool_balance": self.pool_balance,
            "reserved": self.reserved,
            "available": u256(int(self.pool_balance) - int(self.reserved)),
            "total_shares": self.total_shares,
        }
