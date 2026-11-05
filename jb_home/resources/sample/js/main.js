/*
  메인 페이지 전용 스크립트.
  resource.html 에서 page == 'main' 일 때만 읽는다.
*/
document.addEventListener('DOMContentLoaded', function () {

    // 스와이퍼와 무관한 것은 라이브러리 확인보다 앞에 둔다(못 읽어도 탭은 동작해야 한다).
    initNoticeTab();

    if (typeof Swiper === 'undefined') return;

    initMainVisual();
    initCardSlide();

    /* ============ 공지사항 탭 (.noticeZone) ============ */
    /*
      밑줄 탭(.tab-m.ud)은 공통 css 가 .on 만 정의하고 전환은 화면 몫이다(sub.js 의 .tab-l 과 같은 규약).
      li[data-tab] 값과 같은 id 의 패널만 보이고 나머지는 hidden 으로 감춘다.
      li[data-more] 가 있으면 [+] 더보기(.nz_more)의 href 도 선택된 탭의 목록으로 바꾼다.
    */
    function initNoticeTab() {
        document.querySelectorAll('.noticeZone .nz_board').forEach(function (board) {
            var tabs = board.querySelectorAll('li[data-tab]');
            var moreLink = board.querySelector('.nz_more');
            if (!tabs.length) return;

            function select(target) {
                tabs.forEach(function (tab) {
                    var on = tab === target;
                    tab.classList.toggle('on', on);
                    tab.setAttribute('aria-selected', String(on));
                    var panel = document.getElementById(tab.dataset.tab);
                    if (panel) panel.hidden = !on;
                });
                if (moreLink && target.dataset.more) moreLink.href = target.dataset.more;
            }

            tabs.forEach(function (tab) {
                tab.addEventListener('click', function (e) {
                    // 앵커(#패널id)라 기본 이동은 막고 화면 전환만 한다.
                    e.preventDefault();
                    select(tab);
                });
            });
        });
    }

    /* ============ 메인 비주얼 슬라이드 ============ */
    function initMainVisual() {
        var mvEl = document.querySelector('.mainVisual .mv_swiper');
        if (!mvEl) return;

        var playBtn = document.querySelector('.mainVisual .mv_play');

        var mvSwiper = new Swiper(mvEl, {
            loop: true,
            speed: 800,
            // 페이드 전환. crossFade 를 켜야 나가는 슬라이드가 같이 사라진다.
            // (끄면 배경이 투명한 슬라이드끼리 글자가 겹쳐 보인다)
            effect: 'fade',
            fadeEffect: { crossFade: true },
            autoplay: { delay: 5000, disableOnInteraction: false },
            pagination: {
                el: '.mainVisual .mv_pager',
                type: 'bullets',
                clickable: true
            },
            navigation: {
                prevEl: '.mainVisual .mv_prev',
                nextEl: '.mainVisual .mv_next'
            }
        });

        /* 자동재생 토글. paused 클래스가 붙으면 css 가 ▶ 모양으로 바꾼다. */
        if (playBtn) {
            playBtn.addEventListener('click', function () {
                var paused = playBtn.classList.toggle('paused');
                if (paused) {
                    mvSwiper.autoplay.stop();
                } else {
                    mvSwiper.autoplay.start();
                }
                playBtn.setAttribute('aria-pressed', String(paused));
                playBtn.querySelector('.hide').textContent = paused ? '자동재생 시작' : '자동재생 멈춤';
            });
        }
    }

    /* ============ 카드 슬라이드 ============ */
    /*
      .card-slide 가 여러 개여도 각각 자기 안의 컨트롤만 잡도록 요소로 넘긴다
      (셀렉터 문자열로 주면 첫 번째 것만 물어 서로 엉킨다).
      한 화면에 보이는 장수는 .card-grid 의 minmax(28rem) 과 비슷해지게 맞췄다.
    */
    function initCardSlide() {
        document.querySelectorAll('.card-slide').forEach(function (slideArea) {
            var swiperEl = slideArea.querySelector('.swiper');
            if (!swiperEl) return;

            new Swiper(swiperEl, {
                slidesPerView: 1,
                spaceBetween: 20,   // = 2rem, .card-grid 의 gap 과 같다
                // 슬라이드가 화면 장수보다 적으면 드래그·네비를 꺼 둔다
                watchOverflow: true,
                a11y: { prevSlideMessage: '이전 카드', nextSlideMessage: '다음 카드' },
                breakpoints: {
                    536:  { slidesPerView: 2 },
                    1024: { slidesPerView: 3 },
                    1440: { slidesPerView: 5 }
                },
                pagination: {
                    el: slideArea.querySelector('.card-pager'),
                    type: 'fraction',
                    renderFraction: function (currentClass, totalClass) {
                        return '<span class="' + currentClass + '"></span>'
                             + '<span class="card-bar">|</span>'
                             + '<span class="' + totalClass + '"></span>';
                    }
                },
                navigation: {
                    prevEl: slideArea.querySelector('.card-prev'),
                    nextEl: slideArea.querySelector('.card-next')
                }
            });
        });
    }
});
