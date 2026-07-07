/**
 * 공통 버튼 컴포넌트
 *
 * 클래스 규칙: bt-{type}-{size} {variant} {state}
 *
 * @param {"a"|"b"|"c"} type     - a: Solid / b: Outline / c: Ghost
 * @param {"xl"|"l"|"m"|"s"|"xs"} size    - 5가지 사이즈
 * @param {"nm"|"po"|"ne"|"de"|"su"|"ca"|"if"} set
 * @param {"hover"|"press"|"on"} [state] - 스타일가이드 시연용 상태 클래스
 * @param {string} [iconL]  - 앞에 붙는 아이콘 클래스명 (예: "ico-search")
 * @param {string} [iconR]  - 뒤에 붙는 아이콘 클래스명 (예: "arr-right")
 * @param {string} [className]  - 추가 클래스 주입
 * @param {"button"|"submit"|"reset"} [type="button"]
 */


import s from "./Button.module.scss";

function Button({
    rank = "a",
    size = "m",
    set = "nm",
    state,
    iconR,
    iconL,
    className = "",
    type = "button",
    children,
    ...rest
}) {
    // bt-*(정체성)만 모듈 스코프. set/state/아이콘 클래스는 공용 전역 어휘라 plain 문자열 유지(:global)
    const classes = [s[`bt-${rank}-${size}`], set, state, className]
        .filter(Boolean)
        .join(" ");

    return (
        <button type={type} className={classes} {...rest}>
            {iconL &&
                (iconL === "loading" ? (
                    <i className={`${iconL} ${size}`}>
                        <span />
                        <span />
                        <span />
                    </i>
                ) : (
                    <i className={iconL} />
                ))}
            {children}
            {iconR &&
                (iconR === "loading " ? (
                    <i className={`${iconR} ${size}`}>
                        <span />
                        <span />
                        <span />
                    </i>
                ) : (
                    <i className={iconR} />
                ))}
        </button>
    );
}

export default Button;
