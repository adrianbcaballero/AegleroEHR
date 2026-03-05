import re


def validate_password(password: str) -> tuple[bool, str]:
    """
    Validates password complexity.
    Returns (is_valid, error_message).
    """
    if not password or not isinstance(password, str):
        return False, "Password is required"

    if len(password) < 12:
        return False, "Password must be at least 12 characters"

    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"

    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"

    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one number"

    if not re.search(r"[!@#$%^&*(),.?\":{}|<>\-_=+\[\]\\;'/`~]", password):
        return False, "Password must contain at least one special character"

    return True, ""