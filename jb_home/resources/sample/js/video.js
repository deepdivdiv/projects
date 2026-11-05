// 학습 영상 뷰(video_view) 전용 — 오른쪽 사이드바 패널 전환
//
// header 의 메뉴(li[data-panel])와 .videoAside 의 패널(.as_panel[data-panel])이 값으로 짝지어진다.
// 마크업에서 짝만 맞춰 두면 항목이 늘거나 순서가 바뀌어도 이 파일은 고칠 필요가 없다.
document.addEventListener('DOMContentLoaded', () => {
    const aside = document.querySelector('.videoAside');
    if (!aside) return;

    const menuItems = document.querySelectorAll('#videoWrap header [data-panel]');
    const panels = aside.querySelectorAll('.as_panel[data-panel]');

    // 접기는 aside 의 is-hide 로만 표현하고, 어떤 패널을 보고 있었는지(.is-on)는 건드리지 않는다.
    // 그래야 X 로 닫았다가 같은 메뉴를 다시 눌렀을 때 보던 패널이 그대로 열린다.
    const closeAside = () => {
        aside.classList.add('is-hide');
        menuItems.forEach((menuItem) => menuItem.classList.remove('active'));
    };

    const openPanel = (panelName) => {
        panels.forEach((panel) => panel.classList.toggle('is-on', panel.dataset.panel === panelName));
        menuItems.forEach((menuItem) => menuItem.classList.toggle('active', menuItem.dataset.panel === panelName));
        aside.classList.remove('is-hide');
    };

    menuItems.forEach((menuItem) => {
        menuItem.addEventListener('click', () => {
            // 열려 있는 패널의 메뉴를 다시 누르면 닫는다(토글).
            // 닫는 방법이 .as_close 하나뿐이면 방금 누른 자리에서 되돌릴 수 없다.
            if (menuItem.classList.contains('active')) {
                closeAside();
                return;
            }
            openPanel(menuItem.dataset.panel);
        });
    });

    aside.querySelectorAll('.as_close').forEach((closeButton) => {
        closeButton.addEventListener('click', closeAside);
    });

    // 파일 인풋은 디자인 시스템이 숨겨 둬서(_forms.scss) 클릭을 받을 수 없다.
    // 버튼이 대신 열고, 고른 파일 이름만 같은 .flexBox 안 읽기전용 칸에 보여 준다.
    aside.querySelectorAll('[data-file-pick]').forEach((pickButton) => {
        const fileInput = document.getElementById(pickButton.dataset.filePick);
        const fileName = pickButton.closest('.flexBox').querySelector('.fileName');
        if (!fileInput) return;

        pickButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            const picked = fileInput.files[0];
            fileName.value = picked ? picked.name : '';
        });
    });

    // 패널 안 뷰 전환(학습질문의 목록 ↔ 질문 작성).
    // [data-view-go] 를 누르면 같은 패널의 [data-view] 중 값이 같은 것만 켠다.
    aside.querySelectorAll('[data-view-go]').forEach((viewButton) => {
        viewButton.addEventListener('click', () => {
            const views = viewButton.closest('.as_panel').querySelectorAll('.as_view[data-view]');
            views.forEach((view) => view.classList.toggle('is-on', view.dataset.view === viewButton.dataset.viewGo));
        });
    });

    // 밑줄 탭(.tab-*.ud) — 공통 css 는 .on 만 정의하고 전환은 화면 몫이다.
    // 탭의 data-filter 와 아코디언 details 의 data-state 가 짝이고, all 은 전부 보여 준다.
    aside.querySelectorAll('.as_tab').forEach((tabArea) => {
        const tabs = tabArea.querySelectorAll('[data-filter]');
        const panel = tabArea.closest('.as_panel');
        const questions = panel.querySelectorAll('details[data-state]');
        const emptyMessage = panel.querySelector('.qna_none');

        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                tabs.forEach((el) => el.classList.remove('on'));
                tab.classList.add('on');

                const filter = tab.dataset.filter;
                let shownCount = 0;
                questions.forEach((question) => {
                    const shown = filter === 'all' || question.dataset.state === filter;
                    question.hidden = !shown;
                    // 걸러진 항목이 열린 채로 남아 있으면 다시 보일 때 펼쳐진 상태로 나온다.
                    if (!shown) question.open = false;
                    if (shown) shownCount += 1;
                });
                if (emptyMessage) emptyMessage.hidden = shownCount > 0;
            });
        });
    });

    // 좁은 화면(_video.scss 의 res-laptop)에서는 사이드가 본문 위를 덮는 시트라 처음부터 닫혀 있어야 한다.
    // 마크업에는 is-hide 가 없으므로(넓은 화면 기본값이 열림) 화면 폭을 보고 여기서 붙인다.
    const mobileQuery = window.matchMedia('(max-width: 1024px)');

    const syncAsideToViewport = () => {
        if (mobileQuery.matches) {
            closeAside();
            return;
        }
        // 넓어지면 보고 있던 패널(.is-on)을 그대로 다시 연다.
        const openedPanel = aside.querySelector('.as_panel.is-on');
        if (openedPanel) openPanel(openedPanel.dataset.panel);
        else aside.classList.remove('is-hide');
    };

    syncAsideToViewport();
    mobileQuery.addEventListener('change', syncAsideToViewport);
});

// 학습 영상 뷰(video_view) 전용 — 커스텀 재생 컨트롤바
//
// 브라우저 기본 컨트롤(controls) 대신 .videoControlBar 마크업을 직접 움직인다.
// 요소는 모두 .videoArea 안에서만 찾으므로 마크업의 id 에 기대지 않는다.
document.addEventListener('DOMContentLoaded', () => {
    const playerArea = document.querySelector('.videoArea');
    if (!playerArea) return;

    const video = playerArea.querySelector('video');
    const controlBar = playerArea.querySelector('.videoControlBar');
    if (!video || !controlBar) return;

    const playButton = controlBar.querySelector('.ctr-play');
    const pauseButton = controlBar.querySelector('.ctr-pause');
    const seekGauge = controlBar.querySelector('.set-seekBar .mov-gauge');
    const seekHere = controlBar.querySelector('.mov-here');
    const soundArea = controlBar.querySelector('.set-sound');
    const volumeButton = controlBar.querySelector('.ctr-volume');
    const volumeGauge = controlBar.querySelector('.vol-gauge');
    const volumeHere = controlBar.querySelector('.vol-here');
    const nowTime = controlBar.querySelector('.now-time');
    const totalTime = controlBar.querySelector('.total-time');
    const fullscreenButton = controlBar.querySelector('.ctr-fullscreen');

    // 한 시간이 넘는 영상에서만 시(hh) 자리를 쓴다 — 짧은 영상은 00:00 이 읽기 편하다.
    const formatTime = (seconds) => {
        if (!Number.isFinite(seconds)) return '00:00';
        const pad = (value) => String(value).padStart(2, '0');
        const total = Math.floor(seconds);
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const rest = total % 60;
        return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
    };

    // 게이지(재생 위치·음량) 공통 — 누른 지점의 가로 비율(0~1)을 넘겨주고, 끌기도 같은 방식으로 받는다.
    // 포인터를 게이지에 묶어 두면(setPointerCapture) 막대 밖으로 끌어도 이동이 끊기지 않는다.
    const dragGauge = (gaugeArea, applyRatio) => {
        const ratioOf = (event) => {
            const bounds = gaugeArea.getBoundingClientRect();
            const ratio = (event.clientX - bounds.left) / bounds.width;
            return Math.min(Math.max(ratio, 0), 1);
        };

        gaugeArea.addEventListener('pointerdown', (event) => {
            gaugeArea.setPointerCapture(event.pointerId);
            applyRatio(ratioOf(event));
        });
        gaugeArea.addEventListener('pointermove', (event) => {
            if (!gaugeArea.hasPointerCapture(event.pointerId)) return;
            applyRatio(ratioOf(event));
        });
        gaugeArea.addEventListener('pointerup', (event) => gaugeArea.releasePointerCapture(event.pointerId));
    };

    /* 컨트롤바 감추기 — 재생 중 조작이 없을 때만 감춘다(멈춘 화면에서 컨트롤이 사라지면 어디를 눌러야 할지 모른다) */
    const idleDelay = 2500;
    let idleTimer = null;

    const showControlBar = () => {
        window.clearTimeout(idleTimer);
        controlBar.classList.remove('is-hide');
        playerArea.style.cursor = '';
    };

    const restartIdleTimer = () => {
        showControlBar();
        if (video.paused) return;
        idleTimer = window.setTimeout(() => {
            controlBar.classList.add('is-hide');
            playerArea.style.cursor = 'none'; // 컨트롤이 사라졌는데 커서만 남으면 영상 위에 떠 보인다
            volumeGauge.classList.remove('on');
        }, idleDelay);
    };

    playerArea.addEventListener('pointermove', restartIdleTimer);
    playerArea.addEventListener('pointerleave', () => { if (!video.paused) restartIdleTimer(); });

    /* 재생 / 일시정지 — 두 버튼은 한 자리에 겹쳐 있고 지금 쓸 것에만 on 을 남긴다 */
    const syncPlayButton = () => {
        playButton.classList.toggle('on', video.paused);
        pauseButton.classList.toggle('on', !video.paused);
    };

    const togglePlay = () => {
        if (video.paused) video.play();
        else video.pause();
    };

    playButton.addEventListener('click', togglePlay);
    pauseButton.addEventListener('click', togglePlay);
    video.addEventListener('click', togglePlay); // 화면을 눌러도 멈춘다(기본 컨트롤과 같은 감각)
    video.addEventListener('play', () => { syncPlayButton(); restartIdleTimer(); });
    video.addEventListener('pause', () => { syncPlayButton(); showControlBar(); });
    video.addEventListener('ended', () => { syncPlayButton(); showControlBar(); });

    /* 재생 위치 */
    const syncSeek = () => {
        const playedRate = Number.isFinite(video.duration) && video.duration > 0
            ? (video.currentTime / video.duration) * 100
            : 0;
        seekHere.style.width = `${playedRate}%`;
        nowTime.textContent = formatTime(video.currentTime);
    };

    const syncDuration = () => {
        totalTime.textContent = formatTime(video.duration);
        syncSeek();
    };

    video.addEventListener('timeupdate', syncSeek);
    video.addEventListener('loadedmetadata', syncDuration);
    // 스트리밍이라 길이를 늦게 알 수도 있다(loadedmetadata 때는 Infinity).
    video.addEventListener('durationchange', syncDuration);

    dragGauge(seekGauge, (ratio) => {
        if (!Number.isFinite(video.duration)) return;
        video.currentTime = video.duration * ratio;
        syncSeek();
    });

    /* 음량 — 버튼으로 조절바를 열고 닫는다. 0 이 되면 버튼이 음소거 아이콘으로 바뀐다. */
    const syncVolume = () => {
        const level = video.muted ? 0 : video.volume;
        volumeHere.style.width = `${level * 100}%`;
        volumeButton.classList.toggle('ctr-mute', level === 0);
    };

    volumeButton.addEventListener('click', () => volumeGauge.classList.toggle('on'));
    dragGauge(volumeGauge, (ratio) => {
        video.muted = false; // 끌어서 소리를 올리면 음소거는 저절로 풀린다
        video.volume = ratio;
    });
    video.addEventListener('volumechange', syncVolume);

    // 조절바 밖을 누르면 닫는다 — 열어 둔 채로 두면 타이머·전체화면 버튼을 가린다.
    document.addEventListener('pointerdown', (event) => {
        if (soundArea.contains(event.target)) return;
        volumeGauge.classList.remove('on');
    });

    /* 전체화면 — <video> 가 아니라 .videoArea 를 띄워야 우리 컨트롤바가 영상 위에 남는다 */
    fullscreenButton.addEventListener('click', () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
            return;
        }
        if (playerArea.requestFullscreen) {
            // 거부(사용자 제스처 없음 등)돼도 콘솔 오류만 남기고 화면은 그대로 두면 된다.
            playerArea.requestFullscreen().catch(() => {});
            return;
        }
        // iOS Safari 는 요소 전체화면을 지원하지 않아 영상만 띄운다(이때는 기본 컨트롤이 나온다).
        if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    });

    document.addEventListener('fullscreenchange', () => {
        playerArea.classList.toggle('is-full', document.fullscreenElement === playerArea);
    });

    // 스크립트가 defer 라 여기 올 때 이미 메타데이터가 읽혀 있을 수 있다 — 이벤트만 기다리면 00:00 이 남는다.
    syncPlayButton();
    syncVolume();
    syncDuration();
});
