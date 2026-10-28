// 상대 주소를 사용하므로 로컬/LAN/클라우드 모두 같은 화면 코드를 쓴다.
async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(`/api${path}`, {
            ...options, signal: controller.signal, cache: 'no-store',
            headers: { 'Content-Type': 'application/json', ...options.headers },
        });
        const data = await response.json();
        if (!response.ok) {
            const error = new Error(data.error?.message || '요청을 처리하지 못했습니다.');
            error.fields = data.error?.fields || {};
            error.status = response.status;
            throw error;
        }
        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('서버 응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요.');
        }
        if (error instanceof TypeError || error instanceof SyntaxError) {
            throw new Error('서버에 연결할 수 없습니다. 서버 실행 상태와 Wi-Fi 연결을 확인해 주세요.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

export const listPosts = (exercise, page) => request(`/posts?${new URLSearchParams({exercise_type: exercise, page})}`);
export const getPost = id => request(`/posts/${id}`);
export const createPost = (post, key) => request('/posts', {
    method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(post),
});

export function requestKey() {
    // HTTP LAN 주소에서도 사용할 수 있도록 randomUUID 대신 getRandomValues 사용.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
