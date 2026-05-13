let sstModalState;
let sstDialogState;
let sstToastItems = [];
const sstToastMotion = 1000;


// 토스트 영역

/**
 * Common toast message.
 *
 * Usage:
 * sstToast({
 *     icon: 'error' | 'comple' | 'warning' | 'info' | 'quest', // optional
 *     title: 'Toast title',
 *     text: 'Toast message', 
 *     duration: 3000,
 *     closable: true,
 *     onClose: function() {
 *         // Runs after the toast closes.
 *     }
 * });
 *
 * Close manually:
 * const toast = sstToast({ title: 'Saved' });
 * sstToastClose(toast);
 * sstToastClose(); // closes the latest toast
 */

function buildSstToast(options = {}) {
    const iconTypes = ['error', 'comple', 'warning', 'info', 'quest'];
    const {
        icon = '',
        title = '',
        text = '',
        closable = true
    } = options;
    const iconClass = iconTypes.includes(icon) ? icon : '';
    const toast = document.createElement('div');
    const closeButton = document.createElement('button');
    const iconEl = document.createElement('i');

    toast.className = 'tstArea';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-1rem)';
    toast.style.transition = `top ${sstToastMotion}ms ease, opacity ${sstToastMotion}ms ease, transform ${sstToastMotion}ms ease`;

    closeButton.type = 'button';
    closeButton.className = 'toastClose';
    closeButton.setAttribute('aria-label', 'close');

    if (iconClass) {
        iconEl.className = iconClass;
    }

    if (closable) {
        toast.appendChild(closeButton);
    }
    toast.appendChild(iconEl);

    if (text) {
        const list = document.createElement('dl');
        const titleEl = document.createElement('dt');
        const textEl = document.createElement('dd');

        titleEl.textContent = title;
        textEl.textContent = text;
        list.append(titleEl, textEl);
        toast.appendChild(list);
    } else {
        const titleEl = document.createElement('span');

        titleEl.textContent = title;
        toast.appendChild(titleEl);
    }

    return toast;
}

function refreshSstToastPosition() {
    const gap = 12;
    let top = 15;

    sstToastItems.forEach(toast => {
        toast.style.top = `${top}px`;
        top += toast.offsetHeight + gap;
    });
}

function sstToast(options = {}) {
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', () => sstToast(options), { once: true });
        return;
    }

    const {
        duration = 3000,
        onClose
    } = options;
    const toast = buildSstToast(options);
    const closeButton = toast.querySelector('.toastClose');

    toast.sstToastTimer = null;
    toast.sstToastOnClose = onClose;
    closeButton?.addEventListener('click', () => sstToastClose(toast));

    document.body.appendChild(toast);
    sstToastItems.push(toast);
    refreshSstToastPosition();

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    if (duration > 0) {
        toast.sstToastTimer = window.setTimeout(() => sstToastClose(toast), duration);
    }

    return toast;
}

function sstToastClose(target) {
    const toast = target || sstToastItems.at(-1);

    if (!toast || toast.dataset.toastClosing === 'true') {
        return;
    }

    toast.dataset.toastClosing = 'true';
    window.clearTimeout(toast.sstToastTimer);
    toast.style.pointerEvents = 'none';
    toast.style.transition = `top ${sstToastMotion}ms ease, opacity ${sstToastMotion}ms ease, transform ${sstToastMotion}ms ease`;

    sstToastItems = sstToastItems.filter(item => item !== toast);
    refreshSstToastPosition();

    requestAnimationFrame(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-1rem)';
    });

    window.setTimeout(() => {
        toast.remove();
        toast.sstToastOnClose?.();
    }, sstToastMotion);
}

function bindStaticSstToast() {
    document.querySelectorAll('.tstArea').forEach(toast => {
        if (toast.dataset.toastBound === 'true') {
            return;
        }

        toast.dataset.toastBound = 'true';
        toast.querySelector('.toastClose')?.addEventListener('click', () => {
            sstToastClose(toast);
        });
    });
}







// 모달 영역

/**
 * Common modal popup.
 *
 * Usage:
 * sstModal({
 *     icon: 'fail' | 'comple' | 'warning' | 'info', // optional
 *     title: 'Modal title',
 *     text: 'Modal message',
 *     showCancel: true,       // optional, default false
 *     showConfirm: true,      // optional, default true
 *     confirmText: 'Confirm', // optional
 *     cancelText: 'Cancel',   // optional
 *     onConfirm: function() {
 *         // Runs when confirm button is clicked.
 *         // return false to keep the modal open.
 *     },
 *     onCancel: function() {
 *         // Runs when cancel button is clicked.
 *         // return false to keep the modal open.
 *     }
 * });
 *
 * Close manually:
 * sstModalClose();
 */


function getSstModal() {
    if (sstModalState) {
        return sstModalState;
    }

    let modalArea = document.getElementById('modalArea');

    if (!modalArea) {
        modalArea = document.createElement('div');
        modalArea.id = 'modalArea';
        document.body.appendChild(modalArea);
    }

    if (!modalArea.querySelector('.modalItem')) {
        modalArea.innerHTML = `
            <div class="modalItem">
                <button type="button" class="modalClose" aria-label="close"></button>
                <i></i>
                <p></p>
                <span></span>
                <div class="mdBtn">
                    <button type="button" class="bt-a-m ne">\uCDE8\uC18C</button>
                    <button type="button" class="bt-a-m po">\uD655\uC778</button>
                </div>
            </div>
        `;
    }

    if (!modalArea.querySelector('.mdBtn')) {
        modalArea.querySelector('.modalItem').insertAdjacentHTML('beforeend', `
            <div class="mdBtn">
                <button type="button" class="bt-a-m ne">\uCDE8\uC18C</button>
                <button type="button" class="bt-a-m po">\uD655\uC778</button>
            </div>
        `);
    }

    const state = {
        area: modalArea,
        icon: modalArea.querySelector('.modalItem > i'),
        title: modalArea.querySelector('.modalItem > p'),
        text: modalArea.querySelector('.modalItem > span'),
        buttonArea: modalArea.querySelector('.mdBtn'),
        cancelButton: modalArea.querySelector('.mdBtn .ne'),
        confirmButton: modalArea.querySelector('.mdBtn .po')
    };

    state.area.querySelector('.modalClose')?.addEventListener('click', sstModalClose);

    state.area.addEventListener('click', function(e) {
        if (!e.target.closest('.modalItem')) {
            sstModalClose();
        }
    });

    sstModalState = state;
    return state;
}

function sstModal(options = {}) {
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', () => sstModal(options), { once: true });
        return;
    }

    const iconTypes = ['error', 'comple', 'warning', 'info', 'quest'];
    const {
        icon = '',
        title = '',
        text = '',
        confirmText = '\uD655\uC778',
        cancelText = '\uCDE8\uC18C',
        showConfirm = true,
        showCancel = false,
        onConfirm,
        onCancel
    } = options;
    const iconClass = iconTypes.includes(icon) ? icon : '';
    const modal = getSstModal();

    if (iconClass) {
        modal.icon.className = iconClass;
    } else {
        modal.icon.removeAttribute('class');
    }

    modal.title.textContent = title;
    modal.text.textContent = text;
    modal.confirmButton.textContent = confirmText;
    modal.cancelButton.textContent = cancelText;
    modal.confirmButton.style.display = showConfirm ? '' : 'none';
    modal.cancelButton.style.display = showCancel ? '' : 'none';
    modal.buttonArea.style.display = showConfirm || showCancel ? '' : 'none';

    modal.confirmButton.onclick = function() {
        if (onConfirm?.() !== false) {
            sstModalClose();
        }
    };

    modal.cancelButton.onclick = function() {
        if (onCancel?.() !== false) {
            sstModalClose();
        }
    };

    modal.area.classList.add('open');
}

function sstModalClose() {
    if (!document.body) {
        return;
    }

    const modal = getSstModal();
    modal.area.classList.remove('open');
}


// 다이어로그

/**
 * Common dialog popup (form-capable).
 *
 * Usage:
 * sstDialog({
 *     icon: 'error' | 'comple' | 'warning' | 'info' | 'quest', // optional
 *     title: 'Dialog title',
 *     text: 'Dialog message',
 *     form: '<input type="text" />' | HTMLElement | DocumentFragment, // optional, custom form HTML/DOM
 *     showCancel: true,       // optional, default true
 *     showConfirm: true,      // optional, default true
 *     confirmText: 'Confirm', // optional
 *     cancelText: 'Cancel',   // optional
 *     onConfirm: function(formArea, tableArea) {
 *         // formArea: .form-m element, tableArea: .tb-form tbody element.
 *         // Read field values from either area.
 *         // return false to keep the dialog open.
 *     },
 *     onCancel: function(formArea, tableArea) {
 *         // return false to keep the dialog open.
 *     }
 * });
 *
 * Close manually:
 * sstDialogClose();
 */

function getSstDialog() {
    if (sstDialogState) {
        return sstDialogState;
    }

    let dialogArea = document.getElementById('dialogArea');

    if (!dialogArea) {
        dialogArea = document.createElement('div');
        dialogArea.id = 'dialogArea';
        document.body.appendChild(dialogArea);
    }

    if (!dialogArea.querySelector('.dialogItem')) {
        dialogArea.innerHTML = `
            <div class="dialogItem">
                <button type="button" class="dialogClose" aria-label="close"></button>
                <i></i>
                <p></p>
                <span></span>
                <div class="form-m"></div>
                <div class="tb-form">
                    <table>
                        <colgroup>
                            <col width="30%">
                            <col width="70%">
                        </colgroup>
                        <tbody></tbody>
                    </table>
                </div>
                <div class="dlBtn">
                    <button type="button" class="bt-a-m ne">취소</button>
                    <button type="button" class="bt-a-m po">확인</button>
                </div>
            </div>
        `;
    }

    const state = {
        area: dialogArea,
        icon: dialogArea.querySelector('.dialogItem > i'),
        title: dialogArea.querySelector('.dialogItem > p'),
        text: dialogArea.querySelector('.dialogItem > span'),
        formArea: dialogArea.querySelector('.form-m'),
        tableBox: dialogArea.querySelector('.tb-form'),
        tableArea: dialogArea.querySelector('.tb-form tbody'),
        buttonArea: dialogArea.querySelector('.dlBtn'),
        cancelButton: dialogArea.querySelector('.dlBtn .ne'),
        confirmButton: dialogArea.querySelector('.dlBtn .po')
    };

    state.area.querySelector('.dialogClose')?.addEventListener('click', sstDialogClose);

    state.area.addEventListener('click', function(e) {
        if (!e.target.closest('.dialogItem')) {
            sstDialogClose();
        }
    });

    sstDialogState = state;
    return state;
}

function sstDialog(options = {}) {
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', () => sstDialog(options), { once: true });
        return;
    }

    const iconTypes = ['error', 'comple', 'warning', 'info', 'quest'];
    const {
        icon = '',
        title = '',
        text = '',
        form = '',
        table = '',
        confirmText = '확인',
        cancelText = '취소',
        showConfirm = true,
        showCancel = true,
        onConfirm,
        onCancel
    } = options;
    const iconClass = iconTypes.includes(icon) ? icon : '';
    const dialog = getSstDialog();

    if (iconClass) {
        dialog.icon.className = iconClass;
    } else {
        dialog.icon.removeAttribute('class');
    }

    dialog.title.textContent = title;
    dialog.text.textContent = text;

    dialog.formArea.replaceChildren();
    if (form) {
        if (typeof form === 'string') {
            dialog.formArea.innerHTML = form;
        } else if (form instanceof Node) {
            dialog.formArea.appendChild(form);
        }
    }
    dialog.tableArea.replaceChildren();
    if (table) {
        if (typeof table === 'string') {
            dialog.tableArea.innerHTML = table;
        } else if (table instanceof Node) {
            dialog.tableArea.appendChild(table);
        }
    }
    dialog.tableBox.style.display = dialog.tableArea.children.length ? '' : 'none';
    dialog.formArea.style.display = dialog.formArea.children.length ? '' : 'none';

    dialog.confirmButton.textContent = confirmText;
    dialog.cancelButton.textContent = cancelText;
    dialog.confirmButton.style.display = showConfirm ? '' : 'none';
    dialog.cancelButton.style.display = showCancel ? '' : 'none';
    dialog.buttonArea.style.display = showConfirm || showCancel ? '' : 'none';

    dialog.confirmButton.onclick = function() {
        if (onConfirm?.(dialog.formArea, dialog.tableArea) !== false) {
            sstDialogClose();
        }
    };

    dialog.cancelButton.onclick = function() {
        if (onCancel?.(dialog.formArea, dialog.tableArea) !== false) {
            sstDialogClose();
        }
    };

    dialog.area.classList.add('open');
}

function sstDialogClose() {
    if (!document.body) {
        return;
    }

    const dialog = getSstDialog();
    dialog.area.classList.remove('open');
}


window.sstModal = sstModal;
window.sstModalClose = sstModalClose;
window.sstDialog = sstDialog;
window.sstDialogClose = sstDialogClose;
window.sstToast = sstToast;
window.sstToastClose = sstToastClose;




document.addEventListener('DOMContentLoaded', () => {

    // 바형 탭 영역
    document.querySelectorAll('.barTab').forEach(bar => {
        const items = bar.querySelectorAll(':scope > li');
        if (!bar.querySelector(':scope > li.on') && items[0]) {
            items[0].classList.add('on');
        }
        items.forEach(li => {
            li.addEventListener('mouseenter', () => {
                items.forEach(el => el.classList.remove('hov'));
                li.classList.add('hov');
            });
            li.addEventListener('click', () => {
                items.forEach(el => el.classList.remove('on'));
                li.classList.add('on');
            });
        });
        bar.addEventListener('mouseleave', () => {
            items.forEach(el => el.classList.remove('hov'));
        });
    });


    // 모달 및 토스트
    getSstModal();
    bindStaticSstToast();

    document.querySelectorAll('.modalOpen').forEach(button => {
        button.addEventListener('click', function() {
            window.sstModal({
                icon: this.dataset.icon || '',
                title: this.dataset.title || 'title',
                text: this.dataset.text || 'text'
            });
        });
    });

    document.querySelectorAll('.toastOpen').forEach(button => {
        button.addEventListener('click', function() {
            window.sstToast({
                icon: this.dataset.icon || '',
                title: this.dataset.title || 'title',
                text: this.dataset.text || '',
                duration: Number(this.dataset.duration ?? 3000)
            });
        });
    });
});


document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && sstModalState?.area.classList.contains('open')) {
        sstModalClose();
    }
});
