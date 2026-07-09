"""
Integration tests for the Sepadan contract, run against a live GenLayer
Studio instance.

Run with:
    genlayer network        # select studionet or testnetBradbury
    genvm-lint check contracts/sepadan.py
    gltest --network studionet

Price-dependent tests (check_depeg) hit the real CoinGecko public API,
so:
  - Use a genuinely stable coin (e.g. "usd-coin", "tether") to test the
    "no depeg, still active" and "expired" paths predictably.
  - There is no free, reliable way to test the "claimed" (actual depeg)
    path against live data on demand — historical depeg events aren't
    reproducible via the live endpoint. Cover that path with the
    included offline unit test that stubs the price fetch instead.
"""

import pytest
from gltest import get_contract_factory


@pytest.fixture
def sepadan_contract():
    factory = get_contract_factory("Sepadan")
    contract = factory.deploy(args=[])
    return contract


def test_deposit_mints_shares(sepadan_contract):
    minted = sepadan_contract.deposit(value=1_000_000_000_000_000_000)  # 1 GEN
    assert int(minted) == 1_000_000_000_000_000_000

    pool = sepadan_contract.get_pool_state()
    assert int(pool["pool_balance"]) == 1_000_000_000_000_000_000
    assert int(pool["reserved"]) == 0


def test_cannot_underwrite_more_than_available_capacity(sepadan_contract):
    sepadan_contract.deposit(value=1_000_000_000_000_000_000)  # 1 GEN pool

    with pytest.raises(Exception):
        sepadan_contract.create_policy(
            args=["tether", 300, 2_000_000_000_000_000_000, 7, 0],  # payout > pool
            value=10_000_000_000_000_000,  # 0.01 GEN premium
        )


def test_create_policy_reserves_capital(sepadan_contract):
    sepadan_contract.deposit(value=5_000_000_000_000_000_000)  # 5 GEN pool

    policy_id = sepadan_contract.create_policy(
        args=["tether", 300, 1_000_000_000_000_000_000, 7, 0],  # 1 GEN payout, 3% threshold
        value=50_000_000_000_000_000,  # 0.05 GEN premium
    )
    policy = sepadan_contract.get_policy(args=[policy_id])
    assert policy["status"] == "active"
    assert int(policy["payout_amount"]) == 1_000_000_000_000_000_000

    pool = sepadan_contract.get_pool_state()
    assert int(pool["reserved"]) == 1_000_000_000_000_000_000


def test_policy_expires_without_depeg(sepadan_contract):
    sepadan_contract.deposit(value=5_000_000_000_000_000_000)
    policy_id = sepadan_contract.create_policy(
        args=["usd-coin", 300, 1_000_000_000_000_000_000, 1, 0],
        value=50_000_000_000_000_000,
    )
    # current_day far past start_day + duration_days -> expired path
    status = sepadan_contract.check_depeg(args=[policy_id, 999])
    assert status == "expired"

    pool = sepadan_contract.get_pool_state()
    assert int(pool["reserved"]) == 0  # reserve released back to underwriters


def test_withdraw_respects_reserved_capital(sepadan_contract):
    sepadan_contract.deposit(value=5_000_000_000_000_000_000)
    sepadan_contract.create_policy(
        args=["tether", 300, 4_000_000_000_000_000_000, 30, 0],
        value=50_000_000_000_000_000,
    )
    # Only ~1 GEN + premium is unreserved; trying to withdraw all 5 GEN
    # worth of shares should fail.
    with pytest.raises(Exception):
        sepadan_contract.withdraw(args=[5_000_000_000_000_000_000])
