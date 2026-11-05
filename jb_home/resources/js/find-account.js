/*
  아이디·비밀번호 찾기 화면 스크립트(views/user/find_id.html · find_password.html) — 휴대폰 본인인증 경로.

  화면의 #find_form 에 data-cert-purpose(FIND_ID | FIND_PW)가 있고, [휴대폰 본인인증](#certBtn)을 누르면 그 목적으로
  인증 팝업(/identity/mobile-certi?purpose=...)을 연다. 결과 팝업이 opener 계약(kcb_result_form 채움 +
  executor.certiOk('mobile'))으로 성공을 알리면 #find_form 을 제출한다.

  비밀번호 찾기는 아이디(#loginId)가 폼 안에 있어 함께 전송된다 — 비어 있으면 팝업을 열지 않고 안내한다.
  실제 판정은 서버가 한다 — 세션에 담긴 인증 신원(IdentityController 가 저장)으로 계정을 찾고 대조한다.
  이 스크립트는 팝업 열기·제출만 맡는다.
*/
document.addEventListener('DOMContentLoaded', function () {

	var form = document.getElementById('find_form');
	var certBtn = document.getElementById('certBtn');
	if (!form || !certBtn) {
		return;
	}
	var purpose = form.getAttribute('data-cert-purpose') || 'FIND_ID';
	var loginIdInput = document.getElementById('loginId');
	var cau = document.getElementById('certCau');

	var CERT_SUCCESS_CODE = 'B000';

	certBtn.addEventListener('click', function () {
		if (loginIdInput && !loginIdInput.value.trim()) {
			warn('아이디를 먼저 입력해 주세요.');
			loginIdInput.focus();
			return;
		}
		clear();
		var popup = window.open('/identity/mobile-certi?purpose=' + encodeURIComponent(purpose), 'kcbMobileCerti',
			'width=430,height=640,scrollbars=yes,resizable=yes');
		if (!popup) {
			warn('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.');
		}
	});

	// 결과 팝업이 호출하는 opener 콜백. 인증 성공이면 폼을 제출해 서버가 세션 신원으로 판정하게 한다.
	window.executor = window.executor || {};
	window.executor.certiOk = function (type) {
		if (type !== 'mobile') {
			return;
		}
		var kform = document.kcb_result_form;
		if (!kform) {
			return;
		}
		var resultCode = (kform.elements['RSLT_CD'] && kform.elements['RSLT_CD'].value) || '';
		if (resultCode !== CERT_SUCCESS_CODE) {
			warn('본인인증에 실패했습니다. (' + resultCode + ') 다시 시도해 주세요.');
			return;
		}
		form.submit();
	};

	function warn(message) {
		if (cau) {
			cau.textContent = message;
			cau.style.color = '#e0483d';
		}
	}

	function clear() {
		if (cau) {
			cau.textContent = '';
		}
	}
});
