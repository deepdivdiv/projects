/**
 * Card - 카드 컨테이너
 * set 값에 따라 컨테이너 클래스와 내부 아이템 구조가 통째로 바뀜.
 *
 * @param { Array } items   카드 데이터 배열 (API 응답 등). item.id 는 key 로 사용.
 *
**/


/**
 * @param { L | M | S } size
 * 
**/



function AccItem({ group = "", head = "", body = "" }) {
    return (
        <details>
            <summary><em>Q.{group}</em>{head}</summary>
            <div>
                {body}
            </div>
        </details>
    );
}


function Acc({
    size = "m",
    className = "",
    items=[],
    ...rest
}) {
    const classes = [`acd-${size}`, className]
        .filter(Boolean)
        .join(" ");



        return (
            <div className={classes} {...rest}>
                {items.map((item) => (
                    <AccItem key={item.id} {...item} />
                ))}
            </div>
        )

}

export default Acc;



