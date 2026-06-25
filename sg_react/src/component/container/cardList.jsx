/**
 * @param { L | M | S } size
 * @param { nm | ne | er | ca | su } state // 기본 | 부정 | 실패 | 경고 | 성공
 * 
 * children 안에 구조는 dl로 
 * 
**/


function CardList({
    size = "m",
    state = "",
    className = "",
    // children,
    // ...rest
}) {
    const classes = [`pg-${size}`, state, className]
        .filter(Boolean)
        .join(" ");

    return (
        <div class={classes}>
            <div class="card-item">
                <div class="thumb"><a href=""></a></div>
                <div class="info">
                    <em>디자인</em>
                    <dl>
                        <dt><a href="">제목영역</a></dt>
                        <dd><a href="">내용영역</a></dd>
                    </dl>
                    <div class="data">
                        <p class="data--write">2026.05.14</p>
                        <div>
                            <p class="data--view">235</p>
                            <p class="data--like">92</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    )

}

export default CardList;
