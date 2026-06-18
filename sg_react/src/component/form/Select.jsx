/**
 * 공통 셀렉트 컴포넌트
 *
 * 구조: <div class="form-{size} set__{status}"> <select/> <div class="cau-{size} {status}">메시지</div> </div>
 * (appearance: base-select 기반 커스터마이즈드 셀렉트 — option 까지 CSS 로 제어됨)
 *
 * 옵션 넣는 방법 2가지 (children 우선):
 *  1) children 으로 네이티브처럼 직접 작성 (손으로 쓰는 폼 / optgroup 등)
 *       <Select size="l"><option value="seoul">서울</option>...</Select>
 *  2) options 배열로 동적 렌더 (API 응답 등 반복 목록)
 *       <Select size="l" options={[{value, label, disabled}]} />
 *
 * @param {React.ReactNode} [children]  - 직접 작성한 <option>/<optgroup> (있으면 options 보다 우선)
 * @param {{value:string, label:string, disabled?:boolean}[]} [options]  - 동적 옵션 목록
 * @param {string} [placeholder]      - 첫번째 비활성 안내 옵션 (있을 때만 렌더)
 * @param {"er"|"ca"|"su"} [status]   - 미지정 시 normal. er: 에러 / ca: 주의 / su: 성공
 * @param {string} [message]          - 캡션 문구 (있을 때만 렌더)
 * @param {"hover"|"focus"} [state]   - 스타일가이드 시연용 상태 클래스 (select 에 부여)
 * @param {"l"|"m"|"s"} [size="m"]
 * @param {string} [className]        - 바깥 래퍼에 추가 클래스 주입
 * @param {string} [selectClassName]  - select 에 추가 클래스 주입 (sel_time / sel_cal 등 변형용)
 *
 * 그 외 value/onChange/name/disabled/open 등 select 속성은 ...rest 로 그대로 전달됩니다.
 * ref 도 실제 <select> 요소로 forward 됩니다.
 */
import { forwardRef } from "react";

const Select = forwardRef(function Select({
    children,
    options,
    placeholder,
    status,
    state,
    message,
    className = "",
    selectClassName = "",
    size = "m",
    ...rest
}, ref) {
    const wrapClass = [`form-` + size, status && `set__${status}`, className]
        .filter(Boolean)
        .join(" ");

    const selectClass = [state, selectClassName].filter(Boolean).join(" ");
    const captionClass = [`cau-` + size, status].filter(Boolean).join(" ");

    return (
        <div className={wrapClass}>
            <select ref={ref} className={selectClass || undefined} {...rest}>
                {placeholder && (
                    <option value="" disabled>{placeholder}</option>
                )}
                {/* children 이 있으면 그대로, 없으면 options 배열을 렌더 */}
                {children ?? options?.map((opt, i) => (
                    <option key={i} value={opt.value} disabled={opt.disabled}>
                        {opt.label}
                    </option>
                ))}
            </select>
            {message && (
                <div className={captionClass}>
                    <i />
                    {message}
                </div>
            )}
        </div>
    );
});

export default Select;
