/* eslint-disable react-refresh/only-export-components */
/**
 * 다이얼로그 (store + 렌더러 한 파일)
 *
 * 사용법
 *  1) App 최상단에 <Dialog /> 한 번만 마운트
 *  2) 어디서든 sstDialog({ icon, title, text, form, table, ... }) 호출
 *
 * Modal 과 동작 패턴은 동일(싱글톤 + 포털 + open 클래스 토글)하되,
 * 입력 폼(form-m)과 표(tb-form)를 추가로 끼워 넣을 수 있다.
 * form / table 에는 JSX(React 노드)를 그대로 넘긴다.
 * onConfirm / onCancel 은 (formEl, tableEl) DOM 을 인자로 받아
 * 내부 input 값 등을 직접 읽을 수 있고, false 를 반환하면 닫히지 않는다.
 *
 * 진입/퇴장 애니메이션은 css 의 #dialogArea / #dialogArea.open 규칙에 의존한다.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/* ────────────── store (모듈 스코프) ────────────── */

const SST_DIALOG_MOTION = 300; // 퇴장 트랜지션 시간(ms) — css 와 일치
const ICON_TYPES = ["error", "comple", "warning", "info", "quest"];

// current: { id, options, closing } | null
let current = null;
let idCounter = 0;
const listeners = new Set();

const emit = () => listeners.forEach((listener) => listener(current));

const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
const getSnapshot = () => current;

/**
 * 다이얼로그 띄우기
 * @param {Object}   options
 * @param {"error"|"comple"|"warning"|"info"|"quest"} [options.icon]
 * @param {string}        [options.title]
 * @param {string}        [options.text]
 * @param {React.ReactNode} [options.form]   입력 폼 영역에 넣을 JSX
 * @param {React.ReactNode} [options.table]  표(tbody) 영역에 넣을 JSX(<tr>...)
 * @param {string}        [options.confirmText="확인"]
 * @param {string}        [options.cancelText="취소"]
 * @param {boolean}       [options.showConfirm=true]
 * @param {boolean}       [options.showCancel=true]
 * @param {Function}      [options.onConfirm]  (formEl, tableEl) => ... / false 반환 시 닫지 않음
 * @param {Function}      [options.onCancel]   (formEl, tableEl) => ... / false 반환 시 닫지 않음
 */
export function sstDialog(options = {}) {
    current = { id: ++idCounter, options, closing: false };
    emit();
}

/** 다이얼로그 닫기 — 퇴장 트랜지션 후 실제 제거 */
export function sstDialogClose() {
    if (!current || current.closing) {
        return;
    }

    const targetId = current.id;

    current = { ...current, closing: true };
    emit();

    window.setTimeout(() => {
        if (current?.id === targetId) {
            current = null;
            emit();
        }
    }, SST_DIALOG_MOTION);
}

/* ────────────── 렌더러 ────────────── */

function DialogItem({ state }) {
    const [entered, setEntered] = useState(false);
    const formRef = useRef(null);
    const tableRef = useRef(null);

    // 마운트 직후 진입 애니메이션 트리거 (open 클래스 부착)
    useEffect(() => {
        const raf = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    const {
        icon = "",
        title = "",
        text = "",
        form = null,
        table = null,
        confirmText = "확인",
        cancelText = "취소",
        showConfirm = true,
        showCancel = true,
        onConfirm,
        onCancel,
    } = state.options;

    const iconClass = ICON_TYPES.includes(icon) ? icon : "";
    const open = entered && !state.closing;

    const handleConfirm = () => {
        if (onConfirm?.(formRef.current, tableRef.current) !== false) {
            sstDialogClose();
        }
    };

    const handleCancel = () => {
        if (onCancel?.(formRef.current, tableRef.current) !== false) {
            sstDialogClose();
        }
    };

    // 배경(딤) 클릭 시 닫기 — 본체(.dialogItem) 내부 클릭은 무시
    const handleDimClick = (e) => {
        if (!e.target.closest(".dialogItem")) {
            sstDialogClose();
        }
    };

    return (
        <div id="dialogArea" className={open ? "open" : ""} onClick={handleDimClick}>
            <div className="dialogItem">
                <button
                    type="button"
                    className="dialogClose"
                    aria-label="close"
                    onClick={sstDialogClose}
                />
                {iconClass ? <i className={iconClass} /> : <i />}
                <p>{title}</p>
                <span>{text}</span>
                {form && (
                    <div className="form-m" ref={formRef}>
                        {form}
                    </div>
                )}
                {table && (
                    <div className="tb-form" ref={tableRef}>
                        <table>
                            <colgroup>
                                <col width="30%" />
                                <col width="70%" />
                            </colgroup>
                            <tbody>{table}</tbody>
                        </table>
                    </div>
                )}
                {(showConfirm || showCancel) && (
                    <div className="dlBtn">
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

function Dialog() {
    const state = useSyncExternalStore(subscribe, getSnapshot);

    if (!state) {
        return null;
    }

    // 열릴 때마다 새 key 로 새로 마운트 → 진입 애니메이션 재트리거
    return createPortal(<DialogItem key={state.id} state={state} />, document.body);
}

export default Dialog;
