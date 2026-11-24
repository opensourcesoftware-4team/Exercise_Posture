// fetch 래퍼 — 서버 응답을 그대로 돌려준다.
async function request(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let reason = `요청 실패 (${res.status})`;
    try { reason = (await res.json()).error ?? reason; } catch { /* 본문 없음 */ }
    throw new Error(reason);
  }
  return res.status === 204 ? null : res.json();
}

export const getStats = (exercise, range) => {
  const params = new URLSearchParams({ exercise, [range.type]: range.value });
  return request(`/api/stats?${params}`);
};

export const getRecords = (exercise) =>
  request(`/api/records?exercise=${encodeURIComponent(exercise)}`);

export const deleteRecord = (id) =>
  request(`/api/records/${encodeURIComponent(id)}`, { method: "DELETE" });
