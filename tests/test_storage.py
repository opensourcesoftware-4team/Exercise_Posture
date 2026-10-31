import pytest

import storage


def test_valid_record(example):
    assert storage.validate_record(example()) is None


@pytest.mark.parametrize("change", [
    {"exercise": "lunge"}, {"count": 0}, {"count": True}, {"count": 1.5}, {"accuracy": 101},
    {"accuracy": -1}, {"view": "top"}, {"id": "not-a-uuid"},
    {"startedAt": "2026-10-27T19:30:12"}, {"startedAt": "어제"},
])
def test_invalid_values(example, change):
    assert storage.validate_record(example(**change))


def test_missing_and_extra_field(example):
    no_view = example(); del no_view["view"]
    assert storage.validate_record(no_view)
    assert storage.validate_record({**example(), "memo": "x"})


def test_error_keys_must_match(example):
    r = example(); del r["errors"]["squat"]["kneeValgus"]
    assert storage.validate_record(r)
    r = example(); r["errors"]["plank"]["extra"] = 0
    assert storage.validate_record(r)
    r = example(); r["errors"]["squat"]["heelLift"] = -1
    assert storage.validate_record(r)
    r = example(); r["errors"]["squat"]["heelLift"] = True
    assert storage.validate_record(r)


def test_not_a_dict():
    assert storage.validate_record([1, 2])


def test_missing_file_is_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "RECORDS_FILE", tmp_path / "none.json")
    assert storage.load_records() == []
