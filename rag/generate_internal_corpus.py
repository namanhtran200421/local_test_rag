#!/usr/bin/env python3
"""Generate physically separated synthetic corpora for the internal agents."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from generate_demo_corpus import generate_pdf

ROOT = Path(__file__).resolve().parent

CORPORA = {
    "manager": [
        {
            "slug": "manager-weekly-performance-brief",
            "title": "Management Weekly Performance Brief",
            "jurisdiction": "INTERNAL — MANAGER",
            "years": "Reporting week 31",
            "topics": ["bookings", "enquiries", "utilisation", "forecast"],
            "sections": [
                ("Executive snapshot", "Synthetic results for the demonstration week record 48 qualified enquiries, 31 confirmed bookings and an 86 percent facilitator allocation rate. The figures are invented and must never be combined with actual company reporting."),
                ("Trend commentary", "Confirmation volume increased relative to the previous synthetic week, while metropolitan facilitator capacity tightened. The suggested management response is to review allocation risk before accepting short-notice delivery commitments."),
                ("Decision boundary", "This brief supports analysis only. The assistant may summarise results and highlight variance, but it cannot approve expenditure, change targets or commit staff resources."),
            ],
        },
        {
            "slug": "manager-approval-policy",
            "title": "Manager Publication and Approval Policy",
            "jurisdiction": "INTERNAL — MANAGER",
            "years": "Policy simulation",
            "topics": ["approval", "publication", "segregation of duties"],
            "sections": [
                ("Approval classes", "Synthetic curriculum publication, pricing changes and external commitments require a named manager. The AI may identify pending work but may not approve or execute it."),
                ("Four-eyes control", "A person who prepares a high-impact change must not be its only approver. Records include initiator, reviewer, evidence, timestamp and final disposition."),
                ("Agent behaviour", "The manager agent must say when evidence is missing, cite the policy source and route decisions to the authorised approval interface."),
            ],
        },
        {
            "slug": "manager-financial-boundaries",
            "title": "Manager Financial and Commercial Boundaries",
            "jurisdiction": "INTERNAL — MANAGER",
            "years": "Commercial simulation",
            "topics": ["pricing", "discounts", "margin", "delegation"],
            "sections": [
                ("Permitted analysis", "The assistant may compare synthetic revenue, cost and margin figures already present in an authorised report. It must label estimates and avoid inventing missing numbers."),
                ("Prohibited actions", "The assistant cannot issue discounts, alter prices, approve refunds, sign contracts or promise availability. These actions require deterministic permissions and explicit confirmation."),
                ("Escalation", "Requests involving legal terms, refunds, banking information or commitments outside published policy are escalated without a generated decision."),
            ],
        },
        {
            "slug": "manager-risk-register",
            "title": "Manager Operational Risk Register",
            "jurisdiction": "INTERNAL — MANAGER",
            "years": "Quarterly simulation",
            "topics": ["risk", "capacity", "quality", "privacy"],
            "sections": [
                ("Current synthetic risks", "Illustrative risks include facilitator capacity constraints, incomplete accessibility details, outdated program metadata and exposure of personal information in free-text notes."),
                ("Response priorities", "Prioritise safety and privacy issues first, then delivery continuity and data quality. Each treatment needs an owner, due date and measurable completion evidence."),
                ("Reporting rule", "Summaries must distinguish confirmed events from forecasts and must not expose personal information or unapproved internal commentary."),
            ],
        },
    ],
    "business": [
        {
            "slug": "business-booking-operations",
            "title": "Education Booking Operations Playbook",
            "jurisdiction": "INTERNAL — BUSINESS",
            "years": "Operations simulation",
            "topics": ["booking", "follow-up", "confirmation", "handover"],
            "sections": [
                ("Booking states", "Synthetic bookings move through enquiry, qualification, provisional hold, school confirmation, facilitator assignment and delivery-ready states. State changes require validated identifiers and an authorised system action."),
                ("Follow-up priority", "Contact records awaiting school confirmation before facilitator assignment. Accessibility and safeguarding questions take priority over routine scheduling reminders."),
                ("Agent boundary", "The assistant may prepare a follow-up draft and identify missing fields. It cannot send email, confirm a booking or assign a facilitator without a separately authorised tool workflow."),
            ],
        },
        {
            "slug": "business-facilitator-coordination",
            "title": "Facilitator Coordination Guide",
            "jurisdiction": "INTERNAL — BUSINESS",
            "years": "Operations simulation",
            "topics": ["facilitator", "availability", "travel", "allocation"],
            "sections": [
                ("Allocation checks", "Check program capability, date and time, travel feasibility, working-with-children requirements and declared access constraints before proposing a facilitator."),
                ("Synthetic availability", "The demonstration roster contains eight available Victorian facilitators next week. This number is invented and must not be presented as live availability."),
                ("Confirmation rule", "Availability is not a commitment. Final allocation requires a current roster query and explicit confirmation through the booking system."),
            ],
        },
        {
            "slug": "business-email-response-standard",
            "title": "Client Email Response Standard",
            "jurisdiction": "INTERNAL — BUSINESS",
            "years": "Communications simulation",
            "topics": ["email", "response", "privacy", "tone"],
            "sections": [
                ("Response structure", "Acknowledge the request, answer only from verified records, identify missing information, provide the next step and use a professional concise tone."),
                ("Sensitive content", "Never repeat unnecessary personal information. Payment card data, identity documents, medical details and safeguarding information must be handled through approved channels rather than ordinary email."),
                ("Automation limit", "The assistant prepares drafts by default. Complaints, refunds, contractual language, safety incidents and unusual commitments require human review."),
            ],
        },
        {
            "slug": "business-accessibility-checklist",
            "title": "Accessible Delivery Preparation Checklist",
            "jurisdiction": "INTERNAL — BUSINESS",
            "years": "Delivery simulation",
            "topics": ["accessibility", "school", "delivery", "adjustments"],
            "sections": [
                ("Information to confirm", "Confirm venue access, sensory considerations, communication preferences, mobility needs, participation alternatives, group size and a school contact for the day."),
                ("Respectful communication", "Ask what adjustments support participation rather than requesting diagnoses. Record only information necessary for delivery and follow retention requirements."),
                ("Handover", "Provide facilitators with approved practical adjustments through the protected operations system, not through model prompts or public notes."),
            ],
        },
    ],
}


def main() -> None:
    for agent, documents in CORPORA.items():
        output = ROOT / "corpus" / agent
        output.mkdir(parents=True, exist_ok=True)
        inventory = []
        for spec in documents:
            path = output / f"{spec['slug']}.pdf"
            generate_pdf(spec, path)
            inventory.append({
                "id": spec["slug"], "filename": path.name, "title": spec["title"],
                "jurisdiction": spec["jurisdiction"], "years": spec["years"],
                "topics": spec["topics"], "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "synthetic": True, "access": agent,
            })
        manifest = {"corpus": f"tan-{agent}-synthetic", "access": agent, "documentCount": len(inventory), "documents": inventory}
        (output / "corpus_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(f"Generated {len(inventory)} {agent} PDFs in {output}")


if __name__ == "__main__":
    main()
