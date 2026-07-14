"""
Standalone unit tests for Sepadan's two payload validators
(_validate_price_payload, _validate_classification_payload).

Why this file duplicates logic instead of importing contracts/sepadan.py:
`from genlayer import *` at the top of the contract pulls in GenVM-only
symbols (u256, u32, gl, TreeMap, allow_storage, ...) that don't exist
outside the sandboxed GenVM Python runtime. Splitting the validators
into a separate importable module would fix that, but the deploy
pipeline (`genlayer deploy` / deploy/deployScript.ts) reads
contracts/sepadan.py as a single-file contract source, so a multi-file
contract isn't a safe assumption here. The tradeoff, documented
honestly: these two functions are copy-pasted from the contract and
must be kept in sync by hand if the contract's validators change.

Run with: pytest test/test_sepadan_validators.py -v
(plain pytest -- no GenLayer network or gltest needed for this file)
"""

import pytest


# ── Copied verbatim from contracts/sepadan.py — keep in sync ──────────────

def _validate_price_payload(d: dict) -> bool:
    if not isinstance(d, dict):
        return False
    if d.get("data_quality") not in ("RELIABLE", "STALE", "SUSPICIOUS"):
        return False
    if d["data_quality"] == "RELIABLE":
        pm = d.get("price_micros")
        return isinstance(pm, int) and not isinstance(pm, bool) and pm > 0
    return d.get("price_micros") is None


MIN_STRUCTURAL_CONFIDENCE = 70
MIN_TRANSIENT_CONFIDENCE = 40


def _validate_classification_payload(d: dict) -> bool:
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

    if d["data_quality"] != "RELIABLE":
        return classification == "MANIPULATION_SUSPECTED" and payout_bps == 0

    if classification == "STRUCTURAL_FAILURE":
        return conf >= MIN_STRUCTURAL_CONFIDENCE and payout_bps == 10000
    if classification == "TRANSIENT_VOLATILITY":
        return conf >= MIN_TRANSIENT_CONFIDENCE and payout_bps == 10000
    if classification == "MANIPULATION_SUSPECTED":
        return payout_bps == 0
    return False


# ── _validate_price_payload ────────────────────────────────────────────

def test_price_reliable_positive_accepted():
    assert _validate_price_payload({"data_quality": "RELIABLE", "price_micros": 999053}) is True


def test_price_reliable_but_null_rejected():
    assert _validate_price_payload({"data_quality": "RELIABLE", "price_micros": None}) is False


def test_price_reliable_zero_rejected():
    assert _validate_price_payload({"data_quality": "RELIABLE", "price_micros": 0}) is False


def test_price_reliable_negative_rejected():
    assert _validate_price_payload({"data_quality": "RELIABLE", "price_micros": -100}) is False


def test_price_reliable_bool_rejected():
    # bool is a subclass of int in Python -- must be explicitly excluded
    assert _validate_price_payload({"data_quality": "RELIABLE", "price_micros": True}) is False


def test_price_stale_with_null_accepted():
    assert _validate_price_payload({"data_quality": "STALE", "price_micros": None}) is True


def test_price_stale_smuggling_a_price_rejected():
    # A STALE response must not carry a usable price -- if it does,
    # something inconsistent happened and it must be rejected.
    assert _validate_price_payload({"data_quality": "STALE", "price_micros": 999000}) is False


def test_price_suspicious_with_null_accepted():
    assert _validate_price_payload({"data_quality": "SUSPICIOUS", "price_micros": None}) is True


def test_price_invalid_data_quality_rejected():
    assert _validate_price_payload({"data_quality": "FINE", "price_micros": 999000}) is False


def test_price_not_a_dict_rejected():
    assert _validate_price_payload("not a dict") is False


# ── _validate_classification_payload ───────────────────────────────────

def _base_classification(**overrides) -> dict:
    base = {
        "classification": "STRUCTURAL_FAILURE",
        "confidence_score": 80,
        "data_quality": "RELIABLE",
        "payout_bps": 10000,
        "reasoning": "broad depeg across multiple exchanges",
    }
    base.update(overrides)
    return base


def test_structural_failure_high_confidence_full_payout_accepted():
    assert _validate_classification_payload(_base_classification()) is True


def test_structural_failure_low_confidence_rejected():
    # Inconsistent combination: classification demands high confidence
    payload = _base_classification(confidence_score=50)
    assert _validate_classification_payload(payload) is False


def test_structural_failure_partial_payout_rejected():
    # STRUCTURAL_FAILURE must pay out in full, not partially
    payload = _base_classification(payout_bps=5000)
    assert _validate_classification_payload(payload) is False


def test_transient_volatility_moderate_confidence_accepted():
    payload = _base_classification(
        classification="TRANSIENT_VOLATILITY", confidence_score=45
    )
    assert _validate_classification_payload(payload) is True


def test_transient_volatility_too_low_confidence_rejected():
    payload = _base_classification(
        classification="TRANSIENT_VOLATILITY", confidence_score=20
    )
    assert _validate_classification_payload(payload) is False


def test_manipulation_suspected_requires_zero_payout():
    payload = _base_classification(
        classification="MANIPULATION_SUSPECTED", confidence_score=10, payout_bps=0
    )
    assert _validate_classification_payload(payload) is True


def test_manipulation_suspected_with_nonzero_payout_rejected():
    # This is exactly the kind of inconsistent combination a naive
    # "does every field look individually valid" validator would miss.
    payload = _base_classification(
        classification="MANIPULATION_SUSPECTED", payout_bps=10000
    )
    assert _validate_classification_payload(payload) is False


def test_unreliable_data_forces_manipulation_suspected():
    # Even a well-formed STRUCTURAL_FAILURE claim must be rejected if
    # the underlying data quality wasn't RELIABLE.
    payload = _base_classification(data_quality="STALE")
    assert _validate_classification_payload(payload) is False


def test_unreliable_data_with_correct_fallback_accepted():
    payload = _base_classification(
        classification="MANIPULATION_SUSPECTED",
        data_quality="STALE",
        payout_bps=0,
        confidence_score=0,
    )
    assert _validate_classification_payload(payload) is True


def test_empty_reasoning_rejected():
    payload = _base_classification(reasoning="   ")
    assert _validate_classification_payload(payload) is False


def test_confidence_out_of_range_rejected():
    payload = _base_classification(confidence_score=150)
    assert _validate_classification_payload(payload) is False


def test_unknown_classification_label_rejected():
    payload = _base_classification(classification="TOTALLY_FINE")
    assert _validate_classification_payload(payload) is False


def test_payout_bps_not_in_allowed_set_rejected():
    # Only 0 or 10000 are allowed -- no partial payouts in this design
    payload = _base_classification(payout_bps=3000)
    assert _validate_classification_payload(payload) is False


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v"]))
