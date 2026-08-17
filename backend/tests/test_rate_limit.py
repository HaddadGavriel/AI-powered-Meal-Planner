import pytest

from app.errors import ApiError
from app.rate_limit import InMemoryRateLimiter


def test_reset_starts_a_fresh_limiter_lifecycle() -> None:
    limiter = InMemoryRateLimiter(clock=lambda: 10.0)
    limiter.check("login:test-client", maximum=1)

    with pytest.raises(ApiError) as error:
        limiter.check("login:test-client", maximum=1)
    assert error.value.status == 429

    limiter.reset()
    limiter.check("login:test-client", maximum=1)
