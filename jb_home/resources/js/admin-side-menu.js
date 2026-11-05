/**
 * [개발 작성] 관리자 사이드 메뉴 — 하위 메뉴 패널(.sub_menu) 보이기/숨기기(on/off).
 *
 * 폰·태블릿에서는 레일(6rem)과 패널(27rem)이 화면 대부분을 차지해 본문을 볼 수 없다는 제보가 있어, 패널 머리에 둔
 * 버튼(.sub_menu_toggle)을 누르면 패널을 숨기고 다시 누르면 보이게 한다. 숨겨도 패널은 버튼만 남는 얇은 띠로 접히므로
 * (admin/css/scss/dev/_side_menu.scss) 다시 펼 버튼이 그 자리에 남는다. 어느 폭에서든 같은 동작이고 기본은 보임이다.
 * 퍼블 스크립트(admin/js/layout.js)를 고치지 않고 새 파일로 둔다 — 고치면 퍼블이 그 파일을 다시 넘길 때 우리 추가분이
 * 조용히 사라지고, 한 파일에 퍼블·개발 작업이 섞여 커밋 이력으로 책임을 가릴 수 없다(대시보드 static/js/admin-dashboard.js 와 같은 방식).
 *
 * 상태는 <html class="sub_menu_off"> 하나에 두고, 모양은 SCSS 가 그 클래스로 정한다.
 * 사용자가 숨긴 선택은 localStorage(admin.subMenu=off)에 남겨 다음 화면에서도 이어진다 — 좁은 화면에서 화면을 옮길 때마다
 * 다시 숨겨야 한다면 버튼이 없는 것과 다를 게 없다. 보임이 기본이라 '숨김' 만 저장하고 보이면 지운다.
 * 첫 그리기 전에 저장값을 읽어 클래스를 붙이는 것은 head 의 인라인 스크립트(fragments/admin/layout/resource.html)다 —
 * 이 파일은 defer 라 그때는 이미 패널이 그려진 뒤여서, 거기서 먼저 붙여야 보였다가 접히는 깜빡임이 없다.
 * 그래서 첫 상태는 저장소를 다시 읽지 않고 그 클래스에서 가져온다(두 곳이 따로 읽으면 그 사이 다른 탭이 바꾼 값으로 어긋난다).
 * 이 파일을 못 받으면(배포 중 404·차단) 펼 수단이 없는데 숨긴 채로 남으므로, 링크의 onerror 가 숨김 클래스를 걷어 보임으로 돌린다.
 * 다른 탭에서 바꾼 선택(storage)과 뒤로가기 캐시에서 되살아난 화면(pageshow)은 저장값으로 다시 맞춘다.
 * 마크업은 fragments/admin/layout/side_menu.html — 패널(id=side_sub_menu) 첫 자식이 버튼이다.
 * 버튼의 aria-expanded 는 마크업에 '보임' 으로 박혀 있고 여기서 상태에 맞춘다 — defer 가 돌기 전 몇 ms 는 숨긴 화면에서
 * 어긋나지만, 서버가 상태를 모르는(쿠키 없는) 구조에서는 피할 수 없는 창이라 그대로 둔다.
 */
(function () {
	'use strict';

	// 저장 키·값·클래스명은 head 의 인라인 스크립트(fragments/admin/layout/resource.html)와 같은 값 — 바꾸면 거기도 같이 바꾼다.
	var STORAGE_KEY = 'admin.subMenu';
	var OFF_VALUE = 'off';
	var OFF_CLASS = 'sub_menu_off';
	var LABEL_WHEN_SHOWN = '하위 메뉴 숨기기';
	var LABEL_WHEN_HIDDEN = '하위 메뉴 보이기';

	// 저장소를 못 읽는 환경(사생활 보호 모드 등)에서는 기본(보임)으로 간다.
	function readStoredOff() {
		try {
			return localStorage.getItem(STORAGE_KEY) === OFF_VALUE;
		} catch (storageError) {
			return false;
		}
	}

	// 저장이 막혀 있으면 이번 화면에서만 동작하고 저장은 건너뛴다.
	function storeOff(off) {
		try {
			if (off) {
				localStorage.setItem(STORAGE_KEY, OFF_VALUE);
			} else {
				localStorage.removeItem(STORAGE_KEY);
			}
		} catch (storageError) {
			// 의도적으로 무시
		}
	}

	document.addEventListener('DOMContentLoaded', function () {
		var subMenu = document.querySelector('#wrap > aside > .sub_menu');
		var toggleButton = subMenu ? subMenu.querySelector('.sub_menu_toggle') : null;
		if (!toggleButton) {
			// 하위 메뉴가 없는 1depth(대시보드 등)에는 패널도 버튼도 없다.
			return;
		}
		var root = document.documentElement;

		function applyOff(off) {
			root.classList.toggle(OFF_CLASS, off);
			toggleButton.setAttribute('aria-expanded', String(!off));
			toggleButton.setAttribute('aria-label', off ? LABEL_WHEN_HIDDEN : LABEL_WHEN_SHOWN);
			toggleButton.title = off ? LABEL_WHEN_HIDDEN : LABEL_WHEN_SHOWN;
		}

		// 첫 상태 — head 인라인 스크립트가 저장값을 읽어 이미 붙여 둔 클래스가 기준이다. 버튼의 aria 만 그 상태에 맞춘다.
		applyOff(root.classList.contains(OFF_CLASS));

		toggleButton.addEventListener('click', function () {
			var off = !root.classList.contains(OFF_CLASS);
			applyOff(off);
			storeOff(off);
		});

		// 다른 탭에서 바꾼 선택을 따라간다(storage 이벤트는 다른 탭의 변경에만 온다). key 가 null 이면 저장소 전체 삭제다.
		window.addEventListener('storage', function (event) {
			if (event.key === null || event.key === STORAGE_KEY) {
				applyOff(readStoredOff());
			}
		});

		// 뒤로가기 캐시(bfcache)에서 되살아난 화면은 head 스크립트가 다시 돌지 않으므로 저장값으로 한 번 맞춘다.
		window.addEventListener('pageshow', function (event) {
			if (event.persisted) {
				applyOff(readStoredOff());
			}
		});
	});
})();
