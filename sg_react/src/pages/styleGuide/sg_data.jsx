import React, {useRef, useState, useEffect} from "react";
import { Button, Input, Textarea, Select, Check, Toggle, Range, Cau } from "@/component/form";
import { Table } from "@/component/data";
function SgData() {
    const sections = [
        { id: "table", label: "Table" },
        { id: "list", label: "List" },
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
        <div className="sg_inner" ref={(el) => (secRefs.current.table = el)}>
            <div className="sg_tit">
                <h1>Table</h1>
                <p>여러 스타일의 테이블 컴포넌트</p>
            </div>
            {/* <!-- 폼 --> */}
            <div className="sg_area">
                <p>Form</p>
                <div className="sg_box">
                    <Table set="form">
                        <tbody>
                            <tr>
                                <th className="imp">아이디</th>
                                <td>
                                    <div className="flexBox">
                                        <Input type="text" placeholder="아이디를 입력하세요"></Input>
                                        <Button type="button" set="ne" iconL="ico-search">중복확인</Button>
                                    </div>
                                </td>
                                <th className="imp">비밀번호</th>
                                <td>
                                    <div className="flexBox">
                                        <Input type="password" placeholder="비밀번호를 입력하세요"></Input>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <th className="imp">핸드폰번호</th>
                                <td>
                                    <div className="flexBox">
                                        <Select>
                                            <option value="">010</option>
                                            <option value="">011</option>
                                        </Select>
                                        <Input type="text" placeholder="0000"></Input>
                                        <Input type="text" placeholder="0000"></Input>
                                    </div>
                                </td>
                                <th className="imp">이메일</th>
                                <td>
                                    <div className="flexBox">
                                        <Input type="text" placeholder=""></Input>
                                        <span>@</span>
                                        <Input type="text" placeholder=""></Input>
                                        <Select>
                                            <option value="">naver.com</option>
                                        </Select>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <th className="imp">이름</th>
                                <td><Input type="text" placeholder=""></Input></td>
                                <th className="imp">성별</th>
                                <td>
                                    <div className="flexBox">
                                        <Check type="radio" name="genders" id="gd-female">여자</Check>
                                        <Check type="radio" name="genders" id="gd-male">남자</Check>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <th className="imp">관심사</th>
                                <td colSpan={3}>
                                    <div className="flexBox">
                                        <Check type="checkbox">독서</Check>
                                        <Check type="checkbox">영화</Check>
                                        <Check type="checkbox">음악</Check>
                                        <Check type="checkbox">댄스</Check>
                                        <Check type="checkbox">게임</Check>
                                        <Check type="checkbox">음주</Check>
                                        <Check type="checkbox">운동</Check>
                                        <Check type="checkbox">여행</Check>
                                        <Check type="checkbox">쇼핑</Check>
                                        <Check type="checkbox">기타</Check>
                                    </div>
                                    <Cau size="m">중복선택가능</Cau>
                                </td>
                            </tr>
                        </tbody>
                    </Table>
                    
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Table set="form">
    <tbody>
        <tr>
            <th className="imp">아이디</th>
            <td>
                <div className="flexBox">
                    <Input type="text" placeholder="아이디를 입력하세요"></Input>
                    <Button type="button" set="ne" iconL="ico-search">중복확인</Button>
                </div>
            </td>
            <th className="imp">비밀번호</th>
            <td>
                <div className="flexBox">
                    <Input type="password" placeholder="비밀번호를 입력하세요"></Input>
                </div>
            </td>
        </tr>
    </tbody>
</Table>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

            {/* 그리드 */}
            <div className="sg_area">
                <p>Grid</p>
                <div className="sg_box">
                    <Table set="grid">
                        <colgroup>
                            <col width="8%" />
                            <col width="*" />
                            <col width="14%" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>분류</th>
                                <th>제목</th>
                                <th>비고</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <th>공통</th>
                                <td>그리드 형식의 테이블 표 형식에 사용합니다</td>
                                <td>-</td>
                            </tr>
                        </tbody>
                    </Table>
                    
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Table set="grid">
    <colgroup>
        <col width="8%" />
        <col width="*" />
        <col width="14%" />
    </colgroup>
    <thead>
        <tr>
            <th>분류</th>
            <th>제목</th>
            <th>비고</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <th>공통</th>
            <td>그리드 형식의 테이블 표 형식에 사용합니다</td>
            <td>-</td>
        </tr>
    </tbody>
</Table>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

            {/* 미니멀 */}
            <div className="sg_area">
                <p>Minimal</p>
                <div className="sg_box">
                    <Table set="min">
                        <colgroup>
                            <col width="8%"/>
                            <col width="*"/>
                            <col width="14%"/>
                            <col width="14%"/>
                        </colgroup>
                        <thead>
                            <tr>
                                <th>NO</th>
                                <th>아이피</th>
                                <th>접속자</th>
                                <th>접속일시</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>1</td>
                                <td><a href="#" class="reduce">192.412.132.12</a></td>
                                <td>홍길동</td>
                                <td>2026.05.07</td>
                            </tr>
                            <tr>
                                <td>2</td>
                                <td><a href="#" class="reduce">192.412.132.12</a></td>
                                <td>홍길동</td>
                                <td>2026.05.07</td>
                            </tr>
                            <tr>
                                <td>3</td>
                                <td><a href="#" class="reduce">192.412.132.12</a></td>
                                <td>홍길동</td>
                                <td>2026.05.07</td>
                            </tr>
                            <tr>
                                <td>4</td>
                                <td><a href="#" class="reduce">192.412.132.12</a></td>
                                <td>홍길동</td>
                                <td>2026.05.07</td>
                            </tr>
                            <tr>
                                <td>5</td>
                                <td><a href="#" class="reduce">192.412.132.12</a></td>
                                <td>홍길동</td>
                                <td>2026.05.07</td>
                            </tr>
                            <tr>
                                <td>6</td>
                                <td><a href="#" class="reduce">192.412.132.12</a></td>
                                <td>홍길동</td>
                                <td>2026.05.07</td>
                            </tr>
                        </tbody>
                    </Table>
                    
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Table set="grid">
    <colgroup>
        <col width="8%" />
        <col width="*" />
        <col width="14%" />
    </colgroup>
    <thead>
        <tr>
            <th>분류</th>
            <th>제목</th>
            <th>비고</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <th>공통</th>
            <td>그리드 형식의 테이블 표 형식에 사용합니다</td>
            <td>-</td>
        </tr>
    </tbody>
</Table>
`}
                        </xmp>
                        </div>
                    </div>
                </div>
            </div>

            {/* 데이터 */}
            <div className="sg_area">
                <p>Data</p>
                <div className="sg_box">
                    <Table set="data">
                        <colgroup>
                            <col width="2%" />
                            <col width="*" />
                            <col width="15%" />
                            <col width="15%" />
                            <col width="15%" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th><Check size="s"></Check></th>
                                <th class="ta-left">종목</th>
                                <th class="ta-right">금액</th>
                                <th class="ta-right">대금</th>
                                <th>참여일</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><Check size="s"></Check></td>
                                <td class="ta-left"><a href="#" class="reduce">이러닝 교육 사업</a></td>
                                <td class="ta-right">50,323원</td>
                                <td class="ta-right">50,323원</td>
                                <td>
                                    <div class="data-week">
                                        <p class="on">월</p>
                                        <p>화</p>
                                        <p>수</p>
                                        <p class="on">목</p>
                                        <p>금</p>
                                        <p class="on">토</p>
                                        <p>일</p>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </Table>
                    
                    <div className="source">
                        <em>JSX</em>
                        <div>
                        <xmp>
{`<Table set="grid">
    <colgroup>
        <col width="8%" />
        <col width="*" />
        <col width="14%" />
    </colgroup>
    <thead>
        <tr>
            <th>분류</th>
            <th>제목</th>
            <th>비고</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <th>공통</th>
            <td>그리드 형식의 테이블 표 형식에 사용합니다</td>
            <td>-</td>
        </tr>
    </tbody>
</Table>
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

export default SgData
