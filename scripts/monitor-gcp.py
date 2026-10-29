"""Create Railor-only Cloud Monitoring alerts through the authenticated gcloud account."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--email", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", args.project):
        parser.error("Invalid project ID")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", args.email):
        parser.error("Invalid email")
    cli = shutil.which("gcloud.cmd") or shutil.which("gcloud")
    result = subprocess.run([cli, "auth", "print-access-token"], capture_output=True, text=True, check=True)
    token = result.stdout.strip()
    prefix = f"projects/{args.project}"

    def api(method, path, body=None):
        request = Request("https://monitoring.googleapis.com/v3/" + path,
                          data=json.dumps(body).encode() if body is not None else None,
                          headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"}, method=method)
        try:
            with urlopen(request, timeout=45) as response:
                return json.load(response)
        except HTTPError as error:
            detail = json.loads(error.read()).get("error", {}).get("message", "Monitoring request failed")
            raise RuntimeError(detail) from None

    channels = api("GET", prefix + "/notificationChannels").get("notificationChannels", [])
    channel = next((c for c in channels if c.get("type") == "email" and c.get("displayName") == "Railor production alerts" and c.get("labels", {}).get("email_address") == args.email), None)
    if channel is None:
        channel = api("POST", prefix + "/notificationChannels", {
            "type": "email", "displayName": "Railor production alerts", "labels": {"email_address": args.email},
            "userLabels": {"application": "railor"}, "enabled": True,
        })
    existing = api("GET", prefix + "/alertPolicies").get("alertPolicies", [])
    base_filter = 'resource.type="cloud_run_job" AND resource.labels.job_name="railor-ingestion" AND metric.type="run.googleapis.com/job/completed_execution_count"'
    aggregate = [{"alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_SUM", "crossSeriesReducer": "REDUCE_SUM"}]
    specs = [
        ("Railor ingestion failed", {"displayName": "Failed ingestion execution", "conditionThreshold": {
            "filter": base_filter + ' AND metric.labels.result="failed"', "comparison": "COMPARISON_GT",
            "thresholdValue": 0, "duration": "0s", "aggregations": aggregate, "trigger": {"count": 1},
        }}),
        ("Railor ingestion missing for eight hours", {"displayName": "No ingestion completion for eight hours", "conditionAbsent": {
            "filter": base_filter, "duration": "28800s", "aggregations": aggregate, "trigger": {"count": 1},
        }}),
    ]
    policies = []
    for name, condition in specs:
        policy = {"displayName": name, "combiner": "OR", "enabled": True, "userLabels": {"application": "railor"},
                  "conditions": [condition], "notificationChannels": [channel["name"]],
                  "alertStrategy": {"autoClose": "86400s"},
                  "documentation": {"mimeType": "text/markdown", "content": "Check Railor's Cloud Run job logs and Cloud Scheduler execution history. Verify the database secret and private snapshot bucket permissions. Restore ingestion before changing source eligibility. Runbook: https://github.com/anshitraj/railor/blob/main/GCP_SETUP.md"}}
        previous = next((p for p in existing if p.get("displayName") == name), None)
        if previous:
            policy["name"] = previous["name"]
            saved = api("PATCH", previous["name"], policy)
        else:
            saved = api("POST", prefix + "/alertPolicies", policy)
        policies.append({"name": saved["name"], "displayName": saved["displayName"], "enabled": saved["enabled"]})
    report = {"channel": channel["name"], "verificationStatus": channel.get("verificationStatus", "not_required"), "policies": policies}
    target = Path(__file__).resolve().parents[1] / ".railor/gcp-monitoring.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
