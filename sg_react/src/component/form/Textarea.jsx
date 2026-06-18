/**
 * 공통 인풋 컴포넌트
 *
 * 구조: <div class="set__{set}"> <input/> <div class="cau-l {set}">메시지</div> </div>
 * (사이즈 form-l / form-m / form-s 는 바깥 래퍼에서 지정)
 *
 * @param {"er"|"ca"|"su"} [set]  - 미지정 시 normal. er: 에러 / ca: 주의 / su: 성공
 * @param {string} [message]         - 캡션 문구 (있을 때만 렌더)
 * @param {"hover"|"focus"} [state]  - 스타일가이드 시연용 상태 클래스
 * @param {string} [type="text"]
 * @param {string} [className]       - input 에 추가 클래스 주입
 * @param {string} [wrapClassName]   - 바깥 래퍼에 추가 클래스 주입
 *
 * 그 외 value/onChange/name/placeholder 등 input 속성은 ...rest 로 그대로 전달됩니다.
 * ref 도 실제 <input> 요소로 forward 됩니다.
 */
import { forwardRef } from "react";

const Textarea = forwardRef(function Textarea({
    set,
    state,
    message,
    className = "",
    size = "m",
    ...rest
}, ref) {
    const wrapClass = [set && ` set__${set}`]
        .filter(Boolean)
        .join(" ");

    const captionClass = [`cau-` + size, set].filter(Boolean).join(" ");
    const sideClass = [`` + className].filter(Boolean).join(" ");
    return (
        <div className={ `form-` + size + wrapClass + sideClass }>
            <textarea ref={ref} className={state} {...rest} />
            {message && (
                <div className={captionClass}>
                    <i />
                    {message}
                </div>
            )}
        </div>
    );
});

export default Textarea;
