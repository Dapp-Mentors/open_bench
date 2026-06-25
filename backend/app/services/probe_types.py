# app/services/probe_types.py
#
# Shared result types and helpers for the probe pipeline stages.
# Extracted into a separate module to avoid circular imports between
# probe_base.py (which imports run_crew_probe from crew_agent.py) and
# crew_agent.py (which needs these constants).

# ── Run result constants ───────────────────────────────────────────────────────
# Richer return type than bare bool so the pipeline stages can distinguish
# between genuine model failure and infrastructure errors (e.g. rate limiting).

RUN_PASS         = "pass"          # model solved the task
RUN_FAIL         = "fail"          # model genuinely could not solve
RUN_RATE_LIMITED = "rate_limited"  # failure caused by API rate limiting (429)


# ── Rate-limit detection ───────────────────────────────────────────────────────

def is_rate_limit_error(exc: Exception) -> bool:
    """
    Check whether an exception was caused by an OpenRouter 429 rate limit.
    Matches on 'Error code: 429' which appears in both httpx.HTTPStatusError
    and crewai-wrapped exceptions.
    """
    err_str = str(exc).lower()
    return "error code: 429" in err_str or ("429" in err_str and "rate limit" in err_str)