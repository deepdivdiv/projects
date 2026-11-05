/*
  회원가입 시안(퍼블) 화면 전용 스크립트. views/sample/join.html 에서만 읽는다.

  마크업 확인용이라 서버로 보내는 것은 아무것도 없다.
   1) 단계 전환 : .stepPanel 의 .on 을 옮겨 붙인다(문서 하나에 3단계가 다 들어 있다).
   2) 약관 동의 : 전체동의 ↔ 개별동의 체크 동기화.
   3) 프로필 사진 : 파일 선택·미리보기·삭제(브라우저 안에서만 처리).

  실제 가입을 붙일 때는 여기에 전송(POST /api/users)과 검증을 추가하고,
  화면은 views/user 아래로 옮겨 컨트롤러를 따로 둔다.
*/
document.addEventListener('DOMContentLoaded', function () {

    var wrap = document.querySelector('.joinWrap');
    if (!wrap) return;

    var panels = wrap.querySelectorAll('.stepPanel');
    var agreeAll = document.getElementById('agreeAll');
    var agreeItems = wrap.querySelectorAll('.agreeItem');

    /* ============ 프로필 사진 미리보기 ============ */

    var profileInput = document.getElementById('joinProfileImage');
    if (profileInput) {
        var profilePreview = document.getElementById('joinProfilePreview');
        var profilePlaceholder = document.getElementById('joinProfilePlaceholder');
        var profileSelect = document.getElementById('joinProfileSelect');
        var profileRemove = document.getElementById('joinProfileRemove');
        var profileStatus = document.getElementById('joinProfileStatus');
        var profileUrl = null;

        function clearProfile(message, isError) {
            profilePreview.hidden = true;
            profilePreview.removeAttribute('src');
            profilePlaceholder.hidden = false;
            if (profileUrl) URL.revokeObjectURL(profileUrl);
            profileUrl = null;
            profileInput.value = '';
            profileRemove.disabled = true;
            profileStatus.textContent = message || '선택한 사진이 없습니다.';
            profileStatus.classList.toggle('is-error', Boolean(isError));
        }

        profileSelect.addEventListener('click', function () { profileInput.click(); });
        profileRemove.addEventListener('click', function () {
            clearProfile();
            profileSelect.focus();
        });
        profileInput.addEventListener('change', function () {
            var file = profileInput.files[0];
            if (!file) return;
            if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
                clearProfile('JPG 또는 PNG 이미지 파일을 선택해 주세요.', true);
                return;
            }
            if (file.size > 2 * 1024 * 1024) {
                clearProfile('2MB 이하의 이미지 파일을 선택해 주세요.', true);
                return;
            }

            profilePreview.hidden = true;
            profilePreview.removeAttribute('src');
            profilePlaceholder.hidden = false;
            if (profileUrl) URL.revokeObjectURL(profileUrl);
            var nextUrl = URL.createObjectURL(file);
            profileUrl = nextUrl;
            profileRemove.disabled = false;
            profileStatus.textContent = '사진을 불러오는 중입니다.';
            profileStatus.classList.remove('is-error');

            // 별도 이미지로 확인해 빠른 재선택·삭제 후 이전 파일이 표시되는 것을 막는다.
            var candidate = new Image();
            candidate.onload = function () {
                if (profileUrl !== nextUrl) return;
                profilePreview.src = nextUrl;
                profilePreview.hidden = false;
                profilePlaceholder.hidden = true;
                profileStatus.textContent = file.name;
            };
            candidate.onerror = function () {
                if (profileUrl !== nextUrl) return;
                clearProfile('이미지를 불러올 수 없습니다. 다른 사진을 선택해 주세요.', true);
            };
            candidate.src = nextUrl;
        });
        if (profileInput.form) {
            profileInput.form.addEventListener('reset', function () { clearProfile(); });
        }
    }

    /* ============ 단계 전환 ============ */

    wrap.querySelectorAll('[data-go-step]').forEach(function (button) {
        button.addEventListener('click', function () {
            var step = button.dataset.goStep;
            panels.forEach(function (panel) {
                panel.classList.toggle('on', panel.dataset.step === step);
            });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    /* ============ 약관 전체동의 ============ */

    if (agreeAll) {
        agreeAll.addEventListener('change', function () {
            agreeItems.forEach(function (item) { item.checked = agreeAll.checked; });
        });
    }

    agreeItems.forEach(function (item) {
        item.addEventListener('change', function () {
            if (!agreeAll) return;
            agreeAll.checked = Array.prototype.every.call(agreeItems, function (each) {
                return each.checked;
            });
        });
    });
});
