import React, {useRef, useState, useEffect} from "react";
import { Badge } from "@/component/display";
import { Button } from "@/component/form";
import { Progress, Loader } from "@/component/feedback";
function SgDisplay() {
    const sections = [
        { id: "progress", label: "Progress" },
        { id: "spinner", label: "Spinner" },
        { id: "loading", label: "Loading" },
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
        <div className="sg_inner" ref={(el) => (secRefs.current.progress = el)}>
            <div className="sg_tit">
                <h1>Progress</h1>
                <p>상태 및 카테고리를 표시하는 라벨 컴포넌트</p>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>L</dt>
                        <dd className="flexBox">
                            <Progress size="l" state="imp" max="100" value="30">
                                <dl>
                                    <dt>게이지</dt>
                                    <dd>30%</dd>
                                </dl>
                            </Progress>
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd className="flexBox">
                            <Progress size="m" state="imp" max="100" value="30">
                                <dl>
                                    <dt>게이지</dt>
                                    <dd>30%</dd>
                                </dl>
                            </Progress>
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd className="flexBox">
                            <Progress size="s" state="imp" max="100" value="30">
                                <dl>
                                    <dt>게이지</dt>
                                    <dd>30%</dd>
                                </dl>
                            </Progress>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>HTML</em>
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
                            <Progress size="l" value="25" max="100"></Progress>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Negative</dt>
                        <dd className="flexBox">
                            <Progress size="l" value="25" max="100" state="ne"></Progress>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd className="flexBox">
                            <Progress size="l" value="25" max="100" state="er"></Progress>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Caution</dt>
                        <dd className="flexBox">
                            <Progress size="l" value="25" max="100" state="ca"></Progress>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd className="flexBox">
                            <Progress size="l" value="25" max="100" state="su"></Progress>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
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

        <div className="sg_inner" ref={(el) => (secRefs.current.spinner = el)}>
            <div className="sg_tit">
                <h1>Spinner</h1>
                <p>해시태그를 표시하는 컴포넌트</p>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>XXL</dt>
                        <dd>
                            <Loader set="spinner" size="xxl"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>XL</dt>
                        <dd>
                            <Loader set="spinner" size="xl"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd>
                            <Loader set="spinner" size="l"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd>
                            <Loader set="spinner" size="m"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd>
                            <Loader set="spinner" size="s"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>XS</dt>
                        <dd>
                            <Loader set="spinner" size="xs"></Loader>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Loader set="spinner" size="xxl"></Loader>
<Loader set="spinner" size="xl"></Loader>
<Loader set="spinner" size="l"></Loader>
<Loader set="spinner" size="m"></Loader>
<Loader set="spinner" size="s"></Loader>
<Loader set="spinner" size="xs"></Loader>
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
                        <dt>Icon</dt>
                        <dd className="flexBox">
                            <Loader set="spinner" size="xxl"></Loader>
                            <Loader set="spinner" size="xl"></Loader>
                            <Loader set="spinner" size="l"></Loader>
                            <Loader set="spinner" size="m"></Loader>
                            <Loader set="spinner" size="s"></Loader>
                            <Loader set="spinner" size="xs"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Button</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xxl" set="po" type="button" iconL="ico-spinner">로딩중</Button>
                            <Button rank="a" size="xl" set="po" type="button" iconL="ico-spinner">로딩중</Button>
                            <Button rank="a" size="l" set="po" type="button" iconL="ico-spinner">로딩중</Button>
                            <Button rank="a" size="m" set="po" type="button" iconL="ico-spinner">로딩중</Button>
                            <Button rank="a" size="s" set="po" type="button" iconL="ico-spinner">로딩중</Button>
                            <Button rank="a" size="xs" set="po" type="button" iconL="ico-spinner">로딩중</Button>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Loader set="spinner" size="xxl"></Loader>
<Loader set="spinner" size="xl"></Loader>
<Loader set="spinner" size="l"></Loader>
<Loader set="spinner" size="m"></Loader>
<Loader set="spinner" size="s"></Loader>
<Loader set="spinner" size="xs"></Loader>
<Button rank="a" size="xxl" set="po" type="button" iconL="ico-spinner">로딩중</Button>
<Button rank="a" size="xl" set="po" type="button" iconL="ico-spinner">로딩중</Button>
<Button rank="a" size="l" set="po" type="button" iconL="ico-spinner">로딩중</Button>
<Button rank="a" size="m" set="po" type="button" iconL="ico-spinner">로딩중</Button>
<Button rank="a" size="s" set="po" type="button" iconL="ico-spinner">로딩중</Button>
<Button rank="a" size="xs" set="po" type="button" iconL="ico-spinner">로딩중</Button>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <div className="sg_inner" ref={(el) => (secRefs.current.loading = el)}>
            <div className="sg_tit">
                <h1>Spinner</h1>
                <p>해시태그를 표시하는 컴포넌트</p>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>XXL</dt>
                        <dd>
                            <Loader set="spinner" size="xxl"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>XL</dt>
                        <dd>
                            <Loader set="spinner" size="xl"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd>
                            <Loader set="spinner" size="l"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd>
                            <Loader set="spinner" size="m"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd>
                            <Loader set="spinner" size="s"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>XS</dt>
                        <dd>
                            <Loader set="spinner" size="xs"></Loader>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Loader set="spinner" size="xxl"></Loader>
<Loader set="spinner" size="xl"></Loader>
<Loader set="spinner" size="l"></Loader>
<Loader set="spinner" size="m"></Loader>
<Loader set="spinner" size="s"></Loader>
<Loader set="spinner" size="xs"></Loader>
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
                        <dt>Icon</dt>
                        <dd className="flexBox">
                            <Loader set="spinner" size="xxl"></Loader>
                            <Loader set="spinner" size="xl"></Loader>
                            <Loader set="spinner" size="l"></Loader>
                            <Loader set="spinner" size="m"></Loader>
                            <Loader set="spinner" size="s"></Loader>
                            <Loader set="spinner" size="xs"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Button</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xxl" set="po" type="button" iconL="ico-spinner">로딩중</Button>
                            <Button rank="a" size="xl" set="po" type="button" iconL="ico-spinner">로딩중</Button>
                            <Button rank="a" size="l" set="po" type="button" iconL="ico-spinner">로딩중</Button>
                            <Button rank="a" size="m" set="po" type="button" iconL="ico-spinner">로딩중</Button>
                            <Button rank="a" size="s" set="po" type="button" iconL="ico-spinner">로딩중</Button>
                            <Button rank="a" size="xs" set="po" type="button" iconL="ico-spinner">로딩중</Button>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Loader set="spinner" size="xxl"></Loader>
<Loader set="spinner" size="xl"></Loader>
<Loader set="spinner" size="l"></Loader>
<Loader set="spinner" size="m"></Loader>
<Loader set="spinner" size="s"></Loader>
<Loader set="spinner" size="xs"></Loader>
<Button rank="a" size="xxl" set="po" type="button" iconL="ico-spinner">로딩중</Button>
<Button rank="a" size="xl" set="po" type="button" iconL="ico-spinner">로딩중</Button>
<Button rank="a" size="l" set="po" type="button" iconL="ico-spinner">로딩중</Button>
<Button rank="a" size="m" set="po" type="button" iconL="ico-spinner">로딩중</Button>
<Button rank="a" size="s" set="po" type="button" iconL="ico-spinner">로딩중</Button>
<Button rank="a" size="xs" set="po" type="button" iconL="ico-spinner">로딩중</Button>
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
