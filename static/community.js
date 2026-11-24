import { listPosts, getPost, createPost, requestKey } from './community-api.js';

const $ = id => document.getElementById(id);
const labels = {squat: '스쿼트', pushup: '푸시업', plank: '플랭크', other: '기타'};
let generation = 0;
let listHash = '#community';
let submitting = false;
let pending = null;
let notice = '';

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
function dateText(value) {
    return new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(value));
}
function status(text, error = false) {
    $('community-status').textContent = text;
    $('community-status').classList.toggle('community-error', error);
}
function show(name) {
    for (const panel of ['list', 'write', 'detail']) {
        $(`community-${panel}`).hidden = panel !== name;
    }
}
function listUrl(exercise, page = 1) {
    const params = new URLSearchParams();
    if (exercise) params.set('exercise', exercise);
    if (page > 1) params.set('page', page);
    return '#community' + (params.size ? `?${params}` : '');
}
function errorView(container, error) {
    container.replaceChildren(element('p', 'community-error', error.message));
    const retry = element('button', 'community-button community-secondary', '다시 시도');
    retry.type = 'button';
    retry.addEventListener('click', renderRoute);
    container.append(retry);
}
async function renderList(query, token) {
    show('list');
    const params = new URLSearchParams(query);
    const exercise = params.get('exercise') || '';
    const page = Number(params.get('page') || 1);
    listHash = location.hash;
    for (const button of $('community-filters').querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.dataset.exercise === exercise));
    }
    $('community-cards').replaceChildren(element('p', 'community-empty', '게시글을 불러오고 있습니다…'));
    $('community-pagination').replaceChildren();
    $('community-count').textContent = '';
    try {
        const data = await listPosts(exercise, page);
        if (token !== generation) return;
        $('community-count').textContent = `${data.total}개의 이야기`;
        const container = $('community-cards');
        container.replaceChildren();
        if (!data.posts.length) {
            const empty = element('div', 'community-empty');
            empty.append(element('h3', '', data.total ? '이 페이지에는 게시글이 없습니다.' : '아직 등록된 이야기가 없어요.'),
                element('p', '', '작은 운동 팁도 좋아요. 첫 번째 이야기를 남겨 주세요.'));
            container.append(empty);
        }
        for (const post of data.posts) {
            const card = element('a', 'community-card');
            card.href = `#community/post/${post.id}`;
            const header = element('div', 'community-card-top');
            header.append(element('span', `community-tag community-tag-${post.exercise_type}`, labels[post.exercise_type]),
                element('span', 'community-arrow', '↗'));
            const meta = element('div', 'community-meta');
            meta.append(element('span', 'community-author', post.nickname),
                element('time', '', dateText(post.created_at)));
            card.append(header, element('h3', '', post.title),
                element('p', 'community-excerpt', post.content), meta);
            container.append(card);
        }
        const pages = Math.max(1, Math.ceil(data.total / data.page_size));
        const prev = element('button', 'community-button community-secondary', '← 이전');
        prev.disabled = page <= 1;
        prev.onclick = () => { location.hash = listUrl(exercise, page - 1); };
        const next = element('button', 'community-button community-secondary', '다음 →');
        next.disabled = page >= pages;
        next.onclick = () => { location.hash = listUrl(exercise, page + 1); };
        $('community-pagination').append(prev, element('span', '', `${page} / ${pages}`), next);
    } catch (error) {
        if (token === generation) errorView($('community-cards'), error);
    }
}
async function renderDetail(id, token) {
    show('detail');
    const container = $('community-detail-content');
    container.replaceChildren(element('p', '', '게시글을 불러오고 있습니다…'));
    try {
        const {post} = await getPost(id);
        if (token !== generation) return;
        const meta = element('div', 'community-meta');
        meta.append(element('span', 'community-author', post.nickname), element('time', '', dateText(post.created_at)));
        const title = element('h2', '', post.title);
        title.tabIndex = -1;
        container.replaceChildren(element('span', `community-tag community-tag-${post.exercise_type}`, labels[post.exercise_type]),
            title, meta, element('div', 'community-body', post.content));
        title.focus({preventScroll: true});
    } catch (error) {
        if (token === generation) errorView(container, error);
    }
}
function renderRoute() {
    const hash = location.hash;
    generation++;
    if (!/^#community(?:[/?]|$)/.test(hash)) return;
    window.route('community-section');
    status(notice);
    notice = '';
    const match = hash.match(/^#community\/post\/(\d+)$/);
    if (hash === '#community/write') {
        show('write');
        $('community-nickname').focus({preventScroll: true});
    } else if (match) {
        renderDetail(match[1], generation);
    } else if (/^#community(?:\?|$)/.test(hash)) {
        renderList(hash.split('?')[1] || '', generation);
    } else {
        show('detail');
        $('community-detail-content').replaceChildren(element('p', 'community-error', '잘못된 게시글 주소입니다.'));
    }
}
function clearErrors() {
    for (const key of ['nickname', 'title', 'exercise_type', 'content']) {
        $(`community-error-${key}`).textContent = '';
        $(`community-${key}`).removeAttribute('aria-invalid');
    }
    $('community-form-status').textContent = '';
}
function fieldErrors(errors) {
    for (const [key, message] of Object.entries(errors)) {
        const target = $(`community-error-${key}`);
        if (target) {
            target.textContent = message;
            $(`community-${key}`).setAttribute('aria-invalid', 'true');
        }
    }
    const first = Object.keys(errors)[0];
    if (first) $(`community-${first}`)?.focus();
}
$('community-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    clearErrors();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const errors = {};
    for (const [key, label, max] of [['nickname', '닉네임', 20], ['title', '제목', 100], ['content', '내용', 5000]]) {
        data[key] = data[key].trim();
        if (!data[key] || Array.from(data[key]).length > max || data[key].includes('\0')) {
            errors[key] = `${label}은(는) 1~${max.toLocaleString()}자로 입력해 주세요.`;
        }
    }
    if (!labels[data.exercise_type]) errors.exercise_type = '운동 종류를 선택해 주세요.';
    if (Object.keys(errors).length) { fieldErrors(errors); return; }
    const serialized = JSON.stringify(data);
    if (!pending || pending.serialized !== serialized) pending = {serialized, key: requestKey()};
    submitting = true;
    $('community-fields').disabled = true;
    $('community-submit').textContent = '등록 중…';
    $('community-form-status').textContent = '게시글을 저장하고 있습니다.';
    try {
        await createPost(data, pending.key);
        $('community-form').reset();
        $('community-counter').textContent = '0 / 5,000';
        pending = null;
        notice = '게시글이 등록되었습니다. 다른 기기에서도 목록을 새로고침하면 볼 수 있어요.';
        $('community-form-status').textContent = '';
        location.hash = '#community';
    } catch (error) {
        $('community-form-status').textContent = error.message;
        fieldErrors(error.fields || {});
    } finally {
        submitting = false;
        $('community-fields').disabled = false;
        $('community-submit').textContent = '게시글 등록';
    }
});
$('community-content').addEventListener('input', event => {
    $('community-counter').textContent = `${Array.from(event.target.value).length.toLocaleString()} / 5,000`;
});
for (const button of $('community-filters').querySelectorAll('button')) {
    button.onclick = () => {
        const target = listUrl(button.dataset.exercise);
        if (location.hash === target) renderRoute();
        else location.hash = target;
    };
}
$('community-refresh').onclick = renderRoute;
$('community-new').onclick = () => { location.hash = '#community/write'; };
$('community-back').onclick = () => { location.hash = listHash; };
$('community-cancel').onclick = () => { location.hash = listHash; };
$('community-nav').addEventListener('click', () => {
    if (location.hash === '#community') renderRoute();
    else location.hash = '#community';
});
// 기존 메뉴를 누르면 게시판의 URL 상태만 정리한다. 기존 라우터는 유지한다.
document.querySelectorAll('.nav-links li:not(#community-nav-item)').forEach(item => {
    item.addEventListener('click', () => {
        generation++;
        if (location.hash.startsWith('#community')) history.replaceState(null, '', location.pathname + location.search);
    });
});
window.addEventListener('hashchange', () => {
    if (!location.hash) { generation++; window.route('intro-section'); }
    else renderRoute();
});
window.addEventListener('beforeunload', event => {
    if (submitting || ['nickname','title','content'].some(key => $(`community-${key}`).value.trim())) {
        event.preventDefault(); event.returnValue = '';
    }
});
renderRoute();
