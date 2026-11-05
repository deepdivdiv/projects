/**
 * 과정 상세(커리큘럼)의 <b>미리보기 영상</b> 스크립트 — views/user/curriculum_view.html 전용.
 *
 * === 무엇을 하는가 ===
 * 대표 이미지(.cur_head .thumb) 영역에 들어오면 [재생]이 나타나고, 누르면 <b>화면 가운데 레이어팝업</b>이 열려
 * 1차시 영상을 크게 재생한다. 서버가 정한 지점(previewSecond)에 닿거나 영상이 끝나면 <b>팝업을 닫고 처음
 * 상태로 되돌린다</b> — 플레이어를 걷어내고 썸네일로 돌아간다. 그래서 여러 번 눌러도 늘 같게 다시 시작한다.
 *
 * === 설계 요약 ===
 * 1) 재생 주소를 화면에서 읽지 않는다. [재생]을 누른 뒤에 GET /course/{courseId}/preview 로 받아 온다
 *    (CourseController.preview). 공개 화면의 HTML 에 전체 강의 영상의 직접 주소를 박아 두지 않기 위해서다.
 * 2) 멈출 지점도 서버가 준 값(previewSecond)을 쓴다 — 이 파일에 '60' 같은 값을 적지 않는다.
 *    정책이 바뀌면 고칠 곳이 서버 상수 한 곳이고, 버튼 라벨과 실제로 멈추는 지점이 갈리지 않는다.
 * 3) 재생 엔진은 학습방과 같은 video.js 8.3.0(사내 정적 자산)이고 <b>처음 누를 때 받는다</b>. 콘텐츠가
 *    HLS(.m3u8)일 수 있어 &lt;video src&gt; 만으로는 Safari 를 뺀 브라우저가 재생하지 못하는데, 상세만 보고
 *    나가는 방문자가 대부분이라 558KB 를 첫 로딩에 얹지 않는다(관리자 재생시간 측정 버튼과 같은 방식).
 * 4) 끝나면 플레이어를 dispose 로 걷어낸다. 감추기만 하면 그 안의 &lt;video&gt; 가 살아 있어 버퍼링이 계속되고,
 *    다시 눌렀을 때 앞서 만든 플레이어가 남아 두 번째 재생이 붙지 않는다.
 * 5) 팝업 껍데기는 퍼블 공통 레이어팝업(.layerPop — .open 클래스로 여닫는다)이지만 <b>여닫는 동작은 여기서
 *    직접 한다</b>. 태그 선언형(data-layer-open/close)으로 여는 ui.components.js 는 관리자 자산이라 사용자
 *    사이트가 읽지 않고, 무엇보다 이 팝업은 "열기 = 주소를 받아 와 플레이어를 만든다 / 닫기 = 플레이어를
 *    걷어낸다" 라서 클래스만 토글해서는 안 된다. 여는 조건(.open)은 같아 스타일은 그대로 맞는다.
 */
(function () {
    'use strict';

    var playButton = document.getElementById('preview_play');
    var layer = document.getElementById('preview_layer');
    var playerBox = document.getElementById('preview_player');
    var loadingNote = document.getElementById('preview_note');
    if (!playButton || !layer || !playerBox || !loadingNote) {
        // 미리보기가 없는 과정(편성이 없거나 1차시 영상이 없음)이면 서버가 버튼도 팝업도 그리지 않는다.
        return;
    }

    var PREVIEW_URL = playButton.getAttribute('data-preview-url');
    var PLAYER_SCRIPT_URL = playButton.getAttribute('data-player-src');
    var PLAYER_STYLE_URL = playButton.getAttribute('data-player-css');

    // 학습방(study-room.js)·관리자 재생시간 측정과 같은 값. 같은 CDN 을 같은 조건으로 기다린다.
    var LOAD_TIMEOUT_MILLISECOND = 15000;

    var player = null;          // 현재 살아 있는 video.js 플레이어(팝업이 열려 있는 동안에만 있다)
    var loadTimer = null;       // 영상 로딩 시간 초과 타이머
    var starting = false;       // [재생]을 누른 뒤 팝업이 열리기 전까지(중복 클릭 방지)

    // ──────────────────────────── 안내 ────────────────────────────

    /**
     * 막힌 안내는 화면 가운데 모달로 띄운다(CLAUDE.md '알림 컴포넌트' 규약 — 토스트는 성공 전용이다).
     * common.js 가 defer 라 클릭 시점엔 정의돼 있지만, 없을 때도 사유가 사라지지 않게 alert 로 떨어뜨린다.
     */
    function notify(message) {
        if (typeof window.sstModal === 'function') {
            window.sstModal({ icon: 'warning', title: '확인', text: message });
        } else {
            window.alert(message);
        }
    }

    function logDetail(detail) {
        if (window.console && window.console.error) {
            window.console.error('[course-preview] ' + detail);
        }
    }

    // ──────────────────────────── 재생 엔진 지연 로딩 ────────────────────────────

    var playerScriptLoading = null;

    /** 스타일은 없어도 재생은 된다(컨트롤바 모양만 깨진다) — 실패를 기다리지 않고 한 번만 붙인다. */
    function loadPlayerStyle() {
        if (!PLAYER_STYLE_URL || document.querySelector('link[data-preview-player-style]')) {
            return;
        }
        var style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = PLAYER_STYLE_URL;
        style.setAttribute('data-preview-player-style', '');
        document.head.appendChild(style);
    }

    /**
     * video.js 를 받아 온다. 이미 있으면(학습 흐름에서 먼저 실렸거나 앞서 눌렀으면) 바로 끝난다.
     * 실패하면 진행 중 표시를 지워 <b>다음 클릭에 다시 시도</b>할 수 있게 한다.
     */
    function loadPlayerScript() {
        if (typeof window.videojs === 'function') {
            return Promise.resolve();
        }
        if (playerScriptLoading !== null) {
            return playerScriptLoading;
        }
        playerScriptLoading = new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = PLAYER_SCRIPT_URL;
            script.onload = function () {
                if (typeof window.videojs === 'function') {
                    resolve();
                    return;
                }
                playerScriptLoading = null;
                reject(new Error('재생 모듈을 읽었지만 초기화되지 않았습니다. 새로고침 후 다시 시도해 주세요.'));
            };
            script.onerror = function () {
                playerScriptLoading = null;
                reject(new Error('재생 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'));
            };
            document.head.appendChild(script);
        });
        return playerScriptLoading;
    }

    /** 확장자로 소스 타입을 정한다. HLS(.m3u8)는 명시해야 video.js 가 내장 http-streaming 으로 재생한다(학습방과 같은 규칙). */
    function sourceTypeOf(url) {
        return /\.m3u8(\?|$)/i.test(url) ? 'application/x-mpegURL' : 'video/mp4';
    }

    // ──────────────────────────── 재생 / 초기화 ────────────────────────────

    function clearLoadTimer() {
        if (loadTimer !== null) {
            window.clearTimeout(loadTimer);
            loadTimer = null;
        }
    }

    /**
     * 처음 상태로 되돌린다 — 팝업을 닫고 플레이어를 걷어낸 뒤 썸네일의 [재생]로 포커스를 되돌린다.
     *
     * 정상 종료(미리보기 지점 도달·영상 끝)·닫기(X·바탕·ESC)·실패가 모두 이 한 경로를 쓴다. 복구 절차가
     * 여러 벌로 갈리면 한쪽만 고쳐져 "닫고 나면 다시 열 수 없는" 상태가 생긴다.
     * dispose 는 video.js 가 만든 DOM 까지 함께 걷어내므로 영상 자리를 비우는 것만으로는 대신할 수 없고,
     * <b>팝업을 감추는 것만으로도 대신할 수 없다</b> — 감춘 채 두면 소리가 계속 나고 버퍼링도 이어진다.
     */
    function reset() {
        clearLoadTimer();
        // dispose 는 남은 이벤트를 몇 개 더 흘려보낸다. 참조를 <b>먼저</b> 비워야 그 이벤트가 걷어내는 중인
        // 플레이어를 다시 만지지 않는다(아래 핸들러들이 player 로 자기 차례인지 확인한다).
        var disposing = player;
        player = null;
        if (disposing !== null) {
            try {
                disposing.dispose();
            } catch (e) {
                logDetail('플레이어 정리 실패 — ' + e.message);
            }
        }
        playerBox.innerHTML = '';
        loadingNote.hidden = false;     // 다음에 열 때 다시 "불러오는 중" 부터 시작한다
        layer.classList.remove('open');
        starting = false;
        playButton.disabled = false;
        // 팝업을 닫으면 그 안에 있던 포커스가 body 로 떨어진다. 열기 전 자리(썸네일의 [재생])로 되돌려 줘야
        // 키보드 사용자가 Tab 을 문서 처음부터 다시 누르지 않는다. 이 경로는 모두 그 버튼을 눌러 시작한 흐름이라
        // 되돌려 주는 것이 곧 제자리다(마우스로 눌렀으면 :focus-visible 이 아니라 테두리는 생기지 않는다).
        playButton.focus();
    }

    function failToPlay(message, consoleDetail) {
        reset();
        logDetail(consoleDetail);
        notify(message);
    }

    /**
     * 받아 온 주소로 플레이어를 만들어 재생한다.
     *
     * 이벤트 핸들러를 <b>src() 보다 먼저</b> 건다 — src() 는 미들웨어를 거쳐 소스를 세팅하므로 그 과정에서
     * error 가 먼저 떠 버리면 뒤에 건 핸들러가 그 이벤트를 놓친다(학습방에서 겪은 순서 문제와 같다).
     */
    function openPlayer(previewSource) {
        var video = document.createElement('video');
        video.className = 'video-js';
        video.setAttribute('playsinline', '');      // iOS 에서 전체화면으로 튀지 않게 한다
        // '작게 보기'(PiP)는 <b>들어가는 길이 둘</b>이다 — 컨트롤바 버튼과 브라우저 자체 메뉴(영상 위 오른쪽 클릭).
        // 아래에서 버튼을 꺼도 뒷문이 열려 있으므로 엘리먼트에서도 막는다.
        // video.js 는 이 <video> 를 그대로 품어 초기화하므로 이 설정이 유지된다(실측으로 확인했다).
        video.disablePictureInPicture = true;
        playerBox.appendChild(video);

        var previewPlayer = window.videojs(video, {
            // 미리보기는 짧아도 소리가 함께 나온다 — 음소거·일시정지 수단을 주려고 기본 컨트롤바를 쓴다.
            controls: true,
            autoplay: false,
            preload: 'metadata',    // 곧바로 play() 하므로 앞부분만 받아 두면 된다(학습방과 같은 값)
            fill: true,             // 플레이어가 .preview_stage 를 꽉 채우게 한다(학습방과 같은 이유 — 없으면 300x150 로 박힌다)
            /*
             * 컨트롤바는 <b>재생/정지 · 음량 · 전체화면</b> 만 남긴다. 미리보기는 앞 1분을 맛보는 자리라,
             * 아래 기본 버튼들은 하나같이 '전체 영상' 을 전제로 해 그 안내와 어긋난다.
             *   · progressControl (싱크바)   30분짜리 강의의 길이를 그대로 드러내고, 끌어서 미리보기 구간 밖으로
             *                                나가면 아래 timeupdate 검사에 걸려 플레이어가 통째로 닫힌다
             *                                ("영상이 갑자기 꺼졌다" 로 읽힌다).
             *   · remainingTimeDisplay       "-29:00" 처럼 찍혀 '1분 미리보기' 라는 안내와 정면으로 다르다.
             *   · playbackRateMenuButton     1분을 빨리 감을 이유가 없다. <b>playbackRates 를 [1] 하나로 줘도
             *     (배속)                     video.js 8.3.0 은 버튼을 그대로 그린다</b>(실측) — 목록이 아니라
             *                                버튼 자체를 꺼야 사라지므로, 값 대신 여기서 끈다.
             *   · pictureInPictureToggle     미리보기를 창 밖으로 띄워 붙들고 있을 자리가 아니다.
             *     (작게 보기)                 브라우저 자체 메뉴로도 열리므로 위에서 엘리먼트도 함께 막았다.
             * 현재 시각·전체 길이 표시는 video.js 기본 스킨이 이미 display:none 이라 따로 끄지 않아도 된다.
             */
            controlBar: {
                progressControl: false,
                remainingTimeDisplay: false,
                playbackRateMenuButton: false,
                pictureInPictureToggle: false
            },
            // 싱크바를 없애도 방향키가 열려 있으면 그대로 건너뛴다(학습방과 같은 이유로 함께 막는다).
            userActions: { hotkeys: false }
        });
        player = previewPlayer;

        /**
         * 이 핸들러가 지금 살아 있는 플레이어의 것인가. reset 이 참조를 비운 뒤에도 dispose 과정에서
         * 이벤트가 몇 개 더 흘러나오는데, 그때 걷어내는 중인 플레이어를 다시 만지면 예외가 난다.
         */
        function isCurrent() {
            return player === previewPlayer;
        }

        previewPlayer.one('error', function () {
            if (!isCurrent()) {
                return;
            }
            var mediaError = previewPlayer.error();
            failToPlay('영상을 재생할 수 없습니다. 잠시 후 다시 시도해 주세요.',
                    '미리보기 재생 실패 ' + (mediaError ? mediaError.code + ' ' + mediaError.message : '(사유 없음)'));
        });

        previewPlayer.one('loadedmetadata', function () {
            if (!isCurrent()) {
                return;
            }
            clearLoadTimer();
            starting = false;
            loadingNote.hidden = true;      // 영상이 준비됐다 — 안내를 걷고 그 자리를 플레이어에 넘긴다
            var played = previewPlayer.play();
            // play() 는 브라우저 자동재생 정책에 걸리면 거부된 Promise 를 준다(구형 브라우저는 undefined).
            // 클릭에서 이어지는 자리라 정상적으로는 걸리지 않지만, 거부돼도 조용히 멈추지 않게 사유를 알린다.
            if (played && typeof played.catch === 'function') {
                played.catch(function (error) {
                    if (!isCurrent()) {
                        return;
                    }
                    failToPlay('영상을 재생할 수 없습니다. 브라우저 설정을 확인해 주세요.',
                            '미리보기 재생 거부 — ' + error.message);
                });
            }
        });

        /*
         * 미리보기 구간이 끝나면 되돌린다. 기준값은 서버가 준 previewSecond 다.
         * timeupdate 로 보는 이유는 setTimeout 과 달리 <b>실제 재생 위치</b>를 보기 때문이다 — 일시정지·버퍼링으로
         * 시계와 재생 위치가 어긋나도 "앞에서 정해진 만큼" 만 보여 준다. 싱크바를 그 뒤로 옮겨도 같은 검사에 걸린다.
         */
        previewPlayer.on('timeupdate', function () {
            if (isCurrent() && previewPlayer.currentTime() >= previewSource.previewSecond) {
                reset();
            }
        });

        // 미리보기 구간보다 짧은 영상은 지점에 닿지 못하고 그냥 끝난다 — 그때도 처음 상태로 되돌린다.
        previewPlayer.one('ended', function () {
            if (isCurrent()) {
                reset();
            }
        });

        /*
         * 응답이 끝내 오지 않는 경우(CDN 무응답·CORS 로 멈춤)를 위한 상한. 이게 없으면 error 도 loadedmetadata 도
         * 오지 않아 [재생]이 잠긴 채 아무 일도 일어나지 않고, 콘솔에도 흔적이 남지 않는다(학습방에서 겪은 증상).
         */
        loadTimer = window.setTimeout(function () {
            failToPlay('영상을 불러오는 데 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.',
                    '미리보기 로딩 시간 초과(' + LOAD_TIMEOUT_MILLISECOND + 'ms)');
        }, LOAD_TIMEOUT_MILLISECOND);

        // src 는 ready 안에서 세팅한다(tech 준비가 비동기라 느린 기기에서 준비 전에 떨어질 수 있다).
        // src() 가 로드를 시작하므로 뒤에 load() 를 부르지 않는다 — HLS 에서 소스가 되감긴다(학습방 주석 참고).
        previewPlayer.ready(function () {
            if (!isCurrent()) {
                return;
            }
            previewPlayer.src({ src: previewSource.videoUrl, type: sourceTypeOf(previewSource.videoUrl) });
        });
    }

    // ──────────────────────────── 팝업 여닫기 ────────────────────────────

    /**
     * 팝업 안에서 지금 포커스를 받을 수 있는 것들. 닫기 X 와 플레이어 컨트롤바 버튼들이다.
     * video.js 는 자막·챕터처럼 쓰지 않는 버튼도 만들어 두고 감추므로(display:none) 보이는 것만 고른다 —
     * 안 그러면 Tab 이 보이지 않는 버튼에 멈춰 "눌러도 아무 일이 없는" 자리가 생긴다.
     */
    function focusablesInLayer() {
        var candidates = layer.querySelectorAll(
                'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        var focusables = [];
        for (var index = 0; index < candidates.length; index++) {
            if (candidates[index].offsetParent !== null) {
                focusables.push(candidates[index]);
            }
        }
        return focusables;
    }

    /**
     * 팝업을 연다. <b>영상을 받아 오기 전에</b> 먼저 연다 — 엔진(558KB)을 처음 받는 클릭은 눈에 띄게 걸리는데,
     * 그동안 화면에 아무 변화가 없으면 학습자는 버튼이 안 먹은 줄 알고 다시 누른다.
     * 팝업이 먼저 뜨고 그 안에서 "불러오는 중" 이 보이면 무엇을 기다리는지가 드러난다(학습방 덮개와 같은 방식).
     */
    function openLayer() {
        loadingNote.hidden = false;
        layer.classList.add('open');
        // 연 뒤 포커스를 팝업 안으로 옮긴다 — 그래야 ESC·Tab 이 팝업의 것으로 동작한다.
        var focusables = focusablesInLayer();
        if (focusables.length > 0) {
            focusables[0].focus();
        }
    }

    // 닫는 길은 공통 레이어팝업과 같은 셋이다 — 우상단 X(.layerClose) · [data-layer-close] · 바탕(어두운 부분) 클릭.
    // 닫기는 곧 초기화다(reset 이 플레이어까지 걷어낸다) — 감추기만 하면 소리가 계속 난다.
    layer.addEventListener('click', function (event) {
        if (event.target.closest('[data-layer-close], .layerClose') || !event.target.closest('.layerItem')) {
            reset();
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && layer.classList.contains('open')) {
            reset();
        }
    });

    // Tab 이 팝업 밖(뒤에 깔린 화면)으로 새지 않게 첫·끝에서 되감는다. 공통 컴포넌트에는 아직 없는 처리라
    // 여기서 이 팝업에만 건다 — 영상 위에 딤이 덮여 있는데 포커스만 뒤로 빠지면 어디에 있는지 알 수 없다.
    layer.addEventListener('keydown', function (event) {
        if (event.key !== 'Tab') {
            return;
        }
        var focusables = focusablesInLayer();
        if (focusables.length === 0) {
            return;
        }
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    // ──────────────────────────── [재생] ────────────────────────────

    playButton.addEventListener('click', function () {
        if (starting || player !== null) {
            return;     // 이미 여는 중이거나 재생 중이다
        }
        starting = true;
        playButton.disabled = true;
        openLayer();

        loadPlayerStyle();

        // 주소를 먼저 받고(서버가 재생 자격·대상을 정한다) 엔진을 함께 받는다 — 둘 다 준비돼야 열 수 있어 같이 기다린다.
        Promise.all([
            fetch(PREVIEW_URL, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
                .then(function (response) {
                    // 업무규칙 위반(편성이 바뀌어 재생할 영상이 없음 등)도 ApiResponse JSON 이라 message 를 그대로 쓴다.
                    return response.json().then(function (body) {
                        // 멈출 지점이 비어 오면 아래 timeupdate 검사가 재생하자마자 걸려(0 이상) 영상이 뜨자마자 닫힌다 —
                        // 값이 온전할 때만 연다(응답이 JSON 이 아닌 경우는 아래 실패 콜백이 받는다).
                        if (!response.ok || !body.success || !body.data
                                || !body.data.videoUrl || !(body.data.previewSecond > 0)) {
                            throw new Error(body.message || '미리보기를 불러오지 못했습니다.');
                        }
                        return body.data;
                    }, function () {
                        throw new Error('미리보기를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
                    });
                }),
            loadPlayerScript()
        ])
            .then(function (loaded) {
                openPlayer(loaded[0]);
            })
            .catch(function (error) {
                reset();
                logDetail('미리보기를 열지 못했습니다 — ' + error.message);
                notify(error.message);
            });
    });
})();
