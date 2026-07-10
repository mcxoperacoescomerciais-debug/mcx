"""Consultas usadas pelos cards do painel Streamlit."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from core.db.models import AuditLog, PendingReview, ProcessedMessage


@dataclass
class DashboardStats:
    photos_processed: int
    pending_count: int
    error_count: int
    visits_today: int


def get_dashboard_stats(session: Session, project: str) -> DashboardStats:
    photos_processed = session.execute(
        select(func.count(ProcessedMessage.id)).where(
            ProcessedMessage.project == project,
            ProcessedMessage.media_path.isnot(None),
            ProcessedMessage.media_path != "",
        )
    ).scalar_one()

    pending_count = session.execute(
        select(func.count(PendingReview.id))
        .join(ProcessedMessage, ProcessedMessage.id == PendingReview.message_id)
        .where(ProcessedMessage.project == project, PendingReview.status == "open")
    ).scalar_one()

    error_count = session.execute(
        select(func.count(ProcessedMessage.id)).where(
            ProcessedMessage.project == project, ProcessedMessage.status == "error"
        )
    ).scalar_one()

    today_str = dt.date.today().isoformat()
    visits_today = session.execute(
        select(func.count(AuditLog.id)).where(
            AuditLog.project == project,
            func.substr(AuditLog.timestamp, 1, 10) == today_str,
        )
    ).scalar_one()

    return DashboardStats(
        photos_processed=photos_processed,
        pending_count=pending_count,
        error_count=error_count,
        visits_today=visits_today,
    )
