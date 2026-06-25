/**
 * @param { L | M | S } size
 * @param { nm | ne | er | ca | su } state // 기본 | 부정 | 실패 | 경고 | 성공
 * 
 * children 안에 구조는 dl로 
 * 
**/


function Loader({
    set = "spinner",
    size = "m",
    state = "",
    className = "",
    // children,
    ...rest
}) {
    const classes = [`${set}`, size, state, className]
        .filter(Boolean)
        .join(" ");

    if(set == "spinner") {
        return (
            <i className={classes} {...rest}></i>
        )
    } 
    else if(set == "loading") {
        return (
            <i className={classes} {...rest}><span></span><span></span><span></span></i>
        )
    }
    else if(set == "ico-loading") {
        return (
            <div className={classes} {...rest}><span></span><span></span><span></span></div>
        )
    }

}

export default Loader;
