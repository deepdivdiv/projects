/*
 * [개발 작성] 관리자 '학습 현황 관리' 화면(교육 프로그램 학습현황 · 과정 학습현황 · 오프라인 학습현황) 공용 동작.
 * 퍼블 소유 admin/js/*.js 를 고치지 않으려고 새 파일로 뒀다(학습방 js/study-room.js · js/admin-dashboard.js 와 같은 방식).
 *
 *   - StudyStatus.openPopup(link)        : [학습시간]·[출석 일차] 링크를 일반 윈도우 팝업으로 연다. 스크립트가 없으면 링크의 target 으로 새 창이 열린다.
 *   - StudyStatus.replaceSelect(url, sel) : 선택지 조각(select)을 받아 sel 로 찾은 셀렉트를 통째로 갈아끼운다(cascade). Promise 를 돌려준다.
 *                                          같은 셀렉트에 새 요청이 오면 이전 요청을 끊어 늦게 온 응답이 덮어쓰지 않게 한다.
 *   - 목록 비동기 갱신                      : AdminForm.onList 로 검색·페이징을 결과 영역(list_result) 조각 갱신으로 가져간다
 *                                          (신청 현황·교육 프로그램 목록과 같은 축). 조각을 못 받으면 종전 제출로 떨어진다(점진적 향상).
 */
var StudyStatus = (function () {
    'use strict';

    /** 팝업 창 이름. 같은 이름이라 학습시간을 연달아 눌러도 창이 늘지 않고 한 창에서 내용이 바뀐다. */
    var POPUP_NAME = 'studyStatusPopup';
    // 일시를 년월일 시분초로 적는 표(차시·접속·저장 로그)가 한 줄에 들어가게 1200 으로 둔다.
    var POPUP_FEATURES = 'width=1200,height=720,scrollbars=yes,resizable=yes';

    function openPopup(link) {
        var popup = window.open(link.getAttribute('href'), POPUP_NAME, POPUP_FEATURES);
        if (!popup) {
            // 팝업 차단 — 링크 기본 동작(target 새 창)으로 넘긴다.
            return true;
        }
        popup.focus();
        return false;
    }

    /**
     * 같은 셀렉트를 겨냥한 진행 중 요청. 연달아 바꾸면(년도를 두 번 빠르게 고름) 먼저 낸 응답이 나중에 도착해 다른 년도의
     * 선택지가 남을 수 있어, 새 요청을 낼 때 그 셀렉트의 이전 요청을 끊는다(목록 갱신의 pendingRequest 와 같은 이유).
     * 끊긴 쪽은 AbortError 로 거부되므로 호출부의 catch(종전 제출 폴백)가 그것까지 제출하지 않게 여기서 걸러 영원히 대기시킨다.
     */
    var pendingSelectRequests = {};

    function replaceSelect(url, selector) {
        if (pendingSelectRequests[selector]) { pendingSelectRequests[selector].abort(); }
        var controller = new AbortController();
        pendingSelectRequests[selector] = controller;

        return fetch(url, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
            signal: controller.signal
        }).then(function (res) {
            // 세션이 끝나면 fetch 가 로그인 화면(302)을 따라가 2xx 로 돌아온다 — 그 HTML 을 셀렉트 자리에 끼우지 않고 종전 제출로 떨어져
            // 브라우저가 로그인 화면으로 가게 한다(목록 갱신도 같다).
            if (res.redirected || !res.ok) { throw new Error('선택지 조회 실패(' + res.status + ')'); }
            return res.text();
        }).then(function (html) {
            var current = document.querySelector(selector);
            if (!current) { throw new Error('select not found: ' + selector); }
            current.outerHTML = html;
            if (pendingSelectRequests[selector] === controller) { delete pendingSelectRequests[selector]; }
        }).catch(function (err) {
            // 새 요청이 이 요청을 끊은 경우 — 그쪽이 셀렉트를 갈아끼우므로 이 체인은 여기서 멈춘다(폴백 제출로 가지 않게).
            if (err && err.name === 'AbortError') { return new Promise(function () {}); }
            if (pendingSelectRequests[selector] === controller) { delete pendingSelectRequests[selector]; }
            throw err;
        });
    }

    /** 검색·페이징을 결과 영역 조각 갱신으로 가져간다. AdminForm.submit 이 먼저 묻고, true 를 받으면 네이티브 제출을 하지 않는다. */
    function bindAsyncList() {
        if (typeof AdminForm === 'undefined' || typeof AdminForm.onList !== 'function') { return; }

        // 진행 중인 요청. 연달아 누르면 응답이 순서를 바꿔 도착할 수 있어 새 요청을 낼 때 이전 요청을 끊는다.
        var pendingRequest = null;

        AdminForm.onList(function (form) {
            // CSRF 토큰은 주소에 남길 이유가 없어 뺀다(GET 조회라 필요하지도 않다). 잠긴 셀렉트는 FormData 에 실리지 않는다.
            var params = new URLSearchParams();
            new FormData(form).forEach(function (value, key) {
                if (key === '_csrf') { return; }
                params.append(key, value);
            });
            var url = form.getAttribute('action') + '?' + params.toString();

            if (pendingRequest) { pendingRequest.abort(); }
            var controller = new AbortController();
            pendingRequest = controller;

            var result = document.querySelector('[data-list-result]');
            if (result) { result.style.opacity = '0.5'; }

            fetch(url, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin',
                signal: controller.signal
            }).then(function (res) {
                if (res.redirected || !res.ok) { throw new Error('조회 실패(' + res.status + ')'); }
                return res.text();
            }).then(function (html) {
                var current = document.querySelector('[data-list-result]');
                if (!current) { throw new Error('list result not found'); }
                current.outerHTML = html;
                // 주소가 목록 상태를 담도록 맞춘다(새로고침·공유해도 같은 목록이 열린다).
                window.history.replaceState(null, '', url);
                pendingRequest = null;
            }).catch(function (err) {
                if (err && err.name === 'AbortError') { return; }
                pendingRequest = null;
                if (result) { result.style.opacity = ''; }
                form.submit();
            });
            return true;
        });
    }

    document.addEventListener('DOMContentLoaded', bindAsyncList);

    return {
        openPopup: openPopup,
        replaceSelect: replaceSelect
    };
})();
