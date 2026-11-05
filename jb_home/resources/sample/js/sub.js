// 서브페이지 공통 스크립트.
// fragments/sample/layout/resource 가 main 이 아닌 모든 페이지에서 읽는다.
//
// 지금 다루는 것: 좌측 메뉴(LNB) 오프캔버스 패널.
//   1024px 이하에서 aside 가 화면 왼쪽에서 밀려 들어오는 패널이 되고(pages/_sub.scss),
//   .bt-lnb[aria-controls] 버튼이 그 토글이다. 여는 방식·클래스(.active)는 헤더 전체메뉴
//   (layout.js 의 gnbArea)와 같은 규약을 쓴다 — 마크업만 lnbArea/lnbInner/lnbClose 로 다르다.
document.addEventListener('DOMContentLoaded', () => {

    // css 의 res-laptop(1024px) 과 같은 기준. 여기를 바꾸면 _sub.scss 의 중단점도 함께 바꾼다.
    const PANEL_MEDIA = window.matchMedia('(max-width: 1024px)');
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

    document.querySelectorAll('.bt-lnb[aria-controls]').forEach(button => {
        const panel = document.getElementById(button.getAttribute('aria-controls'));
        if (!panel) return;

        const inner = panel.querySelector('.lnbInner') || panel;
        // 닫힌 패널은 visibility:hidden 이라 포커스를 못 받는다 — 열린 뒤에 다시 훑는다.
        const focusables = () => [...inner.querySelectorAll(FOCUSABLE)]
            .filter(el => el.offsetWidth || el.offsetHeight || el.getClientRects().length);

        const isOpened = () => panel.classList.contains('active');

        const setPanel = (opened) => {
            panel.classList.toggle('active', opened);
            button.setAttribute('aria-expanded', String(opened));
            // 패널 뒤 본문이 같이 스크롤되면 어디를 보고 있었는지 잃는다.
            document.body.style.overflow = opened ? 'hidden' : '';

            if (opened) {
                focusables()[0]?.focus();
            } else if (panel.contains(document.activeElement)) {
                // 닫을 때 포커스가 패널 안에 남으면 갈 곳을 잃으므로 버튼으로 되돌린다.
                button.focus();
            }
        };

        button.setAttribute('aria-expanded', 'false');
        button.addEventListener('click', () => setPanel(!isOpened()));

        // 딤(패널 바깥) 클릭
        panel.addEventListener('click', (e) => {
            if (!e.target.closest('.lnbInner')) setPanel(false);
        });

        // 닫기 버튼
        inner.querySelector('.lnbClose')?.addEventListener('click', () => setPanel(false));

        // 메뉴를 고르면 이동 전에 닫아 둔다(같은 페이지 앵커일 때 패널이 남지 않게).
        inner.querySelectorAll('.my_lnb a').forEach(link => {
            link.addEventListener('click', () => setPanel(false));
        });

        // Esc 로 닫기. 포커스가 패널 안이든 밖이든 열려 있으면 닫는다.
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !isOpened()) return;
            e.preventDefault();
            setPanel(false);
        });

        // 열려 있는 동안 Tab 을 패널 안에 가둔다.
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab' || !isOpened()) return;

            const list = focusables();
            if (!list.length) return;

            const first = list[0];
            const last = list[list.length - 1];

            // 포커스가 아직 패널 밖(열기 버튼 등)에 있으면 진행 방향에 맞춰 끌어온다.
            if (!panel.contains(document.activeElement)) {
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

        // PC 폭으로 넓어지면 패널이 아니라 그냥 사이드바다 —
        // 열린 상태로 남으면 body 스크롤 잠금까지 함께 남으므로 정리한다.
        PANEL_MEDIA.addEventListener('change', (e) => {
            if (!e.matches && isOpened()) setPanel(false);
        });
    });


    // 탭 — li[data-tab] 값과 같은 id 를 가진 패널만 남기고 나머지는 감춘다.
    // 감춘 패널은 hidden 속성이라 포커스·접근성 트리에서도 함께 빠진다.
    document.querySelectorAll('.tab-l:has(li[data-tab])').forEach(tab => {
        const items = [...tab.querySelectorAll('li[data-tab]')];
        const panels = [];
        for (const item of items) {
            const panel = document.getElementById(item.dataset.tab);
            if (panel) panels.push(panel);
        }

        const select = (target) => {
            for (const item of items) {
                const on = item === target;
                item.classList.toggle('on', on);
                const panel = document.getElementById(item.dataset.tab);
                if (panel) panel.hidden = !on;
            }
        };

        for (const item of items) {
            item.addEventListener('click', (e) => {
                // 앵커(#패널id)라 기본 이동은 막고 화면 전환만 한다.
                e.preventDefault();
                select(item);
            });
        }
    });


    // 비밀번호 보임/숨김 — [data-pw-toggle="입력칸 id"] 단추가 그 칸의 type 을 오간다.
    // 상태는 aria-pressed 하나로만 표시한다(_sub.scss 가 그 값으로 아이콘 색을 바꾼다).
    document.querySelectorAll('[data-pw-toggle]').forEach(button => {
        const field = document.getElementById(button.dataset.pwToggle);
        if (!field) return;

        button.addEventListener('click', () => {
            const shown = field.type === 'text';
            field.type = shown ? 'password' : 'text';
            button.setAttribute('aria-pressed', String(!shown));
            // 글자를 지우지 않고 커서만 끝으로 돌려놓는다(type 을 바꾸면 포커스가 풀린다).
            field.focus();
            field.setSelectionRange(field.value.length, field.value.length);
        });
    });
});
