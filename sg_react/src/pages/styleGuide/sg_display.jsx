import React, {useRef, useState, useEffect} from "react";
import { Badge } from "@/component/display";
function SgDisplay() {
    const sections = [
        { id: "label", label: "Label" },
        { id: "tag", label: "Tag" },
        { id: "chip", label: "Chip" },
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
        <div className="sg_inner" ref={(el) => (secRefs.current.label = el)}>
            <div className="sg_tit">
                <h1>Label</h1>
                <p>상태 및 카테고리를 표시하는 라벨 컴포넌트</p>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <div className="flexBox">
                        <dl>
                            <dt>L</dt>
                            <dd className="flexBox">
                                <Badge set="lb" state="imp" size="l">컴포넌트</Badge>
                            </dd>
                        </dl>
                        <dl>
                            <dt>M</dt>
                            <dd className="flexBox">
                                <Badge set="lb" state="imp" size="m">컴포넌트</Badge>
                            </dd>
                        </dl>
                        <dl>
                            <dt>S</dt>
                            <dd className="flexBox">
                                <Badge set="lb" state="imp" size="s">컴포넌트</Badge>
                            </dd>
                        </dl>
                    </div>
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Badge set="lb" state="imp" size="l">컴포넌트</Badge>
<Badge set="lb" state="imp" size="m">컴포넌트</Badge>
<Badge set="lb" state="imp" size="s">컴포넌트</Badge>
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
                            <Badge set="lb" state="" size="l">컴포넌트</Badge>
                            <Badge set="lb" state="" size="m">컴포넌트</Badge>
                            <Badge set="lb" state="" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Strong</dt>
                        <dd className="flexBox">
                            <Badge set="lb" state="st" size="l">컴포넌트</Badge>
                            <Badge set="lb" state="st" size="m">컴포넌트</Badge>
                            <Badge set="lb" state="st" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Important</dt>
                        <dd className="flexBox">
                            <Badge set="lb" state="imp" size="l">컴포넌트</Badge>
                            <Badge set="lb" state="imp" size="m">컴포넌트</Badge>
                            <Badge set="lb" state="imp" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Negative</dt>
                        <dd className="flexBox">
                            <Badge set="lb" state="ne" size="l">컴포넌트</Badge>
                            <Badge set="lb" state="ne" size="m">컴포넌트</Badge>
                            <Badge set="lb" state="ne" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Point</dt>
                        <dd className="flexBox">
                            <Badge set="lb" state="po" size="l">컴포넌트</Badge>
                            <Badge set="lb" state="po" size="m">컴포넌트</Badge>
                            <Badge set="lb" state="po" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd className="flexBox">
                            <Badge set="lb" state="er" size="l">컴포넌트</Badge>
                            <Badge set="lb" state="er" size="m">컴포넌트</Badge>
                            <Badge set="lb" state="er" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Caution</dt>
                        <dd className="flexBox">
                            <Badge set="lb" state="ca" size="l">컴포넌트</Badge>
                            <Badge set="lb" state="ca" size="m">컴포넌트</Badge>
                            <Badge set="lb" state="ca" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd className="flexBox">
                            <Badge set="lb" state="su" size="l">컴포넌트</Badge>
                            <Badge set="lb" state="su" size="m">컴포넌트</Badge>
                            <Badge set="lb" state="su" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Information</dt>
                        <dd className="flexBox">
                            <Badge set="lb" state="if" size="l">컴포넌트</Badge>
                            <Badge set="lb" state="if" size="m">컴포넌트</Badge>
                            <Badge set="lb" state="if" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Badge set="lb" state="" size="l">컴포넌트</Badge>
<Badge set="lb" state="st" size="l">컴포넌트</Badge>
<Badge set="lb" state="imp" size="l">컴포넌트</Badge>
<Badge set="lb" state="ne" size="l">컴포넌트</Badge>
<Badge set="lb" state="po" size="l">컴포넌트</Badge>
<Badge set="lb" state="er" size="l">컴포넌트</Badge>
<Badge set="lb" state="ca" size="l">컴포넌트</Badge>
<Badge set="lb" state="su" size="l">컴포넌트</Badge>
<Badge set="lb" state="if" size="l">컴포넌트</Badge>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <div className="sg_inner" ref={(el) => (secRefs.current.tag = el)}>
            <div className="sg_tit">
                <h1>Tag</h1>
                <p>해시태그를 표시하는 컴포넌트</p>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <div className="flexBox">
                        <dl>
                            <dt>L</dt>
                            <dd className="flexBox">
                                <Badge set="tag" state="imp" size="l">컴포넌트</Badge>
                            </dd>
                        </dl>
                        <dl>
                            <dt>M</dt>
                            <dd className="flexBox">
                                <Badge set="tag" state="imp" size="m">컴포넌트</Badge>
                            </dd>
                        </dl>
                        <dl>
                            <dt>S</dt>
                            <dd className="flexBox">
                                <Badge set="tag" state="imp" size="s">컴포넌트</Badge>
                            </dd>
                        </dl>
                    </div>
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Badge set="tag" state="imp" size="l">컴포넌트</Badge>
<Badge set="tag" state="imp" size="m">컴포넌트</Badge>
<Badge set="tag" state="imp" size="s">컴포넌트</Badge>
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
                            <Badge set="tag" state="" size="l">컴포넌트</Badge>
                            <Badge set="tag" state="" size="m">컴포넌트</Badge>
                            <Badge set="tag" state="" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Strong</dt>
                        <dd className="flexBox">
                            <Badge set="tag" state="st" size="l">컴포넌트</Badge>
                            <Badge set="tag" state="st" size="m">컴포넌트</Badge>
                            <Badge set="tag" state="st" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Important</dt>
                        <dd className="flexBox">
                            <Badge set="tag" state="imp" size="l">컴포넌트</Badge>
                            <Badge set="tag" state="imp" size="m">컴포넌트</Badge>
                            <Badge set="tag" state="imp" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Negative</dt>
                        <dd className="flexBox">
                            <Badge set="tag" state="ne" size="l">컴포넌트</Badge>
                            <Badge set="tag" state="ne" size="m">컴포넌트</Badge>
                            <Badge set="tag" state="ne" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Point</dt>
                        <dd className="flexBox">
                            <Badge set="tag" state="po" size="l">컴포넌트</Badge>
                            <Badge set="tag" state="po" size="m">컴포넌트</Badge>
                            <Badge set="tag" state="po" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd className="flexBox">
                            <Badge set="tag" state="er" size="l">컴포넌트</Badge>
                            <Badge set="tag" state="er" size="m">컴포넌트</Badge>
                            <Badge set="tag" state="er" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Caution</dt>
                        <dd className="flexBox">
                            <Badge set="tag" state="ca" size="l">컴포넌트</Badge>
                            <Badge set="tag" state="ca" size="m">컴포넌트</Badge>
                            <Badge set="tag" state="ca" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd className="flexBox">
                            <Badge set="tag" state="su" size="l">컴포넌트</Badge>
                            <Badge set="tag" state="su" size="m">컴포넌트</Badge>
                            <Badge set="tag" state="su" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Information</dt>
                        <dd className="flexBox">
                            <Badge set="tag" state="if" size="l">컴포넌트</Badge>
                            <Badge set="tag" state="if" size="m">컴포넌트</Badge>
                            <Badge set="tag" state="if" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Badge set="tag" state="" size="l">컴포넌트</Badge>
<Badge set="tag" state="st" size="l">컴포넌트</Badge>
<Badge set="tag" state="imp" size="l">컴포넌트</Badge>
<Badge set="tag" state="ne" size="l">컴포넌트</Badge>
<Badge set="tag" state="po" size="l">컴포넌트</Badge>
<Badge set="tag" state="er" size="l">컴포넌트</Badge>
<Badge set="tag" state="ca" size="l">컴포넌트</Badge>
<Badge set="tag" state="su" size="l">컴포넌트</Badge>
<Badge set="tag" state="if" size="l">컴포넌트</Badge>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <div className="sg_inner" ref={(el) => (secRefs.current.chip = el)}>
            <div className="sg_tit">
                <h1>Chip</h1>
                <p>삭제가 가능한 라벨 컴포넌트</p>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>L</dt>
                        <dd className="flexBox">
                            <Badge set="chip" state="imp" size="l" id="chip-l-1">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="l" id="chip-l-2">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="l" id="chip-l-3">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="l" id="chip-l-4">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="l" id="chip-l-5">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd className="flexBox">
                            <Badge set="chip" state="imp" size="m" id="chip-m-1">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="m" id="chip-m-2">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="m" id="chip-m-3">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="m" id="chip-m-4">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="m" id="chip-m-5">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd className="flexBox">
                            <Badge set="chip" state="imp" size="s" id="chip-s-1">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="s" id="chip-s-2">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="s" id="chip-s-3">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="s" id="chip-s-4">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="s" id="chip-s-5">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Badge set="chip" state="imp" size="l">컴포넌트</Badge>
<Badge set="chip" state="imp" size="m">컴포넌트</Badge>
<Badge set="chip" state="imp" size="s">컴포넌트</Badge>
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
                            <Badge set="chip" state="" size="l">컴포넌트</Badge>
                            <Badge set="chip" state="" size="m">컴포넌트</Badge>
                            <Badge set="chip" state="" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Strong</dt>
                        <dd className="flexBox">
                            <Badge set="chip" state="st" size="l">컴포넌트</Badge>
                            <Badge set="chip" state="st" size="m">컴포넌트</Badge>
                            <Badge set="chip" state="st" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Important</dt>
                        <dd className="flexBox">
                            <Badge set="chip" state="imp" size="l">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="m">컴포넌트</Badge>
                            <Badge set="chip" state="imp" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Negative</dt>
                        <dd className="flexBox">
                            <Badge set="chip" state="ne" size="l">컴포넌트</Badge>
                            <Badge set="chip" state="ne" size="m">컴포넌트</Badge>
                            <Badge set="chip" state="ne" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Point</dt>
                        <dd className="flexBox">
                            <Badge set="chip" state="po" size="l">컴포넌트</Badge>
                            <Badge set="chip" state="po" size="m">컴포넌트</Badge>
                            <Badge set="chip" state="po" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd className="flexBox">
                            <Badge set="chip" state="er" size="l">컴포넌트</Badge>
                            <Badge set="chip" state="er" size="m">컴포넌트</Badge>
                            <Badge set="chip" state="er" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Caution</dt>
                        <dd className="flexBox">
                            <Badge set="chip" state="ca" size="l">컴포넌트</Badge>
                            <Badge set="chip" state="ca" size="m">컴포넌트</Badge>
                            <Badge set="chip" state="ca" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd className="flexBox">
                            <Badge set="chip" state="su" size="l">컴포넌트</Badge>
                            <Badge set="chip" state="su" size="m">컴포넌트</Badge>
                            <Badge set="chip" state="su" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Information</dt>
                        <dd className="flexBox">
                            <Badge set="chip" state="if" size="l">컴포넌트</Badge>
                            <Badge set="chip" state="if" size="m">컴포넌트</Badge>
                            <Badge set="chip" state="if" size="s">컴포넌트</Badge>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Badge set="chip" state="" size="l">컴포넌트</Badge>
<Badge set="chip" state="st" size="l">컴포넌트</Badge>
<Badge set="chip" state="imp" size="l">컴포넌트</Badge>
<Badge set="chip" state="ne" size="l">컴포넌트</Badge>
<Badge set="chip" state="po" size="l">컴포넌트</Badge>
<Badge set="chip" state="er" size="l">컴포넌트</Badge>
<Badge set="chip" state="ca" size="l">컴포넌트</Badge>
<Badge set="chip" state="su" size="l">컴포넌트</Badge>
<Badge set="chip" state="if" size="l">컴포넌트</Badge>
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
