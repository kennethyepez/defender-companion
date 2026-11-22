import json
from pathlib import Path
import tempfile
import unittest
from companion_handoff import build_handoff, export_success, export_failure, publish_collector_result

class HandoffTests(unittest.TestCase):
    def fixture(self):
        return {"Complete": True, "PermissionRoles": ["SecurityAlert.Read.All"], "TenantId": "private-tenant-marker", "value": [{"id": "example-alert", "title": "SECRET-title", "category": "credentialAccess", "description": "SECRET-description", "severity": "high", "status": "new", "evidence": [{"@odata.type": "#microsoft.graph.security.processEvidence", "processCommandLine": "SECRET-command", "verdict": "suspicious"}, {"@odata.type": "#microsoft.graph.security.userEvidence", "accountName": "SECRET-user"}, {"@odata.type": "#microsoft.graph.security.deviceEvidence", "deviceDnsName": "Example-device", "mdeDeviceId": "private-device-id", "osPlatform": "windows11", "riskScore": "high", "ipInterfaces": ["SECRET-IP"]}]}]}
    def test_whitelist_excludes_sensitive_evidence(self):
        result = build_handoff(self.fixture(), "2026-06-18T14:33:00Z")
        self.assertNotIn("SECRET", json.dumps(result)); self.assertNotIn("private-tenant", json.dumps(result)); self.assertNotIn("private-device-id", json.dumps(result))
        self.assertEqual(result["alerts"][0]["category"], "Credential access")
        self.assertEqual(len(result["alerts"][0]["evidence"]), 3)
    def test_rejects_broader_permissions(self):
        fixture = self.fixture(); fixture["PermissionRoles"].append("SecurityAlert.ReadWrite.All")
        with self.assertRaises(ValueError): build_handoff(fixture, "2026-06-18T14:33:00Z")
    def test_failure_preserves_last_success_and_records_coverage_loss(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "workspace.json"
            export_success(self.fixture(), "2026-06-18T14:33:00Z", path)
            export_failure("2026-06-18T15:33:00Z", path)
            data = json.loads(path.read_text()); self.assertEqual(data["outcome"], "failed"); self.assertEqual(data["lastSuccessfulReadAt"], "2026-06-18T14:33:00Z"); self.assertTrue(data["alerts"])
            self.assertFalse(list(Path(directory).glob("*.tmp")))
    def test_output_failure_does_not_fail_the_collector(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'workspace.json'
            export_success(self.fixture(), '2026-06-18T14:33:00Z', path)
            self.assertFalse(publish_collector_result({}, '2026-06-18T15:33:00Z', path))
            self.assertEqual(json.loads(path.read_text())['outcome'], 'failed')
            self.assertFalse(publish_collector_result(self.fixture(), '2026-06-18T15:33:00Z', Path(directory)))
    def test_invalid_host_and_evidence_are_not_reflected(self):
        fixture = self.fixture(); fixture["value"][0]["evidence"][2]["deviceDnsName"] = "SECRET user@host /path"
        result = build_handoff(fixture, "2026-06-18T14:33:00Z"); self.assertEqual(result["devices"][0]["name"], "Unknown-device")

if __name__ == '__main__': unittest.main()
