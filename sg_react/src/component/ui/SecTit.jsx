/**
 * 공통 버튼 컴포넌트
 *
 * 클래스 규칙: bt-{type}-{size} {variant} {state}
 *
 @param { em } = 상단 서브타이틀
 @param { h1 } = 메인타이틀 1
 @param { h2 } = 메인타이틀 2
 @param { desc } = 하단 서브타이틀

 */


function SecTit({
    em,
    h1, h2, desc,
    className = "",
    ...rest
}) {
    const classes = [`sec_tit`, className]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={classes} {...rest}>
            { em   && <em>{em}</em>}
            { h1   && <h1>{h1}</h1>}
            { h2   && <h2>{h2}</h2>}
            { desc && <span>{desc}</span>}
        </div>
    );
}

export default SecTit;
