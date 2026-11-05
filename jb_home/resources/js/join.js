/*
  학습자 회원가입 화면(views/user/join.html) 스크립트.

  가입 '저장'은 Ajax 가 아니라 서버 렌더 폼(POST /join)으로 제출한다. 이 스크립트는 화면 조작을 맡는다.
    1) 단계 전환      : 약관동의(STEP1) ↔ 정보입력(STEP2) 의 .stepPanel .on 을 옮긴다.
    2) 약관 전체동의  : 전체동의 ↔ 개별동의 체크 동기화.
    3) STEP1 → STEP2  : 필수 약관(이용약관·개인정보) 동의 확인(미동의면 다음 단계로 넘기지 않는다).
    4) 비밀번호 확인  : 제출 전 일치 여부를 즉시 안내(순수 클라이언트, 서버 전송 아님).
    5) 아이디 중복확인 : 공개 API(GET /api/users/login-id/available)로 사용 가능 여부만 조회(읽기 GET, CSRF 불필요).

    6) 휴대폰 본인인증 : 사용자가 이름·생년월일·성별을 '직접 입력'한 뒤 [휴대폰인증] 으로 KCB(OkCert3)
                        팝업(/identity/mobile-certi)을 연다. 결과 팝업이 opener 계약(kcb_result_form 채움 +
                        executor.certiOk('mobile'))으로 결과를 돌려주면, 입력한 이름·생년월일·성별이 인증 신원과
                        일치할 때만 인증된 휴대폰번호를 채우고 mobileCertVerified 를 켠다(불일치면 거부). 인증 전이라도
                        제출은 막지 않는다 — 서버가 @Valid 로 필수 입력·본인인증 오류를 한 번에 돌려준다.
                        저장 시 세션에 담긴 인증 신원과 다시 대조한다(authoritative).

    7) 제출 전 검증    : 서버가 판정하는 규칙(필수·형식·비밀번호 정책·주민번호 검증번호·4순위 중복·전문분야·학습자 구분·
                        프로필 사진 + 구분별 필수 서류·아이디 중복확인 통과)을 같은 기준으로 먼저 검사하고, 오류를 서버 th:errors 와 같은 자리·
                        마크업으로 붙인다(validateJoinForm). 통과하면 이메일 중복을 API 로 확인한 뒤 제출한다.
                        서버가 되돌리면 파일을 다시 첨부해야 하므로 재렌더를 거의 없애는 목적이다.
    8) 양식 전체 다운로드 : 본인인증 단계의 [양식 전체 다운로드]가 정보 입력 단계의 칸별 [양식 다운로드] 링크 세 개를
                        차례로 눌러 첨부 서류 양식 3종을 한 번에 내려받게 한다(서버 zip 없음).
    9) 학습자 구분      : 라디오(NEW 26년 신규 신청자 / REFRESHER 24~25년 기존 디지털닥터 자격자)로 신청서 칸을 가른다(applyLearnerType).
                        data-learner-only="NEW|REFRESHER" 칸(교육희망장소·전문분야·서류)은 고른 구분의 것만 보이고 감춘 칸의 입력은
                        disabled 로 전송에서 뺀다. 신청자격은 고정 구분(라디오 data-fixed-qualification-cd)이면 그 항목(체크박스
                        data-qualification-cd)만 체크한 채 전부 비활성으로 잠근다 — 서버도 같은 구분으로 저장한다(제출값 무시).

  최종 검증과 저장은 서버가 한다(backstop). 실패하면 컨트롤러가 이 화면을 해당 단계로 다시 그린다.
  '가입하기'는 폼 submit 버튼이라 별도 전송 코드가 없다.
*/
document.addEventListener('DOMContentLoaded', function () {

    var wrap = document.querySelector('.joinWrap');
    if (!wrap) return;

    var panels = wrap.querySelectorAll('.stepPanel');
    var agreeAll = document.getElementById('agreeAll');
    var agreeItems = wrap.querySelectorAll('.agreeItem');
    var agreeCau = document.getElementById('agreeCau');

    /* ============ 단계 전환 ============ */

    /* data-go-step 버튼(STEP2 의 '이전')은 조건 없이 이동한다. '다음'은 필수 약관 확인이 있어 별도 처리한다. */
    wrap.querySelectorAll('[data-go-step]').forEach(function (button) {
        button.addEventListener('click', function () {
            goStep(button.dataset.goStep);
        });
    });

    function goStep(step) {
        panels.forEach(function (panel) {
            panel.classList.toggle('on', panel.dataset.step === step);
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ============ 약관 전체동의 동기화 ============ */

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

    /* ============ 프로필 사진 미리보기 ============ */
    /* 화면용(선택·미리보기·삭제)만 한다 — 서버 저장은 별도 단계라 여기선 전송하지 않는다. */

    var profileInput = document.getElementById('joinProfileImage');
    if (profileInput) {
        var profilePreview = document.getElementById('joinProfilePreview');
        var profilePlaceholder = document.getElementById('joinProfilePlaceholder');
        var profileSelect = document.getElementById('joinProfileSelect');
        var profileRemove = document.getElementById('joinProfileRemove');
        var profileStatus = document.getElementById('joinProfileStatus');
        var profileUrl = null;

        var clearProfile = function (message, isError) {
            profilePreview.hidden = true;
            profilePreview.removeAttribute('src');
            profilePlaceholder.hidden = false;
            if (profileUrl) URL.revokeObjectURL(profileUrl);
            profileUrl = null;
            profileInput.value = '';
            profileRemove.disabled = true;
            profileStatus.textContent = message || '선택한 사진이 없습니다.';
            profileStatus.classList.toggle('is-error', Boolean(isError));
        };

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

    /* ============ 첨부 파일(이력사항·컨설팅 실적 증명서·청렴 서약서·기타서류) ============ */
    /* 공통 첨부 컴포넌트(.file-drop-s / .file-list): 비었을 때는 드롭존, 고르면 한 줄짜리 목록으로 바꿔 끼운다.
       한 건만 받고 미리보기는 없다(문서라 파일명·용량만 표시). 네 칸이 같은 동작이라 prefix 로 공통 함수를 건다.
       화면용이며 서버 저장(enctype·MultipartFile·FileStorage·스키마)은 별도 단계다. */
    function initFileAttach(prefix, extensions, maxBytes, maxLabel) {
        var input = document.getElementById(prefix + 'File');
        if (!input) return;
        var drop = document.getElementById(prefix + 'Drop');
        var list = document.getElementById(prefix + 'List');
        var select = document.getElementById(prefix + 'Select');
        var change = document.getElementById(prefix + 'Change');
        var remove = document.getElementById(prefix + 'Remove');
        var nameEl = document.getElementById(prefix + 'Name');
        var sizeEl = document.getElementById(prefix + 'Size');
        var totalSizeEl = document.getElementById(prefix + 'TotalSize');
        var statusEl = document.getElementById(prefix + 'Status');

        var sizeText = function (bytes) {
            if (bytes < 1024) return '(' + bytes + 'B)';
            if (bytes < 1024 * 1024) return '(' + (bytes / 1024).toFixed(1) + 'KB)';
            return '(' + (bytes / (1024 * 1024)).toFixed(2) + 'MB)';
        };
        // 오류 문구는 안내문 아래 한 줄(statusEl)에만 쓰고, 없으면 감춘다.
        var setError = function (message) {
            statusEl.textContent = message || '';
            statusEl.classList.toggle('warring', Boolean(message));
        };
        var clear = function (message) {
            input.value = '';
            // .file-drop-s/.file-list 가 display:flex 라 .none/hidden 이 안 먹혀 인라인 style 로 토글한다.
            list.style.display = 'none';
            drop.style.display = '';
            drop.classList.remove('drag-over');
            setError(message);
        };
        var show = function (file) {
            nameEl.textContent = file.name;
            sizeEl.textContent = sizeText(file.size);
            totalSizeEl.textContent = sizeText(file.size);
            drop.style.display = 'none';
            drop.classList.remove('drag-over');
            list.style.display = '';
            setError('');
        };
        // 드래그로 들어온 파일은 확장자·용량을 여기서 한 번 더 본다(accept 는 파일 창에만 걸린다).
        var accept = function (file) {
            if (!file) return false;
            var dotIndex = file.name.lastIndexOf('.');
            var extension = dotIndex < 0 ? '' : file.name.slice(dotIndex + 1).toLowerCase();
            if (extensions.indexOf(extension) < 0) {
                clear(extensions.join(', ').toUpperCase() + ' 파일만 첨부할 수 있습니다.');
                return false;
            }
            if (file.size > maxBytes) {
                clear(maxLabel + ' 이하의 파일을 선택해 주세요.');
                return false;
            }
            show(file);
            return true;
        };

        drop.addEventListener('click', function () { input.click(); });
        if (change) change.addEventListener('click', function () { input.click(); });
        if (remove) remove.addEventListener('click', function () {
            clear();
            if (select) select.focus();
        });
        input.addEventListener('change', function () { accept(input.files[0]); });

        drop.addEventListener('dragover', function (event) {
            event.preventDefault();
            drop.classList.add('drag-over');
        });
        drop.addEventListener('dragleave', function (event) {
            if (drop.contains(event.relatedTarget)) return;
            drop.classList.remove('drag-over');
        });
        drop.addEventListener('drop', function (event) {
            event.preventDefault();
            drop.classList.remove('drag-over');
            var dropped = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
            if (!dropped) return;
            try {
                var transfer = new DataTransfer();
                transfer.items.add(dropped);
                input.files = transfer.files;
            } catch (error) {
                setError('이 브라우저에서는 끌어다 놓기를 쓸 수 없습니다. [파일찾기]로 선택해 주세요.');
                return;
            }
            accept(input.files[0]);
        });

        if (input.form) {
            input.form.addEventListener('reset', function () { clear(); });
        }
    }

    // 확장자 목록은 화면 input 의 accept 와 같게 둔다(accept 는 파일 창에만 걸리고, 드롭은 여기서 거른다). zip 은 여러 장을 묶어 내는 경우용.
    initFileAttach('joinCareer', ['pdf', 'doc', 'docx', 'hwp', 'hwpx', 'zip'], 50 * 1024 * 1024, '50MB');
    initFileAttach('joinPerfCert', ['pdf', 'jpg', 'jpeg', 'png', 'zip'], 50 * 1024 * 1024, '50MB');
    initFileAttach('joinEthics', ['pdf', 'jpg', 'jpeg', 'png', 'zip'], 50 * 1024 * 1024, '50MB');
    // 기타서류는 선택 — 필수 검사(validateJoinForm 의 requiredDocs)에는 넣지 않는다.
    initFileAttach('joinEtcDoc', ['pdf', 'jpg', 'jpeg', 'png', 'zip'], 50 * 1024 * 1024, '50MB');
    // 디지털닥터 수료증(24~25년 중 해당 수료증 일체) — 24~25년 기존 디지털닥터 자격자(REFRESHER)의 유일한 필수 서류.
    initFileAttach('joinCompletionCert', ['pdf', 'jpg', 'jpeg', 'png', 'zip'], 50 * 1024 * 1024, '50MB');

    /* ============ 학습자 구분 → 신청서 칸 토글 ============ */
    /* 학습자 구분(learnerTypeCd 라디오 — NEW: 26년 신규 신청자 / REFRESHER: 24~25년 기존 디지털닥터 자격자)이 신청서 칸을 가른다(규칙은 서버 LearnerType 과 같다).
         - data-learner-only="NEW|REFRESHER" 칸(교육희망장소·전문분야·서류 dl)은 고른 구분의 것만 보인다(고르기 전엔 하나도 안 보인다).
           감춘 칸의 입력(select·checkbox·text·file)은 disabled 로 전송에서 뺀다 — 브라우저는 display:none 이어도 값을 보내므로, 구분을 바꾸기 전에
           고른 값이 다른 구분으로 넘어가지 않게 한다(서버도 같은 구분으로 걸러 저장한다). 다시 보일 때는 되살리되 전문분야 '기타' 입력칸은
           기타 체크 여부를 따른다(그 칸의 원래 규칙). .form-user dl 은 display:flex 라 hidden 속성이 안 먹혀 인라인 style 로 토글한다(서버 th:style 과 같다).
         - 신청자격은 고정 구분(라디오의 data-fixed-qualification-cd 가 있는 것 — 보수교육 대상자)이면 그 코드(체크박스 data-qualification-cd)의 항목만
           체크한 채 클릭을 막아 잠그고(전송은 된다), 기본자격·경력인정 분야의 나머지 전부를 체크 해제 + disabled 로 잠근다.
           고정이 없는 구분(신규)으로 돌아오면 다시 고를 수 있게 푼다. 서버는 제출값과 무관하게 고정 항목을 저장한다. */
    var learnerTypeRadios = wrap.querySelectorAll('input[name="learnerTypeCd"]');

    function selectedLearnerType() {
        for (var i = 0; i < learnerTypeRadios.length; i++) {
            if (learnerTypeRadios[i].checked) {
                return learnerTypeRadios[i].value;
            }
        }
        return '';
    }

    // 고른 구분에 고정된 신청자격 코드(라디오의 data-fixed-qualification-cd). 고정이 없거나 미선택이면 빈 값.
    function fixedQualificationCd() {
        for (var i = 0; i < learnerTypeRadios.length; i++) {
            if (learnerTypeRadios[i].checked) {
                return learnerTypeRadios[i].dataset.fixedQualificationCd || '';
            }
        }
        return '';
    }

    // 이 요소가 고른 구분에서 감춰지는 칸(data-learner-only 가 다른 구분) 안에 있는지. 제출 전 검증이 감춘 칸을 건너뛰는 기준이다.
    function hiddenByLearnerType(element) {
        var block = element && element.closest ? element.closest('[data-learner-only]') : null;
        return Boolean(block) && block.dataset.learnerOnly !== selectedLearnerType();
    }

    function applyLearnerType() {
        var learnerType = selectedLearnerType();
        wrap.querySelectorAll('[data-learner-only]').forEach(function (block) {
            var shown = block.dataset.learnerOnly === learnerType;
            block.style.display = shown ? '' : 'none';
            block.querySelectorAll('input, select, textarea').forEach(function (field) {
                field.disabled = !shown;
            });
            // 전문분야 '기타' 직접입력은 기타 체크 여부가 정한다(아래 inline 스크립트의 규칙) — 되살릴 때 그 규칙으로 되돌린다.
            var etcCheck = block.querySelector('#jobFieldEtcCheck');
            var etcInput = block.querySelector('#jobFieldEtc');
            if (shown && etcCheck && etcInput) {
                etcInput.disabled = !etcCheck.checked;
            }
        });

        // 신청자격 고정. 고정 항목은 체크한 채 '잠금'(클릭 무시 — 아래 click 핸들러)으로 두고 나머지는 체크를 풀고 disabled 로 잠근다.
        // 고정 항목까지 disabled 로 하면 전송에서 빠지고 디자인시스템 체크 표시가 흐려질 수 있어, 체크된 채 전송되게 enabled 로 둔다(서버도 어차피 고정 저장).
        var fixedCd = fixedQualificationCd();
        wrap.querySelectorAll('input[name="qualificationIds"]').forEach(function (checkbox) {
            var isFixed = Boolean(fixedCd) && (checkbox.getAttribute('data-qualification-cd') || '') === fixedCd;
            if (fixedCd) {
                checkbox.checked = isFixed;
                checkbox.disabled = !isFixed;
                checkbox.dataset.locked = isFixed ? 'true' : '';
                checkbox.setAttribute('aria-disabled', 'true');
            } else {
                checkbox.disabled = false;
                checkbox.dataset.locked = '';
                checkbox.removeAttribute('aria-disabled');
            }
        });
    }

    // 고정 항목 체크박스는 클릭해도 풀리지 않는다(성별 잠금과 같은 방식 — disabled 는 전송에서 빠지므로 클릭만 막는다).
    wrap.querySelectorAll('input[name="qualificationIds"]').forEach(function (checkbox) {
        checkbox.addEventListener('click', function (event) {
            if (checkbox.dataset.locked === 'true') {
                event.preventDefault();
            }
        });
    });

    Array.prototype.forEach.call(learnerTypeRadios, function (radio) {
        radio.addEventListener('change', applyLearnerType);
    });
    if (learnerTypeRadios.length) {
        applyLearnerType();
    }

    /* ============ 첨부 서류 양식 전체 다운로드 (STEP2) ============ */
    /* 본인인증 단계의 [양식 전체 다운로드]는 정보 입력 단계의 칸별 [양식 다운로드] 링크(a[data-join-form])를 차례로 눌러
       세 파일을 각각 내려받는다 — 주소를 여기 다시 적지 않아 링크(file_id)가 바뀌어도 화면 한 곳만 고친다.
       클릭 사이를 조금 띄우는 이유: 같은 순간에 여러 다운로드를 걸면 브라우저가 앞 것을 취소하는 경우가 있다.
       Chrome·Edge 는 한 동작에서 두 번째 다운로드부터 "여러 파일 다운로드 허용" 을 한 번 묻는다(허용하면 이후엔 묻지 않는다) —
       화면 안내줄에 적어 두었다. 서버에서 zip 으로 묶는 방식은 쓰지 않았다(설정·엔드포인트가 늘어 과하다). */
    var downloadAllBtn = document.getElementById('joinFormDownloadAll');
    if (downloadAllBtn) {
        downloadAllBtn.addEventListener('click', function () {
            var formLinks = wrap.querySelectorAll('a[data-join-form]');
            formLinks.forEach(function (link, index) {
                setTimeout(function () { link.click(); }, index * 300);
            });
        });
    }

    /* ============ 제출 전 클라이언트 검증 ============ */
    /* 서버(@Valid·BusinessException)가 되돌리면 첨부 파일을 전부 다시 올려야 하므로(브라우저가 file 값을 되채우지 못함),
       서버가 판정하는 규칙을 여기서 같은 기준으로 먼저 검사해 재렌더를 거의 없앤다. 오류는 서버 th:errors 와 같은 자리·같은
       마크업(<p class="ip-cau warring">, 입력칸 바로 아래)으로 붙이고, 첫 오류 칸으로 스크롤·포커스한다.
       서버 검증은 그대로 backstop 이다 — 여기서 못 잡는 것(동시 가입 race·주민번호 중복 등)만 서버가 되돌린다. */
    var joinForm = document.getElementById('join_form');
    var loginIdCheckedValue = null;   // [중복확인] 통과한 아이디(값을 바꾸면 무효)
    var submitting = false;           // 이메일 확인(비동기) 중 중복 제출 방지

    if (joinForm) {
        joinForm.addEventListener('submit', function (event) {
            // 항상 가로챈다 — 동기 검증을 통과하면 이메일 중복을 API 로 확인한 뒤 form.submit() 으로 직접 제출한다
            // (form.submit() 은 submit 이벤트를 다시 일으키지 않는다).
            event.preventDefault();
            if (submitting) {
                return;
            }
            var firstError = validateJoinForm();
            if (firstError) {
                revealError(firstError);
                return;
            }
            submitting = true;
            setSubmitDisabled(true);
            checkEmailAvailable(document.getElementById('joinEmail').value.trim(), function (available) {
                if (available === false) {
                    submitting = false;
                    setSubmitDisabled(false);
                    var emailInput = document.getElementById('joinEmail');
                    showFieldError(emailInput, containerOf(emailInput), '이미 사용 중인 이메일입니다.');
                    revealError(emailInput);
                    return;
                }
                // 사용 가능(true)이거나 확인 불가(null — 네트워크 오류 등)면 제출한다. 후자는 서버가 중복을 다시 막는다.
                joinForm.submit();
            });
        });

        // 입력을 고치면 그 칸의 오류(클라이언트·서버 재렌더 것 모두)를 지운다. 파일 컴포넌트 상태줄(id 있음)은 자기 스크립트가 관리한다.
        joinForm.addEventListener('input', function (event) { clearFieldErrorOf(event.target); });
        joinForm.addEventListener('change', function (event) { clearFieldErrorOf(event.target); });
    }

    // 서버 규칙 순서대로 검사해 오류를 붙이고, 첫 오류 요소(스크롤·포커스 대상)를 돌려준다. 없으면 null.
    function validateJoinForm() {
        clearAllFieldErrors();
        var firstError = null;
        var fail = function (element) {
            if (!firstError) firstError = element;
        };

        // 계정정보 — 간편 로그인 가입은 칸이 없어(서버가 채움) 건너뛴다.
        if (loginIdInput) {
            var loginId = loginIdInput.value.trim();
            if (!loginId) {
                setCau(loginIdCau, 'warring', '아이디는 필수입니다.'); fail(loginIdInput);
            } else if (!/^[a-zA-Z0-9_]{4,20}$/.test(loginId)) {
                setCau(loginIdCau, 'warring', '아이디는 영문·숫자·밑줄 4~20자여야 합니다.'); fail(loginIdInput);
            } else if (loginIdCheckedValue !== loginId) {
                setCau(loginIdCau, 'warring', '아이디 중복확인을 해 주세요.'); fail(loginIdInput);
            }
        }
        if (passwordInput) {
            var passwordError = passwordPolicyError(passwordInput.value);
            if (passwordError) {
                showFieldError(passwordInput, passwordInput, passwordError); fail(passwordInput);
            }
            if (!passwordConfirmInput.value) {
                setCau(passwordConfirmCau, 'warring', '비밀번호 확인은 필수입니다.'); fail(passwordConfirmInput);
            } else if (passwordConfirmInput.value !== passwordInput.value) {
                setCau(passwordConfirmCau, 'warring', '비밀번호와 비밀번호 확인이 일치하지 않습니다.'); fail(passwordConfirmInput);
            }
        }

        // 본인인증 게이트 — 미완료면 STEP2 로 되돌린다(서버도 mobileCertVerified 로 같은 자리에 표시한다).
        if (!(mobileCertVerified && mobileCertVerified.value === 'true')) {
            setCau(mobileCertCau, 'warring', '휴대폰 본인인증을 완료해 주세요.');
            fail(mobileCertBtn || mobileCertCau);
        }

        // 학습자 구분: 필수 — 서류 칸이 이 값으로 갈린다(서버 @NotBlank + 정의 밖 값 거부와 같은 규칙). 오류는 라디오 묶음 아래에 붙인다.
        // 신청서(STEP3)의 첫 칸이라 여기서 본다 — 검사 순서가 곧 '첫 오류' 순서이고, 그 첫 오류로 화면이 옮겨 간다(revealError).
        // 뒤쪽(신청자격 등)에서 보면 구분을 안 고른 제출에서 화면이 한참 아래 칸으로 내려가, 정작 비어 있는 첫 칸을 지나친다.
        var learnerType = selectedLearnerType();
        if (learnerTypeRadios.length && !learnerType) {
            showFieldError(learnerTypeRadios[0], document.getElementById('learnerTypeRadios'), '학습자 구분을 선택해 주세요.');
            fail(learnerTypeRadios[0]);
        }

        // 기본정보
        if (userNameInput) {
            var userName = userNameInput.value.trim();
            if (!userName) {
                showFieldError(userNameInput, containerOf(userNameInput), '이름은 필수입니다.'); fail(userNameInput);
            } else if (userName.length > 50) {
                showFieldError(userNameInput, containerOf(userNameInput), '이름은 50자를 넘을 수 없습니다.'); fail(userNameInput);
            }
        }
        var personalFront = document.getElementById('joinPersonalNoFront');
        var personalBack = document.getElementById('joinPersonalNoBack');
        if (personalFront && personalBack) {
            var front = personalFront.value.trim();
            var back = personalBack.value.trim();
            if (!/^[0-9]{6}$/.test(front)) {
                showFieldError(personalBack, containerOf(personalBack), '주민등록번호 앞자리(생년월일)를 확인해 주세요.'); fail(personalBack);
            } else if (!back) {
                showFieldError(personalBack, containerOf(personalBack), '주민등록번호 뒷자리를 입력해 주세요.'); fail(personalBack);
            } else if (!/^[0-9]{7}$/.test(back)) {
                showFieldError(personalBack, containerOf(personalBack), '주민등록번호 뒷자리는 숫자 7자리입니다.'); fail(personalBack);
            } else if (!matchesRrnGenderDigit(back)) {
                // 뒷자리 첫 숫자는 인증된 성별·출생연도로 정해진다 — 체크섬보다 먼저 봐야 "어디가 틀렸는지"를 알려 줄 수 있다.
                showFieldError(personalBack, containerOf(personalBack),
                    '주민등록번호 뒷자리 첫 숫자가 본인인증된 성별·출생연도와 맞지 않습니다.'); fail(personalBack);
            } else if (!isValidResidentNo(front + back)) {
                showFieldError(personalBack, containerOf(personalBack), '주민등록번호가 올바르지 않습니다.'); fail(personalBack);
            }
        }
        var emailInput = document.getElementById('joinEmail');
        if (emailInput) {
            var email = emailInput.value.trim();
            if (!email) {
                showFieldError(emailInput, containerOf(emailInput), '이메일은 필수입니다.'); fail(emailInput);
            } else if (!isValidEmail(email) || email.length > 100) {
                showFieldError(emailInput, containerOf(emailInput), '이메일 형식이 올바르지 않습니다.'); fail(emailInput);
            }
            // 중복 여부는 동기 검증을 모두 통과한 뒤 제출 직전에 API 로 확인한다(submit 핸들러).
        }
        if (mobileInput && !mobileInput.value.trim()) {
            showFieldError(mobileInput, containerOf(mobileInput), '휴대폰 번호는 필수입니다.'); fail(mobileInput);
        }
        if (birthInput && !/^\d{4}-\d{2}-\d{2}$/.test(birthInput.value)) {
            showFieldError(birthInput, containerOf(birthInput), '생년월일을 올바르게 입력해 주세요.'); fail(birthInput);
        }
        if (genderInputs.length && selectedGender() === '') {
            var genderDd = genderInputs[0].closest('dd');
            showFieldError(genderInputs[0], genderDd.lastElementChild, '성별을 선택해 주세요.'); fail(genderInputs[0]);
        }
        var postcodeInput = document.getElementById('joinPostcode');
        var addressInput = document.getElementById('joinAddress');
        var addrSearchBtn = document.getElementById('addrSearchBtn');
        if (postcodeInput && !postcodeInput.value.trim()) {
            showFieldError(postcodeInput, containerOf(postcodeInput), '우편번호를 입력해 주세요.'); fail(addrSearchBtn || postcodeInput);
        } else if (addressInput && !addressInput.value.trim()) {
            showFieldError(addressInput, addressInput, '기본주소를 입력해 주세요.'); fail(addrSearchBtn || addressInput);
        }

        // 4순위 선택(교육희망장소·활동희망지역): 4개 모두, 서로 달라야 한다 — 서버 ActivityRegions/ActivityAreas 와 같은 규칙.
        // 교육희망장소는 고른 구분이 받지 않으면(보수교육 대상자 — 칸이 감춰짐) 보지 않는다. 활동희망지역은 두 구분 모두 받는다.
        var zone1 = document.getElementById('joinZone1');
        var rankError = hiddenByLearnerType(zone1) ? null : rankSelectError(['joinZone1', 'joinZone2', 'joinZone3', 'joinZone4'], '교육희망장소');
        if (rankError) {
            showFieldError(zone1, noteAfter(containerOf(zone1)), rankError); fail(zone1);
        }
        var areaError = rankSelectError(['joinArea1', 'joinArea2', 'joinArea3', 'joinArea4'], '활동희망지역');
        if (areaError) {
            var area1 = document.getElementById('joinArea1');
            showFieldError(area1, noteAfter(containerOf(area1)), areaError); fail(area1);
        }

        // 전문분야: 1개 이상, '기타'면 직접입력 필수 — 서버 JobFields 와 같은 규칙. 고른 구분이 받지 않으면(칸이 감춰짐) 보지 않는다.
        var jobFieldChecks = joinForm.querySelectorAll('input[name="jobFieldIds"]');
        if (jobFieldChecks.length && !hiddenByLearnerType(jobFieldChecks[0])) {
            var checkedCount = 0;
            for (var j = 0; j < jobFieldChecks.length; j++) {
                if (jobFieldChecks[j].checked) checkedCount++;
            }
            var etcCheck = document.getElementById('jobFieldEtcCheck');
            var etcInput = document.getElementById('jobFieldEtc');
            var jobDd = jobFieldChecks[0].closest('dd');
            var lastGroup = jobDd.querySelector('.job-field-group:last-of-type');
            if (checkedCount === 0) {
                showFieldError(jobFieldChecks[0], lastGroup, '전문분야를 1개 이상 선택해 주세요.'); fail(jobFieldChecks[0]);
            } else if (etcCheck && etcCheck.checked && etcInput && !etcInput.value.trim()) {
                showFieldError(etcInput, lastGroup, '기타 전문분야를 입력해 주세요.'); fail(etcInput);
            }
        }

        // 신청자격: 기본자격·경력인정 분야 전체 중 1개 이상 — 서버 Qualifications 와 같은 규칙(소묶음은 표시용이라 구분하지 않는다).
        // 오류는 서버 th:errors 와 같은 자리(마지막 소묶음 .qualification-group 뒤)에 붙인다. 고정 구분(보수교육 대상자)은 서버가 고정 항목을 저장하므로 보지 않는다.
        var qualificationChecks = joinForm.querySelectorAll('input[name="qualificationIds"]');
        if (qualificationChecks.length && !fixedQualificationCd()) {
            var qualificationChecked = false;
            for (var q = 0; q < qualificationChecks.length; q++) {
                if (qualificationChecks[q].checked) { qualificationChecked = true; break; }
            }
            if (!qualificationChecked) {
                var lastQualificationGroup = qualificationChecks[0].closest('dd').querySelector('.qualification-group:last-of-type');
                showFieldError(qualificationChecks[0], lastQualificationGroup, '신청자격을 1개 이상 선택해 주세요.');
                fail(qualificationChecks[0]);
            }
        }

        // 첨부 — 프로필 사진(두 구분 모두 필수) + 고른 구분의 필수 서류. 파일 컴포넌트의 상태줄(프로필: joinProfileStatus, 문서: <prefix>Status)에 오류를 띄운다.
        var profileImage = document.getElementById('joinProfileImage');
        if (profileImage && profileImage.files.length === 0) {
            var profileStatusEl = document.getElementById('joinProfileStatus');
            profileStatusEl.textContent = '프로필 사진 파일을 첨부해 주세요.';
            profileStatusEl.classList.add('is-error');
            fail(document.getElementById('joinProfileSelect') || profileImage);
        }
        // 구분별 필수 서류 — 서버 LearnerType.requiredDocumentTypes 와 같은 묶음(신규: 3종 / 보수교육: 수료증). 다른 구분의 칸은 감춰져 있어 보지 않는다.
        var requiredDocs = [
            { type: 'NEW', id: 'joinCareerFile', status: 'joinCareerStatus', select: 'joinCareerSelect', label: '이력사항' },
            { type: 'NEW', id: 'joinPerfCertFile', status: 'joinPerfCertStatus', select: 'joinPerfCertSelect', label: '컨설팅 실적 증명서' },
            { type: 'NEW', id: 'joinEthicsFile', status: 'joinEthicsStatus', select: 'joinEthicsSelect', label: '컨설턴트 윤리강령 및 청렴 서약서' },
            { type: 'REFRESHER', id: 'joinCompletionCertFile', status: 'joinCompletionCertStatus', select: 'joinCompletionCertSelect', label: '디지털닥터 수료증' }
        ];
        for (var d = 0; d < requiredDocs.length; d++) {
            if (requiredDocs[d].type !== learnerType) {
                continue;
            }
            var docInput = document.getElementById(requiredDocs[d].id);
            if (docInput && docInput.files.length === 0) {
                setCau(document.getElementById(requiredDocs[d].status), 'warring', requiredDocs[d].label + ' 파일을 첨부해 주세요.');
                fail(document.getElementById(requiredDocs[d].select) || docInput);
            }
        }
        return firstError;
    }

    // 첫 오류로 이동한다. 본인인증(STEP2) 오류면 그 단계로 되돌린 뒤 보여 준다.
    function revealError(element) {
        var panel = element.closest('.stepPanel');
        // 이미 보고 있는 단계면 goStep 을 부르지 않는다 — goStep 은 단계를 바꾼 뒤 맨 위로 부드럽게 스크롤하는데
        // (window.scrollTo top:0), 같은 단계에서 부르면 그 스크롤이 바로 뒤의 scrollIntoView 와 겹쳐 오류 칸으로
        // 가다 말고 화면이 위로 튄다. 단계가 실제로 바뀔 때만 맨 위로 올린다.
        if (panel && panel.dataset.step && !panel.classList.contains('on')) {
            goStep(panel.dataset.step);
        }
        (element.closest('dl') || element).scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof element.focus === 'function' && !element.hidden) {
            try { element.focus({ preventScroll: true }); } catch (e) { /* 포커스 불가 요소 */ }
        }
    }

    // 입력칸 아래에 서버 th:errors 와 같은 마크업(<p class="ip-cau warring">)으로 오류를 붙인다.
    // anchor 뒤에 넣는다(서버가 넣는 자리와 같게 .cut-flex 등 입력 묶음 바로 다음). field 는 지우기 위한 연결용.
    function showFieldError(field, anchor, message) {
        var p = document.createElement('p');
        p.className = 'ip-cau warring';
        p.setAttribute('data-client-error', '');
        p.textContent = message;
        (anchor || field).insertAdjacentElement('afterend', p);
    }

    // 입력칸을 감싼 .cut-flex(있으면). 없으면 입력칸 자체.
    function containerOf(field) {
        return field.closest('.cut-flex') || field;
    }

    // 4순위 select 아래의 안내문(<p class="ip-cau">)이 있으면 그 뒤에 오류를 붙여 서버 오류 자리와 맞춘다.
    function noteAfter(container) {
        var next = container.nextElementSibling;
        return next && next.matches('p.ip-cau:not(.warring)') ? next : container;
    }

    // 지워도 되는 '오류 문구'를 가리키는 선택자 — 아래 두 지우기가 같은 기준을 쓴다.
    //   - p[data-client-error]                  : 이 스크립트가 붙인 오류(showFieldError).
    //   - p.ip-cau.warring:not([id])            : 지난 제출에서 서버 th:errors 가 그려 준 필드 오류.
    //   - :not([id])                            : id 있는 안내줄(#loginIdCau·#mobileCertCau·파일 상태줄)은 자기 스크립트가 켜고 끈다.
    //   - :not([data-static-note])              : 오류가 아니라 늘 떠 있는 안내문(신청자격 dt 의 지원자격 검증 안내)이다 —
    //                                             빨간 글씨라 같은 .warring 를 쓰지만 제출할 때 지워지면 안 된다.
    var FIELD_ERROR_SELECTOR = 'p[data-client-error], p.ip-cau.warring:not([id]):not([data-static-note])';

    // 폼 전체의 클라이언트 오류와, 이전 제출에서 서버가 그려 준 필드 오류를 지운다.
    function clearAllFieldErrors() {
        joinForm.querySelectorAll(FIELD_ERROR_SELECTOR).forEach(function (p) { p.remove(); });
        [loginIdCau, passwordConfirmCau].forEach(function (cau) {
            if (cau && cau.classList.contains('warring')) clearCau(cau);
        });
        var profileStatusEl = document.getElementById('joinProfileStatus');
        if (profileStatusEl && profileStatusEl.classList.contains('is-error')) {
            profileStatusEl.textContent = '선택한 사진이 없습니다.';
            profileStatusEl.classList.remove('is-error');
        }
    }

    // 고친 칸(dd 단위)의 오류만 지운다. 중복확인 안내(on)는 남기고 오류(warring)만 지운다.
    function clearFieldErrorOf(target) {
        var dd = target.closest ? target.closest('dd') : null;
        if (!dd) return;
        dd.querySelectorAll(FIELD_ERROR_SELECTOR).forEach(function (p) { p.remove(); });
        // 아이디는 값을 바꾸면 중복확인이 무효가 된다(다시 확인 필요).
        if (target === loginIdInput && loginIdCheckedValue !== target.value.trim()) {
            loginIdCheckedValue = null;
            clearCau(loginIdCau);
        }
    }

    // 제출 버튼 잠금/해제(이메일 확인 중 중복 클릭 방지).
    function setSubmitDisabled(disabled) {
        joinForm.querySelectorAll('button[type="submit"]').forEach(function (button) {
            button.disabled = disabled;
        });
    }

    // 이메일 사용 가능 여부를 공개 API(GET, CSRF 불필요)로 확인한다. 콜백 인자: true(가능) / false(중복) / null(확인 불가).
    function checkEmailAvailable(email, callback) {
        fetch('/api/users/email/available?email=' + encodeURIComponent(email), {
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) { return res.json(); })
            .then(function (body) {
                callback(body && typeof body.data === 'boolean' ? body.data : null);
            })
            .catch(function () {
                callback(null);
            });
    }

    // 서버 Password.validatePolicy 와 같은 규칙: 8~64자, 공백 불가, 영문(문자)·숫자·특수문자 중 2종 이상.
    function passwordPolicyError(raw) {
        if (!raw) return '비밀번호는 필수입니다.';
        if (raw.length < 8 || raw.length > 64) return '비밀번호는 8자 이상 64자 이하여야 합니다.';
        if (/\s/.test(raw)) return '비밀번호에 공백을 넣을 수 없습니다.';
        var kinds = 0;
        if (/\p{L}/u.test(raw)) kinds++;
        if (/\p{N}/u.test(raw)) kinds++;
        if (/[^\p{L}\p{N}\s]/u.test(raw)) kinds++;
        if (kinds < 2) return '비밀번호는 영문·숫자·특수문자 중 2종 이상을 포함해야 합니다.';
        return null;
    }

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    // 서버 UserPrivacy.isValidResidentNo 와 같은 규칙: 13자리 + 앞 6자리(YYMMDD)가 실재 날짜 + 검증번호 일치.
    function isValidResidentNo(digits) {
        if (!/^[0-9]{13}$/.test(digits)) return false;
        var century;
        switch (digits.charAt(6)) {
            case '1': case '2': case '5': case '6': century = 1900; break;
            case '3': case '4': case '7': case '8': century = 2000; break;
            case '9': case '0': century = 1800; break;
            default: return false;
        }
        var year = century + parseInt(digits.slice(0, 2), 10);
        var month = parseInt(digits.slice(2, 4), 10);
        var day = parseInt(digits.slice(4, 6), 10);
        var date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
        var weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
        var sum = 0;
        for (var i = 0; i < 12; i++) {
            sum += (digits.charCodeAt(i) - 48) * weights[i];
        }
        return (11 - (sum % 11)) % 10 === (digits.charCodeAt(12) - 48);
    }

    // 순위 select 4개: 모두 선택 + 서로 다른 값. 문제없으면 null, 있으면 오류 문구.
    function rankSelectError(ids, label) {
        var values = [];
        for (var i = 0; i < ids.length; i++) {
            var select = document.getElementById(ids[i]);
            if (!select) return null;
            if (!select.value) return label + ' ' + (i + 1) + '순위를 선택해 주세요.';
            if (values.indexOf(select.value) >= 0) return label + '은(는) 순위마다 서로 다르게 선택해야 합니다.';
            values.push(select.value);
        }
        return null;
    }

    /* ============ STEP1 → STEP2 : 필수 약관 동의 확인 ============ */

    var agreeNextBtn = document.getElementById('agreeNextBtn');
    if (agreeNextBtn) {
        agreeNextBtn.addEventListener('click', function () {
            var agreeUse = document.getElementById('agreeUse');
            var agreePrivacy = document.getElementById('agreePrivacy');
            var allRequiredAgreed = agreeUse && agreeUse.checked && agreePrivacy && agreePrivacy.checked;

            if (agreeCau) {
                agreeCau.classList.toggle('none', allRequiredAgreed);
            }
            if (allRequiredAgreed) {
                goStep('2');
            }
        });
    }

    /* ============ STEP2 : 비밀번호 확인 즉시 안내 ============ */

    var passwordInput = document.getElementById('joinPassword');
    var passwordConfirmInput = document.getElementById('joinPasswordConfirm');
    var passwordConfirmCau = document.getElementById('passwordConfirmCau');

    if (passwordConfirmInput && passwordConfirmCau) {
        passwordConfirmInput.addEventListener('input', function () {
            if (!passwordConfirmInput.value) {
                clearCau(passwordConfirmCau);
            } else if (passwordConfirmInput.value === passwordInput.value) {
                setCau(passwordConfirmCau, 'on', '비밀번호가 일치합니다.');
            } else {
                setCau(passwordConfirmCau, 'warring', '비밀번호가 일치하지 않습니다.');
            }
        });
    }

    /* ============ STEP2 : 아이디 중복확인 ============ */

    var loginIdInput = document.getElementById('joinLoginId');
    var checkLoginIdBtn = document.getElementById('checkLoginIdBtn');
    var loginIdCau = document.getElementById('loginIdCau');

    if (checkLoginIdBtn && loginIdInput && loginIdCau) {
        checkLoginIdBtn.addEventListener('click', function () {
            var loginId = loginIdInput.value.trim();
            if (!/^[a-zA-Z0-9_]{4,20}$/.test(loginId)) {
                setCau(loginIdCau, 'warring', '아이디는 영문·숫자·밑줄 4~20자여야 합니다.');
                return;
            }
            // 공개 API(GET, CSRF 불필요). 서버도 가입 저장 시 중복을 다시 막으므로 이 확인은 제출 전 편의 안내다.
            fetch('/api/users/login-id/available?loginId=' + encodeURIComponent(loginId), {
                headers: { 'Accept': 'application/json' }
            })
                .then(function (res) { return res.json(); })
                .then(function (body) {
                    if (body && body.data === true) {
                        loginIdCheckedValue = loginId;   // 제출 전 검증이 이 값과 같을 때만 통과시킨다.
                        setCau(loginIdCau, 'on', '사용할 수 있는 아이디입니다.');
                    } else {
                        setCau(loginIdCau, 'warring', '이미 사용 중인 아이디입니다.');
                    }
                })
                .catch(function () {
                    setCau(loginIdCau, 'warring', '중복확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
                });
        });
    }

    /* ============ STEP2 : 휴대폰 본인인증(KCB OkCert3) — 입력한 신원과 대조 ============ */

    var mobileInput = document.getElementById('joinMobile');
    var userNameInput = document.getElementById('joinUserName');
    var birthInput = document.getElementById('joinBirth');
    var genderInputs = wrap.querySelectorAll('input[name="genderCd"]');
    var mobileCertBtn = document.getElementById('mobileCertBtn');
    var mobileCertCau = document.getElementById('mobileCertCau');
    var mobileCertVerified = document.getElementById('mobileCertVerified');

    var CERT_SUCCESS_CODE = 'B000';
    var certPopup = null;
    var genderLocked = false;

    // 인증완료 후 성별을 바꾸면 서버 대조가 어긋난다. 라디오는 disabled 로 잠그면 제출에서 빠지므로,
    // 클릭만 막아 선택을 고정하고(체크된 값은 그대로 제출) 잠근다.
    Array.prototype.forEach.call(genderInputs, function (radio) {
        radio.addEventListener('click', function (event) {
            if (genderLocked) {
                event.preventDefault();
            }
        });
    });

    // [휴대폰인증] → KCB 인증 팝업을 연다. 이 단계(STEP2)가 본인인증 전용이라 사전 입력 없이 바로 연다.
    // purpose=REGISTER 는 인증 목적(회원가입)이다. 서버가 세션에 담아 인증 신원을 남기고 가입 저장 시 대조한다.
    if (mobileCertBtn) {
        mobileCertBtn.addEventListener('click', function () {
            certPopup = window.open('/identity/mobile-certi?purpose=REGISTER', 'kcbMobileCerti',
                'width=430,height=640,scrollbars=yes,resizable=yes');
            if (!certPopup) {
                setCau(mobileCertCau, 'warring', '팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.');
            }
        });
    }

    // 결과 팝업(views/identity/mobile-certi-result)이 호출하는 opener 콜백.
    // 인증 성공 시, 인증 신원(이름·생년월일·성별·휴대폰)을 정보입력 단계 칸에 채워 잠그고 다음 단계로 넘긴다.
    // 두 번째 인자(alreadyRegistered)는 서버가 판정한 '이미 가입한 사람(본인확인 CI) 또는 이미 가입된 번호' 여부다 —
    // true 면 이 단계에서 막고 넘기지 않는다. 세 번째(socialLinkable)는 간편 로그인 가입일 때 그 기가입 회원(비밀번호 계정)에
    // 소셜 계정을 연결할 수 있다는 뜻이라, 막는 대신 아이디·비밀번호를 받아 연결 폼을 제출한다. 네 번째(socialOnlyProviderLabel)는
    // 그 기가입 회원이 간편 로그인 전용 계정이라 연결할 수 없을 때 가입한 제공자명이다(아니면 null) — 그 제공자로 로그인하라고 안내한다.
    window.executor = window.executor || {};
    window.executor.certiOk = function (type, alreadyRegistered, socialLinkable, socialOnlyProviderLabel) {
        if (type !== 'mobile') {
            return;
        }
        var form = document.kcb_result_form;
        if (!form) {
            return;
        }
        var resultCode = fieldValue(form, 'RSLT_CD');
        if (resultCode !== CERT_SUCCESS_CODE) {
            setCau(mobileCertCau, 'warring',
                '본인인증에 실패했습니다. (' + resultCode + ') 다시 시도해 주세요.');
            return;
        }

        // 이미 가입에 쓰인 휴대폰이면(서버 판정) 정보입력으로 넘기지 않고 이 단계에서 막는다.
        // 간편 로그인 가입이면 막는 대신 그 회원(비밀번호 계정)에 소셜 계정을 연결할지 묻는다(취소하면 종전처럼 막힌 안내).
        // 그 회원이 간편 로그인 전용 계정이면 물어볼 비밀번호가 없어 연결하지 않고, 가입한 제공자로 로그인하라고 안내한다.
        if (alreadyRegistered) {
            if (socialLinkable && offerSocialLink()) {
                return;
            }
            if (socialOnlyProviderLabel !== null && socialOnlyProviderLabel !== undefined) {
                var joinedProvider = socialOnlyProviderLabel ? socialOnlyProviderLabel + ' 간편 로그인' : '간편 로그인';
                setCau(mobileCertCau, 'warring',
                    '이미 ' + joinedProvider + '으로 가입한 회원입니다. 로그인 화면에서 ' + joinedProvider + '을 이용해 주세요.');
                return;
            }
            setCau(mobileCertCau, 'warring',
                '이미 가입된 회원입니다. 로그인 또는 아이디 찾기를 이용해 주세요.');
            return;
        }

        // 인증 신원을 정보입력 칸에 채워 잠근다. 브라우저를 거친 값이라 믿지 않는다 —
        // 저장 시 서버가 세션에 담긴 인증 신원과 다시 대조한다(authoritative).
        var birthYmd = onlyDigits(fieldValue(form, 'RSLT_BIRTHDAY'));
        var genderCd = toGenderCode(fieldValue(form, 'RSLT_SEX_CD'));

        if (userNameInput) {
            userNameInput.value = fieldValue(form, 'RSLT_NAME');
        }
        if (birthInput) {
            birthInput.value = toDateInput(birthYmd);
        }
        setGender(genderCd);
        if (mobileInput) {
            mobileInput.value = formatMobile(fieldValue(form, 'TEL_NO'));
        }
        // 주민등록번호: 앞 6자리(생년월일 YYMMDD)는 채워 읽기전용으로 두고, 뒷자리 7자리는 사용자가 전부 입력한다
        // (첫 숫자를 미리 채워 주면 이어서 6자리만 넣는 건지 헷갈려 뺐다). 첫 숫자가 인증 성별·출생 세기와 맞는지는
        // 제출 검증(allowedRrnGenderDigits)과 서버(MobileCertVerification.matchesPersonalNo)가 대조한다.
        var personalFront = document.getElementById('joinPersonalNoFront');
        var personalBack = document.getElementById('joinPersonalNoBack');
        if (personalFront) {
            personalFront.value = birthYmd.length === 8 ? birthYmd.slice(2) : '';
        }
        if (personalBack) {
            personalBack.value = '';
        }

        // 인증완료로 잠그고(이름·생년월일·성별·휴대폰 수정 불가) 정보입력 단계로 넘긴다.
        markCertVerified();
        goStep('3');
    };

    // 인증완료 상태로 UI 를 잠근다(검증 실패 재렌더 시에도 같은 상태를 복원한다).
    // 인증 후 신원 3종을 바꾸면 서버 대조가 어긋나므로 이름·생년월일·성별도 함께 잠근다.
    function markCertVerified() {
        if (mobileCertVerified) {
            mobileCertVerified.value = 'true';
        }
        lockIdentity(true);
        if (mobileCertBtn) {
            mobileCertBtn.textContent = '인증완료';
            mobileCertBtn.disabled = true;
        }
        setCau(mobileCertCau, 'on', '휴대폰 본인인증이 완료되었습니다.');
    }

    // 인증 전 제출은 위의 제출 전 검증(validateJoinForm)이 STEP2 로 되돌려 막는다. 서버(@AssertTrue mobileCertVerified)도
    // 같은 자리에 오류를 그리는 backstop 이고, 저장 시 세션 신원 대조가 authoritative 라 위조·우회는 서버가 막는다.

    // 검증 실패로 서버가 재렌더했는데 이미 인증돼 있었다면(hidden=true) 인증완료 상태(신원칸 잠금)를 복원한다.
    if (mobileCertVerified && mobileCertVerified.value === 'true') {
        markCertVerified();
    }

    // 본인인증 단계(STEP2)의 '다음' — 인증 완료에서만 정보입력(STEP3)으로 넘긴다(인증 성공 시 certiOk 가 자동 이동하므로 백업 경로).
    var certNextBtn = document.getElementById('certNextBtn');
    if (certNextBtn) {
        certNextBtn.addEventListener('click', function () {
            if (mobileCertVerified && mobileCertVerified.value === 'true') {
                goStep('3');
            } else {
                setCau(mobileCertCau, 'warring', '휴대폰 본인인증을 먼저 완료해 주세요.');
            }
        });
    }

    // 이름·생년월일·성별이 모두 입력됐는지(본인인증 전 최소 조건).
    function identityFilled() {
        var name = userNameInput ? userNameInput.value.trim() : '';
        var birth = onlyDigits(birthInput ? birthInput.value : '');
        return name !== '' && birth.length === 8 && selectedGender() !== '';
    }

    // 선택된 성별(M/F). 미선택이면 빈 문자열.
    function selectedGender() {
        for (var i = 0; i < genderInputs.length; i++) {
            if (genderInputs[i].checked) {
                return genderInputs[i].value;
            }
        }
        return '';
    }

    // 인증 후(또는 복원 시) 신원 입력칸을 잠근다. 휴대폰칸은 마크업에서 항상 readonly 라 여기서 다루지 않는다.
    function lockIdentity(locked) {
        if (userNameInput) {
            userNameInput.readOnly = locked;
        }
        if (birthInput) {
            birthInput.readOnly = locked;
        }
        genderLocked = locked;
    }

    // 이름 대조용 정규화(앞뒤·중간 공백 제거). 한글 이름은 보통 공백이 없어 안전하다. 서버 대조와 규칙을 맞춘다.
    function normalizeName(value) {
        return (value || '').replace(/\s/g, '');
    }

    // 숫자만 남긴다(생년월일 YYYYMMDD 대조용).
    function onlyDigits(value) {
        return (value || '').replace(/\D/g, '');
    }

    // KCB 성별코드(RSLT_SEX_CD) → M/F. 주민번호 성별자리 관례(1·3·5·7=남, 2·4·6·8=여)와 M/F 직전달을 받는다.
    // 서버(MobileCertDto.Result.genderCd)와 같은 매핑이다.
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

    // 주민등록번호 뒷자리 첫 숫자(성별·출생 세기 코드) 후보: 1900년대 남 1·5 / 여 2·6, 2000년대 남 3·7 / 여 4·8
    // (5~8 은 외국인등록번호 — 내외국인 구분을 화면이 모르므로 둘 다 허용). 성별·연도를 모르면 빈 값.
    // 서버(MobileCertVerification.allowedPersonalNoGenderDigits)와 같은 규칙이다.
    function allowedRrnGenderDigits(genderCd, birthYear) {
        if (!birthYear || (genderCd !== 'M' && genderCd !== 'F')) {
            return '';
        }
        var bornIn2000s = parseInt(birthYear, 10) >= 2000;
        if (genderCd === 'M') {
            return bornIn2000s ? '37' : '15';
        }
        return bornIn2000s ? '48' : '26';
    }

    // 제출 검증용: 입력한 뒷자리 첫 숫자가 (인증으로 잠긴) 성별·생년월일 칸과 맞는지. 성별·생년을 아직 모르면 서버 판정에 맡긴다(true).
    function matchesRrnGenderDigit(personalNoBack) {
        var birthYear = birthInput && /^\d{4}-/.test(birthInput.value) ? birthInput.value.slice(0, 4) : '';
        var allowedDigits = allowedRrnGenderDigits(selectedGender(), birthYear);
        return !allowedDigits || allowedDigits.indexOf(personalNoBack.charAt(0)) >= 0;
    }

    // 인증 신원의 성별(M/F)로 라디오를 선택한다. 이후 markCertVerified→lockIdentity 가 클릭을 막아 고정한다.
    function setGender(code) {
        for (var i = 0; i < genderInputs.length; i++) {
            genderInputs[i].checked = (genderInputs[i].value === code);
        }
    }

    // YYYYMMDD → date 입력 형식(YYYY-MM-DD). 8자리가 아니면 빈 값.
    function toDateInput(yyyymmdd) {
        if (!yyyymmdd || yyyymmdd.length !== 8) {
            return '';
        }
        return yyyymmdd.slice(0, 4) + '-' + yyyymmdd.slice(4, 6) + '-' + yyyymmdd.slice(6, 8);
    }

    // 휴대폰 번호(숫자만) → 010-1234-5678 형태로 보기 좋게 정리한다.
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

    /* ============ helpers ============ */

    // 기가입 회원에 소셜 계정 연결 — 기존 계정의 아이디·비밀번호를 받아 POST /join/social-link 로 제출한다. 소셜 가입 화면
    // (social_link_form 이 있을 때)에서만 동작하고, 그 밖엔 false 를 돌려 호출 측이 종전 "이미 가입된 회원" 안내로 떨어지게 한다.
    // 회원은 서버가 세션의 인증 신원으로 찾으므로 여기서 보내는 값은 아이디·비밀번호뿐이다.
    // errorText·initialLoginId 는 불일치로 되돌아왔을 때의 안내와 다시 채울 아이디다.
    function offerSocialLink(errorText, initialLoginId) {
        var linkForm = document.getElementById('social_link_form');
        var loginIdField = document.getElementById('social_link_login_id');
        var passwordField = document.getElementById('social_link_password');
        var notice = document.getElementById('social_signup_notice');
        if (!linkForm || !loginIdField || !passwordField || !notice || typeof window.sstDialog !== 'function') {
            return false;
        }
        var provider = notice.getAttribute('data-provider') || '소셜';
        setCau(mobileCertCau, 'on', '이미 가입된 회원입니다. 기존 계정의 아이디·비밀번호를 입력하면 ' + provider + ' 계정을 연결합니다.');

        // 입력창은 DOM 으로 조립한다 — 서버 문구(errorText)를 innerHTML 에 섞지 않는다.
        var dialogForm = document.createElement('div');
        var loginIdInput = document.createElement('input');
        loginIdInput.type = 'text';
        loginIdInput.id = 'socialLinkLoginIdInput';
        loginIdInput.placeholder = '기존 계정 아이디';
        loginIdInput.autocomplete = 'username';
        loginIdInput.value = initialLoginId || '';
        dialogForm.appendChild(loginIdInput);
        var passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.id = 'socialLinkPasswordInput';
        passwordInput.placeholder = '기존 계정 비밀번호';
        passwordInput.autocomplete = 'current-password';
        dialogForm.appendChild(passwordInput);
        var dialogCau = document.createElement('p');
        dialogCau.className = 'ip-cau' + (errorText ? ' warring' : '');
        dialogCau.textContent = errorText || '';
        dialogForm.appendChild(dialogCau);

        function showDialogError(message, focusTarget) {
            dialogCau.textContent = message;
            dialogCau.classList.add('warring');
            focusTarget.focus();
            return false;
        }

        window.sstDialog({
            icon: 'quest',
            title: '기존 회원 계정 연결',
            text: '본인인증 정보와 일치하는 회원이 이미 있습니다. 기존 계정의 아이디와 비밀번호를 입력하면 이 ' + provider
                + ' 계정을 연결하고 로그인합니다.',
            form: dialogForm,
            showCancel: true,
            confirmText: '연결하고 로그인',
            cancelText: '취소',
            onConfirm: function () {
                if (!loginIdInput.value.trim()) {
                    return showDialogError('아이디를 입력해 주세요.', loginIdInput);
                }
                if (!passwordInput.value) {
                    return showDialogError('비밀번호를 입력해 주세요.', passwordInput);
                }
                loginIdField.value = loginIdInput.value.trim();
                passwordField.value = passwordInput.value;
                linkForm.submit();
            },
            onCancel: function () {
                setCau(mobileCertCau, 'warring',
                    '이미 가입된 회원입니다. 로그인 또는 아이디 찾기를 이용해 주세요.');
            }
        });
        (initialLoginId ? passwordInput : loginIdInput).focus();
        return true;
    }

    // 아이디·비밀번호 불일치로 되돌아온 화면(서버가 STEP2 로 열고 social_link_retry 를 내림)이면 입력창을 곧바로 다시 연다.
    (function reopenSocialLinkOnRetry() {
        var retry = document.getElementById('social_link_retry');
        if (!retry || !mobileCertCau) {
            return;
        }
        offerSocialLink(retry.getAttribute('data-error') || '', retry.getAttribute('data-login-id') || '');
    })();

    function setCau(el, kind, message) {
        el.textContent = message;
        el.classList.remove('on', 'warring');
        el.classList.add(kind);
    }

    function clearCau(el) {
        el.textContent = '';
        el.classList.remove('on', 'warring');
    }
});
