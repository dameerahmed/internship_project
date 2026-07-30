import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.project_service import normalize_event_config_payload


def test_normalize_event_config_payload_does_not_inject_placeholder_url():
    event = {
        "event_type": "invoice.created",
        "payload_keys": ["invoice_id"],
        "payload_types": ["string"],
    }

    normalized = normalize_event_config_payload(event)

    assert normalized["event_type"] == "invoice.created"
    assert normalized["target_url"] == ""
    assert normalized["metadata_json"]["urls"] == []
    assert normalized["payload_keys"] == ["invoice_id"]
    assert normalized["payload_types"] == ["string"]


def test_normalize_event_config_payload_preserves_multiple_target_urls():
    event = {
        "event_type": "invoice.created",
        "target_urls": ["https://a.example.com", "https://b.example.com"],
        "payload_keys": ["invoice_id"],
        "payload_types": ["string"],
    }

    normalized = normalize_event_config_payload(event)

    assert normalized["target_url"] == "https://a.example.com"
    assert normalized["target_urls"] == ["https://a.example.com", "https://b.example.com"]
    assert normalized["metadata_json"]["urls"] == ["https://a.example.com", "https://b.example.com"]
    assert normalized["metadata_json"]["target_urls"] == ["https://a.example.com", "https://b.example.com"]
