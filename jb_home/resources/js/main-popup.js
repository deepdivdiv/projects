/**
 * 레이어 팝업 배치 · 크기 · 드래그 이동 — views/user/main.html · views/user/login.html.
 *
 * 퍼블 파일(/sample/js/layout.js)을 고치지 않으려고 새 파일로 분리했다(CLAUDE.md 의 퍼블 소유 규칙).
 * 역할이 겹치지 않게 나눠 둔다.
 *   - layout.js 의 MAIN POPUP 블록 : 닫기(X) · '오늘 하루 보지않음'(localStorage) · 노출
 *   - 이 파일                      : 크기 적용 · 가로 배치 · 드래그 이동
 * 두 파일 모두 DOMContentLoaded 에 붙고 layout.js 가 먼저 실려(resource 프래그먼트의 script 순서)
 * 그쪽 정리가 끝난 뒤 이 파일이 남은 팝업만 본다.
 *
 * === 왜 CSS 가 아니라 인라인 스타일인가 ===
 * #popupZone · .popupArea · .popupImg 규칙은 퍼블이 소유한 layout/_total.scss 에 있다. 팝업마다 다른
 * 크기를 그 파일에 넣을 수 없고 개발용 override 에 넣어도 '화면 하나에만 필요한 스타일' 이라 맞지 않아,
 * 값이 정해지는 이 스크립트가 인라인으로 얹는다(인라인이 스타일시트를 이긴다).
 *
 * === 관리자 입력값과 맞춰야 하는 상수 ===
 * 간격 범위(GAP_MIN/MAX)는 BoardPopup.GAP_MIN/GAP_MAX · 팝업 등록 화면의 min/max 와 같아야 한다.
 * 서버가 이미 범위를 확인해 저장하므로 여기 클램프는 옛 데이터에 대한 그물이다.
 */
(function () {
    'use strict';

    var GAP_MIN = 0;                // BoardPopup.GAP_MIN
    var GAP_MAX = 800;              // BoardPopup.GAP_MAX
    var AUTO_GAP_MARGIN = 20;       // 간격 미지정(자동)일 때 앞 팝업과 띄울 여백(px)
    var EDGE_RATIO = 0.02;          // 화면 좌·우 기본 여백 비율(2%)
    var VIEWPORT_WIDTH_RATIO = 0.9; // 팝업이 차지할 수 있는 최대 화면 폭 비율

    /*
     * 팝업 상단 여백(px). 퍼블 목업이 인라인으로 주던 top:12rem 과 같은 값이다
     * (reset.css 의 html{font-size:62.5%} 라 1rem = 10px → 120px).
     *
     * 이 값이 없으면 안 된다 — .popupArea 는 position:absolute 인데 퍼블 CSS 에 top 이 없어서,
     * 비워 두면 화면 맨 위(y=0)에 붙어 헤더·GNB 를 덮는다. 좌표는 스크립트가 정하기로 했으므로
     * 세로 기본값도 여기서 함께 정한다.
     */
    var TOP_OFFSET = 120;

    // 드래그로 팝업을 화면 밖으로 밀어낼 때 화면에 반드시 남겨 둘 최소 크기(px).
    // 완전히 내보낼 수 있게 하면 되돌릴 방법이 없고, 무엇보다 '오늘 하루 보지않음' 을 누를 수 없게 되어
    // 오히려 방문할 때마다 팝업이 다시 뜨는 역효과가 난다. 닫기 버튼도 마찬가지다.
    var MIN_VISIBLE = 80;

    /*
     * 세로 맞춤을 몇 번까지 다시 잴 것인가. 팝업을 줄이면 '오늘 하루 보지않음' 줄의 글자가 접혀
     * 높이가 달라지므로 한 번에 끝나지 않는다(applySize 주석 참고). 실측값으로 다시 재는 방식이라
     * 보통 두 번이면 맞고, 이 상한은 혹시 모를 무한 축소를 막는 안전장치다.
     */
    var FIT_MAX_PASS = 3;

    var DRAG_MIN_WIDTH = 1024;      // 이 폭 미만(모바일·태블릿)에서는 드래그를 켜지 않는다
    var DRAG_THRESHOLD = 4;         // 이 거리(px) 이상 움직여야 '드래그' 로 본다 — 단순 클릭 보호

    document.addEventListener('DOMContentLoaded', function () {
        var popupZone = document.getElementById('popupZone');
        if (!popupZone) {
            return;
        }

        /*
         * 팝업존을 화면 전체로 편다.
         *
         * 퍼블 CSS 의 #popupZone 은 position:fixed 인데 크기가 없어, 문서 흐름상의 자리에 폭·높이 0 인
         * 상자로 놓인다. 그러면 자식 .popupArea(absolute)의 left/top 이 그 자리 기준이라 화면 좌표와
         * 어긋나고, 화면 안쪽으로 보정하는 계산이 전부 틀어진다. 화면 전체로 펴 두면 좌표계가 하나가 된다.
         *
         * 대신 존이 화면을 통째로 덮으므로 pointer-events 를 꺼서 뒤쪽 화면 클릭을 막지 않는다
         * (팝업 자신만 다시 켠다). 이 값을 빠뜨리면 z-index 999999 짜리 투명 막이 페이지를 덮어
         * 아무것도 눌리지 않는다.
         */
        popupZone.style.top = '0';
        popupZone.style.left = '0';
        popupZone.style.right = '0';
        popupZone.style.bottom = '0';
        popupZone.style.pointerEvents = 'none';

        function popupAreas() {
            return Array.prototype.slice.call(popupZone.querySelectorAll('.popupArea'));
        }

        // 존은 클릭을 통과시키므로 팝업 자신만 다시 켠다(닫기·링크가 먹혀야 한다).
        popupAreas().forEach(function (popupArea) {
            popupArea.style.pointerEvents = 'auto';
        });

        function viewportWidth() {
            return document.documentElement.clientWidth || window.innerWidth;
        }

        function viewportHeight() {
            return document.documentElement.clientHeight || window.innerHeight;
        }

        function clamp(value, min, max) {
            if (max < min) {
                max = min;
            }
            return value < min ? min : (value > max ? max : value);
        }

        /** data-popup-* 숫자 속성. 값이 없거나(자동) 숫자가 아니면 null. */
        function numberAttr(element, name) {
            var raw = element.getAttribute(name);
            if (raw === null || raw === '') {
                return null;
            }
            var value = parseInt(raw, 10);
            return isNaN(value) ? null : value;
        }

        /*
         * 관리자가 정한 크기를 얹되, 팝업 전체가 화면 안에 들어오게 맞춘다.
         *
         *   - 자동(가로 없음) : 이미지 원본 크기
         *   - 수동            : 지정한 가로. 세로를 비우면 원본 비율로 따라온다
         *   - 세로까지 지정   : 그 높이로 늘린다(원본 비율과 다르면 변형된다 — 등록 화면에 적어 둔 대로다)
         *
         * 그 크기가 화면보다 크면 <b>가로·세로 모두 들어올 때까지 비율을 유지한 채 줄인다.</b>
         * 세로까지 맞추는 이유는 '오늘 하루 보지않음' 때문이다 — 그 체크박스는 팝업 아래쪽에 있어서,
         * 넘치게 두면 화면 밖으로 나가 누를 수 없다. 드래그가 없는 모바일에서는 되돌릴 방법도 없어
         * 방문할 때마다 같은 팝업이 다시 뜬다(닫기 버튼은 위쪽이라 살아남지만 그것만으로는 부족하다).
         *
         * 퍼블 CSS 의 max-height(60rem)는 푼다. 폭은 그대로인 채 높이만 잘려 이미지가 눌려 보이기 때문이며,
         * 넘치는 것은 그 규칙 대신 여기의 비율 축소가 막는다.
         */
        function applySize(popupArea) {
            var image = popupArea.querySelector('.popupImg img');
            var imageBox = popupArea.querySelector('.popupImg');
            if (!image || !imageBox) {
                return;
            }

            var width = numberAttr(popupArea, 'data-popup-width');
            var height = numberAttr(popupArea, 'data-popup-height');

            // 원본 크기는 이미지가 도착한 뒤에야 안다. 아직이면 손대지 않고 load 뒤에 다시 부른다.
            var naturalWidth = image.naturalWidth || 0;
            var naturalHeight = image.naturalHeight || 0;
            var baseWidth = width !== null ? width : naturalWidth;
            if (baseWidth <= 0) {
                return;
            }
            var baseHeight = height !== null ? height
                    : (naturalWidth > 0 ? naturalHeight * (baseWidth / naturalWidth) : 0);

            image.style.maxHeight = 'none';
            imageBox.style.width = '100%';

            // 1) 가로를 화면 안으로.
            var scale = Math.min(1, (viewportWidth() * VIEWPORT_WIDTH_RATIO) / baseWidth);
            applyScale(popupArea, image, baseWidth, baseHeight, scale);
            if (baseHeight <= 0) {
                return;
            }

            /*
             * 2) 세로를 화면 안으로.
             *
             * 이미지 밖의 높이('오늘 하루 보지않음' 줄)를 실측해 빼고 남은 자리에 이미지를 맞춘다.
             * <b>한 번 재고 끝내지 않는다</b> — 팝업이 좁아지면 그 줄의 글자가 두 줄로 접혀 높이가
             * 늘어나므로, 줄이기 전에 잰 값으로 계산하면 그 늘어난 만큼 화면을 넘는다
             * (가로모드에서 세로로 긴 이미지를 넣었을 때 실제로 9px 넘쳤다).
             * 그래서 줄인 뒤 다시 재서 아직 넘치면 한 번 더 줄인다. 매번 실제 값으로 다시 재므로
             * 보통 두 번이면 맞고, 혹시 모를 무한 축소를 막으려 횟수를 묶어 둔다.
             */
            for (var pass = 0; pass < FIT_MAX_PASS; pass++) {
                var utilHeight = popupArea.offsetHeight - image.offsetHeight;
                var roomForImage = viewportHeight() - utilHeight;
                if (roomForImage <= 0 || image.offsetHeight <= roomForImage) {
                    break;
                }
                scale = scale * (roomForImage / image.offsetHeight);
                applyScale(popupArea, image, baseWidth, baseHeight, scale);
            }
        }

        /** 정한 비율로 팝업 폭과 이미지 높이를 함께 줄인다(따로 줄이면 비율이 어긋난다). */
        function applyScale(popupArea, image, baseWidth, baseHeight, scale) {
            popupArea.style.width = Math.max(1, Math.round(baseWidth * scale)) + 'px';
            image.style.height = baseHeight > 0
                    ? Math.max(1, Math.round(baseHeight * scale)) + 'px' : 'auto';
        }

        /*
         * 보이는 팝업을 왼쪽부터 순서대로 배치한다(순서는 서버가 정렬순서대로 내려준 DOM 순서 그대로).
         *
         *   - data-popup-gap 은 '직전(왼쪽) 팝업의 왼쪽 끝' 기준 간격이다
         *   - 값이 없으면(자동) 앞 팝업 폭 + 여백 → 서로 겹치지 않는다
         *   - 사용자가 끌어 옮긴 팝업(data-popup-moved)은 건드리지 않고 기준점으로도 쓰지 않는다
         */
        function reposition() {
            var areas = popupAreas();
            if (areas.length === 0) {
                return;
            }

            var viewport = viewportWidth();
            var edge = Math.round(viewport * EDGE_RATIO);
            var isFirst = true;
            var previousLeft = edge;
            var previousWidth = 0;

            for (var i = 0; i < areas.length; i++) {
                var popupArea = areas[i];
                if (popupArea.getAttribute('data-popup-moved') === '1') {
                    continue;
                }

                applySize(popupArea);

                var width = popupArea.offsetWidth;
                var left;
                if (isFirst) {
                    left = edge;
                } else {
                    var gap = numberAttr(popupArea, 'data-popup-gap');
                    if (gap === null) {
                        gap = previousWidth + AUTO_GAP_MARGIN;
                    } else {
                        gap = clamp(gap, GAP_MIN, GAP_MAX);
                    }
                    left = previousLeft + gap;
                }

                // 오른쪽 밖으로 밀려나 닫기 버튼을 누를 수 없게 되는 것을 막는다.
                left = clamp(left, 0, Math.max(0, viewport - width - edge));
                popupArea.style.left = left + 'px';

                // 세로 위치. 기본은 상단 여백만큼 내리되, 그만큼 내렸을 때 아래가 화면 밖으로 나가면
                // 나가지 않을 만큼만 내린다. applySize 가 이미 화면 안에 들어오게 줄여 두므로 보통은
                // 여백이 그대로 쓰이고, 이 식은 아직 이미지가 도착하지 않아 크기를 못 정한 순간처럼
                // 넘칠 수 있는 자리를 받아 내는 그물이다(그때도 팝업 위쪽 = 닫기 버튼은 화면에 남는다).
                var maxTop = Math.max(0, viewportHeight() - popupArea.offsetHeight);
                popupArea.style.top = Math.min(TOP_OFFSET, maxTop) + 'px';

                previousLeft = left;
                previousWidth = width;
                isFirst = false;
            }
        }

        /*
         * 드래그 이동. Pointer Event 로 직접 구현한다.
         *
         * press 시점마다 실제 위치·크기를 다시 재고 이동량을 화면 안쪽으로 클램프한다. 관성이나 되돌림
         * 애니메이션이 없어 '팝업이 화면 밖으로 날아가는' 동작 자체가 생길 수 없다. (라이브러리의
         * bounds 계산은 문서 좌표 기준인 경우가 많은데 팝업은 fixed 존 안이라 스크롤한 만큼 어긋난다.)
         */
        var dragEnabled = false;
        var active = null;
        var topZIndex = 0;

        /*
         * 한 축(가로 또는 세로)의 이동 가능 범위로 좌표를 보정한다.
         * 화면 밖으로 밀어내되 항상 MIN_VISIBLE 만큼은 남긴다(OS 창 관리자와 같은 방식) — 남은 자리를
         * 잡아 언제든 되돌릴 수 있으므로 실수로 밀어내도 복구된다.
         *
         * 드래그는 '가려진 부분을 끌어와 보는' 용도가 아니다. applySize 가 팝업을 화면 안에 들어오게
         * 맞춰 두므로 잘려 있는 부분이 없다 — 여기서 하는 일은 뒤쪽 화면을 보려고 팝업을 치워 두는 것이다.
         * 그래서 팝업이 화면보다 커질 수 있는 예외(이미지 도착 전 등)에도 같은 식을 그대로 쓴다.
         */
        function clampAxis(value, size, viewportSize) {
            var minVisible = Math.min(MIN_VISIBLE, size);
            return clamp(value, minVisible - size, viewportSize - minVisible);
        }

        function offsetOf(popupArea, axis) {
            var value = parseFloat(popupArea.getAttribute('data-popup-' + axis));
            return isNaN(value) ? 0 : value;
        }

        function applyOffset(popupArea, x, y) {
            popupArea.setAttribute('data-popup-x', x);
            popupArea.setAttribute('data-popup-y', y);
            popupArea.style.transform = (x === 0 && y === 0)
                ? '' : 'translate3d(' + x + 'px, ' + y + 'px, 0)';
        }

        /** 진행 중인 press 정리. pointerup 을 놓쳐도 드래그가 잠기지 않게 한 곳에 모은다. */
        function releaseActive() {
            if (!active) {
                return null;
            }
            var pressed = active;
            active = null;

            document.removeEventListener('pointermove', onPointerMove, true);
            document.removeEventListener('pointerup', onPointerUp, true);
            document.removeEventListener('pointercancel', onPointerUp, true);

            if (pressed.popupArea.releasePointerCapture) {
                try {
                    pressed.popupArea.releasePointerCapture(pressed.pointerId);
                } catch (error) {
                    // 이미 해제된 포인터면 무시한다.
                }
            }
            pressed.popupArea.style.cursor = dragEnabled ? 'grab' : '';
            pressed.popupArea.style.userSelect = '';
            return pressed;
        }

        function onPointerDown(event) {
            if (!dragEnabled) {
                return;
            }
            if (event.pointerType === 'mouse' && event.button !== 0) {
                return; // 좌클릭만
            }
            if (event.isPrimary === false) {
                return; // 멀티터치 무시
            }
            // 닫기·'오늘 하루 보지않음' 은 드래그 대상에서 뺀다(클릭이 씹히지 않게).
            if (event.target && event.target.closest
                    && event.target.closest('button, label, input')) {
                return;
            }

            releaseActive();

            var popupArea = event.currentTarget;
            var rect = popupArea.getBoundingClientRect();
            active = {
                popupArea: popupArea,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                baseX: offsetOf(popupArea, 'x'),
                baseY: offsetOf(popupArea, 'y'),
                // transform 을 뺀 순수 레이아웃 위치
                originLeft: rect.left - offsetOf(popupArea, 'x'),
                originTop: rect.top - offsetOf(popupArea, 'y'),
                width: rect.width,
                height: rect.height,
                dragging: false
            };

            // 누른 팝업을 항상 맨 위로. 존의 z-index 안에서만 겨루므로 0부터 올려도 충분하다.
            topZIndex += 1;
            popupArea.style.zIndex = topZIndex;

            document.addEventListener('pointermove', onPointerMove, true);
            document.addEventListener('pointerup', onPointerUp, true);
            document.addEventListener('pointercancel', onPointerUp, true);
        }

        function onPointerMove(event) {
            if (!active || event.pointerId !== active.pointerId) {
                return;
            }

            var dx = event.clientX - active.startX;
            var dy = event.clientY - active.startY;

            if (!active.dragging) {
                if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
                    return;
                }
                active.dragging = true;
                active.popupArea.style.cursor = 'grabbing';
                active.popupArea.style.userSelect = 'none';
                if (active.popupArea.setPointerCapture) {
                    try {
                        active.popupArea.setPointerCapture(active.pointerId);
                    } catch (error) {
                        // 캡처를 못 잡아도 document 리스너로 계속 따라간다.
                    }
                }
            }

            var left = clampAxis(active.originLeft + active.baseX + dx, active.width, viewportWidth());
            var top = clampAxis(active.originTop + active.baseY + dy, active.height, viewportHeight());

            applyOffset(active.popupArea,
                    Math.round(left - active.originLeft),
                    Math.round(top - active.originTop));
            event.preventDefault();
        }

        function onPointerUp(event) {
            if (!active || event.pointerId !== active.pointerId) {
                return;
            }
            var pressed = releaseActive();
            if (!pressed.dragging) {
                return;
            }

            // 옮긴 팝업은 이후 자동 재배치 대상에서 뺀다(사용자가 둔 자리를 존중한다).
            pressed.popupArea.setAttribute('data-popup-moved', '1');
            // 드래그 직후에 이어지는 클릭(링크 이동)은 한 번만 삼킨다.
            pressed.popupArea.addEventListener('click', swallowClick, true);
            setTimeout(function () {
                pressed.popupArea.removeEventListener('click', swallowClick, true);
            }, 0);
        }

        function swallowClick(event) {
            event.preventDefault();
            event.stopPropagation();
        }

        function enableDrag() {
            if (dragEnabled) {
                return;
            }
            dragEnabled = true;
            popupAreas().forEach(function (popupArea) {
                // 커서·선택 방지는 CSS 가 아니라 여기서 얹는다(퍼블 SCSS 를 고치지 않는다).
                popupArea.style.cursor = 'grab';
                popupArea.style.touchAction = 'none';
                popupArea.addEventListener('pointerdown', onPointerDown);

                // 이미지·링크의 네이티브 끌기(고스트 이미지)를 끈다 — 켜 두면 드래그가 그쪽에 먹힌다.
                var draggables = popupArea.querySelectorAll('img, a');
                Array.prototype.forEach.call(draggables, function (draggable) {
                    draggable.draggable = false;
                });
            });
        }

        function disableDrag() {
            if (!dragEnabled) {
                return;
            }
            dragEnabled = false;
            releaseActive();
            popupAreas().forEach(function (popupArea) {
                popupArea.removeEventListener('pointerdown', onPointerDown);
                popupArea.style.userSelect = '';
                popupArea.style.cursor = '';
                popupArea.style.touchAction = '';
                popupArea.style.zIndex = '';
                popupArea.removeAttribute('data-popup-moved');
                applyOffset(popupArea, 0, 0);
            });
            reposition();
        }

        function applyDragMode(mediaQuery) {
            if (mediaQuery.matches) {
                enableDrag();
            } else {
                disableDrag();
            }
        }

        // 이미지가 도착해야 원본 크기를 알 수 있다. 캐시된 이미지는 이미 complete 라 그대로 지나간다.
        popupAreas().forEach(function (popupArea) {
            var image = popupArea.querySelector('.popupImg img');
            if (image && !image.complete) {
                image.addEventListener('load', reposition);
                image.addEventListener('error', reposition);
            }
        });

        reposition();
        window.addEventListener('load', reposition);

        // 팝업을 닫으면 남은 팝업을 다시 배치한다. 닫기 동작 자체는 layout.js 가 갖고 있으므로
        // 그 결과(자식 제거)만 관찰한다 — 같은 동작을 두 파일에 두지 않는다.
        if (window.MutationObserver) {
            new MutationObserver(reposition).observe(popupZone, { childList: true });
        }

        // Pointer Event 를 지원하지 않는 구형 브라우저에서는 드래그 없이 노출만 된다(기능 저하 없음).
        if (window.PointerEvent) {
            var wideScreen = window.matchMedia('(min-width: ' + DRAG_MIN_WIDTH + 'px)');
            applyDragMode(wideScreen);
            if (wideScreen.addEventListener) {
                wideScreen.addEventListener('change', applyDragMode);
            } else if (wideScreen.addListener) {
                wideScreen.addListener(applyDragMode); // 구형 브라우저
            }
        }

        // 창 크기가 바뀌면 다시 배치한다. 끌어 옮긴 팝업은 자리를 유지하되 화면 안쪽으로만 보정한다.
        var resizeTimer = null;
        window.addEventListener('resize', function () {
            if (resizeTimer) {
                clearTimeout(resizeTimer);
            }
            resizeTimer = setTimeout(function () {
                popupAreas().forEach(function (popupArea) {
                    if (popupArea.getAttribute('data-popup-moved') !== '1') {
                        return;
                    }
                    var rect = popupArea.getBoundingClientRect();
                    var left = clampAxis(rect.left, rect.width, viewportWidth());
                    var top = clampAxis(rect.top, rect.height, viewportHeight());
                    applyOffset(popupArea,
                            Math.round(offsetOf(popupArea, 'x') + (left - rect.left)),
                            Math.round(offsetOf(popupArea, 'y') + (top - rect.top)));
                });
                reposition();
            }, 100);
        });
    });
})();
