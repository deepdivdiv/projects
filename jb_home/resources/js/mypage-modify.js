/*
  마이페이지 - 회원정보수정(views/user/mypage_modify.html) 스크립트.

  휴대폰 번호는 KCB(OkCert3) 본인인증으로만 바꾼다. 이름·생년월일·성별은 화면에서 잠겨 있고(읽기전용/disabled),
  서버도 저장 시 기존 값을 유지한다. [휴대폰인증] 을 누르면 인증 팝업(/identity/mobile-certi?purpose=MODIFY)을
  열고, 결과 팝업이 opener 계약(kcb_result_form 채움 + executor.certiOk('mobile'))으로 결과를 돌려주면,
  인증 신원(이름·생년월일·성별)이 화면의 회원정보와 일치할 때만 인증된 번호를 휴대폰 칸에 채운다(불일치면 거부).

  실제 검증은 서버가 authoritative — 저장 시 세션에 담긴 인증 신원(purpose=MODIFY 로 IdentityController 가 저장)과
  회원의 이름·생년월일·성별을 다시 대조하고, 일치할 때만 인증된 번호로 갱신한다. 이 스크립트는 즉시 안내·표시용이다.
  가입 화면(join.js)과 규칙(정규화·성별매핑)을 동일하게 맞춘다.
*/
document.addEventListener('DOMContentLoaded', function () {

	var certBtn = document.getElementById('mobileCertBtn');
	if (!certBtn) {
		return;
	}

	var mobileInput = document.getElementById('modMobile');
	var userNameInput = document.getElementById('modUserName');
	var birthInput = document.getElementById('modBirth');
	var genderInputs = document.querySelectorAll('input[name="genderCd"]');
	var certCau = document.getElementById('mobileCertCau');

	var CERT_SUCCESS_CODE = 'B000';

	// [휴대폰인증] → 인증 팝업을 연다. purpose=MODIFY 로 열어야 서버가 인증 신원을 세션에 저장한다(가입은 REGISTER).
	certBtn.addEventListener('click', function () {
		var popup = window.open('/identity/mobile-certi?purpose=MODIFY', 'kcbMobileCerti',
			'width=430,height=640,scrollbars=yes,resizable=yes');
		if (!popup) {
			setCau('warring', '팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.');
		}
	});

	// 결과 팝업이 호출하는 opener 콜백. 인증 성공 + 인증 신원이 화면의 회원정보와 일치할 때만 휴대폰을 채운다.
	window.executor = window.executor || {};
	window.executor.certiOk = function (type) {
		if (type !== 'mobile') {
			return;
		}
		var form = document.kcb_result_form;
		if (!form) {
			return;
		}
		var resultCode = fieldValue(form, 'RSLT_CD');
		if (resultCode !== CERT_SUCCESS_CODE) {
			setCau('warring', '본인인증에 실패했습니다. (' + resultCode + ') 다시 시도해 주세요.');
			return;
		}

		var certName = normalizeName(fieldValue(form, 'RSLT_NAME'));
		var certBirth = onlyDigits(fieldValue(form, 'RSLT_BIRTHDAY'));
		var certGender = toGenderCode(fieldValue(form, 'RSLT_SEX_CD'));
		var certTelNo = fieldValue(form, 'TEL_NO');

		var storedName = normalizeName(userNameInput ? userNameInput.value : '');
		var storedBirth = onlyDigits(birthInput ? birthInput.value : '');
		var storedGender = selectedGender();

		if (storedName !== certName || storedBirth !== certBirth || storedGender !== certGender) {
			setCau('warring',
				'본인인증 정보가 회원정보(이름·생년월일·성별)와 일치하지 않습니다. 같은 명의의 휴대폰으로 인증해 주세요.');
			return;
		}

		// 일치 — 인증된 휴대폰번호를 채운다. 저장 버튼을 눌러야 서버에 반영된다.
		if (mobileInput) {
			mobileInput.value = formatMobile(certTelNo);
		}
		certBtn.textContent = '인증완료';
		setCau('on', '휴대폰 본인인증이 완료되었습니다. 저장하면 새 번호로 반영됩니다.');
	};

	// 선택된 성별(M/F). disabled 라디오도 checked 는 읽힌다. 미선택이면 빈 문자열.
	function selectedGender() {
		for (var i = 0; i < genderInputs.length; i++) {
			if (genderInputs[i].checked) {
				return genderInputs[i].value;
			}
		}
		return '';
	}

	// 이름 대조용 정규화(모든 공백 제거). 서버(MobileCertVerification)와 규칙을 맞춘다.
	function normalizeName(value) {
		return (value || '').replace(/\s/g, '');
	}

	// 숫자만 남긴다(생년월일 YYYYMMDD 대조용).
	function onlyDigits(value) {
		return (value || '').replace(/\D/g, '');
	}

	// KCB 성별코드(RSLT_SEX_CD) → M/F. 주민번호 성별자리 관례(1·3·5·7=남, 2·4·6·8=여)와 M/F 직전달을 받는다.
	function toGenderCode(kcbSexCode) {
		var value = (kcbSexCode || '').trim().toUpperCase();
		if (value === 'M' || value === '1' || value === '3' || value === '5' || value === '7') {
			return 'M';
		}
		if (value === 'F' || value === '2' || value === '4' || value === '6' || value === '8') {
			return 'F';
		}
		return '';
	}

	// 휴대폰 번호(숫자만) → 010-1234-5678 형태로 정리한다.
	function formatMobile(telNo) {
		var digits = onlyDigits(telNo);
		if (digits.length === 11) {
			return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
		}
		if (digits.length === 10) {
			return digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
		}
		return digits;
	}

	// kcb_result_form 의 특정 필드 값을 안전하게 읽는다(없으면 빈 문자열).
	function fieldValue(form, name) {
		if (form.elements && form.elements[name]) {
			return form.elements[name].value;
		}
		return '';
	}

	// 안내 캡션. 상태를 디자인 클래스로만 표현한다(색은 CSS 가 담당 — 인라인 색 지정 없음).
	//   경고(warring): 캡션 .er + 그 위 항목 dd.set__er (서버 검증 오류와 같은 모습)
	//   성공(on)     : 캡션 .su + 그 위 항목 dd.set__su
	function setCau(kind, message) {
		if (!certCau) {
			return;
		}
		var isError = kind === 'warring';

		// 문구 교체 — 아이콘(<i>)은 유지한다(.cau-s.er/.su 의 아이콘 스타일 보존). message 는 정적 문구라 안전하다.
		certCau.innerHTML = '';
		certCau.appendChild(document.createElement('i'));
		certCau.appendChild(document.createTextNode(message));

		certCau.classList.toggle('er', isError);
		certCau.classList.toggle('su', !isError);

		// 메시지가 뜰 때 위 dd 에도 상태 클래스를 붙여 필드 전체를 오류/성공 상태로 보이게 한다.
		var dd = certCau.closest('dd');
		if (dd) {
			dd.classList.toggle('set__er', isError);
			dd.classList.toggle('set__su', !isError);
		}
	}
});
