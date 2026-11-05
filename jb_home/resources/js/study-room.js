/**
 * 학습방(온라인 영상 학습) 스크립트 — views/user/study/room.html 전용.
 *
 * 퍼블 시안의 /sample/js/video.js 와 파일명을 겹치지 않게 분리했다(그 파일은 시안 전용이고 여기는 실동작이다).
 *
 * === 설계 요약 ===
 * 1) video.js 를 '재생 엔진으로만' 쓴다(controls:false). 콘텐츠가 HLS(.m3u8)라 Safari 를 뺀 브라우저는
 *    <video src> 만으로 재생하지 못하고, video.js 8.x 가 내장한 http-streaming 이 그걸 해결한다.
 *    컨트롤바는 퍼블 시안 마크업을 그대로 쓰고 이 스크립트가 player API 로 조작한다.
 * 2) 저장 주기는 setInterval 이 아니라 timeupdate 로 센다. setInterval 은 일시정지·백그라운드에서도 계속 돌아
 *    인정 0인 빈 요청을 보내고, 모바일 백그라운드에서는 브라우저가 1분 이상으로 늘려 버린다.
 *    timeupdate 는 재생 중에만 발생하므로 "재생한 만큼만 저장 요청" 이 자연히 성립한다.
 * 3) 정지(pause)마다 남은 구간을 한 번 더 보낸다. 인터벌만 두면 마지막 저장 이후 구간(최대 29초)이 늘 미저장으로
 *    남는다. 창을 강제로 닫아 정지 이벤트조차 돌지 못한 무단 이탈의 유실은 받아들인다(운영 판단) —
 *    그래서 브라우저에 구간을 남겨 두고 다음 진입에서 밀어 넣는 보정 저장 경로를 두지 않는다.
 * 4) 보내는 값은 시각이 아니라 재생위치(currentTime)다. 인정 학습시간은 서버가 정한다 — 재생위치 차 ·
 *    서버 시각차 · 인터벌 상한 · 구간 겹침 제거의 최솟값에 차시 상한을 겹친다.
 *    그래서 아래 싱크바 잠금 · 배속 제한은 '화면 정리'이고 실제 방어가 아니다. 개발자도구로 우회해도 인정값이 늘지 않는다.
 *    <b>다음 구간의 시작은 서버가 응답한 '인정이 닿은 위치'(savedEndPositionSecond)다.</b> 내림한 정수 위치를
 *    보내므로 구간이 실제로 흐른 시간보다 1초 길 수 있고, 서버가 그 1초를 깎으면 화면이 그 지점으로 되돌아가
 *    다음 저장에서 다시 주장한다 — 그래야 끝까지 본 차시가 1초 모자라 99.89% 로 남지 않는다(saveProgress · applySaveResponse).
 * 5) 재생 통제 값은 전부 서버가 내려 준 정책(#study_room 의 data-*)에서 읽는다 —
 *    "배속 금지" 같은 값을 이 파일에 리터럴로 적지 않는다(차수 정책 스냅샷이 정한다).
 * 6) 백그라운드 재생은 <b>웹만 허용하고 모바일은 막는다</b>(운영 방침 — isMobileDevice).
 *    차수마다 달라지는 값이 아니라 기기에 따라 갈리는 규칙이라 정책 스냅샷이 아니라 여기서 판정한다.
 *    4) 때문에 웹 백그라운드라고 인정 시간이 더 쌓이지는 않는다 — 서버가 실제로 흐른 시간으로 자른다.
 *    막는 길은 셋이다 — 가려지는 순간 멈추고(visibilitychange), 가려진 채 다시 시작된 재생을 되돌리고(blockHiddenPlay —
 *    알림창 · 잠금화면 · 이어폰 버튼은 visibilitychange 없이 play() 가 불린다), 미디어 세션 핸들러로 그 요청 자체를
 *    가로채며(applyMediaSessionControl), 작게 보기(PiP)는 속성으로 막는다(applyPictureInPictureControl).
 *    규정상 그 동안의 학습시간이 저장되지 않는다는 안내는 학습을 시작하기 전 덮개에 둔다(openMobileNotices).
 * 7) 저장이 서버에 닿지 못하면 한 번 더 보내고(saveProgress 의 재시도), 그래도 어긋나 서버가 구간을 거부(REJECTED)하면
 *    <b>접속을 다시 열어</b> 인정 학습시간 지점부터 잇는다(reenter). 건너뛰기 금지 차수의 허용 위치는 인정시간
 *    기준이라, 유실로 재생위치가 인정시간보다 40초 넘게 앞서면 그 접속의 저장은 전부 거부된다. 접속 안에서는
 *    되돌릴 길이 없다 — 겹침 제거 기준이 그 접속의 끝 위치라 어디로 되감아도 인정되지 않는다. 새 접속만이
 *    기준을 되돌린다. 모바일에서 거부가 안내 없이 끝까지 이어지던 사고(13분 시청에 인정 0초)의 수정이다.
 */
(function () {
    'use strict';

    var config = document.getElementById('study_room');
    var videoElement = document.getElementById('study_player');
    if (!config || !videoElement) {
        // 학습방 화면이 아니면(다른 화면에 이 파일이 실려도) 아무것도 하지 않는다.
        return;
    }

    // ──────────────────────────── 학습목차 사이드(접기·펼치기) ────────────────────────────

    /**
     * 헤더 메뉴(li[data-panel]) ↔ 사이드 패널(.as_panel[data-panel]) 짝을 맞춰 여닫는다.
     *
     * 퍼블 시안은 이 동작을 `sample/js/video.js` 가 갖고 있는데, 학습방은 그 파일을 읽지 않는다
     * (파일명이 video.js 재생 엔진과 겹치고, 그 파일은 퍼블 소유라 고치지 않는다는 방침이다).
     * 그래서 <b>여기에 다시 붙인다 — 없으면 [학습목차]·[×] 버튼이 무반응이고, 특히 모바일에서
     * 사이드가 본문 위를 덮는 시트라 영상·[학습 종료]·안내문구가 가려진 채 닫을 방법이 없다</b>
     * (실측으로 확인했다 — 390px 화면에서 시트가 플레이어를 절반까지 덮었다).
     *
     * <b>video.js 확인보다 먼저 건다.</b> 재생 엔진을 못 받은 화면에서도 시트는 닫을 수 있어야
     * 아래 덮개의 실패 안내를 읽을 수 있다(모바일에서 시트가 그 안내를 덮는다).
     *
     * 접기는 `.videoAside.is-hide` 로만 표현하고 어떤 패널을 보고 있었는지(`.is-on`)는 건드리지 않는다 —
     * 그래야 닫았다가 다시 열 때 보던 패널이 그대로 열린다(퍼블 규칙과 같다).
     */
    var aside = document.querySelector('#videoWrap .videoAside');
    var panelMenus = document.querySelectorAll('#videoWrap header [data-panel]');

    function closeAside() {
        aside.classList.add('is-hide');
        for (var i = 0; i < panelMenus.length; i++) {
            panelMenus[i].classList.remove('active');
        }
    }

    function openPanel(panelName) {
        /*
         * 짝이 되는 패널이 없으면 <b>열지 않는다.</b> 그냥 진행하면 아래 루프가 모든 패널의 is-on 을 벗겨
         * 사이드가 폭(56rem)만 차지한 채 텅 비고, 보고 있던 학습목차까지 사라진다 — 화면에도 콘솔에도
         * 사유가 없어 되돌릴 방법이 다른 탭을 다시 누르는 것뿐이다(실측으로 확인했다).
         *
         * 탭에 data-ready="false" 를 빠뜨렸을 때 여기로 들어온다. 그 표시와 같은 답을 주어,
         * '표시를 붙이는 것' 과 '패널을 두지 않는 것' 중 어느 쪽으로 적어도 결과가 어긋나지 않게 한다.
         */
        var targetPanel = aside.querySelector('.as_panel[data-panel="' + panelName + '"]');
        if (!targetPanel) {
            notify('기능 준비 중입니다.');
            return;
        }
        var panels = aside.querySelectorAll('.as_panel[data-panel]');
        for (var i = 0; i < panels.length; i++) {
            panels[i].classList.toggle('is-on', panels[i].getAttribute('data-panel') === panelName);
        }
        for (var j = 0; j < panelMenus.length; j++) {
            panelMenus[j].classList.toggle('active', panelMenus[j].getAttribute('data-panel') === panelName);
        }
        aside.classList.remove('is-hide');
    }

    if (aside) {
        for (var menuIndex = 0; menuIndex < panelMenus.length; menuIndex++) {
            panelMenus[menuIndex].addEventListener('click', function () {
                /*
                 * 아직 받쳐 줄 도메인이 없는 탭(관련학습·수강평·학습질문)은 패널을 열지 않고 사유만 알린다.
                 * 빈 패널을 열면 학습자가 "내 데이터가 없는 것" 과 "아직 만들지 않은 것" 을 구분하지 못하고,
                 * 보던 학습목차까지 닫혀 되돌아가야 한다. 그래서 여는 동작 자체를 하지 않는다.
                 * 판정 재료는 화면이 준다(data-ready="false") — 어느 탭이 준비 중인지 이 파일에 적지 않는다.
                 */
                if (this.getAttribute('data-ready') === 'false') {
                    notify('기능 준비 중입니다.');
                    return;
                }
                // 열려 있는 패널의 메뉴를 다시 누르면 닫는다 — 닫는 길이 [×] 하나뿐이면 누른 자리에서 되돌릴 수 없다.
                if (this.classList.contains('active')) {
                    closeAside();
                    return;
                }
                openPanel(this.getAttribute('data-panel'));
            });
        }
        var closeButtons = aside.querySelectorAll('.as_close');
        for (var closeIndex = 0; closeIndex < closeButtons.length; closeIndex++) {
            closeButtons[closeIndex].addEventListener('click', closeAside);
        }

        /*
         * 좁은 화면(_video.scss 의 res-laptop, 1024px 이하)에서는 사이드가 본문 위를 덮는 시트라
         * 처음부터 닫혀 있어야 한다. 마크업에는 is-hide 가 없으므로(넓은 화면 기본이 열림) 폭을 보고 붙인다.
         * 폭 기준은 study-launch.js 의 새 창 기준(1024px)과 같은 값이다 — 새 창으로 열리는 폭이 곧
         * 사이드가 열려 있어도 되는 폭이다.
         */
        var narrowScreen = window.matchMedia('(max-width: 1024px)');

        function syncAsideToViewport() {
            if (narrowScreen.matches) {
                closeAside();
                return;
            }
            var openedPanel = aside.querySelector('.as_panel.is-on');
            if (openedPanel) {
                openPanel(openedPanel.getAttribute('data-panel'));
                return;
            }
            aside.classList.remove('is-hide');
        }

        syncAsideToViewport();
        narrowScreen.addEventListener('change', syncAsideToViewport);
    }

    // ──────────────────────────── 학습 규칙 안내(접기·펼치기) ────────────────────────────

    /**
     * 영상 아래 안내(.infoTip)를 <b>첫 줄만 남기고 접는다.</b>
     *
     * 이 안내는 차수 정책에 따라 1~5줄로 늘어나는데, 다 펼쳐 두면 영상과 [학습 종료] 사이를 밀어내
     * 낮은 창에서 버튼이 접힌 자리로 내려간다(실측에서 이미 한 번 겪어 .videoContent 에 스크롤을 줬다).
     * 그렇다고 지워 버리면 학습자가 이수 기준·건너뛰기 제한을 알 방법이 없어진다. 그래서 접는다.
     *
     * <b>머리줄을 서버가 고르지 않는다.</b> 줄이 전부 조건부라 정책 조합마다 첫 줄이 달라진다 —
     * 여기서 '첫 자식' 으로 잡으면 조합이 늘어도 규칙이 하나다(화면은 줄을 순서대로 적기만 하면 된다).
     *
     * <b>접기는 스크립트가 붙이는 .is-collapsible 에만 걸린다</b>(pages/_study.scss). 이 파일이 실리지
     * 않거나 위에서 예외가 나면 접히지 않고 전부 보인다 — 못 읽는 쪽이 더 나쁜 실패라 기본을 펼침으로 뒀다.
     * 줄이 하나뿐이면 접을 것이 없으므로 토글 버튼을 드러내지 않는다(누를 수 있는데 아무 일도 없는 버튼을 두지 않는다).
     */
    var tip = document.getElementById('study_tip');
    var tipLines = document.getElementById('study_tip_lines');
    var tipToggle = document.getElementById('study_tip_toggle');

    // 블록 안 함수 선언은 처리가 갈리므로(strict 모드 블록 스코프) 이 파일의 다른 곳처럼 var 에 담는다.
    var setTipCollapsed = function (collapsed) {
        tip.classList.toggle('is-collapsed', collapsed);
        tipToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        /*
         * 표시는 화살표 하나뿐이다(좁은 화면에서 '자세히 보기' 는 안내문과 같은 줄을 차지해 읽기를 방해했다).
         * 화살표만 남기면 화면낭독기가 읽을 이름이 없으므로 aria-label 로 뜻을 따로 준다.
         */
        tipToggle.textContent = collapsed ? '▼' : '▲';
        tipToggle.setAttribute('aria-label', collapsed ? '학습 규칙 안내 펼치기' : '학습 규칙 안내 접기');
    };

    if (tip && tipLines && tipToggle && tipLines.children.length > 1) {
        tipToggle.hidden = false;
        tip.classList.add('is-collapsible');
        setTipCollapsed(true);

        /*
         * 안내 영역 아무 곳이나 눌러도 펼쳐진다(버튼만 누르게 하면 좁은 화면에서 표적이 너무 작다).
         * 글자를 드래그해 복사하는 중에는 펼치지 않는다 — 선택 영역이 있으면 클릭이 아니라 선택의 끝이다.
         */
        tip.addEventListener('click', function () {
            var selection = window.getSelection();
            if (selection && selection.toString().length > 0) {
                return;
            }
            setTipCollapsed(!tip.classList.contains('is-collapsed'));
        });
    }

    /*
     * 재생 엔진(video.js)이 없으면 이 아래 전부가 성립하지 않는다.
     *
     * <b>여기서 조용히 return 하면 [학습 시작]을 눌러도 아무 반응이 없다.</b> 학습자는 "영상이 안 나온다" 만
     * 알게 되고, 화면에도 콘솔에도 사유가 없어 개발자가 되짚을 실마리가 없다(실제로 그 상태를 겪었다).
     * 그래서 사유를 덮개 문구에 적고 버튼을 잠근 뒤, 콘솔에 확인할 파일 경로까지 남긴다.
     *
     * 이 분기가 실제로 타지는 건 video.min.js 가 404 이거나 네트워크·확장프로그램에 막혔을 때다 —
     * 그래서 이 파일을 CDN 이 아니라 /vendors 정적 자산으로 옮겼다(room.html 참고).
     */
    if (typeof window.videojs !== 'function') {
        var brokenNote = document.getElementById('study_cover_note');
        var brokenButton = document.getElementById('study_start_button');
        if (brokenNote) {
            brokenNote.textContent = '재생 모듈을 불러오지 못했습니다. 새로고침 후에도 같으면 관리자에게 문의해 주세요.';
        }
        if (brokenButton) {
            brokenButton.disabled = true;
        }
        if (window.console && window.console.error) {
            window.console.error('[study-room] video.js 를 불러오지 못했습니다 — /vendors/videojs/8.3.0/video.min.js 응답을 확인하세요.');
        }
        return;
    }

    // ──────────────────────────── 설정(서버가 내려 준 정책) ────────────────────────────

    var setting = {
        userCourseId: config.getAttribute('data-user-course-id'),
        courseLessonId: config.getAttribute('data-course-lesson-id'),
        enterUrl: config.getAttribute('data-enter-url'),
        progressUrl: config.getAttribute('data-progress-url'),
        lessonUrl: config.getAttribute('data-lesson-url'),
        skipAllowed: config.getAttribute('data-skip-allowed') === 'true',
        resumeUsed: config.getAttribute('data-resume-used') === 'true',
        sequentialRequired: config.getAttribute('data-sequential-required') === 'true',
        playRates: parseRates(config.getAttribute('data-play-rates')),
        saveIntervalSecond: parseInt(config.getAttribute('data-save-interval'), 10) || 30
    };

    /** 배속 목록 문자열("1.0,1.5") → 숫자 배열. 값이 없으면 1.0 고정(가장 보수적). */
    function parseRates(raw) {
        if (!raw) {
            return [1];
        }
        var rates = [];
        var parts = raw.split(',');
        for (var i = 0; i < parts.length; i++) {
            var rate = parseFloat(parts[i]);
            if (!isNaN(rate) && rate > 0) {
                rates.push(rate);
            }
        }
        return rates.length ? rates : [1];
    }

    // ──────────────────────────── 학습 상태 ────────────────────────────

    /**
     * 진행 중인 학습의 서버 쪽 상태. 입장 응답과 저장 응답으로만 갱신한다 —
     * 화면이 자기가 센 값을 쓰면 서버가 인정한 값과 갈려 "봤는데 시간이 안 올랐다" 를 뒤늦게 알게 된다.
     */
    var study = {
        detailId: null,            // 이번 접속 ID(입장 응답)
        sessionKey: null,          // 이 창의 학습 키(동시학습 판정)
        lastSavedPosition: 0,      // 마지막 저장 시도 시점의 재생위치(내림하지 않음 — 인터벌 타이머 기준)
        sentPosition: 0,           // 서버가 인정한 마지막 끝 위치(정수) — 다음 구간의 시작(보낸 뒤 응답으로 되돌릴 수 있다)
        lastSentAt: 0,             // 마지막 저장을 보낸 벽시계(ms) — 보낼 구간이 실제로 흐른 시간을 넘지 않게 자르는 기준
        maxPlaybackRateSinceSend: 1, // 마지막 전송 이후 쓰인 최대 배속 — 위 자르기에 곱한다(1.5x · 2x 에서 위치가 뒤처지지 않게)
        maxPlayablePosition: 0,    // 재생을 허용하는 최대 위치(건너뛰기 금지에서 되돌릴 기준)
        playSecond: 0,             // 영상 길이(분모)
        studySecond: 0,            // 서버가 인정한 이 차시의 누적 학습시간 — 입장 · 저장 응답으로만 갱신한다
        review: false,             // 완료한 차시로 들어왔는가(복습) — 영상 끝 부족분 복구의 대상이 아니다
        lessonCompleted: false,    // 이 창에서 차시 완료 응답을 받았는가
        entered: false,            // 입장(재생 시작)을 마쳤는가
        ended: false,              // 재생이 영상 끝에 닿았는가(끝 구간 재시도 중)
        lessonFull: false,         // 서버 누적이 분모를 다 채웠는가(더 주장할 것이 없다 — 끝 재시도를 멈추는 기준)
        stopped: false,            // 다른 창에 밀려나 저장이 끝난 상태인가
        saving: false,             // 저장 요청이 진행 중인가(중복 발사 방지 — 재시도 대기까지 포함)
        reentering: false,         // 거부 복구로 접속을 다시 여는 중인가(그 동안은 어떤 저장도 보내지 않는다)
        reenterWithoutAcceptCount: 0, // 인정 저장 없이 이어진 재진입 횟수(REENTER_LIMIT 에 걸리면 멈춘다)
        backgroundPlayBlocked: false // 모바일에서 화면이 가려진 채 시작된 재생을 되돌렸는가(돌아왔을 때 한 번 알린다)
    };

    var player = window.videojs(videoElement, {
        controls: false,
        autoplay: false,
        preload: 'metadata',
        /*
         * fill: true — 플레이어가 부모(.videoArea)를 꽉 채우게 한다. <b>빼면 영상이 보이지 않는다.</b>
         *
         * video.js 는 초기화할 때 <video> 를 <div class="video-js"> 로 바꿔치우고 원래 video 를 그 안으로 넣는다
         * (id·class 가 div 로 옮겨가고 <video> 는 .vjs-tech 가 된다). 그래서 퍼블 CSS 의
         * `.videoArea video { width:100%; height:100% }`(pages/_video.scss)가 그 div 에는 걸리지 않고,
         * video.js 기본 크기 300x150 이 그대로 적용된다 — 600x300 영역에 1/4 크기로 박혀
         * 배경만 크게 보이고 "영상이 안 나온다" 로 드러난다(실측으로 확인했다).
         * fill 은 플레이어에 .vjs-fill 을 붙여 부모를 100% 채운다.
         */
        fill: true,
        // 목록이 하나면(정책 X10) video.js 가 배속 메뉴를 만들지 않는다 — '배속 금지' 가 정책으로 표현된다.
        playbackRates: setting.playRates,
        // 방향키 seek 을 막는다. 싱크바를 잠가도 키보드가 열려 있으면 뚫린다.
        userActions: { hotkeys: false }
    });

    // ──────────────────────────── 화면 요소 ────────────────────────────

    var el = {
        cover: document.getElementById('study_cover'),
        startButton: document.getElementById('study_start_button'),
        coverNote: document.getElementById('study_cover_note'),
        seek: document.getElementById('study_seek'),
        // 끌어서 이동할 실제 영역. 얇은 막대(.movBar)가 아니라 클릭 여유를 둔 감싼 영역이다
        // (퍼블 _video.scss 가 여기에 padding · cursor · touch-action 을 준다).
        seekGauge: document.querySelector('#study_seek .mov-gauge'),
        played: document.getElementById('study_played'),
        play: document.getElementById('study_play'),
        pause: document.getElementById('study_pause'),
        volume: document.getElementById('study_volume'),
        volumeGauge: document.getElementById('study_volume_gauge'),
        nowTime: document.getElementById('study_now_time'),
        totalTime: document.getElementById('study_total_time'),
        speedArea: document.getElementById('study_speed_area'),
        speed: document.getElementById('study_speed'),
        fullscreen: document.getElementById('study_fullscreen'),
        exit: document.getElementById('study_exit'),
        prevLesson: document.getElementById('study_prev_lesson'),
        nextLesson: document.getElementById('study_next_lesson'),
        lessonList: document.getElementById('study_lesson_list'),
        progress: document.getElementById('study_progress'),
        progressText: document.getElementById('study_progress_text')
    };

    /**
     * 덮개의 기본 안내 문구. 재생에 실패해 덮개를 되살릴 때 원래 문구로 돌려놓는 데 쓴다.
     * 화면에서 읽어 두므로 room.html 의 문구를 고쳐도 따라간다(리터럴로 박으면 두 곳이 갈린다).
     */
    var coverDefaultNote = el.coverNote.textContent;

    /**
     * 영상 로딩 제한 시간(ms). 이 안에 loadedmetadata 가 오지 않으면 실패로 보고 덮개를 되살린다.
     *
     * 15초는 <b>HLS 의 마스터·미디어 플레이리스트와 첫 세그먼트까지</b> 감안한 값이다. 더 짧으면 느린 회선의
     * 정상 로딩을 끊어 버리고, 더 길면 멈춘 화면을 그만큼 오래 보게 된다.
     */
    var LOAD_TIMEOUT_MILLISECOND = 15000;

    /**
     * 영상이 끝난 뒤 남은 구간을 다시 보내기까지 기다리는 시간(ms).
     * 벽시계가 이월분 1초를 따라잡을 만큼이면 되고(서버의 ②-a 는 반올림이라 1초 이상이면 1초를 내준다),
     * 길게 잡으면 학습자가 창을 닫아 버린 뒤가 된다. 이월분이 여러 초면 그만큼 되풀이한다(END_SAVE_RETRY_MAX).
     */
    var END_SAVE_RETRY_MILLISECOND = 1200;

    /**
     * 서버에 닿지 못한 저장을 다시 보내기까지 기다리는 시간(ms).
     *
     * 실측 로그에서 유실은 저장 42건 중 4건, 약 10% 였고, 유실 하나는 재생위치와 인정시간을 31초 어긋나게 해 둘이 겹치면
     * (40초 초과) 그 접속의 저장이 전부 거부됐다. 재시도 한 번이 그 대부분을 흡수한다. 두 번째 실패는 유실로 받아들인다
     * (거부로 이어지면 reenter 가 잇는다).
     *
     * <b>이 값은 CREDITED_CURSOR_TOLERANCE_SECOND(초) 보다 작아야 한다(규약 테스트가 잠근다).</b> 재시도가 성공하면 서버의
     * "직전 저장 도착 시각" 이 그만큼 뒤로 밀려 다음 저장의 실경과 상한(②-a)이 그만큼 짧아진다 — 재생위치는 그대로 30초
     * 흘렀는데 서버 시계로는 29초라 1초가 깎인다. 그 1초는 두 겹으로 되찾는다: ⑴ 재시도 전송 시각을 벽시계 기준(lastSentAt)
     * 으로 삼아 학습방이 먼저 그만큼 덜 보내고(saveProgress 의 자르기), ⑵ 그래도 지터로 깎이면 서버가 인정 지점에 기준값을
     * 멈춰 다음 저장이 다시 주장한다. ⑴은 초과분이 CREDITED_CURSOR_TOLERANCE_SECOND 이하일 때만 자르므로, 지연이 그보다
     * 길면 ⑴이 돌지 않고 ⑵의 허용 폭(2초)만 남아 지터 1~2초에 그 몇 초를 영영 잃는다. 1초로 두면 ⑴ 뒤에 ⑵의 폭이
     * 온전히 지터 여유로 남는다. 순단이 1초 안에 돌아오지 않으면 그 구간은 유실이고, 그 뒤는 reenter 의 몫이다.
     */
    var SAVE_RETRY_DELAY_MILLISECOND = 1000;

    /** 서버에 닿지 못한 저장을 다시 보내는 횟수. 한 번이면 순단은 덮고, 끊긴 회선에 요청을 쌓지는 않는다. */
    var SAVE_RETRY_MAX = 1;

    /**
     * 인정 저장 없이 허용하는 연속 재진입 횟수. 저장마다 거부되는 비정상 상태(정책 불일치 · 분모 어긋남)에서
     * 30초마다 재진입을 반복하는 새 루프를 막는 fail-closed 다. 인정 저장이 한 건이라도 오면 0 으로 돌아간다.
     */
    var REENTER_LIMIT = 3;

    /**
     * 영상 끝에서 "다시 볼 구간이 없다" 로 보는 여유(초) — <b>서버 UserCourseLesson.END_OF_VIDEO_TOLERANCE_SECOND 와
     * 같은 값</b>이어야 한다(규약 테스트가 둘을 맞춘다). 인정시간이 영상 끝에 이만큼 가까운데도 미완료면 되감아도
     * 얻을 것이 없다(분모 play_second 가 실제 영상보다 길어 서버가 끝 도달로 보지 못하는 경우 — 편성에서 고칠 일이다).
     */
    var END_OF_VIDEO_TOLERANCE_SECOND = 5;

    /**
     * 영상 끝 잔여 구간 재시도 상한(회). 회차마다 1초쯤 인정되므로 정지·재개가 잦았던 학습의 이월분(보통 1~2초)을
     * 덮고도 남는다. 상한을 두는 이유는 분모(play_second)가 실제 영상보다 짧아 서버가 더 인정할 것이 없을 때
     * (lessonFull 로도 멈추지만) 어떤 경우에도 무한히 보내지 않게 하려는 것이다.
     */
    var END_SAVE_RETRY_MAX = 5;

    /** 영상 끝 재시도에서 저장 응답을 기다리며 건너뛸 수 있는 회차 상한(1.2초 × 25 = 30초). scheduleEndSave 참고. */
    var END_SAVE_WAIT_MAX = 25;

    /**
     * 보낼 구간을 자를 때 벽시계에서 빼 두는 여유(초) — 클라이언트 시계와 서버 시계의 차이(전송 지터)다.
     *
     * 서버는 직전 저장 이후 <b>서버가 잰</b> 경과를 반올림해 상한으로 쓴다(UserCourseLessonDetailLog.record 의 ②-a).
     * 여기서 같은 규칙으로 미리 자르되 이 여유만큼 보수적으로 잡아, 경계(x.5초)에서 서버가 한 초 적게 보는 일을
     * 줄인다. 덜 주장한 구간은 sentPosition 이 그 앞에 남아 다음 저장이 이어 주장하므로 잃는 것이 없고,
     * 서버가 그래도 깎으면 응답의 savedEndPositionSecond 로 되돌아온다(두 겹이라 어느 쪽이 어긋나도 유실이 없다).
     */
    var SAVE_CLOCK_JITTER_SECOND = 0.1;

    /**
     * 벽시계로 먼저 자르는 초과분의 상한(초) — <b>서버 UserCourseLessonDetailLog.CREDITED_CURSOR_TOLERANCE_SECOND 와
     * 같은 값</b>이어야 한다(규약 테스트가 둘을 맞춘다).
     *
     * 내림 위치의 1초 차이(+이월 1초)만 여기서 걷어낸다. 그보다 큰 초과분은 자르지 않고 그대로 보낸다 — 서버가
     * 같은 폭으로 판정해 크게 깎인 요청은 기준값을 요청 끝으로 옮기므로, 보낸 위치가 재생위치를 따라간다.
     * 큰 초과분까지 여기서 자르면 서버는 늘 "요청대로 인정" 으로 보아 그 폭을 적용할 기회가 없고, 안 보낸 꼬리가
     * 화면 쪽에 끝없이 쌓여 이어보기 위치가 실제 시청 위치보다 뒤처진다(timeupdate 가 늦게 오는 백그라운드 탭).
     *
     * 알려진 한계 — 백그라운드 탭(timeupdate 가 1초 단위로 늦는다)에서는 저장마다 재생이 벽시계 반올림보다 0.25초쯤
     * 앞서 자른 꼬리가 조금씩 쌓이고, 3초가 되면 자르지 않고 보내 서버가 기준값을 요청 끝으로 옮기며 그 3초가 빠진다.
     * 수정 전에도 같은 비율(4회에 1초)로 빠졌으므로 나빠진 것은 아니다. 전경 탭은 주기 30.75초가 반올림 31초보다
     * 짧아 꼬리가 스스로 줄어 쌓이지 않는다.
     */
    var CREDITED_CURSOR_TOLERANCE_SECOND = 2;

    /**
     * 벽시계(ms). <b>Date.now() 를 쓰지 않는다</b> — 절전 복귀 · NTP 보정으로 시계가 뒤로 가면 "직전 전송 이후 경과" 가
     * 음수가 되어 그 시간이 지날 때까지 모든 저장이 조용히 빠진다. performance.now() 는 단조 증가라 뒤로 가지 않는다.
     */
    function nowMillis() {
        if (window.performance && typeof window.performance.now === 'function') {
            return window.performance.now();
        }
        return Date.now();
    }

    /**
     * 저장 발사를 저장 주기보다 이만큼 늦춘다(초). <b>이 여유가 없으면 학습시간이 조금씩 사라진다.</b>
     *
     * 보내는 값은 <b>내림한 정수 재생위치</b>인데 발사는 <b>재생위치 30초마다</b>다. 직전 발사 위치의 소수부가
     * 크면(예: 30.95 → 61.05) 내림한 구간은 31초가 되는데(61-30), 그 사이 벽시계로는 30.1초밖에 지나지 않았다.
     * 서버의 ②-a(직전 저장 이후 경과, 반올림 — UserCourseLessonDetailLog.record)는 30 이므로
     * <b>31초 중 30초만 인정하고 남은 1초는 어느 회차에서도 다시 주장되지 않는다</b>
     * (로그에 '직전 저장 이후 경과(몰아보내기 차단) — 요청 31초 중 30초 인정' 으로 남는다).
     * 원 테이크로 끝까지 본 학습자의 차시가 몇 초 모자라 미완료로 남던 원인이 이것이다.
     *
     * 0.75초를 더해 발사하면 벽시계 간격이 30.75초 이상이 되어 서버의 반올림이 31 을 내주므로,
     * 내림으로 31초가 된 구간도 그대로 인정된다. 1초를 넘게 더하면 구간이 32초가 될 수 있어 다시 깎이고,
     * 0.5초 미만이면 지터로 반올림이 30 에 머무를 수 있다 — 그 사이 값이다.
     *
     * 이 여유로도 다 막지는 못한다 — timeupdate 가 0.25초 넘게 늦으면 인터벌 저장도 구간이 32초가 되고
     * (운영 로그: 05:08→05:40 '요청 32초 중 31초 인정', 벽시계 31초), 정지 · 영상 끝 저장은 발사 시점을 학습자가
     * 정하므로 더 잦다. 그 1초는 이제 잃지 않는다: 보낼 구간을 벽시계로 먼저 자르고(saveProgress), 서버가 그래도
     * 깎으면 응답의 인정 위치로 되돌아가 다음 저장이 이어 주장한다(applySaveResponse).
     * 그래서 이 값은 "깎이지 않게" 가 아니라 "되돌아가는 일이 드물게" 맞추는 값이 됐다.
     *
     * <b>서버 쪽 상한을 푸는 방법은 쓰지 않는다.</b> ②-a 에 여유를 주면 방치 뒤 요청을 잘게 쪼개 보낼 때
     * 그 여유가 회차마다 쌓여 방치 시간이 학습시간으로 바뀐다(그것이 ②-a 가 지키는 것이다).
     * 인정값은 어차피 서버가 자기 시계로 정하므로, 이 값은 방어가 아니라 <b>정상 학습이 상한에 걸리지 않게
     * 맞춰 주는 협조 장치</b>다.
     */
    var SAVE_INTERVAL_MARGIN_SECOND = 0.75;

    /** 로딩 제한 타이머 핸들. 로딩이 끝나거나 실패하면 해제한다. */
    var loadTimer = null;

    function clearLoadTimer() {
        if (loadTimer !== null) {
            window.clearTimeout(loadTimer);
            loadTimer = null;
        }
    }

    // ──────────────────────────── 안내(모달/토스트) ────────────────────────────

    /**
     * 작업이 막힌 안내는 화면 가운데 모달로 띄운다(우측 상단 토스트는 성공/완료 전용 — 3초 뒤 사라져
     * 막혔다는 사실을 놓치기 쉽다). 전체화면 중이면 먼저 해제한다 — 전체화면 위에는 우리 모달이 뜨지 못한다.
     *
     * iOS Safari 는 &lt;video&gt; 자체의 네이티브 전체화면만 지원해 위 해제가 듣지 않을 수 있다 —
     * 그러면 모달이 전체화면 뒤에 떠 학습자가 보지 못한다.
     *
     * <b>이 함수는 재생을 멈추지 않는다.</b> 안내 대부분은 학습을 멈출 이유가 없는 것들이라
     * (잠긴 차시 · 준비 중 기능 · 전체화면 미지원) 여기서 일괄로 멈추면 누를 때마다 영상이 끊긴다.
     * <b>학습이 실제로 멈춰야 하는 경로는 부르는 쪽이 직접 멈춘다</b> — 저장 거부(handleSaveError)와
     * 다른 창에 밀려남(yieldToOtherStudyRoom)이 그렇고, 둘 다 notify 앞에서 player.pause() 를 부른다.
     * 그 두 곳에서는 안내를 못 봐도 학습시간이 더 쌓이지 않는다(위 iOS 상황의 실제 방어가 이것이다).
     * 새 호출부를 더할 때 "이 안내가 뜬 뒤에도 학습시간이 쌓여도 되는가" 를 보고 필요하면 함께 멈춘다.
     *
     * <b>후속 동작(onClose)은 안내를 어떻게 닫든 한 번 돈다.</b> sstModal 은 [확인] 에만 콜백이 있고
     * X · 바깥 클릭 · ESC 로 닫으면 아무 콜백도 돌지 않는다(퍼블 자산 sample/js/common.js — 개발이 고치지 않는다).
     * 안내는 '읽었다' 는 뜻 하나뿐이라 닫는 방법에 따라 결과가 갈리면 안 된다 — 중복 로그인 안내를 X 로 닫으면
     * 로그인 화면으로 가지 못한 채, 저장이 막힌 학습방에 그대로 머무르던 문제가 그것이다.
     * 확인/취소가 갈리는 물음은 notify 가 아니라 아래 confirmAsk 를 쓴다(거기서는 X = 취소가 맞다).
     */
    function notify(text, onClose) {
        exitFullscreen();
        var closed = false;
        // 확인 콜백과 닫힘 관찰이 함께 걸리므로 후속 동작은 먼저 온 쪽 한 번만 돌린다.
        function runOnce() {
            if (closed) {
                return;
            }
            closed = true;
            if (typeof onClose === 'function') {
                onClose();
            }
        }
        if (typeof window.sstModal === 'function') {
            window.sstModal({ icon: 'warning', title: '확인', text: text, onConfirm: runOnce });
            watchModalClose(runOnce);
            return;
        }
        window.alert(text);
        runOnce();
    }

    /** 안내 모달의 닫힘을 보고 있는 관찰자. 모달은 한 번에 하나라 항상 최신 것 하나만 유지한다. */
    var modalCloseObserver = null;

    /**
     * 모달이 닫히는 모든 경로를 'open' 클래스가 떨어지는 것으로 한 번에 잡는다 —
     * [확인] · X · 바깥 클릭 · ESC 가 모두 sstModalClose() 를 거쳐 그 클래스를 떼기 때문이다.
     * 퍼블 자산(common.js)에 콜백을 새로 뚫지 않고 이 화면에서만 닫힘을 알아내는 방법이다.
     * 관찰할 수단이 없으면(모달 영역 없음 · MutationObserver 미지원) 종전대로 [확인] 콜백만 남는다.
     */
    function watchModalClose(onClose) {
        if (modalCloseObserver) {
            // 이전 안내가 남긴 관찰은 버린다 — 모달 영역은 하나뿐이라 지난 안내의 후속 동작까지 함께 돌면 안 된다.
            modalCloseObserver.disconnect();
            modalCloseObserver = null;
        }
        var modalArea = document.getElementById('modalArea');
        if (!modalArea || typeof window.MutationObserver !== 'function') {
            return;
        }
        var observer = new MutationObserver(function () {
            if (modalArea.classList.contains('open')) {
                return;
            }
            observer.disconnect();
            modalCloseObserver = null;
            onClose();
        });
        modalCloseObserver = observer;
        observer.observe(modalArea, { attributes: true, attributeFilter: ['class'] });
    }

    /**
     * 확인/취소가 갈리는 물음(복습 여부 등). 취소하면 아무 일도 하지 않는다.
     * X · 바깥 클릭 · ESC 로 닫는 것도 취소와 같다(그래서 여기서는 닫힘을 따로 보지 않는다).
     */
    function confirmAsk(text, onConfirm) {
        exitFullscreen();
        if (typeof window.sstModal === 'function') {
            window.sstModal({ icon: 'quest', title: '확인', text: text, showCancel: true, onConfirm: onConfirm });
            return;
        }
        if (window.confirm(text)) {
            onConfirm();
        }
    }

    /** 성공/완료만 토스트로 알린다. */
    function toast(text) {
        if (typeof window.sstToast === 'function') {
            window.sstToast({ icon: 'comple', text: text });
        }
    }

    // ──────────────────────────── 전체화면 ────────────────────────────

    /**
     * 전체화면으로 띄우는 대상 — <b>플레이어가 아니라 영상 영역(.videoArea)이다.</b>
     *
     * <b>player.requestFullscreen()(video.js API)을 쓰면 안 된다.</b> 그건 video.js 가 만든
     * `<div class="video-js">` 만 띄우는데, 우리 컨트롤바(.videoControlBar)는 그 div 의 형제라
     * <b>전체화면 화면에 렌더되지 않는다</b> — controls:false 로 video.js 기본 컨트롤도 없으니
     * 재생·정지·싱크바·배속·학습종료를 전혀 쓸 수 없고, 모바일은 ESC 키도 없어 나올 방법이 없다
     * (실측으로 확인했다 — 전체화면 요소가 #study_player 로 잡히고 일시정지 버튼 자리에 &lt;video&gt; 가 왔다).
     *
     * 퍼블 시안도 같은 결론을 CSS 에 적어 두었다 — `.videoArea:fullscreen { aspect-ratio: auto; height: 100% }`
     * (_video.scss). 영역째 띄우면 컨트롤바·덮개가 함께 들어가고 비율도 화면에 맞춰 풀린다.
     */
    var videoArea = document.querySelector('#videoWrap .videoArea');

    /** 접두어 있는 구현(구형 Safari)까지 본다. 없으면 null. */
    function currentFullscreenElement() {
        return document.fullscreenElement || document.webkitFullscreenElement || null;
    }

    function exitFullscreen() {
        if (!currentFullscreenElement()) {
            return;
        }
        try {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                return;
            }
            if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        } catch (e) {
            // 전체화면 해제는 브라우저·기기에 따라 실패할 수 있다(iOS). 안내 자체를 막지 않는다.
        }
    }

    /**
     * 전체화면 진입. iOS Safari 는 <b>Element.requestFullscreen 을 지원하지 않는다</b>(iPhone) —
     * 그때는 &lt;video&gt; 의 네이티브 전체화면으로 떨어뜨린다. 브라우저 기본 컨트롤이 나와 우리 컨트롤바를
     * 쓰지 못하지만, 그 컨트롤로 조작은 되므로 전체화면이 아예 안 되는 것보다 낫다
     * (재생 위치는 그래도 timeupdate 로 세므로 학습시간 저장은 이어진다).
     */
    function requestFullscreen() {
        if (videoArea.requestFullscreen) {
            // 거부(제스처 없음·정책)는 조용히 넘긴다 — 학습을 막을 이유가 없다.
            var entering = videoArea.requestFullscreen();
            if (entering && typeof entering.catch === 'function') {
                entering.catch(function () { });
            }
            return;
        }
        if (videoArea.webkitRequestFullscreen) {
            videoArea.webkitRequestFullscreen();
            return;
        }
        var techVideo = player.el().querySelector('video');
        if (techVideo && techVideo.webkitEnterFullscreen) {
            techVideo.webkitEnterFullscreen();
            return;
        }
        notify('이 브라우저에서는 전체화면을 사용할 수 없습니다.');
    }

    // ──────────────────────────── 통신 ────────────────────────────

    /** CSRF 토큰. 사용자 사이트는 XSRF-TOKEN 쿠키로 내려오고 헤더로 되돌려 보낸다(enableCookieCsrf). */
    function csrfToken() {
        var match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    /**
     * JSON POST. keepalive 는 페이지가 사라지는 중에도 전송을 이어 가게 한다(이탈 직전 저장).
     * sendBeacon 을 쓰지 않는 이유는 커스텀 헤더를 실을 수 없어 CSRF 토큰을 헤더로 보낼 수 없기 때문이다.
     */
    function postJson(url, body, keepalive) {
        var headers = { 'Content-Type': 'application/json' };
        var token = csrfToken();
        if (token) {
            headers['X-XSRF-TOKEN'] = token;
        }
        return fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
            credentials: 'same-origin',
            keepalive: !!keepalive
        }).then(function (response) {
            return response.json().then(function (payload) {
                return { ok: response.ok, status: response.status, payload: payload };
            }).catch(function () {
                /*
                 * JSON 이 아닌 응답이다 — 세션이 만료되거나 다른 기기 로그인에 밀리면 사용자 체인의
                 * 인증 진입점이 로그인 화면으로 리다이렉트해 HTML 이 온다(ApiResponse 가 아니다).
                 * 여기서 예외를 흘리면 호출한 쪽의 catch 로 빠져 <b>무음 실패</b>가 된다 —
                 * 학습자는 저장되는 줄 알고 계속 보고, 새로고침해야 비로소 튕긴다(실제 보고된 증상이다).
                 * payload 를 null 로 둔 실패로 바꿔 화면이 즉시 알리게 한다.
                 */
                return { ok: false, status: response.status, payload: null };
            });
        });
    }

    /** ApiResponse 의 메시지를 꺼낸다. 형태가 다르면 기본 문구로 떨어뜨린다. */
    function messageOf(result, fallback) {
        if (result && result.payload && result.payload.message) {
            return result.payload.message;
        }
        return fallback;
    }

    /** 입장 API 요청 본문 — 첫 입장(enter)과 거부 복구의 재진입(reenter)이 같은 값을 보낸다. 한 곳에서 만든다. */
    function enterRequestBody() {
        return {
            userCourseId: Number(setting.userCourseId),
            courseLessonId: Number(setting.courseLessonId)
        };
    }

    // ──────────────────────────── 입장(재생 시작) ────────────────────────────

    /**
     * [학습 시작] — 입장 API 로 재생 URL · 이어보기 지점을 받아 재생을 연다.
     *
     * 화면이 열릴 때 부르지 않는 이유는 접속 행이 '실제로 재생을 시작한 접속' 만 남게 하려는 것이고,
     * 자동 재생을 걸지 않는 이유는 브라우저 자동재생 정책상 음소거 없이는 막히는 데다
     * 이어보기 안내를 띄울 자리가 사라지기 때문이다.
     */
    function enter() {
        if (study.entered) {
            /*
             * 이미 입장한 뒤 덮개가 다시 보이는 경우는 하나다 — 재생이 자동재생 정책에 막혀 play() 의 catch 가 덮개를
             * 되살린 것이다("재생이 차단되었습니다. [학습 시작]을 다시 눌러 주세요"). 그 안내대로 누른 것이므로 입장을
             * 다시 하지 않고 <b>재생만 다시 건다</b>. 종전에는 여기서 그냥 돌아가 버튼이 무반응이었다 — 이어보기 · 거부 복구
             * 안내를 닫은 뒤의 재생이 막히면 학습자가 새로고침 말고는 벗어날 길이 없었다.
             */
            el.cover.hidden = true;
            el.coverNote.textContent = coverDefaultNote;
            play();
            return;
        }
        el.startButton.disabled = true;
        // 입장 응답도 느릴 수 있다 — 누른 뒤 아무 표시가 없으면 눌린 건지 알 수 없다.
        el.coverNote.textContent = '학습을 시작하는 중입니다…';
        postJson(setting.enterUrl, enterRequestBody(), false).then(function (result) {
            if (!result.ok) {
                el.startButton.disabled = false;
                el.coverNote.textContent = coverDefaultNote;
                notify(messageOf(result, '학습을 시작할 수 없습니다.'));
                return;
            }
            openPlayer(result.payload.data);
        }).catch(function () {
            el.startButton.disabled = false;
            el.coverNote.textContent = coverDefaultNote;
            notify('학습 시작에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        });
    }

    /**
     * 입장 응답을 학습 상태에 싣는다 — 첫 입장(openPlayer)과 거부 복구의 재진입(reenter)이 <b>같은 값을 같은 자리에</b>
     * 넣어야 한다. 한쪽만 고치면 재진입 뒤 구간 시작 · 허용 위치가 옛 접속 것으로 남아 다음 저장이 또 거부된다.
     */
    function applyEnterResponse(enterResponse) {
        study.detailId = enterResponse.userCourseLessonDetailId;
        study.sessionKey = enterResponse.studySessionKey;
        study.lastSavedPosition = enterResponse.resumeStartSecond;
        // 서버가 보는 구간의 시작이자, 아직 보내지 못한 구간이 쌓이는 기준점이다(saveProgress 참고).
        study.sentPosition = Math.floor(enterResponse.resumeStartSecond);
        // 첫 저장의 벽시계 기준은 입장 시각이다 — 서버도 첫 저장은 접속 시작(start_dt)부터 잰다.
        study.lastSentAt = nowMillis();
        study.maxPlaybackRateSinceSend = player.playbackRate() || 1;
        study.maxPlayablePosition = enterResponse.maxPlayablePositionSecond;
        study.playSecond = enterResponse.playSecond;
        study.studySecond = enterResponse.studySecond;
        study.review = enterResponse.review;
        study.ended = false;
        study.lessonFull = false;
    }

    /** 입장 응답으로 플레이어를 연다. 이어보기 지점이 있으면 안내한 뒤 그 지점부터 재생한다. */
    function openPlayer(enterResponse) {
        applyEnterResponse(enterResponse);
        study.entered = true;

        applySeekControl(enterResponse.review);
        applySpeedControl(enterResponse.review);

        // 로딩 중임을 알린다 — 누르고 아무 표시가 없으면 멈춘 건지 받는 중인지 학습자가 알 수 없다.
        el.coverNote.textContent = '영상을 불러오는 중입니다…';

        /*
         * 이벤트 핸들러를 <b>player.src() 보다 먼저</b> 건다. src() 는 미들웨어를 거쳐 소스를 세팅하므로
         * 그 과정에서 error·loadedmetadata 가 먼저 떠 버리면, 뒤에 건 핸들러는 그 이벤트를 놓친다
         * (`one` 이라 되짚을 기회도 없다). 순서만 바꿔 두면 어느 쪽이 먼저 떠도 받는다.
         */

        // 영상을 못 읽으면(주소 만료·네트워크·포맷) error 가 뜬다.
        player.one('error', function () {
            var mediaError = player.error();
            failToOpenPlayer('영상을 재생할 수 없습니다. 잠시 후 다시 시도해 주세요.',
                    '영상을 불러오지 못했습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.',
                    // 원인 추적용 — 재생 실패는 화면 문구만으로 구분이 안 된다(404·CORS·코덱·HLS 미지원).
                    '영상 재생 실패 ' + (mediaError ? mediaError.code + ' ' + mediaError.message : '(사유 없음)'));
        });

        // 이어보기 지점은 메타데이터가 준비된 뒤에 세팅해야 먹는다(길이를 모르는 동안 seek 이 무시된다).
        player.one('loadedmetadata', function () {
            clearLoadTimer();
            if (study.lastSavedPosition > 0) {
                player.currentTime(study.lastSavedPosition);
            }
            el.cover.hidden = true;
            el.coverNote.textContent = coverDefaultNote;
            if (enterResponse.review) {
                notify('이미 학습을 완료한 차시입니다. 복습으로 재생되며 학습시간은 추가로 인정되지 않습니다.', play);
                return;
            }
            if (study.lastSavedPosition > 0) {
                notify(formatTime(study.lastSavedPosition) + ' 지점부터 이어서 재생합니다.', play);
                return;
            }
            play();
        });

        /*
         * <b>로딩 제한 시간 — 이게 없으면 화면이 영원히 멈춘다.</b>
         *
         * CDN 이 응답을 시작만 하고 바디를 주지 않거나 첫 요청이 늘어지면 <b>error 도 loadedmetadata 도
         * 오지 않는다.</b> 그러면 덮개는 그대로고 [학습 시작]은 비활성인 채라 다시 시도할 수도 없고,
         * 콘솔에도 흔적이 없어 원인을 좁힐 수 없다(실측으로 확인했다 — 8초를 기다려도 그 상태였다).
         * 학습자 눈에는 "처음 눌렀을 때만 영상이 안 나온다"(새로고침하면 캐시·재시도로 되니까)로 보인다.
         */
        loadTimer = window.setTimeout(function () {
            failToOpenPlayer('영상을 불러오지 못했습니다. [학습 시작]을 다시 눌러 주세요.',
                    '영상을 불러오는 데 너무 오래 걸립니다. 네트워크 상태를 확인하고 다시 시도해 주세요.',
                    '영상 로딩 시간 초과(' + LOAD_TIMEOUT_MILLISECOND + 'ms) — 응답이 오지 않았다');
        }, LOAD_TIMEOUT_MILLISECOND);

        /*
         * src 는 <b>ready 안에서</b> 세팅한다. video.js 는 tech 준비가 비동기라, 아주 느린 기기에서는
         * 초기화 직후의 src() 가 준비 전에 떨어질 수 있다. ready 는 이미 준비됐으면 바로 부르므로 손해가 없다.
         *
         * src() 하나로 끝낸다 — <b>뒤에 player.load() 를 부르지 않는다</b>. src() 가 이미 로드를 시작하는데,
         * load() 는 &lt;video&gt; 엘리먼트의 load() 를 그대로 호출해 <b>방금 세팅한 소스를 되감는다</b>.
         * HLS 는 특히 위험하다: video.js 가 .m3u8 을 골라 http-streaming 에 넘기는 처리가 비동기라,
         * 그 사이에 load() 가 끼면 엘리먼트가 빈 상태로 리셋돼 loadedmetadata 가 영영 오지 않는다.
         */
        player.ready(function () {
            player.src({ src: enterResponse.playUrl, type: sourceTypeOf(enterResponse.playUrl) });
        });
    }

    /**
     * 재생을 열지 못했다 — 덮개를 되살려 <b>다시 시도할 수 있게</b> 하고 사유를 알린다.
     *
     * error 이벤트와 로딩 시간 초과가 같은 경로를 쓴다(복구 절차가 두 벌로 갈리면 한쪽만 고쳐진다).
     * 남은 핸들러를 떼고 소스를 비우는 이유는, 시간 초과로 물러난 뒤 응답이 <b>뒤늦게</b> 도착하면
     * 학습자가 이미 다시 시도한 화면 위로 옛 재생이 끼어들기 때문이다.
     */
    function failToOpenPlayer(coverText, modalText, consoleDetail) {
        clearLoadTimer();
        player.off('loadedmetadata');
        player.off('error');
        try {
            player.reset();
        } catch (e) {
            // reset 이 없거나 실패해도 아래 복구는 그대로 진행한다.
        }
        study.entered = false;
        el.cover.hidden = false;
        el.startButton.disabled = false;
        el.coverNote.textContent = coverText;
        if (window.console && window.console.error) {
            window.console.error('[study-room] ' + consoleDetail);
        }
        notify(modalText);
    }

    /** 확장자로 소스 타입을 정한다. HLS(.m3u8)는 명시해야 video.js 가 http-streaming 으로 재생한다. */
    function sourceTypeOf(url) {
        return /\.m3u8(\?|$)/i.test(url) ? 'application/x-mpegURL' : 'video/mp4';
    }

    // ──────────────────────────── 재생 통제 ────────────────────────────

    /**
     * 게이지를 눌러·끌어 비율을 얻는다. 퍼블 sample/js/video.js 에 같은 처리가 있으나 학습방은 그 파일을
     * 읽지 않으므로(그 파일은 퍼블 소유라 고치지 않는다) 여기에 다시 붙인다.
     *
     * 콜백은 (비율, 단계)로 불린다 — 'start' 는 누른 순간, 'move' 는 끄는 중, 'end' 는 손을 뗀 순간이다.
     * 단계를 나누는 이유는 학습시간 저장이 이동 <b>직전</b>에 한 번만 나가야 하기 때문이다(applySeekControl).
     *
     * @param {HTMLElement} gaugeArea  누를 수 있는 영역(막대를 감싼 쪽 — 얇은 막대는 정확히 누르기 어렵다)
     * @param {function} applyRatio    (ratio 0~1, phase) 를 받는다
     */
    function dragGauge(gaugeArea, applyRatio) {
        var lastRatio = 0;
        function ratioOf(event) {
            var bounds = gaugeArea.getBoundingClientRect();
            if (!bounds.width) {
                return 0;
            }
            var ratio = (event.clientX - bounds.left) / bounds.width;
            return Math.min(Math.max(ratio, 0), 1);
        }
        gaugeArea.addEventListener('pointerdown', function (event) {
            gaugeArea.setPointerCapture(event.pointerId);
            lastRatio = ratioOf(event);
            applyRatio(lastRatio, 'start');
        });
        gaugeArea.addEventListener('pointermove', function (event) {
            if (!gaugeArea.hasPointerCapture(event.pointerId)) {
                return;
            }
            lastRatio = ratioOf(event);
            applyRatio(lastRatio, 'move');
        });
        /*
         * pointercancel 도 끝으로 받는다. 터치에서 스크롤·제스처가 끼어들면 pointerup 없이 취소되는데,
         * 그때 'end' 를 흘리면 다음 인터벌의 기준(study.lastSavedPosition)이 옮긴 지점으로 맞춰지지 않아
         * 앞으로 뛴 직후 거대한 구간이 발사된다(서버가 잘라 CAPPED 로 쌓인다).
         */
        function endDrag(event) {
            if (gaugeArea.hasPointerCapture(event.pointerId)) {
                gaugeArea.releasePointerCapture(event.pointerId);
            }
            applyRatio(lastRatio, 'end');
        }
        gaugeArea.addEventListener('pointerup', endDrag);
        gaugeArea.addEventListener('pointercancel', endDrag);
    }

    /**
     * 구간 건너뛰기(싱크바 이동) — 차수 정책이 정한다.
     *
     * <b>허용과 금지를 모두 구현해야 한다.</b> 금지만 구현하면 허용 차수에서도 이동이 되지 않는다 —
     * 퍼블 시안의 싱크바는 진행률만 그리는 &lt;div&gt; 라 스크립트가 붙지 않으면 누를 수 없고(그 처리는
     * 퍼블 sample/js/video.js 에만 있다), 그래서 "설정을 허용으로 뒀는데 이동이 안 된다" 가 된다.
     *
     * <b>완료한 차시는 정책과 무관하게 열린다(복습).</b> 서버 판정과 같은 규칙이다 —
     * UserCourseLessonDetailLog.record 는 `!skipAllowed && !완료` 일 때만 앞선 구간을 거부한다.
     * 여기서 잠그면 복습인데 이동이 막혀 서버와 어긋난다.
     *
     * <b>금지면 뒤로 되돌리기까지 막는다(운영 방침).</b> 앞으로만 막으면 이미 본 구간을 반복 재생해
     * "듣고 있는 것처럼" 보이게 할 수 있고, 학습 흐름도 정책이 정한 한 방향이어야 한다. 그래서 금지 모드는
     * 드래그 처리를 아예 붙이지 않고 영역째 잠근다(pointer-events) — 방향키 seek 도 이미 막혀 있다
     * (video.js userActions.hotkeys = false). seeking 되돌림은 그래도 새는 경로(브라우저·OS 미디어 조작)의
     * 안전망이며, 실제 방어는 서버가 그 구간의 인정값을 0 으로 깎는 것이다(REJECTED).
     *
     * <b>허용 모드의 알려진 한계(서버 쪽 · 미구현).</b> 서버의 겹침 제거가 접속당 기준값 하나라 앞으로 뛴 뒤 돌아와
     * 본 구간은 그 접속에서 0초다. 여기서 하는 'start' 저장 · 'end' 의 sentPosition 이동은 뛰어넘은 구간을 주장하지
     * 않게 하는 것까지다. 상세와 보강 방향은 UserCourseLessonDetailLog 클래스 주석 '알려진 한계' 한 곳에만 둔다.
     *
     * @param {boolean} review 완료한 차시로 들어왔는가(입장 응답의 review)
     */
    function applySeekControl(review) {
        if (!setting.skipAllowed && !review) {
            el.seek.classList.add('is-locked');
            el.seek.style.pointerEvents = 'none';
            player.on('seeking', function () {
                var current = player.currentTime();
                if (current > study.maxPlayablePosition) {
                    player.currentTime(study.maxPlayablePosition);
                }
            });
            return;
        }
        if (!el.seekGauge) {
            return;
        }
        dragGauge(el.seekGauge, function (ratio, phase) {
            var duration = player.duration();
            if (!study.entered || study.stopped || !duration || isNaN(duration)) {
                return;
            }
            if (phase === 'start') {
                /*
                 * 이동 직전 구간을 먼저 보낸다. 보내지 않으면 다음 인터벌 저장이 "이동 전 위치 → 이동 후
                 * 위치" 한 구간으로 읽혀, 실제로 보지 않은 구간을 주장하게 된다(서버가 잘라 CAPPED 로
                 * 남으므로 인정되지는 않지만, 본 만큼의 구간도 함께 유실된다).
                 */
                saveProgress(false);
            }
            if (phase !== 'end') {
                player.currentTime(duration * ratio);
                updatePlayedGauge();
                return;
            }
            /*
             * 손을 뗀 지점을 다음 인터벌의 기준으로 삼는다. 옮기지 않으면 앞으로 뛴 경우 즉시 거대한
             * 구간이 발사되고(현재위치 - 옛 기준 >= 30), 뒤로 뛴 경우 그 차이만큼 저장이 멈춘다.
             *
             * <b>서버로 보낼 구간의 시작(sentPosition)도 함께 옮긴다.</b> 이동 직전 구간은 위 'start' 에서
             * 이미 보냈으므로, 옮기지 않으면 다음 저장이 "이동 전 위치 → 이동 후 위치 + 주기" 한 구간으로
             * 나가 <b>뛰어넘은 구간까지 주장</b>하게 된다(서버가 잘라 CAPPED 로 남기지만, 그 바람에 본 만큼의
             * 구간도 함께 잘린다 — 위 'start' 저장이 막으려던 것이 바로 그것이다).
             */
            study.lastSavedPosition = player.currentTime();
            study.sentPosition = Math.floor(player.currentTime());
            /*
             * 영상이 끝난 뒤의 이동이면 '끝남' 상태도 함께 푼다. 두지 않으면 끝 구간 재시도 · 정지 · 이탈 저장이
             * 옮긴 지점(300)에서 영상 끝(900)까지를 한 구간으로 주장하고(saveProgress 가 ended 면 끝 위치까지 늘린다),
             * 서버가 거의 0 으로 깎아 '요청 600초 중 0초 인정' 이 몰아보내기 신호처럼 남는다. 그 뒤 재생해도
             * sentPosition 이 900 에 가 있어 다음 저장이 역순(REJECTED)이 된다.
             */
            study.ended = false;
        });
    }

    /**
     * 배속 — 선택지가 하나뿐이면 버튼을 감춘다(정책 X10 = 배속 금지). 여러 개면 눌러 순환시킨다.
     * 조작으로 목록 밖 배속이 걸리면 되돌린다.
     *
     * <b>건너뛰기 금지 + 미완료 차시는 정책이 배속을 허용해도 열지 않는다.</b> 금지 차수의 허용 위치는 인정시간(실시간 상한)
     * + 40초라, 배속으로 재생위치가 그보다 앞서면 유실이 없어도 저장이 거부된다 — 1.5x 는 80초, 2x 는 40초 만에 걸린다.
     * 열어 두면 거부 → 재진입 → 다시 배속 → 거부가 끝없이 되풀이된다(구동 검증 E3). 완료한 차시(복습)는 서버가 건너뛰기
     * 판정을 하지 않으므로 정책대로 연다. 운영 기본(X10)에서는 차이가 없고, 정책 화면에서 이 조합을 막는 것이 근본 수정이다.
     *
     * @param {boolean} review 완료한 차시로 들어왔는가(입장 응답의 review)
     */
    function applySpeedControl(review) {
        var speedLocked = !setting.skipAllowed && !review;
        if (setting.playRates.length <= 1 || speedLocked) {
            player.playbackRate(1);
            player.on('ratechange', function () {
                if (player.playbackRate() !== 1) {
                    player.playbackRate(1);
                }
            });
            return;
        }
        el.speedArea.hidden = false;
        el.speed.textContent = player.playbackRate().toFixed(1) + 'x';
        el.speed.addEventListener('click', function () {
            var index = setting.playRates.indexOf(player.playbackRate());
            var next = setting.playRates[(index + 1) % setting.playRates.length];
            player.playbackRate(next);
        });
        player.on('ratechange', function () {
            if (setting.playRates.indexOf(player.playbackRate()) === -1) {
                player.playbackRate(1);
                return;
            }
            el.speed.textContent = player.playbackRate().toFixed(1) + 'x';
        });
    }

    function play() {
        var playing = player.play();
        if (playing && typeof playing.catch === 'function') {
            // 자동재생 정책 등으로 막히면 덮개를 되살려 학습자가 직접 누르게 한다.
            playing.catch(function () {
                el.cover.hidden = false;
                el.startButton.disabled = false;
                el.coverNote.textContent = '재생이 차단되었습니다. [학습 시작]을 다시 눌러 주세요.';
            });
        }
    }

    // ──────────────────────────── 학습시간 저장 ────────────────────────────

    /**
     * 저장 주기 판정 — timeupdate 에서 마지막 저장 이후 흐른 재생위치가 주기를 넘었을 때만 보낸다.
     * 재생 중에만 발생하는 이벤트라 일시정지·백그라운드에서 빈 요청이 나가지 않는다.
     */
    player.on('timeupdate', function () {
        updatePlayedGauge();
        if (!study.entered || study.stopped) {
            return;
        }
        if (player.currentTime() - study.lastSavedPosition
                >= setting.saveIntervalSecond + SAVE_INTERVAL_MARGIN_SECOND) {
            saveProgress(false);
        }
    });

    /**
     * 정지 시 남은 구간 저장 — 인터벌만 두면 마지막 저장 이후 구간(최대 주기-1초)이 늘 미저장으로 남는다.
     * <b>모바일</b>은 탭 전환·화면 꺼짐도 아래 visibilitychange 가 player.pause() 를 불러 이 경로로 들어온다
     * (웹은 백그라운드에서도 재생이 이어지므로 그쪽에서 잔여 구간만 따로 보낸다 — 아래 backgroundPlayAllowed).
     */
    player.on('pause', function () {
        togglePlayButton(false);
        if (study.entered && !study.stopped) {
            saveProgress(true);
        }
    });

    player.on('play', function () {
        togglePlayButton(true);
        // 끝난 뒤 다시 재생하면(처음부터 복습) 끝 구간 재시도는 끝낸다 — 그 뒤 저장은 보통 규칙으로 돈다.
        study.ended = false;
    });

    player.on('ended', function () {
        if (!study.entered || study.stopped) {
            return;
        }
        /*
         * 끝 구간은 <b>인정될 때까지</b> 되풀이해 보낸다. 재생이 끝나 timeupdate 가 더 오지 않으므로 예약하지
         * 않으면 남은 몫이 그대로 유실되고, 차시 이수가 '몇 초 모자라' 갈리는 자리다.
         *
         * 한 번의 재시도로는 부족했다 — 마지막 구간이 벽시계보다 1초 길면(직전 저장 위치의 소수부) 서버가 1초를
         * 깎는데, 예전에는 보낸 끝 위치를 이미 지나가 재시도가 보낼 것이 없었다('요청 32초 중 31초 인정' 이 그대로
         * 남아 99.89% 로 끝났다). 이제 sentPosition 이 인정된 지점에 머무르므로 1.2초 뒤 재시도가 그 1초를 주장하고,
         * 서버는 흐른 시간(반올림 1초)만큼 인정한다. 이월분이 여러 초면 회차마다 1초씩 따라잡는다.
         */
        study.ended = true;
        saveProgress(true);
        scheduleEndSave(END_SAVE_RETRY_MAX, END_SAVE_WAIT_MAX);
    });

    /**
     * 영상 끝 잔여 구간 재시도 — 남은 구간이 없거나(sentPosition 이 끝에 닿음), 서버 누적이 분모를 다 채웠거나,
     * 상한 횟수를 다 쓰면 <b>끝 구간 처리를 마치고</b>(recoverShortfallAtEnd — 그래도 미완료면 부족 구간부터 다시 잇는다),
     * 다시 재생을 시작했거나(ended 해제) 응답 대기가 소진되면 그냥 멈춘다.
     *
     * <b>저장 응답을 기다리는 회차는 재시도 횟수를 쓰지 않는다.</b> 느린 회선(왕복 2~3초)에서 대기 회차마다 횟수를
     * 깎으면 5회가 대기로 소진돼 정작 보낼 차례가 오지 않는다 — 대기는 별도 상한(waitLeft)으로 묶는다.
     * 응답을 기다리는 동안은 "끝났다" 판정도 미룬다 — 마지막 저장의 응답에 완료 여부가 실려 오기 때문이다.
     * 길이를 모르는 영상(라이브 등)은 끝 위치가 0 이라 현재 위치를 끝으로 본다 — 그래야 예전처럼 한 번은 보낸다
     * (0 과 비교하면 첫 회차에 바로 멈춰 이월된 1초가 빠진다).
     *
     * @param {number} retryLeft 남은 전송 횟수
     * @param {number} waitLeft  남은 대기 회차
     */
    function scheduleEndSave(retryLeft, waitLeft) {
        window.setTimeout(function () {
            if (!study.entered || study.stopped || !study.ended) {
                return;
            }
            if (study.saving) {
                if (waitLeft > 0) {
                    scheduleEndSave(retryLeft, waitLeft - 1);
                }
                return;
            }
            var endPosition = endOfVideoPosition() || Math.floor(player.currentTime());
            if (study.lessonFull || retryLeft <= 0 || study.sentPosition >= endPosition) {
                recoverShortfallAtEnd();
                return;
            }
            saveProgress(true);
            scheduleEndSave(retryLeft - 1, waitLeft);
        }, END_SAVE_RETRY_MILLISECOND);
    }

    /**
     * 영상 끝 구간 처리가 끝났는데도 차시가 미완료다 — <b>부족한 구간부터 다시 잇는다.</b>
     *
     * 저장이 서버에 닿지 못한 구간(재시도까지 실패)의 학습시간은 그만큼 비어 있고, 이수 기준이 그 빈 만큼보다
     * 엄격하면 끝까지 봐도 완료가 되지 않는다. 종전에는 이 상태에 아무 안내가 없어 학습자는 "다 봤는데 다음 차시가
     * 잠겼다" 로만 알게 됐고, 다시 들어와야 이어보기(인정시간 지점)에서 부족분을 채울 수 있었다. 그 재진입을 여기서
     * 바로 한다 — 새 접속이 인정시간 지점에서 열리므로 되감은 구간이 그 접속의 겹침 제거에 걸리지 않는다.
     *
     * <b>건너뛰기 허용 차수는 대상이 아니다.</b> 허용 모드의 이어보기는 마지막 재생위치(= 영상 끝)라 되감을 곳이 없고,
     * 그 모드의 인정 모델 한계는 서버 쪽 '알려진 한계' 로 따로 적혀 있다(UserCourseLessonDetailLog 클래스 주석).
     *
     * <b>"다시 볼 구간이 있는가" 와 "서버는 이미 완료로 보는가" 는 이 창의 값이 아니라 입장 응답으로 판정한다</b>
     * (applyReentered). 이 창은 완료 저장의 응답이 유실되면 완료를 모른다 — 재시도가 중복 저장이 되어 완료 신호 없이
     * 끝나므로, 이 창의 값만 보면 완료된 차시를 "완료되지 않았다" 고 안내하게 된다.
     */
    function recoverShortfallAtEnd() {
        if (!study.entered || study.stopped || study.reentering || !study.ended) {
            return;
        }
        if (study.review || study.lessonCompleted || setting.skipAllowed) {
            return;
        }
        reenter({
            atEnd: true,
            noticeOf: function (resumeSecond) {
                return '학습시간이 이수 기준에 미치지 못해 ' + formatTime(resumeSecond) + ' 지점부터 다시 재생합니다.';
            }
        });
    }

    /**
     * 영상 끝에서 주장할 끝 재생위치(초) — 영상 길이를 <b>반올림</b>한 값이다.
     *
     * 끝까지 본 학습자의 재생위치는 duration(예: 899.87초)인데 내림하면 899 라 분모(운영자가 넣은 900초)에
     * 1초 모자란 채로 끝난다. 반올림 차이(0.5초 미만)는 서버가 실제로 흐른 시간으로 어차피 검증하고
     * (그 사이 재시도 대기가 있다), 분모를 넘는 값은 서버가 분모로 자른다. 길이를 모르면(라이브 등) 0 이라
     * 현재 위치가 그대로 쓰인다.
     *
     * 실제 영상이 분모보다 0.5초 넘게 짧으면(899.4초 vs 900) 끝까지 봐도 899 에서 멈춘다 — 없는 구간을 주장하지
     * 않는다(알려진 한계). 그 차시는 분모(play_second)를 실제 길이로 고치는 것이 맞다.
     */
    function endOfVideoPosition() {
        var duration = player.duration();
        if (!isFinite(duration) || duration <= 0) {
            return 0;
        }
        return Math.round(duration);
    }

    /**
     * 지금 보낼 수 있는 구간의 최대 길이(초) — 마지막 전송 이후 벽시계로 흐른 시간을 서버와 같은 규칙(반올림)으로
     * 읽되 지터 여유만큼 보수적으로 잡는다. 서버의 ②-a(직전 저장 이후 경과) 상한을 미리 적용하는 것이다.
     * 되돌아가는 일을 줄이려는 것이지 방어가 아니다 — 서버가 어차피 자기 시계로 다시 잰다.
     *
     * <b>배속을 곱한다.</b> 자르는 목적은 '내림 위치의 1초 차이' 만 걷어내는 것이지 배속 학습을 실시간으로 깎는 것이
     * 아니다 — 그건 서버의 몫이다. 곱하지 않으면 2배속에서 61초 구간이 31초로 잘려 보낸 위치가 재생위치보다 30초
     * 뒤처지고, 그 뒤처짐은 회복되지 않아(다음 구간도 같은 폭으로 잘린다) 이어보기가 실제보다 뒤에서 열린다.
     * 한 구간 안에서 배속을 바꿨을 수 있으므로 최댓값을 곱한다 — 크게 잡는 쪽이 안전하다(서버가 다시 자르고,
     * 크게 깎인 요청은 기준값을 요청 끝으로 옮긴다).
     */
    function claimableSecondSinceLastSend() {
        if (!study.lastSentAt) {
            return Infinity;
        }
        var elapsedSecond = (nowMillis() - study.lastSentAt) / 1000 * study.maxPlaybackRateSinceSend
                - SAVE_CLOCK_JITTER_SECOND;
        if (elapsedSecond < 0) {
            // 시계가 뒤로 갔다(단조 시계가 없는 환경). 모르는 값으로 자르지 않는다 — 서버가 어차피 자기 시계로 잰다.
            return Infinity;
        }
        return Math.round(elapsedSecond);
    }

    /*
     * 벽시계 자르기에 곱할 배속 — 마지막 전송 이후의 최댓값을 든다(claimableSecondSinceLastSend 참고).
     * 전송할 때 그 시점의 배속으로 다시 시작한다(saveProgress).
     */
    player.on('ratechange', function () {
        study.maxPlaybackRateSinceSend = Math.max(study.maxPlaybackRateSinceSend, player.playbackRate() || 1);
    });

    /**
     * 학습시간 한 구간을 보낸다.
     *
     * 보내는 값은 재생위치 두 개뿐이다 — 인정 학습시간은 서버가 정한다. 응답의 값으로 화면을 갱신하며,
     * 화면이 자기가 센 값을 쓰지 않는다(서버가 인정한 값과 갈리지 않게).
     *
     * @param {boolean} keepalive 페이지가 사라지는 중일 수 있는 저장(정지·이탈)이면 true
     */
    function saveProgress(keepalive) {
        var playedPosition = player.currentTime();
        var startPosition = study.sentPosition;
        var endPosition = Math.floor(playedPosition);
        if (study.ended) {
            // 영상 끝에서는 길이를 반올림한 위치까지 주장한다(endOfVideoPosition 참고).
            endPosition = Math.max(endPosition, endOfVideoPosition());
        }
        /*
         * 구간이 마지막 전송 이후 실제로 흐른 시간보다 <b>조금</b> 길면 그만큼만 보낸다. 내림한 정수 위치로 구간을
         * 만들면 직전 위치의 소수부가 크고 이번 위치의 소수부가 작을 때 구간이 실제보다 1초 길어지는데(인터벌 저장은
         * timeupdate 가 늦을 때, 정지 · 영상 끝 저장은 더 흔하게), 그대로 보내면 서버가 1초를 깎는다. 여기서 잘라
         * 두면 남은 1초는 sentPosition 앞에 남아 다음 저장이 이어 주장한다 — 벽시계가 따라잡은 뒤이므로 그때는
         * 그대로 인정된다.
         *
         * 초과분이 CREDITED_CURSOR_TOLERANCE_SECOND 를 넘으면 자르지 않는다 — 그건 내림 차이가 아니라 배속 · 지연으로
         * 모인 구간이고, 서버가 그 폭을 넘는 요청은 기준값을 요청 끝으로 옮겨 처리한다(상수 주석 참고).
         */
        var claimableSecond = claimableSecondSinceLastSend();
        var excessSecond = endPosition - startPosition - claimableSecond;
        if (excessSecond > 0 && excessSecond <= CREDITED_CURSOR_TOLERANCE_SECOND) {
            endPosition = startPosition + claimableSecond;
        }
        // 재진입 중(reenter)에는 보내지 않는다 — 되감기의 pause 저장이 옛 접속 ID 로 나가면 서버가 STUDY_ROOM_TAKEN 으로 거부해 재생이 멈춘다.
        if (study.saving || study.reentering || endPosition <= startPosition) {
            return;
        }
        study.saving = true;
        /*
         * 응답을 못 받아도 같은 구간을 다시 보내지 않게 여기서 먼저 옮긴다 —
         * 겹친 구간은 서버가 잘라 내므로(멱등) 중복 인정이 되지 않고, 서버에 닿지 못한 구간은 아래에서 한 번 더
         * 보낸 뒤 그래도 실패하면 유실을 받아들인다(거부로 이어지면 reenter 가 잇는다).
         * 서버가 이 구간의 일부만 인정하면 응답에서 그 지점으로 되돌린다(applySaveResponse).
         *
         * 인터벌 타이머 기준(lastSavedPosition)은 **내림하지 않은 재생위치**로 옮긴다. 내림해 두면
         * 다음 저장이 주기만큼이 아니라 '주기 - 버린 소수부' 뒤에 발사돼, 서버가 "30초 구간을 주장했는데
         * 실제로는 29.x 초밖에 흐르지 않았다" 로 보고 1초를 깎는다(CAPPED).
         * 서버가 보는 구간의 시작(sentPosition)은 **실제로 보낸 끝 위치**로 따로 둔다 — 버린 소수부는
         * 두 값의 차이로 남아 다음 구간에 그대로 이어진다(요청한 소수점 이월이 이 형태다).
         */
        study.lastSavedPosition = playedPosition;
        study.sentPosition = endPosition;
        study.lastSentAt = nowMillis();
        study.maxPlaybackRateSinceSend = player.playbackRate() || 1;
        var saveBody = {
            userCourseLessonDetailId: study.detailId,
            studySessionKey: study.sessionKey,
            startPositionSecond: startPosition,
            endPositionSecond: endPosition
        };
        /*
         * 서버에 닿지 못한 저장(fetch 자체의 거부)과 게이트웨이 · 서버 일시 오류(비JSON 5xx — 배포 중 LB 응답 등)는 잠시 뒤
         * 같은 구간을 한 번 더 보낸다. 운영 로그에서 모바일은 저장 42건 중 4건이 서버에 닿지 못했고, 유실 하나가 재생위치와
         * 인정시간을 31초 어긋나게 해 둘이 겹치면 건너뛰기 금지의 허용 폭(40초)을 넘어 그 접속의 저장이 전부 거부됐다.
         * 그 밖에 응답을 받은 실패(오류 JSON · 비JSON 2xx = 로그인 화면)는 재시도하지 않는다 — handleSaveError 의 몫이고,
         * 재시도해도 같은 답이 온다.
         *
         * 기다리는 동안 saving 을 풀지 않아 인터벌 저장이 겹치지 않는다(다음 구간은 응답 뒤 다음 timeupdate 에서 나간다).
         * 그 사이에 들어오는 정지 · 이탈 저장은 건너뛰고 다음 기회에 이어 보낸다. 기다리는 사이 다른 창에 밀려났어도
         * (stopped) 재시도는 한 번 보낸다 — 키가 아직 이 창 것이면 그 구간이 살고, 아니면 서버가 거부한다(응답은 보지 않는다).
         */
        var scheduleRetry = function (retryLeft) {
            window.setTimeout(function () {
                /*
                 * 벽시계 기준을 <b>이 재시도의 전송 시각</b>으로 옮긴다. 서버는 이 요청의 도착 시각을 "직전 저장" 으로 삼아
                 * 다음 저장의 실경과(②-a)를 재므로, 학습방도 같은 시점부터 재야 다음 구간을 서버가 받아 줄 만큼만 보낸다.
                 * 최초 전송 시각에 두면 다음 구간이 재시도 지연만큼 길게 나가 서버에 깎이고(CAPPED '직전 저장 이후 경과'),
                 * 그 깎임이 서버 허용 폭을 넘는 순간 그 몇 초는 되찾을 수 없다(SAVE_RETRY_DELAY_MILLISECOND 주석).
                 */
                study.lastSentAt = nowMillis();
                study.maxPlaybackRateSinceSend = player.playbackRate() || 1;
                sendAttempt(retryLeft - 1);
            }, SAVE_RETRY_DELAY_MILLISECOND);
        };
        var sendAttempt = function (retryLeft) {
            postJson(setting.progressUrl, saveBody, keepalive).then(function (result) {
                var transientServerError = !result.ok && result.payload === null && result.status >= 500;
                if (transientServerError && retryLeft > 0 && !study.stopped) {
                    scheduleRetry(retryLeft);
                    return;
                }
                study.saving = false;
                if (!result.ok) {
                    if (!study.stopped) {
                        handleSaveError(result);
                    }
                    return;
                }
                applySaveResponse(result.payload.data, endPosition);
            }, function () {
                if (retryLeft <= 0) {
                    study.saving = false;
                    return;
                }
                scheduleRetry(retryLeft);
            }).catch(function () {
                // 응답 처리 중 예외 — 저장 잠금만 풀어 다음 저장이 막히지 않게 한다.
                study.saving = false;
            });
        };
        sendAttempt(SAVE_RETRY_MAX);
    }

    /**
     * 저장 응답으로 진도 표시와 허용 위치를 갱신하고, 다음 구간의 시작을 서버가 인정한 지점으로 맞춘다.
     *
     * @param {number} sentEndPosition 이 응답을 받은 요청이 보낸 끝 위치
     */
    function applySaveResponse(saveResponse, sentEndPosition) {
        study.maxPlayablePosition = saveResponse.maxPlayablePositionSecond;
        study.studySecond = saveResponse.studySecond;
        study.lessonFull = saveResponse.studySecond >= saveResponse.playSecond;
        /*
         * 서버가 인정한 끝 위치(savedEndPositionSecond)가 보낸 끝보다 앞이면 그 사이 구간은 인정되지 않은 것이다
         * (직전 저장 이후 실제로 흐른 시간보다 구간이 길어 잘렸다 — 내림 위치의 1초 차이, 또는 배속). 다음 구간의
         * 시작을 거기로 되돌려 이어 주장한다. 서버도 겹침 기준값을 그 지점에 두므로 같은 구간이 두 번 인정될 일은 없다.
         * 응답을 기다리는 사이 싱크바 이동으로 sentPosition 이 다른 곳으로 옮겨졌으면 건드리지 않는다 —
         * 뛰어넘은 구간까지 주장하게 되는 것은 이동 처리가 막으려던 바로 그것이다.
         *
         * <b>미인정(REJECTED)에는 되돌리지 않는다.</b> 건너뛰기 금지에서 허용 위치를 넘긴 요청이 거부된 뒤 기준값으로
         * 되돌아가면, 그 창은 보지 않은 앞 구간을 주장해 실시간으로 인정받는다 — 순차 시청 정책이 조용히 무너진다.
         * 거부는 아래에서 <b>접속을 다시 열어</b> 잇는다(recoverFromRejectedSave) — 기준값이 아니라 재생위치 자체를
         * 이어보기 지점으로 되감으므로 보지 않은 구간을 주장할 수 없다.
         *
         * <b>기준값이 분모(play_second)에 닿아 있으면 되돌리지 않는다.</b> 서버는 기준값을 분모로 자르므로, 실제 영상이
         * 분모보다 길면 분모를 넘긴 뒤의 모든 응답이 분모 값으로 온다. 그때마다 되돌리면 다음 요청이 매번 분모에서
         * 시작해 겹치는 구간을 반복 주장하게 된다(로그가 몰아보내기처럼 읽힌다). 그 너머는 인정할 것이 없으니
         * 보낸 위치가 재생위치를 그대로 따라가게 둔다.
         */
        var savedEndPosition = saveResponse.savedEndPositionSecond;
        var cursorAtPlaySecond = saveResponse.playSecond > 0 && savedEndPosition >= saveResponse.playSecond;
        if (typeof savedEndPosition === 'number' && savedEndPosition < sentEndPosition
                && study.sentPosition === sentEndPosition && saveResponse.saveStatusCd !== 'REJECTED'
                && !cursorAtPlaySecond) {
            study.sentPosition = savedEndPosition;
        }
        /*
         * 미인정 — 건너뛰기 금지에서 요청 시작이 허용 위치(인정시간 + 40초)를 넘었다. 싱크바를 옮긴 것이 아니라도
         * 생긴다: 저장이 서버에 닿지 못해(재시도까지 실패) 재생위치가 인정시간보다 앞서 간 경우다. 허용 위치는 인정시간에서
         * 나오므로 재생이 이어지는 한 다음 요청도 전부 거부된다 — 종전에는 안내 없이 끝까지 거부만 쌓였다(운영 사례:
         * 13분 시청에 인정 0초, 재진입해도 같은 유실로 반복). 접속 안에서는 되돌릴 길이 없어 새 접속으로 잇는다.
         */
        if (saveResponse.saveStatusCd === 'REJECTED') {
            recoverFromRejectedSave();
            return;
        }
        if (saveResponse.acceptedSecond > 0) {
            // 인정 저장이 오면 재진입 상한을 되돌린다 — 상한은 "인정 없이 재진입만 반복" 을 막는 것이다.
            study.reenterWithoutAcceptCount = 0;
        }
        if (saveResponse.progressRate !== null && saveResponse.progressRate !== undefined) {
            el.progress.value = saveResponse.progressRate;
            el.progressText.textContent = Math.floor(saveResponse.progressRate) + '%';
        }
        if (saveResponse.lessonCompleted) {
            study.lessonCompleted = true;
            markCurrentLessonCompleted();
            toast('이 차시의 학습을 완료했습니다.');
        }
    }

    /** 거부된 저장의 복구 — 접속을 다시 열어 인정시간 지점에서 잇는다(reenter 주석 참고). */
    function recoverFromRejectedSave() {
        reenter({
            atEnd: false,
            noticeOf: function (resumeSecond) {
                return '일부 학습 구간이 저장되지 않아 ' + formatTime(resumeSecond) + ' 지점부터 다시 재생합니다.';
            }
        });
    }

    /**
     * 접속을 다시 연다 — 거부된 저장(recoverFromRejectedSave)과 영상 끝 부족분(recoverShortfallAtEnd)의 복구 경로다.
     * 학습자가 수동으로 하던 "학습방을 닫고 다시 열기" 를 그 자리에서 한다.
     *
     * <b>왜 되감기가 아니라 재진입인가.</b> 서버의 겹침 제거 기준은 이 접속에서 인정이 닿은 끝 위치라, 그 앞으로 되감아
     * 보낸 구간은 인정되지 않는다. 유실로 재생위치가 인정시간보다 40초 넘게 앞서면 "허용 위치 ≤ 요청 시작" 과
     * "기준값 < 요청 끝" 을 동시에 만족하는 구간이 없어 접속 안에서는 어떤 저장도 온전히 인정받지 못한다 — 되감기만으로는
     * 1분마다 거부 → 되감기가 도는 루프가 된다. 새 접속은 기준값을 이어보기 지점(인정시간)에서 열므로 거기서부터 잇는다.
     *
     * 순서 — 저장을 잠그고(reentering) 재생을 멈춘 뒤 입장 API 를 다시 부른다. 응답을 첫 입장과 같은 자리에 싣고
     * (applyEnterResponse), 재생위치를 이어보기 지점으로 되감은 뒤 안내 한 번, 닫으면 재생한다. 소스는 그대로 둔다 —
     * 재생 URL 은 같은 콘텐츠다(서명 URL 을 붙이면 여기서 src 를 갈아 끼울지 함께 본다).
     * 입장이 실패하면(기간 종료 · 로그인 만료 · 네트워크) 조용히 이어 가지 않고 멈춘다(failToReenter).
     *
     * <b>횟수 상한(REENTER_LIMIT).</b> 인정 저장 없이 재진입만 이어지면 저장마다 거부되는 비정상 상태다(정책 불일치 ·
     * 분모 어긋남). 30초마다 재진입을 반복하는 새 루프가 되지 않게 멈추고 알린다. 인정 저장이 오면 0 으로 돌아간다.
     *
     * 입장 API 가 네트워크 단계에서 실패하면 저장과 같이 한 번 더 보낸다 — 거부의 원인이 순단이면 입장도 같은 순단에
     * 걸릴 수 있고, 그때 바로 멈추면 회선이 돌아온 뒤 학습자가 학습방을 다시 찾아와야 한다.
     * 응답을 기다리는 사이 다른 창에 밀려났으면(stopped) 새 접속을 쓰지 않는다 — 그 창의 안내가 이미 떠 있다.
     *
     * @param {{atEnd: boolean, noticeOf: function}} options atEnd 는 영상 끝 부족분 복구인가(applyReentered 가 가른다),
     *        noticeOf 는 이어볼 지점(초)을 받아 안내 문구를 만든다 — 경로마다 사유가 다르다
     */
    function reenter(options) {
        if (!study.entered || study.stopped || study.reentering) {
            return;
        }
        study.reentering = true;
        if (!player.paused()) {
            player.pause();
        }
        if (study.reenterWithoutAcceptCount >= REENTER_LIMIT) {
            study.stopped = true;
            notify('학습시간 저장이 반복해서 실패하고 있습니다. 네트워크 상태를 확인한 뒤 학습방을 다시 열어 주세요.');
            return;
        }
        study.reenterWithoutAcceptCount += 1;
        var requestEnter = function (retryLeft) {
            postJson(setting.enterUrl, enterRequestBody(), false).then(function (result) {
                if (study.stopped) {
                    return;
                }
                if (!result.ok) {
                    failToReenter(result);
                    return;
                }
                applyReentered(result.payload.data, options);
            }, function () {
                if (retryLeft > 0 && !study.stopped) {
                    window.setTimeout(function () {
                        requestEnter(retryLeft - 1);
                    }, SAVE_RETRY_DELAY_MILLISECOND);
                    return;
                }
                failToReenter(null);
            });
        };
        requestEnter(SAVE_RETRY_MAX);
    }

    /**
     * 재진입 응답을 적용한다 — 서버가 보는 상태로 이 창을 맞추고 이어 재생한다.
     *
     * <b>서버가 이미 완료로 보면(review) 되감지 않는다.</b> 완료 저장의 응답이 유실되면 이 창은 완료를 모른다(재시도가
     * 중복 저장이 되어 완료 신호 없이 끝난다). 그 상태로 영상 끝에 닿아 부족분 복구로 들어왔다면 되감을 것이 아니라
     * 완료로 표시해야 한다 — 이 창의 값이 아니라 입장 응답이 정본이다.
     *
     * <b>영상 끝 부족분인데 다시 볼 구간이 없으면 멈추고 사유만 알린다.</b> 인정시간이 분모를 다 채웠거나 이어보기 지점이
     * 영상 끝에 닿아 있는 경우로, 분모(play_second)가 실제 영상과 어긋나 서버가 끝 도달로 보지 못하는 편성 데이터 문제다.
     * 되감아 봐야 인정될 것이 없고, 그대로 재생하면 끝 → 재진입이 상한까지 되풀이된다.
     */
    function applyReentered(enterResponse, options) {
        applyEnterResponse(enterResponse);
        if (enterResponse.review) {
            study.lessonCompleted = true;
            study.reentering = false;
            markCurrentLessonCompleted();
            notify('이 차시의 학습이 이미 완료 처리되어 있습니다.', options.atEnd ? undefined : play);
            return;
        }
        if (options.atEnd && nothingLeftToRewatch(enterResponse)) {
            study.reentering = false;
            study.stopped = true;
            notify('영상을 끝까지 시청했지만 이 차시가 완료로 처리되지 않았습니다.'
                    + ' 학습방을 다시 열어도 같으면 관리자에게 문의해 주세요.');
            return;
        }
        player.currentTime(enterResponse.resumeStartSecond);
        study.reentering = false;
        notify(options.noticeOf(enterResponse.resumeStartSecond), play);
    }

    /**
     * 영상 끝 부족분 복구에서 되감아 볼 구간이 없는가 — 인정시간이 분모를 다 채웠거나(서버가 더 인정할 것이 없다),
     * 이어보기 지점이 영상 끝에 END_OF_VIDEO_TOLERANCE_SECOND 안으로 닿아 있다(되감아도 그 몇 초뿐이다).
     */
    function nothingLeftToRewatch(enterResponse) {
        var endPosition = endOfVideoPosition() || Math.floor(player.currentTime());
        return enterResponse.studySecond >= enterResponse.playSecond
                || enterResponse.resumeStartSecond + END_OF_VIDEO_TOLERANCE_SECOND >= endPosition;
    }

    /**
     * 재진입 실패 — 멈춘다. 입장 API 의 사유(기간 종료 · 승인 취소)가 있으면 그 문구를, 로그인 만료(비JSON)면
     * handleSaveError 와 같은 문구를 쓰고, 닫으면 새로고침한다 — 로그인 만료면 인증 진입점이 로그인 화면으로 보내고
     * 로그인 뒤 이 학습방으로 되돌린다. 네트워크 실패(재시도까지)는 새로고침하지 않는다 — 회선이 끊긴 채 새로고침하면
     * 브라우저 오류 화면으로 떨어져 학습방을 다시 찾아와야 한다. 조용히 이어 가면 저장 없는 재생이 되므로 어느 쪽이든 멈춘다.
     */
    function failToReenter(result) {
        study.stopped = true;
        if (result === null) {
            notify('네트워크 연결이 끊겨 학습시간을 저장할 수 없습니다. 연결을 확인한 뒤 학습방을 다시 열어 주세요.');
            return;
        }
        var reason = messageOf(result, '학습시간을 저장할 수 없습니다.');
        if (result.payload === null) {
            // 비JSON 응답 = 로그인 만료 · 다른 기기 로그인(postJson 주석) — handleSaveError 와 같은 사유를 같은 말로 알린다.
            reason = '로그인이 만료되었거나 다른 기기에서 학습이 시작되어 학습시간을 저장할 수 없습니다.';
        }
        notify(reason + ' 안내를 닫으면 학습방을 다시 불러옵니다.', function () {
            window.location.reload();
        });
    }

    /**
     * 저장 실패 처리. 다른 창에 밀려난 경우(409)는 재생을 멈추고 더 보내지 않는다 —
     * 계속 보내면 거부 로그만 쌓이고 학습자는 저장되는 줄 안다.
     * 그 밖의 오류(기간 만료·승인 취소 등)도 같은 이유로 멈춘다.
     */
    function handleSaveError(result) {
        study.stopped = true;
        player.pause();
        if (result && result.payload === null) {
            /*
             * 응답이 ApiResponse 가 아니었다 — 로그인 만료 · 다른 기기 로그인에 밀린 경우다(위 postJson).
             * /api/** 의 오류는 GlobalExceptionHandler 가 JSON 으로 답하므로, JSON 이 아닌 응답은
             * 사실상 인증 진입점의 로그인 화면 리다이렉트뿐이다.
             *
             * <b>안내를 닫으면 이 화면을 다시 불러 목적지를 서버가 정하게 한다.</b> 로그인 주소를 이 파일에
             * 적지 않는 이유이며(사용자 체인의 USER_LOGIN_REQUIRED_URL 이 정본이다), 그 경로로 가면
             * RequestCache 가 원래 화면을 기억해 <b>로그인 뒤 이 학습방으로 되돌려 준다</b> —
             * 로그인 주소로 직접 보내면 로그인 후 홈으로 떨어져 학습자가 학습방을 다시 찾아와야 한다.
             *
             * [확인]뿐 아니라 X · 바깥 클릭 · ESC 로 닫아도 같은 이동이 돈다(notify 의 onClose 계약).
             * 저장이 이미 막힌 상태라 여기 남겨 두면 학습자는 재생만 하고 학습시간은 쌓이지 않는다.
             */
            notify('로그인이 만료되었거나 다른 기기에서 학습이 시작되어 학습시간을 저장할 수 없습니다.'
                    + ' 안내를 닫으면 로그인 화면으로 이동합니다.', function () {
                window.location.reload();
            });
            return;
        }
        notify(messageOf(result, '학습시간을 저장할 수 없습니다. 학습방을 다시 열어 주세요.'));
    }

    // ──────────────────────────── 백그라운드 재생 (웹만 허용) ────────────────────────────

    /**
     * 기기가 모바일인가 — <b>백그라운드 재생을 허용할지 가르는 유일한 판정</b>(운영 방침).
     *
     * 웹(PC)은 다른 탭·창으로 옮겨 가도 재생이 이어진다. 화면을 계속 띄워 둘 수 없는 업무 중에
     * 소리로 듣는 학습을 막을 이유가 없고, 인정 학습시간은 어차피 서버가 <b>실제로 흐른 시간</b>으로
     * 자르므로(UserCourseLessonDetailLog.record 의 ②-a·②-b) 백그라운드라고 더 쌓이지 않는다.
     * 모바일은 <b>종전대로 막는다</b> — 화면을 끄거나 앱을 전환한 채로 재생만 돌려 두는 것이 너무 쉽다.
     *
     * <b>폭(innerWidth)으로 가르지 않는다.</b> study-launch.js 는 '새 창이냐 같은 탭이냐' 라는 레이아웃
     * 판단이라 폭이 맞지만, 여기는 <b>기기 종류</b>를 묻는 정책이다. 폭으로 가르면 PC 에서 창을 반으로
     * 줄여 놓고 듣는(= 이 기능을 가장 많이 쓸) 학습자가 모바일로 오판돼 막힌다.
     *
     * <b>모바일이라는 신호가 하나라도 있으면 모바일로 본다</b> — 판정이 어긋났을 때 기존 동작(차단)
     * 쪽으로 넘어져야 새로 뚫리는 구멍이 없다.
     */
    function isMobileDevice() {
        /*
         * 1) Client Hints — 브라우저가 스스로 모바일 여부를 답한다(Chromium 계열). 가장 정확하다.
         *    다만 '데스크톱 사이트 요청' 을 켜면 false 로 답하므로, false 를 곧바로 PC 로 받아들이지 않고
         *    아래 2)·3) 을 마저 본다. (Safari·Firefox 에는 이 API 가 없다 — 확인 필요 없이 없는 쪽으로 동작한다.)
         */
        if (navigator.userAgentData && navigator.userAgentData.mobile === true) {
            return true;
        }
        // 2) UA 문자열 — 위 API 가 없는 브라우저(iOS Safari · Firefox)를 덮는다.
        if (/Android|iPhone|iPad|iPod|Windows Phone|IEMobile|Mobile Safari/i.test(navigator.userAgent)) {
            return true;
        }
        /*
         * 3) 데스크톱 UA 를 쓰는 모바일 — iPadOS 13+ 의 Safari 와 안드로이드의 '데스크톱 사이트 요청'
         *    은 UA 에 모바일 표시가 없다. 주 입력이 <b>거친 포인터(손가락)</b> 이고 터치가 있으면 모바일로 본다.
         *    `pointer: coarse` 는 '주 입력 장치' 를 묻는 질의라 <b>터치 노트북은 걸리지 않는다</b>
         *    (마우스·트랙패드가 주 입력이라 fine 으로 답한다) — maxTouchPoints 만 보면 오판하는 지점이다.
         */
        return window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
    }

    /** 이 기기에서 백그라운드 재생을 허용하는가. 기기는 재생 중에 바뀌지 않으므로 한 번만 판정한다. */
    var backgroundPlayAllowed = !isMobileDevice();

    /**
     * 모바일 전용 안내를 연다 — 재생 전 덮개의 규정 안내와 학습 규칙 안내의 한 줄. 서버는 기기를 모르므로 둘 다 숨겨
     * 내리고(room.html 의 hidden) 기기 판정이 끝난 여기서 연다.
     *
     * <b>학습을 시작하기 전에 읽을 수 있어야 한다.</b> 화면을 끄거나 앱을 바꾸면 멈춘다는 것, 그 동안은 규정상 학습시간이
     * 저장되지 않는다는 것, 알림창 · 잠금화면의 재생 버튼으로 강제 재생하면 저장에 문제가 생긴다는 것을 모른 채 시작하면
     * "봤는데 시간이 안 쌓였다" 로만 남는다. 짧은 줄은 덮개([학습 시작] 아래)에, 긴 설명은 학습 규칙 안내에 둔다.
     */
    function openMobileNotices() {
        if (backgroundPlayAllowed) {
            return;
        }
        var coverNote = document.getElementById('study_cover_mobile_note');
        var tipLine = document.getElementById('study_tip_mobile');
        if (coverNote) {
            coverNote.hidden = false;
        }
        if (tipLine) {
            tipLine.hidden = false;
        }
    }
    openMobileNotices();

    /**
     * 화면이 가려진 채 시작된 재생을 되돌린다 — <b>모바일 백그라운드 금지의 두 번째 가드.</b>
     *
     * 아래 visibilitychange 는 "가려지는 순간" 한 번 멈출 뿐이다. 그 뒤 알림창 · 잠금화면 · 제어센터 · 이어폰 버튼으로
     * 재생을 재개하면 브라우저가 미디어 요소의 play() 를 직접 불러 visibilitychange 없이 재생이 이어졌다(갤럭시 알림창 ▶ 로
     * 확인 — 화면을 끈 채 학습시간이 쌓였다). play 이벤트는 그 모든 경로가 거치므로 여기서 한 번에 막는다.
     * 되돌린 사실은 화면으로 돌아왔을 때 알린다(visibilitychange 의 visible 갈래) — 가려진 화면에는 안내를 띄울 수 없다.
     * 웹은 백그라운드 재생이 허용이라 손대지 않는다.
     */
    function blockHiddenPlay() {
        if (backgroundPlayAllowed || document.visibilityState !== 'hidden') {
            return;
        }
        study.backgroundPlayBlocked = true;
        player.pause();
    }
    player.on('play', blockHiddenPlay);

    /**
     * 미디어 세션 — 알림창 · 잠금화면 · 이어폰의 재생 요청을 페이지가 받는다. 핸들러를 등록하면 브라우저가 play() 를
     * 직접 부르지 않고 이 핸들러를 부르므로, 모바일은 화면이 가려진 동안의 재생 요청을 여기서 무시한다(위 play 가드의
     * 앞단 — 가드는 이 API 가 없는 브라우저와 등록을 거치지 않는 경로의 안전망으로 남는다).
     *
     * <b>탐색(seekto · seekforward · seekbackward)은 등록하지 않는다</b> — 등록하면 알림에 탐색 조작이 생겨 싱크바 잠금이
     * 뚫린다. 삼성 인터넷 · 구형 iOS 의 지원 범위는 확인 필요다(없으면 가드만 남아 종전과 같다).
     */
    function applyMediaSessionControl() {
        if (backgroundPlayAllowed || !navigator.mediaSession
                || typeof navigator.mediaSession.setActionHandler !== 'function') {
            return;
        }
        try {
            navigator.mediaSession.setActionHandler('play', function () {
                if (document.visibilityState === 'hidden') {
                    study.backgroundPlayBlocked = true;
                    return;
                }
                play();
            });
            navigator.mediaSession.setActionHandler('pause', function () {
                player.pause();
            });
        } catch (e) {
            // 지원하지 않는 액션에 TypeError 를 던지는 브라우저가 있다 — 그러면 play 가드만 남는다.
        }
    }
    applyMediaSessionControl();

    /**
     * 작게 보기(PiP) — 모바일은 막는다. 영상이 창 밖 작은 창으로 나가면 문서는 가려진 상태가 되는데 재생은 이어진다 —
     * 백그라운드 재생의 또 다른 문이다(갤럭시 Chrome 의 자동 PiP · 삼성 인터넷 비디오 어시스턴트). 속성(disablePictureInPicture)
     * 으로 진입 자체를 막고, 그래도 들어오면(브라우저 자체 메뉴 — 속성을 따르는지는 브라우저마다 확인 필요) 되돌리고 멈춘다.
     * iOS 는 presentation mode 로 같은 일을 본다. 웹(PC)의 PiP 는 백그라운드 재생과 같은 뜻이라 막지 않는다.
     * 미리보기(course-preview.js)도 같은 속성으로 막는다.
     */
    function applyPictureInPictureControl() {
        if (backgroundPlayAllowed) {
            return;
        }
        // video.js 는 <video> 를 div 로 감싸고 원래 요소를 tech 로 쓴다 — 속성과 이벤트는 그 요소에 건다.
        var techVideo = player.el().querySelector('video') || videoElement;
        techVideo.disablePictureInPicture = true;
        techVideo.addEventListener('enterpictureinpicture', function () {
            if (document.exitPictureInPicture) {
                document.exitPictureInPicture().catch(function () { });
            }
            study.backgroundPlayBlocked = true;
            player.pause();
        });
        techVideo.addEventListener('webkitpresentationmodechanged', function () {
            if (techVideo.webkitPresentationMode !== 'picture-in-picture') {
                return;
            }
            try {
                techVideo.webkitSetPresentationMode('inline');
            } catch (e) {
                // 되돌리기가 막혀도 아래 정지가 학습시간을 지킨다.
            }
            study.backgroundPlayBlocked = true;
            player.pause();
        });
    }
    applyPictureInPictureControl();

    /**
     * 이탈 직전 저장 — 탭 전환 · 앱 전환 · 화면 꺼짐 · 창 닫기.
     *
     * <b>모바일</b>은 종전대로 멈춘다. pause() 가 위 pause 핸들러를 불러 남은 구간을 보낸다
     * (저장 경로를 한 곳으로 모은다). 가려진 동안 되돌린 재생(blockHiddenPlay · 미디어 세션 · PiP)이 있었으면
     * <b>화면으로 돌아온 순간</b> 한 번 알린다 — 규정상 저장되지 않아 멈췄다는 것을 모르면 "봤는데 시간이 안 쌓였다" 가 된다.
     * 안내를 닫으면 이어서 재생한다(이어보기 안내와 같은 계약).
     *
     * <b>웹</b>은 멈추지 않고 <b>잔여 구간만 밀어 넣는다.</b> 재생이 이어지므로 정지 저장 경로가 돌지 않는데,
     * 백그라운드 탭은 브라우저가 메모리 압박으로 정리할 수 있어 그때까지의 구간이 통째로 유실된다.
     * 여기서 한 번 보내 두면 잃는 구간이 마지막 저장 이후로 줄어든다(겹친 구간은 서버가 잘라 내므로 멱등하다).
     *
     * 창을 강제로 닫아 이 핸들러조차 돌지 못한 무단 이탈의 유실은 받아들인다(설계 판단).
     */
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'hidden') {
            if (!backgroundPlayAllowed && study.backgroundPlayBlocked) {
                study.backgroundPlayBlocked = false;
                notify('화면을 벗어난 동안의 재생은 규정상 학습시간으로 저장되지 않아 일시정지했습니다.'
                        + ' 안내를 닫으면 이어서 재생합니다.', function () {
                    if (study.entered && !study.stopped) {
                        play();
                    }
                });
            }
            return;
        }
        if (backgroundPlayAllowed) {
            if (study.entered && !study.stopped) {
                saveProgress(true);
            }
            return;
        }
        if (!player.paused()) {
            player.pause();
        }
    });
    window.addEventListener('pagehide', function () {
        if (study.entered && !study.stopped) {
            saveProgress(true);
        }
    });

    // ──────────────────────────── 컨트롤바 ────────────────────────────

    el.startButton.addEventListener('click', enter);
    el.play.addEventListener('click', play);
    el.pause.addEventListener('click', function () {
        player.pause();
    });

    el.volume.addEventListener('click', function () {
        player.muted(!player.muted());
        el.volume.classList.toggle('ctr-mute', player.muted());
        el.volumeGauge.style.width = (player.muted() ? 0 : player.volume() * 100) + '%';
    });

    el.fullscreen.addEventListener('click', function () {
        if (currentFullscreenElement()) {
            exitFullscreen();
            return;
        }
        requestFullscreen();
    });

    el.exit.addEventListener('click', function () {
        confirmAsk('학습을 종료하시겠습니까? 지금까지의 학습시간은 저장됩니다.', function () {
            player.pause();
            // 새 창으로 열렸으면 창을 닫고, 같은 탭이면(모바일) 학습내역으로 돌아간다.
            if (window.opener && !window.opener.closed) {
                window.close();
                return;
            }
            window.location.href = '/user/online';
        });
    });

    // ──────────────────────────── 학습방은 한 번에 하나만 ────────────────────────────

    /*
     * <b>학습방을 두 개 띄운 채로 학습할 수 없다.</b> 여러 과정을(또는 같은 과정의 여러 차시를) 동시에
     * 돌려 학습시간을 병렬로 쌓는 것을 막는 규칙이며, 세 겹으로 막는다.
     *
     *   1) 창 이름       window.open(url, 'studyRoom') — 같은 이름이면 브라우저가 기존 창을 재사용한다
     *                    (study-launch.js). [학습하기] 를 여러 번 눌러도 창은 하나다.
     *   2) 탭 간 통신    <b>여기</b> — 다른 탭·창에서 학습방이 열리면 이 창이 <b>즉시</b> 멈춘다.
     *                    1) 이 못 막는 경로(주소 직접 입력, 새 탭으로 열기, 링크 복사)를 덮는다.
     *   3) 서버 판정     학습 키를 HttpSession 에 하나만 두고 저장 요청마다 대 본다
     *                    (StudyApiController · StudyProgressService) — 같은 브라우저의 최종 방어다.
     *   4) 로그인 제한   계정당 동시 세션 1개(SecurityConfig.sessionManagement — maximumSessions(1),
     *                    maxSessionsPreventsLogin(false))라 <b>다른 기기</b>에서 로그인하면 앞 세션이 만료된다.
     *                    그래서 기기를 바꿔 두 학습방을 돌리는 것도 성립하지 않는다.
     *
     * 2) 가 없으면 3) 만 남아 <b>앞 창이 다음 저장 주기(최대 30초)까지 계속 재생</b>된다. 그 동안 학습자는
     * 저장되지 않는 줄 모르고 보게 되고, 두 창이 동시에 열린 상태도 그만큼 지속된다.
     *
     * <b>방송 시점은 '입장(enter)' 이 아니라 '페이지 로드' 다.</b> 입장 뒤에 방송하면 서버 세션 키가 이미
     * 새 창 것으로 덮여, 앞 창이 잔여 구간을 저장하려 해도 거부된다(그 구간이 유실된다).
     * 로드 시점에 알리면 앞 창이 아직 유효한 키로 마지막 구간을 저장하고 멈출 수 있다.
     */
    var STUDY_ROOM_CHANNEL = 'digitaldoctor-study-room';

    /** 이 창을 식별하는 값. 자기 방송을 자기가 받아 스스로 멈추는 일을 막는다. */
    var studyRoomWindowId = String(Date.now()) + '-' + Math.random().toString(36).slice(2);

    /**
     * 다른 창에서 학습방이 열렸다 — 이 창은 물러난다.
     * 재생 중이면 먼저 멈춰 잔여 구간을 저장한 뒤(pause 핸들러가 그 경로다) 더 보내지 않게 잠근다.
     */
    function yieldToOtherStudyRoom() {
        if (study.stopped) {
            return;
        }
        /*
         * 마지막 구간을 <b>직접</b> 보낸다. player.pause() 에 맡기면 안 된다 — video.js 의 pause 이벤트는
         * 비동기로 전달돼, 핸들러가 돌 때는 이미 아래에서 study.stopped 가 켜져 저장을 건너뛴다
         * (실측으로 확인했다 — 잔여 구간이 유실됐다). 서버 키가 아직 이 창 것인 지금이 마지막 기회다.
         * 이어서 pause 핸들러가 한 번 더 불러도 saveProgress 가 `끝 <= 시작` 으로 걸러 중복이 나가지 않는다.
         */
        if (study.entered) {
            saveProgress(true);
        }
        if (study.entered && !player.paused()) {
            player.pause();
        }
        study.stopped = true;
        // 아직 시작하지 않은 창이면 [학습 시작] 도 잠근다 — 눌러도 서버가 거부할 상태다.
        el.startButton.disabled = true;
        el.coverNote.textContent = '다른 창에서 학습방이 열렸습니다. 이 창은 닫아 주세요.';
        notify('다른 창에서 학습방을 열었습니다. 학습방은 한 번에 하나만 사용할 수 있어 이 창에서는'
                + ' 더 이상 학습시간이 저장되지 않습니다.');
    }

    (function watchOtherStudyRooms() {
        // BroadcastChannel 이 있으면 그걸 쓴다 — 같은 출처의 탭·창끼리 직접 주고받아 저장소를 건드리지 않는다.
        if (typeof window.BroadcastChannel === 'function') {
            var channel = new window.BroadcastChannel(STUDY_ROOM_CHANNEL);
            channel.addEventListener('message', function (event) {
                if (event.data && event.data.windowId !== studyRoomWindowId) {
                    yieldToOtherStudyRoom();
                }
            });
            channel.postMessage({ windowId: studyRoomWindowId });
            return;
        }
        /*
         * 폴백 — localStorage 쓰기는 <b>다른</b> 탭에만 storage 이벤트를 띄운다(자기 탭에는 오지 않는다).
         * 사파리 사생활 보호 모드 등에서 쓰기가 막힐 수 있어 try 로 감싼다 — 그때는 3) 서버 판정만 남는다.
         */
        window.addEventListener('storage', function (event) {
            if (event.key === STUDY_ROOM_CHANNEL && event.newValue) {
                yieldToOtherStudyRoom();
            }
        });
        try {
            window.localStorage.setItem(STUDY_ROOM_CHANNEL, studyRoomWindowId);
        } catch (e) {
            // 저장소를 못 쓰면 탭 간 통신을 포기한다. 서버 판정이 여전히 동시 학습을 막는다.
        }
    })();

    function togglePlayButton(playing) {
        el.play.classList.toggle('on', !playing);
        el.pause.classList.toggle('on', playing);
    }

    function updatePlayedGauge() {
        var duration = player.duration();
        if (!duration || isNaN(duration)) {
            return;
        }
        el.played.style.width = (player.currentTime() / duration * 100) + '%';
        el.nowTime.textContent = formatTime(player.currentTime());
        el.totalTime.textContent = formatTime(duration);
    }

    // ──────────────────────────── 차시 이동 ────────────────────────────

    /**
     * 차시 목록 클릭. 잠긴 줄(순차 수강에서 앞 차시가 남음)은 사유를 알리고 이동하지 않는다 —
     * 서버 판정과 같은 규칙으로 서버가 accessible 을 내려 주므로 눌러 봐야 거부되는 줄이 없다.
     * 완료한 차시는 복습 여부를 먼저 묻는다.
     */
    if (el.lessonList) {
        el.lessonList.addEventListener('click', function (event) {
            requestLessonMove(event.target.closest('li[data-course-lesson-id]'));
        });
    }

    /**
     * 차시 줄 하나로 이동을 요청한다 — <b>목록 클릭과 [이전/다음 차시] 버튼이 함께 쓴다.</b>
     *
     * 판정을 두 곳에 적으면 목록에서는 막히는데 버튼으로는 넘어가는(또는 그 반대) 어긋남이 생긴다.
     * 재료는 전부 그 줄의 data-* 이고, 그 값은 서버가 진입 판정과 같은 규칙으로 내려 준다.
     */
    function requestLessonMove(row) {
        if (!row || row.getAttribute('data-current') === 'true') {
            return;
        }
        if (row.getAttribute('data-accessible') !== 'true') {
            notify('앞 차시를 먼저 완료해야 학습할 수 있습니다.');
            return;
        }
        var courseLessonId = row.getAttribute('data-course-lesson-id');
        if (row.getAttribute('data-completed') === 'true') {
            confirmAsk('이미 학습을 완료한 콘텐츠입니다. 복습하시겠습니까?', function () {
                moveToLesson(courseLessonId);
            });
            return;
        }
        moveToLesson(courseLessonId);
    }

    /**
     * [이전 차시] · [다음 차시] — 목록의 현재 줄에서 앞뒤 형제를 찾아 같은 규칙으로 이동한다.
     *
     * <b>잠겼다고 버튼을 잠그지는 않는다.</b> 순차 수강에서 다음 차시가 잠겨 있으면 목록 줄과 똑같이
     * 눌렀을 때 사유를 알린다 — 이유 없이 죽어 있는 버튼보다 낫고, 차시를 완료해 잠금이 풀리는 순간
     * (markCurrentLessonCompleted) 버튼 상태를 따로 되돌릴 필요도 없다. 클릭 시점에 DOM 을 읽기 때문이다.
     * 끝(첫·마지막 차시)에서만 disabled 로 둔다 — 그건 상태가 바뀌어도 열리지 않는 경계다.
     */
    function siblingLessonRow(forward) {
        if (!el.lessonList) {
            return null;
        }
        var current = el.lessonList.querySelector('li[data-current="true"]');
        if (!current) {
            return null;
        }
        var sibling = forward ? current.nextElementSibling : current.previousElementSibling;
        return sibling && sibling.hasAttribute('data-course-lesson-id') ? sibling : null;
    }

    if (el.prevLesson) {
        el.prevLesson.disabled = siblingLessonRow(false) === null;
        el.prevLesson.addEventListener('click', function () {
            requestLessonMove(siblingLessonRow(false));
        });
    }
    if (el.nextLesson) {
        el.nextLesson.disabled = siblingLessonRow(true) === null;
        el.nextLesson.addEventListener('click', function () {
            requestLessonMove(siblingLessonRow(true));
        });
    }

    /** 차시 이동. 재생 중이면 먼저 멈춰 남은 구간을 저장한 뒤 주소를 옮긴다. */
    function moveToLesson(courseLessonId) {
        if (!player.paused()) {
            player.pause();
        }
        window.location.href = setting.lessonUrl + courseLessonId;
    }

    /** 현재 차시 줄을 완료 모양으로 바꾼다(새로고침 없이 목록이 실제 상태와 맞게). */
    function markCurrentLessonCompleted() {
        if (!el.lessonList) {
            return;
        }
        var current = el.lessonList.querySelector('li[data-current="true"]');
        if (current) {
            current.classList.add('comple');
            current.setAttribute('data-completed', 'true');
        }
        // 순차 수강에서 다음 차시가 열린다 — 잠금을 풀어 바로 이어갈 수 있게 한다.
        if (current && setting.sequentialRequired) {
            var next = current.nextElementSibling;
            if (next && next.hasAttribute('data-course-lesson-id')) {
                next.classList.remove('is-locked');
                next.setAttribute('data-accessible', 'true');
            }
        }
    }

    // ──────────────────────────── 공통 ────────────────────────────

    /** 초 → mm:ss(한 시간을 넘으면 h:mm:ss). 서버 표기(StudyDto.formatTime)와 같은 규칙이다. */
    function formatTime(totalSecond) {
        var safeSecond = Math.max(Math.floor(totalSecond || 0), 0);
        var hour = Math.floor(safeSecond / 3600);
        var minute = Math.floor((safeSecond % 3600) / 60);
        var second = safeSecond % 60;
        var mm = minute < 10 ? '0' + minute : String(minute);
        var ss = second < 10 ? '0' + second : String(second);
        if (hour > 0) {
            return hour + ':' + mm + ':' + ss;
        }
        return mm + ':' + ss;
    }
})();
