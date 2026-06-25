/**
 * Card - 카드 컨테이너
 * set 값에 따라 컨테이너 클래스와 내부 아이템 구조가 통째로 바뀜.
 *
 * @param { list | grid | visual | prize | prizeMini | review | profile } set
 * @param { Array } items   카드 데이터 배열 (API 응답 등). item.id 는 key 로 사용.
 *
 * set 별로 item 에서 사용하는 필드:
 *  list/grid : href, group, head, body, writeData, view, like
 *  visual    : href, thumb, group, name, view, like
 *  prize     : href, thumb, label, title, price, salePrice, score, reviewCount
 *  prizeMini : href, thumb, label, title, price, salePrice, score, reviewCount
 *  review    : avatar, name, text, score, reviewCount
 *  profile   : avatar, name, role, desc, email, phone, location
**/


// 별점 (prize / prizeMini / review 공용)
function Rank({ score = 0, reviewCount = 0 }) {
    return (
        <div className="rank" style={{ "--score": score }} aria-label={`별점 ${score}점 / 5점`}>
            <span>({reviewCount})</span>
        </div>
    );
}

// list 형
function CardItemList({ href = "#", group = "", head = "", body = "", writeData = "", view = 0, like = 0 }) {
    return (
        <div className="card-item">
            <div className="thumb"><a href={href}></a></div>
            <div className="info">
                <em>{group}</em>
                <dl>
                    <dt><a href={href}>{head}</a></dt>
                    <dd><a href={href}>{body}</a></dd>
                </dl>
                <div className="data">
                    <p className="data--write">{writeData}</p>
                    <div>
                        <p className="data--view">{view}</p>
                        <p className="data--like">{like}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// grid 형 (list 와 동일, em 라벨 스타일만 다름)
function CardItemGrid({ href = "#", group = "", head = "", body = "", writeData = "", view = 0, like = 0 }) {
    return (
        <div className="card-item">
            <div className="thumb"><a href={href}></a></div>
            <div className="info">
                <em className="lb-l imp">{group}</em>
                <dl>
                    <dt><a href={href}>{head}</a></dt>
                    <dd><a href={href}>{body}</a></dd>
                </dl>
                <div className="data">
                    <p className="data--write">{writeData}</p>
                    <div>
                        <p className="data--view">{view}</p>
                        <p className="data--like">{like}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// visual 형 (이미지 + 작성자)
function CardItemVisual({ href = "#", thumb = "", group = "", name = "", view = 0, like = 0 }) {
    return (
        <div className="card-item">
            <div className="thumb"><a href={href}><img src={thumb} alt="" /></a></div>
            <div className="info">
                <em className="lb-l imp">{group}</em>
                <div className="data">
                    <div className="ava-s"></div>
                    <strong>{name}</strong>
                    <div>
                        <p className="data--view">{view}</p>
                        <p className="data--like">{like}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// prize 형 (상품)
function CardItemPrize({ id, href = "#", thumb = "", label = "", title = "", price = "", salePrice = "", score = 0, reviewCount = 0, liked = false, onLike, onCart }) {
    return (
        <div className="card-item">
            <div className="thumb"><a href={href}><img src={thumb} alt="" /></a></div>
            <div className="info">
                <em className="lb-l st">{label}</em>
                <dl>
                    <dt>{title}</dt>
                    <dd>
                        <strong>{price}</strong>
                        <span className="sale">{salePrice}</span>
                    </dd>
                </dl>
                <menu className="util">
                    <button
                        type="button"
                        className={`bt-like${liked ? " on" : ""}`}
                        aria-pressed={liked}
                        aria-label="찜하기"
                        onClick={() => onLike?.(id)}
                    ></button>
                </menu>
                <Rank score={score} reviewCount={reviewCount} />
                <div className="btArea">
                    <button type="button" className="bt-a-m po" onClick={() => onCart?.(id)}>상품담기 <i className="arr-right"></i></button>
                </div>
            </div>
        </div>
    );
}

// prize mini 형 (상품 - 장바구니 버튼, 담기 버튼 없음)
function CardItemPrizeMini({ id, href = "#", thumb = "", label = "", title = "", price = "", salePrice = "", score = 0, reviewCount = 0, liked = false, onLike, onCart }) {
    return (
        <div className="card-item">
            <div className="thumb"><a href={href}><img src={thumb} alt="" /></a></div>
            <div className="info">
                <em className="lb-m st">{label}</em>
                <dl>
                    <dt>{title}</dt>
                    <dd>
                        <strong>{price}</strong>
                        <span className="sale">{salePrice}</span>
                    </dd>
                </dl>
                <menu className="util">
                    <button
                        type="button"
                        className={`bt-like${liked ? " on" : ""}`}
                        aria-pressed={liked}
                        aria-label="찜하기"
                        onClick={() => onLike?.(id)}
                    ></button>
                    <button
                        type="button"
                        className="bt-cart"
                        aria-label="장바구니 담기"
                        onClick={() => onCart?.(id)}
                    ></button>
                </menu>
                <Rank score={score} reviewCount={reviewCount} />
            </div>
        </div>
    );
}

// review 형 (리뷰)
function CardItemReview({ avatar = "", name = "", text = "", score = 0, reviewCount = 0 }) {
    return (
        <div className="card-item">
            <div className="head">
                <div className="ava-m"><img src={avatar} alt="" /></div>
                <strong>{name}</strong>
            </div>
            <div className="body">
                <p>{text}</p>
            </div>
            <Rank score={score} reviewCount={reviewCount} />
        </div>
    );
}

// profile 형 (프로필)
function CardItemProfile({ img = "", alt="", name = "", role = "", desc = "", email = "", phone = "", location = "" }) {
    return (
        <div className="card-item">
            <div className="ava-xxl">
                <img src={img} alt={alt} />
            </div>
            <div className="info">
                <strong>{name}</strong>
                <p>{role}</p>
                <span>{desc}</span>
            </div>
            <div className="data">
                <ul>
                    <li><i className="pf-email"></i><span>{email}</span></li>
                    <li><i className="pf-call"></i><span>{phone}</span></li>
                    <li><i className="pf-here"></i><span>{location}</span></li>
                </ul>
            </div>
        </div>
    );
}

// set → { 컨테이너 클래스, 아이템 컴포넌트 } 레지스트리
const VARIANTS = {
    list:      { className: "card-list",        Item: CardItemList },
    grid:      { className: "card-grid",        Item: CardItemGrid },
    visual:    { className: "card-visual",      Item: CardItemVisual },
    prize:     { className: "card-prize",       Item: CardItemPrize },
    prizeMini: { className: "card-prize--mini", Item: CardItemPrizeMini },
    review:    { className: "card-review",      Item: CardItemReview },
    profile:   { className: "card-profile",     Item: CardItemProfile },
};

// 컨테이너 - set 으로 골라서 items 만큼 반복
function Card({ set = "list", items = [], className = "", onLike, onCart, ...rest }) {
    const { className: setClass, Item } = VARIANTS[set] ?? VARIANTS.list;
    const classes = [setClass, className].filter(Boolean).join(" ");

    return (
        <div className={classes} {...rest}>
            {items.map((item) => (
                <Item key={item.id} {...item} onLike={onLike} onCart={onCart} />
            ))}
        </div>
    );
}

export default Card;
