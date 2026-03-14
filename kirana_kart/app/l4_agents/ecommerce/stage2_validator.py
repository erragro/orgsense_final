from __future__ import annotations

from typing import Any


def run(
    ticket_id: int,
    execution_id: str,
    stage0_result: dict,
    stage1_result: dict,
    rules: list,
    fields: dict,
) -> dict[str, Any]:
    order_ctx = fields.get("order_context") or {}
    risk_ctx = fields.get("risk_context") or {}

    order_value = float(order_ctx.get("order_value", 0) or 0)
    requested = float(stage1_result.get("calculated_gratification", 0) or 0)
    auto_limit = float(risk_ctx.get("auto_approval_limit", 0) or 0)

    final_refund = min(requested, order_value) if order_value else requested
    requires_human_review = False

    if auto_limit and final_refund > auto_limit:
        requires_human_review = True

    validation_status = "PASSED" if not requires_human_review else "REVIEW_REQUIRED"
    automation_pathway = "AUTO_RESOLVED" if not requires_human_review else "HITL"

    return {
        "final_action_code": stage1_result.get("action_code", "REFUND_PARTIAL"),
        "final_refund_amount": final_refund,
        "validation_status": validation_status,
        "requires_human_review": requires_human_review,
        "automation_pathway": automation_pathway,
        "reasoning": "Deterministic caps + auto-approval limits",
    }
