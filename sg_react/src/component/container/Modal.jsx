/* eslint-disable react-refresh/only-export-components */
/**
 * 모달 (store + 렌더러 한 파일)
 *
 * 사용법
 *  1) App 최상단에 <Modal /> 한 번만 마운트
 *  2) 어디서든 sstModal({ icon, title, text, ... }) 호출
 *
 * 한 번에 하나만 띄우는 싱글톤.
 * 진입/퇴장 애니메이션은 board.css 의 #modalArea / #modalArea.open 규칙에
 * 의존한다(opacity·visibility 트랜지션, body 스크롤 잠금까지 CSS가 처리).
 * 따라서 컨테이너는 반드시 id="modalArea" 이고, open 클래스만 토글한다.
 * 닫을 때는 트랜지션(300ms)이 끝날 때까지 DOM 을 유지한 뒤 제거한다.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/* ────────────── store (컴포넌트 바깥 = 모듈 스코프) ────────────── */

const SST_MODAL_MOTION = 300; // 퇴장 트랜지션 시간(ms) — board.css 와 일치
const ICON_TYPES = ["error", "comple", "warning", "info", "quest"];

// current: { id, options, closing } | null
let current = null;
let idCounter = 0;
const listeners = new Set();

const emit = () => listeners.forEach((listener) => listener(current));

// useSyncExternalStore 용 구독/스냅샷
const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
const getSnapshot = () => current;

/**
 * 모달 띄우기
 * @param {Object}   options
 * @param {"error"|"comple"|"warning"|"info"|"quest"} [options.icon]
 * @param {string}   [options.title]
 * @param {string}   [options.text]
 * @param {string}   [options.confirmText="확인"]
 * @param {string}   [options.cancelText="취소"]
 * @param {boolean}  [options.showConfirm=true]
 * @param {boolean}  [options.showCancel=false]
 * @param {Function} [options.onConfirm]  false 를 반환하면 닫지 않음
 * @param {Function} [options.onCancel]   false 를 반환하면 닫지 않음
 */
export function sstModal(options = {}) {
    current = { id: ++idCounter, options, closing: false };
    emit();
}

/** 모달 닫기 — 퇴장 트랜지션 후 실제 제거 */
export function sstModalClose() {
    if (!current || current.closing) {
        return;
    }

    const targetId = current.id;

    // 1) 퇴장 애니메이션을 위해 open 클래스만 먼저 끔(closing 플래그)
    current = { ...current, closing: true };
    emit();

    // 2) 트랜지션이 끝난 뒤 실제 제거
    window.setTimeout(() => {
        if (current?.id === targetId) {
            current = null;
            emit();
        }
    }, SST_MODAL_MOTION);
}

/* ────────────── 렌더러 ────────────── */

function ModalItem({ state }) {
    const [entered, setEntered] = useState(false);

    // 마운트 직후 진입 애니메이션 트리거 (open 클래스 부착)
    useEffect(() => {
        const raf = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    const {
        icon = "",
        title = "",
        text = "",
        confirmText = "확인",
        cancelText = "취소",
        showConfirm = true,
        showCancel = false,
        onConfirm,
        onCancel,
    } = state.options;

    const iconClass = ICON_TYPES.includes(icon) ? icon : "";
    const open = entered && !state.closing;

    const handleConfirm = () => {
        if (onConfirm?.() !== false) {
            sstModalClose();
        }
    };

    const handleCancel = () => {
        if (onCancel?.() !== false) {
            sstModalClose();
        }
    };

    // 배경(딤) 클릭 시 닫기 — 모달 본체(.modalItem) 내부 클릭은 무시
    const handleDimClick = (e) => {
        if (!e.target.closest(".modalItem")) {
            sstModalClose();
        }
    };

    return (
        <div id="modalArea" className={open ? "open" : ""} onClick={handleDimClick}>
            <div className="modalItem">
                <button
                    type="button"
                    className="modalClose"
                    aria-label="close"
                    onClick={sstModalClose}
                />
                {iconClass ? <i className={iconClass} /> : <i />}
                <p>{title}</p>
                <span>{text}</span>
                {(showConfirm || showCancel) && (
                    <div className="mdBtn">
                        {showCancel && (
                            <button type="button" className="bt-a-m ne" onClick={handleCancel}>
                                {cancelText}
                            </button>
                        )}
                        {showConfirm && (
                            <button type="button" className="bt-a-m po" onClick={handleConfirm}>
                                {confirmText}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function Modal() {
    // 모듈 store(current)를 구독 — effect 없이 동기화
    const state = useSyncExternalStore(subscribe, getSnapshot);

    if (!state) {
        return null;
    }

    // 열릴 때마다 새 key 로 ModalItem 을 새로 마운트 → entered 가 초기화되어
    // 매번 진입 애니메이션이 다시 트리거된다.
    return createPortal(<ModalItem key={state.id} state={state} />, document.body);
}

export default Modal;
