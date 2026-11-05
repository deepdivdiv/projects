/*
  개인정보처리방침·이용약관(views/sample/policy.html, terms.html) 공통 스크립트.

  1) sticky 헤더 높이를 재서 .sub_policy 의 --header-h 에 넣는다.
     목차(.policy_nav)의 sticky top 과 절(.policy_sec)의 scroll-margin-top 이 이 값을 쓰므로,
     PC/모바일 헤더 높이 차이를 css 가 따로 알 필요가 없다. 헤더는 layout.js 가 스크롤 방향에 따라
     접었다 펴므로(높이가 300ms 에 걸쳐 변한다) 한 번 재고 끝내지 않고 ResizeObserver 로 따라간다.
  2) 스크롤 위치에 맞춰 목차의 현재 절(.on)을 옮긴다. 1024px 이하에서 목차가 가로 칩 줄이 되면
     현재 칩이 보이도록 줄만 옆으로 밀어 준다(페이지는 움직이지 않는다).
*/
document.addEventListener('DOMContentLoaded', () => {
    const page = document.querySelector('.sub_policy');
    if (!page) return;

    const header = document.querySelector('header');
    const headerHeight = () => (header ? header.offsetHeight : 0);
    const setHeaderHeight = () => page.style.setProperty('--header-h', headerHeight() + 'px');
    setHeaderHeight();
    if (header && 'ResizeObserver' in window) new ResizeObserver(setHeaderHeight).observe(header);
    else window.addEventListener('resize', setHeaderHeight);

    const navItems = page.querySelectorAll('.policy_nav li');
    const sections = [];
    for (const navItem of navItems) {
        const link = navItem.querySelector('a[href^="#"]');
        const section = link ? document.getElementById(link.getAttribute('href').slice(1)) : null;
        if (section) sections.push({ navItem, section });
    }
    if (!sections.length) return;

    const activate = (current) => {
        for (const { navItem } of sections) navItem.classList.toggle('on', navItem === current.navItem);
        // 가로 칩 줄(모바일)에서 현재 칩이 잘려 있으면 줄을 밀어 보이게 한다
        const list = current.navItem.parentElement;
        if (list.scrollWidth > list.clientWidth) {
            const left = current.navItem.offsetLeft - list.offsetLeft;
            const right = left + current.navItem.offsetWidth;
            if (left < list.scrollLeft) list.scrollTo({ left: left - 8, behavior: 'smooth' });
            else if (right > list.scrollLeft + list.clientWidth) list.scrollTo({ left: right - list.clientWidth + 8, behavior: 'smooth' });
        }
    };

    // 기준선(헤더 아래 + 여유)을 지난 마지막 절이 현재 절. 맨 아래까지 내려가면 마지막 절.
    const update = () => {
        const line = headerHeight() + window.innerHeight * 0.25;
        const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
        let current = sections[0];
        if (atBottom) {
            current = sections[sections.length - 1];
        } else {
            for (const entry of sections) {
                if (entry.section.getBoundingClientRect().top <= line) current = entry;
            }
        }
        if (!current.navItem.classList.contains('on')) activate(current);
    };

    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { update(); ticking = false; });
    }, { passive: true });
    update();
});
