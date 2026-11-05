/*
  마이페이지 - 회원정보수정 본인확인 스크립트(휴대폰 본인인증 경로).

  관문은 계정 유형에 따라 한 수단만 보여 준다 — 일반 회원은 비밀번호, 간편 로그인 회원은 휴대폰 본인인증. 이 스크립트는
  [휴대폰 본인인증] 경로만 맡는다(일반 회원 화면엔 버튼이 없어 바로 빠져나간다) — 버튼을 누르면 인증 팝업
  (/identity/mobile-certi?purpose=MODIFY)을 열고, 결과 팝업이 opener 계약(kcb_result_form 채움 + executor.certiOk('mobile'))으로
  성공을 알리면 인증 폼을 제출한다(서버는 계정 유형으로 본인인증 경로임을 판정).

  실제 검증은 서버가 한다 — 이 제출에서, 세션에 담긴 인증 신원(IdentityController 가 MODIFY 인증 성공 시 저장)과 회원의
  이름·생년월일·성별을 대조해 같은 명의일 때만 통과시킨다. 이 스크립트는 팝업 열기·제출만 맡는다.
  (비밀번호 경로는 별도 폼의 submit 이라 이 스크립트와 무관하다.)
*/
document.addEventListener('DOMContentLoaded', function () {

	var certBtn = document.getElementById('confirmCertBtn');
	if (!certBtn) {
		return;
	}
	var form = document.getElementById('confirm_cert_form');
	var cau = document.getElementById('confirmCertCau');

	var CERT_SUCCESS_CODE = 'B000';

	certBtn.addEventListener('click', function () {
		var popup = window.open('/identity/mobile-certi?purpose=MODIFY', 'kcbMobileCerti',
			'width=430,height=640,scrollbars=yes,resizable=yes');
		if (!popup) {
			warn('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.');
		}
	});

	// 결과 팝업이 호출하는 opener 콜백. 인증 성공이면 폼을 제출해 서버가 신원 대조로 통과 여부를 정하게 한다.
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
		if (form) {
			form.submit();
		}
	};

	function warn(message) {
		if (cau) {
			cau.textContent = message;
			cau.style.color = '#e0483d';
		}
	}
});
