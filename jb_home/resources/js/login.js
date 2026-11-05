/*
  사용자 로그인 화면 스크립트(views/user/login.html). 서버 없이 브라우저 localStorage 로만 처리하는 두 가지를 맡는다.

  1) 아이디 저장 — 제출 시 #rememberId 가 체크돼 있으면 입력한 아이디를 저장하고, 풀려 있으면 지운다.
     다음 진입 때 저장값이 있으면 아이디 칸을 채우고 체크를 켠 뒤 커서를 비밀번호 칸으로 옮긴다.
  2) 최근 사용 간편로그인 — 간편로그인 버튼(menu li[data-provider] > a)을 누르면 그 제공자를 저장하고,
     다음 진입 때 같은 li 에 .recent 를 붙여 '최근 사용' 배지(CSS .sl_recent)를 띄운다.
     클릭 시점에 저장하므로 제공자 화면에서 취소해도 표시될 수 있다 — 안내용 표시라 감수한다.

  localStorage 는 시크릿 창·저장소 차단 환경에서 접근 자체가 예외를 던질 수 있어 읽기·쓰기를 try/catch 로 감싼다.
*/
document.addEventListener('DOMContentLoaded', function () {

	var SAVED_LOGIN_ID_KEY = 'savedLoginId';
	var RECENT_SOCIAL_KEY = 'recentSocialLogin';

	function readStorage(key) {
		try {
			return window.localStorage.getItem(key);
		} catch (e) {
			return null;
		}
	}

	function writeStorage(key, value) {
		try {
			if (value) {
				window.localStorage.setItem(key, value);
			} else {
				window.localStorage.removeItem(key);
			}
		} catch (e) {
			/* 저장소를 못 쓰는 환경 — 기능만 조용히 건너뛴다. */
		}
	}

	/* ============ 아이디 저장 ============ */

	var loginForm = document.getElementById('login_form');
	var loginIdInput = document.getElementById('loginId');
	var passwordInput = document.getElementById('password');
	var rememberCheckbox = document.getElementById('rememberId');

	if (loginForm && loginIdInput && rememberCheckbox) {
		var savedLoginId = readStorage(SAVED_LOGIN_ID_KEY);
		if (savedLoginId) {
			loginIdInput.value = savedLoginId;
			rememberCheckbox.checked = true;
			if (passwordInput) {
				passwordInput.focus();
			}
		}
		loginForm.addEventListener('submit', function () {
			writeStorage(SAVED_LOGIN_ID_KEY, rememberCheckbox.checked ? loginIdInput.value.trim() : null);
		});
	}

	/* ============ 최근 사용 간편로그인 ============ */

	var socialItems = document.querySelectorAll('.snsLogin menu li[data-provider]');
	var recentProvider = readStorage(RECENT_SOCIAL_KEY);
	for (var i = 0; i < socialItems.length; i++) {
		(function (item) {
			var provider = item.getAttribute('data-provider');
			if (recentProvider && recentProvider === provider) {
				item.classList.add('recent');
			}
			var link = item.querySelector('a');
			if (link) {
				link.addEventListener('click', function () {
					writeStorage(RECENT_SOCIAL_KEY, provider);
				});
			}
		})(socialItems[i]);
	}
});
