/**
 * 공통 버튼 컴포넌트
 *
 * 클래스 규칙: bt-{type}-{size} {variant} {state}
 *
 * @param {"a"|"b"|"c"} type     - a: Solid / b: Outline / c: Ghost
 * @param {"xl"|"l"|"m"|"s"|"xs"} size
 * @param {"nm"|"po"|"ne"|"de"|"su"|"ca"|"if"} set
 * @param {"hover"|"press"|"on"} [state] - 스타일가이드 시연용 상태 클래스
 * @param {string} [iconL]  - 앞에 붙는 아이콘 클래스명 (예: "ico-search")
 * @param {string} [iconR]      - 뒤에 붙는 아이콘 클래스명 (예: "arr-right")
 * @param {string} [className] - 추가 클래스 주입
 * @param {"button"|"submit"|"reset"} [htmlType="button"]
 */


import s from "./Check.module.scss";

function Check({
    size = "m",
    set = "",
    state,
    className = "",
    type = "checkbox",
    id = "",
    name = "",
    children,
    ...rest
}) {
    // sel-*(정체성)만 모듈 스코프. state/set(imp/su/er)은 공용 전역 어휘라 plain 유지(:global)
    const classes = [s[`sel-${size}`], state, className]
        .filter(Boolean)
        .join(" ");

    return (
        <span className={classes}>
            <input type={type} name={name} id={id} {...rest} />
            <label htmlFor={id} className={set}><i></i>{children}</label>
        </span>
    );
}

export default Check;
