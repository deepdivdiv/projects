// HEADER
document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('header');
    if (!header) return;

    // 접기는 이 지점 아래로 내려간 뒤부터만 동작한다.
    const SHRINK_FROM = 500;
    // 이 지점 위로 올라오면 방향과 상관없이 항상 펼친다.
    const EXPAND_AT = 200;
    // 손떨림 수준의 미세한 움직임은 방향 판정에서 무시한다.
    const DELTA = 5;
    // 접힘/펼침 css transition(300ms) 이 끝나고 문서 높이가 멈출 때까지의 여유.
    // css 의 transition 시간을 바꾸면 이 값도 같이 올려야 한다.
    const SETTLE_MS = 400;
    // 포커스가 옮겨가며 생기는 스크롤은 한 번에 끝나므로 짧게만 잠근다.
    const FOCUS_SETTLE_MS = 150;

    let lastY = window.scrollY;
    let ticking = false;
    let locked = false;
    let settleTimer = 0;

    // 사용자가 굴린 것이 아닌 스크롤(레이아웃 변화·포커스 이동)이 방향 판정에 섞이지 않게
    // 잠시 판정을 멈추고, 움직임이 멎은 뒤 기준점을 다시 잡는다.
    const holdUntilSettled = (ms) => {
        locked = true;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
            lastY = window.scrollY;
            locked = false;
            // 잠긴 동안 지나친 위치를 한 번 반영한다(맨 위로 올라와 있으면 펼친다).
            updateHeader();
        }, ms);
    };

    // header 가 sticky 라 접히는 순간 문서 높이가 14rem 줄고, 그만큼 스크롤이 밀린다.
    // 그 움직임이 '반대 방향 스크롤'로 잡히면 접힘/펼침이 무한히 반복되므로,
    // 클래스가 바뀐 뒤 레이아웃이 완전히 멈출 때까지 판정을 멈추고 기준점을 다시 잡는다.
    // (topMenu/cenBar 의 height 가 300ms 에 걸쳐 줄어드는 동안 문서 높이가 계속 변한다.
    //  예전처럼 rAF 두 번(약 32ms)만 잠그면 애니메이션 도중에 잠금이 풀려 다시 튄다.)
    const setScrolled = (on) => {
        if (header.classList.contains('scrolled') === on) {
            if (!locked) lastY = window.scrollY;
            return;
        }

        header.classList.toggle('scrolled', on);
        holdUntilSettled(SETTLE_MS);
    };

    const updateHeader = () => {
        ticking = false;
        // 잠긴 동안 들어오는 스크롤은 대부분 레이아웃 변화가 만든 것이라 방향 판정에 쓰지 않는다.
        if (locked) return;

        const y = window.scrollY;
        const diff = y - lastY;

        if (y <= EXPAND_AT) {
            setScrolled(false);
            return;
        }

        if (Math.abs(diff) < DELTA) return;

        if (diff > 0) {
            // 아래로: SHRINK_FROM 을 지난 뒤부터 접는다.
            if (y >= SHRINK_FROM) setScrolled(true);
        } else {
            // 위로: 위치와 상관없이 바로 펼친다.
            setScrolled(false);
        }
        lastY = y;
    };

    // scroll 은 프레임당 여러 번 들어오므로 rAF 로 한 번만 처리한다.
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(updateHeader);
    }, { passive: true });

    // 창 크기가 바뀌면 헤더 높이도 달라지므로 기준점만 다시 잡는다.
    window.addEventListener('resize', () => { if (!locked) lastY = window.scrollY; }, { passive: true });

    // 인풋·라벨로 포커스가 옮겨갈 때 브라우저가 그 요소를 보이게 하려고 스크롤을 움직인다.
    // 그건 사용자가 굴린 스크롤이 아니라 방향 판정에 쓰면 안 된다 — 회원가입 폼처럼 입력칸이
    // 많은 화면에서 칸을 옮길 때마다 접혀 있던 header 가 도로 펼쳐져 topMenu/cenBar 가 튀어나온다.
    document.addEventListener('focusin', () => holdUntilSettled(FOCUS_SETTLE_MS));

    // 새로고침 시 이미 스크롤이 내려가 있는 경우
    updateHeader();
});




    // 헤더 검색 (bt-search 클릭 → search-area 열고 닫기)
    document.querySelectorAll('.search-area').forEach(area => {
        const btSearch = area.querySelector('.bt-search');
        const input = area.querySelector('input');
        if (!btSearch) return;

        btSearch.setAttribute('aria-expanded', 'false');
        btSearch.addEventListener('click', () => {
            const opened = area.classList.toggle('active');
            btSearch.setAttribute('aria-expanded', String(opened));
            // 인풋은 닫힌 상태에서 visibility:hidden 이라 열린 뒤에만 포커스가 먹는다.
            if (opened) input?.focus();
        });
    });

    // 검색 영역 바깥 클릭 시 닫기
    document.addEventListener('click', (e) => {
        if (e.target.closest('.search-area')) return;
        document.querySelectorAll('.search-area.active').forEach(area => {
            area.classList.remove('active');
            area.querySelector('.bt-search')?.setAttribute('aria-expanded', 'false');
        });
    });


    // 모바일 메뉴 (bt-menu 클릭 → gnbArea 열고 닫기)
    const btMenu = document.getElementById('bt-menu');
    const gnbArea = document.querySelector('.gnbArea');
    if (btMenu && gnbArea) {
        const gnbInner = gnbArea.querySelector('.gnbInner') || gnbArea;
        // 패널 안에서 실제로 포커스를 받을 수 있는 요소들.
        // 닫힌 상태의 gnbArea 는 visibility:hidden 이라 포커스 자체가 안 먹으므로
        // 열고 난 뒤에 다시 훑어야 한다. (열림/닫힘 시점마다 새로 계산)
        const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
        const focusables = () => [...gnbInner.querySelectorAll(FOCUSABLE)]
            // 접힌 depth2 는 inert 라 실제로 포커스가 안 가므로 Tab 순환 계산에서도 빼야 한다.
            // (height:0 으로 접혀도 박스는 남아 있어서 크기 검사만으로는 걸러지지 않는다)
            .filter(el => !el.closest('[inert]'))
            .filter(el => el.offsetWidth || el.offsetHeight || el.getClientRects().length);

        // gnbArea 는 visibility:hidden 상태에서 transition 이 걸려 있어서,
        // active 를 붙인 직후에도 몇 프레임 동안은 computed visibility 가 hidden 이다.
        // 그 사이의 focus() 는 조용히 무시되므로 포커스가 들어갈 때까지 몇 번 다시 시도한다.
        const focusInto = (tries = 10) => {
            const target = focusables()[0];
            if (!target) return;

            target.focus();
            if (document.activeElement === target || tries <= 0) return;
            requestAnimationFrame(() => focusInto(tries - 1));
        };

        const setGnb = (opened) => {
            gnbArea.classList.toggle('active', opened);
            btMenu.classList.toggle('active', opened);
            btMenu.setAttribute('aria-expanded', String(opened));

            if (opened) {
                // 열자마자 패널 첫 요소(로그인/사용자 영역)로 포커스를 넘긴다.
                focusInto();
            } else if (gnbArea.contains(document.activeElement)) {
                // 닫을 때 포커스가 패널 안에 남아 있으면 갈 곳을 잃으므로 버튼으로 되돌린다.
                btMenu.focus();
            }
        };

        btMenu.setAttribute('aria-expanded', 'false');
        btMenu.addEventListener('click', () => {
            setGnb(!gnbArea.classList.contains('active'));
        });

        // Esc 로 닫기. 포커스가 패널 안이든 밖이든 열려 있으면 닫는다.
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !gnbArea.classList.contains('active')) return;
            e.preventDefault();
            setGnb(false);
        });

        // 열려 있는 동안 Tab 을 패널 안에 가둔다. gnbArea 가 아니라 document 에 거는 이유는,
        // 포커스가 아직 패널 밖(전체메뉴 버튼 등)에 있을 때도 Tab 을 받아 패널로 끌어와야 하기 때문이다.
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab' || !gnbArea.classList.contains('active')) return;
            const list = focusables();
            if (!list.length) return;

            const first = list[0];
            const last = list[list.length - 1];

            // 패널 밖에 있으면 진행 방향에 맞춰 패널 처음/끝으로 넣는다.
            if (!gnbArea.contains(document.activeElement)) {
                e.preventDefault();
                (e.shiftKey ? last : first).focus();
                return;
            }

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });

        // 딤 영역(gnbInner 바깥) 클릭 시 닫기
        gnbArea.addEventListener('click', (e) => {
            if (!e.target.closest('.gnbInner')) {
                setGnb(false);
            }
        });

        // 닫기 버튼
        gnbArea.querySelector('.gnbClose')?.addEventListener('click', () => setGnb(false));
    }


    // 모바일 메뉴 하위 depth2 (a 클릭 → 링크 이동 대신 슬라이드다운, 한 번에 하나만 열림)
    const gnbItems = document.querySelectorAll('.gnbMenu .depth1 > li');
    gnbItems.forEach(li => {
        const link = li.querySelector(':scope > a');
        const depth2 = li.querySelector(':scope > .depth2');
        // 하위메뉴가 없는 항목은 손대지 않고 링크 그대로 둔다.
        if (!link || !depth2) return;

        link.setAttribute('aria-expanded', 'false');
        // 접힌 depth2 는 height:0 / overflow:hidden 으로만 감춰져 있다.
        // 이건 시각적으로만 안 보이는 것이라 Tab 은 그대로 들어가므로,
        // inert 로 포커스·클릭·접근성 트리에서 함께 빼둔다. (열릴 때 해제)
        depth2.inert = true;
        link.addEventListener('click', (e) => {
            // pointer-events:none 은 마우스만 막고 키보드 Enter 는 그대로 이동시키므로
            // 여기서 preventDefault 로 막는다.
            e.preventDefault();
            const opened = !li.classList.contains('open');

            // 다른 메뉴는 모두 닫는다. aria-expanded 는 하위메뉴가 있는 a 에만 붙어 있다.
            gnbItems.forEach(other => {
                other.classList.remove('open');
                other.querySelector(':scope > a[aria-expanded]')?.setAttribute('aria-expanded', 'false');
                const otherDepth2 = other.querySelector(':scope > .depth2');
                if (otherDepth2) otherDepth2.inert = true;
            });

            li.classList.toggle('open', opened);
            link.setAttribute('aria-expanded', String(opened));
            depth2.inert = !opened;
        });
    });


    // 맨 위로 (footer .topBtn) — 클릭하면 문서 최상단으로 부드럽게 올린다.
    // header 의 접힘 판정은 위로 스크롤되는 동안 스스로 '펼침'으로 돌아오므로 여기서 따로 건드리지 않는다.
    document.querySelectorAll('.topBtn').forEach(topBtn => {
        topBtn.addEventListener('click', () => {
            // 운영체제에서 '동작 줄이기'를 켠 사용자에게는 애니메이션 없이 즉시 올린다.
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        });
    });


    // 권역별 전문기관 (footer .val-zone) — 권역 select 를 고르면 그 option 의 data-tel 을 전화번호 링크에 보여 준다.
    // 번호가 option 에 붙어 있어 목록이 고정이든 DB(공통코드 ACTIVITY_AREA)에서 오든 이 코드는 그대로다.
    const footerZone = document.getElementById('footerZone');
    const footerZoneTel = document.getElementById('footerZoneTel');
    if (footerZone && footerZoneTel) {
        const showZoneTel = () => {
            const tel = footerZone.selectedOptions[0]?.dataset.tel || '';
            footerZoneTel.textContent = tel;
            // tel: 링크는 숫자·하이픈만 남긴다(표기에 공백이 섞여도 전화 앱이 그대로 받게).
            footerZoneTel.href = tel ? 'tel:' + tel.replace(/[^\d+-]/g, '') : '#';
        };
        footerZone.addEventListener('change', showZoneTel);
        // 뒤로가기 등으로 브라우저가 select 값을 복원한 경우에도 번호가 맞도록 처음에 한 번 맞춘다.
        showZoneTel();
    }


// MAIN POPUP — #popupZone 안의 팝업. 닫기(X)로 지우고, '오늘 하루 보지않음'을 켠 채 닫으면 자정까지 다시 띄우지 않는다.
document.addEventListener('DOMContentLoaded', () => {
    const popupZone = document.getElementById('popupZone');
    if (!popupZone) return;

    const HIDE_KEY_PREFIX = 'popupHideUntil:';

    // localStorage 를 막아 둔 브라우저(사생활 보호 모드 등)에서도 닫기 자체는 동작해야 하므로 감싼다.
    const readHideUntil = (popupKey) => {
        try {
            return Number(window.localStorage.getItem(HIDE_KEY_PREFIX + popupKey)) || 0;
        } catch (e) {
            return 0;
        }
    };
    const writeHideUntil = (popupKey, hideUntil) => {
        try {
            window.localStorage.setItem(HIDE_KEY_PREFIX + popupKey, String(hideUntil));
        } catch (e) {
            // 저장하지 못해도 닫기는 그대로 진행한다.
        }
    };

    // 팝업이 하나도 남지 않으면 존까지 걷어낸다(fixed 라 빈 채로 두면 위에 떠 있는 상태가 된다).
    const removeEmptyZone = () => {
        if (!popupZone.querySelector('.popupArea')) popupZone.remove();
    };

    popupZone.querySelectorAll('.popupArea').forEach(popupArea => {
        const popupKey = popupArea.dataset.popupKey || '';

        // 하루 숨김이 아직 살아 있으면 띄우지 않는다.
        if (popupKey && readHideUntil(popupKey) > Date.now()) {
            popupArea.remove();
            return;
        }

        // Show only after checking the saved dismissal to avoid a flash on reload.
        popupArea.style.removeProperty('display');

        const closeButton = popupArea.querySelector('.popupClose');
        if (!closeButton) return;

        closeButton.addEventListener('click', () => {
            const hideTodayCheck = popupArea.querySelector('input[name="popupHideToday"]');
            if (popupKey && hideTodayCheck && hideTodayCheck.checked) {
                // '오늘 하루' 는 24시간이 아니라 오늘 자정까지로 본다.
                const midnight = new Date();
                midnight.setHours(24, 0, 0, 0);
                writeHideUntil(popupKey, midnight.getTime());
            }
            popupArea.remove();
            removeEmptyZone();
        });
    });

    removeEmptyZone();
});
