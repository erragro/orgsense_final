from __future__ import annotations

from typing import Any


def run(
    ticket_id: int,
    execution_id: str,
    stage0_result: dict,
    stage1_result: dict,
    stage2_result: dict,
    fields: dict,
) -> dict[str, Any]:
    action_code = stage2_result.get("final_action_code", "TRACK_ORDER")
    issue_l1 = stage0_result.get("issue_type_l1", "delivery")
    issue_l2 = stage0_result.get("issue_type_l2", "not_received")

    response = (
        f"Action: {action_code}. "
        f"We have reviewed your {issue_l1}/{issue_l2} request. "
        "A support agent will follow up if additional steps are required."
    )

    return {
        "response_draft": response,
        "hitl_queue": fields.get("recommended_queue", "STANDARD_REVIEW"),
    }
