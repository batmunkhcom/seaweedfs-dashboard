import json
import os

_rbac: dict | None = None


def load_rbac() -> dict:
    global _rbac
    if _rbac is not None:
        return _rbac
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "rbac.json")
    with open(path) as f:
        _rbac = json.load(f)
    return _rbac


def get_roles() -> dict:
    return load_rbac().get("roles", {})


def get_role_permissions(role: str) -> list[str]:
    roles = get_roles()
    return roles.get(role, {}).get("permissions", [])


def has_permission(role: str, permission: str) -> bool:
    return permission in get_role_permissions(role)


def get_default_role() -> str:
    return load_rbac().get("default_role", "viewer")
