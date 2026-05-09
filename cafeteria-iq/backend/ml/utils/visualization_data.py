"""Helpers to serialize plot-friendly structures for the frontend."""


def to_json_safe(obj):
    """Recursively convert numpy/pandas to JSON-serializable types."""
    if obj is None:
        return None
    if hasattr(obj, "tolist"):
        return obj.tolist()
    if isinstance(obj, (list, tuple)):
        return [to_json_safe(x) for x in obj]
    if isinstance(obj, dict):
        return {str(k): to_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (float, int, str, bool)):
        return obj
    try:
        return float(obj)
    except (TypeError, ValueError):
        return str(obj)
