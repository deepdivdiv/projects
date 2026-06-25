/**
 * @param { L | M | S } size
 * @param { nm | ne | er | ca | su } state // 기본 | 부정 | 실패 | 경고 | 성공
 * 
 * children 안에 구조는 dl로 
 * 
**/


function Tooltip({
    state = "",
    className = "",
    // children,
    ...rest
}) {
    const classes = [`tip-${state}`, className]
        .filter(Boolean)
        .join(" ");
        return (
            <div className={classes} {...rest}><i></i>마우스를 내려보세요</div>
        )
}

export default Tooltip;
