import json
import logging

from app.main import JsonFormatter


def test_request_log_metadata_is_emitted_without_arbitrary_extras() -> None:
    record = logging.LogRecord(
        name="meal_planner",
        level=logging.INFO,
        pathname=__file__,
        lineno=10,
        msg="request_complete",
        args=(),
        exc_info=None,
    )
    record.request_id = "request-123"
    record.method = "GET"
    record.path = "/api/v1/health"
    record.status = 200
    record.duration_ms = 7
    record.authorization = "must-not-be-serialized"

    payload = json.loads(JsonFormatter().format(record))

    assert payload == {
        "timestamp": payload["timestamp"],
        "level": "INFO",
        "logger": "meal_planner",
        "message": "request_complete",
        "request_id": "request-123",
        "method": "GET",
        "path": "/api/v1/health",
        "status": 200,
        "duration_ms": 7,
    }


def test_ordinary_log_does_not_require_request_metadata() -> None:
    record = logging.LogRecord("worker", logging.WARNING, __file__, 1, "ordinary", (), None)
    payload = json.loads(JsonFormatter().format(record))
    assert payload["message"] == "ordinary"
    assert "request_id" not in payload
