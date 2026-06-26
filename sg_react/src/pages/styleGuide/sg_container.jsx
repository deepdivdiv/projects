import React, {useRef, useState, useEffect} from "react";
import { Button } from "@/component/form";
import { Card } from "@/component/container";
import ThumbIMG from "@/assets/thumb.png";
function SgDisplay() {
    const sections = [
        { id: "card", label: "Card" },
    ];

    
    // 리스트 형
    const cardList = [
      {
        id: 1,
        group: "카드",
        head: "첫번째 제목",
        body: "내용입니다",
        writeData: "2026.03.04",
        view: "260",
        like: "99",
        href: "",
        thumb: ThumbIMG,
      },
      {
        id: 2,
        group: "디자인",
        head: "두번째 제목",
        body: "두번째 내용",
        writeData: "2026.03.05",
        view: "13",
        like: "4",
        href: "",
        thumb: ThumbIMG,
      },
    ];
    
    // 리스트 형
    const cardGrid = [
      {
        id: 1,
        group: "카드",
        head: "첫번째 제목",
        body: "내용입니다",
        writeData: "2026.03.04",
        view: "260",
        like: "99",
        href: "",
        thumb: ThumbIMG,
      },
      {
        id: 2,
        group: "디자인",
        head: "두번째 제목",
        body: "두번째 내용",
        writeData: "2026.03.05",
        view: "13",
        like: "4",
        href: "",
        thumb: ThumbIMG,
      },
      {
        id: 3,
        group: "디자인",
        head: "세번째 제목",
        body: "세번째 내용",
        writeData: "2026.03.05",
        view: "13",
        like: "4",
        href: "",
        thumb: ThumbIMG,
      },
      {
        id: 4,
        group: "디자인",
        head: "네번째 제목",
        body: "네번째 내용",
        writeData: "2026.03.05",
        view: "13",
        like: "4",
        href: "",
        thumb: ThumbIMG,
      },
    ];
    
    
    // 비주얼
    const cardVisual = [
      {
        id: 1,
        group: "카드",
        name: "홍길동",
        writeData: "2026.03.04",
        view: "260",
        like: "99",
        href: "",
        thumb: ThumbIMG,
      },
      {
        id: 2,
        group: "디자인",
        name: "홍길동",
        writeData: "2026.03.05",
        view: "13",
        like: "4",
        href: "",
        thumb: ThumbIMG,
      },
      {
        id: 3,
        group: "디자인",
        name: "홍길동",
        writeData: "2026.03.05",
        view: "13",
        like: "4",
        href: "",
        thumb: ThumbIMG,
      },
      {
        id: 4,
        group: "디자인",
        name: "홍길동",
        writeData: "2026.03.05",
        view: "13",
        like: "4",
        href: "",
        thumb: ThumbIMG,
      },
    ];

    // Price
    const cardPrice = [
      {
        id: 1,
        group: "카드",
        price: "1,344,333",
        salePrice: "1,999,999",
        writeData: "2026.03.04",
        view: "260",
        like: "99",
        score: "2.5",
        reviewCount: "3432",
        href: "",
        thumb: ThumbIMG,
      },
      {
        id: 2,
        group: "디자인",
        price: "1,344,333",
        salePrice: "1,999,999",
        writeData: "2026.03.05",
        view: "13",
        like: "4",
        score: "2.5",
        reviewCount: "3432",
        href: "",
        thumb: ThumbIMG,
      },
      {
        id: 3,
        group: "디자인",
        price: "1,344,333",
        salePrice: "1,999,999",
        writeData: "2026.03.05",
        view: "13",
        like: "4",
        score: "2.5",
        reviewCount: "3432",
        href: "",
        thumb: ThumbIMG,
      },
      {
        id: 4,
        group: "디자인",
        price: "1,344,333",
        salePrice: "1,999,999",
        writeData: "2026.03.05",
        view: "13",
        like: "4",
        score: "2.5",
        reviewCount: "3432",
        href: "",
        thumb: ThumbIMG,
      },
    ];
    
    

    const secRefs = useRef({});
    const [activeSec, setActiveSec] = useState(sections[0].id);

    const onMoveToSec = (id) => {
        secRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        // 화면에 들어온 DOM에 해당하는 섹션 id를 찾아 활성화
                        const id = Object.keys(secRefs.current).find(
                            (key) => secRefs.current[key] === entry.target
                        )
                        if (id) setActiveSec(id)
                    }
                })
            },
            { rootMargin: "-50% 0px -50% 0px" } // 화면 중앙을 지나는 섹션을 활성화
        )

        Object.values(secRefs.current).forEach((el) => el && observer.observe(el))
        return () => observer.disconnect()
    }, [])

    return (
    <>
        {/* 섹션 이동 메뉴 */}
        <menu className="secGuide">
            {sections.map((sec) => (
                <button
                    key={sec.id}
                    type="button"
                    className={activeSec === sec.id ? "active" : ""}
                    onClick={() => onMoveToSec(sec.id)}
                >{sec.label}</button>
            ))}
        </menu>
        <div className="sg_inner" ref={(el) => (secRefs.current.card = el)}>
            <div className="sg_tit">
                <h1>Card</h1>
                <p>여러 사이즈의 카드 컴포넌트</p>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>List</dt>
                        <dd>
                            <Card set="list" items={cardList} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>Grid</dt>
                        <dd>
                            <Card set="grid" items={cardGrid} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>Visual</dt>
                        <dd>
                            <Card set="visual" items={cardVisual} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>Prize</dt>
                        <dd>
                            <Card set="prize" items={cardPrice} />
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Progress size="l" state="imp" max="100" value="30">
    <dl>
        <dt>게이지</dt>
        <dd>30%</dd>
    </dl>
</Progress>
<Progress size="m" state="imp" max="100" value="30">
    <dl>
        <dt>게이지</dt>
        <dd>30%</dd>
    </dl>
</Progress>
<Progress size="s" state="imp" max="100" value="30">
    <dl>
        <dt>게이지</dt>
        <dd>30%</dd>
    </dl>
</Progress>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
            {/* 스타일 */}
            <div className="sg_area">
                <p>스타일</p>
                <div className="sg_box">
                    <dl>
                        <dt>Default</dt>
                        <dd className="flexBox">

                        </dd>
                    </dl>
                    <dl>
                        <dt>Negative</dt>
                        <dd className="flexBox">

                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Progress size="l" value="25" max="100"></Progress>
<Progress size="l" value="25" max="100" state="ne"></Progress>
<Progress size="l" value="25" max="100" state="er"></Progress>
<Progress size="l" value="25" max="100" state="ca"></Progress>
<Progress size="l" value="25" max="100" state="su"></Progress>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    </>
    )
}

export default SgDisplay
