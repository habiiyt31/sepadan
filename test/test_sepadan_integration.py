"""
Integration tests for the Sepadan v2 contract, run against a live
GenLayer Studio instance via `gltest`. These exercise real consensus
and real (non-deterministic) web fetches -- see
test_sepadan_validators.py for fast, offline tests of the pure
validator logic used inside the non-deterministic blocks.

Run with:
    genlayer network        # select studionet or testnetBradbury
    genvm-lint check contracts/sepadan.py
    gltest --network studionet test/test_sepadan_integration.py
"""

import pytest
from gltest import get_contract_factory


GEN = 1_000_000_000_000_000_000  # 1 GEN in wei


@pytest.fixture
def sepadan_contract():
    factory = get_contract_factory("Sepadan")
    return factory.deploy(args=[])


# ── Pool share math ──────────────────────────────────────────────────────

def test_first_deposit_bootstraps_1to1(sepadan_contract):
    minted = sepadan_contract.deposit(value=5 * GEN)
    assert int(minted) == 5 * GEN

    pool = sepadan_contract.get_pool_state()
    assert int(pool["pool_balance"]) == 5 * GEN
    assert int(pool["total_shares"]) == 5 * GEN


def test_second_deposit_mints_proportionally(sepadan_contract):
    sepadan_contract.deposit(value=5 * GEN)
    minted = sepadan_contract.deposit(value=5 * GEN)
    # pool_balance == total_shares here, so this should also be 1:1
    assert int(minted) == 5 * GEN


def test_withdraw_rejects_more_than_owned(sepadan_contract):
    sepadan_contract.deposit(value=5 * GEN)
    with pytest.raises(Exception):
        sepadan_contract.withdraw(args=[6 * GEN])


def test_withdraw_rejects_when_pool_fully_reserved(sepadan_contract):
    sepadan_contract.deposit(value=5 * GEN)
    sepadan_contract.create_policy(
        args=["tether", 300, 5 * GEN, 30, 0],
        value=int(0.05 * GEN),
    )
    # entire pool is now reserved -- any withdraw should fail
    with pytest.raises(Exception):
        sepadan_contract.withdraw(args=[1 * GEN])


def test_withdraw_on_empty_pool_does_not_crash(sepadan_contract):
    # No deposits at all -- total_shares == 0. withdraw() must reject
    # cleanly (invalid share amount / no shares outstanding), not
    # divide by zero.
    with pytest.raises(Exception):
        sepadan_contract.withdraw(args=[1 * GEN])


# ── Policy lifecycle ─────────────────────────────────────────────────────

def test_create_policy_reserves_capital(sepadan_contract):
    sepadan_contract.deposit(value=5 * GEN)
    policy_id = sepadan_contract.create_policy(
        args=["tether", 300, 1 * GEN, 7, 0],
        value=int(0.05 * GEN),
    )
    policy = sepadan_contract.get_policy(args=[policy_id])
    assert policy["status"] == "active"
    assert policy["classification"] == ""

    pool = sepadan_contract.get_pool_state()
    assert int(pool["reserved"]) == 1 * GEN


def test_create_policy_rejects_insufficient_reserved_capital(sepadan_contract):
    sepadan_contract.deposit(value=1 * GEN)
    with pytest.raises(Exception):
        sepadan_contract.create_policy(
            args=["tether", 300, 2 * GEN, 7, 0],  # payout > pool
            value=int(0.05 * GEN),
        )


def test_create_policy_rejects_threshold_below_minimum(sepadan_contract):
    sepadan_contract.deposit(value=5 * GEN)
    with pytest.raises(Exception):
        sepadan_contract.create_policy(
            args=["tether", 5, 1 * GEN, 7, 0],  # 0.05% < 0.1% minimum
            value=int(0.05 * GEN),
        )


def test_policy_expires_without_depeg(sepadan_contract):
    sepadan_contract.deposit(value=5 * GEN)
    policy_id = sepadan_contract.create_policy(
        args=["usd-coin", 300, 1 * GEN, 1, 0],
        value=int(0.05 * GEN),
    )
    # current_day far past start_day + duration_days -- no depeg
    # expected against a real stablecoin, so this should land on
    # "active" (no breach) repeated calls or "expired" once the day
    # counter is pushed forward. We only assert it never crashes and
    # never lands on "claimed" for a coin that isn't actually depegged.
    status = sepadan_contract.check_depeg(args=[policy_id, 999999])
    assert status in ("expired", "active")

    policy = sepadan_contract.get_policy(args=[policy_id])
    assert policy["status"] in ("expired", "active")


def test_manual_review_rejected_before_failure_threshold(sepadan_contract):
    sepadan_contract.deposit(value=5 * GEN)
    policy_id = sepadan_contract.create_policy(
        args=["tether", 300, 1 * GEN, 7, 0],
        value=int(0.05 * GEN),
    )
    # consecutive_fetch_failures starts at 0 -- must be rejected
    with pytest.raises(Exception):
        sepadan_contract.request_manual_review(args=[policy_id])


def test_resolve_cooling_rejected_when_not_cooling(sepadan_contract):
    sepadan_contract.deposit(value=5 * GEN)
    policy_id = sepadan_contract.create_policy(
        args=["tether", 300, 1 * GEN, 7, 0],
        value=int(0.05 * GEN),
    )
    with pytest.raises(Exception):
        sepadan_contract.resolve_cooling(args=[policy_id, 999999])
