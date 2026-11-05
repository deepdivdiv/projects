/**
 * 학습자 "신청 권한 없음" 진입 안내 모달 — 화면에 들어서면 한 번 띄운다.
 *
 * 쓰는 화면: 오프라인 과정 목록(views/user/course/list.html — 문구는 CourseController.OFFLINE_APPLY_NOTICE)·시험일정(views/user/exam/schedule.html).
 * 아직 신청을 열지 않은 영역에 "지금은 신청 권한이 없다 · 누구에게 열리는지 · 추후 개별 안내" 를 먼저 알리는 운영 안내라,
 * 화면마다 스크립트를 박지 않고 이 파일 하나가 마커의 data-* 를 읽어 띄운다(문구는 화면·컨트롤러가 갖고 동작은 여기 한 곳).
 *
 * === 화면이 할 일 ===
 *   <div id="apply_notice" hidden
 *        data-title="현재 교육 신청 권한이 없습니다."
 *        data-text="해당 교육은 온라인 과정 수료자에 한해 신청이 가능합니다."
 *        data-sub="※ 추후 대상자에게 개별 안내 예정이오니 공지사항을 확인해 주세요."></div>
 *   <script defer src="/js/apply-notice.js"></script>   ← common.js(sstModal) 뒤
 *   + 모달 폭·빨강 줄 스타일 apply-notice.css (sample/css/scss/pages/_apply_notice.scss)
 * 마커가 없으면 아무 일도 하지 않는다 — "개설됨"(노출 과정·일정이 있음)은 서버가 마커 자체를 렌더하지 않는 것으로 표현한다.
 *
 * === 설계 요약 ===
 * 1) 제목(data-title)·본문(data-text)은 공통 모달 sstModal 에 그대로 넘긴다. 본문은 textContent 로 들어가 HTML 이 해석되지 않는다(XSS 표면 없음).
 * 2) "※ …" 줄(data-sub)은 빨강으로 보여야 하는데 sstModal 은 문자열 일부에 색을 줄 수 없다(common.js — 퍼블 소유라 고치지 않는다).
 *    그래서 띄운 직후 본문 요소에 <em class="apply_notice_sub"> 를 덧붙인다 — createElement/textContent 만 써서 innerHTML 을 열지 않는다.
 *    모양(블록·간격·빨강·낱말 단위 줄바꿈)은 apply-notice.css 가 준다(과정 상세 신청 확인창의 .apply_notice 와 같은 방식).
 *    다음 sstModal 호출이 textContent 를 다시 넣으므로 조립한 em 이 다른 안내에 남지 않는다.
 * 3) "신청 권한이 없다" 는 작업이 막힌 안내라 경고(warning) 아이콘이다(CLAUDE.md 의 알림 컴포넌트 규약).
 * 4) common.js 가 defer 라 DOMContentLoaded 직전에 실행되므로 그 이벤트를 기다렸다가 sstModal 을 부르고,
 *    모달이 없는 환경에서는 세 줄을 한 문자열로 붙여 window.alert 로 떨어뜨린다(색 없이 — 안내는 사라지지 않는다).
 * 5) 화면이 열릴 때마다 뜬다(탭·검색·페이지 이동도 GET 리로드라 그때마다). 세션당 한 번으로 줄이려면 여기서 sessionStorage 를 본다.
 */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var notice = document.getElementById('apply_notice');
        if (!notice) {
            return;
        }
        var title = notice.getAttribute('data-title') || '';
        var text = notice.getAttribute('data-text') || '';
        var sub = notice.getAttribute('data-sub') || '';

        if (typeof window.sstModal !== 'function') {
            var lines = [];
            if (title) { lines.push(title); }
            if (text) { lines.push(text); }
            if (sub) { lines.push(sub); }
            window.alert(lines.join('\n\n'));
            return;
        }

        window.sstModal({ icon: 'warning', title: title, text: text });

        var textElement = document.querySelector('#modalArea .modalItem > span');
        if (sub && textElement) {
            var subElement = document.createElement('em');
            subElement.className = 'apply_notice_sub';
            subElement.textContent = sub;
            textElement.append(subElement);
        }
    });
})();
