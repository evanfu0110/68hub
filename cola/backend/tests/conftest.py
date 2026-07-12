from pathlib import Path

import pytest

from app import db
from app.bootstrap import ensure_bootstrapped


@pytest.fixture()
def temp_data_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    data = tmp_path / "data"
    data.mkdir()
    monkeypatch.setenv("68BACKEND_DATA", str(data))
    db.init_db()
    yield data
