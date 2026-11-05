/*
  마이페이지 - 회원탈퇴 스크립트(views/user/mypage_leave.html) — 간편 로그인 회원의 휴대폰 본인인증 경로.

  간편 로그인 회원은 사이트 비밀번호가 없어 휴대폰 본인인증으로 본인을 확인한다. 서버가 그 계정이면 폼(#leave_form)에
  data-cert-purpose="WITHDRAW" 를 달아 내리고, 이 스크립트는 그 폼의 제출을 가로챈다 —
    1) 동의 체크(#leaveAgree)가 없으면 안내만 하고 멈춘다(서버도 @AssertTrue 로 다시 막는다).
    2) 인증 팝업(/identity/mobile-certi?purpose=WITHDRAW)을 연다.
    3) 결과 팝업이 opener 계약(kcb_result_form 채움 + executor.certiOk('mobile'))으로 성공을 알리면 폼을 제출한다.
  실제 판정은 서버가 한다 — 세션에 담긴 인증 신원(IdentityController 가 저장)과 회원의 이름·생년월일·성별을 대조해
  같은 명의일 때만 탈퇴시킨다(UserService.withdrawBySocial). 일반 회원 화면엔 data-cert-purpose 가 없어 곧바로 빠져나간다.
*/
document.addEventListener('DOMContentLoaded', function () {

	var form = document.getElementById('leave_form');
	if (!form || !form.getAttribute('data-cert-purpose')) {
		return;
	}
	var purpose = form.getAttribute('data-cert-purpose');
	var agree = document.getElementById('leaveAgree');
	var cau = document.getElementById('leaveCertCau');

	var CERT_SUCCESS_CODE = 'B000';
	// 인증 성공 후 스크립트가 다시 제출할 때는 가로채지 않는다.
	var certified = false;

	form.addEventListener('submit', function (event) {
		if (certified) {
			return;
		}
		event.preventDefault();
		if (agree && !agree.checked) {
			warn('안내사항에 동의해야 탈퇴할 수 있습니다.');
			agree.focus();
			return;
		}
		clear();
		var popup = window.open('/identity/mobile-certi?purpose=' + encodeURIComponent(purpose), 'kcbMobileCerti',
			'width=430,height=640,scrollbars=yes,resizable=yes');
		if (!popup) {
			warn('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.');
		}
	});

	// 결과 팝업이 호출하는 opener 콜백. 인증 성공이면 폼을 제출해 서버가 신원 대조로 탈퇴 여부를 정하게 한다.
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
		certified = true;
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
