"""A privacy-minimizing output hook for an EXISTING collector, not a poller.

Standard library only; never authenticates, executes evidence or contacts a network.
The collector calls export_success/export_failure once after its own scheduled read.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import quote

FORMAT = "defender-companion-handoff-v1"
CATEGORIES = {"credentialaccess": "Credential access", "defenseevasion": "Defense evasion", "execution": "Execution", "persistence": "Persistence", "initialaccess": "Initial access", "commandandcontrol": "Command and control", "exfiltration": "Exfiltration", "discovery": "Discovery", "lateralmovement": "Lateral movement", "collection": "Collection", "impact": "Impact"}
VERDICTS = {"unknown", "suspicious", "malicious", "noThreatsFound", "notApplicable"}


def _identifier(prefix: str, value: str) -> str:
    return prefix + hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def build_handoff(snapshot: dict, read_at: str) -> dict:
    if snapshot.get("Complete") is not True or snapshot.get("PermissionRoles") != ["SecurityAlert.Read.All"] or not isinstance(snapshot.get("value"), list):
        raise ValueError("incomplete_or_unauthorized_snapshot")
    alerts, devices = [], {}
    if len(snapshot["value"]) > 1000:
        raise ValueError("snapshot_limit")
    for index, raw in enumerate(snapshot["value"]):
        if not isinstance(raw, dict):
            raise ValueError("invalid_alert")
        evidence = [item for item in raw.get("evidence", []) if isinstance(item, dict)]
        device = next((item for item in evidence if str(item.get("@odata.type", "")).endswith("deviceEvidence")), {})
        device_source = str(device.get("mdeDeviceId") or device.get("deviceDnsName") or device.get("computerDnsName") or "unknown")
        device_id = _identifier("d-", device_source)
        host = str(device.get("deviceDnsName") or device.get("computerDnsName") or "Unknown-device")
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", host):
            host = "Unknown-device"
        platform = {"windows": "Windows", "windows10": "Windows 10", "windows11": "Windows 11", "linux": "Linux", "macos": "macOS"}.get(str(device.get("osPlatform", "")).lower(), "Unknown")
        risk = str(device.get("riskScore", "unknown")).lower()
        risk = risk if risk in {"high", "medium", "low", "none"} else "unknown"
        risk_rank = {"unknown": -1, "none": 0, "low": 1, "medium": 2, "high": 3}
        previous_risk = devices.get(device_id, {}).get("risk", "unknown")
        if risk_rank[previous_risk] > risk_rank[risk]: risk = previous_risk
        devices[device_id] = {"id": device_id, "name": host, "os": platform, "role": "Alert-associated device", "risk": risk, "health": "Not reported by alert API", "lastSeen": "", "isolation": "unknown", "protection": "Not reported by alert API", "signatures": "Not reported by alert API", "ip": "Withheld"}
        category = CATEGORIES.get(re.sub(r"[^a-z]", "", str(raw.get("category", "")).lower()), "Security observation")
        severity = str(raw.get("severity", "informational"))
        if severity not in {"high", "medium", "low", "informational"}:
            severity = "informational"
        source_id = str(raw.get("id") or index)
        alert_id = _identifier("a-", source_id)
        observations = []
        for item in evidence[:100]:
            source_type = str(item.get("@odata.type", "")).lower()
            kind = next((kind for kind in ("process", "file", "registry", "ip") if kind in source_type), "account")
            verdict = item.get("verdict", "unknown")
            observations.append({"id": _identifier("e-", f"{alert_id}:{len(observations)}"), "type": kind, "name": f"{kind} observation", "detail": "Full evidence is available only in Defender.", "verdict": verdict if verdict in VERDICTS else "unknown"})
        created = str(raw.get("createdDateTime", ""))
        if not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)", created): created = ""
        alert = {"id": alert_id, "title": f"{category} alert", "severity": severity, "status": raw.get("status") if raw.get("status") in {"new", "inProgress", "resolved"} else "new", "deviceId": device_id, "createdAt": created, "description": "Review the source alert in Defender for full evidence. Sensitive evidence is withheld here.", "category": category, "evidence": observations}
        if re.fullmatch(r"[A-Za-z0-9_.-]{1,256}", source_id):
            alert["sourceUrl"] = "https://security.microsoft.com/alerts/" + quote(source_id, safe="")
        alerts.append(alert)
    return {"format": FORMAT, "lastSuccessfulReadAt": read_at, "lastAttemptAt": read_at, "outcome": "ok", "alerts": alerts, "devices": list(devices.values())}


def _atomic_write(destination: Path, value: dict) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    fd, temporary = tempfile.mkstemp(prefix=".handoff-", suffix=".tmp", dir=destination.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=True, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        if os.name != "nt":
            os.chmod(temporary, 0o640)
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def export_success(snapshot: dict, read_at: str, destination: str | Path) -> None:
    _atomic_write(Path(destination), build_handoff(snapshot, read_at))


def export_failure(attempt_at: str, destination: str | Path) -> None:
    path = Path(destination)
    if not path.is_file() or path.stat().st_size > 1_000_000:
        return
    previous = json.loads(path.read_text(encoding="utf-8"))
    if previous.get("format") != FORMAT:
        raise ValueError("invalid_previous_handoff")
    previous.update(outcome="failed", lastAttemptAt=attempt_at)
    _atomic_write(path, previous)


def publish_collector_result(snapshot: dict | None, at: str, destination: str | Path) -> bool:
    """Output-only hook. Never changes the collector result or event queue."""
    try:
        if snapshot is None:
            export_failure(at, destination)
        else:
            export_success(snapshot, at, destination)
        return True
    except (OSError, ValueError, TypeError, KeyError):
        if snapshot is not None:
            try:
                export_failure(at, destination)
            except (OSError, ValueError, TypeError, KeyError):
                pass
        return False
