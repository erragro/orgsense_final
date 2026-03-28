"""
app/admin/routes/crm_routes.py
================================
Freshdesk-like CRM REST API endpoints.

All routes are protected by crm module permissions:
  view  — read-only access (agents + users)
  edit  — agent actions (agents)
  admin — admin-only ops (bulk, merge, tags, dashboards, reports)
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.admin.routes.auth import UserContext, require_permission
from app.admin.services import crm_service as svc

router = APIRouter(prefix="/crm", tags=["crm"])

_view  = require_permission("crm", "view")
_edit  = require_permission("crm", "edit")
_admin = require_permission("crm", "admin")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ActionRequest(BaseModel):
    action_type: Literal[
        "APPROVE_AI_REC", "REJECT_AI_REC", "MODIFY_REFUND",
        "ESCALATE", "REPLY_CUSTOMER", "RESOLVE", "REOPEN", "CLOSE",
        "CHANGE_PRIORITY", "CHANGE_STATUS", "CHANGE_TYPE", "CHANGE_QUEUE",
    ]
    final_action_code: str | None = None
    final_refund_amount: float | None = None
    reason: str | None = None
    reply_body: str | None = None
    new_priority: int | None = Field(default=None, ge=1, le=4)
    new_status: str | None = None
    new_queue_type: str | None = None
    new_ticket_type: str | None = None


class AssignRequest(BaseModel):
    assignee_id: int


class NoteRequest(BaseModel):
    body: str = Field(..., min_length=1)
    note_type: str = "INTERNAL"


class NoteUpdateRequest(BaseModel):
    body: str | None = None
    is_pinned: bool | None = None


class TagsRequest(BaseModel):
    add: list[int] = Field(default_factory=list)
    remove: list[int] = Field(default_factory=list)


class WatchersRequest(BaseModel):
    add: list[int] = Field(default_factory=list)
    remove: list[int] = Field(default_factory=list)


class MergeRequest(BaseModel):
    target_queue_id: int
    reason: str | None = None


class BulkAssignRequest(BaseModel):
    queue_ids: list[int]
    assignee_id: int


class BulkEscalateRequest(BaseModel):
    queue_ids: list[int]
    reason: str = Field(..., min_length=1)


class BulkCloseRequest(BaseModel):
    queue_ids: list[int]
    reason: str = Field(..., min_length=1)


class BulkStatusRequest(BaseModel):
    queue_ids: list[int]
    new_status: str


class ViewingRequest(BaseModel):
    action: Literal["acquire", "release"]


class TagCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: str = Field(default="#6B7280", pattern=r"^#[0-9A-Fa-f]{6}$")


class NotifReadRequest(BaseModel):
    notification_ids: list[int]


class AvailabilityRequest(BaseModel):
    availability: Literal["ONLINE", "BUSY", "AWAY", "OFFLINE"]


class SavedViewRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    filters: dict[str, Any] = Field(default_factory=dict)
    sort_by: str = "sla_due_at"
    sort_dir: str = "asc"
    is_default: bool = False


# ---------------------------------------------------------------------------
# Queue — list + detail
# ---------------------------------------------------------------------------


@router.get("/queue")
def list_queue(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),
    queue_type: str | None = None,
    status: str | None = None,
    assigned_to: int | None = None,
    priority: int | None = None,
    sla_breached: bool | None = None,
    search: str | None = None,
    tags: str | None = None,   # comma-separated tag IDs
    sort_by: str = "sla_due_at",
    sort_dir: str = "asc",
    current_user: UserContext = Depends(_view),
):
    tag_ids = [int(t) for t in tags.split(",") if t.strip().isdigit()] if tags else None
    return svc.list_queue(
        page=page, limit=limit,
        queue_type=queue_type, status=status,
        assigned_to=assigned_to, priority=priority,
        sla_breached=sla_breached, search=search,
        tags=tag_ids, sort_by=sort_by, sort_dir=sort_dir,
        current_user_id=current_user.id,
    )


@router.get("/queue/{queue_id}")
def get_queue_item(
    queue_id: int,
    current_user: UserContext = Depends(_view),
):
    item = svc.get_queue_item(queue_id, current_user_id=current_user.id)
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    return item


@router.get("/queue/{queue_id}/customer360")
def get_customer360(
    queue_id: int,
    _u: UserContext = Depends(_view),
):
    data = svc.get_customer_360(queue_id)
    if not data:
        raise HTTPException(status_code=404, detail="Queue item not found")
    return data


# ---------------------------------------------------------------------------
# Viewing lock
# ---------------------------------------------------------------------------


@router.patch("/queue/{queue_id}/viewing")
def manage_viewing(
    queue_id: int,
    body: ViewingRequest,
    current_user: UserContext = Depends(_edit),
):
    if body.action == "acquire":
        svc.set_viewing(queue_id, current_user.id)
    else:
        svc.release_viewing(queue_id, current_user.id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Assignment
# ---------------------------------------------------------------------------


@router.post("/queue/{queue_id}/assign")
def assign_ticket(
    queue_id: int,
    body: AssignRequest,
    current_user: UserContext = Depends(_edit),
):
    try:
        svc.assign_ticket(queue_id, body.assignee_id, current_user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}


@router.post("/queue/{queue_id}/self-assign")
def self_assign(
    queue_id: int,
    current_user: UserContext = Depends(_edit),
):
    try:
        svc.assign_ticket(queue_id, current_user.id, current_user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Actions (central dispatcher)
# ---------------------------------------------------------------------------


@router.post("/queue/{queue_id}/action")
def take_action(
    queue_id: int,
    body: ActionRequest,
    current_user: UserContext = Depends(_edit),
):
    try:
        result = svc.take_action(
            queue_id=queue_id,
            actor=current_user,
            action_type=body.action_type,
            final_action_code=body.final_action_code,
            final_refund_amount=body.final_refund_amount,
            reason=body.reason,
            reply_body=body.reply_body,
            new_priority=body.new_priority,
            new_status=body.new_status,
            new_queue_type=body.new_queue_type,
            new_ticket_type=body.new_ticket_type,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


# ---------------------------------------------------------------------------
# Notes
# ---------------------------------------------------------------------------


@router.get("/queue/{queue_id}/notes")
def get_notes(
    queue_id: int,
    _u: UserContext = Depends(_view),
):
    item = svc.get_queue_item(queue_id)
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    return item.get("notes", [])


@router.post("/queue/{queue_id}/notes")
def add_note(
    queue_id: int,
    body: NoteRequest,
    current_user: UserContext = Depends(_edit),
):
    item = svc.get_queue_item(queue_id)
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    try:
        return svc.add_note(
            ticket_id=item["ticket_id"],
            queue_id=queue_id,
            author=current_user,
            body=body.body,
            note_type=body.note_type,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/queue/{queue_id}/notes/{note_id}")
def update_note(
    queue_id: int,
    note_id: int,
    body: NoteUpdateRequest,
    current_user: UserContext = Depends(_edit),
):
    try:
        return svc.update_note(note_id, current_user, body.body, body.is_pinned)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Audit actions timeline
# ---------------------------------------------------------------------------


@router.get("/queue/{queue_id}/actions")
def get_actions(
    queue_id: int,
    _u: UserContext = Depends(_view),
):
    item = svc.get_queue_item(queue_id)
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    return item.get("actions", [])


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


@router.post("/queue/{queue_id}/tags")
def manage_tags(
    queue_id: int,
    body: TagsRequest,
    current_user: UserContext = Depends(_edit),
):
    item = svc.get_queue_item(queue_id)
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    svc.manage_tags(item["ticket_id"], queue_id, body.add, body.remove, current_user)
    return {"ok": True}


@router.get("/tags")
def list_tags(_u: UserContext = Depends(_view)):
    return svc.get_tags()


@router.post("/tags")
def create_tag(
    body: TagCreateRequest,
    current_user: UserContext = Depends(_admin),
):
    return svc.create_tag(body.name, body.color, current_user)


# ---------------------------------------------------------------------------
# Watchers
# ---------------------------------------------------------------------------


@router.post("/queue/{queue_id}/watchers")
def manage_watchers(
    queue_id: int,
    body: WatchersRequest,
    current_user: UserContext = Depends(_edit),
):
    item = svc.get_queue_item(queue_id)
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    svc.manage_watchers(item["ticket_id"], queue_id, body.add, body.remove, current_user)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------


@router.post("/queue/{queue_id}/merge")
def merge_tickets(
    queue_id: int,
    body: MergeRequest,
    current_user: UserContext = Depends(_admin),
):
    try:
        svc.merge_tickets(queue_id, body.target_queue_id, body.reason, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Bulk operations
# ---------------------------------------------------------------------------


@router.post("/queue/bulk-assign")
def bulk_assign(
    body: BulkAssignRequest,
    current_user: UserContext = Depends(_admin),
):
    return svc.bulk_assign(body.queue_ids, body.assignee_id, current_user)


@router.post("/queue/bulk-escalate")
def bulk_escalate(
    body: BulkEscalateRequest,
    current_user: UserContext = Depends(_admin),
):
    return svc.bulk_escalate(body.queue_ids, body.reason, current_user)


@router.post("/queue/bulk-close")
def bulk_close(
    body: BulkCloseRequest,
    current_user: UserContext = Depends(_admin),
):
    return svc.bulk_close(body.queue_ids, body.reason, current_user)


@router.post("/queue/bulk-status")
def bulk_status(
    body: BulkStatusRequest,
    current_user: UserContext = Depends(_admin),
):
    try:
        return svc.bulk_status_change(body.queue_ids, body.new_status, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Canned responses
# ---------------------------------------------------------------------------


@router.get("/canned-responses")
def get_canned_responses(
    action_code_id: str | None = None,
    issue_l1: str | None = None,
    _u: UserContext = Depends(_view),
):
    return svc.get_canned_responses(action_code_id, issue_l1)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


@router.get("/notifications")
def get_notifications(
    unread_only: bool = False,
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    current_user: UserContext = Depends(_view),
):
    return svc.get_notifications(current_user.id, unread_only, page, limit)


@router.post("/notifications/read")
def mark_read(
    body: NotifReadRequest,
    current_user: UserContext = Depends(_view),
):
    svc.mark_notifications_read(current_user.id, body.notification_ids)
    return {"ok": True}


@router.post("/notifications/read-all")
def mark_all_read(current_user: UserContext = Depends(_view)):
    svc.mark_all_notifications_read(current_user.id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------


@router.get("/agents")
def list_agents(_u: UserContext = Depends(_view)):
    return svc.get_agents()


@router.patch("/agents/availability")
def update_availability(
    body: AvailabilityRequest,
    current_user: UserContext = Depends(_edit),
):
    try:
        svc.update_availability(current_user.id, body.availability)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Saved views
# ---------------------------------------------------------------------------


@router.get("/saved-views")
def get_saved_views(current_user: UserContext = Depends(_view)):
    return svc.get_saved_views(current_user.id)


@router.post("/saved-views")
def create_saved_view(
    body: SavedViewRequest,
    current_user: UserContext = Depends(_view),
):
    return svc.save_view(
        current_user.id, body.name, body.filters,
        body.sort_by, body.sort_dir, body.is_default,
    )


@router.delete("/saved-views/{view_id}")
def delete_saved_view(
    view_id: int,
    current_user: UserContext = Depends(_view),
):
    svc.delete_saved_view(view_id, current_user.id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Dashboards
# ---------------------------------------------------------------------------


@router.get("/dashboard/agent")
def agent_dashboard(
    date_from: str = Query(...),
    date_to: str = Query(...),
    current_user: UserContext = Depends(_view),
):
    return svc.get_agent_dashboard(current_user.id, date_from, date_to)


@router.get("/dashboard/admin")
def admin_dashboard(
    date_from: str = Query(...),
    date_to: str = Query(...),
    _u: UserContext = Depends(_admin),
):
    return svc.get_admin_dashboard(date_from, date_to)


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


@router.get("/reports")
def get_report(
    report_type: str = Query(...),
    date_from: str = Query(...),
    date_to: str = Query(...),
    queue_type: str | None = None,
    agent_id: int | None = None,
    _u: UserContext = Depends(_admin),
):
    try:
        return svc.get_report(report_type, date_from, date_to, queue_type, agent_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
