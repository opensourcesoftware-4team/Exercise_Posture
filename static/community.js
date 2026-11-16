import { listPosts, getPost, createPost, listComments, createComment, listRecords, requestKey } from './community-api.js';

const $ = id => document.getElementById(id);
const labels = {squat: '스쿼트', pushup: '푸시업', plank: '플랭크', other: '기타'};
let generation = 0;
let listHash = '#community';
let submitting = false;
let pending = null;
let notice = '';
let currentPostId = null;
let commentSubmitting = false;
let commentPending = null;

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
const viewLabels = {side: '측면', front: '정면'};
// 플랭크 기록의 count는 바른 자세를 유지한 시간(초)이다.
function amountText(record) {
    return record.exercise === 'plank' ? `${record.count}초` : `${record.count}회`;
}
function recordSummary(record) {
    return `${labels[record.exercise]} · ${dateText(record.started_at)} · ${amountText(record)} · 정확도 ${record.accuracy}%`;
}
function recordCard(record) {
    const card = element('section', 'community-record');
    card.setAttribute('aria-label', '첨부한 운동 기록');
    card.append(element('p', 'community-record-title', '📊 첨부한 운동 기록'));
    const grid = element('dl', 'community-record-grid');
    for (const [label, value] of [
        ['운동', labels[record.exercise]], ['측정 일시', dateText(record.started_at)],
        [record.exercise === 'plank' ? '유지 시간' : '횟수', amountText(record)],
        ['자세 정확도', `${record.accuracy}%`], ['촬영 방향', viewLabels[record.view] || record.view],
    ]) {
        const item = element('div');
        item.append(element('dt', '', label), element('dd', '', value));
        grid.append(item);
    }
    card.append(grid);
    return card;
}
let recordsLoading = null;
async function loadRecordOptions() {
    // 작성 화면을 열 때마다 최신 기록을 불러온다. 선택해 둔 값은 목록에 남아 있으면 유지.
    const select = $('community-record_id');
    const selected = select.value;
    const token = recordsLoading = {};
    select.replaceChildren(new Option('기록을 불러오고 있습니다…', ''));
    select.disabled = true;
    try {
        const records = await listRecords();
        if (token !== recordsLoading) return;
        select.replaceChildren(new Option(records.length ? '첨부하지 않음' : '첨부하지 않음 (저장된 운동 기록이 없어요)', ''));
        for (const record of records) {
            select.append(new Option(recordSummary({...record, started_at: record.startedAt}), record.id));
        }
        if ([...select.options].some(option => option.value === selected)) select.value = selected;
    } catch {
        if (token !== recordsLoading) return;
        select.replaceChildren(new Option('첨부하지 않음 (운동 기록을 불러오지 못했어요)', ''));
    } finally {
        if (token === recordsLoading) select.disabled = false;
    }
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
            const tags = element('div', 'community-card-tags');
            tags.append(element('span', `community-tag community-tag-${post.exercise_type}`, labels[post.exercise_type]));
            if (post.record) tags.append(element('span', 'community-tag community-tag-record', '📊 기록 첨부'));
            header.append(tags, element('span', 'community-arrow', '↗'));
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
    $('community-comments').hidden = true;
    try {
        const {post} = await getPost(id);
        if (token !== generation) return;
        if (currentPostId !== post.id) resetCommentForm();
        currentPostId = post.id;
        const meta = element('div', 'community-meta');
        meta.append(element('span', 'community-author', post.nickname), element('time', '', dateText(post.created_at)));
        const title = element('h2', '', post.title);
        title.tabIndex = -1;
        container.replaceChildren(element('span', `community-tag community-tag-${post.exercise_type}`, labels[post.exercise_type]),
            title, meta, ...(post.record ? [recordCard(post.record)] : []),
            element('div', 'community-body', post.content));
        title.focus({preventScroll: true});
        $('community-comments').hidden = false;
        renderComments(post.id, token);
    } catch (error) {
        if (token === generation) errorView(container, error);
    }
}
async function renderComments(postId, token) {
    const list = $('community-comment-list');
    list.replaceChildren(element('li', 'community-comment-empty', '댓글을 불러오고 있습니다…'));
    $('community-comment-count').textContent = '';
    try {
        const data = await listComments(postId);
        if (token !== generation) return;
        $('community-comment-count').textContent = String(data.total);
        list.replaceChildren();
        if (!data.comments.length) {
            list.append(element('li', 'community-comment-empty', '아직 댓글이 없어요. 첫 댓글을 남겨 주세요.'));
        }
        for (const comment of data.comments) {
            const item = element('li', 'community-comment');
            const meta = element('div', 'community-comment-meta');
            meta.append(element('span', 'community-author', comment.nickname),
                element('time', '', dateText(comment.created_at)));
            item.append(meta, element('p', 'community-comment-body', comment.content));
            list.append(item);
        }
    } catch (error) {
        if (token !== generation) return;
        const item = element('li', 'community-comment-empty');
        const retry = element('button', 'community-button community-secondary', '다시 시도');
        retry.type = 'button';
        retry.addEventListener('click', () => renderComments(postId, generation));
        item.append(element('p', 'community-error', error.message), retry);
        list.replaceChildren(item);
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
        loadRecordOptions();
    } else if (match) {
        renderDetail(match[1], generation);
    } else if (/^#community(?:\?|$)/.test(hash)) {
        renderList(hash.split('?')[1] || '', generation);
    } else {
        show('detail');
        $('community-detail-content').replaceChildren(element('p', 'community-error', '잘못된 게시글 주소입니다.'));
    }
}
function clearErrors(prefix = 'community', keys = ['nickname', 'title', 'exercise_type', 'content', 'record_id']) {
    for (const key of keys) {
        $(`${prefix}-error-${key}`).textContent = '';
        $(`${prefix}-${key}`).removeAttribute('aria-invalid');
    }
}
function fieldErrors(errors, prefix = 'community') {
    for (const [key, message] of Object.entries(errors)) {
        const target = $(`${prefix}-error-${key}`);
        if (target) {
            target.textContent = message;
            $(`${prefix}-${key}`).setAttribute('aria-invalid', 'true');
        }
    }
    const first = Object.keys(errors)[0];
    if (first) $(`${prefix}-${first}`)?.focus();
}
// 프런트 길이 검사는 서버와 같이 코드포인트 단위(이모지 1개 = 1자)로 센다.
function validateText(data, specs) {
    const errors = {};
    for (const [key, label, max] of specs) {
        data[key] = (data[key] || '').trim();
        if (!data[key] || Array.from(data[key]).length > max || data[key].includes('\0')) {
            errors[key] = `${label}은(는) 1~${max.toLocaleString()}자로 입력해 주세요.`;
        }
    }
    return errors;
}
const COMMENT_KEYS = ['nickname', 'content'];
function commentStatus(text, error = false) {
    $('community-comment-status').textContent = text;
    $('community-comment-status').classList.toggle('community-error', error);
}
function resetCommentForm() {
    // 다른 게시글로 옮기면 쓰던 댓글이 엉뚱한 글에 붙지 않게 본문과 재시도 번호를 비운다. 닉네임은 유지.
    $('community-comment-content').value = '';
    $('community-comment-counter').textContent = '0 / 1,000';
    commentPending = null;
    clearErrors('community-comment', COMMENT_KEYS);
    commentStatus('');
}
$('community-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    clearErrors();
    $('community-form-status').textContent = '';
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const errors = validateText(data, [['nickname', '닉네임', 20], ['title', '제목', 100], ['content', '내용', 5000]]);
    if (!labels[data.exercise_type]) errors.exercise_type = '운동 종류를 선택해 주세요.';
    data.record_id = data.record_id || null;
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
$('community-comment-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (commentSubmitting || currentPostId === null) return;
    clearErrors('community-comment', COMMENT_KEYS);
    commentStatus('');
    const postId = currentPostId;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const errors = validateText(data, [['nickname', '닉네임', 20], ['content', '댓글', 1000]]);
    if (Object.keys(errors).length) { fieldErrors(errors, 'community-comment'); return; }
    // 응답을 못 받고 다시 누른 경우 같은 요청 번호를 써서 서버가 한 번만 저장하게 한다.
    const serialized = JSON.stringify([postId, data]);
    if (!commentPending || commentPending.serialized !== serialized) commentPending = {serialized, key: requestKey()};
    commentSubmitting = true;
    $('community-comment-fields').disabled = true;
    $('community-comment-submit').textContent = '등록 중…';
    commentStatus('댓글을 저장하고 있습니다.');
    try {
        await createComment(postId, data, commentPending.key);
        commentPending = null;
        if (postId === currentPostId) {
            $('community-comment-content').value = '';
            $('community-comment-counter').textContent = '0 / 1,000';
            commentStatus('댓글이 등록되었습니다.');
            renderComments(postId, generation);
        }
    } catch (error) {
        commentStatus(error.message, true);
        fieldErrors(error.fields || {}, 'community-comment');
    } finally {
        commentSubmitting = false;
        $('community-comment-fields').disabled = false;
        $('community-comment-submit').textContent = '댓글 등록';
    }
});
$('community-comment-content').addEventListener('input', event => {
    $('community-comment-counter').textContent = `${Array.from(event.target.value).length.toLocaleString()} / 1,000`;
});
$('community-comments-refresh').onclick = () => {
    if (currentPostId !== null) renderComments(currentPostId, generation);
};
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
    if (submitting || commentSubmitting || ['nickname','title','content'].some(key => $(`community-${key}`).value.trim())
            || $('community-comment-content').value.trim()) {
        event.preventDefault(); event.returnValue = '';
    }
});
renderRoute();
