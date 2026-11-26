import json
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_VIDEOS_PATH = BASE_DIR / "data" / "videos.json"
DEFAULT_ERROR_CONTENT_PATH = BASE_DIR / "data" / "error_content.json"


def to_youtube_embed_url(url):
    """
    일반 유튜브 링크(watch?v=, youtu.be/, shorts/)를 iframe 재생용 embed URL로 변환합니다.
    유튜브 링크가 아니거나 비어 있으면 빈 문자열("")을 반환합니다.
    """
    if not url or not isinstance(url, str):
        return ""

    if "youtube.com/embed/" in url:
        return url

    pattern = r"(?:v=|\/youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})"
    match = re.search(pattern, url)
    if match:
        video_id = match.group(1)
        return f"https://www.youtube.com/embed/{video_id}"

    return ""


def get_video_section_html(video_url):
    """
    유튜브 링크가 있으면 iframe 플레이어 HTML을 반환하고,
    없거나 준비되지 않은 경우 '가이드 영상 준비 중' 안내 문구 HTML을 반환합니다.
    """
    embed_url = to_youtube_embed_url(video_url)
    if embed_url:
        return (
            f'<div class="video-container">'
            f'<iframe src="{embed_url}" title="자세 교정 가이드 영상" '
            f'frameborder="0" allow="accelerometer; autoplay; clipboard-write; '
            f'encrypted-media; gyroscope; picture-in-picture" allowfullscreen>'
            f'</iframe></div>'
        )
    return '<p class="video-placeholder">가이드 영상 준비 중</p>'


def load_videos_catalog(videos_path=DEFAULT_VIDEOS_PATH):
    """
    영상 데이터 파일(videos.json)을 읽어 id를 키로 하는 딕셔너리로 반환합니다.
    """
    with open(videos_path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    items = raw.get("videos", raw) if isinstance(raw, dict) else raw
    catalog = {}
    for item in items:
        vid = item.get("id")
        if vid:
            url = item.get("url", "")
            catalog[vid] = {
                "id": vid,
                "exercise": item.get("exercise", ""),
                "body_part": item.get("body_part", ""),
                "category": item.get("category", ""),
                "title": item.get("title", ""),
                "url": url,
                "embed_url": to_youtube_embed_url(url),
                "video_html": get_video_section_html(url),
            }
    return catalog


def load_error_content(content_path=DEFAULT_ERROR_CONTENT_PATH):
    """
    오답 콘텐츠 데이터 파일(error_content.json)을 읽어 반환합니다.
    """
    with open(content_path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_all_errors_info(data_source):
    """
    파일 경로(str/Path), Flask API 응답 데이터(list), 또는 백엔드 storage.load_records() 결과(list)를 받아
    모든 운동의 오답 횟수를 집계하고 내림차순으로 정렬하여 반환합니다.
    """
    if isinstance(data_source, (str, Path)):
        with open(data_source, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = data_source

    # 단일 세션 객체(dict)와 누적 세션 배열(list) 모두 안전하게 처리
    sessions = data if isinstance(data, list) else [data]
    error_counts = {}

    for session in sessions:
        # 백엔드 API 응답 구조 (session-example.json 기준)에 맞게 "errors" 딕셔너리 순회
        errors_by_exercise = session.get("errors", {})
        for exercise, errors in errors_by_exercise.items():
            for error_name, count in errors.items():
                if count > 0:
                    key = (exercise, error_name)
                    error_counts[key] = error_counts.get(key, 0) + count

    sorted_errors = sorted(error_counts.items(), key=lambda x: x[1], reverse=True)
    return sorted_errors


def get_routine_by_count(info, count):
    """
    오류 발생 횟수(1번, 2~4번, 5번 이상)에 따라 해당 오류의 맞춤형 교정 루틴을 반환합니다.
    """
    routines = info.get("routines", {})
    if count >= 5:
        return {
            "level": "🔴 5회 이상 (집중 교정 루틴 — 근본 원인 해결 및 패턴 재교육)",
            "routine": routines.get("5_plus", "기본 자세 가이드를 다시 확인해 주세요."),
        }
    elif 2 <= count <= 4:
        return {
            "level": "🟡 2~4회 (보완 교정 루틴 — 가동성 확보 및 타겟 근육 활성화)",
            "routine": routines.get("2_4", "기본 자세 가이드를 다시 확인해 주세요."),
        }
    else:  # count == 1
        return {
            "level": "🟢 1회 (자세 인지 루틴 — 즉시 교정 및 코칭 큐 리허설)",
            "routine": routines.get("1", "기본 자세 가이드를 다시 확인해 주세요."),
        }


def build_guide_feedback_list(
    data_source,
    videos_path=DEFAULT_VIDEOS_PATH,
    content_path=DEFAULT_ERROR_CONTENT_PATH,
):
    """
    백엔드 API(/api/guide) 또는 프론트엔드 렌더링에 바로 전달할 수 있도록
    각 오류별 설명, 원인, 교정법, 횟수별 루틴, 유튜브 임베드 URL 및 HTML을 리스트로 반환합니다.
    """
    videos_catalog = load_videos_catalog(videos_path)
    error_content = load_error_content(content_path)
    all_errors = get_all_errors_info(data_source)
    feedback_list = []

    for idx, ((exercise, error_name), count) in enumerate(all_errors, start=1):
        info = error_content.get(exercise, {}).get(error_name, {
            "body_part": "unknown",
            "type": "general",
            "description": "현재 알 수 없는 자세 오류가 발생하고 있습니다!",
            "cause": "정확한 원인을 파악할 수 없습니다.",
            "solution": "기본 자세 가이드를 다시 확인해 주세요.",
            "reference": "참고 문헌 없음",
            "routines": {},
            "video_id": "",
        })

        prescription = get_routine_by_count(info, count)
        video_id = info.get("video_id", "")
        video_meta = videos_catalog.get(video_id, {
            "id": video_id,
            "exercise": exercise,
            "body_part": info.get("body_part", ""),
            "category": info.get("type", ""),
            "title": "",
            "url": "",
            "embed_url": "",
            "video_html": get_video_section_html(""),
        })

        raw_video_url = video_meta.get("url", "")
        embed_url = video_meta.get("embed_url", "")
        video_html = video_meta.get("video_html", get_video_section_html(raw_video_url))

        feedback_list.append({
            "rank": idx,
            "is_top_error": idx == 1,
            "exercise": exercise,
            "error_name": error_name,
            "body_part": info.get("body_part", ""),
            "type": info.get("type", ""),
            "count": count,
            "description": info["description"],
            "cause": info["cause"],
            "solution": info["solution"],
            "reference": info.get("reference", ""),
            "routine_level": prescription["level"],
            "routine": prescription["routine"],
            "video_id": video_id,
            "video_meta": video_meta,
            "video": raw_video_url,
            "embed_url": embed_url,
            "video_html": video_html,
        })

    return feedback_list


# --- 실행 및 연동 브랜치 테스트용 ---
if __name__ == "__main__":
    # 방법 A: 기존처럼 로컬 JSON 파일로 테스트할 때
    # feedback_results = build_guide_feedback_list('session-example.json')

    # 방법 B: 팀원들의 Flask API(GET /api/records) 응답 데이터나 백엔드 storage.load_records() 결과를 받을 때
    mock_api_response = [
        {
            "id": "6f2c1a9e-4b7d-4e3a-9c51-2d8e7f0b3a64",
            "startedAt": "2026-10-27T19:30:12+09:00",
            "exercise": "squat",
            "view": "side",
            "count": 12,
            "accuracy": 71,
            "errors": {
                "squat": {
                    "torsoLean": 5,   # 5회 이상 루틴 테스트
                    "shinLean": 0,
                    "heelLift": 1,    # 1회 루틴 테스트
                    "partialRep": 3,  # 2~4회 루틴 테스트
                    "kneeValgus": 0
                }
            }
        }
    ]

    feedback_results = build_guide_feedback_list(mock_api_response)

    if feedback_results:
        for item in feedback_results:
            prefix = "[최다 발생 오류]" if item["is_top_error"] else f"[추가 발생 오류 {item['rank'] - 1}]"
            print(f"{prefix} ({item['exercise']} / {item['body_part']} - {item['error_name']}, 총 {item['count']}회)")
            print(f"- 발생한 오류: {item['description']}")
            print(f"- 발생 원인: {item['cause']}")
            print(f"- 자세 교정 방법: {item['solution']}")
            print(f"- 처방 단계: {item['routine_level']}")
            print(f"- 맞춤형 교정 루틴: {item['routine']}")
            print(f"- 참고 문헌: {item['reference']}")
            print(f"- 영상 ID: {item['video_id']}")
            print(f"- 유튜브 임베드 주소: {item['embed_url'] if item['embed_url'] else '가이드 영상 준비 중'}")
            print(f"- 화면 렌더링 HTML: {item['video_html']}")
            print()
    else:
        print("모든 자세가 정확합니다. 운동을 잘하고 계십니다.")
