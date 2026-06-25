import React, {useRef, useState, useEffect} from "react";
import { Button } from "@/component/form";
import { Progress, Loader, Tooltip, sstToast  } from "@/component/feedback";
function SgDisplay() {
    const sections = [
        { id: "progress", label: "Progress" },
        { id: "spinner", label: "Spinner" },
        { id: "loading", label: "Loading" },
        { id: "tooltip", label: "Tooltip" },
        { id: "toast", label: "Toast" },
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

        <div className="sg_inner" ref={(el) => (secRefs.current.spinner = el)}>
            <div className="sg_tit">
                <h1>Spinner</h1>
                <p>로딩을 안내하는 스피너 컴포넌트</p>
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
                        <em>JSX</em>
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
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Loader set="spinner" size="xxl"></Loader>
<Button rank="a" size="xxl" set="po" type="button" iconL="ico-spinner">로딩중</Button>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <div className="sg_inner" ref={(el) => (secRefs.current.loading = el)}>
            <div className="sg_tit">
                <h1>Loading</h1>
                <p>진행중을 표시하는 로딩 컴포넌트</p>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>XXL</dt>
                        <dd>
                            <Loader set="loading" size="xxl"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>XL</dt>
                        <dd>
                            <Loader set="loading" size="xl"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd>
                            <Loader set="loading" size="l"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd>
                            <Loader set="loading" size="m"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd>
                            <Loader set="loading" size="s"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>XS</dt>
                        <dd>
                            <Loader set="loading" size="xs"></Loader>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Loader set="loading" size="xxl"></Loader>
<Loader set="loading" size="xl"></Loader>
<Loader set="loading" size="l"></Loader>
<Loader set="loading" size="m"></Loader>
<Loader set="loading" size="s"></Loader>
<Loader set="loading" size="xs"></Loader>
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
                        <dt>Only</dt>
                        <dd className="flexBox">
                            <Loader set="loading" size="xxl"></Loader>
                            <Loader set="loading" size="xl"></Loader>
                            <Loader set="loading" size="l"></Loader>
                            <Loader set="loading" size="m"></Loader>
                            <Loader set="loading" size="s"></Loader>
                            <Loader set="loading" size="xs"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Icon</dt>
                        <dd className="flexBox">
                            <Loader set="ico-loading" size="xxl"></Loader>
                            <Loader set="ico-loading" size="xl"></Loader>
                            <Loader set="ico-loading" size="l"></Loader>
                            <Loader set="ico-loading" size="m"></Loader>
                            <Loader set="ico-loading" size="s"></Loader>
                            <Loader set="ico-loading" size="xs"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Button</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xxl" set="po" type="button" iconL="loading">로딩중</Button>
                            <Button rank="a" size="xl" set="po" type="button" iconL="loading">로딩중</Button>
                            <Button rank="a" size="l" set="po" type="button" iconL="loading">로딩중</Button>
                            <Button rank="a" size="m" set="po" type="button" iconL="loading">로딩중</Button>
                            <Button rank="a" size="s" set="po" type="button" iconL="loading">로딩중</Button>
                            <Button rank="a" size="xs" set="po" type="button" iconL="loading">로딩중</Button>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Loader set="loading" size="xxl"></Loader>
<Loader set="ico-loading" size="xxl"></Loader>
<Button rank="a" size="xxl" set="po" type="button" iconL="loading">로딩중</Button>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <div className="sg_inner" ref={(el) => (secRefs.current.tooltip = el)}>
            <div className="sg_tit">
                <h1>Tooltip</h1>
                <p>진행중을 표시하는 로딩 컴포넌트</p>
            </div>
            {/* 사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>Normal</dt>
                        <dd>
                            <p style={{fontSize : "1.8rem", color:"#999"}}>마우스를 올려보세요</p>
                            <Tooltip state="nm"></Tooltip>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Positive</dt>
                        <dd>
                            <p style={{fontSize : "1.8rem", color:"#999"}}>마우스를 올려보세요</p>
                            <Tooltip state="po"></Tooltip>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd>
                            <p style={{fontSize : "1.8rem", color:"#999"}}>마우스를 올려보세요</p>
                            <Tooltip state="er"></Tooltip>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Caution</dt>
                        <dd>
                            <p style={{fontSize : "1.8rem", color:"#999"}}>마우스를 올려보세요</p>
                            <Tooltip state="ca"></Tooltip>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd>
                            <p style={{fontSize : "1.8rem", color:"#999"}}>마우스를 올려보세요</p>
                            <Tooltip state="su"></Tooltip>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Information</dt>
                        <dd>
                            <p style={{fontSize : "1.8rem", color:"#999"}}>마우스를 올려보세요</p>
                            <Tooltip state="if"></Tooltip>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Danger</dt>
                        <dd>
                            <p style={{fontSize : "1.8rem", color:"#999"}}>마우스를 올려보세요</p>
                            <Tooltip state="de"></Tooltip>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Important</dt>
                        <dd>
                            <p style={{fontSize : "1.8rem", color:"#999"}}>마우스를 올려보세요</p>
                            <Tooltip state="imp"></Tooltip>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Negative</dt>
                        <dd>
                            <p style={{fontSize : "1.8rem", color:"#999"}}>마우스를 올려보세요</p>
                            <Tooltip state="ne"></Tooltip>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Tooltip state="nm"></Tooltip>
<Tooltip state="po"></Tooltip>
<Tooltip state="er"></Tooltip>
<Tooltip state="ca"></Tooltip>
<Tooltip state="su"></Tooltip>
<Tooltip state="if"></Tooltip>
<Tooltip state="de"></Tooltip>
<Tooltip state="imp"></Tooltip>
<Tooltip state="ne"></Tooltip>
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
                        <dt>Only</dt>
                        <dd className="flexBox">
                            <Loader set="loading" size="xxl"></Loader>
                            <Loader set="loading" size="xl"></Loader>
                            <Loader set="loading" size="l"></Loader>
                            <Loader set="loading" size="m"></Loader>
                            <Loader set="loading" size="s"></Loader>
                            <Loader set="loading" size="xs"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Icon</dt>
                        <dd className="flexBox">
                            <Loader set="ico-loading" size="xxl"></Loader>
                            <Loader set="ico-loading" size="xl"></Loader>
                            <Loader set="ico-loading" size="l"></Loader>
                            <Loader set="ico-loading" size="m"></Loader>
                            <Loader set="ico-loading" size="s"></Loader>
                            <Loader set="ico-loading" size="xs"></Loader>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Button</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xxl" set="po" type="button" iconL="loading">로딩중</Button>
                            <Button rank="a" size="xl" set="po" type="button" iconL="loading">로딩중</Button>
                            <Button rank="a" size="l" set="po" type="button" iconL="loading">로딩중</Button>
                            <Button rank="a" size="m" set="po" type="button" iconL="loading">로딩중</Button>
                            <Button rank="a" size="s" set="po" type="button" iconL="loading">로딩중</Button>
                            <Button rank="a" size="xs" set="po" type="button" iconL="loading">로딩중</Button>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Loader set="loading" size="xxl"></Loader>
<Loader set="ico-loading" size="xxl"></Loader>
<Button rank="a" size="xxl" set="po" type="button" iconL="loading">로딩중</Button>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <div className="sg_inner" ref={(el) => (secRefs.current.toast = el)}>
            <div className="sg_tit">
                <h1>Toast</h1>
                <p>화면 우측 상단에 잠시 떴다 사라지는 알림 컴포넌트</p>
            </div>
            {/* 아이콘 타입 */}
            <div className="sg_area">
                <p>아이콘 타입</p>
                <div className="sg_box">
                    <dl>
                        <dt>Default</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstToast({ title: "기본 토스트입니다." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstToast({ icon: "comple", title: "정상적으로 처리되었습니다." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstToast({ icon: "error", title: "오류가 발생했습니다." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Warning</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstToast({ icon: "warning", title: "주의가 필요합니다." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Info</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstToast({ icon: "info", title: "안내 메시지입니다." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Question</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstToast({ icon: "quest", title: "확인이 필요합니다." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`import { sstToast } from "@/component/feedback";

sstToast({ title: "기본 토스트입니다." });
sstToast({ icon: "comple", title: "정상적으로 처리되었습니다." });
sstToast({ icon: "error", title: "오류가 발생했습니다." });
sstToast({ icon: "warning", title: "주의가 필요합니다." });
sstToast({ icon: "info", title: "안내 메시지입니다." });
sstToast({ icon: "quest", title: "확인이 필요합니다." });
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
            {/* 옵션 */}
            <div className="sg_area">
                <p>옵션</p>
                <div className="sg_box">
                    <dl>
                        <dt>제목 + 본문</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstToast({ icon: "comple", title: "저장 완료", text: "변경사항이 정상적으로 저장되었습니다." })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>닫기 버튼 없음</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstToast({ icon: "info", title: "닫기 버튼이 없는 토스트입니다.", closable: false })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>자동 닫힘 없음</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstToast({ icon: "warning", title: "직접 닫아야 사라집니다.", duration: 0 })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>노출 시간(7초)</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" onClick={() => sstToast({ icon: "info", title: "7초 동안 노출됩니다.", duration: 7000 })}>클릭하세요</Button>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`// 제목 + 본문
sstToast({ icon: "comple", title: "저장 완료", text: "변경사항이 저장되었습니다." });

// 닫기 버튼 숨기기
sstToast({ icon: "info", title: "...", closable: false });

// 자동으로 닫지 않기 (직접 닫기 / sstToastClose 호출)
sstToast({ icon: "warning", title: "...", duration: 0 });

// 노출 시간 변경 (기본 3000ms)
sstToast({ icon: "info", title: "...", duration: 7000 });
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
