from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text

from app.admin.db import get_db_session
from app.admin.routes.auth import authorize, require_role

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("/")
def list_customers(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),
    search: str | None = None,
    segment: str | None = None,
    token: str = Depends(authorize),
):
    require_role(token, ["viewer", "editor", "publisher"])

    filters: list[str] = []
    params: dict[str, object] = {}

    if search:
        filters.append("(customer_id ILIKE :search OR email ILIKE :search)")
        params["search"] = f"%{search}%"

    if segment:
        filters.append("segment = :segment")
        params["segment"] = segment

    where = f"WHERE {' AND '.join(filters)}" if filters else ""
    offset = (page - 1) * limit

    with get_db_session() as session:
        total = session.execute(
            text(f"SELECT COUNT(*) FROM kirana_kart.customers {where}"),
            params,
        ).scalar() or 0

        rows = session.execute(
            text(f"""
                SELECT
                    customer_id, email, phone, date_of_birth, signup_date,
                    is_active, lifetime_order_count, lifetime_igcc_rate, segment,
                    customer_churn_probability, churn_model_version, churn_last_updated
                FROM kirana_kart.customers
                {where}
                ORDER BY signup_date DESC NULLS LAST
                LIMIT :limit OFFSET :offset
            """),
            {**params, "limit": limit, "offset": offset},
        ).mappings().all()

    return {
        "items": jsonable_encoder([dict(r) for r in rows]),
        "total": total,
        "page": page,
        "page_size": limit,
        "total_pages": max(1, (total + limit - 1) // limit),
    }


@router.get("/{customer_id}")
def get_customer(customer_id: str, token: str = Depends(authorize)):
    require_role(token, ["viewer", "editor", "publisher"])

    with get_db_session() as session:
        row = session.execute(
            text("""
                SELECT
                    customer_id, email, phone, date_of_birth, signup_date,
                    is_active, lifetime_order_count, lifetime_igcc_rate, segment,
                    customer_churn_probability, churn_model_version, churn_last_updated
                FROM kirana_kart.customers
                WHERE customer_id = :customer_id
            """),
            {"customer_id": customer_id},
        ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")

    return jsonable_encoder(dict(row))


@router.get("/{customer_id}/orders")
def get_orders(customer_id: str, token: str = Depends(authorize)):
    require_role(token, ["viewer", "editor", "publisher"])

    with get_db_session() as session:
        rows = session.execute(
            text("""
                SELECT
                    order_id, customer_id, order_value,
                    delivery_estimated, delivery_actual, sla_breach,
                    created_at, updated_at
                FROM kirana_kart.orders
                WHERE customer_id = :customer_id
                ORDER BY created_at DESC NULLS LAST
            """),
            {"customer_id": customer_id},
        ).mappings().all()

    return jsonable_encoder([dict(r) for r in rows])


@router.get("/{customer_id}/tickets")
def get_customer_tickets(customer_id: str, token: str = Depends(authorize)):
    require_role(token, ["viewer", "editor", "publisher"])

    with get_db_session() as session:
        rows = session.execute(
            text("""
                SELECT f.*
                FROM kirana_kart.fdraw f
                JOIN kirana_kart.ticket_execution_summary s
                  ON f.ticket_id = s.ticket_id
                WHERE s.customer_id = :customer_id
                ORDER BY f.created_at DESC NULLS LAST
            """),
            {"customer_id": customer_id},
        ).mappings().all()

        if not rows:
            rows = session.execute(
                text("""
                    SELECT *
                    FROM kirana_kart.fdraw
                    WHERE canonical_payload->>'customer_id' = :customer_id
                    ORDER BY created_at DESC NULLS LAST
                """),
                {"customer_id": customer_id},
            ).mappings().all()

    return jsonable_encoder([dict(r) for r in rows])


@router.get("/{customer_id}/csat")
def get_customer_csat(customer_id: str, token: str = Depends(authorize)):
    require_role(token, ["viewer", "editor", "publisher"])

    with get_db_session() as session:
        rows = session.execute(
            text("""
                SELECT r.id, r.ticket_id, r.rating, r.feedback, r.created_at
                FROM kirana_kart.csat_responses r
                JOIN kirana_kart.ticket_execution_summary s
                  ON r.ticket_id = s.ticket_id
                WHERE s.customer_id = :customer_id
                ORDER BY r.created_at DESC NULLS LAST
            """),
            {"customer_id": customer_id},
        ).mappings().all()

    return jsonable_encoder([dict(r) for r in rows])
