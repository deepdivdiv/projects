import React, {useRef, useState, useEffect} from "react";
import { Button } from "@/component/form";
import { Card } from "@/component/container";
function SgDisplay() {
    const sections = [
        { id: "card", label: "Card" },
    ];

    // API 연동 전 더미 데이터 (나중에 fetch 결과로 교체)
    // list / grid 형
    const cards = [
      {
        id: 1,
        group: "카드",
        head: "첫번째 제목",
        body: "내용입니다",
        writeData: "2026.03.04",
        view: "260",
        like: "99",
        href: "#",
      },
      {
        id: 2,
        group: "디자인",
        head: "두번째 제목",
        body: "두번째 내용",
        writeData: "2026.03.05",
        view: "13",
        like: "4",
        href: "#",
      },
      {
        id: 3,
        group: "개발",
        head: "세번째 제목",
        body: "세번째 내용",
        writeData: "2026.03.06",
        view: "512",
        like: "37",
        href: "#",
      },
      {
        id: 4,
        group: "개발",
        head: "네번째 제목",
        body: "네번째 내용",
        writeData: "2026.03.06",
        view: "512",
        like: "37",
        href: "#",
      },
    ];
    // // visual 형
    // const visualCards = [
    //     { id: 1, group: "디자인", name: "홍길동", view: "235", like: "92", thumb: "", href: "#" },
    //     { id: 2, group: "개발", name: "김철수", view: "120", like: "15", thumb: "", href: "#" },
    // ];
    // // prize / prizeMini 형
    // const prizeCards = [
    //     { id: 1, label: "30% 할인", title: "스마트 워크 데스크", price: "1,890,900", salePrice: "1,800,800", score: 1.5, reviewCount: 366, thumb: "", href: "#" },
    //     { id: 2, label: "20% 할인", title: "인체공학 의자", price: "450,000", salePrice: "360,000", score: 4.5, reviewCount: 88, thumb: "", href: "#" },
    // ];
    // // review 형
    // const reviewCards = [
    //     { id: 1, name: "홍길동", text: "리뷰영역제품 리뷰영역제품 리뷰영역제품 리뷰영역제품 리뷰영역제품", score: 1.5, reviewCount: 366, avatar: "" },
    //     { id: 2, name: "김철수", text: "정말 만족스러운 제품입니다. 추천합니다.", score: 5, reviewCount: 12, avatar: "" },
    // ];
    // // profile 형
    // const profileCards = [
    //     { id: 1, name: "홍길동", role: "시니어 개발자", desc: "10년 경력의 웹 개발자로, React와 TypeScript에 열정을 가지고 있습니다.", email: "kd.hong@example.com", phone: "010-1234-5678", location: "대한민국, 서울", avatar: "" },
    // ];

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
                            <Card set="list" items={cards} />
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
