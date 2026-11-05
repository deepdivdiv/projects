/*
  첨부 파일 한 칸(공통 첨부 컴포넌트 .file-drop-s / .file-list)의 동작.

  비었을 때는 드롭존을, 파일이 있으면 한 줄짜리 목록을 보여 주고 [파일변경]·[삭제]·끌어다 놓기를 처리한다.
  같은 동작이 회원가입(join.js)과 회원정보수정(mypage_modify.html 인라인)에 각각 들어가 있어, 세 번째 화면
  (학습자 구분 선택 모달 — views/user/learner_type.html)을 만들며 <b>파일로 뽑아</b> window.initFileAttach 로 연다.
  먼저 만든 두 화면은 각자의 사본을 그대로 쓴다(돌고 있는 화면을 건드리지 않는다) — 그 둘을 손댈 일이 생기면 이 파일로 모은다.

  마크업 계약(prefix 로 id 를 맞춘다. 없는 칸이면 아무것도 하지 않고 돌아간다):
    <prefix>File       input[type=file] (hidden — 드롭존 '밖'에 둔다. 안에 두면 input.click() 이 드롭존으로 되올라와 파일 창이 두 번 열린다)
    <prefix>Drop       .file-drop-s      비었을 때 보이는 드롭존
    <prefix>List       .file-list        파일이 있을 때 보이는 목록(서버가 등록 파일을 그려 두면 이쪽이 열린 채 렌더된다)
    <prefix>Select     드롭존 안 [파일찾기] 버튼(선택)
    <prefix>Change     목록 안 [파일변경] 버튼(선택)
    <prefix>Remove     목록 안 [삭제] 버튼(선택)
    <prefix>Name       고른/등록된 파일명이 들어가는 자리
    <prefix>Size       그 파일 용량
    <prefix>TotalSize  목록 머리의 합계 용량(한 건 자리라 같은 값)
    <prefix>Status     오류 한 줄(비면 :empty 로 감춰진다)
    <prefix>Kept       등록 파일을 '남길' 표식 hidden(선택 첨부에만 둔다 — 필수 칸은 서버가 지우지 않아 표식도 없다)

  required=true 인 칸은 등록된 파일을 [삭제]로 비울 수 없다 — 서버도 빈 제출을 '기존 유지'로 보기 때문에
  (UserService.saveUserFile) 화면만 비면 실제와 어긋난다. 그때는 이번에 고른 파일만 되돌리고 모달로 알린다.
*/
(function () {
    'use strict';

    /* 필수 첨부의 등록 파일을 지우려 했을 때의 안내. 막힌 동작이라 사라지는 토스트가 아니라 화면 가운데 모달로 알린다
       (ui.components.js·common.js 의 sstModal). 그 스크립트가 없는 화면에서는 alert 로 떨어뜨린다. */
    function notifyRequiredFile(label, actionLabel) {
        var text = (label || '이 파일') + '은(는) 필수 첨부 파일이라 삭제할 수 없습니다. 바꾸려면 ['
                + (actionLabel || '파일변경') + ']으로 새 파일을 올려 주세요.';
        if (typeof window.sstModal === 'function') {
            window.sstModal({ icon: 'warning', title: '확인', text: text });
            return;
        }
        window.alert(text);
    }

    function initFileAttach(prefix, extensions, maxBytes, maxLabel, label, required) {
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
        var kept = document.getElementById(prefix + 'Kept');
        if (!drop || !list || !nameEl || !sizeEl || !totalSizeEl || !statusEl) return;

        /* 서버가 등록 파일을 그려 둔 채 열렸는지 — 그때만 목록이 보이는 상태로 렌더된다(th:style).
           되돌릴 때 쓰려고 그 표기(파일명·용량)를 그대로 들고 있는다. */
        var hasStoredFile = list.style.display !== 'none';
        var storedName = nameEl.textContent;
        var storedSize = sizeEl.textContent;
        var storedTotalSize = totalSizeEl.textContent;

        function sizeText(bytes) {
            if (bytes < 1024) return '(' + bytes + 'B)';
            if (bytes < 1024 * 1024) return '(' + (bytes / 1024).toFixed(1) + 'KB)';
            return '(' + (bytes / (1024 * 1024)).toFixed(2) + 'MB)';
        }

        /* 오류 문구는 안내문 아래 한 줄(statusEl)에만 쓰고, 없으면 비워서 감춘다(:empty). */
        function setError(message) {
            statusEl.textContent = message || '';
            statusEl.classList.toggle('is-error', Boolean(message));
        }

        /* 이번에 고른 파일을 되돌린다. 등록된 파일이 있으면 드롭존이 아니라 그 파일 표기로 복귀한다. */
        function clear(message) {
            input.value = '';
            drop.classList.remove('drag-over');
            if (hasStoredFile) {
                if (kept) kept.disabled = false;
                nameEl.textContent = storedName;
                sizeEl.textContent = storedSize;
                totalSizeEl.textContent = storedTotalSize;
                drop.style.display = 'none';
                list.style.display = '';
                setError(message);
                return;
            }
            // .file-drop-s 가 display:flex 라 .none/hidden 이 안 먹혀 인라인 style 로 토글한다.
            list.style.display = 'none';
            drop.style.display = '';
            setError(message);
        }

        function show(file) {
            // 새 파일이 등록 파일을 대신한다 — 남길 표식을 끄면 서버가 옛 파일을 지우고 새 파일만 남긴다(한 건 자리).
            if (kept) kept.disabled = true;
            nameEl.textContent = file.name;
            sizeEl.textContent = sizeText(file.size);
            totalSizeEl.textContent = sizeText(file.size);
            drop.style.display = 'none';
            drop.classList.remove('drag-over');
            list.style.display = '';
            setError('');
        }

        /* 드래그로 들어온 파일은 확장자·용량을 여기서 한 번 더 본다(accept 는 파일 창에만 걸린다). */
        function accept(file) {
            if (!file) return;
            var dotIndex = file.name.lastIndexOf('.');
            var extension = dotIndex < 0 ? '' : file.name.slice(dotIndex + 1).toLowerCase();
            if (extensions.indexOf(extension) < 0) {
                clear(extensions.join(', ').toUpperCase() + ' 파일만 첨부할 수 있습니다.');
                return;
            }
            if (file.size > maxBytes) {
                clear(maxLabel + ' 이하의 파일을 선택해 주세요.');
                return;
            }
            show(file);
        }

        drop.addEventListener('click', function () { input.click(); });
        if (change) change.addEventListener('click', function () { input.click(); });
        if (remove) remove.addEventListener('click', function () {
            // 필수 첨부의 등록 파일은 지울 수 없다 — 이번에 고른 파일만 되돌리고 그 사실을 알린다.
            if (hasStoredFile && required) {
                clear();
                notifyRequiredFile(label);
                return;
            }
            // 선택 첨부의 등록 파일은 지운다 — 남길 표식을 끄고(미전송) 이후로는 '등록 파일 없음'으로 다룬다.
            if (hasStoredFile) {
                hasStoredFile = false;
                if (kept) kept.disabled = true;
            }
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
    }

    window.initFileAttach = initFileAttach;
})();
