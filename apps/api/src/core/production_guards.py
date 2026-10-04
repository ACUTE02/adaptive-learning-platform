"""Checks that stop an unsafe deployment from starting, and the docs on/off switch.

"Production" is decided like this:

1. ``TESTING=true``                          -> never production (test suite).
2. ``ENVIRONMENT`` (or ``LEARNHOUSE_ENV``) set -> ``production``/``prod`` is
   production; ``development``/``dev``/``local``/``test`` is not.
3. Neither set                               -> production unless the
   LearnHouse ``development_mode`` flag is on (``npx learnhouse dev`` turns it on).
"""

import os

# The key the CLI falls back to when none is configured. It is public (it is in
# the repository), so it must never protect a real deployment.
PUBLIC_DEFAULT_COLLAB_KEYS = frozenset({"dev-collab-internal-key-change-in-prod"})
_PLACEHOLDER_MARKERS = ("replace_with", "change-in-prod", "changeme", "yahan-naya")

_DEV_ENVIRONMENTS = {"development", "dev", "local", "test", "testing"}
_PROD_ENVIRONMENTS = {"production", "prod"}


class UnsafeProductionConfig(RuntimeError):
    """Raised at startup when production is configured with an unsafe value."""


def _flag(name: str):
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return None
    return value.strip().lower() in ("1", "true", "yes", "on")


def is_production_mode() -> bool:
    if _flag("TESTING"):
        return False
    declared = (os.getenv("ENVIRONMENT") or os.getenv("LEARNHOUSE_ENV") or "").strip().lower()
    if declared in _PROD_ENVIRONMENTS:
        return True
    if declared in _DEV_ENVIRONMENTS:
        return False
    # Not declared: follow the LearnHouse development_mode flag.
    from config.config import get_learnhouse_config

    return not bool(get_learnhouse_config().general_config.development_mode)


def api_docs_enabled() -> bool:
    """Swagger UI, ReDoc and openapi.json. On in development, off in production.

    ``LEARNHOUSE_ENABLE_API_DOCS=true|false`` overrides either default.
    """
    explicit = _flag("LEARNHOUSE_ENABLE_API_DOCS")
    if explicit is not None:
        return explicit
    return not is_production_mode()


def validate_production_config() -> None:
    """Refuse to start in production with an empty or publicly known collab key."""
    if not is_production_mode():
        return
    key = (os.getenv("COLLAB_INTERNAL_KEY") or "").strip()
    is_placeholder = any(m in key.lower() for m in _PLACEHOLDER_MARKERS)
    if not key or key in PUBLIC_DEFAULT_COLLAB_KEYS or is_placeholder:
        problem = "is not set" if not key else "is still a public default or placeholder value"
        raise UnsafeProductionConfig(
            "Refusing to start in production: COLLAB_INTERNAL_KEY "
            f"{problem}. Anyone who can reach the API could then read and overwrite "
            "board documents. Set a new random value in both the API and collab environments "
            "(generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\"). "
            "For local development set ENVIRONMENT=development or LEARNHOUSE_DEVELOPMENT_MODE=true."
        )
