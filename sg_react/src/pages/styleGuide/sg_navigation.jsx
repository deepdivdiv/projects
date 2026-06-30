import React, {useRef, useState, useEffect} from "react";
import { Button } from "@/component/form";
import { Tab } from "@/component/navigation";
// import ThumbIMG from "@/assets/thumb.png";

function SgNavigation() {
    const sections = [
        { id: "tab", label: "Tab" },
        { id: "bar", label: "Bar" },
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

    // 콘텐츠 안에 구조로 잡고싶을경우 변수로 만들어서 넣는방법도 있음
    const normalTabs = [
        { label: "탭1", content:""},
        { label: "탭2", content:"" },
    ];

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
        <div className="sg_inner" ref={(el) => (secRefs.current.tab = el)}>
            <div className="sg_tit">
                <h1>Tab</h1>
                <p>다양한 스타일의 탭 버튼 컴포넌트</p>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>XL</dt>
                        <dd>
                            <Tab size="xl" set="" items={normalTabs} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd>
                            <Tab size="l" set="" items={normalTabs} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd>
                            <Tab size="m" set="" items={normalTabs} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd>
                            <Tab size="s" set="" items={normalTabs} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd>
                            <Tab size="xs" set="" items={normalTabs} />
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Tab size="xl" set="" items={normalTabs} />
<Tab size="l" set="" items={normalTabs} />
<Tab size="m" set="" items={normalTabs} />
<Tab size="s" set="" items={normalTabs} />
<Tab size="xs" set="" items={normalTabs} />
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>Normal</dt>
                        <dd>
                            <Tab size="xl" set="" items={normalTabs} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>Narrow</dt>
                        <dd>
                            <Tab size="xl" set="nar" items={normalTabs} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>Line</dt>
                        <dd>
                            <Tab size="xl" set="line" items={normalTabs}/>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Under</dt>
                        <dd>
                            <Tab size="xl" set="ud" items={normalTabs}/>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Tab size="xl" set="" items={normalTabs} />
<Tab size="xl" set="nar" items={normalTabs} />
<Tab size="xl" set="line" items={normalTabs}/>
<Tab size="xl" set="ud" items={normalTabs}/>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="sg_inner" ref={(el) => (secRefs.current.bar = el)}>
            <div className="sg_tit">
                <h1>Bar</h1>
                <p>다양한 스타일의 바 형식 탭 컴포넌트</p>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>XL</dt>
                        <dd>
                            <Tab size="xl" set="" items={normalTabs} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd>
                            <Tab size="l" set="" items={normalTabs} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd>
                            <Tab size="m" set="" items={normalTabs} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd>
                            <Tab size="s" set="" items={normalTabs} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd>
                            <Tab size="xs" set="" items={normalTabs} />
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Tab size="xl" set="" items={normalTabs} />
<Tab size="l" set="" items={normalTabs} />
<Tab size="m" set="" items={normalTabs} />
<Tab size="s" set="" items={normalTabs} />
<Tab size="xs" set="" items={normalTabs} />
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>Normal</dt>
                        <dd>
                            <Tab size="xl" set="" items={normalTabs} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>Narrow</dt>
                        <dd>
                            <Tab size="xl" set="nar" items={normalTabs} />
                        </dd>
                    </dl>
                    <dl>
                        <dt>Line</dt>
                        <dd>
                            <Tab size="xl" set="line" items={normalTabs}/>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Under</dt>
                        <dd>
                            <Tab size="xl" set="ud" items={normalTabs}/>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Tab size="xl" set="" items={normalTabs} />
<Tab size="xl" set="nar" items={normalTabs} />
<Tab size="xl" set="line" items={normalTabs}/>
<Tab size="xl" set="ud" items={normalTabs}/>
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

export default SgNavigation
