# 녹화 랜드마크 (판정 테스트용)

트래커 화면의 "개발용 도구 → 랜드마크 10초 녹화"로 받은 JSON 파일을 이 폴더에 넣는다.
그다음 실제로 한 동작을 파일 맨 위에 `expected`로 적는다.
`node --test`를 실행하면 `tests/js/fixtures.test.js`가 카메라 없이 그 녹화를 다시 판정해 결과가 같은지 확인한다.

```json
{
  "exercise": "squat",
  "expected": { "count": 3, "correctReps": 2, "errors": { "torsoLean": 1 } },
  "frames": [ ... 녹화된 그대로 ... ]
}
```

| 키 | 뜻 |
| --- | --- |
| `count` | 기록의 count. 스쿼트·푸시업은 횟수, 플랭크는 바른 자세 유지 시간(초, 내림) |
| `correctReps` | 올바른 반복 수. 플랭크는 적지 않는다 |
| `errors` | 그 종목에서 0이 아닌 오답 키만 적는다. 적지 않은 키는 0이어야 통과한다 |

- `expected`가 없는 파일은 건너뛴다.
- 파일 이름은 내용이 보이게 짓는다. 예: `squat-3reps-torsoLean1.json`
- 녹화 파일에는 얼굴 사진이 아니라 관절 좌표만 들어 있다.
