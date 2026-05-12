let sstModalState;

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

function sstDialogShow() {
    
}

function sstModalClose() {
    if (!document.body) {
        return;
    }

    const modal = getSstModal();
    modal.area.classList.remove('open');
}

window.sstModal = sstModal;
window.sstModalClose = sstModalClose;

document.addEventListener('DOMContentLoaded', () => {
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

    getSstModal();

    document.querySelectorAll('.modalOpen').forEach(button => {
        button.addEventListener('click', function() {
            window.sstModal({
                icon: this.dataset.icon || '',
                title: this.dataset.title || 'title',
                text: this.dataset.text || 'text'
            });
        });
    });
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && sstModalState?.area.classList.contains('open')) {
        sstModalClose();
    }
});
