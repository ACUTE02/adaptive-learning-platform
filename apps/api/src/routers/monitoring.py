"""Server-side relay so adblockers can't drop Sentry user feedback."""

from typing import Optional

import sentry_sdk
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.security.rate_limiting import check_rate_limit_with_fallback

router = APIRouter()


_MAX_ATTACHMENTS = 3
_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
_MAX_MESSAGE_LENGTH = 4096
# Whole request: every attachment at its limit, plus room for the text fields.
_MAX_REQUEST_BYTES = _MAX_ATTACHMENTS * _MAX_ATTACHMENT_BYTES + 256 * 1024
# Per signed-in user. Feedback is a human typing in a form, not a stream.
_FEEDBACK_LIMIT = 10
_FEEDBACK_WINDOW_SECONDS = 3600


@router.post(
    "/feedback",
    summary="Submit user feedback",
    description=(
        "Relay user feedback to Sentry from the server so requests aren't "
        "dropped by client-side ad/tracker blockers."
    ),
    responses={
        204: {"description": "Feedback accepted and forwarded to Sentry."},
        400: {"description": "Empty or invalid feedback payload."},
        401: {"description": "Sign in to send feedback."},
        413: {"description": "Request body too large."},
        429: {"description": "Too many feedback messages."},
        503: {"description": "Sentry is not configured on this instance."},
    },
    status_code=204,
)
async def submit_feedback(
    request: Request,
    current_user: PublicUser = Depends(get_authenticated_user),
    message: str = Form(""),
    name: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    associated_event_id: Optional[str] = Form(None),
    attachments: list[UploadFile] = File(default=[]),
):
    # Reject oversized bodies before reading any attachment into memory.
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > _MAX_REQUEST_BYTES:
        raise HTTPException(status_code=413, detail="Feedback request is too large")

    allowed, retry_after = check_rate_limit_with_fallback(
        f"feedback:{getattr(current_user, 'id', None) or getattr(current_user, 'user_uuid', 'unknown')}",
        _FEEDBACK_LIMIT,
        _FEEDBACK_WINDOW_SECONDS,
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many feedback messages. Please try again later.",
            headers={"Retry-After": str(max(1, retry_after))},
        )

    message = (message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Feedback message is required")
    if len(message) > _MAX_MESSAGE_LENGTH:
        message = message[:_MAX_MESSAGE_LENGTH]

    if not sentry_sdk.get_client().is_active():
        return

    files = (attachments or [])[:_MAX_ATTACHMENTS]
    loaded: list[tuple[str, bytes, str]] = []
    for upload in files:
        if not upload or not upload.filename:
            continue
        # Read one byte past the limit at most, never the whole upload.
        data = await upload.read(_MAX_ATTACHMENT_BYTES + 1)
        if not data:
            continue
        if len(data) > _MAX_ATTACHMENT_BYTES:
            data = data[:_MAX_ATTACHMENT_BYTES]
        loaded.append((upload.filename, data, upload.content_type or "application/octet-stream"))

    # sentry-sdk 2.x has no capture_feedback; emit the JS SDK's envelope shape so it lands in User Feedback.
    feedback_context: dict[str, str] = {"message": message, "source": "api"}
    if name:
        feedback_context["name"] = name
    if email:
        feedback_context["contact_email"] = email
    if associated_event_id:
        feedback_context["associated_event_id"] = associated_event_id

    event = {
        "type": "feedback",
        "level": "info",
        "contexts": {"feedback": feedback_context},
    }

    with sentry_sdk.new_scope() as scope:
        for filename, data, content_type in loaded:
            scope.add_attachment(bytes=data, filename=filename, content_type=content_type)
        sentry_sdk.capture_event(event)
