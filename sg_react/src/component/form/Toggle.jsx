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


function Toggle({
    size = "m",
    type = "a",
    id = "",
    name = "",
    ...rest
}) {
    const classes = [`tog-${type}-${size}`]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={classes}>
            <input type="checkbox" name={name} id={id} {...rest} />
            <label for={id}></label>
        </div>
    );
}

export default Toggle;
