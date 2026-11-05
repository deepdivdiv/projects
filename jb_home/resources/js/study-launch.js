/**
 * 학습방 열기 — `[data-study-open]` 링크를 가로채 PC 는 새 창, 모바일·태블릿은 같은 탭으로 보낸다.
 * (온라인학습내역의 [학습하기] 가 쓴다. 학습방을 부르는 화면이 늘면 이 속성만 붙이면 된다.)
 *
 * === 왜 갈라 놓는가 ===
 * PC 새 창의 이점은 뒤로가기로 재생이 끊기는 사고를 구조적으로 없애고(창에 히스토리가 1건뿐),
 * 헤더·사이드바 없이 전체화면을 쓸 수 있고, 닫을 때 부모 창의 목록만 갱신하면 된다는 점이다.
 * 모바일에서는 새 창이 결국 탭 전환이라 그 이점이 거의 없고 주소창만 남으므로 같은 탭으로 간다.
 *
 * <b>새 창은 보안 장치가 아니다.</b> F12·우클릭·키 차단은 브라우저 메뉴·프록시·다른 브라우저로 쉽게 우회된다.
 * 학습시간의 실제 방어는 서버가 인정값을 자르는 계산이다(UserCourseLessonDetailLog.record).
 * 여기서 창을 나누는 이유는 조작 방지가 아니라 위에 적은 UX·유실 방지다.
 *
 * 스크립트가 없거나 팝업이 차단되면 링크의 기본 동작(같은 탭 이동)으로 떨어진다 — 학습은 어느 쪽에서든 된다(점진적 향상).
 */
(function () {
    'use strict';

    /**
     * 새 창으로 열 화면 폭(px) 기준. UA 스니핑 대신 폭으로 가른다 —
     * 터치 노트북이 모바일로 오판되지 않고, 태블릿은 같은 탭이 나으므로 의도와 맞는다.
     */
    var WIDE_SCREEN_MIN_WIDTH = 1024;

    /**
     * 새 창을 열 때 요청하는 크기·위치 — <b>화면 가용 영역을 꽉 채운다(= 사실상 최대화).</b>
     *
     * 학습방은 플레이어 + 학습목차 2단이라 창이 좁으면 목차가 접히고(1024px 이하) 영상도 작아진다.
     * 고정값(1440x900)으로 두면 더 큰 모니터에서 화면 가운데 작은 창으로 떠 남는 공간을 못 쓴다.
     *
     * <b>브라우저는 창을 OS 수준으로 '최대화' 할 수 없다</b> — 스크립트가 할 수 있는 최대는 가용 영역
     * (작업표시줄·독을 뺀 영역 = screen.availWidth/availHeight)을 채우는 것이고, 그게 여기서 하는 일이다.
     *
     * availLeft·availTop 은 <b>현재 모니터</b>의 가용 영역 좌상단이다(비표준이지만 Chrome·Firefox·Safari 가
     * 제공한다 — <b>확인 필요</b> 항목이라 없을 때는 0 으로 떨어뜨린다). 그냥 0,0 을 주면 보조 모니터에서
     * 학습을 시작한 학습자의 창이 주 모니터로 튄다. 모니터별 정확한 영역은 Window Management API
     * (getScreenDetails)를 써야 알 수 있는데 권한 프롬프트가 떠 학습 시작 흐름을 끊으므로 쓰지 않는다.
     *
     * @returns {{features: string, width: number, height: number, left: number, top: number}}
     */
    function studyWindowBounds() {
        var screen = window.screen || {};
        var width = screen.availWidth || screen.width || 1440;
        var height = screen.availHeight || screen.height || 900;
        var left = typeof screen.availLeft === 'number' ? screen.availLeft : 0;
        var top = typeof screen.availTop === 'number' ? screen.availTop : 0;
        return {
            width: width,
            height: height,
            left: left,
            top: top,
            /*
             * <b>noopener 를 넣지 않는다.</b> 넣으면 창은 열리는데 window.open() 이 <b>null 을 돌려준다</b>
             * (명세 동작) — 그러면 아래 코드가 "팝업이 차단됐다" 로 잘못 읽어 preventDefault 를 건너뛰고,
             * 링크 기본 동작까지 실행돼 <b>새 창과 기존 창이 함께 학습방으로 이동한다</b>(실제로 그 증상이 났다).
             * 게다가 noopener 는 학습방의 window.opener 도 끊어 [학습 종료] 가 창을 닫지 못하게 만든다
             * (study-room.js). noopener 는 신뢰할 수 없는 <b>외부</b> 링크의 reverse tabnabbing 을 막는
             * 장치다 — 여기는 같은 출처의 우리 화면이고 opener 를 의도적으로 쓰므로 붙이지 않는다.
             */
            features: 'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top
        };
    }

    /**
     * 학습방 창을 열고 가용 영역에 맞춘다.
     *
     * <b>resizeTo·moveTo 로 한 번 더 맞추는 이유</b> — window.open 의 features 는 <b>새로 만드는 창에만</b>
     * 적용된다. 같은 이름('studyRoom')의 창이 이미 열려 있으면 브라우저는 그 창을 재사용하면서 features 를
     * 무시하므로, 두 번째 진입부터는 크기가 그대로다(실측으로 확인했다). 그때 크기를 맞추는 건 이 두 줄뿐이다.
     * 같은 출처(same-origin)이고 스크립트가 연 창이라 호출이 허용되지만, 브라우저·정책에 따라 거부될 수 있어
     * try 로 감싸고 실패는 무시한다 — 창은 이미 열렸고 학습은 진행되므로 실패시킬 이유가 없다.
     *
     * @param {string} url 학습방 주소
     * @returns {Window|null} 열린 창(팝업이 차단되면 null)
     */
    function openStudyWindow(url) {
        var bounds = studyWindowBounds();
        var studyWindow = window.open(url, 'studyRoom', bounds.features);
        if (!studyWindow) {
            return null;
        }
        try {
            studyWindow.moveTo(bounds.left, bounds.top);
            studyWindow.resizeTo(bounds.width, bounds.height);
        } catch (e) {
            // 창 크기·위치 조정이 거부돼도 학습에는 영향이 없다.
        }
        studyWindow.focus();
        return studyWindow;
    }

    /**
     * 학습방을 연다 — PC 는 새 창, 모바일·태블릿은 같은 탭.
     *
     * 링크 클릭 말고 다른 흐름(수강신청 완료 모달의 [지금 학습하기] 확인 등)에서도 같은 규칙으로 열어야 하므로
     * 함수로 내보낸다 — 화면마다 폭 기준을 다시 적으면 한쪽만 고쳐져 동작이 갈린다.
     *
     * 반드시 <b>사용자 동작(클릭) 핸들러 안에서</b> 불러야 한다. 비동기 응답을 기다린 뒤 부르면 브라우저가
     * 팝업으로 보고 차단한다 — 그래서 모달의 [확인] 콜백처럼 클릭에서 이어지는 자리에서 부른다.
     *
     * @param {string} url 학습방 주소
     * @returns {boolean} 새 창으로 열었으면 true(호출한 쪽이 기본 이동을 막을지 정한다)
     */
    function openStudyRoom(url) {
        if (window.innerWidth < WIDE_SCREEN_MIN_WIDTH) {
            window.location.href = url;
            return false;
        }
        if (!openStudyWindow(url)) {
            // 팝업이 차단됐으면 같은 탭으로 떨어뜨린다 — 학습은 어느 쪽에서든 된다.
            window.location.href = url;
            return false;
        }
        return true;
    }

    window.StudyLaunch = { open: openStudyRoom };

    document.addEventListener('click', function (event) {
        var link = event.target.closest('a[data-study-open]');
        if (!link) {
            return;
        }
        if (window.innerWidth < WIDE_SCREEN_MIN_WIDTH) {
            // 같은 탭 이동 — 링크 기본 동작에 맡긴다(location 을 건드리지 않아 히스토리가 깔끔하다).
            return;
        }
        // window.open 은 클릭 핸들러 안에서 불러야 팝업 차단을 피한다.
        if (!openStudyWindow(link.href)) {
            // 차단됐으면 기본 동작(같은 탭)으로 떨어뜨린다.
            return;
        }
        event.preventDefault();
    });
})();
