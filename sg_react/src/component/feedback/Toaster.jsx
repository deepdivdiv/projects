/* eslint-disable react-refresh/only-export-components */
/**
 * 토스트 (store + 렌더러 한 파일)
 *
 * 사용법
 *  1) App 최상단에 <Toaster /> 한 번만 마운트
 *  2) 어디서든 sstToast({ icon, title, text }) 호출
 *
 * 위치/쌓임은 .tstWrap 컨테이너의 flex column + gap 으로 처리하고,
 * 진입/퇴장은 opacity/transform 트랜지션으로 처리한다.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/* ────────────── store (컴포넌트 바깥 = 모듈 스코프) ────────────── */

const SST_TOAST_MOTION = 1000; // 진입/퇴장 트랜지션 시간(ms)
const ICON_TYPES = ["error", "comple", "warning", "info", "quest"];

// 컨테이너 레이아웃을 인라인으로 둠 (board.css 가 재생성돼도 영향 없게)
const WRAP_STYLE = {
    position: "fixed",
    top: "1.5rem",
    right: "1.5rem",
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    gap: "1.2rem",
    width: "calc(100% - 3rem)",
    maxWidth: "52rem",
    pointerEvents: "none", // 토스트 사이 빈 공간 클릭은 통과
};

let items = [];
let idCounter = 0;
const listeners = new Set();

const emit = () => listeners.forEach((listener) => listener(items));

// useSyncExternalStore 용 구독/스냅샷
const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
const getSnapshot = () => items;

/**
 * 토스트 띄우기
 * @param {Object}   options
 * @param {"error"|"comple"|"warning"|"info"|"quest"} [options.icon]
 * @param {string}   [options.title]
 * @param {string}   [options.text]
 * @param {boolean}  [options.closable=true]
 * @param {number}   [options.duration=3000]  0 이하이면 자동으로 닫지 않음
 * @param {Function} [options.onClose]
 * @returns {number} 토스트 id
 */
export function sstToast(options = {}) {
    const { duration = 3000 } = options;
    const id = ++idCounter;

    items = [...items, { ...options, id, closing: false }];
    emit();

    if (duration > 0) {
        window.setTimeout(() => sstToastClose(id), duration);
    }

    return id;
}

/**
 * 토스트 닫기
 * @param {number} [id] 생략하면 가장 마지막 토스트
 */
export function sstToastClose(id) {
    const targetId = id ?? items.at(-1)?.id;
    const target = items.find((item) => item.id === targetId);

    if (!target || target.closing) {
        return;
    }

    // 1) 퇴장 애니메이션을 위해 closing 플래그만 먼저 켬
    items = items.map((item) =>
        item.id === targetId ? { ...item, closing: true } : item
    );
    emit();

    // 2) 트랜지션이 끝난 뒤 실제 제거 + onClose 콜백
    window.setTimeout(() => {
        const closed = items.find((item) => item.id === targetId);
        items = items.filter((item) => item.id !== targetId);
        emit();
        closed?.onClose?.();
    }, SST_TOAST_MOTION);
}

/* ────────────── 렌더러 ────────────── */

function ToastItem({ item }) {
    const { id, icon = "", title = "", text = "", closable = true, closing } = item;
    const [entered, setEntered] = useState(false);

    // 마운트 직후 진입 애니메이션 트리거
    useEffect(() => {
        const raf = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    const iconClass = ICON_TYPES.includes(icon) ? icon : "";
    const visible = entered && !closing;

    const style = {
        // board.css 의 .tstArea(position:fixed, top/right:1.5rem)를 덮어써서
        // .tstWrap flex 컨테이너 안에서 세로로 쌓이게 함 (toastClose 기준점은 유지)
        position: "relative",
        top: "auto",
        right: "auto",
        width: "100%",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-1rem)",
        transition: `opacity ${SST_TOAST_MOTION}ms ease, transform ${SST_TOAST_MOTION}ms ease`,
        pointerEvents: closing ? "none" : "auto",
    };

    return (
        <div className="tstArea" role="status" aria-live="polite" style={style}>
            {closable && (
                <button
                    type="button"
                    className="toastClose"
                    aria-label="close"
                    onClick={() => sstToastClose(id)}
                />
            )}
            <i className={iconClass} />
            {text ? (
                <dl>
                    <dt>{title}</dt>
                    <dd>{text}</dd>
                </dl>
            ) : (
                <span>{title}</span>
            )}
        </div>
    );
}

function Toaster() {
    // 모듈 store(items)를 구독 — effect 없이 동기화
    const list = useSyncExternalStore(subscribe, getSnapshot);

    if (!list.length) {
        return null;
    }

    return createPortal(
        <div className="tstWrap" style={WRAP_STYLE}>
            {list.map((item) => (
                <ToastItem key={item.id} item={item} />
            ))}
        </div>,
        document.body
    );
}

export default Toaster;
