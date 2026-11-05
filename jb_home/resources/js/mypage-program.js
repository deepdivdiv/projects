/**
 * 마이페이지 '온라인학습내역'(views/user/mypage_program.html)의 <b>미신청 과정 팝업</b> 스크립트.
 *
 * === 무엇을 하는가 ===
 * 1) 목록 한 행의 '미신청 과정' 숫자 버튼([data-unapplied-url])을 누르면 그 묶음에서 아직 신청하지 않은 과정 목록을
 *    서버에서 받아 화면 가운데 레이어팝업(#unapplied_layer)으로 띄운다.
 * 2) 팝업 한 행의 [차수 셀렉트][수강신청]으로 그 자리에서 신청한다(form[data-unapplied-apply]). 확인창 → 비동기 접수 →
 *    갱신된 팝업(방금 신청한 과정이 빠진 목록)으로 갈아 끼우고 완료 안내를 띄운다. 사전 역량진단이 남았으면 안내 뒤 진단 화면으로 간다.
 *    [전체 수강신청](form[data-unapplied-apply-all])은 신청할 수 있는 행마다 고른 차수를 모아 한 번에 보낸다 — 서버가 과정마다 따로
 *    접수해, 일부가 거부되면 나머지는 접수되고 거부된 과정은 완료 안내에 사유와 함께 적힌다(아이콘이 경고로 바뀐다).
 * 3) 신청을 한 번이라도 했으면 팝업을 닫을 때 목록을 다시 읽는다 — 뒤의 표(미신청 수·수강기간)가 신청 전 값이기 때문이다.
 *
 * === 설계 요약 ===
 * 1) 목록은 화면에 미리 그려 두지 않고 누를 때 받는다(GET /user/program/{courseProgramId}/unapplied).
 *    신청 응답(POST .../unapplied/apply)도 같은 조각이다. 둘 다 JSON 이 아니라 서버가 렌더한 조각(.layerItem 통째)이라
 *    받은 HTML 로 팝업 안을 그대로 갈아 끼운다 — 과정명·차수 문구는 서버에서 th:text 로 이스케이프돼 오므로
 *    이 파일이 문자열을 조립하지 않는다(CLAUDE.md 화면 규약). 접수 결과(안내 문구·진단 주소)는 조각 루트의 data-* 로 온다.
 * 2) 팝업 껍데기는 퍼블 공통 레이어팝업(.layerPop — .open 클래스로 여닫는다)이고 여닫기는 여기서 한다.
 *    태그 선언형(data-layer-open/close)으로 여는 ui.components.js 는 관리자 자산이라 사용자 사이트가 읽지 않는다
 *    (과정 상세 미리보기 course-preview.js 와 같은 사정·같은 닫기 규칙).
 * 3) 실패(남의 묶음 ID·모집 마감·중복 신청·네트워크 오류)는 가운데 모달로 알린다(CLAUDE.md '알림 컴포넌트' — 막힌 안내).
 *    비동기 요청이라 서버 오류는 ApiResponse JSON 으로 내려오고(GlobalExceptionHandler — X-Requested-With) 그 message 를 쓴다.
 * 4) 확인창·완료 안내는 퍼블 공통 모달(sstModal — #modalArea)이다. 문서 끝(body 마지막)에 붙어 있어 같은 z-index 의
 *    이 팝업 위에 뜬다.
 */
(function () {
    'use strict';

    var layer = document.getElementById('unapplied_layer');
    if (!layer) {
        return;
    }

    var LOAD_FAIL_MESSAGE = '미신청 과정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    var APPLY_FAIL_MESSAGE = '수강신청에 실패했습니다. 다시 시도해 주세요.';

    /**
     * 신청 확인창 문구. 프로그램 구성 과정은 온라인만 담기므로(CourseProgramService.validateCourses) 과정 상세가 온라인 과정에
     * 붙이는 안내를 늘 함께 띄운다 — <b>curriculum_view.html 의 APPLY_NOTICES.online 과 같은 문구</b>다(바꾸면 함께 바꾼다).
     * 그 화면처럼 빨강 블록으로 꾸미는 규칙(curriculum.css)은 여기서 읽지 않아 빈 줄로 띄워 붙인다 —
     * 줄바꿈(\n)은 모달 본문의 white-space: pre-line(dev/_override.scss)이 살린다.
     */
    var APPLY_CONFIRM_TEXT = '수강 신청하시겠습니까?';
    var ONLINE_APPLY_NOTICE = '수강신청 시 시스템상 자동 승인되어 온라인 교육 수강은 가능하나,\n'
            + '수강승인과 별도로 지원자격 검증을 실시하며,\n'
            + '검증 결과는 교육기간 중 순차적으로 개별 안내됩니다.';

    var opener = null;      // 팝업을 연 버튼 — 닫으면 포커스를 이 자리로 돌려준다
    var loading = false;    // 목록을 받아 오는 중(중복 클릭 방지)
    var applying = false;   // 신청을 보내는 중(중복 제출 방지)
    var listStale = false;  // 팝업에서 신청한 뒤라 뒤의 목록이 옛 값이다 — 닫을 때 다시 읽는다

    /**
     * 공통 모달. common.js 가 defer 라 클릭 시점엔 정의돼 있지만, 없을 때도 사유가 사라지지 않게 alert 로 떨어뜨린다.
     * onConfirm 은 [확인]을 눌렀을 때(모달이 없으면 alert 를 닫은 뒤) 부른다.
     */
    function notify(icon, title, text, onConfirm) {
        if (typeof window.sstModal === 'function') {
            window.sstModal({ icon: icon, title: title, text: text, onConfirm: onConfirm });
        } else {
            window.alert(text);
            if (onConfirm) {
                onConfirm();
            }
        }
    }

    function confirmThen(text, onConfirm) {
        if (typeof window.sstModal === 'function') {
            window.sstModal({ icon: 'quest', title: '수강신청', text: text, showCancel: true, onConfirm: onConfirm });
        } else if (window.confirm(text)) {
            onConfirm();
        }
    }

    /** 공통 모달(확인창·완료 안내)이 지금 떠 있는가. 떠 있는 동안의 ESC 는 그 모달의 것이다. */
    function isModalOpen() {
        return document.querySelector('#modalArea.open') !== null;
    }

    /**
     * 팝업을 닫고, 연 버튼으로 포커스를 돌려준다(키보드 사용자가 문서 처음부터 다시 Tab 을 누르지 않게).
     * 팝업에서 신청했으면 뒤의 목록(미신청 수·수강기간)이 옛 값이라 다시 읽는다 — 목록 한 행만 고치려면
     * 그 행의 모든 칸을 서버와 두 벌로 계산해야 해서, 서버가 그린 화면을 다시 받는 쪽을 택했다.
     */
    function closeLayer() {
        layer.classList.remove('open');
        if (listStale) {
            window.location.reload();
            return;
        }
        if (opener !== null) {
            opener.focus();
            opener = null;
        }
    }

    /** 받아 온 조각(.layerItem 통째)으로 팝업 안을 갈아 끼운다. 갈아 낀 새 루트를 돌려준다. */
    function replaceLayerItem(html) {
        layer.querySelector('.layerItem').outerHTML = html;
        return layer.querySelector('.layerItem');
    }

    /**
     * 응답을 조각(HTML)으로 읽는다. 세션이 끊겨 로그인 화면으로 돌려보내졌으면(fetch 는 리다이렉트를 따라가 200 을 준다)
     * 그 화면을 팝업에 넣지 않고 페이지를 그리로 옮긴다(null). 실패 응답은 ApiResponse 의 message 로 오류를 던진다.
     */
    function readFragment(response, failMessage) {
        if (response.redirected) {
            window.location.href = response.url;
            return null;
        }
        if (!response.ok) {
            return response.json().then(function (body) {
                throw new Error((body && body.message) || failMessage);
            }, function () {
                throw new Error(failMessage);
            });
        }
        return response.text();
    }

    // ──────────────────────────── 목록 열기 ────────────────────────────

    function load(button) {
        if (loading) {
            return;
        }
        loading = true;
        fetch(button.getAttribute('data-unapplied-url'), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (response) {
                return readFragment(response, LOAD_FAIL_MESSAGE);
            })
            .then(function (html) {
                if (html === null) {
                    return;
                }
                replaceLayerItem(html);
                opener = button;
                layer.classList.add('open');
                // 연 뒤 포커스를 팝업 안(닫기 X)으로 옮긴다 — 그래야 ESC·Tab 이 팝업의 것으로 동작한다.
                var closeButton = layer.querySelector('.layerClose');
                if (closeButton) {
                    closeButton.focus();
                }
            })
            .catch(function (error) {
                notify('warning', '확인', error.message || LOAD_FAIL_MESSAGE);
            })
            .then(function () {
                loading = false;
            });
    }

    document.addEventListener('click', function (event) {
        var button = event.target.closest('[data-unapplied-url]');
        if (button) {
            event.preventDefault();
            load(button);
        }
    });

    // ──────────────────────────── 수강신청(한 건 · 전체) ────────────────────────────

    /**
     * 접수 뒤 안내. 조각 루트의 data-* 를 읽는다 — 문구(data-apply-message)는 서버가 접수 상태(승인·대기·신청)로 골랐고
     * (전체 신청이면 건수와 접수하지 못한 과정의 사유까지 담긴다), 일부가 거부됐으면 data-apply-failed 가 붙어 아이콘을 경고로 바꾼다.
     * 사전 역량진단이 남았으면 진단 주소(data-pre-survey-url)가 함께 온다 — 있으면 [확인] 뒤 그 화면으로 간다
     * (과정 상세의 신청 직후 흐름과 같다 — 진단은 프로그램당 한 번이라 대개 이미 끝나 있어 비어 온다).
     */
    function announceApplied(layerItem) {
        var message = layerItem.getAttribute('data-apply-message') || '수강신청이 접수되었습니다.';
        var icon = layerItem.hasAttribute('data-apply-failed') ? 'warning' : 'comple';
        var preSurveyUrl = layerItem.getAttribute('data-pre-survey-url');
        if (preSurveyUrl) {
            var surveyName = layerItem.getAttribute('data-survey-name') || '사전 역량진단';
            notify(icon, '수강신청', message + '\n\n이어서 학습 전 사전 역량진단(' + surveyName + ')을 진행합니다.',
                    function () { window.location.href = preSurveyUrl; });
            return;
        }
        notify(icon, '수강신청', message);
    }

    /** 팝업 안의 신청 버튼 전부(행별 [수강신청] · [전체 수강신청]) — 보내는 동안 함께 잠근다(서로 겹쳐 보내지 않게). */
    function applyButtons() {
        return layer.querySelectorAll('form[data-unapplied-apply] button[type="submit"], button[form="unapplied_apply_all"]');
    }

    function setApplyButtonsDisabled(disabled) {
        var buttons = applyButtons();
        for (var index = 0; index < buttons.length; index++) {
            buttons[index].disabled = disabled;
        }
    }

    /**
     * 신청을 보내고 응답 조각으로 팝업을 갈아 끼운 뒤 안내한다(한 건·전체 공용). 접수가 한 건이라도 됐으면(data-applied-cnt)
     * 뒤의 목록이 옛 값이 되므로 닫을 때 다시 읽게 표시한다 — 전체 신청이 모두 거부되면 바뀐 것이 없어 표시하지 않는다.
     * 업무규칙 거부(모집 마감·중복 신청 등 — 한 건 신청)는 팝업을 그대로 두고 버튼만 되살린다(다른 차수를 고르거나 닫을 수 있게).
     */
    function postApply(url, formData) {
        if (applying) {
            return;
        }
        applying = true;
        setApplyButtonsDisabled(true);
        fetch(url, {
            method: 'POST',
            body: formData,   // 숨은 _csrf 필드가 함께 실린다(th:action 이 폼에 그려 준다)
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
            .then(function (response) {
                return readFragment(response, APPLY_FAIL_MESSAGE);
            })
            .then(function (html) {
                if (html === null) {
                    return;
                }
                var layerItem = replaceLayerItem(html);   // 새 조각의 버튼은 잠기지 않은 채 온다
                if (Number(layerItem.getAttribute('data-applied-cnt')) > 0) {
                    listStale = true;
                }
                announceApplied(layerItem);
            })
            .catch(function (error) {
                setApplyButtonsDisabled(false);
                notify('warning', '확인', error.message || APPLY_FAIL_MESSAGE);
            })
            .then(function () {
                applying = false;
            });
    }

    /** 한 행의 셀렉트에서 고른 차수의 표시 문구(확인창에 적는다). */
    function selectedClassText(applyForm) {
        var select = applyForm.querySelector('select');
        var selectedOption = select ? select.options[select.selectedIndex] : null;
        return selectedOption ? selectedOption.text : '';
    }

    // 팝업 안이 통째로 갈아 끼워지므로 폼마다 걸지 않고 document 에서 위임으로 받는다(리스너가 쌓이지 않는다).
    document.addEventListener('submit', function (event) {
        // 한 행의 [수강신청] — 그 행의 폼(셀렉트 + _csrf)을 그대로 보낸다.
        var applyForm = event.target.closest('form[data-unapplied-apply]');
        if (applyForm) {
            event.preventDefault();
            // 확인창에 어느 과정의 어느 차수인지 함께 적는다 — 팝업에 여러 과정이 나란히 있어 잘못 누르기 쉽다.
            var subject = (applyForm.getAttribute('data-course-name') || '') + '\n' + selectedClassText(applyForm);
            confirmThen(subject + '\n\n' + APPLY_CONFIRM_TEXT + '\n\n' + ONLINE_APPLY_NOTICE, function () {
                postApply(applyForm.getAttribute('action'), new FormData(applyForm));
            });
            return;
        }

        // [전체 수강신청] — 빈 폼(_csrf 만 있다)에 신청할 수 있는 행마다 고른 차수를 courseClassIds 로 덧붙여 보낸다.
        // 신청할 수 없는 행은 셀렉트가 없어 저절로 빠진다(서버가 같은 기준으로 버튼 표기 'N개' 를 셌다).
        var applyAllForm = event.target.closest('form[data-unapplied-apply-all]');
        if (!applyAllForm) {
            return;
        }
        event.preventDefault();
        var rowForms = layer.querySelectorAll('form[data-unapplied-apply]');
        if (rowForms.length === 0) {
            return;
        }
        var formData = new FormData(applyAllForm);
        
        // 확인창에 무엇을 신청하는지 과정마다 한 줄씩 적는다 — 행마다 고른 차수가 그대로 신청되므로 눌러 보기 전에 보여 준다.
        var confirmText = '미신청 과정을 모두 수강 신청하시겠습니까?\n\n'
                + ONLINE_APPLY_NOTICE;
        confirmThen(confirmText, function () {
            postApply(applyAllForm.getAttribute('action'), formData);
        });
    });

    // ──────────────────────────── 닫기 ────────────────────────────

    // 닫는 길은 공통 레이어팝업과 같은 셋이다 — 우상단 X(.layerClose) · [data-layer-close] · 바탕(어두운 부분) 클릭.
    // 팝업 안이 통째로 갈아 끼워지므로 버튼마다 걸지 않고 바깥(#unapplied_layer)에서 위임으로 받는다.
    layer.addEventListener('click', function (event) {
        if (event.target.closest('[data-layer-close], .layerClose') || !event.target.closest('.layerItem')) {
            closeLayer();
        }
    });

    // 캡처 단계에서 본다 — 공통 모달(common.js)의 ESC 처리가 먼저 돌아 모달을 닫아 버리면 "모달이 떠 있었다" 를
    // 알 수 없어, 확인창을 ESC 로 닫을 때 뒤의 팝업까지 함께 닫힌다.
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && layer.classList.contains('open') && !isModalOpen()) {
            closeLayer();
        }
    }, true);
})();
