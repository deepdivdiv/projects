import React, {useRef, useState, useEffect} from "react";
import { Button, Input, Textarea, Select, Check, Toggle, Range, Cau } from "@/component/form";

// 셀렉트 데모용 공통 옵션 (children 방식 — 네이티브 option 그대로)
const demoOpts = (
    <>
        <option value="">선택하세요</option>
        <option value="">선택하세요</option>
        <option value="">선택하세요</option>
        <option value="">선택하세요</option>
        <option value="">선택하세요</option>
    </>
);


function SgTypo() {
    const sections = [
        { id: "button", label: "Button" },
        { id: "input", label: "Input" },
        { id: "textarea", label: "Textarea" },
        { id: "select", label: "Select" },
        { id: "checkbox", label: "Checkbox" },
        { id: "radio", label: "Radio" },
        { id: "switch", label: "Switch" },
        { id: "range", label: "Range" },
        { id: "caption", label: "Caption" },
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
        <div className="sg_inner" ref={(el) => (secRefs.current.button = el)}>
            <div className="sg_tit">
                <h1>Button</h1>
                <p>다양한 스타일의 버튼 컴포넌트</p>
            </div>
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>XL</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xl" set="po" type="button" iconR="arr-right">버튼</Button>
                            <Button rank="b" size="xl" set="po" type="button" iconR="arr-right">버튼</Button>
                            <Button rank="c" size="xl" set="po" type="button" iconR="arr-right">버튼</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="l" set="po" type="button" iconR="arr-right">버튼</Button>
                            <Button rank="b" size="l" set="po" type="button" iconR="arr-right">버튼</Button>
                            <Button rank="c" size="l" set="po" type="button" iconR="arr-right">버튼</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="m" set="po" type="button" iconR="arr-right">버튼</Button>
                            <Button rank="b" size="m" set="po" type="button" iconR="arr-right">버튼</Button>
                            <Button rank="c" size="m" set="po" type="button" iconR="arr-right">버튼</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="s" set="po" type="button" iconR="arr-right">버튼</Button>
                            <Button rank="b" size="s" set="po" type="button" iconR="arr-right">버튼</Button>
                            <Button rank="c" size="s" set="po" type="button" iconR="arr-right">버튼</Button>
                        </dd>
                    </dl>
                    <dl>
                        <dt>XS</dt>
                        <dd className="flexBox">
                            <Button rank="a" size="xs" set="po" type="button" iconR="arr-right">버튼</Button>
                            <Button rank="b" size="xs" set="po" type="button" iconR="arr-right">버튼</Button>
                            <Button rank="c" size="xs" set="po" type="button" iconR="arr-right">버튼</Button>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>JSX</em>
                        <div>
                            <xmp>
{`<Button rank="a" size="xl" set="po" type="button" iconR="arr-right">버튼</Button>
<Button rank="a" size="l" set="po" type="button" iconR="arr-right">버튼</Button>
<Button rank="a" size="m" set="po" type="button" iconR="arr-right">버튼</Button>
<Button rank="a" size="s" set="po" type="button" iconR="arr-right">버튼</Button>
<Button rank="a" size="xs" set="po" type="button" iconR="arr-right">버튼</Button>
`}
                            </xmp>
                        </div>
                    </div>
                </div>
            </div>
            {/* 버튼스타일 */}
            <div className="sg_area">
                <p>스타일</p>
                <div className="sg_box">
                    <dl>
                        <dt>Normal</dt>
                        <dd>
                            <div className="flexBox">
                                <Button rank="a" size="xl" set="nm" type="button" iconR="arr-right">Default</Button>
                                <Button rank="a" size="xl" set="nm" type="button" iconR="arr-right" state="hover">Hover</Button>
                                <Button rank="a" size="xl" set="nm" type="button" iconR="arr-right" state="press">Press</Button>
                                <Button rank="a" size="xl" set="nm" type="button" iconR="arr-right" state="on">Active</Button>
                                <Button rank="a" size="xl" set="nm" type="button" iconR="arr-right" disabled>Disabled</Button>
                            </div>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Positive</dt>
                        <dd>
                            <div className="flexBox">
                                <Button rank="a" size="xl" set="po" type="button" iconR="arr-right">Default</Button>
                                <Button rank="a" size="xl" set="po" type="button" iconR="arr-right" state="hover">Hover</Button>
                                <Button rank="a" size="xl" set="po" type="button" iconR="arr-right" state="press">Press</Button>
                                <Button rank="a" size="xl" set="po" type="button" iconR="arr-right" state="on">Active</Button>
                                <Button rank="a" size="xl" set="po" type="button" iconR="arr-right" disabled>Disabled</Button>
                            </div>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Negative</dt>
                        <dd>
                            <div className="flexBox">
                                <Button rank="a" size="xl" set="ne" type="button" iconR="arr-right">Default</Button>
                                <Button rank="a" size="xl" set="ne" type="button" iconR="arr-right" state="hover">Hover</Button>
                                <Button rank="a" size="xl" set="ne" type="button" iconR="arr-right" state="press">Press</Button>
                                <Button rank="a" size="xl" set="ne" type="button" iconR="arr-right" state="on">Active</Button>
                                <Button rank="a" size="xl" set="ne" type="button" iconR="arr-right" disabled>Disabled</Button>
                            </div>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>HTML</em>
                        <div>
    <xmp>
{`ㅁ
<Button rank="a" size="xl" set="nm" type="button" iconR="arr-right">Default</Button>
<Button rank="a" size="xl" set="po" type="button" iconR="arr-right">Default</Button>
<Button rank="a" size="xl" set="ne" type="button" iconR="arr-right">Default</Button>
`}
    </xmp>
                        </div>
                    </div>
                </div>
            </div>

            {/* 버튼 타입 */}
            <div className="sg_area">
                <p>타입</p>
                <div className="sg_box">
                    <dl>
                        <dt>A (Solid)</dt>
                        <dd>
                            <div className="flexBox">
                                <Button rank="a" size="xl" set="po" type="button" iconR="arr-right">Default</Button>
                                <Button rank="a" size="xl" set="po" type="button" iconR="arr-right" state="hover">Hover</Button>
                                <Button rank="a" size="xl" set="po" type="button" iconR="arr-right" state="press">Press</Button>
                                <Button rank="a" size="xl" set="po" type="button" iconR="arr-right" state="on">Active</Button>
                                <Button rank="a" size="xl" set="po" type="button" iconR="arr-right" disabled>Disabled</Button>
                            </div>
                        </dd>
                    </dl>
                    <dl>
                        <dt>B (Outline)</dt>
                        <dd>
                            <div className="flexBox">
                                <Button rank="b" size="xl" set="po" type="button" iconR="arr-right">Default</Button>
                                <Button rank="b" size="xl" set="po" type="button" iconR="arr-right" state="hover">Hover</Button>
                                <Button rank="b" size="xl" set="po" type="button" iconR="arr-right" state="press">Press</Button>
                                <Button rank="b" size="xl" set="po" type="button" iconR="arr-right" state="on">Active</Button>
                                <Button rank="b" size="xl" set="po" type="button" iconR="arr-right" disabled>Disabled</Button>
                            </div>
                        </dd>
                    </dl>
                    <dl>
                        <dt>C (Ghost)</dt>
                        <dd>
                            <div className="flexBox">
                                <Button rank="c" size="xl" set="po" type="button" iconR="arr-right">Default</Button>
                                <Button rank="c" size="xl" set="po" type="button" iconR="arr-right" state="hover">Hover</Button>
                                <Button rank="c" size="xl" set="po" type="button" iconR="arr-right" state="press">Press</Button>
                                <Button rank="c" size="xl" set="po" type="button" iconR="arr-right" state="on">Active</Button>
                                <Button rank="c" size="xl" set="po" type="button" iconR="arr-right" disabled>Disabled</Button>
                            </div>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
<xmp>
{`
<Button rank="a" size="xl" set="po" type="button" iconR="arr-right">Default</Button>
<Button rank="b" size="xl" set="po" type="button" iconR="arr-right">Default</Button>
<Button rank="c" size="xl" set="po" type="button" iconR="arr-right">Default</Button>

`}
</xmp>
                        </div>
                    </div>
                </div>
            </div>

            
        </div>

        {/* 인풋 */}
        <div className="sg_inner" ref={(el) => (secRefs.current.input = el)}>
            <div className="sg_tit">
                <h1>Input</h1>
                <p>텍스트 입력을 위한 다양한 크기의 인풋 필드</p>
            </div>

            {/* 인풋사이즈 */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>L</dt>
                        <dd className="flexBox">
                            <Input size="l" placeholder="텍스트를 입력하세요"></Input>
                            <Input size="l" set="er" placeholder="텍스트를 입력하세요"></Input>
                            <Input size="l" set="ca" placeholder="텍스트를 입력하세요"></Input>
                            <Input size="l" set="su" placeholder="텍스트를 입력하세요"></Input>
                            <Input size="l" placeholder="텍스트를 입력하세요" disabled></Input>
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd className="flexBox">
                            <Input size="m" placeholder="텍스트를 입력하세요"></Input>
                            <Input size="m" set="er" placeholder="텍스트를 입력하세요"></Input>
                            <Input size="m" set="ca" placeholder="텍스트를 입력하세요"></Input>
                            <Input size="m" set="su" placeholder="텍스트를 입력하세요"></Input>
                            <Input size="m" placeholder="텍스트를 입력하세요" disabled></Input>
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd className="flexBox">
                            <Input size="s" placeholder="텍스트를 입력하세요"></Input>
                            <Input size="s" set="er" placeholder="텍스트를 입력하세요"></Input>
                            <Input size="s" set="ca" placeholder="텍스트를 입력하세요"></Input>
                            <Input size="s" set="su" placeholder="텍스트를 입력하세요"></Input>
                            <Input size="s" placeholder="텍스트를 입력하세요" disabled></Input>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
    <xmp>
{`<Input size="l" placeholder="텍스트를 입력하세요"></Input>
<Input size="m" placeholder="텍스트를 입력하세요"></Input>
<Input size="s" placeholder="텍스트를 입력하세요"></Input>

`}
    </xmp>
                        </div>
                    </div>
                </div>
            </div>

            {/* <!-- 인풋스타일 --> */}
            <div className="sg_area">
                <p>유형</p>
                <div className="sg_box">
                    <dl>
                        <dt>Normal</dt>
                        <dd className="flexBox">
                            <Input size="l" placeholder="텍스트를 입력하세요" message="텍스트를 입력하세요"></Input>
                            <Input size="l" placeholder="텍스트를 입력하세요" message="텍스트를 입력하세요" state="hover"></Input>
                            <Input size="l" placeholder="텍스트를 입력하세요" message="텍스트를 입력하세요" state="focus"></Input>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd className="flexBox">
                            <Input size="l" placeholder="텍스트를 입력하세요" message="비밀번호가 틀렸습니다" set="er"></Input>
                            <Input size="l" placeholder="텍스트를 입력하세요" message="비밀번호가 틀렸습니다" set="er" state="hover"></Input>
                            <Input size="l" placeholder="텍스트를 입력하세요" message="비밀번호가 틀렸습니다" set="er" state="focus"></Input>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Caution</dt>
                        <dd className="flexBox">
                            <Input size="l" placeholder="텍스트를 입력하세요" message="보안이 취약합니다" set="ca"></Input>
                            <Input size="l" placeholder="텍스트를 입력하세요" message="보안이 취약합니다" set="ca" state="hover"></Input>
                            <Input size="l" placeholder="텍스트를 입력하세요" message="보안이 취약합니다" set="ca" state="focus"></Input>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd className="flexBox">
                            <Input size="l" placeholder="텍스트를 입력하세요" message="인증이 완료되었습니다" set="su"></Input>
                            <Input size="l" placeholder="텍스트를 입력하세요" message="인증이 완료되었습니다" set="su" state="hover"></Input>
                            <Input size="l" placeholder="텍스트를 입력하세요" message="인증이 완료되었습니다" set="su" state="focus"></Input>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
    <xmp>
    {`
<Input size="l" placeholder="텍스트를 입력하세요" message="텍스트를 입력하세요"></Input>
<Input size="l" placeholder="텍스트를 입력하세요" message="비밀번호가 틀렸습니다" set="er"></Input>
<Input size="l" placeholder="텍스트를 입력하세요" message="보안이 취약합니다" set="ca"></Input>
<Input size="l" placeholder="텍스트를 입력하세요" message="인증이 완료되었습니다" set="su"></Input>
    `}
    </xmp>
                        </div>
                    </div>
                </div>
            </div>
            
        </div>

        {/* <!-- 텍스트에이리어 --> */}
        <div className="sg_inner" ref={(el) => (secRefs.current.textarea = el)}>
            <div className="sg_tit">
                <h1>Textarea</h1>
                <p>여러 줄 텍스트 입력을 위한 컴포넌트</p>
            </div>

            {/* <!-- 사이즈 --> */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>L</dt>
                        <dd className="flexBox">
                            <Textarea size="l" placeholder="텍스트를 입력하세요"></Textarea>
                            <Textarea size="l" placeholder="텍스트를 입력하세요" set="er"></Textarea>
                            <Textarea size="l" placeholder="텍스트를 입력하세요" set="ca"></Textarea>
                            <Textarea size="l" placeholder="텍스트를 입력하세요" set="su"></Textarea>
                            <Textarea size="l" placeholder="텍스트를 입력하세요" disabled></Textarea>
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd className="flexBox">
                            <Textarea size="m" placeholder="텍스트를 입력하세요"></Textarea>
                            <Textarea size="m" placeholder="텍스트를 입력하세요" set="er"></Textarea>
                            <Textarea size="m" placeholder="텍스트를 입력하세요" set="ca"></Textarea>
                            <Textarea size="m" placeholder="텍스트를 입력하세요" set="su"></Textarea>
                            <Textarea size="m" placeholder="텍스트를 입력하세요" disabled></Textarea>
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd className="flexBox">
                            <Textarea size="s" placeholder="텍스트를 입력하세요"></Textarea>
                            <Textarea size="s" placeholder="텍스트를 입력하세요" set="er"></Textarea>
                            <Textarea size="s" placeholder="텍스트를 입력하세요" set="ca"></Textarea>
                            <Textarea size="s" placeholder="텍스트를 입력하세요" set="su"></Textarea>
                            <Textarea size="s" placeholder="텍스트를 입력하세요" disabled></Textarea>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
    <xmp>
    {`
<Textarea size="l" placeholder="텍스트를 입력하세요"></Textarea>
<Textarea size="m" placeholder="텍스트를 입력하세요"></Textarea>
<Textarea size="s" placeholder="텍스트를 입력하세요"></Textarea>

    `}
    </xmp>
                        </div>
                    </div>
                </div>
            </div>

            {/* <!-- 인풋스타일 --> */}
            <div className="sg_area">
                <p>유형</p>
                <div className="sg_box">
                    <dl>
                        <dt>Normal</dt>
                        <dd className="flexBox">
                            <Textarea size="l" placeholder="텍스트를 입력하세요" message="텍스트를 입력하세요"></Textarea>
                            <Textarea size="l" state="hover" placeholder="텍스트를 입력하세요"></Textarea>
                            <Textarea size="l" state="focus" placeholder="텍스트를 입력하세요"></Textarea>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd className="flexBox">
                            <Textarea size="l" set="er" placeholder="텍스트를 입력하세요"></Textarea>
                            <Textarea size="l" set="er" state="hover" placeholder="텍스트를 입력하세요"></Textarea>
                            <Textarea size="l" set="er" state="focus" placeholder="텍스트를 입력하세요"></Textarea>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Caution</dt>
                        <dd className="flexBox">
                            <Textarea size="l" set="ca" placeholder="텍스트를 입력하세요"></Textarea>
                            <Textarea size="l" set="ca" state="hover" placeholder="텍스트를 입력하세요"></Textarea>
                            <Textarea size="l" set="ca" state="focus" placeholder="텍스트를 입력하세요"></Textarea>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd className="flexBox">
                            <Textarea size="l" set="su" placeholder="텍스트를 입력하세요"></Textarea>
                            <Textarea size="l" set="su" state="hover" placeholder="텍스트를 입력하세요"></Textarea>
                            <Textarea size="l" set="su" state="focus" placeholder="텍스트를 입력하세요"></Textarea>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
                            <xmp>
{`<Textarea size="l" placeholder="텍스트를 입력하세요"></Textarea>
<Textarea size="l" set="er" placeholder="텍스트를 입력하세요"></Textarea>
<Textarea size="l" set="ca" placeholder="텍스트를 입력하세요"></Textarea>
<Textarea size="l" set="su" placeholder="텍스트를 입력하세요"></Textarea>

`}
                            </xmp>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        {/* <!-- 셀렉트 --> */}
        <div className="sg_inner" ref={(el) => (secRefs.current.select = el)}>
            <div className="sg_tit">
                <h1>Select</h1>
                <p>드롭다운 선택을 위한 셀렉트 컴포넌트</p>
            </div>

            {/* <!-- 사이즈 --> */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>L</dt>
                        <dd className="flexBox">
                            <Select size="l">
                                <option value="">선택하세요</option>
                            </Select>
                            <Select size="l" set="er">{demoOpts}</Select>
                            <Select size="l" set="ca">{demoOpts}</Select>
                            <Select size="l" set="su">{demoOpts}</Select>
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd className="flexBox">
                            <Select size="m">{demoOpts}</Select>
                            <Select size="m" set="er">{demoOpts}</Select>
                            <Select size="m" set="ca">{demoOpts}</Select>
                            <Select size="m" set="su">{demoOpts}</Select>
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd className="flexBox">
                            <Select size="s">{demoOpts}</Select>
                            <Select size="s" set="er">{demoOpts}</Select>
                            <Select size="s" set="ca">{demoOpts}</Select>
                            <Select size="s" set="su">{demoOpts}</Select>
                        </dd>
                    </dl>
                    
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
    <xmp>
{`<Select size="l">
    <option value="">선택하세요</option>
</Select>
<Select size="m">
    <option value="">선택하세요</option>
</Select>
<Select size="s">
    <option value="">선택하세요</option>
</Select>
`}
    </xmp>
                        </div>
                    </div>
                </div>
            </div>
            {/* <!-- 스타일 --> */}
            <div className="sg_area">
                <p>스타일</p>
                <div className="sg_box">
                    <dl>
                        <dt>Normal</dt>
                        <dd className="flexBox">
                            <Select size="l">{demoOpts}</Select>
                            <Select size="l" state="hover">{demoOpts}</Select>
                            <Select size="l" state="focus">{demoOpts}</Select>
                            <Select size="l" disabled>{demoOpts}</Select>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd className="flexBox">
                            <Select size="l" set="er">{demoOpts}</Select>
                            <Select size="l" set="er" state="hover">{demoOpts}</Select>
                            <Select size="l" set="er" state="focus">{demoOpts}</Select>
                            <Select size="l" set="er" disabled>{demoOpts}</Select>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Caution</dt>
                        <dd className="flexBox">
                            <Select size="l" set="ca">{demoOpts}</Select>
                            <Select size="l" set="ca" state="hover">{demoOpts}</Select>
                            <Select size="l" set="ca" state="focus" open>{demoOpts}</Select>
                            <Select size="l" set="ca" disabled>{demoOpts}</Select>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd className="flexBox">
                            <Select size="l" set="su">{demoOpts}</Select>
                            <Select size="l" set="su" state="hover">{demoOpts}</Select>
                            <Select size="l" set="su" state="focus">{demoOpts}</Select>
                            <Select size="l" set="su" disabled>{demoOpts}</Select>
                        </dd>
                    </dl>

                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`// 유효성 상태 status, 시연용 상태 state(hover/focus), open 으로 펼침
<Select size="l" set="er">{children}</Select>
<Select size="l" set="er" state="hover">...</Select>
<Select size="l" set="ca" state="focus" open>...</Select>
<Select size="l" set="su" disabled>...</Select>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

            
        </div>

        {/* <!-- 체크박스 --> */}
        <div className="sg_inner" ref={(el) => (secRefs.current.checkbox = el)}>
            <div className="sg_tit">
                <h1>Checkbox</h1>
                <p>체크박스 컴포넌트</p>
            </div>

            {/* <!-- 사이즈 --> */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>XL</dt>
                        <dd className="flexBox">
                            <Check type="checkbox" size="xl" id="check-1"></Check>
                            <Check type="checkbox" size="xl" id="check-2" state="imp"></Check>
                            <Check type="checkbox" size="xl" id="check-3" state="er"></Check>
                            <Check type="checkbox" size="xl" id="check-4" state="su"></Check>
                            <Check type="checkbox" size="xl" id="check-5" disabled></Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd className="flexBox">
                            <Check type="checkbox" size="l"></Check>
                            <Check type="checkbox" size="l" state="imp"></Check>
                            <Check type="checkbox" size="l" state="er"></Check>
                            <Check type="checkbox" size="l" state="su"></Check>
                            <Check type="checkbox" size="l" disabled></Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd className="flexBox">
                            <Check type="checkbox" size="m"></Check>
                            <Check type="checkbox" size="m" state="imp"></Check>
                            <Check type="checkbox" size="m" state="er"></Check>
                            <Check type="checkbox" size="m" state="su"></Check>
                            <Check type="checkbox" size="m" disabled></Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd className="flexBox">
                            <Check type="checkbox" size="s"></Check>
                            <Check type="checkbox" size="s" state="imp"></Check>
                            <Check type="checkbox" size="s" state="er"></Check>
                            <Check type="checkbox" size="s" state="su"></Check>
                            <Check type="checkbox" size="s" disabled></Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>XS</dt>
                        <dd className="flexBox">
                            <Check type="checkbox" size="xs"></Check>
                            <Check type="checkbox" size="xs" state="imp"></Check>
                            <Check type="checkbox" size="xs" state="er"></Check>
                            <Check type="checkbox" size="xs" state="su"></Check>
                            <Check type="checkbox" size="xs" disabled></Check>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Check type="checkbox" size="xl" id="check-1" name="check"></Check>
<Check type="checkbox" size="l" id="check-1" name="check"></Check>
<Check type="checkbox" size="m" id="check-1" name="check"></Check>
<Check type="checkbox" size="s" id="check-1" name="check"></Check>
<Check type="checkbox" size="xs" id="check-1" name="check"></Check>

`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

            {/* <!-- 스타일 --> */}
            <div className="sg_area">
                <p>스타일</p>
                <div className="sg_box">
                    <dl>
                        <dt>Default</dt>
                        <dd className="flexBox">
                            <Check size="xl" type="checkbox">Default</Check>
                            <Check size="xl" type="checkbox" set="hover">Hover</Check>
                            <Check size="xl" type="checkbox" checked>Focus</Check>
                            <Check size="xl" type="checkbox" checked set="hover">Focus Hover</Check>
                            <Check size="xl" type="checkbox" disabled>Disabled</Check>
                            <Check size="xl" type="checkbox" disabled checked>Disabled Check</Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Important</dt>
                        <dd className="flexBox">
                            <Check size="xl" state="imp" type="checkbox">Default</Check>
                            <Check size="xl" state="imp" type="checkbox" set="hover">Hover</Check>
                            <Check size="xl" state="imp" type="checkbox" checked>Focus</Check>
                            <Check size="xl" state="imp" type="checkbox" checked set="hover">Focus Hover</Check>
                            <Check size="xl" state="imp" type="checkbox" disabled>Disabled</Check>
                            <Check size="xl" state="imp" type="checkbox" disabled checked>Disabled Check</Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd className="flexBox">
                            <Check size="xl" state="er" type="checkbox">Default</Check>
                            <Check size="xl" state="er" type="checkbox" set="hover">Hover</Check>
                            <Check size="xl" state="er" type="checkbox" checked>Focus</Check>
                            <Check size="xl" state="er" type="checkbox" checked set="hover">Focus Hover</Check>
                            <Check size="xl" state="er" type="checkbox" disabled>Disabled</Check>
                            <Check size="xl" state="er" type="checkbox" disabled checked>Disabled Check</Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd className="flexBox">
                            <Check size="xl" state="su" type="checkbox">Default</Check>
                            <Check size="xl" state="su" type="checkbox" set="hover">Hover</Check>
                            <Check size="xl" state="su" type="checkbox" checked>Focus</Check>
                            <Check size="xl" state="su" type="checkbox" checked set="hover">Focus Hover</Check>
                            <Check size="xl" state="su" type="checkbox" disabled>Disabled</Check>
                            <Check size="xl" state="su" type="checkbox" disabled checked>Disabled Check</Check>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Check size="xl" type="checkbox">Default</Check>
<Check size="xl" state="imp" type="checkbox">Default</Check>
<Check size="xl" state="er" type="checkbox">Default</Check>
<Check size="xl" state="su" type="checkbox">Default</Check>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* <!-- 라디오 --> */}
        <div className="sg_inner" ref={(el) => (secRefs.current.radio = el)}>
            <div className="sg_tit">
                <h1>Radio</h1>
                <p>라디오 버튼 컴포넌트</p>
            </div>

            {/* <!-- 사이즈 --> */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>XL</dt>
                        <dd className="flexBox">
                            <Check size="xl" state="" type="radio"></Check>
                            <Check size="xl" state="imp" type="radio"></Check>
                            <Check size="xl" state="er" type="radio"></Check>
                            <Check size="xl" state="su" type="radio"></Check>
                            <Check size="xl" state="" type="radio" disabled></Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd className="flexBox">
                            <Check size="l" state="" type="radio"></Check>
                            <Check size="l" state="imp" type="radio"></Check>
                            <Check size="l" state="er" type="radio"></Check>
                            <Check size="l" state="su" type="radio"></Check>
                            <Check size="l" state="" type="radio" disabled></Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd className="flexBox">
                            <Check size="m" state="" type="radio"></Check>
                            <Check size="m" state="imp" type="radio"></Check>
                            <Check size="m" state="er" type="radio"></Check>
                            <Check size="m" state="su" type="radio"></Check>
                            <Check size="m" state="" type="radio" disabled></Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd className="flexBox">
                            <Check size="s" state="" type="radio"></Check>
                            <Check size="s" state="imp" type="radio"></Check>
                            <Check size="s" state="er" type="radio"></Check>
                            <Check size="s" state="su" type="radio"></Check>
                            <Check size="s" state="" type="radio" disabled></Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>XS</dt>
                        <dd className="flexBox">
                            <Check size="xs" state="" type="radio"></Check>
                            <Check size="xs" state="imp" type="radio"></Check>
                            <Check size="xs" state="er" type="radio"></Check>
                            <Check size="xs" state="su" type="radio"></Check>
                            <Check size="xs" state="" type="radio" disabled></Check>
                        </dd>
                    </dl>
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Check size="xl" state="" type="radio"></Check>
<Check size="l" state="" type="radio"></Check>
<Check size="m" state="" type="radio"></Check>
<Check size="s" state="" type="radio"></Check>
<Check size="xs" state="" type="radio"></Check>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

            {/* <!-- 스타일 --> */}
            <div className="sg_area">
                <p>스타일</p>
                <div className="sg_box">
                    <dl>
                        <dt>Default</dt>
                        <dd className="flexBox">
                            <Check size="xl" state="" type="radio">Default</Check>
                            <Check size="xl" state="" type="radio" set="hover">Hover</Check>
                            <Check size="xl" state="" type="radio" checked>Focus</Check>
                            <Check size="xl" state="" type="radio" checked set="hover">Focus Hover</Check>
                            <Check size="xl" state="" type="radio" disabled>Disabled</Check>
                            <Check size="xl" state="" type="radio" disabled checked>Disabled Check</Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Important</dt>
                        <dd className="flexBox">
                            <Check size="xl" state="imp" type="radio">Default</Check>
                            <Check size="xl" state="imp" type="radio" set="hover">Hover</Check>
                            <Check size="xl" state="imp" type="radio" checked>Focus</Check>
                            <Check size="xl" state="imp" type="radio" checked set="hover">Focus Hover</Check>
                            <Check size="xl" state="imp" type="radio" disabled>Disabled</Check>
                            <Check size="xl" state="imp" type="radio" disabled checked>Disabled Check</Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd className="flexBox">
                            <Check size="xl" state="er" type="radio">Default</Check>
                            <Check size="xl" state="er" type="radio" set="hover">Hover</Check>
                            <Check size="xl" state="er" type="radio" checked>Focus</Check>
                            <Check size="xl" state="er" type="radio" checked set="hover">Focus Hover</Check>
                            <Check size="xl" state="er" type="radio" disabled>Disabled</Check>
                            <Check size="xl" state="er" type="radio" disabled checked>Disabled Check</Check>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd className="flexBox">
                            <Check size="xl" state="su" type="radio">Default</Check>
                            <Check size="xl" state="su" type="radio" set="hover">Hover</Check>
                            <Check size="xl" state="su" type="radio" checked>Focus</Check>
                            <Check size="xl" state="su" type="radio" checked set="hover">Focus Hover</Check>
                            <Check size="xl" state="su" type="radio" disabled>Disabled</Check>
                            <Check size="xl" state="su" type="radio" disabled checked>Disabled Check</Check>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Check size="xl" state="" type="radio">Default</Check>
<Check size="xl" state="imp" type="radio">Default</Check>
<Check size="xl" state="er" type="radio">Default</Check>
<Check size="xl" state="su" type="radio">Default</Check>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* <!-- 토글 --> */}
        <div className="sg_inner" ref={(el) => (secRefs.current.switch = el)}>
            <div className="sg_tit">
                <h1>Switch</h1>
                <p>토글 스위치 컴포넌트</p>
            </div>

            {/* <!-- 사이즈 --> */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>XL</dt>
                        <dd className="flexBox">
                            <Toggle size="xl" type="a"></Toggle>
                            <Toggle size="xl" type="b"></Toggle>
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd className="flexBox">
                            <Toggle size="l" type="a"></Toggle>
                            <Toggle size="l" type="b"></Toggle>
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd className="flexBox">
                            <Toggle size="m" type="a"></Toggle>
                            <Toggle size="m" type="b"></Toggle>
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd className="flexBox">
                            <Toggle size="s" type="a"></Toggle>
                            <Toggle size="s" type="b"></Toggle>
                        </dd>
                    </dl>
                    <dl>
                        <dt>XS</dt>
                        <dd className="flexBox">
                            <Toggle size="xs" type="a"></Toggle>
                            <Toggle size="xs" type="b"></Toggle>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Toggle size="xl" type="a"></Toggle>
<Toggle size="l" type="a"></Toggle>
<Toggle size="m" type="a"></Toggle>
<Toggle size="s" type="a"></Toggle>
<Toggle size="xs" type="a"></Toggle>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

            {/* <!-- 사이즈 --> */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>A TYPE - 텍스트형</dt>
                        <dd className="flexBox">
                            <Toggle size="xl" type="a"></Toggle>
                            <Toggle size="xl" type="a" checked></Toggle>
                        </dd>
                    </dl>
                    <dl>
                        <dt>B TYPE - 기본형</dt>
                        <dd className="flexBox">
                            <Toggle size="xl" type="b"></Toggle>
                            <Toggle size="xl" type="b" checked></Toggle>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Toggle size="xl" type="a"></Toggle>
<Toggle size="xl" type="b"></Toggle>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* <!-- 슬라이더 --> */}
        <div className="sg_inner" ref={(el) => (secRefs.current.range = el)}>
            <div className="sg_tit">
                <h1>Range</h1>
                <p>수치를 조절하는 범위 막대 바 </p>
            </div>

            {/* <!-- 사이즈 --> */}
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>XL</dt>
                        <dd>
                            <Range size="xl"></Range>
                        </dd>
                    </dl>
                    <dl>
                        <dt>L</dt>
                        <dd>
                            <Range size="l"></Range>  
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd>
                            <Range size="m"></Range> 
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd>
                            <Range size="s"></Range> 
                        </dd>
                    </dl>
                    <dl>
                        <dt>XS</dt>
                        <dd>
                            <Range size="xs"></Range> 
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Range size="xl"></Range>
<Range size="l"></Range>
<Range size="m"></Range>
<Range size="s"></Range>
<Range size="xs"></Range>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

            {/* <!-- 스타일 --> */}
            <div className="sg_area">
                <p>스타일</p>
                <div className="sg_box">
                    <dl>
                        <dt>Default</dt>
                        <dd>
                            <Range size="xl"></Range> 
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd>
                            <Range size="xl" set="er"></Range>  
                        </dd>
                    </dl>
                    <dl>
                        <dt>Caution</dt>
                        <dd>
                            <Range size="xl" set="ca"></Range>   
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd>
                            <Range size="xl" set="su"></Range>   
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
                        <xmp>
{`<Range size="xl"></Range>
<Range size="xl" set="er"></Range>
<Range size="xl" set="ca"></Range>
<Range size="xl" set="su"></Range>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

            
        </div>

        {/* <!-- 캡션 --> */}
        <div className="sg_inner" ref={(el) => (secRefs.current.caption = el)}>
            <div className="sg_tit">
                <h1>Caption</h1>
                <p>다양한 스타일의 캡션 컴포넌트</p>
            </div>
            <div className="sg_area">
                <p>사이즈</p>
                <div className="sg_box">
                    <dl>
                        <dt>L</dt>
                        <dd>
                            <div className="flexBox">
                                <Cau size="l" state="">텍스트</Cau>
                                <Cau size="l" state="imp">텍스트</Cau>
                                <Cau size="l" state="po">텍스트</Cau>
                                <Cau size="l" state="de">텍스트</Cau>
                                <Cau size="l" state="ca">텍스트</Cau>
                                <Cau size="l" state="su">텍스트</Cau>
                                <Cau size="l" state="er">텍스트</Cau>
                                <Cau size="l" state="if">텍스트</Cau>
                            </div>
                        </dd>
                    </dl>
                    <dl>
                        <dt>M</dt>
                        <dd>
                            <div className="flexBox">
                                <Cau size="m" state="">텍스트</Cau>
                                <Cau size="m" state="imp">텍스트</Cau>
                                <Cau size="m" state="po">텍스트</Cau>
                                <Cau size="m" state="de">텍스트</Cau>
                                <Cau size="m" state="ca">텍스트</Cau>
                                <Cau size="m" state="su">텍스트</Cau>
                                <Cau size="m" state="er">텍스트</Cau>
                                <Cau size="m" state="if">텍스트</Cau>
                            </div>
                        </dd>
                    </dl>
                    <dl>
                        <dt>S</dt>
                        <dd>
                            <div className="flexBox">
                                <Cau size="s" state="">텍스트</Cau>
                                <Cau size="s" state="imp">텍스트</Cau>
                                <Cau size="s" state="po">텍스트</Cau>
                                <Cau size="s" state="de">텍스트</Cau>
                                <Cau size="s" state="ca">텍스트</Cau>
                                <Cau size="s" state="su">텍스트</Cau>
                                <Cau size="s" state="er">텍스트</Cau>
                                <Cau size="s" state="if">텍스트</Cau>
                            </div>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
    <xmp>
{`<Cau size="l">텍스트</Cau>
<Cau size="m">텍스트</Cau>
<Cau size="s">텍스트</Cau>
`}
    </xmp>
                        </div>
                    </div>
                </div>
            </div>
            {/* <!-- 버튼스타일 --> */}
            <div className="sg_area">
                <p>스타일</p>
                <div className="sg_box">
                    <dl>
                        <dt>Normal</dt>
                        <dd>
                            <div className="flexBox">
                                <Cau size="l" state="">텍스트</Cau>
                                <Cau size="m" state="">텍스트</Cau>
                                <Cau size="s" state="">텍스트</Cau>
                            </div>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Important</dt>
                        <dd>
                            <div className="flexBox">
                                <Cau size="l" state="imp">텍스트</Cau>
                                <Cau size="m" state="imp">텍스트</Cau>
                                <Cau size="s" state="imp">텍스트</Cau>
                            </div>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Positive</dt>
                        <dd>
                            <div className="flexBox">
                                <Cau size="l" state="po">텍스트</Cau>
                                <Cau size="m" state="po">텍스트</Cau>
                                <Cau size="s" state="po">텍스트</Cau>
                            </div>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Danger</dt>
                        <dd>
                            <div className="flexBox">
                                <Cau size="l" state="de">텍스트</Cau>
                                <Cau size="m" state="de">텍스트</Cau>
                                <Cau size="s" state="de">텍스트</Cau>
                            </div>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Success</dt>
                        <dd>
                            <div className="flexBox">
                                <Cau size="l" state="su">텍스트</Cau>
                                <Cau size="m" state="su">텍스트</Cau>
                                <Cau size="s" state="su">텍스트</Cau>
                            </div>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Caution</dt>
                        <dd>
                            <div className="flexBox">
                                <Cau size="l" state="ca">텍스트</Cau>
                                <Cau size="m" state="ca">텍스트</Cau>
                                <Cau size="s" state="ca">텍스트</Cau>
                            </div>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Error</dt>
                        <dd>
                            <div className="flexBox">
                                <Cau size="l" state="er">텍스트</Cau>
                                <Cau size="m" state="er">텍스트</Cau>
                                <Cau size="s" state="er">텍스트</Cau>
                            </div>
                        </dd>
                    </dl>
                    <dl>
                        <dt>Information</dt>
                        <dd>
                            <div className="flexBox">
                                <Cau size="l" state="if">텍스트</Cau>
                                <Cau size="m" state="if">텍스트</Cau>
                                <Cau size="s" state="if">텍스트</Cau>
                            </div>
                        </dd>
                    </dl>
                    
                    <div className="source">
                        <em>HTML</em>
                        <div>
    <xmp>
{`<Cau size="l" state="">텍스트</Cau>
<Cau size="l" state="imp">텍스트</Cau>
<Cau size="l" state="po">텍스트</Cau>
<Cau size="l" state="de">텍스트</Cau>
<Cau size="l" state="su">텍스트</Cau>
<Cau size="l" state="ca">텍스트</Cau>
<Cau size="l" state="er">텍스트</Cau>
<Cau size="l" state="if">텍스트</Cau>
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

export default SgTypo
