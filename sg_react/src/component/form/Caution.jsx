/**
 * 캡션 컴포넌트
 * 클래스 규칙: cau-{size}, state - ex. className="cau-nm po"
 * @param {L | M | S} size 
 * @param {nm | po | ne | de | su | ca | if} set - 기본 | 강조 | 부정 | 위험 | 성공 | 주의 | 정보
 * @param {string} [className] - 추가 클래스 주입
 */


function Caution({
    size = "m",
    className="",
    set,
    children,
    ...rest
}) {
    const classes = [`cau-${size}`, className, set]
        .filter(Boolean)
        .join(" ");

    return (
        <p className={classes} {...rest}><i></i>{children}</p>
    );
}

export default Caution;
